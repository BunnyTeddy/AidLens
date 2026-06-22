import { ArrowRight, Camera, CircleDollarSign, Eye, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'

const stages = [
  {
    icon: Camera,
    step: '01',
    title: 'Capture private evidence',
    body: 'A household shares flood images, a short voice report, and district-level context. Sensitive evidence is excluded from the public record.',
  },
  {
    icon: Sparkles,
    step: '02',
    title: 'Assess with verifiable AI',
    body: '0G vision and speech models produce structured observations. Each live run must pass TEE verification before it can reach review.',
  },
  {
    icon: CircleDollarSign,
    step: '03',
    title: 'Human approves payout',
    body: 'An NGO reviewer makes the final decision and signs the native testnet 0G payout. Donors can inspect every public receipt.',
  },
] as const

export function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-white/8">
        <div className="aidlens-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="absolute -right-24 top-0 size-[520px] rounded-full bg-teal-400/10 blur-[120px]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div>
            <div className="mb-7 flex flex-wrap gap-2">
              <StatusBadge label="0G Zero Cup 2026" tone="teal" />
              <StatusBadge label="Central Vietnam flood scenario" tone="neutral" />
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl">
              Relief decisions people can <span className="text-teal-300">inspect.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              AidLens turns private field evidence into a TEE-verifiable damage assessment, then keeps a human NGO reviewer in control of every payout.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-teal-400 text-[#061218] hover:bg-teal-300">
                <Link to="/claim">Start a synthetic claim <ArrowRight className="size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/12 bg-white/[0.03]">
                <Link to="/transparency"><Eye className="size-4" /> View public ledger</Link>
              </Button>
            </div>
          </div>

          <Card className="self-end border-white/10 bg-[#07161d]/90 shadow-2xl shadow-black/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Decision pipeline</p>
                  <p className="mt-1 text-lg font-medium text-white">Claim #demo-2047</p>
                </div>
                <StatusBadge label="Human review" tone="amber" />
              </div>
              <div className="mt-8 space-y-5">
                {[
                  ['Evidence stored', '0G Storage · encrypted'],
                  ['Vision assessment', 'Mainnet Compute · TEE required'],
                  ['Payout recommendation', '8 testnet 0G · policy-based'],
                ].map(([title, detail], index) => (
                  <div key={title} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-teal-400/30 bg-teal-400/10 font-mono text-xs text-teal-300">{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-100">{title}</p>
                      <p className="mt-1 text-xs text-slate-500">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-xs text-slate-400">
                <ShieldCheck className="size-4 text-teal-300" /> No AI result can release funds by itself.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Alert className="mb-12 border-amber-400/20 bg-amber-400/[0.06] text-amber-100">
          <ShieldCheck className="size-4" />
          <AlertTitle>Synthetic demo environment</AlertTitle>
          <AlertDescription className="text-amber-100/70">
            Every household, image, amount, and location shown here is synthetic. Preview mode never claims a TEE verification; live credentials are required for that badge.
          </AlertDescription>
        </Alert>
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-300">Three accountable steps</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Private where it matters. Public where it counts.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {stages.map(({ icon: Icon, step, title, body }) => (
            <Card key={step} className="border-white/8 bg-card/60 shadow-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-teal-400/10 text-teal-300"><Icon className="size-5" /></span>
                  <span className="font-mono text-xs text-slate-600">{step}</span>
                </div>
                <h3 className="mt-8 text-lg font-medium text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  )
}
