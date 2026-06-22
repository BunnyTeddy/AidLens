import { createHash } from 'node:crypto'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'
import { ethers } from 'ethers'
import { keccak256, stringToBytes } from 'viem'
import { canonicalJson, sha256Hex } from '../lib/canonical.js'
import {
  modelAssessmentSchema,
  PAYOUT_BY_SEVERITY,
  routerTraceSchema,
  type AssessmentV1,
  type EvidenceBundle,
} from '../schemas.js'

export interface ComputeResult {
  assessment: AssessmentV1
  receiptHash: `0x${string}` | null
  privateAssessment: Uint8Array
  publicAssessment: Uint8Array
  payEligible: boolean
}

export interface ComputeAdapter {
  readonly mode: 'live' | 'synthetic-preview'
  assess(claimId: number, evidence: EvidenceBundle): Promise<ComputeResult>
  status(): Promise<{ available: boolean; visionModel: string; audioModel: string; detail: string }>
}

interface LiveComputeOptions {
  apiKey: string
  baseUrl: string
  visionModel: string
  audioModel: string
  mainnetRpcUrl: string
  verifierPrivateKey: string
}

interface RunReceipt {
  task: 'transcription' | 'vision-assessment'
  model: string
  provider: string
  requestId: string
  chatId: string
  responseHash: `0x${string}`
  teeVerified: boolean
  routerTeeVerified: boolean
  independentTeeVerified: boolean | null
  verificationSource: 'sdk-processResponse' | 'router-verified' | 'unverified'
  verificationError?: string
}

export class PreviewComputeAdapter implements ComputeAdapter {
  readonly mode = 'synthetic-preview' as const

  async assess(claimId: number, evidence: EvidenceBundle): Promise<ComputeResult> {
    const severity = evidence.intake.displaced ? 4 : 3
    const assessment: AssessmentV1 = {
      version: 1,
      claimId,
      severity,
      urgency: evidence.intake.displaced ? 'high' : 'moderate',
      evidenceConsistency: {
        score: 86,
        rationale: 'Synthetic preview uses deterministic sample observations; no live model ran.',
      },
      observations: [
        {
          source: 'synthetic-preview',
          finding: 'Flood water affected the living area and essential household items.',
          confidence: 0.84,
        },
      ],
      flags: ['Synthetic preview — not eligible for an onchain payout'],
      rationale: 'Preview result for UI development. Connect funded 0G credentials for a verified run.',
      recommendedPayoutOg: PAYOUT_BY_SEVERITY[severity] ?? 0,
      needsHumanReview: true,
      teeVerified: false,
      executionMode: 'synthetic-preview',
      runs: [],
      generatedAt: new Date().toISOString(),
    }
    const bytes = new TextEncoder().encode(canonicalJson(assessment))
    return {
      assessment,
      receiptHash: null,
      privateAssessment: bytes,
      publicAssessment: bytes,
      payEligible: false,
    }
  }

  async status(): Promise<{ available: boolean; visionModel: string; audioModel: string; detail: string }> {
    return {
      available: true,
      visionModel: 'synthetic-preview',
      audioModel: 'synthetic-preview',
      detail: 'Preview mode is available; no TEE claim is made.',
    }
  }
}

interface VerifiedReplayManifest {
  evidenceFingerprint: `0x${string}`
  assessment: AssessmentV1
  source: {
    evidenceRoot: `0x${string}`
    assessmentRoot: `0x${string}`
    receiptHash: `0x${string}`
    payoutTxHash: `0x${string}`
  }
}

export class VerifiedReplayComputeAdapter implements ComputeAdapter {
  readonly mode = 'synthetic-preview' as const
  private readonly manifest: VerifiedReplayManifest

  constructor(rawManifest: string) {
    const parsed = JSON.parse(rawManifest) as VerifiedReplayManifest
    if (
      !/^0x[0-9a-f]{64}$/i.test(parsed.evidenceFingerprint)
      || ![parsed.source?.evidenceRoot, parsed.source?.assessmentRoot, parsed.source?.receiptHash, parsed.source?.payoutTxHash]
        .every((value) => /^0x[0-9a-f]{64}$/i.test(value ?? ''))
      || parsed.assessment?.teeVerified !== true
      || parsed.assessment?.runs?.some((run) => run.teeVerified !== true)
    ) throw new Error('VERIFIED_REPLAY_MANIFEST is not a verified replay record')
    this.manifest = parsed
  }

  async assess(claimId: number, evidence: EvidenceBundle): Promise<ComputeResult> {
    const fingerprint = evidenceFingerprint(evidence)
    if (fingerprint.toLowerCase() !== this.manifest.evidenceFingerprint.toLowerCase()) {
      throw new Error('Submitted evidence does not match the verified replay fixture')
    }
    const assessment: AssessmentV1 = {
      ...this.manifest.assessment,
      claimId,
      executionMode: 'verified-replay',
      flags: ['Verified historical replay — never authorizes a new payout', ...this.manifest.assessment.flags],
    }
    const privateAssessment = new TextEncoder().encode(canonicalJson({ assessment, replaySource: this.manifest.source }))
    const publicAssessment = new TextEncoder().encode(canonicalJson({ assessment, replaySource: this.manifest.source }))
    return {
      assessment,
      receiptHash: null,
      privateAssessment,
      publicAssessment,
      payEligible: false,
    }
  }

  async status(): Promise<{ available: boolean; visionModel: string; audioModel: string; detail: string }> {
    return {
      available: true,
      visionModel: 'verified-replay',
      audioModel: 'verified-replay',
      detail: `Historical verified run for ${this.manifest.source.evidenceRoot}; replay cannot authorize payout.`,
    }
  }
}

export class LiveZeroGComputeAdapter implements ComputeAdapter {
  readonly mode = 'live' as const
  private brokerPromise: ReturnType<typeof createZGComputeNetworkBroker> | undefined

  constructor(private readonly options: LiveComputeOptions) {}

  async status(): Promise<{ available: boolean; visionModel: string; audioModel: string; detail: string }> {
    try {
      const response = await fetch(`${this.options.baseUrl}/models`)
      if (!response.ok) throw new Error(`model catalog returned ${response.status}`)
      const catalog = (await response.json()) as { data?: Array<{ id?: string }> }
      const ids = new Set((catalog.data ?? []).map((model) => model.id))
      const available = ids.has(this.options.visionModel) && ids.has(this.options.audioModel)
      return {
        available,
        visionModel: this.options.visionModel,
        audioModel: this.options.audioModel,
        detail: available ? 'Both configured mainnet models are healthy.' : 'A configured model is missing.',
      }
    } catch (error) {
      return {
        available: false,
        visionModel: this.options.visionModel,
        audioModel: this.options.audioModel,
        detail: error instanceof Error ? error.message : 'Model catalog unavailable',
      }
    }
  }

  async assess(claimId: number, evidence: EvidenceBundle): Promise<ComputeResult> {
    const audio = evidence.files.find((file) => file.field === 'audio')
    const transcriptRun = audio ? await this.transcribe(audio) : undefined
    const transcript = transcriptRun?.text ?? evidence.intake.narration
    const visionRun = await this.runVision(evidence, transcript)
    const parsed = modelAssessmentSchema.parse(normalizeModelAssessment(JSON.parse(visionRun.content)))
    const runs = [transcriptRun?.receipt, visionRun.receipt].filter(
      (run): run is RunReceipt => run !== undefined,
    )
    const teeVerified = runs.length > 0 && runs.every((run) => run.teeVerified)
    const verificationFlags = runs
      .filter((run) => run.routerTeeVerified && run.independentTeeVerified !== true)
      .map((run) => `${run.task}: Router TEE verified; independent SDK verification was unavailable for this provider signature endpoint`)
    const severity = parsed.severity
    const imageHashes = evidence.files.filter((file) => file.field === 'image').map((file) => file.sha256)
    const duplicateImageFlag = new Set(imageHashes).size < imageHashes.length
      ? ['Duplicate image hashes detected — reviewer confirmation required']
      : []

    const assessment: AssessmentV1 = {
      version: 1,
      claimId,
      severity,
      urgency: parsed.urgency,
      evidenceConsistency: parsed.evidenceConsistency,
      observations: parsed.observations,
      flags: [...parsed.flags, ...duplicateImageFlag, ...verificationFlags],
      rationale: parsed.rationale,
      recommendedPayoutOg: PAYOUT_BY_SEVERITY[severity] ?? 0,
      needsHumanReview: true,
      teeVerified,
      executionMode: 'live',
      runs,
      generatedAt: new Date().toISOString(),
    }

    const privateAssessment = new TextEncoder().encode(
      canonicalJson({ ...assessment, transcript, approximateLocation: evidence.intake.approximateLocation }),
    )
    const publicAssessment = new TextEncoder().encode(canonicalJson(assessment))
    const receiptHash = teeVerified
      ? keccak256(stringToBytes(canonicalJson(runs)))
      : null

    return {
      assessment,
      receiptHash,
      privateAssessment,
      publicAssessment,
      payEligible: teeVerified,
    }
  }

  private async transcribe(file: EvidenceBundle['files'][number]): Promise<{
    text: string
    receipt: RunReceipt
  }> {
    const form = new FormData()
    form.set('file', new Blob([Buffer.from(file.dataBase64, 'base64')], { type: file.mimeType }), file.filename)
    form.set('model', this.options.audioModel)
    form.set('response_format', 'json')
    const response = await fetch(`${this.options.baseUrl}/audio/transcriptions?verify_tee=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      body: form,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) throw new Error(routerError(data, response.status))
    const text = String(data.text ?? '')
    const receipt = await this.buildReceipt('transcription', this.options.audioModel, response, data, text)
    return { text, receipt }
  }

  private async runVision(
    evidence: EvidenceBundle,
    transcript: string,
  ): Promise<{ content: string; receipt: RunReceipt }> {
    const images = evidence.files.filter((file) => file.field === 'image')
    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: [
          'Assess visible flood damage for humanitarian triage only.',
          'Never infer identity, health diagnoses, property ownership, or fraud as fact.',
          'Return JSON with severity (1-5), urgency, evidenceConsistency {score,rationale},',
          'observations [{source,finding,confidence}], flags, and rationale.',
          `Intake: ${canonicalJson({ ...evidence.intake, approximateLocation: undefined })}`,
          `Claimant transcript: ${transcript}`,
        ].join('\n'),
      },
      ...images.map((image) => ({
        type: 'image_url',
        image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` },
      })),
    ]
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.visionModel,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1_600,
        verify_tee: true,
      }),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) throw new Error(routerError(data, response.status))
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
    const answer = choices?.[0]?.message?.content
    if (!answer) throw new Error('0G vision model returned no content')
    const receipt = await this.buildReceipt(
      'vision-assessment',
      this.options.visionModel,
      response,
      data,
      answer,
    )
    return { content: answer, receipt }
  }

  private async buildReceipt(
    task: RunReceipt['task'],
    model: string,
    response: Response,
    data: Record<string, unknown>,
    responseContent: string,
  ): Promise<RunReceipt> {
    const trace = routerTraceSchema.parse(data.x_0g_trace)
    const chatId = response.headers.get('ZG-Res-Key') ?? String(data.id ?? trace.request_id)
    const broker = await this.getBroker()
    let independentlyVerified: boolean | null = null
    let verificationError: string | undefined
    try {
      independentlyVerified = await broker.inference.processResponse(trace.provider, chatId)
    } catch (error) {
      verificationError = error instanceof Error ? error.message : 'Independent SDK verification failed'
    }
    const routerTeeVerified = trace.tee_verified === true
    const teeVerified = independentlyVerified === true || routerTeeVerified
    return {
      task,
      model,
      provider: trace.provider,
      requestId: trace.request_id,
      chatId,
      responseHash: sha256Hex(responseContent),
      teeVerified,
      routerTeeVerified,
      independentTeeVerified: independentlyVerified,
      verificationSource: independentlyVerified === true
        ? 'sdk-processResponse'
        : routerTeeVerified
          ? 'router-verified'
          : 'unverified',
      ...(verificationError ? { verificationError } : {}),
    }
  }

  private getBroker(): ReturnType<typeof createZGComputeNetworkBroker> {
    if (!this.brokerPromise) {
      const provider = new ethers.JsonRpcProvider(this.options.mainnetRpcUrl)
      const wallet = new ethers.Wallet(this.options.verifierPrivateKey, provider)
      this.brokerPromise = createZGComputeNetworkBroker(wallet)
    }
    return this.brokerPromise
  }
}

function routerError(data: Record<string, unknown>, status: number): string {
  const error = data.error as { message?: string } | undefined
  return `0G Router ${status}: ${error?.message ?? 'unknown error'}`
}

function normalizeModelAssessment(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = { ...(value as Record<string, unknown>) }
  if ('severity' in record) record.severity = Number(record.severity)
  if ('urgency' in record) record.urgency = normalizeUrgency(record.urgency)
  if (record.evidenceConsistency && typeof record.evidenceConsistency === 'object' && !Array.isArray(record.evidenceConsistency)) {
    const evidenceConsistency = { ...(record.evidenceConsistency as Record<string, unknown>) }
    if ('score' in evidenceConsistency) evidenceConsistency.score = Number(evidenceConsistency.score)
    record.evidenceConsistency = evidenceConsistency
  }
  if (Array.isArray(record.observations)) {
    record.observations = record.observations.map((observation) => {
      if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return observation
      const normalized = { ...(observation as Record<string, unknown>) }
      if ('confidence' in normalized) normalized.confidence = normalizeConfidence(normalized.confidence)
      return normalized
    })
  }
  if (Array.isArray(record.flags)) record.flags = record.flags.map(String)
  return record
}

function normalizeUrgency(value: unknown): unknown {
  const urgency = String(value ?? '').trim().toLowerCase()
  if (['low', 'minor', 'minimal'].includes(urgency)) return 'low'
  if (['moderate', 'medium', 'med'].includes(urgency)) return 'moderate'
  if (['high', 'urgent', 'severe'].includes(urgency)) return 'high'
  if (['critical', 'emergency', 'life-threatening', 'life_threatening'].includes(urgency)) return 'critical'
  return value
}

function normalizeConfidence(value: unknown): unknown {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percentage = Number(trimmed.slice(0, -1))
    return Number.isFinite(percentage) ? percentage / 100 : value
  }
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : value
}

function evidenceFingerprint(evidence: EvidenceBundle): `0x${string}` {
  return sha256Hex(canonicalJson({
    intake: evidence.intake,
    files: evidence.files.map(({ field, filename, mimeType, sha256 }) => ({ field, filename, mimeType, sha256 })),
  }))
}
