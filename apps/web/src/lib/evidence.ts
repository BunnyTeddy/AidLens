export interface IntakePayload {
  districtCode: number
  districtName: string
  householdSize: number
  displaced: boolean
  narration: string
  approximateLocation?: {
    latitude: number
    longitude: number
    accuracyMeters: number
  }
  audioDurationSeconds?: number
  capturedAt: string
  consentVersion: '2026-06-22'
  syntheticDemo: boolean
}

export interface ManifestEntry {
  field: 'image' | 'audio'
  filename: string
  mimeType: string
  size: number
  sha256: `0x${string}`
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    )
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

export async function sha256Blob(blob: Blob): Promise<`0x${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `0x${hex}`
}

export async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image compression failed.'))),
      'image/jpeg',
      0.78,
    )
  })
  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
}

export function evidenceAuthorizationMessage(auth: {
  walletAddress: string
  manifestHash: string
  nonce: string
  expiresAt: string
}): string {
  return [
    'AidLens evidence upload',
    `wallet: ${auth.walletAddress.toLowerCase()}`,
    `manifest: ${auth.manifestHash}`,
    `nonce: ${auth.nonce}`,
    `expires: ${auth.expiresAt}`,
  ].join('\n')
}

export function assessmentAuthorizationMessage(auth: {
  reviewerAddress: string
  claimId: number
  evidenceRoot: string
  nonce: string
  expiresAt: string
}): string {
  return [
    'AidLens assessment request',
    `reviewer: ${auth.reviewerAddress.toLowerCase()}`,
    `claim: ${auth.claimId}`,
    `evidence: ${auth.evidenceRoot.toLowerCase()}`,
    `nonce: ${auth.nonce}`,
    `expires: ${auth.expiresAt}`,
  ].join('\n')
}
