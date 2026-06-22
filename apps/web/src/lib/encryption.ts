import { canonicalJson, sha256Blob, type IntakePayload } from './evidence'

export interface EncryptedEvidenceEnvelope {
  version: 2
  encryption: {
    algorithm: 'AES-256-GCM+ECDH-P256'
    ephemeralPublicKey: string
    wrapIv: string
    wrapSalt: string
    wrappedKey: string
  }
  publicMetadata: {
    districtCode: number
    districtName: string
    householdSize: number
    displaced: boolean
    capturedAt: string
    syntheticDemo: boolean
  }
  intake: { iv: string; ciphertext: string }
  files: Array<{
    field: 'image' | 'audio'
    filename: string
    mimeType: string
    originalSize: number
    plaintextSha256: string
    iv: string
    ciphertext: string
  }>
}

const hkdfInfo = new TextEncoder().encode('AidLens evidence key v1')

export async function encryptEvidenceEnvelope(
  intake: IntakePayload,
  files: Array<{ field: 'image' | 'audio'; file: File }>,
  ngoPublicKeyBase64: string,
): Promise<EncryptedEvidenceEnvelope> {
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const rawContentKey = await crypto.subtle.exportKey('raw', contentKey)
  const ngoPublicKey = await crypto.subtle.importKey(
    'raw',
    fromBase64(ngoPublicKeyBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ngoPublicKey },
    ephemeral.privateKey,
    256,
  )
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  const wrapSalt = crypto.getRandomValues(new Uint8Array(16))
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: wrapSalt, info: hkdfInfo },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const wrapIv = crypto.getRandomValues(new Uint8Array(12))
  const wrappedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrappingKey, rawContentKey)
  const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  const encryptedIntake = await encryptBytes(contentKey, new TextEncoder().encode(canonicalJson(intake)))
  const encryptedFiles = await Promise.all(files.map(async ({ field, file }) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const encrypted = await encryptBytes(contentKey, bytes)
    return {
      field,
      filename: file.name,
      mimeType: file.type,
      originalSize: file.size,
      plaintextSha256: await sha256Blob(file),
      ...encrypted,
    }
  }))
  return {
    version: 2,
    encryption: {
      algorithm: 'AES-256-GCM+ECDH-P256',
      ephemeralPublicKey: toBase64(ephemeralPublicKey),
      wrapIv: toBase64(wrapIv),
      wrapSalt: toBase64(wrapSalt),
      wrappedKey: toBase64(wrappedKey),
    },
    publicMetadata: {
      districtCode: intake.districtCode,
      districtName: intake.districtName,
      householdSize: intake.householdSize,
      displaced: intake.displaced,
      capturedAt: intake.capturedAt,
      syntheticDemo: intake.syntheticDemo,
    },
    intake: encryptedIntake,
    files: encryptedFiles,
  }
}

async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(data))
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) }
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer
}
