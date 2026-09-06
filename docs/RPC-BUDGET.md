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

## STUDIO RPC MEASUREMENT CAPABILITY PROBE

STUDIO_CAPABILITY_PROBE_STATUS: COMPLETE
STUDIO_MEASUREMENT_MODE: OBSERVABLE_ACTION_LEDGER
STUDIO_MEASUREMENT_TIMING: PRE_E2E
STUDIO_CAPABILITY_PROBE_AT: 2026-09-07T04:11:12.2791494+07:00
STUDIO_CAPABILITY_TOOL_OR_API: Codex in-app browser computer-use state and action interfaces
STUDIO_CAPABILITY_CHECK: `cua.getState()` inventory plus the documented browser-control surface available to this Task
STUDIO_CAPABILITY_RESULT: Physical network request events and performance/request logs are not exposed; exact primary-AI browser actions, transaction submissions, retained hashes, bounded status polls, terminal receipt reads, authoritative readbacks, retries, and duplicate-transaction count are observable and can be recorded.
STUDIO_PHYSICAL_COUNT_CLAIM: NONE
STUDIO_ACTION_LEDGER_STATUS: LOCKED_BEFORE_E2E

No Studio page was opened and no Studio action, signature, deployment, write, or poll occurred before this probe.

## STUDIO RPC BUDGET MATRIX

STUDIO_MATRIX_STATUS: READY

| Workflow | Trigger | Observable action/source | Read/write | Poll interval | Max polls | Retry | Terminal receipt | Authoritative readback | Max actions | Max transactions | Completion |
|---|---|---|---|---|---:|---|---:|---:|---:|---:|---|
| Network/account parity | once before deploy | Studio network and selected deployer controls | read | none | 0 | none | 0 | 0 | 2 | 0 | expected Studionet and accessible account recorded |
| Source/schema parity | once before deploy | Studio editor/source and compile/schema result | read | none | 0 | none | 0 | 0 | 2 | 0 | exact source hash and 14-method interface agree |
| Deploy | one explicit deployment | deploy action plus retained hash | write | bounded Studio status | 5 | no resubmit | 1 | 1 | 8 | 1 | FINALIZED, semantic success, deployed address/readback |
| Create negotiation | one unique case | `create_negotiation` | write | bounded Studio status | 5 | no resubmit | 1 | 1 | 7 | 1 | returned ID and `get_case` OPEN revision 1 |
| Party A offer and freeze | explicit Party A actions | `put_offer_a`, then `freeze_offer_a` only after readback | write | bounded per hash | 5 each | no resubmit | 2 | 2 | 14 | 2 | revisions and `base_locked` authoritative readbacks |
| Party B offer and freeze | explicit Party B actions | `put_offer_b`, then `freeze_offer_b` only after readback | write | bounded per hash | 5 each | no resubmit | 2 | 2 | 14 | 2 | revisions, `response_locked`, phase FROZEN readbacks |
| Common-ground evaluation | one exact frozen revision | `evaluate_common_ground` | write | bounded Studio status | 5 | no resubmit | 1 | 1 | 7 | 1 | FINALIZED, semantic success, DONE or bounded UNRESOLVED readback |
| Retry path | only if first live evaluation is UNRESOLVED and cooldown is satisfied | `retry_negotiation` | write | bounded Studio status | 5 | at most one unique retry in minimum matrix | 1 | 1 | 7 | 1 | accepted-attempt increment and terminal/readback agreement |

Planned baseline is 7 transactions including deployment; maximum is 8 only when the evidenced first evaluation is `UNRESOLVED`. No write is replayed for measurement. Each later transition starts only after the prior hash, terminal semantic result, and authoritative readback are verified.
