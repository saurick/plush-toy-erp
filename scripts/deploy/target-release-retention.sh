#!/usr/bin/env bash

# Sourced into the fixed-target read-only preflight. Historical evidence remains
# intact; only current runtime, recovery points and unresolved operations pin bytes.
# Inputs and counters belong to the embedding preflight.
# shellcheck disable=SC2154,SC2034
retention_release_identity_matches() {
  plain_directory "$1" && plain_file "$1/.plush-release-identity.json" &&
    jq -se --arg sha "$2" '
      length == 1 and (.[0] |
        .schemaVersion == "plush.target-release-identity/v1" and .gitSha == $sha and
        (.sourceArchiveSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
        (.releaseManifestSha256 | type == "string" and test("^[0-9a-f]{64}$")))
    ' "$1/.plush-release-identity.json" >/dev/null 2>&1
}

preview_target_release_retention() {
  local protected_shas successful_history="" rollback_shas="" candidate_shas="" operation_dir file document
  local operation_id terminal_passed operation_documents cache_root cache_dir cache_sha
  local release_dir release_sha release_bytes container_name container_sha running
  local public_containers stopped_containers="" cache_inventory="" selected=0 stamp sha recent_shas=""
  retention_protection_status=complete
  rollback_release_shas=none
  cache_candidate_count=0
  cache_candidate_bytes=0
  stopped_public_container_candidate_count=0
  protected_shas="$(printf '%s\n' "$server_sha" "$web_sha" "$public_sha")"
  if [[ ! "$server_sha" =~ ^[0-9a-f]{40}$ || "$server_sha" != "$web_sha" || "$server_sha" != "$public_sha" ]]; then
    retention_protection_status=manual_review
  fi

  if [[ -L "$current" ]]; then
    if [[ "$(readlink -f -- "$current" 2>/dev/null)" != "$releases/$server_sha" ]] ||
      ! retention_release_identity_matches "$releases/$server_sha" "$server_sha"; then
      retention_protection_status=manual_review
    fi
  elif ! retention_release_identity_matches "$current" "$server_sha"; then
    retention_protection_status=manual_review
  fi
  if ! public_containers="$(docker ps -a --format '{{.Names}}' 2>/dev/null)"; then
    retention_protection_status=manual_review
  fi
  while IFS= read -r container_name; do
    [[ "$container_name" =~ ^${public_container_prefix}[0-9a-f]{8}$ ]] || continue
    container_sha="$(read_git_sha "$container_name" || true)"
    running="$(docker inspect "$container_name" --format '{{.State.Running}}' 2>/dev/null || true)"
    if [[ ! "$container_sha" =~ ^[0-9a-f]{40}$ || "$container_name" != "$public_container_prefix${container_sha:0:8}" ]]; then
      retention_protection_status=manual_review
    elif [[ "$running" == true ]]; then
      protected_shas+=$'\n'"$container_sha"
    elif [[ "$running" == false ]]; then
      stopped_public_container_count=$((stopped_public_container_count + 1))
      stopped_containers+=$'\n'"$container_sha"
    else
      retention_protection_status=manual_review
    fi
  done <<<"$public_containers"

  shopt -s nullglob
  if ! plain_directory "$operations_root" || ! plain_directory "$releases"; then retention_protection_status=manual_review; fi
  for operation_dir in "$operations_root"/*; do
    if ! plain_directory "$operation_dir"; then
      retention_protection_status=manual_review
      continue
    fi
    operation_directory_count=$((operation_directory_count + 1))
    operation_id="$(basename "$operation_dir")"
    if [[ ! "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]; then
      retention_protection_status=manual_review
      continue
    fi
    operation_documents=""
    terminal_passed=false
    for file in "$operation_dir/receipt.json" "$operation_dir/state.json" \
      "$operation_dir/rollback-receipt.json" "$operation_dir/rollback-state.json" \
      "$operation_dir/database-rebuild-receipt.json" "$operation_dir/database-rebuild-state.json"; do
      [[ -e "$file" || -L "$file" ]] || continue
      if ! plain_file "$file" || ! document="$(jq -cse --arg target "$target_key" --arg operation "$operation_id" '
        select(length == 1) | .[0] |
        select(type == "object" and .target == $target and .operationId == $operation) |
        select(.schemaVersion | . == "plush.remote-promotion-receipt/v6" or test("^plush[.]remote-(promotion|rollback|database-rebuild|target-initialization)-(state|receipt)/v[1-5]$")) |
        select(.status | IN("running", "passed", "failed", "blocked", "not_proven"))
      ' "$file" 2>/dev/null)"; then
        retention_protection_status=manual_review
        continue
      fi
      operation_documents+=$'\n'"$document"
      if jq -e '.status == "passed" and (.schemaVersion | contains("-receipt/"))' <<<"$document" >/dev/null; then
        terminal_passed=true
        if ! document="$(jq -er '
          (.gitSha // .toGitSha) as $sha |
          select($sha | type == "string" and test("^[0-9a-f]{40}$")) |
          select([.before.runtimeSha, .fromGitSha] | all(
            . == null or (type == "string" and test("^[0-9a-f]{40}$")))) |
          (.finishedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) as $finished |
          [$sha, (.before.runtimeSha // .fromGitSha // empty)][] |
          select(test("^[0-9a-f]{40}$")) | "\($finished) \(.)"
        ' <<<"$document" 2>/dev/null)"; then
          retention_protection_status=manual_review
        else
          successful_history+=$'\n'"$document"
        fi
      fi
    done
    if [[ -z "$operation_documents" ]]; then retention_protection_status=manual_review; fi
    if [[ "$terminal_passed" != true ]]; then
      document="$(jq -r '.. | strings | select(test("^[0-9a-f]{40}$"))' <<<"$operation_documents" 2>/dev/null || true)"
      if [[ -z "$document" ]]; then retention_protection_status=manual_review; fi
      protected_shas+=$'\n'"$document"
    fi
  done
  while read -r stamp sha; do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    if printf '%s\n' "$server_sha" "$web_sha" "$public_sha" "$rollback_shas" | grep -Fxq "$sha"; then continue; fi
    protected_shas+=$'\n'"$sha"
    rollback_shas+=$'\n'"$sha"
    selected=$((selected + 1))
    [[ "$selected" -lt 2 ]] || break
  done < <(printf '%s\n' "$successful_history" | sort -k1,1nr -k2,2)
  if [[ -n "$rollback_shas" ]]; then
    rollback_release_shas="$(printf '%s\n' "$rollback_shas" | sed '/^$/d' | paste -sd, -)"
  fi
  selected=0
  while read -r stamp sha; do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    if printf '%s\n' "$recent_shas" | grep -Fxq "$sha"; then continue; fi
    recent_shas+=$'\n'"$sha"
    protected_shas+=$'\n'"$sha"
    selected=$((selected + 1))
    [[ "$selected" -lt 7 ]] || break
  done < <(printf '%s\n' "$successful_history" | sort -k1,1nr -k2,2)

  for cache_root in "${cache_roots[@]}"; do
    if [[ -e "$cache_root" || -L "$cache_root" ]] && ! plain_directory "$cache_root"; then
      retention_protection_status=manual_review
      continue
    fi
    for cache_dir in "$cache_root"/*; do
      if ! plain_directory "$cache_dir" || [[ ! "$(basename "$cache_dir")" =~ ^[0-9a-f]{64}$ ]] ||
        ! plain_file "$cache_dir/release-artifact.json" ||
        ! cache_sha="$(jq -ser 'select(length == 1) | .[0] | select(.schemaVersion == "plush-release-artifact/v1") | .git.commit | select(type == "string" and test("^[0-9a-f]{40}$"))' "$cache_dir/release-artifact.json" 2>/dev/null)"; then
        retention_protection_status=manual_review
        continue
      fi
      formal_cache_count=$((formal_cache_count + 1))
      cache_inventory+=$'\n'"$cache_sha $cache_dir"
    done
  done
  for release_dir in "$releases"/*; do
    release_directory_count=$((release_directory_count + 1))
    release_sha="$(basename "$release_dir")"
    if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]] ||
      ! retention_release_identity_matches "$release_dir" "$release_sha"; then
      manual_review_release_count=$((manual_review_release_count + 1))
      if printf '%s\n' "$protected_shas" | grep -Fxq "$release_sha"; then retention_protection_status=manual_review; fi
      continue
    fi
    identified_release_count=$((identified_release_count + 1))
    if printf '%s\n' "$protected_shas" | grep -Fxq "$release_sha"; then
      protected_release_count=$((protected_release_count + 1))
    else
      retention_candidate_count=$((retention_candidate_count + 1))
      release_bytes="$(du -sb "$release_dir" 2>/dev/null | awk '{print $1}')" || retention_protection_status=manual_review
      if [[ ! "$release_bytes" =~ ^[0-9]+$ ]]; then
        retention_protection_status=manual_review
        release_bytes=0
      fi
      retention_candidate_bytes=$((retention_candidate_bytes + release_bytes))
      candidate_shas+=$'\n'"$release_sha"
    fi
  done
  while read -r sha cache_dir; do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    if printf '%s\n' "$protected_shas" | grep -Fxq "$sha"; then continue; fi
    cache_candidate_count=$((cache_candidate_count + 1))
    release_bytes="$(du -sb "$cache_dir" 2>/dev/null | awk '{print $1}')" || retention_protection_status=manual_review
    if [[ ! "$release_bytes" =~ ^[0-9]+$ ]]; then
      retention_protection_status=manual_review
      release_bytes=0
    fi
    cache_candidate_bytes=$((cache_candidate_bytes + release_bytes))
  done <<<"$cache_inventory"
  while IFS= read -r sha; do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    if ! printf '%s\n' "$protected_shas" | grep -Fxq "$sha"; then
      stopped_public_container_candidate_count=$((stopped_public_container_candidate_count + 1))
    fi
  done <<<"$stopped_containers"
  if [[ "$retention_protection_status" != complete ]]; then
    protected_release_count=$identified_release_count
    retention_candidate_count=0
    retention_candidate_bytes=0
    cache_candidate_count=0
    cache_candidate_bytes=0
    stopped_public_container_candidate_count=0
    candidate_shas=""
  fi
  if [[ -n "$candidate_shas" ]]; then
    retention_candidate_shas="$(printf '%s\n' "$candidate_shas" | sed '/^$/d' | sort -u | paste -sd, -)"
  fi
  if plain_directory "$incoming_root"; then
    for operation_dir in "$incoming_root"/*; do
      plain_directory "$operation_dir" || continue
      retained_operation_count=$((retained_operation_count + 1))
    done
  fi
}
