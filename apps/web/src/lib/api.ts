import { apiUrl } from './config'

export interface ZeroGStatus {
  mode: 'live' | 'partial' | 'preview'
  chain: { network: string; rpcConfigured: boolean; contractConfigured: boolean }
  storage: { network: string; available: boolean; encryptedAtRest: boolean; clientSideEncryptionReady: boolean }
  compute: {
    available: boolean
    visionModel: string
    audioModel: string
    detail: string
  }
  trustBoundary: string
}

export async function fetchZeroGStatus(signal?: AbortSignal): Promise<ZeroGStatus> {
  const response = await fetch(`${apiUrl}/v1/0g/status`, { signal })
  if (!response.ok) throw new Error('0G status is unavailable')
  return response.json() as Promise<ZeroGStatus>
}

export async function uploadEvidence(formData: FormData) {
  const response = await fetch(`${apiUrl}/v1/evidence`, { method: 'POST', body: formData })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Evidence upload failed')
  return data as {
    evidenceRoot: `0x${string}`
    evidenceTxHash: `0x${string}`
    publicRoot: `0x${string}`
    publicTxHash: `0x${string}`
    encryptedAtRest: boolean
    storageMode: 'live' | 'memory'
  }
}

export async function requestAssessment(payload: Record<string, unknown>) {
  const response = await fetch(`${apiUrl}/v1/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Assessment failed')
  return data
}
