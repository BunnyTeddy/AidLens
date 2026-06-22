import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface MetricCardProps {
  label: string
  value: string
  detail: string
  icon: LucideIcon
}

export function MetricCard({ label, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <Card className="border-white/8 bg-card/70 shadow-none">
      <CardContent className="p-5">
        <div className="mb-7 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
          <Icon className="size-4 text-teal-300" aria-hidden="true" />
        </div>
        <p className="font-mono text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}
