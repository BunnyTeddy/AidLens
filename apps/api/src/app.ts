import type { MultipartFile } from '@fastify/multipart'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance } from 'fastify'
import { formatEther, parseEther } from 'viem'
import { ZodError } from 'zod'
import type { ComputeAdapter } from './adapters/compute.js'
import type { StorageAdapter } from './adapters/storage.js'
import { verifyEvidenceAuthorization } from './auth.js'
import type { AssessmentAuthorizer } from './contract.js'
import { canonicalJson, sha256Hex } from './lib/canonical.js'
import {
  assessmentRequestSchema,
  encryptedEvidenceEnvelopeSchema,
  fileManifestEntrySchema,
  intakeSchema,
  uploadAuthorizationSchema,
  type EvidenceBundle,
  type EvidenceFile,
} from './schemas.js'

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const audioMimeTypes = new Set([
  'audio/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'video/webm',
])

export interface AppDependencies {
  storage: StorageAdapter
  compute: ComputeAdapter
  authorizer: AssessmentAuthorizer
  webOrigin: string
  chainRpcUrl: string
  reliefFundAddress: string | undefined
  decryptEvidence?: (stored: unknown) => Promise<EvidenceBundle>
  logger?: boolean
}

export function createApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: deps.logger
      ? {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body',
              'res.body',
              '*.signature',
              '*.dataBase64',
              '*.narration',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
    bodyLimit: MAX_UPLOAD_BYTES + 256 * 1024,
  })

  void app.register(cors, {
    origin: deps.webOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
  void app.register(multipart, {
    limits: {
      files: 4,
      fileSize: MAX_UPLOAD_BYTES,
      fields: 8,
      parts: 12,
    },
  })

  app.setErrorHandler((error, request, reply) => {
    const handledError = error instanceof Error ? error : new Error('Unknown request failure')
    const validationError = handledError instanceof ZodError || handledError instanceof SyntaxError
    const candidateStatus = 'statusCode' in handledError
      ? Number(handledError.statusCode)
      : validationError
        ? 400
        : 500
    const statusCode = Number.isInteger(candidateStatus) && candidateStatus >= 400 ? candidateStatus : 500
    if (statusCode >= 500) request.log.error({ err: handledError }, 'request failed')
    void reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
        message: statusCode >= 500 ? 'AidLens could not complete this request.' : handledError.message,
      },
    })
  })

  app.get('/health', async () => ({ ok: true, service: 'aidlens-api' }))

  app.get('/v1/0g/status', async () => {
    const compute = await deps.compute.status()
    return {
      mode: deps.compute.mode === 'live' && deps.storage.mode === 'live'
        ? deps.reliefFundAddress ? 'live' : 'partial'
        : 'preview',
      chain: {
        network: '0G Galileo testnet',
        rpcConfigured: Boolean(deps.chainRpcUrl),
        contractConfigured: Boolean(deps.reliefFundAddress),
      },
      storage: {
        network: deps.storage.mode === 'live' ? '0G Galileo Turbo testnet' : 'in-memory preview',
        available: true,
        encryptedAtRest: deps.storage.mode === 'live',
        clientSideEncryptionReady: Boolean(deps.decryptEvidence),
      },
      compute,
      trustBoundary:
        '0G TEE verifies model execution. The AidLens worker decrypts evidence transiently in memory for assessment.',
    }
  })

  app.post('/v1/evidence', async (request, reply) => {
    const parsed = await parseEvidenceRequest(request.parts())
    if (!(await verifyEvidenceAuthorization(parsed.authorization, parsed.signature))) {
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE', message: 'Wallet signature is invalid.' } })
    }

    const manifestHash = parsed.envelope
      ? sha256Hex(canonicalJson(parsed.envelope))
      : sha256Hex(canonicalJson({
          intake: parsed.intake,
          files: parsed.files.map((file) => ({
            field: file.field,
            filename: file.filename,
            mimeType: file.mimeType,
            size: Buffer.byteLength(file.dataBase64, 'base64'),
            sha256: file.sha256,
          })).sort((left, right) => `${left.field}:${left.filename}`.localeCompare(`${right.field}:${right.filename}`)),
        }))
    if (manifestHash !== parsed.authorization.manifestHash) {
      return reply.status(400).send({
        error: { code: 'MANIFEST_MISMATCH', message: 'Signed manifest does not match uploaded evidence.' },
      })
    }

    const receivedAt = new Date().toISOString()
    const bundle = parsed.envelope
      ? { ...parsed.envelope, claimant: parsed.authorization.walletAddress, receivedAt }
      : {
          version: 1 as const,
          claimant: parsed.authorization.walletAddress,
          intake: parsed.intake,
          files: parsed.files,
          receivedAt,
        }
    const metadata = parsed.envelope?.publicMetadata ?? parsed.intake
    const publicMetadata = {
      version: 1,
      districtCode: metadata.districtCode,
      districtName: metadata.districtName,
      householdSize: metadata.householdSize,
      displaced: metadata.displaced,
      capturedAt: metadata.capturedAt,
      syntheticDemo: metadata.syntheticDemo,
      privacy: 'Exact location, images, audio, and narration are encrypted and excluded.',
    }

    // 0G Storage uploads submit onchain transactions from the service wallet.
    // Keep these sequential so the SDK cannot race two transactions with the same nonce.
    const evidence = await deps.storage.uploadPrivate(new TextEncoder().encode(canonicalJson(bundle)))
    const publicObject = await deps.storage.uploadPublic(new TextEncoder().encode(canonicalJson(publicMetadata)))

    return reply.status(201).send({
      evidenceRoot: evidence.rootHash,
      evidenceTxHash: evidence.txHash,
      publicRoot: publicObject.rootHash,
      publicTxHash: publicObject.txHash,
      encryptedAtRest: deps.storage.mode === 'live' && evidence.encrypted,
      encryptedAtSource: Boolean(parsed.envelope),
      storageMode: deps.storage.mode,
      next: deps.storage.mode === 'live' ? 'Submit these roots to AidLensReliefFund.' : 'Preview only — live roots require 0G credentials.',
    })
  })

  app.post('/v1/assessments', async (request, reply) => {
    const body = assessmentRequestSchema.parse(request.body)
    if (!(await deps.authorizer.authorize(body))) {
      return reply.status(403).send({
        error: { code: 'ASSESSOR_REQUIRED', message: 'A valid onchain assessor authorization is required.' },
      })
    }

    const evidenceBytes = await deps.storage.downloadPrivate(body.evidenceRoot as `0x${string}`)
    const storedEvidence = JSON.parse(new TextDecoder().decode(evidenceBytes)) as EvidenceBundle | { version: 2 }
    const evidence = storedEvidence.version === 2
      ? await (deps.decryptEvidence
          ? deps.decryptEvidence(storedEvidence)
          : Promise.reject(new Error('Client-encrypted evidence cannot be opened by this worker.')))
      : storedEvidence as EvidenceBundle
    const result = await deps.compute.assess(body.claimId, evidence)
    // Keep storage writes sequential for the same reason as evidence uploads: one wallet,
    // multiple onchain storage txs, and nonce management that is not concurrency-safe.
    const privateUpload = await deps.storage.uploadPrivate(result.privateAssessment)
    const publicUpload = await deps.storage.uploadPublic(result.publicAssessment)

    const onchainPayload = result.payEligible && result.receiptHash
      ? {
          claimId: body.claimId,
          assessmentRoot: publicUpload.rootHash,
          receiptHash: result.receiptHash,
          severity: result.assessment.severity,
          recommendedAmountWei: parseEther(String(result.assessment.recommendedPayoutOg)).toString(),
          recommendedAmountDisplay: `${formatEther(parseEther(String(result.assessment.recommendedPayoutOg)))} 0G`,
        }
      : null

    return reply.send({
      assessment: result.assessment,
      publicAssessmentRoot: publicUpload.rootHash,
      privateAssessmentRoot: privateUpload.rootHash,
      onchainPayload,
      payEligible: result.payEligible,
      warning: result.payEligible
        ? null
        : result.assessment.executionMode === 'verified-replay'
          ? 'Verified historical replay is inspectable but cannot authorize a new payout.'
          : 'Synthetic preview is not TEE verified and cannot be recorded for payout.',
    })
  })

  return app
}

async function parseEvidenceRequest(
  parts: AsyncIterableIterator<MultipartFile | import('@fastify/multipart').MultipartValue>,
): Promise<{
  authorization: ReturnType<typeof uploadAuthorizationSchema.parse>
  signature: `0x${string}`
  intake: ReturnType<typeof intakeSchema.parse>
  files: EvidenceFile[]
  envelope?: ReturnType<typeof encryptedEvidenceEnvelopeSchema.parse>
}> {
  let authorizationRaw = ''
  let signature = ''
  let intakeRaw = ''
  let envelopeRaw = ''
  const files: EvidenceFile[] = []
  let totalBytes = 0

  for await (const part of parts) {
    if (part.type === 'file') {
      const data = await part.toBuffer()
      totalBytes += data.byteLength
      if (totalBytes > MAX_UPLOAD_BYTES) throw Object.assign(new Error('Evidence exceeds the 12 MB limit.'), { statusCode: 413 })
      const field = part.fieldname === 'audio' ? 'audio' : 'image'
      if (field === 'image' && !imageMimeTypes.has(part.mimetype)) {
        throw Object.assign(new Error(`Unsupported image type: ${part.mimetype}`), { statusCode: 400 })
      }
      if (field === 'audio' && !audioMimeTypes.has(part.mimetype)) {
        throw Object.assign(new Error(`Unsupported audio type: ${part.mimetype}`), { statusCode: 400 })
      }
      if (!matchesFileSignature(part.mimetype, data)) {
        throw Object.assign(new Error(`File signature does not match declared MIME type: ${part.mimetype}`), { statusCode: 400 })
      }
      files.push({
        field,
        filename: part.filename,
        mimeType: part.mimetype,
        dataBase64: data.toString('base64'),
        sha256: sha256Hex(data),
      })
      continue
    }
    const value = String(part.value)
    if (part.fieldname === 'authorization') authorizationRaw = value
    if (part.fieldname === 'signature') signature = value
    if (part.fieldname === 'intake') intakeRaw = value
    if (part.fieldname === 'envelope') envelopeRaw = value
  }

  const authorization = uploadAuthorizationSchema.parse(JSON.parse(authorizationRaw))
  const parsedSignature = /^0x[0-9a-fA-F]+$/.test(signature)
    ? (signature as `0x${string}`)
    : (() => { throw new Error('Signature must be a hex string.') })()

  if (envelopeRaw) {
    if (files.length > 0 || intakeRaw) throw new Error('Encrypted envelope cannot be mixed with plaintext evidence.')
    const envelope = encryptedEvidenceEnvelopeSchema.parse(JSON.parse(envelopeRaw))
    const imageCount = envelope.files.filter((file) => file.field === 'image').length
    const audioCount = envelope.files.filter((file) => file.field === 'audio').length
    const totalBytes = envelope.files.reduce((sum, file) => sum + file.originalSize, 0)
    if (imageCount < 1 || imageCount > 3) throw new Error('Submit between one and three images.')
    if (audioCount > 1) throw new Error('Only one audio report is allowed.')
    if (totalBytes > MAX_UPLOAD_BYTES) throw Object.assign(new Error('Evidence exceeds the 12 MB limit.'), { statusCode: 413 })
    return { authorization, signature: parsedSignature, intake: undefined as never, files: [], envelope }
  }

  const imageCount = files.filter((file) => file.field === 'image').length
  const audioCount = files.filter((file) => file.field === 'audio').length
  if (imageCount < 1 || imageCount > 3) throw new Error('Submit between one and three images.')
  if (audioCount > 1) throw new Error('Only one audio report is allowed.')

  const intake = intakeSchema.parse(JSON.parse(intakeRaw))
  for (const file of files) {
    fileManifestEntrySchema.parse({
      field: file.field,
      filename: file.filename,
      mimeType: file.mimeType,
      size: Buffer.byteLength(file.dataBase64, 'base64'),
      sha256: file.sha256,
    })
  }
  return { authorization, signature: parsedSignature, intake, files }
}

function matchesFileSignature(mimeType: string, data: Buffer): boolean {
  if (mimeType === 'image/jpeg') return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  if (mimeType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mimeType === 'image/webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
  if (mimeType === 'audio/webm' || mimeType === 'video/webm') return data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE'
  if (mimeType === 'audio/mp4') return data.subarray(4, 8).toString() === 'ftyp'
  if (mimeType === 'audio/mpeg') {
    return data.subarray(0, 3).toString() === 'ID3' || (data[0] === 0xff && data[1] !== undefined && (data[1] & 0xe0) === 0xe0)
  }
  return false
}
