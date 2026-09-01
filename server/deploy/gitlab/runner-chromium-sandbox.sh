#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

EXPECTED_SANDBOX_SHA256=206aa30eeb399b1d10fdf345106b315be01deded548243eb7263c8af2773ab88
LOCK_DIR=/run/plush-runner-chromium-sandbox
LOCK_FILE="$LOCK_DIR/operation.lock"

[[ "$EUID" -eq 0 ]]
[[ "${SUDO_USER:-}" == gitlab-runner ]]
[[ $# -ge 2 ]]
ACTION="$1"
JOB_ID="$2"
[[ "$JOB_ID" =~ ^[1-9][0-9]*$ ]]
DESTINATION="/usr/local/sbin/chrome-devel-sandbox-$JOB_ID"

install -d -o root -g root -m 0700 "$LOCK_DIR"
[[ -d "$LOCK_DIR" && ! -L "$LOCK_DIR" ]]
[[ "$(stat -c '%U:%G:%a' "$LOCK_DIR")" == root:root:700 ]]
if [[ -e "$LOCK_FILE" ]]; then
  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]]
  [[ "$(stat -c '%U:%G:%a:%h' "$LOCK_FILE")" == root:root:600:1 ]]
fi
exec 9>"$LOCK_FILE"
chmod 0600 "$LOCK_FILE"
flock -w 30 9

validate_published_sandbox() {
  [[ -f "$DESTINATION" && ! -L "$DESTINATION" ]]
  [[ "$(stat -c '%U:%G:%a:%h' "$DESTINATION")" == root:root:4755:1 ]]
  [[ "$(sha256sum "$DESTINATION" | awk '{print $1}')" == "$EXPECTED_SANDBOX_SHA256" ]]
}

case "$ACTION" in
preflight)
  [[ $# -eq 2 ]]
  [[ ! -e "$DESTINATION" ]]
  echo "[runner-chromium-sandbox] status=preflight_ready"
  ;;
install)
  [[ $# -eq 3 ]]
  SOURCE="$3"
  [[ "$SOURCE" == /* ]]
  [[ -f "$SOURCE" && ! -L "$SOURCE" ]]
  [[ "$(realpath -e -- "$SOURCE")" == "$SOURCE" ]]
  case "$SOURCE" in
  /home/gitlab-runner/builds/*/saurick/plush-toy-erp/output/runtime/gitlab/playwright-"$JOB_ID"/chromium-1208/chrome-linux64/chrome_sandbox) ;;
  *) exit 42 ;;
  esac
  [[ "$(stat -c '%U:%G:%h' "$SOURCE")" == gitlab-runner:gitlab-runner:1 ]]
  SOURCE_MODE="$(stat -c '%a' "$SOURCE")"
  [[ "$SOURCE_MODE" =~ ^[0-7]{3,4}$ ]]
  (((8#$SOURCE_MODE & 06000) == 0))
  [[ "$(sha256sum "$SOURCE" | awk '{print $1}')" == "$EXPECTED_SANDBOX_SHA256" ]]
  [[ ! -e "$DESTINATION" ]]

  TEMPORARY=
  TEMPORARY_IDENTITY=
  COMMITTED=false
  rollback_install() {
    status=$?
    trap - EXIT
    rollback_green=true
    if [[ "$COMMITTED" != true ]]; then
      for candidate in "$TEMPORARY" "$DESTINATION"; do
        if [[ -e "$candidate" ]]; then
          candidate_identity="$(stat -c '%d:%i:%U:%G:%h' "$candidate" 2>/dev/null || true)"
          if [[ "$candidate" == "$TEMPORARY" && -f "$candidate" && ! -L "$candidate" && "$candidate_identity" =~ ^[0-9]+:[0-9]+:root:root:1$ ]]; then
            unlink -- "$candidate" || rollback_green=false
          elif [[ -n "$TEMPORARY_IDENTITY" && "$candidate_identity" =~ ^$TEMPORARY_IDENTITY:root:root:[12]$ ]]; then
            unlink -- "$candidate" || rollback_green=false
          else
            rollback_green=false
          fi
        fi
      done
    fi
    if [[ "$rollback_green" != true ]]; then
      echo "[runner-chromium-sandbox] status=rollback_incomplete" >&2
      exit 70
    fi
    exit "$status"
  }
  trap rollback_install EXIT
  trap 'exit 130' HUP INT TERM

  TEMPORARY="$(mktemp "/usr/local/sbin/.chrome-devel-sandbox-$JOB_ID.XXXXXX")"
  [[ "$(stat -c '%U:%G:%a:%h' "$TEMPORARY")" == root:root:600:1 ]]
  unlink -- "$TEMPORARY"
  install -o root -g root -m 0700 "$SOURCE" "$TEMPORARY"
  TEMPORARY_IDENTITY="$(stat -c '%d:%i' "$TEMPORARY")"
  [[ "$(stat -c '%U:%G:%a:%h' "$TEMPORARY")" == root:root:700:1 ]]
  [[ "$(sha256sum "$TEMPORARY" | awk '{print $1}')" == "$EXPECTED_SANDBOX_SHA256" ]]
  chmod 4755 "$TEMPORARY"
  [[ "$(stat -c '%U:%G:%a:%h' "$TEMPORARY")" == root:root:4755:1 ]]
  ln -- "$TEMPORARY" "$DESTINATION"
  [[ "$(stat -c '%d:%i' "$DESTINATION")" == "$TEMPORARY_IDENTITY" ]]
  unlink -- "$TEMPORARY"
  validate_published_sandbox
  COMMITTED=true
  trap - EXIT
  echo "[runner-chromium-sandbox] status=installed"
  ;;
remove)
  [[ $# -eq 2 ]]
  if [[ -e "$DESTINATION" ]]; then
    validate_published_sandbox
    unlink -- "$DESTINATION"
  fi
  [[ ! -e "$DESTINATION" ]]
  echo "[runner-chromium-sandbox] status=absent"
  ;;
*)
  exit 42
  ;;
esac
