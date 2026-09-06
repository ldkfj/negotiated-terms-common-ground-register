import { useSyncExternalStore } from "react";
import type { Address, Eip1193Provider } from "./types";

export type WalletName = "MetaMask" | "OKX Wallet" | "Rabby";
export type WalletPhase = "DISCONNECTED" | "DISCOVERING" | "CHOOSER_OPEN" | "CONNECTING" | "CONNECTED" | "WRONG_CHAIN" | "ERROR";
export interface WalletOption { id: string; name: WalletName; provider: Eip1193Provider }
interface State {
  phase: WalletPhase;
  options: WalletOption[];
  selected: WalletOption | null;
  account: Address | null;
  chainId: string | null;
  error: string | null;
}

const TARGET_CHAIN = (import.meta.env.VITE_CHAIN_ID as string | undefined)?.toLowerCase() ?? "";
let state: State = { phase: "DISCONNECTED", options: [], selected: null, account: null, chainId: null, error: null };
const subscribers = new Set<() => void>();
const providerIds = new WeakMap<object, string>();
let sequence = 0;
let cleanupSession = () => {};

const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subscribers.forEach((subscriber) => subscriber());
};
const canonicalName = (info: Record<string, unknown>, provider: Eip1193Provider): WalletName | null => {
  const rdns = String(info.rdns ?? "").toLowerCase();
  const name = String(info.name ?? "").toLowerCase();
  if (rdns.includes("rabby") || name === "rabby" || provider.isRabby) return "Rabby";
  if (rdns.includes("okx") || name.includes("okx") || provider.isOkxWallet) return "OKX Wallet";
  if (rdns.includes("metamask") || name === "metamask" || provider.isMetaMask) return "MetaMask";
  return null;
};
const add = (id: string, name: WalletName, provider: Eip1193Provider) => {
  if (!provider || typeof provider.request !== "function") return;
  const objectId = providerIds.get(provider as object) ?? `provider-${++sequence}`;
  providerIds.set(provider as object, objectId);
  const options = state.options.filter((entry) => entry.id !== id && entry.provider !== provider && entry.name !== name);
  emit({ options: [...options, { id, name, provider }].sort((a, b) => a.name.localeCompare(b.name)) });
};
const announce = (event: Event) => {
  const detail = (event as CustomEvent).detail as { info?: Record<string, unknown>; provider?: Eip1193Provider } | undefined;
  if (!detail?.info || !detail.provider) return;
  const name = canonicalName(detail.info, detail.provider);
  const uuid = String(detail.info.uuid ?? "");
  if (name && uuid) add(`eip6963:${uuid}`, name, detail.provider);
};

export const walletStore = {
  subscribe(listener: () => void) { subscribers.add(listener); return () => subscribers.delete(listener); },
  getSnapshot: () => state,
  start() {
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as Window & { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } }).ethereum;
    const candidates = injected?.providers ?? (injected ? [injected] : []);
    candidates.forEach((provider) => {
      const name = canonicalName({}, provider);
      if (name) add(`legacy:${name}`, name, provider);
    });
    return () => { cleanupSession(); window.removeEventListener("eip6963:announceProvider", announce); };
  },
  openChooser() {
    emit({ phase: "DISCOVERING", error: null });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    emit({ phase: "CHOOSER_OPEN" });
  },
  closeChooser() { if (state.phase === "CHOOSER_OPEN") emit({ phase: "DISCONNECTED" }); },
  async connect(option: WalletOption) {
    cleanupSession();
    emit({ phase: "CONNECTING", selected: option, account: null, error: null });
    try {
      const accounts = await option.provider.request({ method: "eth_requestAccounts" });
      const account = Array.isArray(accounts) ? String(accounts[0] ?? "").toLowerCase() : "";
      if (!/^0x[0-9a-f]{40}$/.test(account)) throw new Error("Wallet returned no valid account.");
      const chainId = String(await option.provider.request({ method: "eth_chainId" })).toLowerCase();
      const onAccounts = (...args: unknown[]) => {
        const values = args[0];
        const next = Array.isArray(values) ? String(values[0] ?? "").toLowerCase() : "";
        if (!/^0x[0-9a-f]{40}$/.test(next)) walletStore.disconnect();
        else emit({ account: next as Address });
      };
      const onChain = (...args: unknown[]) => {
        const next = String(args[0] ?? "").toLowerCase();
        emit({ chainId: next, phase: !TARGET_CHAIN || next === TARGET_CHAIN ? "CONNECTED" : "WRONG_CHAIN" });
      };
      const onDisconnect = () => walletStore.disconnect();
      option.provider.on?.("accountsChanged", onAccounts);
      option.provider.on?.("chainChanged", onChain);
      option.provider.on?.("disconnect", onDisconnect);
      cleanupSession = () => {
        option.provider.removeListener?.("accountsChanged", onAccounts);
        option.provider.removeListener?.("chainChanged", onChain);
        option.provider.removeListener?.("disconnect", onDisconnect);
      };
      emit({ account: account as Address, chainId, phase: !TARGET_CHAIN || chainId === TARGET_CHAIN ? "CONNECTED" : "WRONG_CHAIN" });
    } catch (error) {
      const rejected = (error as { code?: number }).code === 4001;
      emit({ phase: "ERROR", selected: null, error: rejected ? "Connection request rejected." : String((error as Error).message ?? error) });
    }
  },
  disconnect() { cleanupSession(); cleanupSession = () => {}; emit({ phase: "DISCONNECTED", selected: null, account: null, chainId: null, error: null }); },
};

export const useWallet = () => useSyncExternalStore(walletStore.subscribe, walletStore.getSnapshot);
export const __resetWalletForTests = () => {
  cleanupSession();
  cleanupSession = () => {};
  state = { phase: "DISCONNECTED", options: [], selected: null, account: null, chainId: null, error: null };
};
