#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p private/backups
backup_file="private/backups/conceptbench-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Write a temporary file first so an interrupted dump cannot appear complete.
docker compose exec -T db pg_dump -U conceptbench -d conceptbench -Fc > "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
printf 'Backup saved to %s\n' "$backup_file"
