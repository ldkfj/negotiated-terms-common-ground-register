# Negotiated Terms Common-Ground Register — Build Specification

## Locked baseline

This Build implements the exact approved C12 Stage 1/2 product: two fixed, distinct parties independently author and freeze up to eight keyed public terms each. GenLayer validators classify only shared keys as `EQUIVALENT`, `DIFFERENT`, or `UNKNOWN`; a deterministic reducer records full, partial, or no textual common ground. The product does not sign or execute a contract, determine legality, choose a winner, transfer value, or verify external facts.

No material Stage 1/2 adaptation is made. Actor authority, state transitions, public methods, record/history model, limits, result schema, retry policy, frontend journey, RPC budgets, and acceptance criteria remain unchanged.

## Runtime lock and feasibility evidence

- Contract source envelope: `# v0.1.0` followed by the dependency manifest.
- Pinned runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
- Tool: `genvm-lint 0.11.0`; Python `3.13.6`.
- Probe: `docs/preflight/spec-lock-probe.py` validates `TreeMap[u256,str]`, `Address`, `gl.message.sender_address`, JSON `exec_prompt`, `gl.vm.Return`, `run_nondet_unsafe`, one write and one view. Lint, semantic validation, and schema extraction pass.
- Windows console requires `PYTHONIOENCODING=utf-8` for human output; JSON output is preferred in automation.
- The linter-advertised newer runner `1zr6n...vfvwh` failed SDK load with `E101 No module named 'genlayer.py'`; it is not used. Reconsider only after a successful lint/schema/runtime probe.

## Exact implementation map

- `contracts/main.py`: one `NegotiatedTermsCommonGroundRegister` contract; seven specified persistent fields; canonical JSON and strict parsing; capacity/CAS/authority guards before mutation; C12 state machine; independent validator re-execution; deterministic reducer; immutable history.
- `tests/test_contract.py`: pure and mocked-consensus coverage for schema, byte limits, duplicate keys, authority isolation, freeze orders, CAS, capacity/revision reservation, idempotent create, no-write failures, deterministic no-shared-key path, all labels/outcomes, malformed/disagreed output, retry cooldown/exhaustion, history and last-operation hashes.
- `frontend/src/contract.ts`: one shared GenLayer client and lossless record/receipt boundaries.
- `frontend/src/pending.ts`: exact `glj1` reservation journal under Web Locks, fail-closed storage probe, immutable hash reconciliation, bounded polling/readback.
- `frontend/src/App.tsx`: identity-only creation, two-party offer editor/freeze journey, union/common-ground comparison, history, wallet selector, public progress and Docs/How it works.
- `frontend/tests/flow.spec.ts`: wallet availability/state consistency, actor journeys, journal crash/concurrency/capacity failures, receipt/readback states, RPC limits, accessibility and public-copy checks.
- `docs/RPC-BUDGET.md`: separate frontend budget matrix. Studio budget and measurement mode are created only at PRE_DEPLOY.

## Cross-layer invariants

All case IDs, revisions, timestamps and u256 values cross JSON as canonical decimal strings and become `bigint` in TypeScript. Every accepted result key is identical across contract validation, storage, frontend parser, tests and evidence. A write becomes public success only after finality, semantic execution success, and exact historical method/caller/argument-hash postcondition. Unknown or failed outcomes never mutate state and never authorize replay.

## Experience application

- Apply independent re-execution of every consequential label; include a schema-valid but semantically different validator fixture.
- Keep local GenVM doubles narrower than runtime; validate alternate address forms and storage conversion through lint/schema/current-runtime probes.
- Diff exact result keys across specification, contract, frontend and tests before each checkpoint.
- Keep the version line before the dependency manifest and rehash after any source-prologue change.
- Treat contract JSON, receipts and storage as untrusted protocol boundaries; test values above `2^53`, malformed envelopes, storage failure before/after hash, cleanup failure and zero duplicate writes.
- Native-value and external-evidence experience entries are not applicable: this product has no payments, external fetch, or evidence issuer.

## Acceptance route

Implementation must pass local contract/frontend/browser checks and exact-source lint/schema, then obtain PRE_DEPLOY approval before Studio. Live success requires semantic execution plus authoritative readback. GitHub/Vercel targets are requested only after POST_DEPLOY_TEST approval. Vercel E2E starts only after its approved plan and explicit user permission. Final Project Explorer copy is produced only after the final anonymous gates.
