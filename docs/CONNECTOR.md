# Aggregate connector contract

The first usable path is reviewed CSV. The PostHog cloud adapter is implemented against the documented Endpoints API but remains **unverified on a live tenant**. Keep real deployment reconciliation as an explicit acceptance gate. No OAuth installation, arbitrary host, raw event export, direct `/query` execution, or automatic event mapping is enabled.

## Aggregate CSV

Use **Data & Settings → Aggregate CSV → Template** after approving a metric definition. Required columns, in the generated template's order:

```csv
period,cohort_start,cohort_end,segment,signups,activated,retained,retained_activated
earlier,2026-07-01,2026-07-07,Organic,600,300,180,150
later,2026-07-22,2026-07-28,Organic,240,120,72,60
```

This abbreviated example is fabricated; use the application template for the complete two-segment fixture. Counts must be nonnegative integers, numerators cannot exceed denominators, and the A7/W4 intersection must be possible. Dates are inclusive UTC signup dates; periods must be disjoint and ordered. Up to 2,000 rows / 5 MB are accepted. Combine small cells before import. Do not upload emails, person IDs or raw event histories.

Confirm source name, analysis cutoff, definitions, identity, completeness and sampling. Unchecked quality items remain unverified. The API also accepts JSON at `POST /api/v1/projects/{id}/analytics/import`; inspect `docs/openapi.json` for the authoritative request route/schema. A successful import atomically creates one immutable snapshot and Decision Brief. Invalid imports leave the prior brief intact.

## PostHog cloud

PostHog's API documents endpoint retrieval by name/version and execution with a pinned version. Execution uses `endpoint:read`; installing or modifying an endpoint uses a distinct write scope. ConceptBench only reads and executes an already reviewed endpoint. [Official Endpoints API](https://posthog.com/docs/api/endpoints).

Choose US (`https://us.posthog.com`) or EU (`https://eu.posthog.com`). Create a project-restricted **personal** API key for project/endpoint reads. Catalog discovery additionally needs event/property-definition read access. Do not use an event-capture token. Supply the numeric project ID, endpoint name, version, and approved local metric contract.

The connection verifies project identity, endpoint availability and its exposed query definition before encrypting the key. It fingerprints that definition and checks it before every refresh. An absent definition, changed mapping, inactive endpoint or unrecognized schema requires reconciliation. A refresh never installs a recipe or repairs a provider definition on its own.

A compatible endpoint must accept `date_from` and `date_to` variables and return the eight aggregate columns above in that exact order. Its response must contain array rows, `hasMore: false` and the requested `endpoint_version`. These checks follow the documented response envelope; generated examples and provider mocks are not proof that a particular query computes the intended metric.

A tenant-specific query must implement first eligible signup over sufficient history, canonical identified-user identity, internal-traffic exclusion, signup-time segment assignment, disjoint period allocation and half-open elapsed windows. The date variables bound the analysis scope, not the lookback used to establish first signup. Do not deploy a generic “count matching events” query and assume it satisfies this contract. Review its query with your data owner and compare every cell to independently inspected PostHog results.

## Execution and recovery

The worker performs bounded endpoint reads for a caller-selected range of 1–90 days. A request has a 20-second timeout, 4 MB response budget and 2,000-row ceiling. There are at most three attempts for provider rate limiting, with a bounded `Retry-After` delay. A project accepts at most six queued refresh requests per hour. Automatic daily refresh is not enabled.

Wrong regions, denied/revoked keys, malformed counts, truncation, timeouts and schema changes fail visibly. The last successful report remains available with its original dates. Jobs persist progress, use lease ownership and recheck access before publication. Disconnect cancels queued/running refreshes and removes the local credential; revoke the key in PostHog as well.

## Live acceptance record

Before treating the connection as reconciled, record the actual cloud region, tenant, endpoint/query version, metric-contract hash, query variables, event mapping, identity policy, exclusions, independently matched numerator/denominator cells, cutoff assumption and provider response size. Exercise wrong-region, revoked-key, timeout, rate-limit and incomplete-window cases. No such live acceptance record is supplied in this repository.
