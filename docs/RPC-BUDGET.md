# RPC Budget

RPC_BUDGET_REVISION: CODE_EDIT worktree based on 4d1a1bdfac4fc6ef1f79fdc71fd902b48b72613b; bind to the selected Git identity commit before PRE_DEPLOY
OFFICIAL_DOCS_CHECKED: 2026-09-21 — https://docs.genlayer.com/developers/networks and https://docs.genlayer.com/developers/consensus-v06-migration
FRONTEND_SCOPE: APPLICABLE
FRONTEND_MATRIX_STATUS: COMPLETE
FRONTEND_EVIDENCE_STATUS: NOT_RUN_UNTIL_EXACT_RELEASE
MULTI_CLIENT_JUSTIFICATION: One module-owned read client serves deduplicated public views; one selected-wallet write client is created per explicit write so the provider/account binding cannot leak across wallet sessions.

## FRONTEND RPC BUDGET MATRIX

| Screen/workflow | Trigger | Client owner | RPC method/source | Dedup/cache | Poll interval | Max polls | Retry/backoff | Teardown | Max requests | Max transactions | Authoritative completion |
|---|---|---|---|---|---|---|---|---|---:|---:|---|
| Landing | initial render | shared read client | none | no eager reads | none | 0 | none | unmount | 0 | 0 | static shell rendered |
| Case list | explicit navigation/page | shared read client | list_cases | in-flight dedup; page cache | none | 0 | explicit retry only | route change | 1 | 0 | validated ID page |
| Case detail | explicit case selection | shared read client | get_case | in-flight dedup; case revision cache | none | 0 | explicit retry only | case change | 1 | 0 | validated full record |
| History | explicit revision click | shared read client | get_version | immutable revision cache | none | 0 | explicit retry only | route change | 1 | 0 | validated historical record |
| Wallet connect | explicit wallet choice | wallet store | eth_chainId | one atomic session check | none | 0 | one verified unknown-chain add/switch path | disconnect/provider replacement | 1 | 0 | selected provider/account/chain bound |
| Case write | explicit submit | shared write client | fee estimate + submit + finalization status + exact history readback | one reservation; same-hash only | 4s | 5 | SDK-bounded wait; no resubmit | terminal/abort/unmount/hidden | 9 | 1 | FINALIZED + isSuccessful + FINISHED_WITH_RETURN + exact method postcondition |
| Resume reconciliation | explicit resume | shared write client | same-hash status + exact view | one journal reservation | none | 0 | explicit action only | terminal/abort | 2 | 0 | terminal failure or exact authoritative readback |
| Hidden tab | visibility hidden | shared clients | none | preserve journal/cache | none | 0 | none | visibility listener | 0 | 0 | zero automatic polling |

The journal panel displays at most four records per page and runs at most two explicit reconciliations concurrently. Reads are event-driven; there is no portfolio polling. RPC optimization never weakens fee estimation, finality, semantic execution, or authoritative readback checks. Studio deployment/tool readiness is governed separately by `STUDIO.TOOL_EXECUTION`; Studio has no request-count matrix or measurement gate.

## FRONTEND RPC BUDGET EVIDENCE

Evidence is intentionally not marked complete before the exact release exists. The final primary-AI browser run will measure each matrix row, including request source/method, planned and actual counts, polling attempts, retry/backoff, cache hit or miss, in-flight deduplication, invalidation, authoritative readback and transaction count. Implementation regressions currently prove bounded SDK polling, no interval loop, immutable same-hash reconciliation, one write submission site and no automatic resubmit; they do not substitute for release measurements.
