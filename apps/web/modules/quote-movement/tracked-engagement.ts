import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { quoteEvents, quotes } from "@rgtools/db/schema";
import type { QuoteMovementTrackedEngagementEvent } from "./sync";

export async function readQuoteMovementTrackedEngagement(
  servicem8JobUuid: string,
): Promise<QuoteMovementTrackedEngagementEvent[]> {
  const events = await db
    .select({
      id: quoteEvents.id,
      eventType: quoteEvents.eventType,
      occurredAt: quoteEvents.createdAt,
    })
    .from(quoteEvents)
    .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
    .where(
      and(
        eq(quotes.servicem8Uuid, servicem8JobUuid),
        inArray(quoteEvents.eventType, ["open", "download"]),
      ),
    );

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType === "download" ? "download" : "open",
    occurredAt: event.occurredAt,
  }));
}
