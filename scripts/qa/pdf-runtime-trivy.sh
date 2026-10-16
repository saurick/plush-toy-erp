#!/usr/bin/env bash

# The cache only supplies download bytes. Trivy still refreshes its database and
# scans the requested image on every invocation; scan results are never cached.
scan_pdf_runtime_image() (
  set -euo pipefail
  umask 077
  local root="$1" image_id="$2" output="$3" pins version checksum directory links
  local tool_dir archive archive_tmp="" report_tmp="" tool_cache=hit database_cache=missing
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
  pins="$(node -e 'const p=require(process.argv[1]); console.log(p.trivyVersion+" "+p.trivyLinuxAMD64ArchiveSHA256)' "$root/scripts/qa/pdf-runtime-policy.json")"
  read -r version checksum <<<"$pins"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$checksum" =~ ^[0-9a-f]{64}$ ]]
  tool_dir="$root/output/cache/pdf-runtime/trivy-$version"
  for directory in "$root/output" "$root/output/cache" "$root/output/cache/pdf-runtime" \
    "$tool_dir" "$root/output/cache/pdf-runtime/trivy-db"; do
    [[ ! -L "$directory" && (! -e "$directory" || -d "$directory") ]]
    mkdir -p -- "$directory"
  done
  links="$(find "$root/output/cache/pdf-runtime" -type l -print -quit)"
  [[ -z "$links" ]]
  archive="$tool_dir/trivy.tar.gz"
  [[ ! -e "$archive" || -f "$archive" ]]
  [[ ! -e "$tool_dir/trivy" || -f "$tool_dir/trivy" ]]
  trap '[[ -z "$archive_tmp" ]] || rm -f -- "$archive_tmp"; [[ -z "$report_tmp" ]] || rm -f -- "$report_tmp"' EXIT
  if [[ ! -f "$archive" ]] || [[ "$(sha256sum "$archive" | cut -d ' ' -f 1)" != "$checksum" ]]; then
    tool_cache=miss
    archive_tmp="$(mktemp "$tool_dir/.trivy-XXXXXX.tar.gz")"
    curl --fail --location --retry 2 --connect-timeout 15 --max-time 900 \
      "https://github.com/aquasecurity/trivy/releases/download/v$version/trivy_${version}_Linux-64bit.tar.gz" \
      --output "$archive_tmp"
    test "$(sha256sum "$archive_tmp" | cut -d ' ' -f 1)" = "$checksum"
    mv -f -- "$archive_tmp" "$archive"
  fi
  tar -xzf "$archive" -C "$tool_dir" trivy
  if [[ -f "$root/output/cache/pdf-runtime/trivy-db/db/metadata.json" ]]; then database_cache=present; fi
  printf '[pdf-runtime] trivy-tool-cache=%s trivy-db-cache=%s\n' "$tool_cache" "$database_cache"
  report_tmp="$(mktemp "$output/.vulnerabilities-XXXXXX.json")"
  GODEBUG=http2client=0 "$tool_dir/trivy" image --image-src docker --scanners vuln --list-all-pkgs --skip-version-check \
    --db-repository public.ecr.aws/aquasecurity/trivy-db:2 \
    --db-repository ghcr.io/aquasecurity/trivy-db:2 \
    --cache-dir "$root/output/cache/pdf-runtime/trivy-db" --cache-backend memory \
    --timeout 30m --parallel 2 \
    --format json --output "$report_tmp" "$image_id"
  test -s "$report_tmp"
  mv -f -- "$report_tmp" "$output/vulnerabilities.json"
)
