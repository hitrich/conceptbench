# Pilot delivery and acceptance

ConceptBench implements the self-hosted software pilot from the supplied technical plan. The repository was built and pushed in successive working milestones: open-source foundation, behavioral analysis, the four application surfaces, provider/worker support, evidence integration, and deployable verification.

## Delivered

- React/TypeScript/Vite frontend, Django 5.2/Ninja API, PostgreSQL, one durable worker and Docker Compose; SQLite for local development.
- Review, ConceptLab, Experiments, and Data & Settings with real persisted actions, keyboard-accessible dialogs, mobile navigation and private exports.
- Exact acquisition-mix demo, frozen definitions, maturity/quality gates, source inspection, versioned briefs, explicit human/outcome evidence and declared decision rules.
- Three fabricated example studies, reviewed human CSV import, distributions, development/held-out group checks and immutable concept stimuli.
- Bounded PostHog cloud Endpoints reads, query/version fingerprints, encrypted credentials, cancellation and preserved stale reports.
- Optional serial model comparison jobs, direct/follow-up/SSR methods, pooled human baseline, frozen inputs, spending reservations, ambiguous-outcome accounting and lease recovery.
- Owner/editor/viewer access, member management, viewer export permissions, retention, deletion, credential rotation and a backup/restore procedure.
- Tests, generated API input types, numerical fixtures, readable source formatting, MIT licensing, third-party notices and contributor/security documentation.

Experiment specifications freeze when a test starts. An outcome can be recorded only once. Later reviews explicitly select that outcome as evidence. Changes to a running test require a new experiment, keeping the original stopping rule and hypothesis inspectable.

## Apple-inspired refinement — 9 September 2026

The workspace uses one CSS token theme with platform system fonts, relative dimensions, neutral grouped surfaces, blue actions, and system-selected light/dark appearance. Navigation uses restrained translucent material; reduced transparency and increased contrast switch it to solid surfaces. Reduced motion removes travel and button scaling. No animation or UI dependency was added. The native dialog closes before React removes it, restoring keyboard focus to its opening control.

Verification includes ten Chromium journeys, automated WCAG A/AA scans on all four pages in both appearances, and responsive checks at 320, 390, 768, 1024, 1440 and 1920 pixels at standard and 125% text size. The skill's rendered state checker passed 602 default/hover/focus checks across the four page snapshots in light and dark. Twenty-one semantic text pairs per theme were measured with the supplied contrast utility: minimum 4.66:1 in light and 5.45:1 in dark. Hardcode and theme-reference checks passed for the shared styles/theme and dialog primitive. The aesthetic audit reported no high finding; its medium equal-sized metric-row finding is intentional for comparing data, and was reviewed visually.

The bundled skill-kit `accuracy_report.mjs` reported 9/37 on its own reference examples: browser dependencies are absent in that kit, and its token-build output directory is read-only. This is not an application score. Its state and taste scripts were run separately against actual ConceptBench DOM snapshots using the application's already-installed Playwright runtime. Automated checks do not replace testing with people or assistive technology. Screenshots continue to show explicitly fabricated demo evidence; analytical rules and validation limits are unchanged.

## Interface verification — 9 September 2026

The redesigned interface passes all eight Chromium journeys against the compiled Docker application, including automated accessibility checks on all four main pages. Loading announcements and Quick Find's empty and case-insensitive results are covered. All four pages were checked at 320, 390, 768, 1024, 1440 and 1920 pixels without viewport overflow; concept chart baselines were checked at tablet width. Production compilation and formatting pass. README screenshots were refreshed from isolated fabricated demo sessions. This interface update adds no dependencies and does not change the analytical rules or pilot validation limits.

## Verification record — 7 September 2026

The implementation passed 30 backend checks on both SQLite and PostgreSQL, and seven real Chromium journeys against the built Docker application. Those journeys cover demo/source/revision/export, human CSV, experiment lifecycle, aggregate CSV and immature-window displays, all four surfaces' automated WCAG A/AA checks, keyboard/mobile behavior, combined reviews, account/project/definition setup and last-owner protection. Automated accessibility checks do not replace user testing with assistive technology.

The production TypeScript build, source formatting, migration checks and generated schema checks pass. Docker web/database health checks pass and the worker runs. A PostgreSQL dump was restored into a fresh disposable database; project/study/brief counts and aggregate-source fingerprints matched the active installation. The disposable database was removed after verification. The committed screenshots use fabricated data.

Provider behavior is covered with mock transports and failure fixtures, including budget exhaustion, cancellation, revoked access, query schema errors, crash recovery and uncertain provider cost. The SSR algebraic fixture reproduces the pinned upstream kernel. **No live provider call, customer interview, real human study, external security audit or domain validation is claimed by these checks.**

## Release gates and remaining scope

| Area | Gate / remaining work |
| --- | --- |
| Live PostHog support | Reconcile a real tenant's endpoint query, canonical identity, exact counts, region, permissions, cutoff and failure behavior. The reviewed CSV path works independently. |
| Hosted installation | Verify PostHog OAuth/assisted installation on actual supported deployments before implementing and enabling those flows. |
| Synthetic validity | Recruit an independent human benchmark, freeze grouped splits and hypotheses, repeat model runs, add prespecified uncertainty/shortlist evaluation, and establish domain-specific acceptance thresholds. Current output stays experimental. |
| Operational scale | Add a shared authentication limiter/access gateway for public exposure and benchmark concurrency, backup retention and observability under actual deployment load. |
| Empirical product validation | Run the planned practitioner interviews, willingness-to-pay work and pilot studies. These cannot be replaced with fabricated fixtures. |

Automatic daily refresh, account-based metrics, other usage cadences, provider-side experiment execution, SSO, public report sharing and a generic autonomous agent framework are not enabled in this pilot. Add them only with a concrete supported workflow and evidence that the simpler deployment is insufficient.

## Reproduction

Follow the [README](../README.md), [self-hosting guide](SELF_HOSTING.md), [methodology](METHODOLOGY.md), [connector contract](CONNECTOR.md), and [synthetic comparison notes](SYNTHETIC.md). CI runs the numerical, access, worker, API drift and browser checks on pushes and pull requests. Public check results are the current reference for the repository's tested state.

[Review screenshot](images/review.png) · [ConceptLab screenshot](images/concepts.png)
