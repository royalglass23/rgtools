'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WeekLeads, WeekPipeline } from './kpis'

function shortWeek(week: string) {
  // '2026-W26' → 'W26'
  return week.split('-')[1] ?? week
}

function LeadsPerWeekChart({ data }: { data: WeekLeads[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded p-5 space-y-3">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Leads per week</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [v, 'Leads']} labelFormatter={(l) => shortWeek(String(l))} />
          <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function QuotePipelineChart({ data }: { data: WeekPipeline[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded p-5 space-y-3">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Quote pipeline by week</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(l) => shortWeek(String(l))} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="hot" stackId="a" fill="#ef4444" />
          <Bar dataKey="warm" stackId="a" fill="#f97316" />
          <Bar dataKey="cold" stackId="a" fill="#6b7280" />
          <Bar dataKey="dead" stackId="a" fill="#d1d5db" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartSection({
  leadsPerWeek,
  pipelineByWeek,
}: {
  leadsPerWeek: WeekLeads[]
  pipelineByWeek: WeekPipeline[]
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Trends (last 8 weeks)</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LeadsPerWeekChart data={leadsPerWeek} />
        <QuotePipelineChart data={pipelineByWeek} />
      </div>
    </section>
  )
}
