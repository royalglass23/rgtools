"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekLeads, WeekPipeline } from "./kpis";
import { SectionHeading } from "@/components/precision-ui/PrecisionUI";
import styles from "./ChartSection.module.css";

type PerformanceMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "brand" | "positive" | "neutral";
};

function shortWeek(week: string) {
  return week.split("-")[1] ?? week;
}

function buildWeeklyPerformance(
  leadsPerWeek: WeekLeads[],
  pipelineByWeek: WeekPipeline[],
) {
  const quotesByWeek = new Map(
    pipelineByWeek.map((week) => [
      week.week,
      week.hot + week.warm + week.cold + week.dead,
    ]),
  );

  return leadsPerWeek.map((week) => ({
    week: week.week,
    leads: week.count,
    quotes: quotesByWeek.get(week.week) ?? 0,
  }));
}

export function ChartSection({
  metrics,
  leadsPerWeek,
  pipelineByWeek,
}: {
  metrics: PerformanceMetric[];
  leadsPerWeek: WeekLeads[];
  pipelineByWeek: WeekPipeline[];
}) {
  const weeklyPerformance = buildWeeklyPerformance(
    leadsPerWeek,
    pipelineByWeek,
  );

  return (
    <section className={styles.performancePanel}>
      <div className={styles.panelHeader}>
        <div>
          <SectionHeading title="Business performance" />
          <p>Rolling 30-day metrics with an eight-week activity trend.</p>
        </div>
        <span className={styles.periodLabel}>Updated from live records</span>
      </div>

      <div className={styles.metricRow}>
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className={styles.metric}
            data-tone={metric.tone}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      <div
        className={styles.chartFrame}
        role="img"
        aria-label="Eight-week line chart comparing weekly lead volume with tracked ServiceM8 quotes"
      >
        <div className={styles.chartLegend} aria-hidden="true">
          <span>
            <i data-series="leads" /> Lead volume
          </span>
          <span>
            <i data-series="quotes" /> Tracked quotes
          </span>
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart
            data={weeklyPerformance}
            margin={{ top: 12, right: 18, left: 8, bottom: 12 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border-default)"
            />
            <XAxis
              dataKey="week"
              tickFormatter={shortWeek}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              height={34}
              label={{
                value: "Week",
                position: "insideBottomRight",
                offset: -8,
                fill: "var(--text-muted)",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="leads"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={42}
              label={{
                value: "Leads",
                angle: -90,
                position: "insideLeft",
                fill: "var(--text-muted)",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="quotes"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={46}
              label={{
                value: "Quotes",
                angle: 90,
                position: "insideRight",
                fill: "var(--text-muted)",
                fontSize: 11,
              }}
            />
            <Tooltip
              labelFormatter={(label) => `Week ${shortWeek(String(label))}`}
              formatter={(value, name) => [
                value,
                name === "leads" ? "Lead volume" : "Tracked quotes",
              ]}
              contentStyle={{
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-control)",
                background: "var(--surface-elevated)",
                color: "var(--text-primary)",
                boxShadow: "var(--shadow-raised)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-primary)", fontWeight: 700 }}
            />
            <Line
              yAxisId="leads"
              type="monotone"
              dataKey="leads"
              name="leads"
              stroke="var(--brand-primary)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="quotes"
              type="monotone"
              dataKey="quotes"
              name="quotes"
              stroke="var(--brand-highlight)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
