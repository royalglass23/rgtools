import type { ServiceM8FetchRequest } from "@/lib/servicem8/client";
import { buildServiceM8FileContext } from "@/modules/ai-guidance/servicem8-file-context";
import { quoteMovementSnapshotRepository } from "./repository";
import {
  syncQuoteMovementFromServiceM8,
  type QuoteMovementAttachmentInterpreter,
  type QuoteMovementSnapshotRepository,
  type QuoteMovementTrackedEngagementReader,
} from "./sync";
import { readQuoteMovementTrackedEngagement } from "./tracked-engagement";

type QuoteMovementRefreshResult = Awaited<
  ReturnType<typeof syncQuoteMovementFromServiceM8>
>;

let inFlightRefresh: Promise<QuoteMovementRefreshResult> | null = null;

export async function refreshQuoteMovementFromServiceM8({
  actorId,
  request,
  repository = quoteMovementSnapshotRepository,
  interpretAttachments = (servicem8JobUuid) =>
    buildServiceM8FileContext({ servicem8JobUuid }),
  readTrackedEngagement = readQuoteMovementTrackedEngagement,
}: {
  actorId: string | null;
  request?: ServiceM8FetchRequest;
  repository?: QuoteMovementSnapshotRepository;
  interpretAttachments?: QuoteMovementAttachmentInterpreter;
  readTrackedEngagement?: QuoteMovementTrackedEngagementReader;
}) {
  if (inFlightRefresh) return inFlightRefresh;

  const refresh = syncQuoteMovementFromServiceM8({
    actorId,
    request,
    repository,
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
