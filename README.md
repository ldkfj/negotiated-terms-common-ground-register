# Common Ground Register

Common Ground Register lets two identified wallets independently submit and freeze keyed offers, then asks GenLayer validators to classify the meaning of matching keys. A deterministic reducer records full, partial, or no textual common ground while preserving every revision.

It does not sign or execute an agreement, determine legality, select a winner, or verify external facts.

## Product flow

1. Party A creates a negotiation naming Party B. Creation contains identities only.
2. Each party writes and freezes only its own complete public offer.
3. Once both offers are frozen, anyone may request the semantic comparison.
4. Matching keys receive `EQUIVALENT`, `DIFFERENT`, or `UNKNOWN`; one-sided keys remain disputed.
5. Every successful mutation is available through exact historical revision readback.

## Local verification

```powershell
$env:PYTHONIOENCODING='utf-8'
genvm-lint check contracts/main.py --json
genvm-lint schema contracts/main.py --output contract-schema.json
python -m pytest tests/test_contract.py -q -p no:cacheprovider
wsl.exe -e bash -lc "cd /mnt/e/Genlayer-Projects/negotiated-terms-common-ground-register && GENVM_VERSION=v0.6.0-rc5 /mnt/e/Genlayer-Tools/studio-next-toolchain/.wsl-venv/bin/python -m pytest tests/test_direct_runtime.py -q"
npm --prefix frontend test
npm --prefix frontend run build
```

Copy `frontend/.env.example` to `frontend/.env.local` only after a verified deployment and fill in that deployment's public network values. Never place wallet secrets in frontend environment variables.

## Public-data boundary

All submitted text is public and permanent. Use public or synthetic material only; never include personal records, credentials, private links, or secrets.
