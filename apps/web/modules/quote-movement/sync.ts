import {
  createServiceM8RequestFromEnv,
  type ServiceM8FetchRequest,
} from "@/lib/servicem8/client";
import {
  latestQuoteMovementActivity,
  quoteMovementSourceNoun,
} from "./source-history";
import type {
  QuoteMovementSummarizer,
  QuoteMovementSummaryRepository,
} from "./summary";

const ACTIVE_QUOTE_FILTER = "active eq 1 and status eq 'Quote'";
const ACTIVE_WORK_ORDER_FILTER = "active eq 1 and status eq 'Work Order'";
const ACTIVE_FILTER = "active eq 1";
const SERVICEM8_MAX_PAGES = 25;
const SOURCE_COLLECTION_CONCURRENCY = 4;

type ServiceM8QuoteJob = {
  uuid?: string | null;
  active?: number | string | boolean | null;
  status?: string | null;
  company_uuid?: string | null;
  generated_job_id?: string | null;
  job_address?: string | null;
  edit_date?: string | null;
};

type ServiceM8Company = {
  uuid?: string | null;
  name?: string | null;
};

type ServiceM8JobMaterial = {
  active?: number | string | boolean | null;
  job_uuid?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
};

type ServiceM8Note = {
  uuid?: string | null;
  note?: string | null;
  text?: string | null;
  body?: string | null;
  message?: string | null;
  action_required?: string | number | boolean | null;
  date?: string | null;
  create_date?: string | null;
  edit_date?: string | null;
  timestamp?: string | null;
};

type ServiceM8Email = {
  uuid?: string | null;
  subject?: string | null;
  message_text?: string | null;
  message_html?: string | null;
  body?: string | null;
  message?: string | null;
  text?: string | null;
  html?: string | null;
  direction?: string | null;
  sent_date?: string | null;
  date?: string | null;
  create_date?: string | null;
  edit_date?: string | null;
  timestamp?: string | null;
};

type ServiceM8Attachment = {
  uuid?: string | null;
  attachment_name?: string | null;
  attachment_source?: string | null;
  file_type?: string | null;
  active?: number | string | boolean | null;
  edit_date?: string | null;
  timestamp?: string | null;
};

export type QuoteMovementAttachmentInterpretation = {
  servicem8AttachmentUuid: string;
  status: "interpreted" | "unsupported" | "failed";
  summary: string | null;
};

export type QuoteMovementAttachmentInterpreter = (
  servicem8JobUuid: string,
) => Promise<{ files: QuoteMovementAttachmentInterpretation[] }>;

export type QuoteMovementTrackedEngagementEvent = {
  id: string;
  eventType: "open" | "download";
  occurredAt: Date;
};

export type QuoteMovementTrackedEngagementReader = (
  servicem8JobUuid: string,
) => Promise<QuoteMovementTrackedEngagementEvent[]>;

export type QuoteMovementInterpretationStatus =
  | "interpreted"
  | "unsupported"
  | "failed";

export type QuoteMovementSourceInput = {
  sourceType:
    | "note"
    | "email"
    | "file"
    | "photo"
    | "quote_change"
    | "tracked_open"
    | "tracked_download";
  sourceIdentity: string;
  occurredAt: Date | null;
  content: Record<string, unknown>;
  enrichment: {
    interpretationStatus: QuoteMovementInterpretationStatus;
    summary: string | null;
    safeError: string | null;
  };
};

export type QuoteMovementSourceCoverage = {
  status: "complete" | "incomplete";
  discoveredCount: number;
  unreadCount: number;
  unsupportedCount: number;
  failedCount: number;
  accessFailureCount: number;
  unretainedSourceCount: number;
  details: string[];
};

type QuoteMovementCoverageIssue = {
  discoveredCount: number;
  unreadCount: number;
  failedCount: number;
  detail: string;
};

export type QuoteMovementSnapshotInput = {
  servicem8JobUuid: string;
  servicem8CompanyUuid: string | null;
  servicem8Status: string;
  jobNumber: string | null;
  customerName: string;
  jobAddress: string | null;
  quoteValueExcludingGst: string | null;
  sourceUpdatedAt: Date | null;
  latestActivityAt: Date | null;
  sourceCoverage: QuoteMovementSourceCoverage;
  sources: QuoteMovementSourceInput[];
  lastServiceM8SyncedAt: Date;
};

export type QuoteMovementRefreshContext = {
  actorId: string | null;
  runId?: string;
  refreshedAt: Date;
  convertedJobUuids?: string[];
  partial?: boolean;
};

export interface QuoteMovementSnapshotRepository {
  replaceActiveSnapshot(
    records: QuoteMovementSnapshotInput[],
    context: QuoteMovementRefreshContext,
  ): Promise<void>;
  recordFailure(
    message: string,
    context: QuoteMovementRefreshContext,
  ): Promise<void>;
}

export async function syncQuoteMovementFromServiceM8({
  request = createServiceM8RequestFromEnv(),
  jobNumber,
  repository,
  summaryRepository,
  summarize,
  interpretAttachments = async () => ({ files: [] }),
  readTrackedEngagement = async () => [],
  actorId = null,
  runId,
  now = () => new Date(),
}: {
  request?: ServiceM8FetchRequest;
  jobNumber?: string;
  repository: QuoteMovementSnapshotRepository;
  summaryRepository?: QuoteMovementSummaryRepository;
  summarize?: QuoteMovementSummarizer;
  interpretAttachments?: QuoteMovementAttachmentInterpreter;
  readTrackedEngagement?: QuoteMovementTrackedEngagementReader;
  actorId?: string | null;
  runId?: string;
  now?: () => Date;
}) {
  const refreshedAt = now();
  const requestedJobNumber = clean(jobNumber);

  try {
    const [jobs, workOrderJobs] = await Promise.all([
      readServiceM8Array<ServiceM8QuoteJob>(
        request,
        `/job.json${odataFilter(
          requestedJobNumber
            ? `${ACTIVE_QUOTE_FILTER} and generated_job_id eq '${escapeOdataString(requestedJobNumber)}'`
            : ACTIVE_QUOTE_FILTER,
        )}`,
        "job",
      ),
      readServiceM8Array<ServiceM8QuoteJob>(
        request,
        `/job.json${odataFilter(
          requestedJobNumber
            ? `${ACTIVE_WORK_ORDER_FILTER} and generated_job_id eq '${escapeOdataString(requestedJobNumber)}'`
            : ACTIVE_WORK_ORDER_FILTER,
        )}`,
        "Work Order job",
      ),
    ]);
    const targetJobUuids = jobs
      .map((job) => clean(job.uuid))
      .filter((uuid): uuid is string => Boolean(uuid));
    const targetCompanyUuids = jobs
      .map((job) => clean(job.company_uuid))
      .filter((uuid): uuid is string => Boolean(uuid));
    const [companies, materials] = await Promise.all([
      readServiceM8Array<ServiceM8Company>(
        request,
        requestedJobNumber
          ? `/company.json${odataFilter(
              `uuid eq '${escapeOdataString(targetCompanyUuids[0] ?? "")}'`,
            )}`
          : "/company.json",
        "company",
      ),
      readServiceM8Array<ServiceM8JobMaterial>(
        request,
        `/jobmaterial.json${odataFilter(
          requestedJobNumber
            ? `${ACTIVE_FILTER} and job_uuid eq '${escapeOdataString(targetJobUuids[0] ?? "")}'`
            : ACTIVE_FILTER,
        )}`,
        "job material",
      ),
    ]);
    const records = await buildActiveQuoteSnapshot(
      jobs,
      companies,
      materials,
      refreshedAt,
      request,
      interpretAttachments,
      readTrackedEngagement,
    );

    const convertedJobUuids = Array.from(
      new Set(
        workOrderJobs.flatMap((job) => {
          const uuid = clean(job.uuid);
          return uuid ? [uuid] : [];
        }),
      ),
    );

    await repository.replaceActiveSnapshot(records, {
      actorId,
      runId,
      refreshedAt,
      convertedJobUuids,
      partial: Boolean(requestedJobNumber),
    });
    if (summaryRepository && summarize) {
      const candidates = await summaryRepository.listPendingSummaries(
        records.map((record) => record.servicem8JobUuid),
      );
      for (const candidate of candidates) {
        try {
          const summary = await summarize(candidate);
          await summaryRepository.saveValidSummary({
            recordId: candidate.recordId,
            sourceFingerprint: candidate.sourceFingerprint,
            generatedAt: refreshedAt,
            summary,
          });
        } catch {
          await summaryRepository.recordSummaryFailure(
            candidate.recordId,
            candidate.hasValidSummary
              ? "What Matters Now could not update. The previous valid summary was kept."
              : "What Matters Now could not update. No summary is available yet; cached quote data was kept.",
            refreshedAt,
          );
        }
      }
    }
    return { synced: records.length, refreshedAt };
  } catch (error) {
    const safeMessage = safeQuoteMovementRefreshError(error);
    try {
      await repository.recordFailure(safeMessage, { actorId, runId, refreshedAt });
    } catch {
      // The original refresh failure is the useful operator signal.
    }
    throw new Error(safeMessage);
  }
}

export function safeQuoteMovementRefreshError(error: unknown) {
  void error;
  return "Quote Movement could not refresh from ServiceM8. The previous cached list was kept.";
}

async function buildActiveQuoteSnapshot(
  jobs: ServiceM8QuoteJob[],
  companies: ServiceM8Company[],
  materials: ServiceM8JobMaterial[],
  refreshedAt: Date,
  request: ServiceM8FetchRequest,
  interpretAttachments: QuoteMovementAttachmentInterpreter,
  readTrackedEngagement: QuoteMovementTrackedEngagementReader,
): Promise<QuoteMovementSnapshotInput[]> {
  const companiesByUuid = new Map(
    companies.flatMap((company) => {
      const uuid = clean(company.uuid);
      return uuid ? [[uuid, clean(company.name)] as const] : [];
    }),
  );
  const valuesByJobUuid = quoteValuesByJobUuid(materials);
  const recordsByJobUuid = new Map<string, QuoteMovementSnapshotInput>();

  jobs.forEach((job, index) => {
    if (!isActive(job.active) || normalizeStatus(job.status) !== "quote")
      return;

    const servicem8JobUuid = clean(job.uuid);
    if (!servicem8JobUuid) {
      throw new Error(
        `ServiceM8 Quote Movement job at row ${index + 1} is invalid: job UUID is required.`,
      );
    }
    const servicem8CompanyUuid = clean(job.company_uuid);
    const jobNumber = clean(job.generated_job_id);

    recordsByJobUuid.set(servicem8JobUuid, {
      servicem8JobUuid,
      servicem8CompanyUuid,
      servicem8Status: "Quote",
      jobNumber,
      customerName:
        (servicem8CompanyUuid
          ? companiesByUuid.get(servicem8CompanyUuid)
          : null) ??
        jobNumber ??
        "Unknown customer",
      jobAddress: clean(job.job_address),
      quoteValueExcludingGst: valuesByJobUuid.get(servicem8JobUuid) ?? null,
      sourceUpdatedAt: parseDate(job.edit_date),
      latestActivityAt: null,
      sourceCoverage: completeCoverage(0),
      sources: [],
      lastServiceM8SyncedAt: refreshedAt,
    });
  });

  return mapWithConcurrency(
    Array.from(recordsByJobUuid.values()),
    SOURCE_COLLECTION_CONCURRENCY,
    async (record) => {
      const sourceResult = await readSourcesForJob(
        request,
        record.servicem8JobUuid,
        interpretAttachments,
        readTrackedEngagement,
      );
      return {
        ...record,
        latestActivityAt: latestQuoteMovementActivity(sourceResult.sources),
        sourceCoverage: coverageForSources(
          sourceResult.sources,
          sourceResult.coverageIssues,
        ),
        sources: sourceResult.sources,
      };
    },
  );
}

async function mapWithConcurrency<Input, Output>(
  inputs: Input[],
  concurrency: number,
  map: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const outputs = new Array<Output>(inputs.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, inputs.length) },
    async () => {
      while (nextIndex < inputs.length) {
        const index = nextIndex;
        nextIndex += 1;
        outputs[index] = await map(inputs[index]!);
      }
    },
  );
  await Promise.all(workers);
  return outputs;
}

async function readSourcesForJob(
  request: ServiceM8FetchRequest,
  servicem8JobUuid: string,
  interpretAttachments: QuoteMovementAttachmentInterpreter,
  readTrackedEngagement: QuoteMovementTrackedEngagementReader,
): Promise<{
  sources: QuoteMovementSourceInput[];
  coverageIssues: QuoteMovementCoverageIssue[];
}> {
  const jobFilter = odataFilter(
    `related_object_uuid eq '${escapeOdataString(servicem8JobUuid)}'`,
  );
  const [noteResult, emailResult, attachmentResult, engagementResult] =
    await Promise.all([
      readSourceCollection<ServiceM8Note>(
        request,
        `/note.json${jobFilter}`,
        "note",
      ),
      readSourceCollection<ServiceM8Email>(
        request,
        `/email.json${jobFilter}`,
        "email",
      ),
      readSourceCollection<ServiceM8Attachment>(
        request,
        `/attachment.json${jobFilter}`,
        "attachment",
      ),
      readTrackedEngagementSafely(servicem8JobUuid, readTrackedEngagement),
    ]);
  const notes = noteResult.rows;
  const emails = emailResult.rows;
  const attachments = attachmentResult.rows;
  const missingIdentityCount = [...notes, ...emails, ...attachments].filter(
    (source) => !clean(source.uuid),
  ).length;

  const interpretations = await attachmentInterpretations(
    servicem8JobUuid,
    attachments,
    interpretAttachments,
  );

  const sources: QuoteMovementSourceInput[] = [
    ...notes.flatMap((note) => {
      const sourceIdentity = clean(note.uuid);
      if (!sourceIdentity) return [];
      const occurredAt = sourceDate(note);
      const text = clean(note.note ?? note.text ?? note.body ?? note.message);
      const interpretation = structuredSourceInterpretation(
        Boolean(text),
        occurredAt,
      );
      return [
        {
          sourceType: "note" as const,
          sourceIdentity,
          occurredAt,
          content: {
            text,
            actionRequired: note.action_required ?? null,
          },
          enrichment: {
            interpretationStatus: interpretation.status,
            summary: null,
            safeError: interpretation.safeError,
          },
        },
      ];
    }),
    ...emails.flatMap((email) => {
      const sourceIdentity = clean(email.uuid);
      if (!sourceIdentity) return [];
      const occurredAt = sourceDate(email);
      const subject = clean(email.subject);
      const body = clean(
        email.message_text ??
          email.body ??
          email.message ??
          email.text ??
          email.message_html ??
          email.html,
      );
      const interpretation = structuredSourceInterpretation(
        Boolean(subject || body),
        occurredAt,
      );
      return [
        {
          sourceType: "email" as const,
          sourceIdentity,
          occurredAt,
          content: {
            subject,
            body,
            direction: clean(email.direction),
          },
          enrichment: {
            interpretationStatus: interpretation.status,
            summary: null,
            safeError: interpretation.safeError,
          },
        },
      ];
    }),
    ...attachments.flatMap((attachment) => {
      const sourceIdentity = clean(attachment.uuid);
      if (!sourceIdentity) return [];
      const interpretation = interpretations.get(sourceIdentity) ?? {
        status: "failed" as const,
        summary: null,
      };
      const sourceType = attachmentSourceType(attachment);
      return [
        {
          sourceType,
          sourceIdentity,
          occurredAt: sourceDate(attachment),
          content: {
            name: clean(attachment.attachment_name),
            fileType: clean(attachment.file_type),
            attachmentSource: clean(attachment.attachment_source),
            active: attachment.active ?? null,
          },
          enrichment: {
            interpretationStatus: interpretation.status,
            summary: interpretation.summary,
            safeError:
              interpretation.status === "unsupported"
                ? "This source has an unsupported file type."
                : interpretation.status === "failed"
                  ? "This source could not be interpreted."
                  : null,
          },
        },
      ];
    }),
    ...engagementResult.events.map((event) => ({
      sourceType:
        event.eventType === "download"
          ? ("tracked_download" as const)
          : ("tracked_open" as const),
      sourceIdentity: event.id,
      occurredAt: event.occurredAt,
      content: { eventType: event.eventType },
      enrichment: {
        interpretationStatus: "interpreted" as const,
        summary: null,
        safeError: null,
      },
    })),
  ];

  return {
    sources: deduplicateSources(sources),
    coverageIssues: [
      noteResult.issue,
      emailResult.issue,
      attachmentResult.issue,
      engagementResult.issue,
      missingIdentityCount > 0
        ? {
            discoveredCount: missingIdentityCount,
            unreadCount: missingIdentityCount,
            failedCount: missingIdentityCount,
            detail: `${missingIdentityCount} ServiceM8 ${quoteMovementSourceNoun(missingIdentityCount)} could not be retained because ${missingIdentityCount === 1 ? "its" : "their"} stable identity was missing.`,
          }
        : null,
    ].filter((issue): issue is QuoteMovementCoverageIssue => Boolean(issue)),
  };
}

function deduplicateSources(sources: QuoteMovementSourceInput[]) {
  const byIdentity = new Map<string, QuoteMovementSourceInput>();
  for (const source of sources) {
    const key = source.sourceIdentity;
    const existing = byIdentity.get(key);
    if (
      !existing ||
      (source.occurredAt?.getTime() ?? 0) >=
        (existing.occurredAt?.getTime() ?? 0)
    )
      byIdentity.set(key, source);
  }
  return Array.from(byIdentity.values());
}

async function readTrackedEngagementSafely(
  servicem8JobUuid: string,
  readTrackedEngagement: QuoteMovementTrackedEngagementReader,
) {
  try {
    return {
      events: await readTrackedEngagement(servicem8JobUuid),
      issue: null,
    };
  } catch {
    return {
      events: [],
      issue: {
        discoveredCount: 0,
        unreadCount: 1,
        failedCount: 1,
        detail: "Tracked quote engagement could not be read.",
      },
    };
  }
}

async function readSourceCollection<T>(
  request: ServiceM8FetchRequest,
  path: string,
  datasetName: "note" | "email" | "attachment",
): Promise<{ rows: T[]; issue: QuoteMovementCoverageIssue | null }> {
  try {
    return {
      rows: await readServiceM8Array<T>(request, path, datasetName),
      issue: null,
    };
  } catch {
    return {
      rows: [],
      issue: {
        discoveredCount: 0,
        unreadCount: 1,
        failedCount: 1,
        detail: `ServiceM8 ${datasetName} source history could not be read.`,
      },
    };
  }
}

async function attachmentInterpretations(
  servicem8JobUuid: string,
  attachments: ServiceM8Attachment[],
  interpretAttachments: QuoteMovementAttachmentInterpreter,
) {
  if (attachments.length === 0) {
    return new Map<string, QuoteMovementAttachmentInterpretation>();
  }

  try {
    const result = await interpretAttachments(servicem8JobUuid);
    return new Map(
      result.files.map((file) => [file.servicem8AttachmentUuid, file]),
    );
  } catch {
    return new Map<string, QuoteMovementAttachmentInterpretation>();
  }
}

function attachmentSourceType(
  attachment: ServiceM8Attachment,
): Extract<
  QuoteMovementSourceInput["sourceType"],
  "file" | "photo" | "quote_change"
> {
  const source = clean(attachment.attachment_source)?.toUpperCase();
  if (source === "QUOTE") return "quote_change";
  const fileType = clean(attachment.file_type)?.toLowerCase() ?? "";
  const name = clean(attachment.attachment_name)?.toLowerCase() ?? "";
  if (
    source === "PHOTO" ||
    fileType.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/.test(name)
  )
    return "photo";
  return "file";
}

function completeCoverage(
  discoveredCount: number,
): QuoteMovementSourceCoverage {
  return {
    status: "complete",
    discoveredCount,
    unreadCount: 0,
    unsupportedCount: 0,
    failedCount: 0,
    accessFailureCount: 0,
    unretainedSourceCount: 0,
    details: [],
  };
}

function coverageForSources(
  sources: QuoteMovementSourceInput[],
  coverageIssues: QuoteMovementCoverageIssue[],
): QuoteMovementSourceCoverage {
  const unsupportedCount = sources.filter(
    (source) => source.enrichment.interpretationStatus === "unsupported",
  ).length;
  const failedCount = sources.filter(
    (source) => source.enrichment.interpretationStatus === "failed",
  ).length;
  const issueUnreadCount = coverageIssues.reduce(
    (total, issue) => total + issue.unreadCount,
    0,
  );
  const issueFailedCount = coverageIssues.reduce(
    (total, issue) => total + issue.failedCount,
    0,
  );
  const unretainedSourceCount = coverageIssues.reduce(
    (total, issue) => total + issue.discoveredCount,
    0,
  );
  const unreadCount = unsupportedCount + failedCount + issueUnreadCount;
  const totalFailedCount = failedCount + issueFailedCount;
  const details: string[] = coverageIssues.map((issue) => issue.detail);
  if (unsupportedCount > 0) {
    details.push(
      `${unsupportedCount} ${quoteMovementSourceNoun(unsupportedCount)} ${unsupportedCount === 1 ? "has" : "have"} an unsupported file type.`,
    );
  }
  if (failedCount > 0) {
    details.push(
      `${failedCount} ${quoteMovementSourceNoun(failedCount)} could not be interpreted.`,
    );
  }

  return {
    status: unreadCount === 0 ? "complete" : "incomplete",
    discoveredCount: sources.length + unretainedSourceCount,
    unreadCount,
    unsupportedCount,
    failedCount: totalFailedCount,
    accessFailureCount: issueFailedCount,
    unretainedSourceCount,
    details,
  };
}

function sourceDate(source: {
  sent_date?: string | null;
  date?: string | null;
  create_date?: string | null;
  edit_date?: string | null;
  timestamp?: string | null;
}) {
  return parseDate(
    source.sent_date ??
      source.date ??
      source.edit_date ??
      source.create_date ??
      source.timestamp,
  );
}

function structuredSourceInterpretation(
  hasReadableContent: boolean,
  occurredAt: Date | null,
): { status: "interpreted" | "failed"; safeError: string | null } {
  if (hasReadableContent && occurredAt) {
    return { status: "interpreted", safeError: null };
  }
  if (!hasReadableContent && !occurredAt) {
    return {
      status: "failed",
      safeError: "This source had no readable content or valid activity date.",
    };
  }
  return {
    status: "failed",
    safeError: hasReadableContent
      ? "This source had no valid activity date."
      : "This source had no readable content.",
  };
}

function quoteValuesByJobUuid(materials: ServiceM8JobMaterial[]) {
  const totals = new Map<string, number>();
  const jobsWithActiveLines = new Set<string>();

  for (const material of materials) {
    if (!isActive(material.active)) continue;
    const jobUuid = clean(material.job_uuid);
    if (!jobUuid) continue;

    jobsWithActiveLines.add(jobUuid);
    const quantity = finiteNumber(material.quantity);
    const price = finiteNumber(material.price);
    totals.set(jobUuid, (totals.get(jobUuid) ?? 0) + quantity * price);
  }

  return new Map(
    Array.from(jobsWithActiveLines, (jobUuid) => [
      jobUuid,
      (totals.get(jobUuid) ?? 0).toFixed(2),
    ]),
  );
}

async function readServiceM8Array<T>(
  request: ServiceM8FetchRequest,
  path: string,
  datasetName: string,
) {
  const rows: T[] = [];
  const requestedCursors = new Set<string>();
  let cursor: string | null = "-1";

  while (cursor) {
    if (requestedCursors.size >= SERVICEM8_MAX_PAGES) {
      throw new Error(
        `ServiceM8 Quote Movement ${datasetName} pagination exceeded the ${SERVICEM8_MAX_PAGES}-page refresh limit.`,
      );
    }
    if (requestedCursors.has(cursor)) {
      throw new Error(
        `ServiceM8 Quote Movement ${datasetName} pagination repeated cursor ${cursor}.`,
      );
    }
    requestedCursors.add(cursor);

    const response = await request(serviceM8CursorPath(path, cursor));
    if (!response.ok) {
      throw new Error(
        `ServiceM8 Quote Movement refresh failed with HTTP ${response.status}.`,
      );
    }
    const pageRows = await response.json();
    if (!Array.isArray(pageRows)) {
      throw new Error(
        `ServiceM8 Quote Movement ${datasetName} response was invalid.`,
      );
    }
    const invalidRow = pageRows.findIndex(
      (row) => !row || typeof row !== "object" || Array.isArray(row),
    );
    if (invalidRow >= 0) {
      throw new Error(
        `ServiceM8 Quote Movement ${datasetName} response contained an invalid row.`,
      );
    }

    rows.push(...(pageRows as T[]));
    cursor = response.headers?.get("x-next-cursor")?.trim() || null;
  }

  return rows;
}

function serviceM8CursorPath(path: string, cursor: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}cursor=${encodeURIComponent(cursor)}`;
}

function odataFilter(expression: string) {
  return `?%24filter=${encodeURIComponent(expression)}`;
}

function escapeOdataString(value: string) {
  return value.replace(/'/g, "''");
}

function isActive(
  value: ServiceM8QuoteJob["active"] | ServiceM8JobMaterial["active"],
) {
  return value === true || value === 1 || value === "1";
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function clean(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function finiteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
