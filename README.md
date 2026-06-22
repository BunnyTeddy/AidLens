# AidLens

AidLens is an English-first, mobile-first synthetic flood-relief workflow for the 0G Zero Cup. A claimant submits private evidence, 0G Compute triages observable damage, an NGO reviewer makes the final decision, and donors can inspect redacted onchain receipts.

> Hackathon prototype only. All claims, images, narratives, locations, and metrics are synthetic unless explicitly labelled as live onchain artifacts. AidLens is not a production relief, insurance, fraud-detection, or damage-assessment system.

## Current live demo snapshot

Last updated: 2026-06-22.

- App: `http://localhost:5173`
- API: `http://localhost:8787`
- API mode: `live`
- Chain: 0G Galileo testnet, chain id `16602`
- Storage: 0G Galileo Turbo testnet
- Compute: 0G Compute Router mainnet
- Vision model: `qwen3-vl-30b`
- Audio model: `whisper-large-v3`
- Contract: [`0x066664cE141ccb20e77bb37ca55E1311254a3780`](https://chainscan-galileo.0g.ai/address/0x066664cE141ccb20e77bb37ca55E1311254a3780)
- Deploy tx: [`0x1dcbc785698cf266f58c3d2f2392c7547195a4a22230f330fe6621bb758b660b`](https://chainscan-galileo.0g.ai/tx/0x1dcbc785698cf266f58c3d2f2392c7547195a4a22230f330fe6621bb758b660b)
- Admin / assessor / reviewer wallet: `0x93FD8424a35C6590afF85Fa59dC4289aA44B0568`

Live smoke claim #1 completed successfully:

- Evidence root: `0xc96feef58581f28b61c44f67d72714d68bdf73851f9b3bf1f3e1787010729a71`
- Public metadata root: `0x462c4041f43eab7b533daa9c9cc5ca06d56990f08c9fb68bb221e11e15ad835f`
- Submit tx: [`0x63db31e39813d806e26d8b15dd8993de78982ad98df4d952e477a8e6687ae484`](https://chainscan-galileo.0g.ai/tx/0x63db31e39813d806e26d8b15dd8993de78982ad98df4d952e477a8e6687ae484)
- Assessment root: `0x4231a0b215f99c248c31b9eb0ad53dd5b4ee16bf57ed8250aaa56cdb4c826f52`
- Receipt hash: `0x6c539eb9846174edccfe726541e0262b0fcffa4a06f6162c26bcf410c8b34ddf`
- Assessment tx: [`0xe792f0586ed06e7ced40ea319b9b93cc4d00f34f51944bcaf7efe06281e4f881`](https://chainscan-galileo.0g.ai/tx/0xe792f0586ed06e7ced40ea319b9b93cc4d00f34f51944bcaf7efe06281e4f881)
- Payout tx: [`0xb946495f8bd0ce7c316fdbddda57790aface34c70742a558e56d2030b02eeb83`](https://chainscan-galileo.0g.ai/tx/0xb946495f8bd0ce7c316fdbddda57790aface34c70742a558e56d2030b02eeb83)
- Severity: `4`
- Policy recommendation: `8 0G`
- Smoke payout: `0.1 0G` with reviewer override reason hash, because the contract was funded with `1 0G`
- Contract totals after smoke: donated `1 0G`, paid `0.1 0G`, balance `0.9 0G`

Full handoff details are in [context.md](</Volumes/Kingston/0G hack/context.md>).

## Demo flow

1. Donor funds `AidLensReliefFund` with testnet 0G.
2. Claimant signs an expiring evidence manifest and submits one to three resized images plus an optional 60-second voice report.
3. Private evidence is stored on 0G Storage; only redacted district-level metadata is public.
4. Whisper transcribes audio and Qwen3-VL assesses the claim through 0G Compute Router with `verify_tee=true`.
5. The Router synchronously validates the provider TEE signature and returns `x_0g_trace.tee_verified`; the API also attempts independent SDK verification with `processResponse(provider, chatID)` and stores the verification source/error in the receipt.
6. Policy code, not the model, maps severity 1-5 to `1 / 3 / 5 / 8 / 12` 0G.
7. An NGO assessor records the verified result; an NGO reviewer may then approve and sign the native-token payout.
8. `/claim/:id` and `/transparency` expose redacted roots and ChainScan/StorageScan links.

Preview mode is deliberately non-payable and never displays a fake TEE badge.

## Repository

```text
apps/web     React 19 + Vite + TypeScript + Tailwind/shadcn + wagmi + MapLibre
apps/api     Fastify + Zod + 0G Storage SDK + 0G Compute SDK + raw Router requests
contracts    Solidity 0.8.24 + Foundry, EVM Cancun
```

The contract is the source of claim and treasury state. Evidence and assessments live on 0G Storage. There is no database.

## Run locally

Requirements: Node 22+, pnpm 10+, and Foundry.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:8787`.

With no secrets, the API uses in-memory Storage and deterministic synthetic assessment. That mode is useful for UI work but cannot produce an onchain assessment or payout.

Run checks:

```bash
pnpm typecheck
pnpm --filter @aidlens/web lint
pnpm test
pnpm build
```

Check live service status:

```bash
curl -s http://localhost:8787/v1/0g/status | jq
```

## Live 0G configuration

Never commit `.env`. The current `.env` is local-only and gitignored. Rotate the Compute API key and service wallet after public demos because they were handled during rapid hackathon setup.

Server variables:

- `ZERO_G_COMPUTE_API_KEY`: funded 0G Compute Router mainnet API key.
- `ZERO_G_COMPUTE_BASE_URL`: `https://router-api.0g.ai/v1`
- `ZERO_G_VISION_MODEL`: `qwen3-vl-30b`
- `ZERO_G_AUDIO_MODEL`: `whisper-large-v3`
- `ZERO_G_RPC_URL`: `https://evmrpc-testnet.0g.ai`
- `ZERO_G_MAINNET_RPC_URL`: `https://evmrpc.0g.ai`
- `ZERO_G_STORAGE_INDEXER`: `https://indexer-storage-testnet-turbo.0g.ai`
- `ZERO_G_SERVICE_PRIVATE_KEY`: funded service wallet for Storage, contract admin/reviewer in the current snapshot, and SDK verification attempts.
- `RELIEF_FUND_ADDRESS`: deployed Galileo contract.
- `NGO_ENCRYPTION_PRIVATE_KEY`: server-only P-256 private key for decrypting client-sealed evidence.
- `WEB_ORIGIN`: exact web origin for CORS.

Web variables:

- `VITE_API_URL`
- `VITE_0G_CHAIN_ID`
- `VITE_0G_RPC_URL`
- `VITE_RELIEF_FUND_ADDRESS`
- `VITE_NGO_ENCRYPTION_PUBLIC_KEY`

Generate browser encryption keys:

```bash
pnpm keys:encryption
```

The browser encrypts intake and evidence using AES-256-GCM, derives a wrapping key with ephemeral ECDH P-256 + HKDF, and seals the content key for the NGO worker. The worker decrypts only in memory immediately before the 0G inference request.

If the public key is not configured, AidLens uses the snapshot path: plaintext arrives over TLS and the service encrypts it with ECIES before the 0G Storage upload. The UI labels which path is active.

## Deploy the contract

From `contracts/`:

```bash
set -a
source ../.env
set +a
export DEPLOYER_PRIVATE_KEY="$ZERO_G_SERVICE_PRIVATE_KEY"
export AIDLENS_ADMIN_ADDRESS=$(cast wallet address --private-key "$ZERO_G_SERVICE_PRIVATE_KEY")
forge script script/Deploy.s.sol:DeployAidLens --rpc-url "$ZERO_G_RPC_URL" --broadcast
```

The admin initially receives admin, assessor, and reviewer roles. The default payout cap is `12 0G`. For a public demo, either fund the contract above the policy recommendation or use a reviewer override with a reason hash.

## API

- `GET /health`
- `GET /v1/0g/status`
- `POST /v1/evidence`: multipart upload with wallet signature; validates MIME/signature/size; uploads private evidence and public metadata to 0G Storage.
- `POST /v1/assessments`: assessor-signed request; downloads/decrypts evidence, runs 0G Compute, uploads assessment, and returns an onchain payload if payable.

Privacy guardrails:

- API does not intentionally log evidence, transcript, precise GPS, base64 payloads, signatures, or encryption keys.
- Public contract and public assessment exclude original images, audio, transcript, narration, precise GPS, health data, and keys.

## Contract

`AidLensReliefFund` exposes:

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

Roles:

- `DEFAULT_ADMIN_ROLE`
- `ASSESSOR_ROLE`
- `REVIEWER_ROLE`

Status enum:

```text
0 Submitted
1 Assessed
2 NeedsInfo
3 Paid
4 Rejected
5 Cancelled
```

Safety checks include role enforcement, state transitions, payout cap, duplicate evidence roots, double-payout prevention, insufficient-balance checks, checks-effects-interactions, and a reentrancy guard.

## Privacy and trust boundary

0G TEE attestation proves model inference. In Router mode, `tee_verified=true` means the 0G Router says it verified the provider signature; AidLens also records whether independent SDK verification succeeded. It does not prove that the browser, API, wallet, or entire backend runs inside a TEE.

Current smoke test note: the Router returned `tee_verified=true`; the SDK `processResponse(provider, chatID)` attempt could not fetch a public signature from the selected provider endpoint and returned `getting signature error` / `chat_id_not_found`. The receipt therefore records `verificationSource: "router-verified"` and `independentTeeVerified: null`. Do not pitch this as an independent SDK-verified run unless that later succeeds.

Human reviewers remain responsible for every decision and payout.

## Known demo gotchas

- Existing smoke claim #1 is already `Paid`. Use a new claim for another end-to-end demo.
- The smoke claim was submitted by CLI/API using the admin wallet, not through browser session storage. `/transparency` reads live totals from the contract, but `/claim/:id` and `/ngo` still use browser `sessionStorage` for private per-claim evidence details.
- For the UI-driven demo, submit a fresh claim through `/claim` in the browser. The app now waits for the `ClaimSubmitted` receipt, stores the real onchain claim id, and opens `/ngo` against that claim from the same browser session.
- The current contract balance is `0.9 0G`, not enough for an `8 0G` policy payout. Top up the contract or override the payout amount with a reason hash.
- Public 0G Storage indexing can lag. Private uploads wait for finality so the worker can read evidence; public metadata/assessment uploads return faster and may appear on explorers later.
- The Codex in-app browser automation tab crashed once during verification, but the web server itself returned HTTP `200`. Reload the app manually if the embedded browser looks blank.

## Deploy web and API

- Vercel: use `apps/web` as the project root, build command `pnpm build`, output `dist`, then set only `VITE_*` variables.
- Railway: deploy from the repository root; `railway.json` uses `apps/api/Dockerfile`. Set server secrets in Railway and never expose them to Vite.

## Final-lock checklist

- Run all checks: typecheck, lint, API tests, Foundry tests, build.
- Confirm `/v1/0g/status` is `live`.
- Confirm contract has enough testnet 0G for the planned payout.
- Submit a fresh synthetic claim through `/claim`.
- Verify private evidence root and public root.
- Run assessment from `/ngo`; record assessment only if TEE verification is positive.
- Approve payout with NGO wallet.
- Save ChainScan links, Storage roots, receipt hash, assessment root, and final balances.
- Label all synthetic data and any replay clearly.

## Useful references

- [0G Router overview](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview)
- [0G Router verifiable execution](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution)
- [0G Direct inference and `processResponse`](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference)
