# Self-hosting

The supported pilot deployment is one Docker Compose installation: Django/Gunicorn serves the built React app, PostgreSQL stores application data, and one management-command worker processes durable jobs. There is no Redis or separate queue service. Start with the README's local Compose commands.

## Configuration and access

`./scripts/setup.sh` creates a private `.env` with independent random Django, credential-encryption, and database keys. Existing configuration is preserved. Do not copy `.env.example` verbatim into production. Keep `.env` and database backups out of Git. The application refuses a missing or placeholder production Django secret.

Local Compose intentionally permits an HTTP demo on `127.0.0.1:8008`. Before exposing an installation through HTTPS, set:

```dotenv
DEBUG=0
ALLOW_DEMO=0
ALLOW_REGISTRATION=0
COOKIE_SECURE=1
SECURE_SSL_REDIRECT=1
TRUST_PROXY_SSL_HEADER=1
ALLOWED_HOSTS=research.example.com
CSRF_TRUSTED_ORIGINS=https://research.example.com
```

Replace the example hostname. Enable registration only during controlled account onboarding, then disable it. A new account owns its personal workspace. An owner can add or update existing registered users under **Data & Settings → Privacy & access**, with a role and viewer export permission. This uses `PUT /api/v1/projects/{project_id}/members`; see the API contract. No email invitation or password-reset service is included. Operators can reset passwords with Django's `changepassword` command.

Keep the web port bound to loopback. Put a TLS reverse proxy in front of it and **overwrite** `X-Forwarded-Proto` with the actual connection scheme. Trusting that header is safe only when all external requests pass through that proxy. For example, inside an already configured HTTPS Nginx server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:8008;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    client_max_body_size 6m;
}
```

Add a proxy-level authentication rate limit before public deployment. The built-in auth throttle is process-local and suitable only for this small pilot. It is not a distributed abuse control. Restrict who can create accounts, studies and provider jobs. Deploy behind an access gateway if the research environment requires stronger identity controls.

Restart after configuration changes with `docker compose up -d`. Readiness is visible in `docker compose ps`; `/healthz` is a minimal liveness endpoint and is exempt from HTTPS redirect for the container check. Database health has its own Compose probe. The worker must remain running for cancellation recovery and expiry cleanup.

## Backup and restore

Run `./scripts/backup.sh` to create a PostgreSQL custom-format dump in ignored `private/backups/`. Back up deployment keys separately in an encrypted secret store; restoring only the database cannot recover encrypted provider credentials without the old key. Encrypt backups and restrict access: a dump includes private research. The database volume itself is not encrypted by the application; use encrypted storage on the host.

Adopt an explicit backup retention period (the pilot recommendation is seven days), schedule backups using your operations tooling, and delete expired backup copies. Application deletion does not erase historical backups. Log deletion requests separately and reapply them after any restore before users or workers reconnect.

Test restoration into a **new, disposable database**, leaving the active database alone:

```sh
docker compose exec -T db createdb -U conceptbench conceptbench_restore_check
docker compose exec -T db pg_restore -U conceptbench -d conceptbench_restore_check < private/backups/YOUR_BACKUP.dump
docker compose exec -T db psql -U conceptbench -d conceptbench_restore_check -c 'SELECT count(*) FROM core_project;'
# Only after checking the restored database:
docker compose exec -T db dropdb -U conceptbench conceptbench_restore_check
```

To restore service after a failure: stop web/worker, provision a clean target database, restore the dump and matching keys, reapply deletion/expiry policy, run migrations, and start the services. Retain the previous installation until the restored project counts, source fingerprints and exports are verified. Do not run two workers against competing copies of the same provider jobs.

## Key rotation and revocation

`CREDENTIAL_KEYS` is a comma-separated Fernet key ring; the first key encrypts new credentials. To rotate without losing connections:

1. Back up the existing database and key ring securely. Generate a new key with `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` in a trusted local environment.
2. Set the ring to `NEW_KEY,OLD_KEY` in the private deployment configuration and recreate web/worker.
3. Run `docker compose exec -T web python backend/manage.py rotate_credentials`.
4. After the command succeeds, keep only the new key in the active ring and recreate services. Retain old keys securely for the lifetime of backups that still require them.

The rotation command is atomic and never prints a credential. Disconnect deletes a PostHog credential locally and prevents further refresh publication. Revoke the corresponding personal key in PostHog too. A request already in flight cannot be recalled.

## Data lifetime and operations

Raw human response rows and copied model response text expire after at most 30 days, configurable lower by the owner. Aggregate snapshots, research summaries, and dependent briefs expire after at most 90 days. New analyst versions do not renew the source's retention window. Manual dataset deletion removes its dependent assessments and comparison summaries. Project deletion removes its studies, sources, credentials, jobs, briefs and experiment records.

Product definitions and experiment records remain part of the project until deletion; do not put personal identifiers in those fields. Raw uploads are parsed in memory and not saved as public files. Research, exports and provider responses require workspace membership; viewer export access is separately controlled. Serve web and worker from the same image and schema version.

Upgrade by backing up, pulling a reviewed commit, and running `docker compose up --build -d`. Check migrations, container health and a representative review/export before admitting new work. PostgreSQL supports lease claiming with `SKIP LOCKED`; keep one worker initially. SQLite is for single-worker local development only.
