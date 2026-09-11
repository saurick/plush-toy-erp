#!/usr/bin/env bash
# Read-only mount check. Never create the directory before proving the backing disk.
set -euo pipefail
raid_mount="${1:-}"
data_dir="${2:-}"
fail() { echo "[attachment-storage] $*" >&2; exit 1; }
for value in "$raid_mount" "$data_dir"; do
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ && "$value" != / && "$value" != */ && "$value" != *'/../'* && "$value" != *'/./'* && "$value" != *'//'* ]] || fail '存储路径必须是专用绝对路径'
  [[ -d "$value" && "$(realpath "$value")" == "$value" ]] || fail '存储目录必须已存在且不能经过符号链接'
done
[[ "$data_dir" == "$raid_mount/"* ]] || fail '附件目录必须位于指定 RAID5 挂载点下'
command -v findmnt >/dev/null || fail '缺少 findmnt'
[[ "$(findmnt -rn --mountpoint "$raid_mount" -o TARGET)" == "$raid_mount" ]] || fail 'RAID5 未挂载'
[[ "$(findmnt -rn --target "$data_dir" -o TARGET)" == "$raid_mount" ]] || fail '附件目录使用了其他挂载点'
source_device="$(findmnt -rn --target "$data_dir" -o SOURCE)"
filesystem="$(findmnt -rn --target "$data_dir" -o FSTYPE)"
[[ "$source_device" == /dev/* ]] || fail '附件存储必须使用本机块设备'
case "$filesystem" in ext4|xfs|btrfs) ;; *) fail '附件存储必须使用本地持久文件系统' ;; esac
[[ ",$(findmnt -rn --target "$data_dir" -o OPTIONS)," == *,rw,* ]] || fail 'RAID5 不是可写挂载'
echo '[attachment-storage] RAID5 挂载和目录核验通过'
