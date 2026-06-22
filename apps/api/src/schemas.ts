import { z } from 'zod'

export const urgencySchema = z.enum(['low', 'moderate', 'high', 'critical'])

export const intakeSchema = z.object({
  districtCode: z.number().int().min(1).max(9999),
  districtName: z.string().min(2).max(80),
  householdSize: z.number().int().min(1).max(20),
  displaced: z.boolean(),
  narration: z.string().max(2_000).default(''),
  approximateLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyMeters: z.number().int().positive().max(50_000),
    })
    .optional(),
  audioDurationSeconds: z.number().min(0).max(60).optional(),
  capturedAt: z.string().datetime(),
  consentVersion: z.literal('2026-06-22'),
  syntheticDemo: z.boolean(),
})

export type ClaimIntake = z.infer<typeof intakeSchema>

const base64Schema = z.string().min(1).max(20 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/)

export const publicEvidenceMetadataSchema = z.object({
  districtCode: z.number().int().min(1).max(9999),
  districtName: z.string().min(2).max(80),
  householdSize: z.number().int().min(1).max(20),
  displaced: z.boolean(),
  capturedAt: z.string().datetime(),
  syntheticDemo: z.boolean(),
})

export const encryptedEvidenceEnvelopeSchema = z.object({
  version: z.literal(2),
  encryption: z.object({
    algorithm: z.literal('AES-256-GCM+ECDH-P256'),
    ephemeralPublicKey: base64Schema,
    wrapIv: base64Schema,
    wrapSalt: base64Schema,
    wrappedKey: base64Schema,
  }),
  publicMetadata: publicEvidenceMetadataSchema,
  intake: z.object({ iv: base64Schema, ciphertext: base64Schema }),
  files: z.array(z.object({
    field: z.enum(['image', 'audio']),
    filename: z.string().min(1).max(120),
    mimeType: z.string().min(1).max(100),
    originalSize: z.number().int().positive().max(12 * 1024 * 1024),
    plaintextSha256: z.string().regex(/^0x[0-9a-f]{64}$/),
    iv: base64Schema,
    ciphertext: base64Schema,
  })).min(1).max(4),
})

export type EncryptedEvidenceEnvelope = z.infer<typeof encryptedEvidenceEnvelopeSchema>

export const fileManifestEntrySchema = z.object({
  field: z.enum(['image', 'audio']),
  filename: z.string().min(1).max(120),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().max(12 * 1024 * 1024),
  sha256: z.string().regex(/^0x[0-9a-f]{64}$/),
})

export const uploadAuthorizationSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[a-zA-Z0-9_-]{16,96}$/),
  expiresAt: z.string().datetime(),
  manifestHash: z.string().regex(/^0x[0-9a-f]{64}$/),
})

export type UploadAuthorization = z.infer<typeof uploadAuthorizationSchema>

export const routerTraceSchema = z.object({
  request_id: z.string(),
  provider: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  billing: z
    .object({
      input_cost: z.string().optional(),
      output_cost: z.string().optional(),
      total_cost: z.string().optional(),
    })
    .optional(),
  tee_verified: z.boolean().nullable().optional(),
})

export const modelAssessmentSchema = z.object({
  severity: z.number().int().min(1).max(5),
  urgency: urgencySchema,
  evidenceConsistency: z.object({
    score: z.number().int().min(0).max(100),
    rationale: z.string().min(1).max(600),
  }),
  observations: z
    .array(
      z.object({
        source: z.string().min(1).max(80),
        finding: z.string().min(1).max(400),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(8),
  flags: z.array(z.string().min(1).max(200)).max(8),
  rationale: z.string().min(1).max(1_000),
})

export const assessmentRequestSchema = z.object({
  claimId: z.number().int().positive(),
  evidenceRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  reviewerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[a-zA-Z0-9_-]{16,96}$/),
  expiresAt: z.string().datetime(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>

export interface EvidenceFile {
  field: 'image' | 'audio'
  filename: string
  mimeType: string
  dataBase64: string
  sha256: `0x${string}`
}

export interface EvidenceBundle {
  version: 1
  claimant: string
  intake: ClaimIntake
  files: EvidenceFile[]
  receivedAt: string
}

export interface AssessmentV1 {
  version: 1
  claimId: number
  severity: number
  urgency: z.infer<typeof urgencySchema>
  evidenceConsistency: { score: number; rationale: string }
  observations: Array<{ source: string; finding: string; confidence: number }>
  flags: string[]
  rationale: string
  recommendedPayoutOg: number
  needsHumanReview: true
  teeVerified: boolean
  executionMode: 'live' | 'synthetic-preview' | 'verified-replay'
  runs: Array<{
    task: 'transcription' | 'vision-assessment'
    model: string
    provider: string
    requestId: string
    chatId: string
    responseHash: `0x${string}`
    teeVerified: boolean
  }>
  generatedAt: string
}

export const PAYOUT_BY_SEVERITY = [0, 1, 3, 5, 8, 12] as const
