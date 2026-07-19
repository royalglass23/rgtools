import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartSection } from "@/modules/dashboard/ChartSection";
import { getDashboardTables } from "@/modules/dashboard/config";
import {
  getDashboardActionCounts,
  getDashboardChartData,
  getDashboardKpis,
} from "@/modules/dashboard/kpis";
import { SERVER_TABLES } from "@/modules/dashboard/registry";
import { getTableMeta } from "@/modules/dashboard/tables";
import { auth } from "@/lib/auth";
import {
  DataPanel,
  FeedbackState,
  PageHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/precision-ui/PrecisionUI";
import styles from "./dashboard.module.css";
import { DismissibleNotice } from "@/modules/ui/DismissibleNotice";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const denied = typeof params.denied === "string" ? params.denied : undefined;
  const isAdmin = session.user.role === "admin";

  const [actionCounts, kpis, chartData] = await Promise.all([
    getDashboardActionCounts(),
    getDashboardKpis(),
    getDashboardChartData(),
  ]);

  const config = await getDashboardTables();
  const sections = await Promise.all(
    config.map(async (entry) => {
      const meta = getTableMeta(entry.key);
      const server = SERVER_TABLES[entry.key];
      if (!meta || !meta.available || !server) return null;
      const content = await server.render({
        searchParams: params,
        filter: entry.filter,
        isAdmin,
      });
      return { key: entry.key, label: meta.label, content };
    }),
  );
  const visibleSections = sections.filter((section) => section !== null);
  const firstName = session.user.name?.trim().split(/\s+/)[0];

  return (
    <div className={styles.dashboard}>
      <PageHeader
        eyebrow="Royal Glass operations"
        title="Operations dashboard"
        description={
          <p>
            {firstName ? `Welcome back, ${firstName}. ` : ""}
            Here&apos;s what needs attention across the business.
          </p>
        }
        actions={
          <div className={styles.liveStatus}>
            <span aria-hidden="true" />
            Live overview
          </div>
        }
      />

      {denied !== undefined && (
        <DismissibleNotice tone="warning" noticeKey={denied}>
          You don&apos;t have access to that tool.
        </DismissibleNotice>
      )}

      <ActionsNeededSection counts={actionCounts} />

      <div className={styles.dashboardFocusGrid}>
        {isAdmin ? (
          <ChartSection
            metrics={businessMetrics(kpis)}
            leadsPerWeek={chartData.leadsPerWeek}
            pipelineByWeek={chartData.pipelineByWeek}
          />
        ) : (
          <DataPanel title="Business performance" eyebrow="Manager view">
            <div className={styles.restrictedPanel}>
              Business performance is available to administrators.
            </div>
          </DataPanel>
        )}
        <NextActionsSection counts={actionCounts} />
      </div>

      <RecommendationsSection counts={actionCounts} />

      {visibleSections.length === 0 ? (
        <FeedbackState tone="empty">
          No dashboard tables selected. An admin can choose them in Dashboard
          Settings.
        </FeedbackState>
      ) : (
        visibleSections.map((section) => (
          <DataPanel
            key={section.key}
            title={section.label}
            eyebrow="Live data"
          >
            {section.content}
          </DataPanel>
        ))
      )}
    </div>
  );
}

type DashboardKpis = {
  pipelineValue: number;
  conversionRate: number;
  volumeTrend: number;
  leadVolume: number;
};

function businessMetrics(kpis: DashboardKpis) {
  const formattedPipeline =
    kpis.pipelineValue >= 1_000_000
      ? `$${(kpis.pipelineValue / 1_000_000).toFixed(1)}m`
      : `$${Math.round(kpis.pipelineValue).toLocaleString("en-AU")}`;

  const trendPositive = kpis.volumeTrend > 0;
  const trendNeutral = kpis.volumeTrend === 0;
  const leadTrend = trendNeutral
    ? "Current 30-day volume"
    : `${trendPositive ? "+" : ""}${kpis.volumeTrend}% vs previous 30 days`;

  return [
    {
      label: "Pipeline value",
      value: formattedPipeline,
      detail: "Active hot and warm quotes",
      tone: "brand" as const,
    },
    {
      label: "Conversion rate",
      value: `${kpis.conversionRate}%`,
      detail: "Won quotes out of all closed quotes",
      tone: "positive" as const,
    },
    {
      label: "Lead volume",
      value: kpis.leadVolume.toLocaleString("en-AU"),
      detail: leadTrend,
      tone: trendPositive ? ("positive" as const) : ("neutral" as const),
    },
  ];
}

type ActionCounts = {
  staleLeads: number;
  unsynced: number;
  expiringSoon: number;
  neverOpened: number;
  forwarding: number;
  goneCold: number;
};

type ActionTone = "critical" | "warning" | "info" | "muted";

type DashboardAction = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: ActionTone;
  area: "Leads" | "Quote Tracker";
  recommendation: string;
  recommendationDetail: string;
};

function dashboardActions(counts: ActionCounts): DashboardAction[] {
  return [
    {
      id: "unsynced",
      label: "No ServiceM8 job",
      count: counts.unsynced,
      href: "/leads?sm8=pending",
      tone: "critical",
      area: "Leads",
      recommendation: "Link high-priority leads to ServiceM8",
      recommendationDetail:
        "Tier A and B leads are waiting for an operational job record.",
    },
    {
      id: "stale",
      label: "Stale leads",
      count: counts.staleLeads,
      href: "/leads?stale=true",
      tone: "warning",
      area: "Leads",
      recommendation: "Clear the stale-lead queue",
      recommendationDetail:
        "Review ownership and record the next follow-up for leads older than seven days.",
    },
    {
      id: "expiring",
      label: "Quotes expiring soon",
      count: counts.expiringSoon,
      href: "/quote-tracker?activity=expiring",
      tone: "warning",
      area: "Quote Tracker",
      recommendation: "Contact clients before their quote expires",
      recommendationDetail:
        "Prioritise active hot and warm quotes approaching their expiry date.",
    },
    {
      id: "never-opened",
      label: "Quotes never opened",
      count: counts.neverOpened,
      href: "/quote-tracker?activity=never_opened",
      tone: "info",
      area: "Quote Tracker",
      recommendation: "Check delivery for unopened quotes",
      recommendationDetail:
        "Confirm the client received the quote and resend it when necessary.",
    },
    {
      id: "forwarding",
      label: "Forwarding suspected",
      count: counts.forwarding,
      href: "/quote-tracker?activity=forwarding",
      tone: "info",
      area: "Quote Tracker",
      recommendation: "Review forwarded quote activity",
      recommendationDetail:
        "Check whether another decision-maker needs to be added to the follow-up.",
    },
    {
      id: "gone-cold",
      label: "Quotes gone cold",
      count: counts.goneCold,
      href: "/quote-tracker?activity=gone_cold",
      tone: "muted",
      area: "Quote Tracker",
      recommendation: "Re-engage hot and warm quotes",
      recommendationDetail:
        "Create a clear follow-up for quotes without recent engagement.",
    },
  ];
}

function ActionsNeededSection({ counts }: { counts: ActionCounts }) {
  const actions = dashboardActions(counts);
  const total = actions.reduce((sum, action) => sum + action.count, 0);

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitleRow}>
        <div>
          <SectionHeading title="Needs attention" eyebrow="Priority queue" />
          <p>Sorted by operational urgency across active modules.</p>
        </div>
        <span className={styles.attentionSummary}>
          {total > 0 ? `${total} items to review` : "All queues clear"}
        </span>
      </div>
      <div className={styles.attentionRail}>
        {actions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className={styles.attentionItem}
            data-tone={action.count > 0 ? action.tone : "clear"}
          >
            <span className={styles.attentionDot} aria-hidden="true" />
            <strong>{action.count}</strong>
            <span className={styles.attentionCopy}>
              <span>{action.label}</span>
              <small>{action.area}</small>
            </span>
            <span className={styles.attentionArrow} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NextActionsSection({ counts }: { counts: ActionCounts }) {
  const activeActions = dashboardActions(counts)
    .filter((action) => action.count > 0)
    .slice(0, 4);

  return (
    <DataPanel title="Next actions" eyebrow="Active modules">
      {activeActions.length > 0 ? (
        <div className={styles.nextActionList}>
          {activeActions.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={styles.nextActionRow}
            >
              <span
                className={styles.nextActionDot}
                data-tone={action.tone}
                aria-hidden="true"
              />
              <span className={styles.nextActionCopy}>
                <strong>{action.recommendation}</strong>
                <small>{action.area}</small>
              </span>
              <StatusBadge tone={action.tone}>{action.count} due</StatusBadge>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.clearState}>
          <strong>No immediate actions</strong>
          <span>All monitored queues are currently clear.</span>
        </div>
      )}
    </DataPanel>
  );
}

function RecommendationsSection({ counts }: { counts: ActionCounts }) {
  const recommendations = dashboardActions(counts)
    .filter((action) => action.count > 0)
    .slice(0, 3);

  return (
    <DataPanel title="Recommendations" eyebrow="Suggested focus">
      {recommendations.length > 0 ? (
        <div className={styles.recommendationList}>
          {recommendations.map((action, index) => (
            <Link
              key={action.id}
              href={action.href}
              className={styles.recommendationItem}
            >
              <span className={styles.recommendationNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong>{action.recommendation}</strong>
                <small>
                  {action.count} {action.label.toLowerCase()}.{" "}
                  {action.recommendationDetail}
                </small>
              </span>
              <span className={styles.recommendationArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.clearState}>
          <strong>Keep the current rhythm</strong>
          <span>
            No exception-based recommendations are required right now.
          </span>
        </div>
      )}
    </DataPanel>
  );
}
