# This source-only helper receives the fixed operation state from its owning
# remote script and publishes verified acquisition state back to that caller.
# shellcheck shell=bash
# shellcheck disable=SC2034,SC2154
acquire_target_release() {
  local descriptor=$incoming/target-release-fetch.json
  local curl_config name expected_size expected_sha expected_source_size
  local expected_source_sha formal_url source_url
  local acquisition_deadline remaining_seconds
  local any_present=0 all_present=1
  local formal_files=(
    checksums.sha256
    release-artifact.json
    release-manifest.json
    release-rehearsal.json
    sbom.cdx.json
    server-image.tar
    web-image.tar
  )
  local release_files=("${formal_files[@]}" source.tar)

  [[ -f "$descriptor" && ! -L "$descriptor" ]] ||
    fail "target release fetch descriptor is missing"
  jq -e \
    --arg sha "$release_sha" \
    --arg version "$release_version" \
    '.schemaVersion == "plush.target-release-fetch/v2" and
     .provider == "gitlab" and .project == "saurick/plush-toy-erp" and
     .host == "gitlab.saurick.me" and .resolvedAddress == "192.168.0.133" and
     .gitSha == $sha and .version == $version and
     .packageVersion == ("artifact-" + $sha) and
     .formal.package == "plush-release" and
     ([.formal.files[].name] | sort) == ["checksums.sha256","release-artifact.json","release-manifest.json","release-rehearsal.json","sbom.cdx.json","server-image.tar","web-image.tar"] and
     ([.formal.files[] | select((.size | type) != "number" or .size < 1 or (.sha256 | test("^[0-9a-f]{64}$") | not))] | length) == 0 and
     .source.package == "plush-release-source" and
     .source.file.name == "source.tar" and
     (.source.file.size | type) == "number" and .source.file.size > 0 and
     (.source.file.sha256 | test("^[0-9a-f]{64}$")) and
     .redaction == {containsCredentials:false,containsSecrets:false}' \
    "$descriptor" >/dev/null

  for name in "${release_files[@]}"; do
    if [[ -e "$incoming/$name" || -L "$incoming/$name" ]]; then
      any_present=1
    else
      all_present=0
    fi
  done
  if [[ "$all_present" == 1 ]]; then
    for name in "${formal_files[@]}"; do
      expected_size="$(jq -er --arg name "$name" '.formal.files[] | select(.name == $name) | .size' "$descriptor")"
      expected_sha="$(jq -er --arg name "$name" '.formal.files[] | select(.name == $name) | .sha256' "$descriptor")"
      [[ -f "$incoming/$name" && ! -L "$incoming/$name" &&
        "$(stat -c '%s' "$incoming/$name")" == "$expected_size" &&
        "$(sha256sum "$incoming/$name" | awk '{print $1}')" == "$expected_sha" ]] ||
        fail "cached release does not match formal package metadata"
    done
    expected_source_size="$(jq -er '.source.file.size' "$descriptor")"
    expected_source_sha="$(jq -er '.source.file.sha256' "$descriptor")"
    [[ -f "$incoming/source.tar" && ! -L "$incoming/source.tar" &&
      "$(stat -c '%s' "$incoming/source.tar")" == "$expected_source_size" &&
      "$(sha256sum "$incoming/source.tar" | awk '{print $1}')" == "$expected_source_sha" ]] ||
      fail "cached release source does not match source package metadata"
    (cd "$incoming" && sha256sum --check --strict checksums.sha256) >>"$log_file" 2>&1
    [[ "$(jq -er '.sourceArchive.sha256' "$incoming/release-artifact.json")" == "$expected_source_sha" ]] ||
      fail "cached release source does not match formal release artifact"
    acquisition_expected_bytes=0
    acquisition_downloaded_bytes=0
    acquisition_mode=target_cache
    acquisition_verified=true
    unset target_fetch_token
    credential_cleanup_proven=true
    return 0
  fi
  [[ "$any_present" == 0 ]] || fail "partial target release acquisition exists"

  [[ "${target_fetch_token-}" =~ ^[A-Za-z0-9_.-]{20,512}$ ]] ||
    fail "target release fetch credential shape is invalid"
  fetch_materializing=$incoming/.acquire-$operation_id
  [[ ! -e "$fetch_materializing" && ! -L "$fetch_materializing" ]]
  mkdir "$fetch_materializing"
  chmod 700 "$fetch_materializing"
  fetch_materializing_created=1
  curl_config=$fetch_materializing/curl.conf
  printf 'header = "DEPLOY-TOKEN: %s"\n' "$target_fetch_token" >"$curl_config"
  chmod 600 "$curl_config"
  unset target_fetch_token

  acquisition_expected_bytes="$(jq -er '([.formal.files[].size] | add) + .source.file.size' "$descriptor")"
  acquisition_deadline=$((SECONDS + 900))
  for name in "${formal_files[@]}"; do
    remaining_seconds=$((acquisition_deadline - SECONDS))
    ((remaining_seconds > 10)) || fail "target release acquisition deadline expired"
    formal_url="https://gitlab.saurick.me/api/v4/projects/saurick%2Fplush-toy-erp/packages/generic/plush-release/artifact-$release_sha/$name"
    curl --config "$curl_config" --fail --silent --show-error \
      --proto '=https' --tlsv1.2 \
      --resolve gitlab.saurick.me:443:192.168.0.133 \
      --connect-timeout 10 --max-time "$remaining_seconds" \
      --output "$fetch_materializing/$name" "$formal_url" >>"$log_file" 2>&1
    chmod 600 "$fetch_materializing/$name"
  done
  remaining_seconds=$((acquisition_deadline - SECONDS))
  ((remaining_seconds > 10)) || fail "target release acquisition deadline expired"
  source_url="https://gitlab.saurick.me/api/v4/projects/saurick%2Fplush-toy-erp/packages/generic/plush-release-source/artifact-$release_sha/source.tar"
  curl --config "$curl_config" --fail --silent --show-error \
    --proto '=https' --tlsv1.2 \
    --resolve gitlab.saurick.me:443:192.168.0.133 \
    --connect-timeout 10 --max-time "$remaining_seconds" \
    --output "$fetch_materializing/source.tar" "$source_url" >>"$log_file" 2>&1
  chmod 600 "$fetch_materializing/source.tar"
  rm -f -- "$curl_config"
  [[ ! -e "$curl_config" && ! -L "$curl_config" &&
    -z "${target_fetch_token+x}" ]] ||
    fail "target release fetch credential cleanup failed"
  credential_cleanup_proven=true

  for name in "${formal_files[@]}"; do
    expected_size="$(jq -er --arg name "$name" '.formal.files[] | select(.name == $name) | .size' "$descriptor")"
    expected_sha="$(jq -er --arg name "$name" '.formal.files[] | select(.name == $name) | .sha256' "$descriptor")"
    [[ "$(stat -c '%s' "$fetch_materializing/$name")" == "$expected_size" &&
    "$(sha256sum "$fetch_materializing/$name" | awk '{print $1}')" == "$expected_sha" ]] ||
      fail "formal release asset identity does not match package metadata"
  done
  expected_source_size="$(jq -er '.source.file.size' "$descriptor")"
  expected_source_sha="$(jq -er '.source.file.sha256' "$descriptor")"
  [[ "$(stat -c '%s' "$fetch_materializing/source.tar")" == "$expected_source_size" &&
  "$(sha256sum "$fetch_materializing/source.tar" | awk '{print $1}')" == "$expected_source_sha" ]] ||
    fail "release source identity does not match source package metadata"
  (cd "$fetch_materializing" && sha256sum --check --strict checksums.sha256) >>"$log_file" 2>&1
  [[ "$(jq -er '.sourceArchive.sha256' "$fetch_materializing/release-artifact.json")" == "$expected_source_sha" ]] ||
    fail "release source does not match formal release artifact"

  fetch_payloads_published=1
  for name in "${release_files[@]}"; do
    mv "$fetch_materializing/$name" "$incoming/$name"
  done
  acquisition_downloaded_bytes=$acquisition_expected_bytes
  acquisition_mode=gitlab_internal
  acquisition_verified=true
  rm -rf -- "$fetch_materializing"
  fetch_materializing_created=0
}
