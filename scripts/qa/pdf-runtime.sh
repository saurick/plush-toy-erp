#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"
IMAGE="${2:-}"
OUTPUT="${3:-}"
FIXTURES="${4:-}"
if [[ ! "$MODE" =~ ^(verify|monitor)$ || -z "$IMAGE" || -z "$OUTPUT" ]]; then
  echo 'usage: pdf-runtime.sh verify|monitor IMAGE OUTPUT_DIR [FIXTURE_DIR]' >&2
  exit 2
fi
cd "$ROOT_DIR"
node scripts/qa/pdf-runtime.mjs check-source
mkdir -p "$OUTPUT"
OUTPUT="$(cd "$OUTPUT" && pwd)"
CONTAINER=""
SANDBOX_INSTALLED=false
RUNTIME_MATERIALIZED=false
# Invoked by the EXIT trap, including failures before the final report.
# shellcheck disable=SC2329
cleanup() {
  local cleanup_failed=0
  [[ -z "$CONTAINER" ]] || docker rm --force "$CONTAINER" >/dev/null || cleanup_failed=1
  if [[ "$SANDBOX_INSTALLED" == true ]]; then
    sudo -n /usr/local/sbin/plush-chromium-sandbox remove "$CI_JOB_ID" || cleanup_failed=1
  fi
  if [[ "$RUNTIME_MATERIALIZED" == true ]]; then
    node scripts/qa/ci-playwright-runtime.mjs cleanup || cleanup_failed=1
  fi
  return "$cleanup_failed"
}
# Invoked by the EXIT trap.
# shellcheck disable=SC2329
on_exit() {
  local run_status=$?
  trap - EXIT
  cleanup || run_status=1
  exit "$run_status"
}
trap on_exit EXIT

docker image inspect "$IMAGE" >"$OUTPUT/image.json"
IMAGE_ID="$(node -e 'process.stdout.write(require(process.argv[1])[0].Id)' "$OUTPUT/image.json")"
[[ "$IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]]
docker run --rm --network none --entrypoint sh "$IMAGE_ID" -ec \
  'test "$(id -u)" = 10001; test "$HOME" = /home/app; test -w "$HOME"; dpkg-query -W -f="\${binary:Package}\t\${Version}\n"' \
  >"$OUTPUT/packages.tsv"
docker run --rm --network none --entrypoint /usr/bin/chromium "$IMAGE_ID" --version >"$OUTPUT/chromium-version.txt"

if [[ "$MODE" == verify ]]; then
  for program in pdfinfo pdftotext pdffonts; do command -v "$program" >/dev/null; done
  if [[ -z "$FIXTURES" ]]; then
    CONTAINER="$(docker create "$IMAGE_ID")"
    docker cp "$CONTAINER:/app/public" "$OUTPUT/public"
    docker rm "$CONTAINER" >/dev/null
    CONTAINER=""
    if [[ "${CI_JOB_ID:-}" =~ ^[0-9]+$ ]]; then
      node scripts/qa/ci-playwright-runtime.mjs materialize
      RUNTIME_MATERIALIZED=true
      CHROME_PATH="$(node -e 'process.stdout.write(require("./web/node_modules/playwright").chromium.executablePath())')"
      sudo -n /usr/local/sbin/plush-chromium-sandbox install "$CI_JOB_ID" "$(dirname "$CHROME_PATH")/chrome_sandbox"
      SANDBOX_INSTALLED=true
      export CHROME_DEVEL_SANDBOX="/usr/local/sbin/chrome-devel-sandbox-$CI_JOB_ID"
    fi
    FIXTURES="$OUTPUT/fixtures"
    node web/scripts/printPdfFixtures.mjs "$OUTPUT/public" "$FIXTURES"
  fi
  # Stage only generated HTML, with readable modes for the non-root image user.
  # The caller's fixture files and their permissions remain owned by the caller.
  mkdir -m 0755 "$OUTPUT/fixtures-runtime"
  for fixture in "$FIXTURES"/print-snapshot-*.html; do
    test -f "$fixture"
    install -m 0444 "$fixture" "$OUTPUT/fixtures-runtime/$(basename "$fixture")"
  done
  (
    cd server
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOMAXPROCS=2 go test -p 2 -tags=pdf_runtime -c -trimpath -o "$OUTPUT/pdf-runtime.test" ./internal/server
  )
  chmod 0555 "$OUTPUT/pdf-runtime.test"
  CONTAINER="$(docker create --network none --init --memory 2g --cpus 2 --pids-limit 256 --shm-size 128m \
    --security-opt "seccomp=$ROOT_DIR/server/deploy/compose/prod/chromium-seccomp.json" \
    --mount "type=bind,source=$OUTPUT/pdf-runtime.test,target=/tmp/pdf-runtime.test,readonly" \
    --mount "type=bind,source=$OUTPUT/fixtures-runtime,target=/tmp/fixtures,readonly" \
    --env ERP_PDF_CHROMIUM_INTEGRATION=1 \
    --env ERP_PDF_BUSINESS_FIXTURE_DIR=/tmp/fixtures \
    --env ERP_PDF_BUSINESS_OUTPUT_DIR=/tmp/business-pdf \
    --entrypoint /tmp/pdf-runtime.test "$IMAGE_ID" \
    -test.run '^TestTemplatePDF(ChromiumSecurityIntegration|BusinessSnapshotIntegration)$' -test.v -test.timeout 180s)"
  docker start --attach "$CONTAINER" | tee "$OUTPUT/pdf-runtime.log"
  test "$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")" = 0
  docker cp "$CONTAINER:/tmp/business-pdf" "$OUTPUT/pdfs"
  docker rm "$CONTAINER" >/dev/null
  CONTAINER=""
  rm -f "$OUTPUT/pdf-runtime.test"
  node scripts/qa/pdf-runtime-pdfs.mjs "$OUTPUT/pdfs"
fi

test "$(uname -s)" = Linux
test "$(uname -m)" = x86_64
# shellcheck source=scripts/qa/pdf-runtime-trivy.sh
source "$ROOT_DIR/scripts/qa/pdf-runtime-trivy.sh"
scan_pdf_runtime_image "$ROOT_DIR" "$IMAGE_ID" "$OUTPUT"
RESULT=0
node scripts/qa/pdf-runtime.mjs report "$OUTPUT" || RESULT=1
if [[ "$MODE" == monitor ]]; then
  node --use-env-proxy scripts/qa/pdf-runtime.mjs upstream "$OUTPUT" || RESULT=1
fi
exit "$RESULT"
