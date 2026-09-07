# Contributing

Use the README's development setup and open a focused pull request against `main`. Install optional development tools with `.venv/bin/pip install -r requirements-dev.txt`; format Python with `.venv/bin/black backend` and the client with `npm --prefix frontend run format`. Keep numerical claims deterministic, source-linked and separately labeled from human reports, analyst interpretations and synthetic hypotheses. Do not commit personal data, provider credentials or real research responses; reproduce bugs with fabricated fixtures.

Run backend tests, the TypeScript production build and the browser journeys for the paths you change. Numerical, permission, budget and worker changes need a regression check that would fail without the fix. Browser tests target a test installation with demo mode enabled. Test both PostgreSQL and SQLite for database-sensitive changes.

Django owns API input schemas. Regenerate the committed schema and client types after changing them:

```sh
.venv/bin/python backend/manage.py export_openapi > docs/openapi.json
frontend/node_modules/.bin/openapi-typescript docs/openapi.json -o frontend/src/generated/api.d.ts
npm --prefix frontend run format
```

CI checks schema drift, backend tests, the frontend build and the complete browser journeys. Avoid manually editing generated files. Keep the vendored SSR kernel unmodified; numerical guards belong in `core/research.py`. Any upstream change requires a pinned commit, license review, provenance update and fixture reconciliation.

Synthetic comparisons remain experimental until supported by independent held-out human evaluation. A test passing with fabricated examples is not domain validation. Explain the problem, changed behavior and relevant validation in your pull request. Contributions to ConceptBench's own code are under the repository's MIT license; preserve third-party notices.
