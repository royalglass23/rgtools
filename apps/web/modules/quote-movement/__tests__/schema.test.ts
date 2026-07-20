import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from "@rgtools/db/schema-quote-movement";

describe("Quote Movement persistence", () => {
  it("uses the ServiceM8 job UUID as the stable cached-list identity", () => {
    const config = getTableConfig(quoteMovementRecords);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "servicem8_job_uuid",
        "servicem8_company_uuid",
        "servicem8_status",
        "servicem8_active",
        "job_number",
        "customer_name",
        "job_address",
        "quote_value_excluding_gst",
        "source_updated_at",
        "latest_activity_at",
        "source_coverage",
        "source_discovered_count",
        "source_unread_count",
        "source_unsupported_count",
        "source_failed_count",
        "source_coverage_details",
        "last_servicem8_synced_at",
      ]),
    );
    expect(
      config.indexes.find(
        (index) =>
          index.config.name === "quote_movement_records_servicem8_job_uuid_uq",
      )?.config.unique,
    ).toBe(true);
  });

  it("retains immutable source records behind a stable quote/type/source identity", () => {
    const config = getTableConfig(quoteMovementSources);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "quote_movement_record_id",
        "source_type",
        "source_identity",
        "occurred_at",
        "content",
        "first_discovered_at",
        "last_seen_at",
      ]),
    );
    expect(
      config.indexes.find(
        (index) => index.config.name === "quote_movement_sources_identity_uq",
      )?.config.unique,
    ).toBe(true);
    expect(
      config.indexes
        .find(
          (index) => index.config.name === "quote_movement_sources_identity_uq",
        )
        ?.config.columns.map((column) =>
          "name" in column ? column.name : null,
        ),
    ).toEqual(["quote_movement_record_id", "source_identity"]);
  });

  it("keeps RG-owned interpretation separate from immutable source data", () => {
    const config = getTableConfig(quoteMovementSourceEnrichment);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "source_id",
        "interpretation_status",
        "summary",
        "safe_error",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("keeps refresh outcomes separate from the cached quote rows", () => {
    const config = getTableConfig(quoteMovementRefreshRuns);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "actor_id",
        "status",
        "synced_count",
        "error_message",
        "created_at",
      ]),
    );
  });
});
