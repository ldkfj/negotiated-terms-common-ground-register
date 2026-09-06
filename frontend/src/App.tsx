import { useEffect, useMemo, useRef, useState } from "react";
import { deploymentConfigured, getCase, writeAndVerify, type WriteProgress } from "./contract";
import type { CaseRecord, Offer, Term, TxPhase } from "./types";
import { useWallet, walletStore, type WalletOption } from "./wallet";

const emptyProgress: WriteProgress = { phase: "IDLE", message: "No transaction in progress." };
const isOffer = (value: unknown): value is Offer => Boolean(value && typeof value === "object" && Array.isArray((value as Offer).terms));
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const phasePending = (phase: TxPhase) => ["WAITING_FOR_WALLET", "SUBMITTED", "WAITING_FOR_FINALITY", "VERIFYING_EXECUTION", "VERIFYING_READBACK"].includes(phase);

function WalletChooser({ options, onClose, onChoose }: { options: WalletOption[]; onClose(): void; onChoose(option: WalletOption): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  return <div className="backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-title" tabIndex={-1} ref={dialog} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <button className="dialog-close" onClick={onClose} aria-label="Close wallet chooser">×</button>
      <p className="eyebrow">Detected providers</p><h2 id="wallet-title">Choose your wallet</h2>
      {options.length === 0 ? <p className="empty">No supported wallet was detected. Install MetaMask, OKX Wallet, or Rabby, then reopen this chooser.</p> :
        <div className="wallet-options">{options.map((option) => <button key={option.id} onClick={() => onChoose(option)}>{option.name}<span>Connect</span></button>)}</div>}
    </div>
  </div>;
}

function OfferEditor({ title, terms, editable, onChange, onSave, onFreeze, frozen }: { title: string; terms: Term[]; editable: boolean; frozen: boolean; onChange(terms: Term[]): void; onSave(): void; onFreeze(): void }) {
  const update = (index: number, field: keyof Term, value: string) => onChange(terms.map((term, at) => at === index ? { ...term, [field]: value } : term));
  return <section className="offer-panel">
    <div className="panel-heading"><div><p className="eyebrow">Independent offer</p><h2>{title}</h2></div><span className={frozen ? "status frozen" : "status"}>{frozen ? "Frozen" : "Editable"}</span></div>
    {terms.map((term, index) => <div className="term-row" key={index}>
      <input aria-label={`${title} term ${index + 1} key`} placeholder="term_key" value={term.key} disabled={!editable} onChange={(event) => update(index, "key", event.target.value)} />
      <textarea aria-label={`${title} term ${index + 1} text`} placeholder="Write the complete public term" value={term.text} disabled={!editable} onChange={(event) => update(index, "text", event.target.value)} />
      {editable && terms.length > 1 && <button className="icon-button" aria-label={`Remove ${term.key || "term"}`} onClick={() => onChange(terms.filter((_, at) => at !== index))}>−</button>}
    </div>)}
    {editable && <div className="panel-actions">
      <button className="secondary" disabled={terms.length >= 8} onClick={() => onChange([...terms, { key: "", text: "" }])}>Add term</button>
      <button className="secondary" onClick={onSave}>Save offer</button>
      <button className="primary" onClick={onFreeze}>Freeze offer</button>
    </div>}
  </section>;
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
    if (isOffer(record.base)) setOfferA(record.base.terms);
    if (isOffer(record.response)) setOfferB(record.response.terms);
  }, [record]);
  const isA = wallet.account === record?.primary;
  const isB = wallet.account === record?.secondary;
  const union = useMemo(() => {
    const a = new Map(offerA.filter((term) => term.key).map((term) => [term.key, term.text]));
    const b = new Map(offerB.filter((term) => term.key).map((term) => [term.key, term.text]));
    return [...new Set([...a.keys(), ...b.keys()])].sort().map((key) => ({ key, a: a.get(key), b: b.get(key) }));
  }, [offerA, offerB]);
  const load = async () => {
    try { setNotice("Loading exact contract record…"); setRecord(await getCase(caseId)); setNotice(""); }
    catch (error) { setNotice(String((error as Error).message ?? error)); }
  };
  const act = async (method: string, args: unknown[], expected: (next: CaseRecord) => boolean) => {
    if (!record || wallet.phase !== "CONNECTED" || !wallet.selected || !wallet.account) return;
    try {
      await writeAndVerify({ provider: wallet.selected.provider, account: wallet.account, method, args, intent: `${method}:${record.id}:${record.revision}`, preRevision: record.revision, expected, onProgress: setProgress });
      const next = await getCase(record.id); if (next) setRecord(next);
    } catch { /* progress owns the public error */ }
  };
  const save = (side: "a" | "b") => {
    const terms = side === "a" ? offerA : offerB;
    const method = side === "a" ? "put_offer_a" : "put_offer_b";
    void act(method, [BigInt(caseId), JSON.stringify({ terms }), BigInt(record?.revision ?? "0")], (next) => next.last_operation.method === method);
  };
  const freeze = (side: "a" | "b") => {
    const method = side === "a" ? "freeze_offer_a" : "freeze_offer_b";
    void act(method, [BigInt(caseId), BigInt(record?.revision ?? "0")], (next) => side === "a" ? next.domain.frozen_a : next.domain.frozen_b);
  };
  const assess = () => void act("evaluate_common_ground", [BigInt(caseId), BigInt(record?.revision ?? "0")], (next) => ["DONE", "UNRESOLVED"].includes(next.phase));
  return <>
    <header className="topbar"><a className="brand" href="#top" aria-label="Common Ground Register home"><span className="mark">∩</span><span>Common Ground Register</span></a>
      <nav><a href="#workspace">Workspace</a><a href="#how">How it works</a></nav>
      {wallet.phase === "CONNECTED" && wallet.selected && wallet.account ? <div className="wallet-connected"><span>{wallet.selected.name} · {short(wallet.account)}</span><button onClick={() => walletStore.disconnect()}>Disconnect</button></div> : <button className="wallet-button" onClick={() => walletStore.openChooser()}>Connect wallet</button>}
    </header>
    <main id="top">
      <section className="hero"><p className="eyebrow">Bilateral evidence · GenLayer</p><h1>Find what two offers<br /><em>actually share.</em></h1><p className="lede">Each party writes and freezes only its own terms. Validators compare matching keys; the contract records the intersection without declaring a winner or making a legal determination.</p><div className="hero-proof"><span>Two independent authors</span><span>Immutable revisions</span><span>Semantic comparison</span></div></section>
      {!deploymentConfigured && <aside className="configuration-note">The public deployment address will be attached after governed Studio verification. The interface is functional and ready for that exact address.</aside>}
      <section id="workspace" className="workspace">
        <div className="workspace-bar"><div><p className="eyebrow">Register workspace</p><h2>Inspect a negotiation</h2></div><div className="case-loader"><label htmlFor="case-id">Case ID</label><input id="case-id" inputMode="numeric" value={caseId} onChange={(event) => setCaseId(event.target.value.replace(/\D/g, ""))} /><button onClick={load}>Load exact record</button></div></div>
        {notice && <p className="notice" role="status">{notice}</p>}
        {record ? <>
          <div className="record-strip"><span>Case {record.id}</span><span>Revision {record.revision}</span><span>{record.phase}</span><span>{record.outcome || "Awaiting assessment"}</span></div>
          <div className="offers"><OfferEditor title="Party A" terms={offerA} onChange={setOfferA} editable={Boolean(isA && !record.domain.frozen_a)} frozen={record.domain.frozen_a} onSave={() => save("a")} onFreeze={() => freeze("a")} /><OfferEditor title="Party B" terms={offerB} onChange={setOfferB} editable={Boolean(isB && !record.domain.frozen_b)} frozen={record.domain.frozen_b} onSave={() => save("b")} onFreeze={() => freeze("b")} /></div>
          <section className="intersection"><div><p className="eyebrow">Deterministic union</p><h2>Key-by-key comparison</h2></div>{union.length ? <div className="comparison-table">{union.map((row) => <div className="comparison-row" key={row.key}><strong>{row.key}</strong><span>{row.a ?? "One-sided: absent from A"}</span><span>{row.b ?? "One-sided: absent from B"}</span></div>)}</div> : <p className="empty">No submitted terms yet.</p>}
            {record.phase === "FROZEN" && <button className="primary assess" disabled={wallet.phase !== "CONNECTED"} onClick={assess}>Assess frozen offers</button>}
          </section>
        </> : <div className="empty-state"><span className="mark large">∩</span><h2>Load an exact case to begin</h2><p>Records remain public and revision-bound. No offer can be authored or frozen by the other party.</p></div>}
      </section>
      <section className="transaction" data-transaction-phase={progress.phase} aria-live="polite">{phasePending(progress.phase) && <span className="spinner" aria-hidden="true" />}<div><p className="eyebrow">Transaction status</p><strong>{progress.phase.replaceAll("_", " ")}</strong><p>{progress.message}</p>{progress.hash && <code>{progress.hash}</code>}</div></section>
      <section id="how" className="how"><p className="eyebrow">How it works</p><h2>A narrow, verifiable purpose</h2><div className="steps"><article><b>01</b><h3>Fix identities</h3><p>Party A opens a case naming Party B. Creation contains no offer text.</p></article><article><b>02</b><h3>Author separately</h3><p>Each connected wallet replaces and freezes only its own complete public offer.</p></article><article><b>03</b><h3>Compare meaning</h3><p>After both freezes, GenLayer validators classify matching keys while one-sided keys stay disputed.</p></article><article><b>04</b><h3>Verify history</h3><p>Finality, semantic execution and the exact revision readback must all agree before success appears.</p></article></div><div className="disclaimer"><strong>Important boundary</strong><p>Textual common ground between these frozen offers; no contract execution or legal determination. Assessment of this exact submitted material only; not verification of external facts.</p><p>All submitted text will be public and permanent. Do not include private information, credentials or personal records.</p></div></section>
    </main>
    {wallet.phase === "CHOOSER_OPEN" && <WalletChooser options={wallet.options} onClose={() => walletStore.closeChooser()} onChoose={(option) => void walletStore.connect(option)} />}
  </>;
}
