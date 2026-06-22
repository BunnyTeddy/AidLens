import { verifyMessage } from 'viem'
import type { AssessmentRequest, UploadAuthorization } from './schemas.js'

export function evidenceAuthorizationMessage(auth: UploadAuthorization): string {
  return [
    'AidLens evidence upload',
    `wallet: ${auth.walletAddress.toLowerCase()}`,
    `manifest: ${auth.manifestHash}`,
    `nonce: ${auth.nonce}`,
    `expires: ${auth.expiresAt}`,
  ].join('\n')
}

export function assessmentAuthorizationMessage(auth: AssessmentRequest): string {
  return [
    'AidLens assessment request',
    `reviewer: ${auth.reviewerAddress.toLowerCase()}`,
    `claim: ${auth.claimId}`,
    `evidence: ${auth.evidenceRoot.toLowerCase()}`,
    `nonce: ${auth.nonce}`,
    `expires: ${auth.expiresAt}`,
  ].join('\n')
}

export function assertAuthorizationWindow(expiresAt: string, now = Date.now()): void {
  const expiry = Date.parse(expiresAt)
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 15 * 60_000) {
    throw new Error('Authorization expired or exceeds the 15 minute window')
  }
}

export async function verifyEvidenceAuthorization(
  auth: UploadAuthorization,
  signature: `0x${string}`,
): Promise<boolean> {
  try {
    assertAuthorizationWindow(auth.expiresAt)
    return await verifyMessage({
      address: auth.walletAddress as `0x${string}`,
      message: evidenceAuthorizationMessage(auth),
      signature,
    })
  } catch {
    return false
  }
}

export async function verifyAssessmentAuthorization(auth: AssessmentRequest): Promise<boolean> {
  try {
    assertAuthorizationWindow(auth.expiresAt)
    return await verifyMessage({
      address: auth.reviewerAddress as `0x${string}`,
      message: assessmentAuthorizationMessage(auth),
      signature: auth.signature as `0x${string}`,
    })
  } catch {
    return false
  }
}
