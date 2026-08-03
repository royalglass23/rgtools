import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { quoteMovementRecords } from "@rgtools/db/schema-quote-movement";
import {
  listPendingQuoteMovementSummaries,
  recordQuoteMovementSummaryFailure,
  saveValidQuoteMovementSummary,
} from "./summary-repository";
import { generateQuoteMovementSummary } from "./summary";

export async function retryQuoteMovementSummary(
  recordId: string,
  _actorId: string | null = null,
) {
  const [record] = await db
    .select({ id: quoteMovementRecords.id, servicem8JobUuid: quoteMovementRecords.servicem8JobUuid })
    .from(quoteMovementRecords)
    .where(eq(quoteMovementRecords.id, recordId))
    .limit(1);
  if (!record) throw new Error("Quote Movement record was not found.");

  const [candidate] = await listPendingQuoteMovementSummaries(
    [record.servicem8JobUuid],
    db,
    { force: true },
  );
  if (!candidate) throw new Error("Quote Movement has no retained sources to summarise yet.");

  const attemptedAt = new Date();
  try {
    const summary = await generateQuoteMovementSummary(candidate);
    await saveValidQuoteMovementSummary({
      recordId: candidate.recordId,
      sourceFingerprint: candidate.sourceFingerprint,
      generatedAt: attemptedAt,
      summary,
    });
  } catch {
    await recordQuoteMovementSummaryFailure(
      candidate.recordId,
      candidate.hasValidSummary
        ? "What Matters Now could not update. The previous valid summary was kept."
        : "What Matters Now could not update. No summary is available yet; cached quote data was kept.",
      attemptedAt,
    );
    throw new Error("What Matters Now could not update. Please try again.");
  }
}
