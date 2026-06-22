import { webcrypto } from 'node:crypto'
import { sha256Hex } from './canonical.js'
import {
  encryptedEvidenceEnvelopeSchema,
  intakeSchema,
  type EncryptedEvidenceEnvelope,
  type EvidenceBundle,
} from '../schemas.js'

const { subtle } = webcrypto
const hkdfInfo = new TextEncoder().encode('AidLens evidence key v1')

export async function decryptEvidenceEnvelope(
  stored: unknown,
  privateKeyPkcs8Base64: string,
): Promise<EvidenceBundle> {
  const record = stored as { claimant?: unknown; receivedAt?: unknown }
  const envelope = encryptedEvidenceEnvelopeSchema.parse(stored)
  const privateKey = await subtle.importKey(
    'pkcs8',
    fromBase64(privateKeyPkcs8Base64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const ephemeralPublicKey = await subtle.importKey(
    'raw',
    fromBase64(envelope.encryption.ephemeralPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = await subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPublicKey },
    privateKey,
    256,
  )
  const hkdfKey = await subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  const wrappingKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: fromBase64(envelope.encryption.wrapSalt), info: hkdfInfo },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const rawContentKey = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.encryption.wrapIv) },
    wrappingKey,
    fromBase64(envelope.encryption.wrappedKey),
  )
  const contentKey = await subtle.importKey('raw', rawContentKey, 'AES-GCM', false, ['decrypt'])
  const intakeBytes = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.intake.iv) },
    contentKey,
    fromBase64(envelope.intake.ciphertext),
  )
  const intake = intakeSchema.parse(JSON.parse(new TextDecoder().decode(intakeBytes)))
  assertPublicMetadataMatches(envelope, intake)

  const files = await Promise.all(envelope.files.map(async (file) => {
    const plaintext = new Uint8Array(await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.iv) },
      contentKey,
      fromBase64(file.ciphertext),
    ))
    if (plaintext.byteLength !== file.originalSize || sha256Hex(plaintext) !== file.plaintextSha256) {
      throw new Error('Encrypted evidence integrity check failed')
    }
    if (!matchesFileSignature(file.mimeType, plaintext)) {
      throw new Error('Decrypted evidence MIME signature is invalid')
    }
    return {
      field: file.field,
      filename: file.filename,
      mimeType: file.mimeType,
      dataBase64: Buffer.from(plaintext).toString('base64'),
      sha256: file.plaintextSha256 as `0x${string}`,
    }
  }))

  return {
    version: 1,
    claimant: String(record.claimant ?? ''),
    intake,
    files,
    receivedAt: String(record.receivedAt ?? new Date().toISOString()),
  }
}

function assertPublicMetadataMatches(envelope: EncryptedEvidenceEnvelope, intake: ReturnType<typeof intakeSchema.parse>) {
  const publicMetadata = envelope.publicMetadata
  if (
    publicMetadata.districtCode !== intake.districtCode
    || publicMetadata.districtName !== intake.districtName
    || publicMetadata.householdSize !== intake.householdSize
    || publicMetadata.displaced !== intake.displaced
    || publicMetadata.capturedAt !== intake.capturedAt
    || publicMetadata.syntheticDemo !== intake.syntheticDemo
  ) throw new Error('Public metadata does not match encrypted intake')
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

function matchesFileSignature(mimeType: string, data: Uint8Array): boolean {
  const bytes = Buffer.from(data)
  if (mimeType === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (mimeType === 'audio/webm' || mimeType === 'video/webm') return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE'
  if (mimeType === 'audio/mp4') return bytes.subarray(4, 8).toString() === 'ftyp'
  if (mimeType === 'audio/mpeg') return bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
  return false
}
