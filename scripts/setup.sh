#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  echo '.env already exists; leaving your configuration intact.'
else
  umask 077
  python3 - <<'PY'
import base64, secrets
from pathlib import Path
values = Path('.env.example').read_text().replace('CHANGE_ME_SECRET', secrets.token_urlsafe(48)).replace('CHANGE_ME_ENCRYPTION_KEY', base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()).replace('CHANGE_ME_DATABASE_PASSWORD', secrets.token_hex(24))
Path('.env').write_text(values)
PY
  echo 'Created private deployment keys in .env.'
fi
echo 'Start ConceptBench: docker compose up --build -d'
echo 'Open http://localhost:8008'
