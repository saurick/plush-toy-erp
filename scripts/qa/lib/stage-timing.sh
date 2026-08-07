#!/usr/bin/env bash

qa_stage_monotonic_ns() {
  node -e 'process.stdout.write(process.hrtime.bigint().toString())'
}

qa_run_stage() {
  if [[ $# -lt 3 ]]; then
    echo "[qa:stage] invalid stage invocation" >&2
    return 2
  fi

  local gate="$1"
  local stage_id="$2"
  shift 2
  if [[ ! "$gate" =~ ^(full|strict)$ || ! "$stage_id" =~ ^[a-z][a-z0-9_]{1,63}$ ]]; then
    echo "[qa:stage] invalid gate or stage id" >&2
    return 2
  fi

  local started_ns
  local finished_ns
  local duration_ms
  local stage_status
  local command_status
  started_ns="$(qa_stage_monotonic_ns)"

  set +e
  (
    set -euo pipefail
    "$@"
  )
  command_status=$?
  set -e

  finished_ns="$(qa_stage_monotonic_ns)"
  duration_ms=$(((finished_ns - started_ns) / 1000000))
  if ((command_status == 0)); then
    stage_status=passed
  else
    stage_status=failed
  fi
  echo "[qa:stage] gate=$gate id=$stage_id status=$stage_status durationMs=$duration_ms"
  return "$command_status"
}
