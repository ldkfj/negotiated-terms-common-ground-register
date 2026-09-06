import type { Address, TxPhase } from "./types";

export type JournalStatus = "SIGNING" | "SUBMITTED" | "RECONCILE" | "FINALIZED_ERROR" | "VERIFIED";
export interface JournalRecord {
  v: 1; reservation: string; chain: string; contract: Address; account: Address;
  method: string; intent: string; args_json: string; pre_revision: string;
  pre_hash: string; tx_hash: string; status: JournalStatus; created_ms: string;
}
const INDEX = "glj1:index";
const LOCK = "genlayer-journal-v1";
const key = (reservation: string) => `glj1:${reservation}`;
const address = /^0x[0-9a-f]{40}$/;
const hex32 = /^[0-9a-f]{32}$/;
const hex64 = /^[0-9a-f]{64}$/;

function validate(value: unknown): JournalRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid journal record");
  const row = value as JournalRecord;
  const keys = ["v","reservation","chain","contract","account","method","intent","args_json","pre_revision","pre_hash","tx_hash","status","created_ms"];
  if (Object.keys(row).sort().join() !== keys.sort().join() || row.v !== 1 || !hex32.test(row.reservation)
    || !address.test(row.contract) || !address.test(row.account) || !hex64.test(row.pre_hash)
    || !/^(0|[1-9][0-9]*)$/.test(row.chain) || !/^(0|[1-9][0-9]*)$/.test(row.pre_revision)
    || !/^(0|[1-9][0-9]*)$/.test(row.created_ms) || row.method.length > 48 || row.intent.length > 160
    || row.args_json.length > 18000 || (row.tx_hash && !/^0x[0-9a-f]{64}$/.test(row.tx_hash))
    || !["SIGNING","SUBMITTED","RECONCILE","FINALIZED_ERROR","VERIFIED"].includes(row.status)) throw new Error("Invalid journal record");
  return row;
}
function loadUnlocked(): JournalRecord[] {
  const rows: JournalRecord[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const itemKey = localStorage.key(index);
    if (itemKey?.startsWith("glj1:") && itemKey !== INDEX) rows.push(validate(JSON.parse(localStorage.getItem(itemKey) ?? "null")));
  }
  rows.sort((a, b) => BigInt(a.created_ms) < BigInt(b.created_ms) ? -1 : 1);
  localStorage.setItem(INDEX, JSON.stringify(rows.map((row) => key(row.reservation))));
  return rows;
}
function lock<T>(work: () => T | Promise<T>): Promise<T> {
  if (!window.isSecureContext || !navigator.locks) return Promise.reject(new Error("Journal lock unavailable"));
  return navigator.locks.request(LOCK, { mode: "exclusive" }, work);
}
export function probeJournal(): void {
  const probe = `glj1:probe:${crypto.randomUUID()}`;
  localStorage.setItem(probe, "1");
  if (localStorage.getItem(probe) !== "1") throw new Error("Journal storage unavailable");
  localStorage.removeItem(probe);
}
export const loadJournal = () => lock(loadUnlocked);
export async function reserve(input: Omit<JournalRecord, "v" | "reservation" | "tx_hash" | "status" | "created_ms">): Promise<JournalRecord> {
  return lock(() => {
    probeJournal();
    const rows = loadUnlocked();
    if (rows.length >= 32) throw new Error("JOURNAL_CAPACITY");
    const caseId = input.intent.split(":")[1] ?? "";
    if (rows.some((row) => !["VERIFIED", "FINALIZED_ERROR"].includes(row.status)
      && row.chain === input.chain && row.contract === input.contract
      && (caseId ? row.intent.split(":")[1] === caseId : row.intent === input.intent))) throw new Error("Pending operation conflict");
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const reservation = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const row: JournalRecord = { ...input, v: 1, reservation, tx_hash: "", status: "SIGNING", created_ms: String(Date.now()) };
    localStorage.setItem(key(reservation), JSON.stringify(row));
    loadUnlocked();
    return row;
  });
}
export async function updateJournal(reservation: string, patch: Pick<JournalRecord, "status"> & { tx_hash?: string }): Promise<JournalRecord> {
  return lock(() => {
    const current = validate(JSON.parse(localStorage.getItem(key(reservation)) ?? "null"));
    if (current.tx_hash && patch.tx_hash && current.tx_hash !== patch.tx_hash) throw new Error("Transaction hash is immutable");
    const next = validate({ ...current, ...patch, tx_hash: current.tx_hash || patch.tx_hash || "" });
    localStorage.setItem(key(reservation), JSON.stringify(next));
    loadUnlocked();
    return next;
  });
}
export async function removeUnsigned(reservation: string): Promise<void> {
  await lock(() => {
    const current = validate(JSON.parse(localStorage.getItem(key(reservation)) ?? "null"));
    if (current.tx_hash) throw new Error("Submitted operation cannot be removed");
    localStorage.removeItem(key(reservation));
    loadUnlocked();
  });
}
export const phaseFor = (status: JournalStatus): TxPhase => ({ SIGNING: "WAITING_FOR_WALLET", SUBMITTED: "WAITING_FOR_FINALITY", RECONCILE: "RECONCILIATION_REQUIRED", FINALIZED_ERROR: "FAILED", VERIFIED: "SUCCESS" })[status] as TxPhase;
