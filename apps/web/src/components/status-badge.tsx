import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  label: string
  tone?: 'teal' | 'coral' | 'amber' | 'neutral'
}

const tones = {
  teal: 'border-teal-400/30 bg-teal-400/10 text-teal-300',
  coral: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  neutral: 'border-white/10 bg-white/5 text-slate-300',
} as const

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', tones[tone])}>
      {label}
    </Badge>
  )
}
