#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/erp-k2}"
DB_PATH="${DB_PATH:-$APP_DIR/data/erp.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"

ts="$(date +%F_%H-%M-%S)"
mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH" >&2
  exit 1
fi

cp -a "$DB_PATH" "$BACKUP_DIR/erp_$ts.db"

# keep last 30 backups
ls -1t "$BACKUP_DIR"/erp_*.db | tail -n +31 | xargs -r rm -f

echo "Backup OK: $BACKUP_DIR/erp_$ts.db"

