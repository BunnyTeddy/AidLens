import { useMemo, useState } from 'react'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'
import { BrainCircuit, CheckCircle2, ExternalLink, FileSearch, LockKeyhole, MessageSquareWarning, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import { keccak256, stringToBytes } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { demoClaims, type DemoClaim } from '@/data/demo'
import { requestAssessment } from '@/lib/api'
import { readLatestStoredClaim, readStoredClaim, type StoredClaim } from '@/lib/claim-session'
import { aidLensAbi } from '@/lib/contract'
import { chainScanUrl, contractConfigured, galileo, reliefFundAddress } from '@/lib/config'
import { assessmentAuthorizationMessage } from '@/lib/evidence'

interface AssessmentResponse {
  assessment: {
    severity: number
    urgency: string
    evidenceConsistency: { score: number; rationale: string }
    observations: Array<{ source: string; finding: string; confidence: number }>
    flags: string[]
    rationale: string
    recommendedPayoutOg: number
    teeVerified: boolean
    executionMode: string
  }
  onchainPayload: null | {
    claimId: number
    assessmentRoot: `0x${string}`
    receiptHash: `0x${string}`
    severity: number
    recommendedAmountWei: string
  }
  payEligible: boolean
  warning: string | null
}

export function NgoPage() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync, isPending: transactionPending } = useWriteContract()
  const latestStoredClaim = useMemo(() => readLatestStoredClaim(), [])
  const liveClaim = useMemo(() => {
    if (!latestStoredClaim) return undefined
    return storedClaimToDemoClaim(latestStoredClaim.id, latestStoredClaim.claim)
  }, [latestStoredClaim])
  const claims = useMemo(
    () => liveClaim ? [liveClaim, ...demoClaims.filter((claim) => claim.id !== liveClaim.id)] : demoClaims,
    [liveClaim],
  )
  const [selectedId, setSelectedId] = useState(latestStoredClaim?.id ?? demoClaims[0].id)
  const selected = claims.find((claim) => claim.id === selectedId) ?? claims[0]
  const [assessment, setAssessment] = useState<AssessmentResponse>()
  const [amount, setAmount] = useState(String(selected.recommendedOg))
  const [reviewNote, setReviewNote] = useState('Please provide one additional exterior flood photo.')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [lastTransaction, setLastTransaction] = useState<`0x${string}`>()

  const storedClaim = useMemo(() => {
    return readStoredClaim(selected.id)
  }, [selected.id])
  const selectedClaimId = storedClaim?.claimId ?? (!contractConfigured ? 1 : undefined)

  async function runAssessment() {
    if (!address || !storedClaim || !selectedClaimId) {
      setError('Submit a live onchain claim from this browser and connect the assessor wallet first.')
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const authorization = {
        reviewerAddress: address,
        claimId: selectedClaimId,
        evidenceRoot: storedClaim.upload.evidenceRoot,
        nonce: crypto.randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }
      const signature = await signMessageAsync({ account: address, message: assessmentAuthorizationMessage(authorization) })
      const response = await requestAssessment({ ...authorization, signature }) as AssessmentResponse
      setAssessment(response)
      setAmount(String(response.assessment.recommendedPayoutOg))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Assessment failed.')
    } finally {
      setLoading(false)
    }
  }

  async function recordAssessment() {
    if (!assessment?.onchainPayload || !reliefFundAddress || !address) return
    const payload = assessment.onchainPayload
    const tx = await writeContractAsync({
      account: address,
      chain: galileo,
      address: reliefFundAddress,
      abi: aidLensAbi,
      functionName: 'recordAssessment',
      args: [BigInt(payload.claimId), payload.assessmentRoot, payload.receiptHash, payload.severity, BigInt(payload.recommendedAmountWei)],
    })
    setLastTransaction(tx)
  }

  async function approvePayout() {
    if (!assessment?.onchainPayload || !reliefFundAddress || !address) return
    const payload = assessment.onchainPayload
    const recommended = assessment.assessment.recommendedPayoutOg
    const nextAmount = Number(amount)
    const noteHash = nextAmount === recommended ? `0x${'0'.repeat(64)}` as const : keccak256(stringToBytes(`NGO override: ${nextAmount} 0G`))
    const tx = await writeContractAsync({
      account: address,
      chain: galileo,
      address: reliefFundAddress,
      abi: aidLensAbi,
      functionName: 'approveAndPay',
      args: [BigInt(payload.claimId), BigInt(Math.round(nextAmount * 1e6)) * 10n ** 12n, noteHash],
    })
    setLastTransaction(tx)
  }

  async function requestMoreInfo() {
    if (!reliefFundAddress || !address || !reviewNote.trim() || !selectedClaimId) return
    const tx = await writeContractAsync({
      account: address,
      chain: galileo,
      address: reliefFundAddress,
      abi: aidLensAbi,
      functionName: 'requestMoreInfo',
      args: [BigInt(selectedClaimId), keccak256(stringToBytes(reviewNote.trim()))],
    })
    setLastTransaction(tx)
  }

  async function rejectClaim() {
    if (!reliefFundAddress || !address || !reviewNote.trim() || !selectedClaimId) return
    const tx = await writeContractAsync({
      account: address,
      chain: galileo,
      address: reliefFundAddress,
      abi: aidLensAbi,
      functionName: 'rejectClaim',
      args: [BigInt(selectedClaimId), keccak256(stringToBytes(reviewNote.trim()))],
    })
    setLastTransaction(tx)
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-300">NGO operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Relief review console</h1><p className="mt-2 text-sm text-muted-foreground">AI triages evidence. A reviewer owns the decision and signs every payout.</p></div>
        <StatusBadge label={contractConfigured ? 'Contract configured' : 'Preview contract'} tone={contractConfigured ? 'teal' : 'amber'} />
      </div>

      {error && <Alert variant="destructive" className="mb-6"><TriangleAlert className="size-4" /><AlertTitle>Action blocked</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.92fr]">
        <Card className="overflow-hidden border-white/8 bg-card/70">
          <CardHeader><CardTitle>Active claims</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Urgency</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Recommendation</TableHead></TableRow></TableHeader>
              <TableBody>{claims.map((claim) => <TableRow key={claim.id} className={selected.id === claim.id ? 'bg-teal-400/[0.05]' : ''}><TableCell><button type="button" className="text-left" aria-pressed={selected.id === claim.id} onClick={() => { setSelectedId(claim.id); setAmount(String(claim.recommendedOg)); setAssessment(undefined) }}><span className="block font-medium text-white">#{claim.id}</span><span className="text-xs text-muted-foreground">{claim.district}</span></button></TableCell><TableCell><StatusBadge label={claim.urgency} tone={claim.urgency === 'Critical' ? 'coral' : claim.urgency === 'High' ? 'amber' : 'neutral'} /></TableCell><TableCell className="text-sm text-slate-300">{claim.status}</TableCell><TableCell className="text-right font-mono text-sm">{claim.recommendedOg} 0G</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-white/8 bg-card/70">
          <CardHeader><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Selected claim</p><CardTitle className="mt-1">#{selected.id}</CardTitle></div><StatusBadge label={assessment?.assessment.executionMode === 'verified-replay' ? 'Verified replay' : assessment?.assessment.teeVerified ? 'TEE verified' : 'Not verified'} tone={assessment?.assessment.teeVerified ? 'teal' : 'amber'} /></div></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-3">{[[selected.district, 'District'], [`${selected.household}`, 'People'], [selected.displaced ? 'Yes' : 'No', 'Displaced']].map(([value, label]) => <div key={label} className="rounded-lg border border-white/8 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-medium text-white" title={value}>{value}</p></div>)}</div>

            {!assessment ? (
              <div className="rounded-xl border border-dashed border-white/12 p-6 text-center"><BrainCircuit className="mx-auto size-7 text-teal-300" /><p className="mt-3 text-sm font-medium text-white">Run the private assessment</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Requires this browser's submitted evidence and an assessor wallet signature. Preview results never become payout-eligible.</p><Button className="mt-5" disabled={loading || !isConnected || !storedClaim || !selectedClaimId} onClick={() => void runAssessment()}>{loading ? 'Running 0G pipeline…' : 'Run 0G assessment'}</Button></div>
            ) : (
              <div className="space-y-5">
                {!assessment.payEligible && <Alert className="border-amber-400/20 bg-amber-400/[0.06]"><LockKeyhole className="size-4 text-amber-300" /><AlertTitle>{assessment.assessment.executionMode === 'verified-replay' ? 'Verified replay · payout locked' : 'Synthetic preview only'}</AlertTitle><AlertDescription>{assessment.warning}</AlertDescription></Alert>}
                <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Evidence consistency</span><span className="font-mono text-white">{assessment.assessment.evidenceConsistency.score}%</span></div><Progress value={assessment.assessment.evidenceConsistency.score} /></div>
                <div className="space-y-3">{assessment.assessment.observations.map((observation) => <div key={`${observation.source}-${observation.finding}`} className="flex gap-3 rounded-lg border border-white/8 p-3"><FileSearch className="mt-0.5 size-4 shrink-0 text-teal-300" /><div><p className="text-sm text-slate-200">{observation.finding}</p><p className="mt-1 text-[11px] text-muted-foreground">{Math.round(observation.confidence * 100)}% confidence · {observation.source}</p></div></div>)}</div>
                <div className="space-y-2"><Label htmlFor="payout">Reviewer payout amount</Label><div className="flex gap-2"><Input id="payout" type="number" min="1" max="12" value={amount} onChange={(event) => setAmount(event.target.value)} /><span className="grid w-16 place-items-center rounded-md border border-white/8 font-mono text-sm">0G</span></div></div>
                <div className="space-y-2"><Label htmlFor="review-note">Review note</Label><Input id="review-note" value={reviewNote} maxLength={500} onChange={(event) => setReviewNote(event.target.value)} /><p className="text-[11px] text-muted-foreground">Only its hash is written onchain.</p></div>
                <div className="flex flex-wrap gap-2"><Button disabled={!assessment.payEligible || transactionPending} onClick={() => void recordAssessment()}><ShieldCheck className="size-4" /> Record verified assessment</Button><Button variant="outline" disabled={!assessment.payEligible || transactionPending || Number(amount) < 1 || Number(amount) > 12} onClick={() => void approvePayout()}><CheckCircle2 className="size-4" /> Approve & pay</Button><Button variant="outline" disabled={!contractConfigured || !reviewNote.trim() || transactionPending || !selectedClaimId} onClick={() => void requestMoreInfo()}><MessageSquareWarning className="size-4" /> Request info</Button><Button variant="destructive" disabled={!contractConfigured || !reviewNote.trim() || transactionPending || !selectedClaimId} onClick={() => void rejectClaim()}><XCircle className="size-4" /> Reject</Button></div>
              </div>
            )}
            {lastTransaction && <a className="flex items-center gap-2 text-xs text-teal-300 hover:underline" href={`${chainScanUrl}/tx/${lastTransaction}`} target="_blank" rel="noreferrer">Open transaction on ChainScan <ExternalLink className="size-3.5" /></a>}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

const payoutBySeverity = [0, 1, 3, 5, 8, 12] as const

function storedClaimToDemoClaim(id: string, claim: StoredClaim): DemoClaim {
  const severity = claim.intake.displaced ? 4 : 3
  const districtFallback = demoClaims.find((demo) => demo.districtCode === claim.intake.districtCode) ?? demoClaims[0]
  const location = claim.intake.approximateLocation
    ? [claim.intake.approximateLocation.longitude, claim.intake.approximateLocation.latitude] as [number, number]
    : districtFallback.location

  return {
    id,
    district: claim.intake.districtName,
    districtCode: claim.intake.districtCode,
    household: claim.intake.householdSize,
    displaced: claim.intake.displaced,
    urgency: claim.intake.displaced ? 'High' : 'Moderate',
    severity,
    status: 'Submitted',
    recommendedOg: payoutBySeverity[severity],
    submitted: new Date(claim.createdAt).toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    location,
  }
}
