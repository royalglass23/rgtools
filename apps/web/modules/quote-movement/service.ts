import type { ServiceM8FetchRequest } from "@/lib/servicem8/client";
import { buildServiceM8FileContext } from "@/modules/ai-guidance/servicem8-file-context";
import { quoteMovementSnapshotRepository } from "./repository";
import { quoteMovementSummaryRepository } from "./summary-repository";
import {
  generateQuoteMovementSummary,
  type QuoteMovementSummarizer,
  type QuoteMovementSummaryRepository,
} from "./summary";
import {
  syncQuoteMovementFromServiceM8,
  type QuoteMovementAttachmentInterpreter,
  type QuoteMovementSnapshotRepository,
  type QuoteMovementTrackedEngagementReader,
} from "./sync";
import { readQuoteMovementTrackedEngagement } from "./tracked-engagement";
import {
  quoteMovementRefreshCoordinator,
  type QuoteMovementRefreshCoordinator,
} from "./refresh-coordinator";

type QuoteMovementRefreshResult = Awaited<
  ReturnType<typeof syncQuoteMovementFromServiceM8>
>;

let inFlightRefresh: Promise<QuoteMovementRefreshResult> | null = null;

export async function refreshQuoteMovementFromServiceM8({
  actorId,
  runId,
  jobNumber,
  request,
  repository = quoteMovementSnapshotRepository,
  summaryRepository = quoteMovementSummaryRepository,
  summarize = generateQuoteMovementSummary,
  interpretAttachments = (servicem8JobUuid) =>
    buildServiceM8FileContext({ servicem8JobUuid }),
  readTrackedEngagement = readQuoteMovementTrackedEngagement,
}: {
  actorId: string | null;
  runId?: string;
  jobNumber?: string;
  request?: ServiceM8FetchRequest;
  repository?: QuoteMovementSnapshotRepository;
  summaryRepository?: QuoteMovementSummaryRepository;
  summarize?: QuoteMovementSummarizer;
  interpretAttachments?: QuoteMovementAttachmentInterpreter;
  readTrackedEngagement?: QuoteMovementTrackedEngagementReader;
}) {
  if (inFlightRefresh) return inFlightRefresh;

  const refresh = syncQuoteMovementFromServiceM8({
    actorId,
    runId,
    jobNumber,
    request,
    repository,
    summaryRepository,
    summarize,
    interpretAttachments,
    readTrackedEngagement,
  });
  inFlightRefresh = refresh;

  try {
    return await refresh;
  } finally {
    if (inFlightRefresh === refresh) inFlightRefresh = null;
  }
}

type QuoteMovementBackgroundScheduler = (work: () => Promise<void>) => void;

export async function requestQuoteMovementRefresh({
  actorId,
  jobNumber,
  coordinator = quoteMovementRefreshCoordinator,
  refresh = refreshQuoteMovementFromServiceM8,
  schedule,
}: {
  actorId: string | null;
  jobNumber?: string;
  coordinator?: QuoteMovementRefreshCoordinator;
  refresh?: (input: {
    actorId: string | null;
    runId: string;
    jobNumber?: string;
  }) => Promise<QuoteMovementRefreshResult>;
  schedule: QuoteMovementBackgroundScheduler;
}): Promise<{ status: "requested" | "already_pending" }> {
  const request = await coordinator.request(actorId);
  if (!request.accepted) return { status: "already_pending" };

  schedule(async () => {
    try {
      await refresh({
        actorId,
        runId: request.runId,
        ...(jobNumber ? { jobNumber } : {}),
      });
    } catch {
      // The refresh use case records a staff-safe failure and preserves the cache.
    } finally {
      await coordinator.finish(request.runId);
    }
  });

  return { status: "requested" };
}
