# RPC Budget

## FRONTEND RPC BUDGET MATRIX

FRONTEND_MATRIX_STATUS: READY

| Screen/workflow | Trigger | Client owner | RPC method/source | Dedup/cache | Poll interval | Max polls | Retry/backoff | Teardown | Max requests | Max transactions | Authoritative completion |
|---|---|---|---|---|---|---|---|---|---:|---:|---|
| Landing | initial render | shared read client | none | no eager reads | none | 0 | none | unmount | 0 | 0 | static shell rendered |
| Case list | explicit navigation/page | shared read client | list_cases | in-flight dedup; page cache | none | 0 | explicit retry only | route change | 1 | 0 | validated ID page |
| Case detail | explicit case selection | shared read client | get_case | in-flight dedup; case revision cache | none | 0 | explicit retry only | case change | 1 | 0 | validated full record |
| History | explicit revision click | shared read client | get_version | immutable revision cache | none | 0 | explicit retry only | route change | 1 | 0 | validated historical record |
| Wallet connect | explicit wallet choice | wallet store | eth_chainId | one atomic session check | none | 0 | one verified unknown-chain add/switch path | disconnect/provider replacement | 1 | 0 | selected provider/account/chain bound |
| Case write | explicit submit | shared write client | submit + transaction status + exact history readback | one reservation; same-hash only | 2s/4s/8s then 0s/4s | 5 | bounded schedule; no resubmit | terminal/abort/unmount/hidden | 6 | 1 | FINALIZED + FINISHED_WITH_RETURN + exact method postcondition |
| Resume reconciliation | explicit resume | shared write client | same-hash status + exact view | one journal reservation | none | 0 | explicit action only | terminal/abort | 2 | 0 | terminal failure or exact authoritative readback |
| Hidden tab | visibility hidden | shared clients | none | preserve journal/cache | none | 0 | none | visibility listener | 0 | 0 | zero automatic polling |

The journal panel displays at most four records per page and runs at most two explicit reconciliations concurrently. Reads are event-driven; there is no portfolio polling. RPC optimization never weakens finality, semantic execution, or authoritative readback checks.
