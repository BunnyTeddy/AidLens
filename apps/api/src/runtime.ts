import { LiveZeroGComputeAdapter, PreviewComputeAdapter, VerifiedReplayComputeAdapter } from './adapters/compute.js'
import { MemoryStorageAdapter, ZeroGStorageAdapter } from './adapters/storage.js'
import type { AppConfig } from './config.js'
import { LiveAssessmentAuthorizer, PreviewAssessmentAuthorizer } from './contract.js'
import { decryptEvidenceEnvelope } from './lib/encryption.js'

export function createRuntime(config: AppConfig) {
  const storage = config.ZERO_G_SERVICE_PRIVATE_KEY
    ? new ZeroGStorageAdapter(
        config.ZERO_G_STORAGE_INDEXER,
        config.ZERO_G_RPC_URL,
        config.ZERO_G_SERVICE_PRIVATE_KEY,
      )
    : new MemoryStorageAdapter()

  const compute = config.ZERO_G_COMPUTE_API_KEY && config.ZERO_G_SERVICE_PRIVATE_KEY
    ? new LiveZeroGComputeAdapter({
        apiKey: config.ZERO_G_COMPUTE_API_KEY,
        baseUrl: config.ZERO_G_COMPUTE_BASE_URL,
        visionModel: config.ZERO_G_VISION_MODEL,
        audioModel: config.ZERO_G_AUDIO_MODEL,
        mainnetRpcUrl: config.ZERO_G_MAINNET_RPC_URL,
        verifierPrivateKey: config.ZERO_G_SERVICE_PRIVATE_KEY,
      })
    : config.VERIFIED_REPLAY_MANIFEST
      ? new VerifiedReplayComputeAdapter(config.VERIFIED_REPLAY_MANIFEST)
      : new PreviewComputeAdapter()

  const authorizer = config.RELIEF_FUND_ADDRESS
    ? new LiveAssessmentAuthorizer(
        config.ZERO_G_RPC_URL,
        config.RELIEF_FUND_ADDRESS as `0x${string}`,
      )
    : new PreviewAssessmentAuthorizer(config.DEMO_REVIEWER_ADDRESS)

  const decryptEvidence = config.NGO_ENCRYPTION_PRIVATE_KEY
    ? (stored: unknown) => decryptEvidenceEnvelope(stored, config.NGO_ENCRYPTION_PRIVATE_KEY as string)
    : undefined

  return {
    storage,
    compute,
    authorizer,
    ...(decryptEvidence ? { decryptEvidence } : {}),
  }
}
