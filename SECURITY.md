# Security and data handling

ConceptBench is a self-hosted pilot for consented, anonymized product research. It does not ingest a raw analytics warehouse. Provider keys stay on the server, are encrypted with a deployment-managed Fernet key ring, and are never returned by the API. Review exports, datasets and generated responses require workspace membership; viewer export permission is distinct from read permission. Owners manage member access, budgets, retention and deletion.

Session authentication uses Django password validation and CSRF protection. Production requires a unique secret, HTTPS, secure cookies, restricted hosts and trusted proxy configuration. Read [self-hosting](docs/SELF_HOSTING.md) before exposing the local-only Compose defaults. The authentication throttle is process-local; use a gateway/proxy limit for an externally reachable installation. SSO, MFA, email recovery, distributed throttling and independent penetration testing are not supplied in this pilot.

Outbound destinations are fixed to PostHog US/EU cloud and the configured model provider's fixed API origin. Provider reads have time, response-size and row limits. Imports are validated before publication. Stored research text is treated as data, not executable instructions; React renders it as escaped text. Model calls have budget reservations, cancellation checks, lease fencing and conservative handling of ambiguous outcomes.

Raw research rows and copied model text are purged by the running worker under the owner policy. Aggregate sources and dependent reviews have separate expiry. Manual project deletion cascades to private data and queued work. Database volumes and backups need host-level encryption and restricted access. Backups can contain deleted information until the operator's backup-retention window expires. Reapply deletion requests after restoring an older backup.

Do not upload direct identifiers, sensitive personal attributes or research without permission. Application free-text fields are not an automatic anonymization service. The operator is responsible for consent, provider processing terms, account onboarding, backup access, TLS and system patching.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** flow to contact the maintainer privately: https://github.com/hitrich/conceptbench/security/advisories/new. Include the affected commit, a minimal reproduction using fabricated data, expected/actual behavior and impact. Do not post credentials, customer records or exploit details in a public issue. Fixes are currently maintained on `main`; no long-term-support release is promised.
