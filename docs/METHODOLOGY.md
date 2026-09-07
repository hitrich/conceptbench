# Measurement and decision rules

## Frozen contract

The pilot counts **identified users**, with entry at the first observed eligible signup. Segment assignment uses the property value at entry; multiple approved properties form mutually exclusive joint cells. Internal traffic is excluded upstream. Anonymous IDs, unresolved merges, late-arriving events, and missing properties must be reconciled by the source owner. Aggregates alone cannot prove unique-user identity or absence of missing events.

A7 activation is at least one delivered-value event during `[signup, signup + 7 days)`. W4 value retention is at least one recurring-value event during `[signup + 21 days, signup + 28 days)`. Both use eligible signup users as the denominator. W4 among A7-activated users divides the intersection by A7-activated users; it is a separate diagnostic and does not estimate a causal effect of activation.

All durations are elapsed UTC days, not calendar weeks or calendar months. CSV cohort start/end dates are inclusive. A cohort is fully W4 eligible only when the analysis cutoff reaches **midnight after its end date + 28 days**. A7 has the analogous 7-day rule. Immature cohorts are excluded from the respective aggregate and labeled in source inspection. Missing denominators are unavailable, never zero retention.

The declared analysis cutoff and latest observed event are separate metadata. A latest event is not an ingestion watermark. Unconfirmed completeness, sampling, or definitions prevent definitive interpretation. A tracking or identity problem takes priority over a product recommendation. Imports reject malformed counts, impossible intersections, overlapping periods, and cells with 1–4 signup users. That small-cell privacy rule is unrelated to statistical precision.

## Arithmetic

Rates show numerator, denominator and a two-sided 95% Wilson interval, including valid zero-success/all-success boundaries. Differences use the independent-proportion Newcombe construction from the two Wilson intervals and are shown in **percentage points**. These intervals assume independent cohorts; they do not repair selection bias, tracking gaps, correlated users, or seasonality.

Fixed-mix standardization uses earlier segment signup shares as weights for later within-segment W4 rates. It is unavailable if either period lacks a segment denominator. It describes composition and makes no causal adjustment claim.

The acquisition-mix fixture is hand specified in [`demo/acquisition-mix.json`](../demo/acquisition-mix.json). Earlier Organic is 180/600 and Paid is 45/600. Later Organic is 72/240 and Paid is 72/960. Observed totals move 18.75% → 12%, while the fixed earlier mix gives 18.75%. The special mix interpretation requires unchanged rates in **every** included segment; offsetting segment changes cannot trigger that wording.

## Interpretation and provenance

Rules are deterministic and versioned in `backend/core/analysis.py`. A model does not calculate metrics, assign a strategic confidence score, or choose a pivot. Every brief preserves its source snapshot, frozen metric contract, rule version, counts, intervals, missing evidence, alternatives and analyst notes. Edits create a new assessment. A changed contract does not reinterpret an old snapshot; it requires reconciliation and a new snapshot.

Supported states are insufficient evidence, fix measurement, investigate friction, test segment focus, test positioning, continue and measure, and evaluate a pivot. Target-dependent states require a team-approved baseline, viability target and minimum useful effect. No universal SaaS retention threshold is supplied.

A combined review explicitly selects behavioral snapshots, relevant human research and completed intervention outcomes. Analyst interpretation of human evidence is labeled context. It cannot override a measurement problem or the unchanged-segment mix explanation. Fabricated human examples and synthetic model reactions cannot satisfy the real-human gate.

“Evaluate a pivot” requires all of the following:

- At least two disjoint later signup windows declared in the same frozen contract **before their start**, with complete maturity and reconciled measurement.
- The upper retention interval in every window falls below the declared viability target minus the declared useful effect.
- Relevant, unexpired, real human research corroborates weak value realization.
- At least two completed narrower interventions have reviewed unsuccessful outcomes.
- A specific alternative problem, audience, or solution hypothesis is provided.

This state asks for a bounded real-world comparison of an alternative. It does not direct a pivot or predict one will succeed. The gate is a declared pilot policy, not a scientifically validated forecasting rule.

## Reproduce the numerical checks

```sh
.venv/bin/python backend/manage.py test core.tests.NumericalTests core.test_assessments
.venv/bin/python backend/manage.py evaluate_demo
```

The evaluation command checks the exact acquisition-mix arithmetic and two simple SSR embedding cases against independently declared expected distributions. These algebraic vectors are not generated language embeddings and do not demonstrate semantic or market validity. The output includes the upstream commit and the measured interval bounds.
