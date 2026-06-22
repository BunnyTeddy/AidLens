import { useMemo } from 'react'
import { CheckCircle2, Clock3, ExternalLink, FileKey2, ShieldAlert, WalletCards } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/status-badge'
import { demoClaims } from '@/data/demo'
import { readStoredClaim } from '@/lib/claim-session'
import { chainScanUrl, storageScanUrl } from '@/lib/config'

export function ClaimDetailPage() {
  const { id = 'demo-2047' } = useParams()
  const demo = demoClaims.find((claim) => claim.id === id) ?? demoClaims[0]
  const stored = useMemo(() => {
    return readStoredClaim(id)
  }, [id])
  const legacySubmitTx = sessionStorage.getItem('aidlens:last-submit-tx') as `0x${string}` | null
  const submitTx = stored?.submitTx ?? legacySubmitTx ?? undefined
  const isLive = stored?.upload.storageMode === 'live' && Boolean(stored.claimId && submitTx)

  const roots = {
    evidence: stored?.upload.evidenceRoot ?? '0xb8d4…synthetic-preview-root',
    public: stored?.upload.publicRoot ?? '0x71c2…synthetic-public-root',
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge label={isLive ? 'Onchain submission' : 'Synthetic preview'} tone={isLive ? 'teal' : 'amber'} /><StatusBadge label={demo.status} tone="neutral" /></div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Claim #{id}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{stored?.intake.districtName ?? demo.district} · {stored?.claimId ? `onchain claim #${stored.claimId}` : `submitted ${demo.submitted}`}</p>
        </div>
        <Button asChild variant="outline"><Link to="/ngo">Open NGO review <ExternalLink className="size-4" /></Link></Button>
      </div>

      {!isLive && (
        <Alert className="mt-8 border-amber-400/20 bg-amber-400/[0.06]">
          <ShieldAlert className="size-4 text-amber-300" />
          <AlertTitle>Synthetic preview — not TEE verified</AlertTitle>
          <AlertDescription>This receipt demonstrates the product flow only. Configure 0G Storage, Compute, contract, and wallet credentials to create inspectable live roots.</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-white/8 bg-card/70">
          <CardHeader><CardTitle>Decision timeline</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {[
              { icon: CheckCircle2, title: 'Evidence manifest signed', detail: `${stored?.intake.householdSize ?? demo.household} people · ${stored?.intake.displaced ?? demo.displaced ? 'displaced' : 'not displaced'}`, done: true },
              { icon: FileKey2, title: 'Private evidence stored', detail: isLive ? '0G Galileo Turbo · ECIES encrypted' : 'In-memory preview adapter', done: true },
              { icon: Clock3, title: 'TEE assessment', detail: isLive ? 'Awaiting NGO-triggered model run' : 'Unavailable in preview mode', done: false },
              { icon: WalletCards, title: 'Human-reviewed payout', detail: 'No funds move without the NGO reviewer signature', done: false },
            ].map(({ icon: Icon, title, detail, done }, index) => (
              <div key={title} className="grid grid-cols-[36px_1fr] gap-4 pb-5">
                <div className="flex flex-col items-center"><span className={done ? 'grid size-8 place-items-center rounded-full bg-teal-400/12 text-teal-300' : 'grid size-8 place-items-center rounded-full bg-white/5 text-slate-500'}><Icon className="size-4" /></span>{index < 3 && <span className="mt-1 h-full w-px bg-white/8" />}</div>
                <div className="pt-1"><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/8 bg-card/70">
            <CardHeader><CardTitle>Public receipt</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReceiptRow label="District" value={stored?.intake.districtName ?? demo.district} />
              <ReceiptRow label="Severity" value={`${demo.severity} / 5 · preview`} />
              <ReceiptRow label="Recommendation" value={`${demo.recommendedOg} testnet 0G`} />
              <Separator />
              {stored?.claimId && <ReceiptRow label="Onchain claim" value={`#${stored.claimId}`} mono />}
              <ReceiptRow label="Evidence root" value={roots.evidence} mono />
              <ReceiptRow label="Public root" value={roots.public} mono />
              {isLive && stored && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" variant="outline"><a href={`${storageScanUrl}/file/${stored.upload.evidenceRoot}`} target="_blank" rel="noreferrer">StorageScan <ExternalLink className="size-3.5" /></a></Button>
                  {submitTx && <Button asChild size="sm" variant="outline"><a href={`${chainScanUrl}/tx/${submitTx}`} target="_blank" rel="noreferrer">ChainScan <ExternalLink className="size-3.5" /></a></Button>}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/8 bg-[#081a20] shadow-none">
            <CardContent className="p-5"><div className="flex gap-3"><FileKey2 className="mt-0.5 size-4 shrink-0 text-teal-300" /><p className="text-xs leading-5 text-slate-400">Public viewers never receive images, voice, narration, or precise coordinates. A storage root proves the evidence bundle without revealing its contents.</p></div></CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

function ReceiptRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className={mono ? 'max-w-[190px] truncate font-mono text-xs text-slate-300' : 'text-end text-slate-200'} title={value}>{value}</span></div>
}
