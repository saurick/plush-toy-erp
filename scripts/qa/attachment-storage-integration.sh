#!/usr/bin/env bash
set -euo pipefail
export GIT_OPTIONAL_LOCKS=0
umask 077
root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/plush-attachment-drill.XXXXXX")"
fixture_id="plush-attachment-drill-$$"
cleanup() {
  docker rm -fv "$fixture_id-s3" "$fixture_id-pg" >/dev/null 2>&1 || true
  rm -rf -- "$fixture_dir"
}
trap cleanup EXIT
python3 - "$fixture_dir" <<'PY'
import pathlib,secrets,sys
p=pathlib.Path(sys.argv[1])
access=secrets.token_hex(16)
secret=secrets.token_hex(32)
password=secrets.token_hex(24)
(p/'s3.env').write_text(f'AWS_ACCESS_KEY_ID={access}\nAWS_SECRET_ACCESS_KEY={secret}\nS3_BUCKET=plush-attachment-test,plush-attachment-restore,plush-attachment-recovery\n')
(p/'pg.env').write_text(f'POSTGRES_PASSWORD={password}\nPOSTGRES_DB=plush_erp_attachment_drill\n')
(p/'client.env').write_text(f'export ATTACHMENT_S3_ACCESS_KEY_ID={access}\nexport ATTACHMENT_S3_SECRET_ACCESS_KEY={secret}\nexport PGPASSWORD={password}\n')
PY
docker run -d --name "$fixture_id-pg" --env-file "$fixture_dir/pg.env" -p 127.0.0.1::5432 postgres:18.1 >/dev/null
docker run -d --name "$fixture_id-s3" --env-file "$fixture_dir/s3.env" -p 127.0.0.1::8333 \
  chrislusf/seaweedfs:4.46@sha256:08d516132314207d10c8e37cbffc1f32b147d870169688734cc61c6231625b62 \
  mini -dir=/data -admin.ui=false -webdav=false -s3.iam=false -s3.port.iceberg=0 -s3.port.lance=0 >/dev/null
for ((attempt = 0; attempt < 45; attempt++)); do
  if docker exec "$fixture_id-pg" pg_isready -U postgres -q &&
    docker exec "$fixture_id-s3" curl -fsS --max-time 2 http://127.0.0.1:9333/cluster/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done
# shellcheck source=/dev/null
source "$fixture_dir/client.env"
pg_port="$(docker port "$fixture_id-pg" 5432/tcp | cut -d: -f2)"
s3_port="$(docker port "$fixture_id-s3" 8333/tcp | cut -d: -f2)"
export ATTACHMENT_S3_ENDPOINT="http://127.0.0.1:$s3_port"
export ATTACHMENT_S3_BUCKET=plush-attachment-test
export ATTACHMENT_STORAGE_INTEGRATION=1
export ATTACHMENT_MIGRATION_TEST_DSN="postgres://postgres:$PGPASSWORD@127.0.0.1:$pg_port/plush_erp_attachment_drill?sslmode=disable"
cd "$root_dir/server"
node "$root_dir/scripts/qa/run-test-gate.mjs" --kind go --label attachment-storage --output-mode summary -- \
  go test -tags=attachmentintegration ./internal/attachmentstore ./internal/attachmentmigration -count=1 -json

# Database and object backup are taken after all fixture writers have stopped.
go build -o "$fixture_dir/attachment-storage" ./cmd/attachment-storage
export POSTGRES_DSN="$ATTACHMENT_MIGRATION_TEST_DSN"
"$fixture_dir/attachment-storage" -mode backup -database plush_erp_attachment_drill -dir "$fixture_dir/objects" -execute -confirm ATTACHMENT_BACKUP:plush_erp_attachment_drill
docker exec "$fixture_id-pg" pg_dump -U postgres -d plush_erp_attachment_drill -Fc >"$fixture_dir/database.dump"
docker exec "$fixture_id-pg" createdb -U postgres plush_erp_attachment_recovery
docker exec -i "$fixture_id-pg" pg_restore -U postgres -d plush_erp_attachment_recovery --exit-on-error <"$fixture_dir/database.dump"
export POSTGRES_DSN="postgres://postgres:$PGPASSWORD@127.0.0.1:$pg_port/plush_erp_attachment_recovery?sslmode=disable"
export ATTACHMENT_S3_BUCKET=plush-attachment-recovery
"$fixture_dir/attachment-storage" -mode restore -database plush_erp_attachment_recovery -dir "$fixture_dir/objects" -execute -confirm ATTACHMENT_RESTORE:plush_erp_attachment_recovery
"$fixture_dir/attachment-storage" -mode verify -database plush_erp_attachment_recovery
# Run the existing PostgreSQL owner/withdrawal/concurrency regressions on the disposable fresh schema.
export PURCHASE_RECEIPT_PG_TEST=1
export PURCHASE_RECEIPT_PG_TEST_DB_URL="postgres://postgres:$PGPASSWORD@127.0.0.1:$pg_port/plush_erp_attachment_fresh?sslmode=disable"
node "$root_dir/scripts/qa/run-test-gate.mjs" --kind go --label attachment-postgres --output-mode summary -- \
  go test ./internal/data -run 'Attachment|ProductImage' -count=1 -json
node "$root_dir/scripts/qa/attachment-console-integration.mjs"
