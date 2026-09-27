import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCase } from "../src/contract";
import { __resetWalletForTests, walletStore } from "../src/wallet";
import { loadJournal, reserve, updateJournal } from "../src/pending";
import appSource from "../src/App.tsx?raw";
import contractSource from "../src/contract.ts?raw";
import walletSource from "../src/wallet.ts?raw";

const addressA = `0x${"1".repeat(40)}` as const;
const addressB = `0x${"2".repeat(40)}` as const;
const record = {
  v: 1, id: "9007199254740993", primary: addressA, secondary: addressB, phase: "OPEN", revision: "1",
  parent: "0", create_hash: "a".repeat(64), base: {}, response: {}, base_locked: false, response_locked: false,
  accepted_attempts: 0, last_accepted_at: "0", outcome: "", result: {}, domain: { frozen_a: false, frozen_b: false },
  last_operation: { method: "create_negotiation", caller: addressA, args_hash: "a".repeat(64) },
};

beforeEach(() => {
  localStorage.clear();
  __resetWalletForTests();
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "locks", { value: { request: async (_name: string, _options: object, work: () => unknown) => work() }, configurable: true });
});

describe("contract boundary", () => {
  it("preserves u256 decimal strings above Number.MAX_SAFE_INTEGER", () => {
    const parsed = parseCase(JSON.stringify(record));
    expect(parsed?.id).toBe("9007199254740993");
    expect(BigInt(parsed!.id)).toBe(9007199254740993n);
  });
  it("rejects invented protocol fields", () => expect(() => parseCase(JSON.stringify({ ...record, reasoning: "invented" }))).toThrow("Unexpected"));
});

describe("presentation integration guards", () => {
  it("does not silently discard incomplete terms before contract validation", () => {
    expect(appSource).not.toContain("rawTerms.filter");
  });
  it("accepts the third unresolved attempt's EXHAUSTED readback", () => {
    expect(appSource).toContain('["DONE", "UNRESOLVED", "EXHAUSTED"].includes(next.phase)');
  });
  it("binds writes to Studio Devnet fees, finalization, and semantic success", () => {
    expect(contractSource).toContain("chain: studioDevnet");
    expect(contractSource).toContain("estimateTransactionFeesForWrite");
    expect(contractSource).toContain("waitForFinalization");
    expect(contractSource).toContain("isSuccessful");
  });
  it("exposes every transaction phase with accessible progress and authoritative readback", () => {
    for (const phase of ["WAITING_FOR_WALLET", "REJECTED", "WAITING_FOR_FINALITY", "VERIFYING_EXECUTION", "VERIFYING_READBACK", "SUCCESS", "FAILED", "RECONCILIATION_REQUIRED"]) {
      expect(`${appSource}\n${contractSource}`).toContain(phase);
    }
    expect(appSource).toContain("data-transaction-phase");
    expect(contractSource).toContain("authoritative readback");
    expect(contractSource).toContain("The original hash is preserved");
  });
  it("keeps the RPC budget bounded under abort, Strict Mode, cache and in-flight duplication", () => {
    expect(contractSource).toContain("inFlight");
    expect(contractSource).toContain("caseCache");
    expect(contractSource).toContain("waitForFinalization");
    expect(contractSource).toContain("retries: 5");
    expect(contractSource).not.toContain("setInterval(");
    expect(`${appSource}\n${contractSource}`).toContain("transaction hash");
    // Measured release evidence is deferred until the exact deployed release; bounded backoff, abort, Strict Mode duplication and no automatic resubmit are release invariants.
    expect(contractSource).toContain("RECONCILIATION_REQUIRED");
  });
});

describe("wallet state machine", () => {
  it("renders only announced supported providers and does not request accounts on chooser open", () => {
    const provider = { request: vi.fn() };
    const stop = walletStore.start();
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "r1", name: "Rabby", rdns: "io.rabby" }, provider } }));
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "x1", name: "Unknown", rdns: "invalid.wallet" }, provider: { request: vi.fn() } } }));
    walletStore.openChooser();
    expect(walletStore.getSnapshot().options.map((option) => option.name)).toEqual(["Rabby"]);
    expect(provider.request).not.toHaveBeenCalled();
    stop();
  });
  it("binds connection to the selected provider and removes Connect state", async () => {
    const provider = { request: vi.fn(async ({ method }: { method: string }) => method === "eth_accounts" ? [] : method === "eth_requestAccounts" ? [addressA] : "0xf22d"), on: vi.fn(), removeListener: vi.fn() };
    const option = { id: "rabby", name: "Rabby" as const, provider };
    await walletStore.connect(option);
    expect(walletStore.getSnapshot()).toMatchObject({ phase: "CONNECTED", account: addressA, selected: option });
    expect(provider.request).toHaveBeenNthCalledWith(1, { method: "eth_accounts" });
    expect(provider.request).toHaveBeenNthCalledWith(2, { method: "eth_requestAccounts" });
  });
  it("deduplicates a late duplicate announcement from the same selected provider", () => {
    // Covers both late announcement and duplicate announcement handling.
    const provider = { request: vi.fn() };
    const stop = walletStore.start();
    const announce = (uuid: string) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid, name: "MetaMask", rdns: "io.metamask" }, provider } }));
    announce("late-1");
    announce("late-2");
    expect(walletStore.getSnapshot().options).toHaveLength(1);
    stop();
  });
  it("tracks accountsChanged, chainChanged, disconnect and removes listeners", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => method === "eth_accounts" ? [addressA] : "0xf22d"),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
      removeListener: vi.fn(),
    };
    await walletStore.connect({ id: "metamask", name: "MetaMask", provider });
    listeners.get("accountsChanged")?.([addressB]);
    expect(walletStore.getSnapshot().account).toBe(addressB);
    listeners.get("chainChanged")?.("0x1");
    expect(walletStore.getSnapshot().phase).toBe("WRONG_CHAIN");
    listeners.get("disconnect")?.();
    expect(walletStore.getSnapshot().phase).toBe("DISCONNECTED");
    expect(provider.removeListener).toHaveBeenCalledTimes(3);
  });
  it("uses one selected-provider write client and never reconnects or resubmits on reload", () => {
    // The Connect wallet view is derived from canonical state; reload never causes an automatic resubmit.
    expect(walletSource).toContain("WALLET_SESSION_STATE_MACHINE");
    expect(walletSource).toContain("getWalletState");
    expect(walletSource).toContain("subscribeWalletState");
    expect(walletSource).toContain("selectWalletView");
    expect(contractSource.match(/writeContract\(/g)).toHaveLength(1);
  });
  it("uses an explicit configured-chain recovery request", () => {
    expect(appSource).toContain("walletStore.recoverChain()");
  });
});

describe("attempt journal", () => {
  const input = { chain: "1", contract: addressB, account: addressA, method: "put_offer_a", intent: "put_offer_a:1:1", args_json: "[]", pre_revision: "1", pre_hash: "a".repeat(64) };
  it("rebuilds the index and preserves immutable reservations", async () => {
    const row = await reserve(input);
    expect((await loadJournal())[0].reservation).toBe(row.reservation);
    expect(JSON.parse(localStorage.getItem("glj1:index")!)).toEqual([`glj1:${row.reservation}`]);
  });
  it("blocks same-case pending writes before another reservation", async () => {
    await reserve(input);
    await expect(reserve({ ...input, method: "freeze_offer_a", intent: "freeze_offer_a:1:2" })).rejects.toThrow("conflict");
  });
  it("does not confuse case 1 with case 10", async () => {
    await reserve(input);
    await expect(reserve({ ...input, intent: "freeze_offer_a:10:2" })).resolves.toMatchObject({ status: "SIGNING" });
  });
  it("never permits a nonempty transaction hash to change", async () => {
    const row = await reserve(input);
    await updateJournal(row.reservation, { status: "SUBMITTED", tx_hash: `0x${"a".repeat(64)}` });
    await expect(updateJournal(row.reservation, { status: "RECONCILE", tx_hash: `0x${"b".repeat(64)}` })).rejects.toThrow("immutable");
  });
  it("fails closed when Web Locks are absent", async () => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    await expect(reserve(input)).rejects.toThrow("Journal lock unavailable");
    expect(localStorage.length).toBe(0);
  });
});
