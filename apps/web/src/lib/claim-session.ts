import type { IntakePayload } from './evidence'

export interface StoredClaim {
  intake: Pick<IntakePayload, 'districtCode' | 'districtName' | 'householdSize' | 'displaced' | 'approximateLocation'>
  upload: {
    evidenceRoot: `0x${string}`
    evidenceTxHash: `0x${string}`
    publicRoot: `0x${string}`
    publicTxHash: `0x${string}`
    storageMode: 'live' | 'memory'
    encryptedAtRest: boolean
    encryptedAtSource?: boolean
  }
  createdAt: string
  claimId?: number
  submitTx?: `0x${string}`
}

const claimKeyPrefix = 'aidlens:claim:'
const latestClaimKey = 'aidlens:latest-claim-id'

export function readStoredClaim(id: string): StoredClaim | undefined {
  const raw = sessionStorage.getItem(`${claimKeyPrefix}${id}`)
  return raw ? JSON.parse(raw) as StoredClaim : undefined
}

export function readLatestStoredClaim(): { id: string; claim: StoredClaim } | undefined {
  const id = sessionStorage.getItem(latestClaimKey)
  if (!id) return undefined
  const claim = readStoredClaim(id)
  return claim ? { id, claim } : undefined
}

export function saveStoredClaim(id: string, claim: StoredClaim): void {
  sessionStorage.setItem(`${claimKeyPrefix}${id}`, JSON.stringify(claim))
  sessionStorage.setItem(latestClaimKey, id)
}
