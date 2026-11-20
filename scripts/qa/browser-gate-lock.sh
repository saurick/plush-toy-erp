# shellcheck shell=bash

BROWSER_GATE_LOCK_ACQUIRED=0

browser_gate_lock_acquire() {
  local existing_owner

  if [[ -z "${BROWSER_GATE_LOCK_PATH:-}" ]]; then
    echo "[qa:full] status=incomplete reason=browser_gate_lock_path_missing"
    return 2
  fi

  if ln -s "$$" "$BROWSER_GATE_LOCK_PATH" 2>/dev/null; then
    BROWSER_GATE_LOCK_ACQUIRED=1
    return 0
  fi

  existing_owner="$(readlink "$BROWSER_GATE_LOCK_PATH" 2>/dev/null || true)"
  if [[ "$existing_owner" =~ ^[0-9]+$ ]] && kill -0 "$existing_owner" 2>/dev/null; then
    echo "[qa:full] status=incomplete reason=browser_gate_already_running pid=$existing_owner"
    return 1
  fi

  if [[ -L "$BROWSER_GATE_LOCK_PATH" ]]; then
    echo "[qa:full] status=incomplete reason=browser_gate_stale_lock owner=${existing_owner:-unknown} path=$BROWSER_GATE_LOCK_PATH"
    return 1
  fi

  echo "[qa:full] status=incomplete reason=browser_gate_lock_unavailable path=$BROWSER_GATE_LOCK_PATH"
  return 1
}

browser_gate_lock_release() {
  local lock_owner

  if [[ "${BROWSER_GATE_LOCK_ACQUIRED:-0}" == "1" && -L "${BROWSER_GATE_LOCK_PATH:-}" ]]; then
    lock_owner="$(readlink "$BROWSER_GATE_LOCK_PATH" 2>/dev/null || true)"
    if [[ "$lock_owner" == "$$" ]]; then
      rm -f -- "$BROWSER_GATE_LOCK_PATH"
    fi
  fi

  BROWSER_GATE_LOCK_ACQUIRED=0
}
