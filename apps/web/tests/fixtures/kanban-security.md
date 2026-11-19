# Kanban isolated security lane

This lane runs the seven read-only dashboard journeys plus eleven security cases against real optimized Next, auth and PostgreSQL. Every source/AI endpoint is a fictional loopback adapter. It never calls a live bot, source account or production database. The exact database is `rg408_production_e2e` at `127.0.0.1:55442`; the sentinel is verified before mutations. The dedicated Playwright configuration fixes Chromium, one worker, zero retries, full HTML and retained failure traces. The versioned matrix has fourteen required rows.

On Windows, use the existing owned fixture PG cluster/bridge. Optional executable overrides are `RG408_PSQL`, `RG408_OPENSSL`, and `RG408_OPENSSL_CONF`; audit requires `RG408_PNPM_JS` pointing to the installed pnpm JavaScript entrypoint. On Linux the defaults are `psql`, `openssl`, and `pnpm` from PATH. The bridge resolves dependencies from this repository regardless of working directory:

```text
node apps/web/tests/fixtures/kanban-pg-bridge.mjs
node apps/web/tests/fixtures/kanban-publication-acceptance.mjs build
node apps/web/tests/fixtures/kanban-security-evidence.mjs audit
node apps/web/tests/fixtures/kanban-publication-acceptance.mjs security
node apps/web/tests/fixtures/kanban-security-evidence.mjs generate
node apps/web/tests/fixtures/kanban-security-evidence.mjs validate
```

Run the bridge in a separate terminal and stop that owned process afterward. The runner stops its own Next/adapter children. It uses a fixture-only HTTPS certificate trusted solely by the child process; no global TLS bypass or certificate-store change is allowed. Raw fixture credentials/key files are excluded from CI uploads.

`build` invokes Next directly with a sanitized local-only environment, without the package script's migration hook. Only historical main migrations0–73 may initialize the fictional database. No production migration runs. `security` captures current HEAD/tree, exact input hashes, optimized build ID and non-secret environment identity before executing the entire lane. Evidence validates those inputs again, all18 single-pass results, all14 matrix rows, actual source-write/AI counters, full HTML and the current lockfile's production audit. New source changes invalidate evidence. A dirty/untracked candidate is BLOCKED even when its tests pass; after approval/commit the complete lane must run again on that clean exact commit. `RG408_CANDIDATE_TREE` can record a lead-pinned preparation tree, but cannot grant release PASS.

The audit keeps every production advisory in its inventory, gates High/Critical paths under web/db/catalog, and rejects unknown dependency paths or mismatched summaries. Worker-only advisories remain visible outside this web integration charter. Lower-severity reachability and fix decisions still require the release owner's assessment. Local tests do not establish Vercel secrets/TLS/database privileges or live publisher readiness.

The GitHub workflow builds and validates fresh evidence on the actual PR head SHA before uploading artifacts. Its Linux execution is only proven by an actual successful workflow run; local Windows evidence must not be described as GitHub CI success.

Build provenance is written only after a successful direct build and fresh BUILD_ID, binding the build-time commit/tree and tracked web/database source hashes. A security run first invalidates its previous reports/receipt under its exact guarded ignored directory, then creates a unique run ID. Only a successful complete lane writes the matching report/HTML/metrics/build-hash completion receipt. Missing completion, prior reports, changed inputs or stale builds fail closed. A new approved commit requires a new helper build before its full lane.
