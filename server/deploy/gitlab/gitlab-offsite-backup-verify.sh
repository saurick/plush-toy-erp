#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir=""
identity_file=""
report_file=""
max_age_hours=36

while [[ $# -gt 0 ]]; do
  case "$1" in
  --backup-dir)
    backup_dir="${2:-}"
    shift 2
    ;;
  --age-identity-file)
    identity_file="${2:-}"
    shift 2
    ;;
  --report)
    report_file="${2:-}"
    shift 2
    ;;
  --max-age-hours)
    max_age_hours="${2:-}"
    shift 2
    ;;
  -h | --help)
    echo "usage: bash server/deploy/gitlab/gitlab-offsite-backup-verify.sh --backup-dir <mounted-offsite-dir> --age-identity-file <identity-file> [--report <json>] [--max-age-hours <hours>]"
    exit 0
    ;;
  *)
    echo "[gitlab-offsite-verify] unsupported argument: $1" >&2
    exit 2
    ;;
  esac
done

plain_directory() {
  [[ "$1" == /* && "$1" != "/" && -d "$1" && ! -L "$1" && "$(realpath -e -- "$1")" == "$1" ]]
}

plain_file() {
  [[ "$1" == /* && -f "$1" && ! -L "$1" && "$(realpath -e -- "$1")" == "$1" ]]
}

for command_name in age date findmnt realpath sha256sum stat tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "[gitlab-offsite-verify] missing command: $command_name" >&2
    exit 2
  }
done

plain_directory "$backup_dir" || {
  echo "[gitlab-offsite-verify] backup directory is invalid" >&2
  exit 2
}
plain_file "$identity_file" || {
  echo "[gitlab-offsite-verify] age identity file is invalid" >&2
  exit 2
}
[[ "$max_age_hours" =~ ^[1-9][0-9]{0,3}$ ]] || {
  echo "[gitlab-offsite-verify] max age must be a positive hour count" >&2
  exit 2
}
marker="$backup_dir/.plush-gitlab-offsite-target"
plain_file "$marker" && [[ "$(<"$marker")" == "plush-gitlab-offsite-v1" ]] || {
  echo "[gitlab-offsite-verify] offsite marker is invalid" >&2
  exit 2
}
[[ "$(findmnt -n -o TARGET --target "$backup_dir")" == "$backup_dir" ]] || {
  echo "[gitlab-offsite-verify] backup directory must be an exact mount point" >&2
  exit 2
}
identity_mode="$(stat -c '%a' "$identity_file")"
identity_owner="$(stat -c '%u' "$identity_file")"
if ! [[ "$identity_owner" == "$EUID" && "$identity_mode" =~ ^[0-7]{3,4}$ ]] || ! (((8#$identity_mode & 8#077) == 0)); then
  echo "[gitlab-offsite-verify] age identity file must be owner-only" >&2
  exit 2
fi

latest="$(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
[[ -n "$latest" && ! -L "$latest" && "$(dirname -- "$latest")" == "$backup_dir" && "$(basename -- "$latest")" =~ ^backup-[0-9]{8}T[0-9]{6}Z$ ]] || {
  echo "[gitlab-offsite-verify] no valid offsite backup exists" >&2
  exit 2
}
expected_inventory=$'checksums.sha256.age\nconfig.tar.gz.age\nencrypted.sha256\nmanifest.env.age\nrepository.tar.age'
actual_inventory="$(find "$latest" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)"
[[ "$actual_inventory" == "$expected_inventory" ]] || {
  echo "[gitlab-offsite-verify] backup inventory is incomplete" >&2
  exit 2
}
if find "$latest" -mindepth 1 -maxdepth 1 -type l -print -quit | grep -q .; then
  echo "[gitlab-offsite-verify] backup inventory contains a symbolic link" >&2
  exit 2
fi

(
  cd "$latest"
  awk '
    $1 !~ /^[0-9a-f]{64}$/ { exit 1 }
    $2 !~ /^(repository[.]tar[.]age|config[.]tar[.]gz[.]age|checksums[.]sha256[.]age|manifest[.]env[.]age)$/ { exit 1 }
    seen[$2] += 1
    END {
      if (NR != 4 || seen["repository.tar.age"] != 1 || seen["config.tar.gz.age"] != 1 || seen["checksums.sha256.age"] != 1 || seen["manifest.env.age"] != 1) exit 1
    }
  ' encrypted.sha256
  sha256sum --check --strict encrypted.sha256 >/dev/null
)
temporary="$(mktemp -d)"
cleanup() {
  if [[ -d "$temporary" && ! -L "$temporary" ]]; then
    find "$temporary" -xdev -depth -delete
  fi
}
trap cleanup EXIT
age --decrypt --identity "$identity_file" --output "$temporary/manifest.env" "$latest/manifest.env.age"
manifest="$temporary/manifest.env"
manifest_value() {
  local key="$1"
  local count value
  count="$(grep -Ec "^${key}=" "$manifest" || true)"
  [[ "$count" == 1 ]] || return 2
  value="$(sed -n "s/^${key}=//p" "$manifest")"
  [[ "$value" =~ ^[A-Za-z0-9._:/+-]+$ ]] || return 2
  printf '%s' "$value"
}
[[ "$(manifest_value schemaVersion)" == "plush.gitlab-offsite-backup/v1" ]]
[[ "$(manifest_value status)" == "passed" ]]
backup_id="$(manifest_value backupId)"
completed_at="$(manifest_value completedAt)"
repository_hash="$(manifest_value repositorySha256)"
repository_size="$(manifest_value repositorySizeBytes)"
config_hash="$(manifest_value configSha256)"
config_size="$(manifest_value configSizeBytes)"
[[ "$backup_id" =~ ^gitlab-[0-9]{8}T[0-9]{6}Z$ ]]
[[ "$backup_id" == "gitlab-${latest##*/backup-}" ]]
[[ "$repository_hash" =~ ^[0-9a-f]{64}$ && "$config_hash" =~ ^[0-9a-f]{64}$ ]]
[[ "$repository_size" =~ ^[1-9][0-9]*$ && "$config_size" =~ ^[1-9][0-9]*$ ]]
[[ "$(awk 'END {print NR}' "$manifest")" == 8 ]]
completed_epoch="$(date -u -d "$completed_at" +%s)"
now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - completed_epoch))
((age_seconds >= 0 && age_seconds <= max_age_hours * 3600)) || {
  echo "[gitlab-offsite-verify] latest backup is stale" >&2
  exit 2
}

age --decrypt --identity "$identity_file" --output "$temporary/repository.tar" "$latest/repository.tar.age"
age --decrypt --identity "$identity_file" --output "$temporary/config.tar.gz" "$latest/config.tar.gz.age"
age --decrypt --identity "$identity_file" --output "$temporary/checksums.sha256" "$latest/checksums.sha256.age"
(
  cd "$temporary"
  awk '
    $1 !~ /^[0-9a-f]{64}$/ { exit 1 }
    $2 !~ /^(repository[.]tar|config[.]tar[.]gz)$/ { exit 1 }
    seen[$2] += 1
    END {
      if (NR != 2 || seen["repository.tar"] != 1 || seen["config.tar.gz"] != 1) exit 1
    }
  ' checksums.sha256
  sha256sum --check --strict checksums.sha256 >/dev/null
)
[[ "$(awk '$2 == "repository.tar" {print $1}' "$temporary/checksums.sha256")" == "$repository_hash" ]]
[[ "$(awk '$2 == "config.tar.gz" {print $1}' "$temporary/checksums.sha256")" == "$config_hash" ]]
[[ "$(stat -c '%s' "$temporary/repository.tar")" == "$repository_size" ]]
[[ "$(stat -c '%s' "$temporary/config.tar.gz")" == "$config_size" ]]
tar -tf "$temporary/repository.tar" >/dev/null
tar -tzf "$temporary/config.tar.gz" >/dev/null

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
report="$(printf '{\n  "schemaVersion": "plush.gitlab-offsite-verify/v1",\n  "status": "passed",\n  "generatedAt": "%s",\n  "backupId": "%s",\n  "backupAgeSeconds": %s,\n  "repositorySha256": "%s",\n  "configSha256": "%s",\n  "boundary": "encrypted-copy-and-archive-integrity"\n}\n' "$generated_at" "$backup_id" "$age_seconds" "$repository_hash" "$config_hash")"
if [[ -n "$report_file" ]]; then
  report_parent="$(dirname -- "$report_file")"
  [[ "$report_file" == /* && "$report_file" != */../* && "$report_file" != */.. && -d "$report_parent" && ! -L "$report_parent" ]] || {
    echo "[gitlab-offsite-verify] report path is invalid" >&2
    exit 2
  }
  report_temp="$report_file.tmp.$$"
  printf '%s' "$report" >"$report_temp"
  chmod 0600 "$report_temp"
  mv -f -- "$report_temp" "$report_file"
else
  printf '%s' "$report"
fi
echo "[gitlab-offsite-verify] status=passed backupId=$backup_id backupAgeSeconds=$age_seconds boundary=encrypted-copy-and-archive-integrity"
echo "[gitlab-offsite-verify] full GitLab restore in a disposable same-version instance remains required"
