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
  echo "[qa:stage] gate=$gate id=$stage_id status=running"

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

qa_run_substep() {
  if [[ $# -lt 4 ]]; then
    echo "[qa:substep] invalid substep invocation" >&2
    return 2
  fi

  local gate="$1"
  local stage_id="$2"
  local substep_id="$3"
  shift 3
  if [[ ! "$gate" =~ ^(full|strict)$ ||
    ! "$stage_id" =~ ^[a-z][a-z0-9_]{1,63}$ ||
    ! "$substep_id" =~ ^[a-z][a-z0-9_]{1,63}$ ]]; then
    echo "[qa:substep] invalid gate, stage or substep id" >&2
    return 2
  fi

  local started_ns
  local finished_ns
  local duration_ms
  local substep_status
  local command_status
  started_ns="$(qa_stage_monotonic_ns)"
  echo "[qa:substep] gate=$gate stage=$stage_id id=$substep_id status=running"

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
    substep_status=passed
  else
    substep_status=failed
  fi
  echo "[qa:substep] gate=$gate stage=$stage_id id=$substep_id status=$substep_status durationMs=$duration_ms"
  return "$command_status"
}

qa_run_parallel_stages() {
  if [[ $# -lt 5 || $((($# - 1) % 2)) -ne 0 ]]; then
    echo "[qa:parallel] invalid parallel stage invocation" >&2
    return 2
  fi

  local gate="$1"
  shift
  if [[ ! "$gate" =~ ^(full|strict)$ ]]; then
    echo "[qa:parallel] invalid gate" >&2
    return 2
  fi

  local -a stage_ids=()
  local -a stage_commands=()
  local -a stage_pids=()
  local stage_id
  local stage_command
  local stage_ids_csv=""
  while (($# > 0)); do
    stage_id="$1"
    stage_command="$2"
    shift 2
    if [[ ! "$stage_id" =~ ^[a-z][a-z0-9_]{1,63}$ ||
      ! "$stage_command" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ||
      ",$stage_ids_csv," == *",$stage_id,"* ]]; then
      echo "[qa:parallel] invalid or duplicate stage" >&2
      return 2
    fi
    stage_ids+=("$stage_id")
    stage_commands+=("$stage_command")
    stage_ids_csv="${stage_ids_csv:+$stage_ids_csv,}$stage_id"
  done

  local started_ns
  local finished_ns
  local duration_ms
  local parallel_status
  local command_status
  local result_status=0
  local index
  started_ns="$(qa_stage_monotonic_ns)"
  echo "[qa:parallel] gate=$gate ids=$stage_ids_csv status=running"

  for index in "${!stage_ids[@]}"; do
    qa_run_stage \
      "$gate" \
      "${stage_ids[$index]}" \
      "${stage_commands[$index]}" &
    stage_pids+=("$!")
  done

  for index in "${!stage_pids[@]}"; do
    if wait "${stage_pids[$index]}"; then
      command_status=0
    else
      command_status=$?
    fi
    if ((result_status == 0 && command_status != 0)); then
      result_status=$command_status
    fi
  done

  finished_ns="$(qa_stage_monotonic_ns)"
  duration_ms=$(((finished_ns - started_ns) / 1000000))
  if ((result_status == 0)); then
    parallel_status=passed
  else
    parallel_status=failed
  fi
  echo "[qa:parallel] gate=$gate ids=$stage_ids_csv status=$parallel_status durationMs=$duration_ms"
  return "$result_status"
}
