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
  parseQuoteMovementJobNumbers,
  safeQuoteMovementRefreshError,
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

export type QuoteMovementJobFetchOutcome =
  | { jobNumber: string; status: "queued" | "fetching" }
  | { jobNumber: string; status: "fetched" }
  | { jobNumber: string; status: "not_active" }
  | { jobNumber: string; status: "failed"; message: string };

export async function fetchQuoteMovementJobs({
  input,
  actorId = null,
  batchRunId,
  onStatus,
  sync = refreshQuoteMovementFromServiceM8,
}: {
  input: string;
  actorId?: string | null;
  batchRunId?: string;
  onStatus?: (jobNumber: string, status: "queued" | "fetching") => Promise<void>;
  sync?: (input: {
    actorId: string | null;
    jobNumber: string;
    batchRunId?: string;
  }) => Promise<Pick<QuoteMovementRefreshResult, "synced">>;
}) {
  const outcomes: QuoteMovementJobFetchOutcome[] = [];
  for (const jobNumber of parseQuoteMovementJobNumbers(input)) {
    await onStatus?.(jobNumber, "queued");
    await onStatus?.(jobNumber, "fetching");
    try {
      const result = await sync({ actorId, jobNumber, batchRunId });
      outcomes.push({
        jobNumber,
        status: result.synced > 0 ? "fetched" : "not_active",
      });
    } catch (error) {
      outcomes.push({
        jobNumber,
        status: "failed",
        message: safeQuoteMovementRefreshError(error),
      });
    }
  }
  return { outcomes };
}

let inFlightRefresh: Promise<QuoteMovementRefreshResult> | null = null;

export async function refreshQuoteMovementFromServiceM8({
  actorId,
  runId,
  jobNumber,
  batchRunId,
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
  batchRunId?: string;
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
    batchRunId,
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
    let completed = false;
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

export async function requestQuoteMovementJobFetch({
  actorId,
  input,
  coordinator = quoteMovementRefreshCoordinator,
  refresh = refreshQuoteMovementFromServiceM8,
  schedule,
}: {
  actorId: string | null;
  input: string;
  coordinator?: QuoteMovementRefreshCoordinator;
  refresh?: (input: {
    actorId: string | null;
    jobNumber: string;
    batchRunId: string;
  }) => Promise<QuoteMovementRefreshResult>;
  schedule: QuoteMovementBackgroundScheduler;
}): Promise<{ status: "requested" | "already_pending" }> {
  const request = await coordinator.request(actorId);
  if (!request.accepted) return { status: "already_pending" };

  schedule(async () => {
    let completed = false;
    try {
      const result = await fetchQuoteMovementJobs({
        actorId,
        input,
        batchRunId: request.runId,
        onStatus: coordinator.recordJobStatus
          ? (jobNumber, status) => coordinator.recordJobStatus!(actorId, jobNumber, request.runId, status)
          : undefined,
        sync: ({ actorId: syncActorId, jobNumber, batchRunId: syncBatchRunId }) =>
          refresh({ actorId: syncActorId, jobNumber, batchRunId: syncBatchRunId ?? request.runId }),
      });
      if (coordinator.complete) {
        await coordinator.complete(request.runId, result.outcomes);
      } else {
        await coordinator.finish(request.runId);
      }
      completed = true;
      return;
    } finally {
      if (!completed) await coordinator.finish(request.runId);
    }
  });

  return { status: "requested" };
}
