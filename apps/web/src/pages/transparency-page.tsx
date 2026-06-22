import { Banknote, Clock3, ExternalLink, HandCoins, Home, ShieldCheck } from 'lucide-react'
import { useAccount, useReadContracts, useWriteContract } from 'wagmi'
import { formatEther, parseEther, zeroAddress } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MetricCard } from '@/components/metric-card'
import { ReliefMap } from '@/components/relief-map'
import { StatusBadge } from '@/components/status-badge'
import { demoClaims, syntheticMetrics } from '@/data/demo'
import { aidLensAbi } from '@/lib/contract'
import { chainScanUrl, contractConfigured, galileo, reliefFundAddress } from '@/lib/config'

export function TransparencyPage() {
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()
  const contractAddress = reliefFundAddress ?? zeroAddress
  const { data: totals } = useReadContracts({
    allowFailure: true,
    contracts: ['totalDonated', 'totalPaid', 'claimCount'].map((functionName) => ({
      address: contractAddress,
      abi: aidLensAbi,
      functionName,
      chainId: galileo.id,
    })),
    query: { enabled: contractConfigured },
  })
  const liveDonated = totals?.[0]?.status === 'success' ? Number(formatEther(totals[0].result as bigint)) : undefined
  const livePaid = totals?.[1]?.status === 'success' ? Number(formatEther(totals[1].result as bigint)) : undefined
  const liveClaims = totals?.[2]?.status === 'success' ? Number(totals[2].result as bigint) : undefined
  const hasLiveMetrics = liveDonated !== undefined && livePaid !== undefined && liveClaims !== undefined

  async function donate() {
    if (!reliefFundAddress || !address) return
    await writeContractAsync({
      account: address,
      chain: galileo,
      address: reliefFundAddress,
      abi: aidLensAbi,
      functionName: 'donate',
      value: parseEther('1'),
    })
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-300">Public accountability</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Relief transparency ledger</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">District-level outcomes and fund movements are visible. Household evidence and precise coordinates are not.</p></div>
        <Button disabled={!contractConfigured || !address || isPending} onClick={() => void donate()}><HandCoins className="size-4" /> Donate 1 testnet 0G</Button>
      </div>

      <Alert className={hasLiveMetrics ? 'mb-7 border-teal-400/20 bg-teal-400/[0.05]' : 'mb-7 border-amber-400/20 bg-amber-400/[0.06]'}><ShieldCheck className={hasLiveMetrics ? 'size-4 text-teal-300' : 'size-4 text-amber-300'} /><AlertTitle>{hasLiveMetrics ? 'Live contract totals' : 'Synthetic dashboard'}</AlertTitle><AlertDescription>{hasLiveMetrics ? 'Treasury totals and claim count are read directly from AidLensReliefFund. Map markers and rows remain labelled synthetic demo scenarios.' : 'Metrics and map markers below demonstrate disclosure boundaries. They are not real donations, households, or TEE receipts.'}</AlertDescription></Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Donated" value={`${hasLiveMetrics ? liveDonated : syntheticMetrics.donated} 0G`} detail={hasLiveMetrics ? 'Read from contract' : 'Synthetic preview total'} icon={Banknote} />
        <MetricCard label="Paid" value={`${hasLiveMetrics ? livePaid : syntheticMetrics.allocated} 0G`} detail={hasLiveMetrics ? 'Human-approved onchain payouts' : 'Synthetic approved amount'} icon={HandCoins} />
        <MetricCard label="Claims" value={String(hasLiveMetrics ? liveClaims : syntheticMetrics.households)} detail={hasLiveMetrics ? 'Onchain submissions' : 'Across three demo districts'} icon={Home} />
        <MetricCard label="Median review" value={syntheticMetrics.medianReview} detail="Evidence to human decision" icon={Clock3} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-white/8 bg-card/70"><CardHeader><div className="flex items-center justify-between"><CardTitle>Approximate impact map</CardTitle><StatusBadge label="District level only" tone="teal" /></div></CardHeader><CardContent><ReliefMap /></CardContent></Card>
        <Card className="border-white/8 bg-card/70"><CardHeader><CardTitle>Disclosure policy</CardTitle></CardHeader><CardContent className="space-y-5">{[
          ['Public', 'District, household size, severity band, payout amount, roots and transaction hashes.'],
          ['Encrypted', 'Images, voice report, narration, exact location and full AI assessment.'],
          ['Human controlled', 'Reviewer decision, override reason and native 0G payout signature.'],
        ].map(([title, body]) => <div key={title} className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-teal-300" /><div><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div></div>)}<Button asChild variant="outline" size="sm"><a href={chainScanUrl} target="_blank" rel="noreferrer">Open Galileo ChainScan <ExternalLink className="size-3.5" /></a></Button></CardContent></Card>
      </div>

      <Card className="mt-6 overflow-hidden border-white/8 bg-card/70"><CardHeader><CardTitle>Public claim outcomes</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>District</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{demoClaims.map((claim) => <TableRow key={claim.id}><TableCell className="font-mono text-xs">#{claim.id}</TableCell><TableCell>{claim.district}</TableCell><TableCell>{claim.severity} / 5</TableCell><TableCell><StatusBadge label={claim.status} tone={claim.status === 'Paid' ? 'teal' : 'neutral'} /></TableCell><TableCell className="text-right font-mono">{claim.recommendedOg} 0G</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </section>
  )
}
