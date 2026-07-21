import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { quoteMovementRefreshRuns } from "@rgtools/db/schema-quote-movement";
import { QUOTE_MOVEMENT_REFRESH_WINDOW_SECONDS } from "./refresh-policy";

const REFRESH_LOCK_NAME = "quote-movement-refresh";
const ABANDONED_REFRESH_MESSAGE =
  "Quote Movement refresh did not finish. The previous cached data was kept.";

export type QuoteMovementRefreshRequest =
  | { accepted: true; runId: string }
  | { accepted: false };

export type QuoteMovementRefreshCoordinator = {
  request(actorId: string | null): Promise<QuoteMovementRefreshRequest>;
  finish(runId: string): Promise<void>;
};

export const quoteMovementRefreshCoordinator: QuoteMovementRefreshCoordinator =
  {
    async request(actorId) {
      const runId = crypto.randomUUID();
      const acquired = await db.execute(sql`
      INSERT INTO quote_movement_refresh_locks
        (lock_name, owner_id, lease_expires_at, updated_at)
      VALUES (
        ${REFRESH_LOCK_NAME},
        ${runId},
        now() + (${QUOTE_MOVEMENT_REFRESH_WINDOW_SECONDS} * INTERVAL '1 second'),
        now()
      )
      ON CONFLICT (lock_name) DO UPDATE
      SET owner_id = EXCLUDED.owner_id,
          lease_expires_at = EXCLUDED.lease_expires_at,
          updated_at = EXCLUDED.updated_at
      WHERE quote_movement_refresh_locks.lease_expires_at <= now()
      RETURNING lock_name
    `);

      if (acquired.rows.length === 0) return { accepted: false };

      try {
        await db.transaction(async (tx) => {
          const completedAt = new Date();
          await tx
            .update(quoteMovementRefreshRuns)
            .set({
              status: "failed",
              errorMessage: ABANDONED_REFRESH_MESSAGE,
              completedAt,
            })
            .where(eq(quoteMovementRefreshRuns.status, "pending"));
          await tx.insert(quoteMovementRefreshRuns).values({
            id: runId,
            actorId,
            status: "pending",
          });
        });
        return { accepted: true, runId };
      } catch (error) {
        await releaseRefreshLock(runId);
        throw error;
      }
    },

    async finish(runId) {
      await db
        .update(quoteMovementRefreshRuns)
        .set({
          status: "failed",
          errorMessage: ABANDONED_REFRESH_MESSAGE,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(quoteMovementRefreshRuns.id, runId),
            eq(quoteMovementRefreshRuns.status, "pending"),
          ),
        );
      await releaseRefreshLock(runId);
    },
  };

async function releaseRefreshLock(runId: string) {
  await db.execute(sql`
    DELETE FROM quote_movement_refresh_locks
    WHERE lock_name = ${REFRESH_LOCK_NAME}
      AND owner_id = ${runId}
  `);
}
