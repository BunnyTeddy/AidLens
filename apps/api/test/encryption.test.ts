import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalJson, sha256Hex } from '../src/lib/canonical.js'
import { decryptEvidenceEnvelope } from '../src/lib/encryption.js'
import type { ClaimIntake, EncryptedEvidenceEnvelope } from '../src/schemas.js'

const { subtle } = webcrypto
const encoder = new TextEncoder()
const hkdfInfo = encoder.encode('AidLens evidence key v1')

describe('client evidence encryption', () => {
  it('decrypts only with the NGO private key and preserves evidence integrity', async () => {
    const ngo = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const wrongNgo = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const envelope = await encryptFixture(ngo.publicKey)
    const privateKey = toBase64(await subtle.exportKey('pkcs8', ngo.privateKey))
    const wrongPrivateKey = toBase64(await subtle.exportKey('pkcs8', wrongNgo.privateKey))

    const decrypted = await decryptEvidenceEnvelope({
      ...envelope,
      claimant: '0x0000000000000000000000000000000000000001',
      receivedAt: '2026-06-22T05:01:00.000Z',
    }, privateKey)
    expect(decrypted.intake.districtCode).toBe(4901)
    expect(Buffer.from(decrypted.files[0]!.dataBase64, 'base64').subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    await expect(decryptEvidenceEnvelope(envelope, wrongPrivateKey)).rejects.toThrow()
  })
})

async function encryptFixture(ngoPublicKey: webcrypto.CryptoKey): Promise<EncryptedEvidenceEnvelope> {
  const intake: ClaimIntake = {
    districtCode: 4901,
    districtName: 'Le Thuy, Quang Binh',
    householdSize: 4,
    displaced: true,
    narration: 'Synthetic flood report',
    capturedAt: '2026-06-22T05:00:00.000Z',
    consentVersion: '2026-06-22',
    syntheticDemo: true,
  }
  const evidence = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0x43, 0, 0xff, 0xd9])
  const contentKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: ngoPublicKey }, ephemeral.privateKey, 256)
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const wrapKey = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: hkdfInfo }, hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const wrapIv = webcrypto.getRandomValues(new Uint8Array(12))
  const wrappedKey = await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKey, await subtle.exportKey('raw', contentKey))
  const encryptedIntake = await encrypt(contentKey, encoder.encode(canonicalJson(intake)))
  const encryptedFile = await encrypt(contentKey, evidence)
  return {
    version: 2,
    encryption: {
      algorithm: 'AES-256-GCM+ECDH-P256',
      ephemeralPublicKey: toBase64(await subtle.exportKey('raw', ephemeral.publicKey)),
      wrapIv: toBase64(wrapIv),
      wrapSalt: toBase64(salt),
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
    files: [{
      field: 'image',
      filename: 'flood.jpg',
      mimeType: 'image/jpeg',
      originalSize: evidence.byteLength,
      plaintextSha256: sha256Hex(evidence),
      ...encryptedFile,
    }],
  }
}

async function encrypt(key: webcrypto.CryptoKey, bytes: Uint8Array): Promise<{ iv: string; ciphertext: string }> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)),
  }
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString('base64')
}
