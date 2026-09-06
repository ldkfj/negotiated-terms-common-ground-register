import { createClient } from "genlayer-js";
import type { Address, CaseRecord, Eip1193Provider, TxPhase } from "./types";
import { removeUnsigned, reserve, updateJournal, type JournalRecord } from "./pending";

const CONTRACT = (import.meta.env.VITE_CONTRACT_ADDRESS as Address | undefined)?.toLowerCase() as Address | undefined;
const RPC = import.meta.env.VITE_GENLAYER_RPC_URL as string | undefined;
const CHAIN = import.meta.env.VITE_CHAIN_ID as string | undefined;

export const deploymentConfigured = Boolean(CONTRACT && /^0x[0-9a-f]{40}$/.test(CONTRACT) && RPC && CHAIN);
const readClient = RPC ? createClient({ endpoint: RPC }) : null;
const inFlight = new Map<string, Promise<unknown>>();

function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid contract payload");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) throw new Error("Unexpected contract payload fields");
  return row;
}
export function parseCase(raw: unknown): CaseRecord | null {
  if (raw === "null") return null;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const keys = ["v","id","primary","secondary","phase","revision","parent","create_hash","base","response","base_locked","response_locked","accepted_attempts","last_accepted_at","outcome","result","domain","last_operation"];
  const row = exactObject(value, keys);
  for (const field of ["id", "revision", "parent", "last_accepted_at"]) if (!/^(0|[1-9][0-9]*)$/.test(String(row[field]))) throw new Error(`Invalid ${field}`);
  BigInt(String(row.id)); BigInt(String(row.revision)); BigInt(String(row.parent)); BigInt(String(row.last_accepted_at));
  if (!/^0x[0-9a-f]{40}$/.test(String(row.primary)) || !/^0x[0-9a-f]{40}$/.test(String(row.secondary))) throw new Error("Invalid role address");
  return row as unknown as CaseRecord;
}
async function dedup<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = inFlight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const promise = work().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
export async function getCase(id: string): Promise<CaseRecord | null> {
  if (!readClient || !CONTRACT) throw new Error("Deployment is not configured yet.");
  return dedup(`case:${id}`, async () => parseCase(await readClient.readContract({ address: CONTRACT, functionName: "get_case", args: [BigInt(id)], jsonSafeReturn: true })));
}
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function executionName(transaction: unknown): string {
  if (!transaction || typeof transaction !== "object") return "";
  const row = transaction as Record<string, unknown>;
  return String(row.txExecutionResultName ?? row.executionResult ?? row.execution_result ?? "").toUpperCase();
}
function statusName(transaction: unknown): string {
  if (!transaction || typeof transaction !== "object") return "";
  const row = transaction as Record<string, unknown>;
  return String(row.statusName ?? row.status ?? "").toUpperCase();
}
export interface WriteProgress { phase: TxPhase; hash?: string; message: string }
export async function writeAndVerify(input: {
  provider: Eip1193Provider; account: Address; method: string; args: unknown[];
  intent: string; preRevision: string; expected(record: CaseRecord): boolean;
  onProgress(progress: WriteProgress): void;
}): Promise<JournalRecord> {
  if (!CONTRACT || !RPC || !CHAIN) throw new Error("Deployment is not configured yet.");
  const argsJson = canonical(input.args);
  const journal = await reserve({ chain: BigInt(CHAIN).toString(), contract: CONTRACT, account: input.account, method: input.method, intent: input.intent, args_json: argsJson, pre_revision: input.preRevision, pre_hash: await sha256(argsJson) });
  input.onProgress({ phase: "WAITING_FOR_WALLET", message: "Confirm this transaction in your selected wallet." });
  let hash = "";
  try {
    const client = createClient({ endpoint: RPC, account: input.account, provider: input.provider as Parameters<typeof createClient>[0] extends { provider?: infer P } ? P : never });
    hash = String(await client.writeContract({ address: CONTRACT, functionName: input.method, args: input.args as never[], value: 0n }));
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet returned no valid transaction hash");
    await updateJournal(journal.reservation, { status: "SUBMITTED", tx_hash: hash.toLowerCase() });
    input.onProgress({ phase: "SUBMITTED", hash, message: "Transaction submitted." });
    let transaction: unknown = null;
    for (const delay of [2000, 4000, 8000]) {
      input.onProgress({ phase: "WAITING_FOR_FINALITY", hash, message: "Waiting for GenLayer consensus and finality." });
      await sleep(delay);
      transaction = await client.getTransaction({ hash: hash as never });
      if (statusName(transaction).includes("FINALIZED")) break;
    }
    if (!statusName(transaction).includes("FINALIZED")) {
      await updateJournal(journal.reservation, { status: "RECONCILE" });
      input.onProgress({ phase: "RECONCILIATION_REQUIRED", hash, message: "Finality is not yet conclusive. The original hash is preserved." });
      return { ...journal, status: "RECONCILE", tx_hash: hash };
    }
    input.onProgress({ phase: "VERIFYING_EXECUTION", hash, message: "Finalized; verifying semantic execution." });
    if (!executionName(transaction).includes("FINISHED_WITH_RETURN")) {
      await updateJournal(journal.reservation, { status: "FINALIZED_ERROR" });
      input.onProgress({ phase: "FAILED", hash, message: "The transaction finalized without successful contract execution." });
      return { ...journal, status: "FINALIZED_ERROR", tx_hash: hash };
    }
    input.onProgress({ phase: "VERIFYING_READBACK", hash, message: "Execution succeeded; verifying the exact historical state." });
    let verified = false;
    const id = input.intent.split(":")[1];
    for (const delay of [0, 4000]) {
      if (delay) await sleep(delay);
      const result = await readClient?.readContract({ address: CONTRACT, functionName: "get_version", args: [BigInt(id), BigInt(input.preRevision) + 1n], jsonSafeReturn: true });
      const record = parseCase(result);
      if (record && input.expected(record) && record.last_operation.method === input.method && record.last_operation.caller === input.account) { verified = true; break; }
    }
    await updateJournal(journal.reservation, { status: verified ? "VERIFIED" : "RECONCILE" });
    input.onProgress({ phase: verified ? "SUCCESS" : "RECONCILIATION_REQUIRED", hash, message: verified ? "Verified against the immutable contract history." : "Readback did not yet match. The original hash is preserved." });
    return { ...journal, status: verified ? "VERIFIED" : "RECONCILE", tx_hash: hash };
  } catch (error) {
    if (!hash) await removeUnsigned(journal.reservation);
    else await updateJournal(journal.reservation, { status: "RECONCILE", tx_hash: hash });
    const rejected = (error as { code?: number }).code === 4001;
    input.onProgress({ phase: rejected ? "REJECTED" : hash ? "RECONCILIATION_REQUIRED" : "FAILED", hash: hash || undefined, message: rejected ? "Transaction rejected in the wallet." : String((error as Error).message ?? error) });
    throw error;
  }
}
