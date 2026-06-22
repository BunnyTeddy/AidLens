import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, describe, expect, it } from 'vitest'
import { PreviewComputeAdapter } from '../src/adapters/compute.js'
import { MemoryStorageAdapter } from '../src/adapters/storage.js'
import { createApp } from '../src/app.js'
import { evidenceAuthorizationMessage } from '../src/auth.js'
import type { AssessmentAuthorizer } from '../src/contract.js'
import { canonicalJson, sha256Hex } from '../src/lib/canonical.js'
import type { ClaimIntake, UploadAuthorization } from '../src/schemas.js'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

const intake: ClaimIntake = {
  districtCode: 4901,
  districtName: 'Le Thuy, Quang Binh',
  householdSize: 4,
  displaced: true,
  narration: 'Flood water entered the ground floor.',
  capturedAt: '2026-06-22T05:00:00.000Z',
  consentVersion: '2026-06-22',
  syntheticDemo: true,
}

const apps: ReturnType<typeof createApp>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('AidLens API', () => {
  it('reports preview trust boundaries without claiming live verification', async () => {
    const app = makeApp(true)
    const response = await app.inject({ method: 'GET', url: '/v1/0g/status' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.mode).toBe('preview')
    expect(body.storage.encryptedAtRest).toBe(false)
    expect(body.compute.visionModel).toBe('synthetic-preview')
  })

  it('accepts a signed image manifest and returns preview roots', async () => {
    const app = makeApp(true)
    const request = await signedEvidenceRequest()
    const response = await app.inject(request)
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.evidenceRoot).toMatch(/^0x[0-9a-f]{64}$/)
    expect(body.publicRoot).toMatch(/^0x[0-9a-f]{64}$/)
    expect(body.encryptedAtRest).toBe(false)
    expect(body.storageMode).toBe('memory')
  })

  it('rejects a signature that does not bind the manifest', async () => {
    const app = makeApp(true)
    const request = await signedEvidenceRequest('0x1234')
    const response = await app.inject(request)
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('INVALID_SIGNATURE')
  })

  it('rejects unsupported evidence MIME types', async () => {
    const app = makeApp(true)
    const request = await signedEvidenceRequest(undefined, 'text/plain')
    const response = await app.inject(request)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toContain('Unsupported image type')
  })

  it('rejects bytes that do not match a declared image MIME type', async () => {
    const app = makeApp(true)
    const response = await app.inject(await signedEvidenceRequest(undefined, 'image/jpeg', Buffer.from('not-a-jpeg')))
    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toContain('File signature does not match')
  })

  it('rejects expired wallet authorizations', async () => {
    const app = makeApp(true)
    const response = await app.inject(await signedEvidenceRequest(undefined, 'image/jpeg', undefined, new Date(Date.now() - 1_000).toISOString()))
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('INVALID_SIGNATURE')
  })

  it('returns a non-payable synthetic assessment in preview mode', async () => {
    const storage = new MemoryStorageAdapter()
    const app = makeApp(true, storage)
    const upload = await app.inject(await signedEvidenceRequest())
    const root = upload.json().evidenceRoot as string

    const response = await app.inject({
      method: 'POST',
      url: '/v1/assessments',
      payload: {
        claimId: 1,
        evidenceRoot: root,
        reviewerAddress: account.address,
        nonce: 'review_nonce_12345678',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        signature: '0x1234',
      },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.assessment.executionMode).toBe('synthetic-preview')
    expect(body.assessment.teeVerified).toBe(false)
    expect(body.payEligible).toBe(false)
    expect(body.onchainPayload).toBeNull()
  })

  it('requires assessor authorization before reading private evidence', async () => {
    const storage = new MemoryStorageAdapter()
    const app = makeApp(false, storage)
    const upload = await app.inject(await signedEvidenceRequest())
    const response = await app.inject({
      method: 'POST',
      url: '/v1/assessments',
      payload: {
        claimId: 1,
        evidenceRoot: upload.json().evidenceRoot,
        reviewerAddress: account.address,
        nonce: 'review_nonce_12345678',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        signature: '0x1234',
      },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('ASSESSOR_REQUIRED')
  })
})

function makeApp(authorized: boolean, storage = new MemoryStorageAdapter()) {
  const authorizer: AssessmentAuthorizer = { authorize: async () => authorized }
  const app = createApp({
    storage,
    compute: new PreviewComputeAdapter(),
    authorizer,
    webOrigin: 'http://localhost:5173',
    chainRpcUrl: 'https://evmrpc-testnet.0g.ai',
    reliefFundAddress: undefined,
    logger: false,
  })
  apps.push(app)
  return app
}

async function signedEvidenceRequest(
  signatureOverride?: string,
  mimeType = 'image/jpeg',
  imageOverride?: Buffer,
  expiresAt = new Date(Date.now() + 5 * 60_000).toISOString(),
) {
  const image = imageOverride ?? Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9])
  const files = [
    {
      field: 'image' as const,
      filename: 'flood.jpg',
      mimeType,
      size: image.byteLength,
      sha256: sha256Hex(image),
    },
  ]
  const authorization: UploadAuthorization = {
    walletAddress: account.address,
    nonce: 'upload_nonce_12345678',
    expiresAt,
    manifestHash: sha256Hex(canonicalJson({ intake, files })),
  }
  const signature = signatureOverride ?? (await account.signMessage({
    message: evidenceAuthorizationMessage(authorization),
  }))

  const boundary = '----aidlens-vitest-boundary'
  const body = multipartBody(boundary, [
    { name: 'authorization', value: JSON.stringify(authorization) },
    { name: 'signature', value: signature },
    { name: 'intake', value: JSON.stringify(intake) },
    { name: 'image', filename: 'flood.jpg', contentType: mimeType, value: image },
  ])
  return {
    method: 'POST' as const,
    url: '/v1/evidence',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  }
}

function multipartBody(
  boundary: string,
  parts: Array<{
    name: string
    value: string | Buffer
    filename?: string
    contentType?: string
  }>,
): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    const filename = part.filename ? `; filename="${part.filename}"` : ''
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"${filename}\r\n`))
    if (part.contentType) chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`))
    chunks.push(Buffer.from('\r\n'))
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value))
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks)
}
