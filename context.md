# AidLens project context

Last updated: 2026-06-22, Asia/Ho_Chi_Minh.

This file is the team handoff. It captures what was built, what is live, what was tested, what changed during smoke testing, and what must not be overstated in the pitch.

## 1. Product summary

AidLens is a synthetic flood-relief demo for Central Vietnam.

The intended three-minute story is:

```text
claimant submit
→ 0G Storage evidence roots
→ 0G Compute TEE assessment
→ NGO human approval
→ payout on 0G Galileo testnet
→ public redacted receipt
```

The product is English-first and mobile-first. Visual direction is emergency operations center: navy / teal / coral, Central Vietnam map, clear verification states.

This is not a real relief system, not insurance, not fraud detection, and not a real-world damage assessor. Use only synthetic data.

## 2. Current workspace

Workspace root:

```text
/Volumes/Kingston/0G hack
```

Monorepo:

```text
apps/web     React 19 + Vite + TypeScript + Tailwind/shadcn + wagmi + MapLibre
apps/api     Fastify + Zod + 0G Storage SDK + 0G Compute SDK + raw Router HTTP
contracts    Foundry + Solidity 0.8.24, EVM Cancun
```

Important files:

```text
README.md
context.md
.env.example
.env                         local only, gitignored, contains secrets
package.json
pnpm-workspace.yaml
railway.json
scripts/generate-encryption-keys.mjs

apps/web/src/pages/claim-page.tsx
apps/web/src/pages/claim-detail-page.tsx
apps/web/src/pages/ngo-page.tsx
apps/web/src/pages/transparency-page.tsx
apps/web/src/lib/config.ts
apps/web/src/lib/evidence.ts
apps/web/src/lib/encryption.ts
apps/web/src/lib/contract.ts

apps/api/src/app.ts
apps/api/src/adapters/storage.ts
apps/api/src/adapters/compute.ts
apps/api/src/auth.ts
apps/api/src/contract.ts
apps/api/src/config.ts
apps/api/src/runtime.ts
apps/api/src/schemas.ts
apps/api/src/lib/encryption.ts

contracts/src/AidLensReliefFund.sol
contracts/script/Deploy.s.sol
contracts/test/AidLensReliefFund.t.sol
```

## 3. Local services

Current dev command:

```bash
pnpm dev
```

Expected URLs:

```text
web  http://localhost:5173
api  http://localhost:8787
```

Current status check returned:

```json
{
  "mode": "live",
  "chain": {
    "network": "0G Galileo testnet",
    "rpcConfigured": true,
    "contractConfigured": true
  },
  "storage": {
    "network": "0G Galileo Turbo testnet",
    "available": true,
    "encryptedAtRest": true,
    "clientSideEncryptionReady": true
  },
  "compute": {
    "available": true,
    "visionModel": "qwen3-vl-30b",
    "audioModel": "whisper-large-v3",
    "detail": "Both configured mainnet models are healthy."
  }
}
```

Command:

```bash
curl -s http://localhost:8787/v1/0g/status | jq
```

The web server also returned HTTP `200` on `http://localhost:5173/`.

## 4. Environment and secrets

Do not commit `.env`. It is gitignored.

The local `.env` currently contains:

- a 0G Compute Router API key;
- a service wallet private key;
- generated NGO encryption keys;
- the deployed contract address.

Do not paste the actual key values into README, commits, slides, or Discord. The keys were shared during rapid hackathon setup, so rotate the Compute API key and service wallet before anything public or reusable.

Important variables:

```text
VITE_API_URL
VITE_0G_CHAIN_ID
VITE_0G_RPC_URL
VITE_RELIEF_FUND_ADDRESS
VITE_NGO_ENCRYPTION_PUBLIC_KEY

ZERO_G_COMPUTE_API_KEY
ZERO_G_COMPUTE_BASE_URL
ZERO_G_VISION_MODEL
ZERO_G_AUDIO_MODEL
ZERO_G_RPC_URL
ZERO_G_MAINNET_RPC_URL
ZERO_G_STORAGE_INDEXER
ZERO_G_SERVICE_PRIVATE_KEY
RELIEF_FUND_ADDRESS
NGO_ENCRYPTION_PRIVATE_KEY
WEB_ORIGIN
```

Current public values:

```text
ZERO_G_COMPUTE_BASE_URL=https://router-api.0g.ai/v1
ZERO_G_VISION_MODEL=qwen3-vl-30b
ZERO_G_AUDIO_MODEL=whisper-large-v3
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_MAINNET_RPC_URL=https://evmrpc.0g.ai
ZERO_G_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
RELIEF_FUND_ADDRESS=0x066664cE141ccb20e77bb37ca55E1311254a3780
VITE_RELIEF_FUND_ADDRESS=0x066664cE141ccb20e77bb37ca55E1311254a3780
```

## 5. Live contract

Contract:

```text
AidLensReliefFund
0x066664cE141ccb20e77bb37ca55E1311254a3780
```

Links:

- Contract: https://chainscan-galileo.0g.ai/address/0x066664cE141ccb20e77bb37ca55E1311254a3780
- Deploy tx: https://chainscan-galileo.0g.ai/tx/0x1dcbc785698cf266f58c3d2f2392c7547195a4a22230f330fe6621bb758b660b

Admin / assessor / reviewer wallet:

```text
0x93FD8424a35C6590afF85Fa59dC4289aA44B0568
```

The constructor gave this wallet:

- `DEFAULT_ADMIN_ROLE`
- `ASSESSOR_ROLE`
- `REVIEWER_ROLE`

Current contract balances after smoke:

```text
totalDonated = 1.0 0G
totalPaid    = 0.1 0G
balance      = 0.9 0G
```

The service wallet balance after smoke was about:

```text
0.682815647993285142 0G
```

These balances will change if anyone donates, submits, assesses, or pays again.

## 6. Contract interface

Status enum:

```text
0 Submitted
1 Assessed
2 NeedsInfo
3 Paid
4 Rejected
5 Cancelled
```

Main methods:

```solidity
donate()
submitClaim(evidenceRoot, publicRoot, districtCode)
replaceEvidence(claimId, evidenceRoot)
recordAssessment(claimId, assessmentRoot, receiptHash, severity, recommendedAmount)
requestMoreInfo(claimId, noteHash)
approveAndPay(claimId, amount, reviewNoteHash)
rejectClaim(claimId, reasonHash)
cancelClaim(claimId)
```

Safety behavior:

- duplicate evidence roots are blocked;
- invalid state transitions revert;
- payout cap defaults to `12 0G`;
- payout amount must be nonzero and under cap;
- override payout requires a nonzero review note hash;
- double payout is blocked by state;
- state changes happen before native token transfer;
- reentrancy guard is present;
- failed transfer reverts.

Foundry tests cover role enforcement, state transitions, payout cap, insufficient balance, duplicate root, double payout, reentrancy, failed transfer, request-info, and replacement.

## 7. Live smoke claim #1

This claim is synthetic and was created through CLI/API, not through the browser wizard.

Claim id:

```text
1
```

Claimant:

```text
0x93FD8424a35C6590afF85Fa59dC4289aA44B0568
```

District:

```text
501
Quang Nam / Synthetic smoke
```

Evidence:

```text
evidenceRoot = 0xc96feef58581f28b61c44f67d72714d68bdf73851f9b3bf1f3e1787010729a71
publicRoot   = 0x462c4041f43eab7b533daa9c9cc5ca06d56990f08c9fb68bb221e11e15ad835f
```

Storage txs:

```text
private evidence tx = 0x1c05b390c474b0052522b6bbff18c3a8841f5b871aeb02ff6b17f39a9d6d7431
public metadata tx  = 0xaf2156ee44697a828a5f00b15cb1bd71ce5d4feec49edf2e7035e57cf6b6a9c0
```

Submit tx:

```text
0x63db31e39813d806e26d8b15dd8993de78982ad98df4d952e477a8e6687ae484
https://chainscan-galileo.0g.ai/tx/0x63db31e39813d806e26d8b15dd8993de78982ad98df4d952e477a8e6687ae484
```

Assessment:

```text
severity        = 4
urgency         = high
recommendation  = 8 0G
teeVerified     = true
verification    = router-verified
independent SDK = null / unavailable for selected provider signature endpoint
assessmentRoot  = 0x4231a0b215f99c248c31b9eb0ad53dd5b4ee16bf57ed8250aaa56cdb4c826f52
receiptHash     = 0x6c539eb9846174edccfe726541e0262b0fcffa4a06f6162c26bcf410c8b34ddf
```

Assessment tx:

```text
0xe792f0586ed06e7ced40ea319b9b93cc4d00f34f51944bcaf7efe06281e4f881
https://chainscan-galileo.0g.ai/tx/0xe792f0586ed06e7ced40ea319b9b93cc4d00f34f51944bcaf7efe06281e4f881
```

Payout:

```text
policy recommendation = 8 0G
actual smoke payout   = 0.1 0G
reason                = limited funded smoke test, reviewer override hash required
status after payout   = Paid, enum value 3
```

Payout tx:

```text
0xb946495f8bd0ce7c316fdbddda57790aface34c70742a558e56d2030b02eeb83
https://chainscan-galileo.0g.ai/tx/0xb946495f8bd0ce7c316fdbddda57790aface34c70742a558e56d2030b02eeb83
```

Read claim #1:

```bash
set -a
source .env
set +a
cast call "$RELIEF_FUND_ADDRESS" \
  'getClaim(uint256)((address,bytes32,bytes32,bytes32,bytes32,uint96,uint96,uint64,uint64,uint16,uint8,uint8))' \
  1 \
  --rpc-url "$ZERO_G_RPC_URL"
```

Expected important fields:

```text
recommendedAmount = 8000000000000000000
paidAmount        = 100000000000000000
severity          = 4
status            = 3
```

## 8. API behavior

Routes:

```text
GET  /health
GET  /v1/0g/status
POST /v1/evidence
POST /v1/assessments
```

`POST /v1/evidence`:

- accepts multipart;
- requires wallet signature over canonical manifest hash;
- validates MIME and magic bytes for plaintext uploads;
- accepts client-encrypted envelopes;
- enforces 1-3 images, max one audio file, 12 MB total, audio max 60 seconds;
- uploads private evidence and public metadata to 0G Storage.

`POST /v1/assessments`:

- requires signed assessor request;
- live authorizer checks `ASSESSOR_ROLE` and evidence root match onchain;
- downloads private evidence from 0G Storage;
- decrypts client-sealed evidence if present;
- runs 0G Compute;
- uploads private and public assessments to Storage;
- returns `onchainPayload` only if payable.

## 9. Compute and verification

Current pipeline:

```text
optional Whisper transcription
→ Qwen3-VL image + intake assessment
→ normalize model JSON
→ policy maps severity to payout amount
→ build AssessmentV1
→ upload assessment
→ record assessment onchain
```

Models:

```text
whisper-large-v3
qwen3-vl-30b
```

Verification truth:

- Router request sets `verify_tee=true`.
- The Router returns `x_0g_trace.tee_verified`.
- If `tee_verified=true`, the current code treats the run as TEE-positive.
- The API attempts `broker.inference.processResponse(provider, chatID)` and records the result.
- During smoke, the provider signature endpoint returned `chat_id_not_found` / `getting signature error`, so independent SDK verification did not complete.
- The assessment flags include a warning when this happens.

Do not say “independently SDK-verified” for the smoke claim. Say:

```text
0G Router returned TEE verified=true; AidLens attempted independent SDK verification and recorded that the provider signature endpoint was unavailable for this run.
```

Official docs used for this trust boundary:

- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference

## 10. Privacy model

Public contract stores:

- claimant address;
- evidence root;
- public metadata root;
- assessment root;
- receipt hash;
- severity;
- recommended amount;
- paid amount;
- status;
- district code.

Public outputs must not include:

- original images;
- original audio;
- transcript;
- narration;
- exact GPS;
- health data;
- encryption keys.

Private evidence path:

1. Browser can client-encrypt using AES-256-GCM.
2. Content key is sealed for the NGO worker using ECDH P-256 + HKDF.
3. API decrypts only in memory before Compute.
4. Private Storage upload uses ECIES encryption.

Snapshot fallback path:

1. Browser sends plaintext over TLS.
2. API keeps plaintext in memory only.
3. API encrypts private evidence at Storage upload.

Do not claim the whole backend is inside a TEE. The TEE proof covers inference.

## 11. Important implementation fixes from live smoke

These fixes are already applied:

1. Sequential Storage uploads in `apps/api/src/app.ts`.
   - Reason: private/public uploads from the same service wallet were racing nonces.
   - Symptom: `replacement transaction underpriced`.

2. Public Storage uploads do not require finality in `apps/api/src/adapters/storage.ts`.
   - Reason: public metadata/assessment roots are receipt artifacts and StorageScan indexing can lag.
   - Private uploads still wait for finality because the worker must read evidence back.

3. Model JSON normalization in `apps/api/src/adapters/compute.ts`.
   - Reason: JSON mode still returned values like string confidence or non-enum urgency.
   - Normalization maps reasonable variants before Zod validation.

4. Router-verified fallback in `apps/api/src/adapters/compute.ts`.
   - Reason: Router verified TEE but the provider signature endpoint did not expose a usable chat signature for SDK `processResponse`.
   - Receipt records `verificationSource`, `routerTeeVerified`, `independentTeeVerified`, and optional `verificationError`.

## 12. UI status and gotchas

Pages:

```text
/claim
/claim/:id
/ngo
/transparency
```

Important gotcha:

- `/transparency` reads live contract totals.
- `/claim/:id` and `/ngo` still rely partly on browser `sessionStorage` for private per-claim evidence details.
- The successful smoke claim #1 was created by CLI/API, so it will not automatically hydrate all UI detail cards.
- For the clean UI demo, submit a fresh claim through `/claim` in the same browser session. The browser waits for `ClaimSubmitted`, stores the real onchain claim id, then `/ngo` uses that id for assessment and review actions.
- Claim #1 is already `Paid`; trying to assess or pay claim #1 again will revert due to contract state.

In-app browser note:

- During Codex automation, opening a new in-app browser tab crashed once with “This page crashed.”
- Direct HTTP check for the app still returned `200`.
- If the embedded browser is blank, reload `http://localhost:5173/`.

## 13. Running another full demo

Before starting:

```bash
curl -s http://localhost:8787/v1/0g/status | jq
```

Confirm:

- `mode` is `live`;
- contract is configured;
- Storage is live;
- Compute models are healthy;
- contract has enough testnet 0G.

If you want a policy-sized payout, top up the contract with more than the expected recommendation. For severity 4, policy recommends `8 0G`. The current contract balance is only `0.9 0G`.

UI path:

1. Open `http://localhost:5173/claim`.
2. Connect wallet on Galileo.
3. Submit synthetic claim with 1-3 images.
4. Keep the same browser session.
5. Open `/ngo`.
6. Connect assessor/reviewer wallet with roles.
7. Run 0G assessment.
8. Record verified assessment.
9. Approve and pay.
10. Open `/transparency` and ChainScan links.

CLI/API path:

- Use the patterns from the smoke scripts in the terminal history.
- Do not print private keys.
- Sign evidence manifest and assessment auth messages with the service/admin wallet.
- Submit claim onchain with `submitClaim`.
- Call `/v1/assessments`.
- Record `onchainPayload`.
- Pay using `approveAndPay`.

## 14. Verification commands

Check status:

```bash
curl -s http://localhost:8787/v1/0g/status | jq
```

Check balances:

```bash
set -a
source .env
set +a
cast balance "$RELIEF_FUND_ADDRESS" --rpc-url "$ZERO_G_RPC_URL" --ether
cast balance "$(cast wallet address --private-key "$ZERO_G_SERVICE_PRIVATE_KEY")" --rpc-url "$ZERO_G_RPC_URL" --ether
```

Check totals:

```bash
cast call "$RELIEF_FUND_ADDRESS" 'totalDonated()(uint256)' --rpc-url "$ZERO_G_RPC_URL"
cast call "$RELIEF_FUND_ADDRESS" 'totalPaid()(uint256)' --rpc-url "$ZERO_G_RPC_URL"
cast call "$RELIEF_FUND_ADDRESS" 'claimCount()(uint256)' --rpc-url "$ZERO_G_RPC_URL"
```

Check roles:

```bash
admin=$(cast wallet address --private-key "$ZERO_G_SERVICE_PRIVATE_KEY")
assessor=$(cast keccak 'ASSESSOR_ROLE')
reviewer=$(cast keccak 'REVIEWER_ROLE')
cast call "$RELIEF_FUND_ADDRESS" 'hasRole(bytes32,address)(bool)' "$assessor" "$admin" --rpc-url "$ZERO_G_RPC_URL"
cast call "$RELIEF_FUND_ADDRESS" 'hasRole(bytes32,address)(bool)' "$reviewer" "$admin" --rpc-url "$ZERO_G_RPC_URL"
```

## 15. Tests and build status

Verified during implementation:

```bash
pnpm typecheck
pnpm --filter @aidlens/web lint
pnpm --filter @aidlens/api test
pnpm test
pnpm build
forge test --root contracts
```

Recent focused checks after live-smoke patches:

```bash
pnpm --filter @aidlens/api typecheck
pnpm --filter @aidlens/api test
```

Both passed after the latest docs/trust-boundary patches.

## 16. Deployment notes

Web:

- Vercel project root: `apps/web`
- build command: `pnpm build`
- output: `dist`
- set only `VITE_*` values in Vercel

API:

- Railway from repo root
- `railway.json` uses `apps/api/Dockerfile`
- set server secrets in Railway
- do not expose server secrets to Vite

Contract:

```bash
cd contracts
set -a
source ../.env
set +a
export DEPLOYER_PRIVATE_KEY="$ZERO_G_SERVICE_PRIVATE_KEY"
export AIDLENS_ADMIN_ADDRESS=$(cast wallet address --private-key "$ZERO_G_SERVICE_PRIVATE_KEY")
forge script script/Deploy.s.sol:DeployAidLens --rpc-url "$ZERO_G_RPC_URL" --broadcast
```

After redeploy:

1. update `RELIEF_FUND_ADDRESS`;
2. update `VITE_RELIEF_FUND_ADDRESS`;
3. restart `pnpm dev` / redeploy web and API;
4. fund the contract;
5. grant roles if using separate wallets.

## 17. Pitch-safe wording

Safe:

```text
AidLens stores private synthetic evidence on 0G Storage, runs a 0G Compute Router request with verify_tee=true, records a redacted assessment root and receipt hash on Galileo, and requires a human NGO wallet to approve payout.
```

Safe:

```text
The smoke run was Router TEE-verified. The API also attempted independent SDK verification and recorded that the provider signature endpoint was unavailable for that run.
```

Do not say:

```text
The whole backend is inside a TEE.
```

Do not say:

```text
This detects fraud or determines real disaster compensation.
```

Do not say for the current smoke:

```text
Independent processResponse verification succeeded.
```

## 18. Highest-priority next steps

1. Run a fresh browser-submitted claim end-to-end after topping up the contract.
2. Add a minimal event indexer/read path so `/claim/:id` and `/ngo` can load CLI-created or cross-browser claims without sessionStorage.
3. Add a “demo fixture import” button or script to hydrate sessionStorage for a known live claim.
4. Investigate provider signature endpoint / Router + Direct mismatch so independent SDK `processResponse` succeeds, or update the plan to explicitly rely on Router verification.
5. Verify contract source on ChainScan if the explorer supports it.
6. Produce final video using only synthetic evidence and the links above.
