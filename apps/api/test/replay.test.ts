import { describe, expect, it } from 'vitest'
import { VerifiedReplayComputeAdapter } from '../src/adapters/compute.js'
import { canonicalJson, sha256Hex } from '../src/lib/canonical.js'
import type { EvidenceBundle } from '../src/schemas.js'

const root = `0x${'1'.repeat(64)}` as const
const evidence: EvidenceBundle = {
  version: 1,
  claimant: '0x0000000000000000000000000000000000000001',
  intake: {
    districtCode: 4901,
    districtName: 'Le Thuy, Quang Binh',
    householdSize: 4,
    displaced: true,
    narration: 'Synthetic flood report',
    capturedAt: '2026-06-22T05:00:00.000Z',
    consentVersion: '2026-06-22',
    syntheticDemo: true,
  },
  files: [{
    field: 'image',
    filename: 'flood.jpg',
    mimeType: 'image/jpeg',
    dataBase64: '/9j/2Q==',
    sha256: root,
  }],
  receivedAt: '2026-06-22T05:01:00.000Z',
}

describe('verified replay', () => {
  it('is inspectable but never payout eligible', async () => {
    const fingerprint = sha256Hex(canonicalJson({
      intake: evidence.intake,
      files: evidence.files.map(({ field, filename, mimeType, sha256 }) => ({ field, filename, mimeType, sha256 })),
    }))
    const adapter = new VerifiedReplayComputeAdapter(JSON.stringify({
      evidenceFingerprint: fingerprint,
      assessment: {
        version: 1,
        claimId: 1,
        severity: 4,
        urgency: 'high',
        evidenceConsistency: { score: 90, rationale: 'Verified historical run.' },
        observations: [{ source: 'image', finding: 'Visible flood impact.', confidence: 0.9 }],
        flags: [],
        rationale: 'Historical 0G run.',
        recommendedPayoutOg: 8,
        needsHumanReview: true,
        teeVerified: true,
        executionMode: 'live',
        runs: [{ task: 'vision-assessment', model: 'qwen3-vl-30b', provider: '0x0000000000000000000000000000000000000002', requestId: 'request-1', chatId: 'chat-1', responseHash: root, teeVerified: true }],
        generatedAt: '2026-06-22T05:02:00.000Z',
      },
      source: { evidenceRoot: root, assessmentRoot: root, receiptHash: root, payoutTxHash: root },
    }))

    const result = await adapter.assess(7, evidence)
    expect(result.assessment.executionMode).toBe('verified-replay')
    expect(result.assessment.teeVerified).toBe(true)
    expect(result.payEligible).toBe(false)
    expect(result.receiptHash).toBeNull()
    await expect(adapter.assess(7, { ...evidence, intake: { ...evidence.intake, householdSize: 5 } })).rejects.toThrow('does not match')
  })
})
