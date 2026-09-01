#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CONFIG_FILE=/etc/gitlab-runner/config.toml
POLICY_FILE=/etc/plush-runner/capacity-policy.env
CAPACITY_FILE=/etc/plush-runner/capacity.env
RECEIPT_DIR=/var/lib/plush-runner
RECEIPT_FILE=/var/lib/plush-runner/capacity.json
LOCK_DIR=/run/plush-runner
LOCK_FILE=/run/plush-runner/capacity.lock
MIN_MEMORY_MIB=16384
MIN_ROOT_AVAILABLE_GIB=50
EXPECTED_RUNNER_NAME=r640-kvm-isolated-shell
EXPECTED_RUNNER_URL=https://gitlab.saurick.me
EXPECTED_RUNNER_EXECUTOR=shell

MODE=preview
SLOTS=
EXPECTED_SLOTS=
CONFIRMATION=

usage() {
  cat <<'USAGE'
Usage:
  sudo /usr/local/sbin/plush-runner-capacity --slots <positive-integer>
  sudo /usr/local/sbin/plush-runner-capacity --slots <positive-integer> \
    --expect-slots <positive-integer> --execute \
    --confirm SET_RUNNER_CAPACITY:R640:<expected>:<requested>
  sudo /usr/local/sbin/plush-runner-capacity --initialize \
    --slots <positive-integer>
  sudo /usr/local/sbin/plush-runner-capacity --evidence

Preview is read-only. Execute changes the one idle Runner atomically and writes
a root-owned validation receipt. Initialize is only for first registration while
the Runner service is inactive. The slot safety maximum is provisioned separately
in capacity-policy.env; CPU count is never used as an automatic slot value.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slots)
      SLOTS="${2:-}"
      shift 2
      ;;
    --expect-slots)
      EXPECTED_SLOTS="${2:-}"
      shift 2
      ;;
    --execute)
      [[ "$MODE" == preview ]]
      MODE=execute
      shift
      ;;
    --initialize)
      [[ "$MODE" == preview ]]
      MODE=initialize
      shift
      ;;
    --evidence)
      [[ "$MODE" == preview ]]
      MODE=evidence
      shift
      ;;
    --confirm)
      CONFIRMATION="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[runner-capacity] status=incomplete reason=unsupported_argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$EUID" -eq 0 ]]
if [[ -n "$EXPECTED_SLOTS" ]]; then
  [[ "$EXPECTED_SLOTS" =~ ^[1-9][0-9]*$ ]]
fi

for command in awk chmod chown date df docker flock getconf grep install kill mktemp mv pgrep rm rmdir sed sha256sum sleep stat systemctl; do
  command -v "$command" >/dev/null
done

install -d -o root -g root -m 0700 "$LOCK_DIR"
[[ -d "$LOCK_DIR" && ! -L "$LOCK_DIR" ]]
[[ "$(stat -c '%U:%G:%a' "$LOCK_DIR")" == root:root:700 ]]
if [[ -e "$LOCK_FILE" ]]; then
  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]]
  [[ "$(stat -c '%U:%G:%a:%h' "$LOCK_FILE")" == root:root:600:1 ]]
fi
exec 9>"$LOCK_FILE"
chmod 0600 "$LOCK_FILE"
flock -n 9

require_private_file() {
  local file="$1"
  [[ -f "$file" && ! -L "$file" ]]
  [[ "$(stat -c '%U:%G:%a:%h' "$file")" == root:root:600:1 ]]
}

require_private_file "$CONFIG_FILE"
require_private_file "$POLICY_FILE"
[[ -d "$RECEIPT_DIR" && ! -L "$RECEIPT_DIR" ]]
[[ "$(stat -c '%U:%G:%a' "$RECEIPT_DIR")" == root:root:755 ]]
[[ "$(awk 'END {print NR}' "$POLICY_FILE")" -eq 1 ]]
SLOT_SAFETY_MAX="$(sed -n 's/^PLUSH_RUNNER_SLOT_SAFETY_MAX=//p' "$POLICY_FILE")"
[[ "$SLOT_SAFETY_MAX" =~ ^[1-9][0-9]*$ ]]
VCPUS="$(getconf _NPROCESSORS_ONLN)"
MEMORY_MIB="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
SWAP_TOTAL_KIB="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
SWAP_FREE_KIB="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
ROOT_AVAILABLE_GIB="$(df -B1 --output=avail / | awk 'NR == 2 {print int($1 / 1024 / 1024 / 1024)}')"

[[ "$VCPUS" =~ ^[1-9][0-9]*$ ]]
[[ "$MEMORY_MIB" =~ ^[1-9][0-9]*$ ]]
[[ "$SWAP_TOTAL_KIB" =~ ^[0-9]+$ ]]
[[ "$SWAP_FREE_KIB" =~ ^[0-9]+$ ]]
[[ "$ROOT_AVAILABLE_GIB" =~ ^[0-9]+$ ]]

read_config() {
  mapfile -t CONCURRENT_VALUES < <(
    awk '/^[[:space:]]*concurrent[[:space:]]*=/ {print $3}' "$CONFIG_FILE"
  )
  mapfile -t LIMIT_VALUES < <(
    awk '/^[[:space:]]*limit[[:space:]]*=/ {print $3}' "$CONFIG_FILE"
  )
  mapfile -t RUNNER_NAMES < <(
    sed -n 's/^[[:space:]]*name[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$CONFIG_FILE"
  )
  mapfile -t RUNNER_URLS < <(
    sed -n 's#^[[:space:]]*url[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$#\1#p' "$CONFIG_FILE"
  )
  mapfile -t RUNNER_EXECUTORS < <(
    sed -n 's/^[[:space:]]*executor[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$CONFIG_FILE"
  )
  RUNNER_COUNT="$(awk '/^\[\[runners\]\]$/ {count += 1} END {print count + 0}' "$CONFIG_FILE")"
  [[ "${#CONCURRENT_VALUES[@]}" -eq 1 ]]
  [[ "$RUNNER_COUNT" -eq 1 ]]
  [[ "${#RUNNER_NAMES[@]}" -eq 1 && "${RUNNER_NAMES[0]}" == "$EXPECTED_RUNNER_NAME" ]]
  [[ "${#RUNNER_URLS[@]}" -eq 1 ]]
  [[ "${RUNNER_URLS[0]%/}" == "$EXPECTED_RUNNER_URL" ]]
  [[ "${#RUNNER_EXECUTORS[@]}" -eq 1 && "${RUNNER_EXECUTORS[0]}" == "$EXPECTED_RUNNER_EXECUTOR" ]]
  [[ "${CONCURRENT_VALUES[0]}" =~ ^[1-9][0-9]*$ ]]
  if [[ "$MODE" == initialize ]]; then
    [[ "${#LIMIT_VALUES[@]}" -le 1 ]]
    if [[ "${#LIMIT_VALUES[@]}" -eq 1 ]]; then
      [[ "${LIMIT_VALUES[0]}" =~ ^[0-9]+$ ]]
      [[ "${LIMIT_VALUES[0]}" == 0 || "${LIMIT_VALUES[0]}" == "${CONCURRENT_VALUES[0]}" ]]
    fi
  else
    [[ "${#LIMIT_VALUES[@]}" -eq 1 ]]
    [[ "${LIMIT_VALUES[0]}" =~ ^[1-9][0-9]*$ ]]
    [[ "${LIMIT_VALUES[0]}" == "${CONCURRENT_VALUES[0]}" ]]
  fi
  CURRENT_SLOTS="${CONCURRENT_VALUES[0]}"
}

read_capacity() {
  CAPACITY_STATE=unmanaged
  CAPACITY_SLOTS=
  if [[ -e "$CAPACITY_FILE" ]]; then
    require_private_file "$CAPACITY_FILE"
    [[ "$(awk 'END {print NR}' "$CAPACITY_FILE")" -eq 1 ]]
    CAPACITY_SLOTS="$(sed -n 's/^RUNNER_CONCURRENT_SLOTS=//p' "$CAPACITY_FILE")"
    [[ "$CAPACITY_SLOTS" =~ ^[1-9][0-9]*$ ]]
    CAPACITY_STATE=managed
  fi
}

read_config
read_capacity
if [[ "$MODE" == evidence ]]; then
  [[ -z "$SLOTS" && -z "$EXPECTED_SLOTS" && -z "$CONFIRMATION" ]]
  SLOTS="$CURRENT_SLOTS"
fi
[[ "$SLOTS" =~ ^[1-9][0-9]*$ ]]
(( SLOTS <= SLOT_SAFETY_MAX ))
(( SLOT_SAFETY_MAX <= VCPUS ))
if [[ "$MODE" == evidence || "$MODE" == initialize ]] || (( SLOTS > CURRENT_SLOTS )); then
  (( MEMORY_MIB >= MIN_MEMORY_MIB ))
  (( ROOT_AVAILABLE_GIB >= MIN_ROOT_AVAILABLE_GIB ))
  (( SWAP_TOTAL_KIB - SWAP_FREE_KIB == 0 ))
fi
PREVIOUS_SLOTS="$CURRENT_SLOTS"
RECEIPT_READY=false
if [[ -f "$RECEIPT_FILE" && ! -L "$RECEIPT_FILE" ]] &&
  [[ "$(stat -c '%U:%G:%a:%h' "$RECEIPT_FILE")" == root:root:644:1 ]] &&
  grep -Fq "\"slots\":$SLOTS,\"concurrent\":$SLOTS,\"limit\":$SLOTS,\"safetyMax\":$SLOT_SAFETY_MAX" "$RECEIPT_FILE"; then
  RECEIPT_READY=true
fi

if [[ "$MODE" == evidence ]]; then
  [[ "${#LIMIT_VALUES[@]}" -eq 1 ]]
  [[ "$CAPACITY_STATE" == managed && "$CAPACITY_SLOTS" == "$CURRENT_SLOTS" ]]
  [[ "$RECEIPT_READY" == true ]]
  [[ "$(systemctl is-active gitlab-runner)" == active ]]
  [[ "$(systemctl is-enabled gitlab-runner)" == enabled ]]
  HELPER_SHA256="$(sha256sum "$0" | awk '{print $1}')"
  [[ "$HELPER_SHA256" =~ ^[0-9a-f]{64}$ ]]
  echo "[runner-capacity] status=evidence vcpus=$VCPUS memoryMiB=$MEMORY_MIB rootAvailableGiB=$ROOT_AVAILABLE_GIB swapUsedKiB=$((SWAP_TOTAL_KIB - SWAP_FREE_KIB)) currentSlots=$CURRENT_SLOTS limit=${LIMIT_VALUES[0]} safetyMax=$SLOT_SAFETY_MAX helperSha256=$HELPER_SHA256 serviceActive=1 serviceEnabled=1"
  exit 0
fi

if [[ "$MODE" == preview ]]; then
  if [[ "$CAPACITY_STATE" == managed ]]; then
    [[ "$CAPACITY_SLOTS" == "$CURRENT_SLOTS" ]]
  fi
  limit_mode=explicit
  [[ "${#LIMIT_VALUES[@]}" -eq 0 ]] && limit_mode=implicit_global
  echo "[runner-capacity] status=preview vcpus=$VCPUS memoryMiB=$MEMORY_MIB rootAvailableGiB=$ROOT_AVAILABLE_GIB swapUsedKiB=$((SWAP_TOTAL_KIB - SWAP_FREE_KIB)) currentSlots=$CURRENT_SLOTS requestedSlots=$SLOTS safetyMax=$SLOT_SAFETY_MAX limitMode=$limit_mode capacityState=$CAPACITY_STATE"
  exit 0
fi

if [[ "$MODE" == execute ]]; then
  [[ -n "$EXPECTED_SLOTS" ]]
  [[ "$CURRENT_SLOTS" == "$EXPECTED_SLOTS" ]]
  [[ "$CONFIRMATION" == "SET_RUNNER_CAPACITY:R640:$EXPECTED_SLOTS:$SLOTS" ]]
  if [[ "$CAPACITY_STATE" == managed ]]; then
    [[ "$CAPACITY_SLOTS" == "$CURRENT_SLOTS" ]]
  fi
  [[ "$(systemctl is-active gitlab-runner)" == active ]]
  [[ "$(systemctl is-enabled gitlab-runner)" == enabled ]]
else
  [[ "$MODE" == initialize ]]
  [[ -z "$EXPECTED_SLOTS" && -z "$CONFIRMATION" ]]
  [[ "$CAPACITY_STATE" == unmanaged ]]
  [[ ! -e "$RECEIPT_FILE" ]]
  [[ "$(systemctl is-active gitlab-runner 2>/dev/null || true)" != active ]]
fi

if [[ "$CURRENT_SLOTS" == "$SLOTS" && "${#LIMIT_VALUES[@]}" -eq 1 && "$CAPACITY_STATE" == managed && "$CAPACITY_SLOTS" == "$SLOTS" && "$RECEIPT_READY" == true ]]; then
  echo "[runner-capacity] status=complete mode=idempotent vcpus=$VCPUS memoryMiB=$MEMORY_MIB rootAvailableGiB=$ROOT_AVAILABLE_GIB swapUsedKiB=$((SWAP_TOTAL_KIB - SWAP_FREE_KIB)) previousSlots=$PREVIOUS_SLOTS currentSlots=$SLOTS"
  exit 0
fi

ROLLBACK_ROOT="$(mktemp -d /etc/plush-runner/.capacity-rollback.XXXXXX)"
chmod 0700 "$ROLLBACK_ROOT"
install -o root -g root -m 0600 "$CONFIG_FILE" "$ROLLBACK_ROOT/config.toml"
CAPACITY_EXISTED=false
RECEIPT_EXISTED=false
if [[ -e "$CAPACITY_FILE" ]]; then
  CAPACITY_EXISTED=true
  install -o root -g root -m 0600 "$CAPACITY_FILE" "$ROLLBACK_ROOT/capacity.env"
fi
if [[ -e "$RECEIPT_FILE" ]]; then
  [[ -f "$RECEIPT_FILE" && ! -L "$RECEIPT_FILE" ]]
  [[ "$(stat -c '%U:%G:%a:%h' "$RECEIPT_FILE")" == root:root:644:1 ]]
  RECEIPT_EXISTED=true
  install -o root -g root -m 0644 "$RECEIPT_FILE" "$ROLLBACK_ROOT/capacity.json"
fi

COMMITTED=false
SERVICE_WAS_ACTIVE=false
DISPATCH_FROZEN=false
RUNNER_MAIN_PID=
CONFIG_TEMPORARY=
CAPACITY_TEMPORARY=
RECEIPT_TEMPORARY=
[[ "$(systemctl is-active gitlab-runner 2>/dev/null || true)" == active ]] && SERVICE_WAS_ACTIVE=true

cleanup_temporaries() {
  [[ -z "$CONFIG_TEMPORARY" ]] || rm -f -- "$CONFIG_TEMPORARY"
  [[ -z "$CAPACITY_TEMPORARY" ]] || rm -f -- "$CAPACITY_TEMPORARY"
  [[ -z "$RECEIPT_TEMPORARY" ]] || rm -f -- "$RECEIPT_TEMPORARY"
}

cleanup_rollback_root() {
  rm -f -- "$ROLLBACK_ROOT/config.toml" "$ROLLBACK_ROOT/capacity.env" "$ROLLBACK_ROOT/capacity.json"
  rmdir -- "$ROLLBACK_ROOT"
}

rollback() {
  local status=$?
  trap - EXIT
  cleanup_temporaries || true
  if [[ "$DISPATCH_FROZEN" == true && "$RUNNER_MAIN_PID" =~ ^[1-9][0-9]*$ ]]; then
    kill -CONT "$RUNNER_MAIN_PID" >/dev/null 2>&1 || true
    DISPATCH_FROZEN=false
  fi
  if [[ "$COMMITTED" != true ]]; then
    local rollback_green=true
    install -o root -g root -m 0600 "$ROLLBACK_ROOT/config.toml" "$CONFIG_FILE" || rollback_green=false
    if [[ "$CAPACITY_EXISTED" == true ]]; then
      install -o root -g root -m 0600 "$ROLLBACK_ROOT/capacity.env" "$CAPACITY_FILE" || rollback_green=false
    else
      rm -f -- "$CAPACITY_FILE" || rollback_green=false
    fi
    if [[ "$RECEIPT_EXISTED" == true ]]; then
      install -o root -g root -m 0644 "$ROLLBACK_ROOT/capacity.json" "$RECEIPT_FILE" || rollback_green=false
    else
      rm -f -- "$RECEIPT_FILE" || rollback_green=false
    fi
    if [[ "$SERVICE_WAS_ACTIVE" == true ]]; then
      systemctl start gitlab-runner >/dev/null 2>&1 || rollback_green=false
    fi
    if [[ "$rollback_green" == true ]]; then
      read_config || rollback_green=false
      [[ "$CURRENT_SLOTS" == "$PREVIOUS_SLOTS" ]] || rollback_green=false
      if [[ "$SERVICE_WAS_ACTIVE" == true ]]; then
        [[ "$(systemctl is-active gitlab-runner 2>/dev/null || true)" == active ]] || rollback_green=false
      fi
    fi
    if [[ "$rollback_green" != true ]]; then
      echo "[runner-capacity] status=rollback_incomplete" >&2
      exit 70
    fi
  fi
  cleanup_rollback_root || true
  exit "$status"
}
trap rollback EXIT
trap 'exit 130' HUP INT TERM

if [[ "$MODE" == execute ]]; then
  [[ -z "$(docker ps -q)" ]]
  if pgrep -u gitlab-runner >/dev/null 2>&1; then
    echo "[runner-capacity] status=incomplete reason=runner_job_process_present" >&2
    exit 2
  fi
  RUNNER_MAIN_PID="$(systemctl show --property=MainPID --value gitlab-runner)"
  [[ "$RUNNER_MAIN_PID" =~ ^[1-9][0-9]*$ ]]
  kill -STOP "$RUNNER_MAIN_PID"
  DISPATCH_FROZEN=true
  [[ "$(systemctl show --property=MainPID --value gitlab-runner)" == "$RUNNER_MAIN_PID" ]]
  [[ "$(awk '/^State:/ {print $2}' "/proc/$RUNNER_MAIN_PID/status")" == T ]]
  [[ -z "$(docker ps -q)" ]]
  if pgrep -u gitlab-runner >/dev/null 2>&1; then
    echo "[runner-capacity] status=incomplete reason=runner_job_process_present" >&2
    exit 2
  fi
  systemctl stop --no-block gitlab-runner
  kill -CONT "$RUNNER_MAIN_PID"
  DISPATCH_FROZEN=false
  for _ in {1..120}; do
    [[ "$(systemctl is-active gitlab-runner 2>/dev/null || true)" == inactive ]] && break
    sleep 0.5
  done
  [[ "$(systemctl is-active gitlab-runner 2>/dev/null || true)" == inactive ]]
  [[ -z "$(docker ps -q)" ]]
  if pgrep -u gitlab-runner >/dev/null 2>&1; then
    echo "[runner-capacity] status=incomplete reason=runner_job_process_present" >&2
    exit 2
  fi
fi

CONFIG_TEMPORARY="$(mktemp /etc/gitlab-runner/.config.toml.XXXXXX)"
CAPACITY_TEMPORARY="$(mktemp /etc/plush-runner/.capacity.env.XXXXXX)"
RECEIPT_TEMPORARY="$(mktemp /var/lib/plush-runner/.capacity.json.XXXXXX)"
chmod 0600 "$CONFIG_TEMPORARY" "$CAPACITY_TEMPORARY" "$RECEIPT_TEMPORARY"

insert_limit=0
[[ "${#LIMIT_VALUES[@]}" -eq 0 ]] && insert_limit=1
awk -v slots="$SLOTS" -v insert_limit="$insert_limit" '
  /^[[:space:]]*concurrent[[:space:]]*=/ {
    print "concurrent = " slots
    concurrent += 1
    next
  }
  /^\[\[runners\]\]$/ {
    print
    runners += 1
    if (insert_limit == 1) print "  limit = " slots
    next
  }
  /^[[:space:]]*limit[[:space:]]*=/ {
    print "  limit = " slots
    limits += 1
    next
  }
  { print }
  END {
    if (concurrent != 1 || runners != 1) exit 42
    if (insert_limit == 0 && limits != 1) exit 43
  }
' "$CONFIG_FILE" >"$CONFIG_TEMPORARY"
printf 'RUNNER_CONCURRENT_SLOTS=%s\n' "$SLOTS" >"$CAPACITY_TEMPORARY"
VALIDATED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf '{"schemaVersion":"plush.runner-capacity/v1","status":"validated","validatedAt":"%s","slots":%s,"concurrent":%s,"limit":%s,"safetyMax":%s,"resourceSnapshot":{"vCpu":%s,"memoryMiB":%s,"swapUsedKiB":%s,"rootAvailableGiB":%s}}\n' \
  "$VALIDATED_AT" "$SLOTS" "$SLOTS" "$SLOTS" "$SLOT_SAFETY_MAX" "$VCPUS" "$MEMORY_MIB" \
  "$((SWAP_TOTAL_KIB - SWAP_FREE_KIB))" "$ROOT_AVAILABLE_GIB" >"$RECEIPT_TEMPORARY"

chown root:root "$CONFIG_TEMPORARY" "$CAPACITY_TEMPORARY" "$RECEIPT_TEMPORARY"
chmod 0600 "$CONFIG_TEMPORARY" "$CAPACITY_TEMPORARY"
chmod 0644 "$RECEIPT_TEMPORARY"
mv -fT -- "$CONFIG_TEMPORARY" "$CONFIG_FILE"
CONFIG_TEMPORARY=
mv -fT -- "$CAPACITY_TEMPORARY" "$CAPACITY_FILE"
CAPACITY_TEMPORARY=
mv -fT -- "$RECEIPT_TEMPORARY" "$RECEIPT_FILE"
RECEIPT_TEMPORARY=

if [[ "$MODE" == execute ]]; then
  systemctl start gitlab-runner
  [[ "$(systemctl is-active gitlab-runner)" == active ]]
  [[ "$(systemctl is-enabled gitlab-runner)" == enabled ]]
fi

read_config
read_capacity
[[ "$CURRENT_SLOTS" == "$SLOTS" ]]
[[ "${#LIMIT_VALUES[@]}" -eq 1 ]]
[[ "${LIMIT_VALUES[0]}" == "$SLOTS" ]]
[[ "$CAPACITY_STATE" == managed ]]
[[ "$CAPACITY_SLOTS" == "$SLOTS" ]]
[[ -f "$RECEIPT_FILE" && ! -L "$RECEIPT_FILE" ]]
[[ "$(stat -c '%U:%G:%a:%h' "$RECEIPT_FILE")" == root:root:644:1 ]]

COMMITTED=true
cleanup_rollback_root
trap - EXIT
echo "[runner-capacity] status=complete mode=$MODE vcpus=$VCPUS memoryMiB=$MEMORY_MIB rootAvailableGiB=$ROOT_AVAILABLE_GIB swapUsedKiB=$((SWAP_TOTAL_KIB - SWAP_FREE_KIB)) previousSlots=$PREVIOUS_SLOTS currentSlots=$SLOTS"
