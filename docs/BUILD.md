# Build scope

The application follows the supplied ConceptBench technical plan, prepared 7 September 2026.

## Delivery slices

1. Reproducible application foundation and open-source repository.
2. Frozen metric definitions, acquisition-mix arithmetic, versioned briefs, and source inspection.
3. Review, ConceptLab, Experiments, and Data & Settings interfaces.
4. Reviewed aggregate/human CSV imports, ownership, exports, and experiment outcomes.
5. Bounded PostHog Endpoints integration and recoverable worker.
6. Experimental synthetic concept comparisons with explicit validation and budget gates.
7. Critical journey checks, deployment instructions, and reproducible examples.

## Acceptance boundaries

The demo must run without provider credentials. Live providers require explicit configuration. No live PostHog reconciliation, human study, pilot customer result, or domain validation will be claimed without the corresponding external evidence. Hosted OAuth and assisted endpoint installation remain gated on verification of PostHog capabilities; scoped personal keys and reviewed CSV are the supported self-hosted path.

## Interface direction

A quiet research workbench: warm white canvas, precise typography, muted indigo actions, and a narrow persistent navigation rail. The decision leads, followed by cohort evidence, competing explanations, and the next experiment. Brief entrance transitions and a keyboard-accessible source drawer provide orientation; reduced-motion preferences are respected.

## Architecture

One Django application owns authentication, data, analysis, and the API. Vite builds the React client, which is served from the same origin. A management-command worker claims durable database jobs, executes provider calls outside transactions, and preserves completed work. Deterministic code owns all numerical claims and decision eligibility.

No general agent framework, vector database, raw analytics warehouse, or automated pivot score.
