#!/usr/bin/env sh
set -eu

target=${1:-}
project=${2:-}
file=${3:-}
case "$target" in demo-133 | customer-test-133 | production-133) ;; *) exit 1 ;; esac
[ -n "$project" ] && [ -f "$file" ] && [ ! -L "$file" ] || exit 1

# Keep CIDRs in the versioned Compose file. All deployment entry points share
# this closed shape contract instead of maintaining separate YAML allowlists.
awk -v target="$target" -v project="$project" '
function private_subnet(value, cidr, octets, i) {
  if (split(value, cidr, "/") != 2 || cidr[2] != "28") return 0
  if (split(cidr[1], octets, "[.]") != 4) return 0
  for (i = 1; i <= 4; i++) {
    if (octets[i] !~ /^(0|[1-9][0-9]*)$/ || octets[i] + 0 > 255) return 0
  }
  if (octets[4] % 16 != 0) return 0
  return octets[1] == 10 || (octets[1] == 192 && octets[2] == 168) ||
    (octets[1] == 172 && octets[2] >= 16 && octets[2] <= 31)
}
{
  line = $0
  sub(/^[[:space:]]+/, "", line)
  sub(/[[:space:]]+$/, "", line)
  if (line != "" && line !~ /^#/) lines[++count] = line
}
END {
  if (lines[1] != "name: " project) exit 1
  if (target != "production-133") exit count == 1 ? 0 : 1
  if (count != 10 || lines[2] != "networks:" || lines[3] != "default:" ||
      lines[4] != "ipam:" || lines[5] != "config:" ||
      lines[7] != "attachment-private:" || lines[8] != "ipam:" || lines[9] != "config:") exit 1
  if (lines[6] !~ /^- subnet: / || lines[10] !~ /^- subnet: /) exit 1
  default_subnet = substr(lines[6], 11)
  attachment_subnet = substr(lines[10], 11)
  exit private_subnet(default_subnet) && private_subnet(attachment_subnet) &&
    default_subnet != attachment_subnet ? 0 : 1
}' "$file"
