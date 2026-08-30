#!/usr/bin/env bash
set -euo pipefail

expected_release="$1"
expected_migration="$2"
operation_id="$3"
backup_file="$4"
backup_sha256="$5"

[[ -f "$backup_file" && ! -L "$backup_file" && -s "$backup_file" ]] || { echo "pre-rotation backup is missing or unsafe" >&2; exit 1; }
actual_backup_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
[[ "$actual_backup_sha256" == "$backup_sha256" ]] || { echo "pre-rotation backup sha256 mismatch" >&2; exit 1; }

release_root="/home/simon/plush-toy-erp-demo-v1/current"
env_file="/home/simon/plush-toy-erp-demo-v1/runtime/.env.demo-133"
compose_dir="$release_root/server/deploy/compose/prod"
base_compose="$compose_dir/compose.yml"
demo_compose="$compose_dir/compose.demo-133.yml"
[[ -d "$compose_dir" && -f "$env_file" && -f "$base_compose" && -f "$demo_compose" ]] || { echo "registered 133 release paths are incomplete" >&2; exit 1; }
cd "$compose_dir"
docker compose \
  -p plush-toy-erp-demo-v1 \
  --env-file "$env_file" \
  -f "$base_compose" \
  -f "$demo_compose" \
  run --rm -T --no-deps --pull never \
  -e MANUAL_ACCEPTANCE_ADMIN_PASSWORD \
  -e MANUAL_ACCEPTANCE_UAT_PASSWORD \
  -e MANUAL_ACCEPTANCE_SMS_PHONE \
  app-server /app/rotate-manual-acceptance-passwords \
    --target customer-trial-133 \
    --dataset-version 2026.08.15-v6 \
    --expected-migration-version "$expected_migration" \
    --expected-release "$expected_release" \
    --operation-id "$operation_id" \
    --confirm ROTATE_SIMULATED_ACCEPTANCE_ACCOUNTS:customer-trial-133:2026.08.15-v6
