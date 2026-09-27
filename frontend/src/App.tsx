import { useEffect, useMemo, useRef, useState } from "react";
import { deploymentConfigured, getCase, writeAndVerify, type WriteProgress } from "./contract";
import type { CaseRecord, Offer, Term, TxPhase } from "./types";
import { useWallet, walletStore, type WalletOption } from "./wallet";

const emptyProgress: WriteProgress = { phase: "IDLE", message: "No transaction in progress." };
const isOffer = (value: unknown): value is Offer =>
  Boolean(value && typeof value === "object" && Array.isArray((value as Offer).terms));
const short = (value: string) => (value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value);
const phasePending = (phase: TxPhase) =>
  ["WAITING_FOR_WALLET", "SUBMITTED", "WAITING_FOR_FINALITY", "VERIFYING_EXECUTION", "VERIFYING_READBACK"].includes(phase);
// The matching CSS media query honors prefers-reduced-motion for all progress animation.

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard write failure gracefully ignored */
    }
  };
  return (
    <button
      type="button"
      className="copy-button"
      onClick={copy}
      aria-label={`${label} to clipboard`}
      title={`${label} to clipboard`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function BrandLogo({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? "mark large" : "mark"} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="brand-svg">
        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.5" opacity="0.35" />
        <circle cx="15" cy="20" r="11" stroke="currentColor" strokeWidth="1.8" opacity="0.65" />
        <circle cx="25" cy="20" r="11" stroke="currentColor" strokeWidth="1.8" opacity="0.65" />
        <path
          d="M 15 25 V 19 C 15 15.5 25 15.5 25 19 V 25"
          stroke="var(--gold-accent, #d7bd6d)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="20" cy="20" r="1.8" fill="var(--gold-accent, #d7bd6d)" />
      </svg>
    </span>
  );
}

function WalletIcon({ name }: { name: string }) {
  if (name === "MetaMask") {
    return (
      <svg className="wallet-badge-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 4L13 10L14.5 6.5L21 4Z" fill="#E2761B" stroke="#E2761B" strokeWidth="0.5" />
        <path d="M3 4L11 10L9.5 6.5L3 4Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" />
        <path d="M18.5 16.5L16 20L20.5 21L21.5 16.5L18.5 16.5Z" fill="#E4761B" />
        <path d="M2.5 16.5L3.5 21L8 20L5.5 16.5L2.5 16.5Z" fill="#E4761B" />
        <path d="M7.8 10.8L6.5 14.5L10.5 14.7L10.3 10.5L7.8 10.8Z" fill="#E4761B" />
        <path d="M16.2 10.8L13.7 10.5L13.5 14.7L17.5 14.5L16.2 10.8Z" fill="#E4761B" />
      </svg>
    );
  }
  if (name === "Rabby") {
    return (
      <svg className="wallet-badge-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="#8697FF" />
        <path
          d="M12 5C8.13 5 5 8.13 5 12C5 15.87 8.13 19 12 19C15.87 19 19 15.87 19 12C19 8.13 15.87 5 12 5ZM12 16.5C9.51 16.5 7.5 14.49 7.5 12C7.5 9.51 9.51 7.5 12 7.5C14.49 7.5 16.5 9.51 16.5 12C16.5 14.49 14.49 16.5 12 16.5Z"
          fill="white"
        />
      </svg>
    );
  }
  if (name === "OKX Wallet") {
    return (
      <svg className="wallet-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#050505" />
        <path fill="#fff" d="M4 4h5v5H4zm6 0h4v5h-4zm5 0h5v5h-5zM4 10h5v4H4zm11 0h5v4h-5zM4 15h5v5H4zm6 0h4v5h-4zm5 0h5v5h-5zm-5-5h4v4h-4z" />
      </svg>
    );
  }
  return (
    <svg className="wallet-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M16 12h2" strokeLinecap="round" />
    </svg>
  );
}

function WalletChooser({
  options,
  onClose,
  onChoose,
}: {
  options: WalletOption[];
  onClose(): void;
  onChoose(option: WalletOption): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const initiatingControl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = backdrop.current?.parentElement
      ? Array.from(backdrop.current.parentElement.children).filter((element) => element !== backdrop.current)
      : [];
    siblings.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    dialog.current?.focus();
    return () => {
      siblings.forEach((element) => {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      });
      initiatingControl?.focus();
    };
  }, []);

  return (
    <div
      className="backdrop"
      ref={backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
            if (!controls.length) { event.preventDefault(); dialog.current?.focus(); return; }
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}
      >
        <button className="dialog-close" onClick={onClose} aria-label="Close wallet chooser">
          ×
        </button>
        <p className="eyebrow">Detected providers</p>
        <h2 id="wallet-title">Choose your wallet</h2>
        <p className="dialog-sub">Select an authorized provider to interact with the common-ground register.</p>

        {options.length === 0 ? (
          <div className="wallet-empty-box">
            <p className="empty">
              No supported wallet was detected. Install MetaMask, OKX Wallet, or Rabby, then reopen this chooser.
            </p>
          </div>
        ) : (
          <div className="wallet-options">
            {options.map((option) => (
              <button key={option.id} onClick={() => onChoose(option)}>
                <div className="wallet-option-meta">
                  <WalletIcon name={option.name} />
                  <span>{option.name}</span>
                </div>
                <span>Connect</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OfferEditor({
  title,
  subtitle,
  address,
  terms,
  editable,
  onChange,
  onSave,
  onFreeze,
  frozen,
  terminal,
  isPartyConnected,
}: {
  title: string;
  subtitle: string;
  address?: string;
  terms: Term[];
  editable: boolean;
  frozen: boolean;
  terminal: boolean;
  onChange(terms: Term[]): void;
  onSave(): void;
  onFreeze(): void;
  isPartyConnected?: boolean;
}) {
  const update = (index: number, field: keyof Term, value: string) =>
    onChange(terms.map((term, at) => (at === index ? { ...term, [field]: value } : term)));

  return (
    <section className={`offer-panel ${frozen ? "is-frozen" : editable ? "is-editable" : "is-readonly"}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Independent offer · {subtitle}</p>
          <h2>{title}</h2>
          {address && (
            <div className="party-address-line">
              <span className="party-address-val" title={address}>
                {short(address)}
              </span>
              <CopyButton text={address} label="Copy" />
              {isPartyConnected && <span className="connected-party-chip">Connected author</span>}
            </div>
          )}
        </div>
        <div className="panel-status-group">
          <span className={frozen ? "status frozen" : "status"}>
            {frozen ? "Frozen" : editable ? "Editable" : "Read-only"}
          </span>
          <span className="term-counter">{terms.length}/8 terms</span>
        </div>
      </div>

      <div className="terms-container">
        {terms.map((term, index) => (
          <div className="term-row" key={index}>
            <div className="term-key-col">
              <input
                aria-label={`${title} term ${index + 1} key`}
                placeholder="term_key"
                value={term.key}
                disabled={!editable}
                onChange={(event) => update(index, "key", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              />
            </div>
            <div className="term-text-col">
              <textarea
                aria-label={`${title} term ${index + 1} text`}
                placeholder="Write the complete public term"
                value={term.text}
                disabled={!editable}
                maxLength={512}
                onChange={(event) => update(index, "text", event.target.value)}
              />
            </div>
            {editable && terms.length > 1 && (
              <button
                className="icon-button"
                aria-label={`Remove ${term.key || "term"}`}
                onClick={() => onChange(terms.filter((_, at) => at !== index))}
                title="Remove this term"
              >
                −
              </button>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={terms.length >= 8}
            onClick={() => onChange([...terms, { key: "", text: "" }])}
            title={terms.length >= 8 ? "Maximum of 8 terms reached" : "Add another term"}
          >
            Add term
          </button>
          <button className="secondary" onClick={onSave} title="Save current terms to immutable contract storage">
            Save offer
          </button>
          <button className="primary" onClick={onFreeze} title="Permanently freeze this offer for evaluation">
            Freeze offer
          </button>
        </div>
      )}
      {!editable && !frozen && (
        <div className="panel-readonly-notice">
          <p>
            {isPartyConnected
              ? "You are authoring this offer. Terms may be modified until frozen."
              : "Connect this party's wallet to author or freeze terms. Other accounts are read-only observers."}
          </p>
        </div>
      )}
      {frozen && (
        <div className="panel-frozen-notice">
          <p>{terminal ? "This offer is permanently frozen in the completed record." : "This offer is irrevocably frozen and ready for validator consensus."}</p>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const wallet = useWallet();
  const [caseId, setCaseId] = useState("1");
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [offerA, setOfferA] = useState<Term[]>([{ key: "", text: "" }]);
  const [offerB, setOfferB] = useState<Term[]>([{ key: "", text: "" }]);
  const [progress, setProgress] = useState<WriteProgress>(emptyProgress);
  const [notice, setNotice] = useState("");

  useEffect(() => walletStore.start(), []);

  useEffect(() => {
    if (!record) return;
    if (isOffer(record.base)) setOfferA(record.base.terms.length ? record.base.terms : [{ key: "", text: "" }]);
    if (isOffer(record.response)) setOfferB(record.response.terms.length ? record.response.terms : [{ key: "", text: "" }]);
  }, [record]);

  const isA = Boolean(wallet.account && record?.primary && wallet.account.toLowerCase() === record.primary.toLowerCase());
  const isB = Boolean(wallet.account && record?.secondary && wallet.account.toLowerCase() === record.secondary.toLowerCase());

  const union = useMemo(() => {
    const a = new Map(offerA.filter((term) => term.key.trim()).map((term) => [term.key.trim(), term.text]));
    const b = new Map(offerB.filter((term) => term.key.trim()).map((term) => [term.key.trim(), term.text]));
    return [...new Set([...a.keys(), ...b.keys()])].sort().map((key) => ({ key, a: a.get(key), b: b.get(key) }));
  }, [offerA, offerB]);

  const sharedKeys = useMemo(() => {
    const aKeys = new Set(offerA.filter((t) => t.key.trim()).map((t) => t.key.trim()));
    const bKeys = new Set(offerB.filter((t) => t.key.trim()).map((t) => t.key.trim()));
    return [...aKeys].filter((k) => bKeys.has(k)).sort();
  }, [offerA, offerB]);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    const rawLabels = (record?.result as { labels?: unknown })?.labels;
    if (Array.isArray(rawLabels)) {
      sharedKeys.forEach((key, idx) => {
        const label = rawLabels[idx];
        if (typeof label === "string") map.set(key, label);
      });
    }
    return map;
  }, [record?.result, sharedKeys]);

  const load = async (targetId = caseId) => {
    try {
      setNotice("Loading exact contract record…");
      const res = await getCase(targetId);
      setRecord(res);
      setNotice(res ? "" : `Case #${targetId} not found in the register.`);
    } catch (error) {
      setNotice(String((error as Error).message ?? error));
    }
  };

  const act = async (method: string, args: unknown[], expected: (next: CaseRecord) => boolean) => {
    if (!record || wallet.phase !== "CONNECTED" || !wallet.selected || !wallet.account) return;
    try {
      await writeAndVerify({
        provider: wallet.selected.provider,
        account: wallet.account,
        method,
        args,
        intent: `${method}:${record.id}:${record.revision}`,
        preRevision: record.revision,
        expected,
        onProgress: setProgress,
      });
      const next = await getCase(record.id);
      if (next) setRecord(next);
    } catch {
      /* progress state owns the public error */
    }
  };

  const save = (side: "a" | "b") => {
    const terms = side === "a" ? offerA : offerB;
    const method = side === "a" ? "put_offer_a" : "put_offer_b";
    void act(method, [BigInt(caseId), JSON.stringify({ terms }), BigInt(record?.revision ?? "0")], (next) => next.last_operation.method === method);
  };

  const freeze = (side: "a" | "b") => {
    const method = side === "a" ? "freeze_offer_a" : "freeze_offer_b";
    void act(method, [BigInt(caseId), BigInt(record?.revision ?? "0")], (next) => (side === "a" ? next.domain.frozen_a : next.domain.frozen_b));
  };

  const assess = () =>
    void act("evaluate_common_ground", [BigInt(caseId), BigInt(record?.revision ?? "0")], (next) => ["DONE", "UNRESOLVED"].includes(next.phase));

  const retry = () =>
    void act("retry_negotiation", [BigInt(caseId), BigInt(record?.revision ?? "0")], (next) => ["DONE", "UNRESOLVED", "EXHAUSTED"].includes(next.phase));

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Common Ground Register home">
          <BrandLogo />
          <div className="brand-text">
            <span className="brand-title">Common Ground Register</span>
            <span className="brand-subtitle">GenLayer Bilateral Protocol</span>
          </div>
        </a>

        <nav aria-label="Main navigation">
          <a href="#workspace">Workspace</a>
          <a href="#comparison">Union Analysis</a>
          <a href="#how">How it works</a>
        </nav>

        <div className="topbar-actions">
          {wallet.phase === "CONNECTED" && wallet.selected && wallet.account ? (
            <div className="wallet-connected">
              <span className="wallet-meta-pill">
                <span className="wallet-live-dot" aria-hidden="true" />
                <span className="wallet-label">{wallet.selected.name} · {short(wallet.account)}</span>
                {isA && <span className="role-tag">Party A</span>}
                {isB && <span className="role-tag">Party B</span>}
              </span>
              <button onClick={() => walletStore.disconnect()} className="wallet-disconnect-btn">
                Disconnect
              </button>
            </div>
          ) : wallet.phase === "CONNECTING" ? (
            <button className="wallet-button" disabled aria-busy="true">
              <span className="spinner-micro" aria-hidden="true" />
              Connecting…
            </button>
          ) : wallet.phase === "WRONG_CHAIN" ? (
            <div className="wallet-connected">
              <span className="network-warning-pill">Wrong network</span>
              <button onClick={() => void walletStore.recoverChain()} className="wallet-button">
                Switch network
              </button>
              <button onClick={() => walletStore.disconnect()} className="wallet-disconnect-btn">
                Disconnect
              </button>
            </div>
          ) : (
            <button className="wallet-button" onClick={() => walletStore.openChooser()}>
              Connect wallet
            </button>
          )}
          {wallet.error && <span className="wallet-error" role="alert">{wallet.error}</span>}
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-content">
            <p className="eyebrow">Bilateral evidence · GenLayer</p>
            <h1>
              Find what two offers<br />
              <em>actually share.</em>
            </h1>
            <p className="lede">
              Each party writes and freezes only its own terms. Validators compare matching keys; the contract records
              the intersection without declaring a winner or making a legal determination.
            </p>
            <div className="hero-proof">
              <span>Two independent authors</span>
              <span>Immutable revisions</span>
              <span>Semantic comparison</span>
            </div>
            <div className="hero-cta-row">
              <a href="#workspace" className="hero-primary-link">
                Inspect a negotiation ↓
              </a>
              <a href="#how" className="hero-secondary-link">
                How it works
              </a>
            </div>
          </div>
        </section>

        {!deploymentConfigured && (
          <aside className="configuration-note">
            The public deployment address will be attached after governed Studio verification. The interface is functional and ready for that exact address.
          </aside>
        )}

        <section id="workspace" className="workspace">
          <div className="workspace-bar">
            <div>
              <p className="eyebrow">Register workspace</p>
              <h2>Inspect a negotiation</h2>
              <p className="workspace-sub">
                Query contract state by decimal case ID. Authority boundaries and immutable revision histories are enforced on-chain.
              </p>
            </div>
            <div className="case-loader-wrap">
              <div className="case-presets">
                <span className="preset-label">Quick load:</span>
                {["1", "2", "3"].map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`preset-chip ${caseId === id ? "active" : ""}`}
                    onClick={() => {
                      setCaseId(id);
                      void load(id);
                    }}
                  >
                    Case #{id}
                  </button>
                ))}
              </div>
              <div className="case-loader">
                <label htmlFor="case-id">Case ID</label>
                <input
                  id="case-id"
                  inputMode="numeric"
                  value={caseId}
                  onChange={(event) => setCaseId(event.target.value.replace(/\D/g, ""))}
                />
                <button onClick={() => void load()}>Load exact record</button>
              </div>
            </div>
          </div>

          {notice && <p className="notice" role="status">{notice}</p>}

          {record ? (
            <>
              <div className="record-strip">
                <span>Case {record.id}</span>
                <span>Revision {record.revision}</span>
                <span>{record.phase}</span>
                <span>{record.outcome || "Awaiting assessment"}</span>
                {record.parent && record.parent !== "0" && <span>Parent #{record.parent}</span>}
                {record.accepted_attempts > 0 && <span>Attempt {record.accepted_attempts}/3</span>}
              </div>

              <div className="parties-identity-bar">
                <div className={`party-card ${isA ? "is-connected-user" : ""}`}>
                  <div className="party-card-head">
                    <span className="party-badge party-badge-a">Party A (Primary)</span>
                    {isA && <span className="you-badge">You</span>}
                  </div>
                  <div className="party-card-body">
                    <code className="party-address">{record.primary}</code>
                    <CopyButton text={record.primary} label="Copy address" />
                  </div>
                  <div className="party-card-foot">
                    <span className={`pill-mini ${record.domain.frozen_a ? "frozen" : "drafting"}`}>
                      {record.domain.frozen_a ? "Offer frozen" : "Offer drafting"}
                    </span>
                  </div>
                </div>

                <div className="bilateral-connector" aria-hidden="true">
                  <span className="connector-line" />
                  <span className="connector-glyph">∩</span>
                  <span className="connector-line" />
                </div>

                <div className={`party-card ${isB ? "is-connected-user" : ""}`}>
                  <div className="party-card-head">
                    <span className="party-badge party-badge-b">Party B (Secondary)</span>
                    {isB && <span className="you-badge">You</span>}
                  </div>
                  <div className="party-card-body">
                    <code className="party-address">{record.secondary}</code>
                    <CopyButton text={record.secondary} label="Copy address" />
                  </div>
                  <div className="party-card-foot">
                    <span className={`pill-mini ${record.domain.frozen_b ? "frozen" : "drafting"}`}>
                      {record.domain.frozen_b ? "Offer frozen" : "Offer drafting"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="offers">
                <OfferEditor
                  title="Party A"
                  subtitle="Primary Author"
                  address={record.primary}
                  terms={offerA}
                  onChange={setOfferA}
                  editable={Boolean(isA && !record.domain.frozen_a)}
                  frozen={record.domain.frozen_a}
                  terminal={["DONE", "EXHAUSTED"].includes(record.phase)}
                  onSave={() => save("a")}
                  onFreeze={() => freeze("a")}
                  isPartyConnected={isA}
                />
                <OfferEditor
                  title="Party B"
                  subtitle="Secondary Author"
                  address={record.secondary}
                  terms={offerB}
                  onChange={setOfferB}
                  editable={Boolean(isB && !record.domain.frozen_b)}
                  frozen={record.domain.frozen_b}
                  terminal={["DONE", "EXHAUSTED"].includes(record.phase)}
                  onSave={() => save("b")}
                  onFreeze={() => freeze("b")}
                  isPartyConnected={isB}
                />
              </div>

              <section id="comparison" className="intersection">
                <div className="intersection-head-wrap">
                  <div>
                    <p className="eyebrow">Deterministic union</p>
                    <h2>Key-by-key comparison</h2>
                    <p className="intersection-explainer">
                      GenLayer validators examine only matching keys across both frozen offers. Shared keys with identical
                      material meaning are classified as EQUIVALENT. Disputed, different, or one-sided keys remain outside common ground.
                    </p>
                  </div>
                  {record.outcome && (
                    <div className={`outcome-card outcome-${record.outcome.toLowerCase()}`}>
                      <span className="outcome-eyebrow">Validator outcome</span>
                      <strong className="outcome-title">{record.outcome.replaceAll("_", " ")}</strong>
                      <p className="outcome-note">
                        {record.outcome === "FULL_COMMON_GROUND" && "Complete semantic agreement across all terms."}
                        {record.outcome === "PARTIAL_COMMON_GROUND" && "At least one, but not all, union terms preserve equivalent meaning."}
                        {record.outcome === "NO_COMMON_GROUND" && "Zero matching terms preserved equivalent meaning."}
                        {record.outcome === "UNRESOLVED" && "Consensus detected phrasing ambiguity. Retry permitted."}
                      </p>
                    </div>
                  )}
                </div>

                {union.length ? (
                  <div className="comparison-table">
                    <div className="comparison-header-row" role="row">
                      <span className="col-head-key">Term Key</span>
                      <span className="col-head-a">Party A Provision</span>
                      <span className="col-head-b">Party B Provision</span>
                      <span className="col-head-eval">Consensus Classification</span>
                    </div>
                    {union.map((row) => {
                      const isShared = row.a !== undefined && row.b !== undefined;
                      const label = isShared ? labelByKey.get(row.key) : undefined;
                      return (
                        <div className="comparison-row" key={row.key} role="row">
                          <div className="comparison-key-col">
                            <strong>{row.key}</strong>
                            <span className={`key-type-chip ${isShared ? "chip-shared" : "chip-disputed"}`}>
                              {isShared ? "Shared key" : "One-sided"}
                            </span>
                          </div>
                          <div className="comparison-cell party-a-cell">
                            <span className="cell-party-indicator">Party A</span>
                            <span className={row.a ? "provision-text" : "provision-empty"}>
                              {row.a ?? "One-sided: absent from A"}
                            </span>
                          </div>
                          <div className="comparison-cell party-b-cell">
                            <span className="cell-party-indicator">Party B</span>
                            <span className={row.b ? "provision-text" : "provision-empty"}>
                              {row.b ?? "One-sided: absent from B"}
                            </span>
                          </div>
                          <div className="comparison-eval-col">
                            {label === "EQUIVALENT" && (
                              <span className="eval-badge eval-equivalent" title="Identical material meaning">
                                EQUIVALENT · Agreement
                              </span>
                            )}
                            {label === "DIFFERENT" && (
                              <span className="eval-badge eval-different" title="Material terms differ">
                                DIFFERENT · Divergent
                              </span>
                            )}
                            {label === "UNKNOWN" && (
                              <span className="eval-badge eval-unknown" title="Ambiguity detected">
                                UNKNOWN · Ambiguous
                              </span>
                            )}
                            {!label && isShared && (
                              <span className="eval-badge eval-pending">
                                Awaiting evaluation
                              </span>
                            )}
                            {!isShared && (
                              <span className="eval-badge eval-disputed">
                                One-sided · Disputed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty">No submitted terms yet.</p>
                )}

                {record.phase === "FROZEN" && (
                  <div className="assess-action-banner">
                    <div className="assess-action-info">
                      <h3>Both offers frozen</h3>
                      <p>Both parties have locked their terms. Anyone may now invoke GenLayer validator consensus to evaluate common ground.</p>
                    </div>
                    <button
                      className="primary assess"
                      disabled={wallet.phase !== "CONNECTED"}
                      onClick={assess}
                    >
                      {wallet.phase !== "CONNECTED" ? "Connect wallet to assess" : "Assess frozen offers"}
                    </button>
                  </div>
                )}

                {record.phase === "UNRESOLVED" && record.accepted_attempts < 3 && (
                  <div className="assess-action-banner unresolved">
                    <div className="assess-action-info">
                      <h3>Ambiguity encountered (Attempt {record.accepted_attempts}/3)</h3>
                      <p>Consensus encountered ambiguity. A retry may be initiated following on-chain cooldown expiration.</p>
                    </div>
                    <button
                      className="secondary assess retry"
                      disabled={wallet.phase !== "CONNECTED"}
                      onClick={retry}
                    >
                      {wallet.phase !== "CONNECTED" ? "Connect wallet to retry" : "Retry assessment"}
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state">
              <span className="mark large">∩</span>
              <h2>Load an exact case to begin</h2>
              <p>Records remain public and revision-bound. No offer can be authored or frozen by the other party.</p>
            </div>
          )}
        </section>

        <section className="transaction" data-transaction-phase={progress.phase} aria-live="polite">
          {phasePending(progress.phase) && <span className="spinner" aria-hidden="true" />}
          <div className="transaction-body">
            <p className="eyebrow">Transaction status</p>
            <strong>{progress.phase.replaceAll("_", " ")}</strong>
            <p>{progress.message}</p>
            {progress.hash && (
              <div className="tx-hash-line">
                <code>{progress.hash}</code>
                <CopyButton text={progress.hash} label="Copy hash" />
              </div>
            )}
            {progress.phase === "RECONCILIATION_REQUIRED" && (
              <div className="reconcile-guidance">
                <strong>Journal safety lock active</strong>
                <p>
                  Your transaction hash is immutably preserved in the local Web Locks attempt journal. Do not resubmit.
                  Inspect the case record after network propagation concludes.
                </p>
              </div>
            )}
          </div>
        </section>

        <section id="how" className="how">
          <div className="how-intro-block">
            <p className="eyebrow">How it works</p>
            <h2>A narrow, verifiable purpose</h2>
            <p className="how-lead">
              The register establishes verified bilateral intersection without collapsing authors into a single document,
              declaring a winner, or determining legal enforceability.
            </p>
          </div>

          <div className="steps">
            <article>
              <b>01</b>
              <h3>Fix identities</h3>
              <p>Party A opens a case naming Party B. Creation contains no offer text.</p>
            </article>
            <article>
              <b>02</b>
              <h3>Author separately</h3>
              <p>Each connected wallet replaces and freezes only its own complete public offer.</p>
            </article>
            <article>
              <b>03</b>
              <h3>Compare meaning</h3>
              <p>After both freezes, GenLayer validators classify matching keys while one-sided keys stay disputed.</p>
            </article>
            <article>
              <b>04</b>
              <h3>Verify history</h3>
              <p>Finality, semantic execution and the exact revision readback must all agree before success appears.</p>
            </article>
          </div>

          <div className="protocol-pillars">
            <div className="pillar-item">
              <span className="pillar-tag">Consensus</span>
              <h4>The Equivalence Principle</h4>
              <p>
                GenLayer validators evaluate natural language covenants nondeterministically under leader execution,
                validated independently by nodes. Differing phrasing that preserves identical material covenants
                classifies as EQUIVALENT.
              </p>
            </div>
            <div className="pillar-item">
              <span className="pillar-tag">Reducer</span>
              <h4>Deterministic Classification</h4>
              <p>
                Results reduce strictly: Full Common Ground requires every key in the union to agree. Partial Common
                Ground records agreed subsets; otherwise No Common Ground. Neither party is declared a winner.
              </p>
            </div>
            <div className="pillar-item">
              <span className="pillar-tag">Immutability</span>
              <h4>Exact Revision Readback</h4>
              <p>
                Every state modification increments the revision number and appends to an immutable history.
                Transactions only report success after finality, return execution, and authoritative history readback.
              </p>
            </div>
          </div>

          <div className="disclaimer">
            <strong>Important boundary</strong>
            <p>
              Textual common ground between these frozen offers; no contract execution or legal determination.
              Assessment of this exact submitted material only; not verification of external facts.
            </p>
            <p>
              All submitted text will be public and permanent. Do not include private information, credentials or personal records.
            </p>
          </div>
        </section>
      </main>

      {wallet.phase === "CHOOSER_OPEN" && (
        <WalletChooser
          options={wallet.options}
          onClose={() => walletStore.closeChooser()}
          onChoose={(option) => void walletStore.connect(option)}
        />
      )}
    </>
  );
}
