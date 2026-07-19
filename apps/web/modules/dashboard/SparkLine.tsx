'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { SparkPoint } from './kpis'
import styles from './SparkLine.module.css'

type TooltipValue = number | string | ReadonlyArray<number | string>
type TooltipName = number | string

export function SparkLine({ data, color = 'var(--brand-primary)' }: { data: SparkPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Tooltip
          content={SparkTooltip}
        />
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SparkTooltip<TValue extends TooltipValue, TName extends TooltipName>({
  active,
  payload,
}: TooltipContentProps<TValue, TName>) {
  if (!active || !payload?.length) return null
  return <div className={styles.tooltip}>{String(payload[0]?.value ?? '')}</div>
}
