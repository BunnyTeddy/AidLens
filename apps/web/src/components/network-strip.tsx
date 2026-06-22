import { Activity, Cpu, Database, ShieldCheck } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { StatusBadge } from './status-badge'

export function NetworkStrip() {
  const status = useNetworkStatus()
  const mode = status.data?.mode ?? 'preview'

  return (
    <div className="border-y border-white/8 bg-[#07141b]/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-xs text-slate-400 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-slate-200">
          <Activity className="size-3.5 text-teal-300" aria-hidden="true" />
          0G systems
        </div>
        <div className="flex items-center gap-1.5"><Database className="size-3.5" /> Galileo Storage</div>
        <div className="flex items-center gap-1.5"><Cpu className="size-3.5" /> Mainnet Compute</div>
        <div className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Human-reviewed payouts</div>
        <div className="ms-auto">
          {status.isError ? (
            <StatusBadge label="API offline" tone="coral" />
          ) : mode === 'live' ? (
            <StatusBadge label="Live 0G mode" tone="teal" />
          ) : mode === 'partial' ? (
            <StatusBadge label="0G ready · contract pending" tone="amber" />
          ) : (
            <StatusBadge label="Synthetic preview" tone="amber" />
          )}
        </div>
      </div>
    </div>
  )
}
