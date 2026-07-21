'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { SparkPoint } from './kpis'

export function SparkLine({ data, color = '#3b82f6' }: { data: SparkPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="rounded bg-gray-900 px-2 py-1 text-xs text-white">
                {payload[0]?.value}
              </div>
            )
          }}
        />
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  )
}
