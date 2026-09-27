# Negotiated Terms Common-Ground Register — Build Specification

## Locked baseline

This Build implements the exact approved C12 Stage 1/2 product: two fixed, distinct parties independently author and freeze up to eight keyed public terms each. GenLayer validators classify only shared keys as `EQUIVALENT`, `DIFFERENT`, or `UNKNOWN`; a deterministic reducer records full, partial, or no textual common ground. The product does not sign or execute a contract, determine legality, choose a winner, transfer value, or verify external facts.

No material Stage 1/2 adaptation is made. Actor authority, state transitions, public methods, record/history model, limits, result schema, retry policy, frontend journey, RPC budgets, and acceptance criteria remain unchanged. The release envelope is migrated mechanically to the mandatory Studio Next RC family; this changes no product behavior.

## Runtime lock and feasibility evidence

- Contract source envelope: `# v0.3.0` followed by the dependency manifest.
- Pinned runner: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` from GenVM Manager `v0.6.0-rc5`.
- Tool family: GenLayer CLI `0.40.0-rc.3`, `genlayer-js 2.0.0-rc.1`, `genlayer-py 0.19.0rc2`, `genlayer-test 0.30.0rc2`, `genvm-linter 0.11.1rc2`.
- Current source validates namespace-qualified `gl.storage.TreeMap`, `gl.Address`, `gl.message.sender_address`, JSON `exec_prompt`, `gl.vm.Return`, and `gl.vm.run_nondet`; the validator catches its own errors so lower-level `run_nondet` fails closed by disagreement.
- Windows console requires `PYTHONIOENCODING=utf-8` for human output; JSON output is preferred in automation.
- Studio Next identity is the SDK `studioDevnet` / CLI `studio-dev` definition: canonical RPC `https://studio-dev.genlayer.com/api`, chain `61997`, Explorer `https://explorer-studio-dev.genlayer.com/`.

## Exact implementation map

- `contracts/main.py`: one `NegotiatedTermsCommonGroundRegister` contract; seven specified persistent fields; canonical JSON and strict parsing; capacity/CAS/authority guards before mutation; C12 state machine; independent validator re-execution; deterministic reducer; immutable history.
- `tests/test_contract.py`: pure and mocked-consensus coverage for schema, byte limits, duplicate keys, authority isolation, freeze orders, CAS, capacity/revision reservation, idempotent create, no-write failures, deterministic no-shared-key path, all labels/outcomes, malformed/disagreed output, retry cooldown/exhaustion, history and last-operation hashes.
- `frontend/src/contract.ts`: one shared GenLayer client and lossless record/receipt boundaries.
- `frontend/src/pending.ts`: exact `glj1` reservation journal under Web Locks, fail-closed storage probe, immutable hash reconciliation, bounded polling/readback.
- `frontend/src/App.tsx`: identity-only creation, two-party offer editor/freeze journey, union/common-ground comparison, history, wallet selector, public progress and Docs/How it works.
- `frontend/tests/boundaries.test.ts`: wallet availability/state consistency, selected-provider binding, journal locking/hash/case boundaries, receipt/readback integration guards and public-copy regressions.
- `docs/RPC-BUDGET.md`: frontend-only budget matrix. Studio readiness and execution are governed separately by `STUDIO.TOOL_EXECUTION`; there is no Studio request-count gate.

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
