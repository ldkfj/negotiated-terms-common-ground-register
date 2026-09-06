export type Address = `0x${string}`;
export type TxPhase =
  | "IDLE"
  | "WAITING_FOR_WALLET"
  | "SUBMITTED"
  | "WAITING_FOR_FINALITY"
  | "VERIFYING_EXECUTION"
  | "VERIFYING_READBACK"
  | "SUCCESS"
  | "REJECTED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED";

export interface Term { key: string; text: string }
export interface Offer { terms: Term[] }
export interface CaseRecord {
  v: 1;
  id: string;
  primary: Address;
  secondary: Address;
  phase: "OPEN" | "FROZEN" | "UNRESOLVED" | "EXHAUSTED" | "DONE";
  revision: string;
  parent: string;
  base: Offer | Record<string, never>;
  response: Offer | Record<string, never>;
  base_locked: boolean;
  response_locked: boolean;
  accepted_attempts: number;
  last_accepted_at: string;
  outcome: string;
  result: Record<string, unknown>;
  domain: { frozen_a: boolean; frozen_b: boolean };
  last_operation: { method: string; caller: Address; args_hash: string };
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOkxWallet?: boolean;
}
