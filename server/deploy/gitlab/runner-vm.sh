#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEMPLATE_FILE="$SCRIPT_DIR/runner-vm-cloud-init.yml"
CAPACITY_HELPER="$SCRIPT_DIR/runner-capacity.sh"
CHROMIUM_SANDBOX_HELPER="$SCRIPT_DIR/runner-chromium-sandbox.sh"
SOURCE_CAPACITY_FILE="$SCRIPT_DIR/runner-capacity.env"
DOMAIN=plush-gitlab-runner
POOL=runner-vm
NETWORK=plush-runner
DISK_VOLUME=plush-gitlab-runner.qcow2
SEED_VOLUME=plush-gitlab-runner-seed.iso
LOCK_DIR=/run/plush-runner-vm
LOCK_FILE=/run/plush-runner-vm/provision.lock

MODE=preview
VCPUS=
MEMORY_MIB=
DISK_GIB=
BASE_VOLUME=
SSH_PUBLIC_KEY_FILE=
CONFIRMATION=

usage() {
  cat <<'USAGE'
Usage:
  sudo bash server/deploy/gitlab/runner-vm.sh \
    --vcpus N --memory-mib N --disk-gib N \
    --base-volume ubuntu-24.04-base.qcow2 \
    --ssh-public-key-file /trusted/path/runner.pub

Add --execute and the exact confirmation printed by preview to provision the
single preabsent Runner VM. vCPU, memory and disk are independent inputs; the
initial slot value comes only from runner-capacity.env and never defaults to the
CPU count. Existing domains or volumes fail closed.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  --vcpus)
    VCPUS="${2:-}"
    shift 2
    ;;
  --memory-mib)
    MEMORY_MIB="${2:-}"
    shift 2
    ;;
  --disk-gib)
    DISK_GIB="${2:-}"
    shift 2
    ;;
  --base-volume)
    BASE_VOLUME="${2:-}"
    shift 2
    ;;
  --ssh-public-key-file)
    SSH_PUBLIC_KEY_FILE="${2:-}"
    shift 2
    ;;
  --execute)
    [[ "$MODE" == preview ]]
    MODE=execute
    shift
    ;;
  --confirm)
    CONFIRMATION="${2:-}"
    shift 2
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "[runner-vm] status=incomplete reason=unsupported_argument" >&2
    usage >&2
    exit 2
    ;;
  esac
done

for value in "$VCPUS" "$MEMORY_MIB" "$DISK_GIB"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]]
done
[[ "$BASE_VOLUME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
[[ -n "$SSH_PUBLIC_KEY_FILE" ]]
((DISK_GIB >= 50))

for command in awk base64 cloud-localds flock grep install mktemp rm rmdir sha256sum stat timeout virsh virt-install; do
  command -v "$command" >/dev/null
done
[[ -f "$TEMPLATE_FILE" && ! -L "$TEMPLATE_FILE" ]]
[[ -f "$CAPACITY_HELPER" && ! -L "$CAPACITY_HELPER" ]]
[[ -f "$CHROMIUM_SANDBOX_HELPER" && ! -L "$CHROMIUM_SANDBOX_HELPER" ]]
[[ -f "$SOURCE_CAPACITY_FILE" && ! -L "$SOURCE_CAPACITY_FILE" ]]
[[ -f "$SSH_PUBLIC_KEY_FILE" && ! -L "$SSH_PUBLIC_KEY_FILE" ]]
[[ "$(stat -c '%h' "$TEMPLATE_FILE")" == 1 ]]
[[ "$(stat -c '%h' "$CAPACITY_HELPER")" == 1 ]]
[[ "$(stat -c '%h' "$CHROMIUM_SANDBOX_HELPER")" == 1 ]]
[[ "$(stat -c '%h' "$SOURCE_CAPACITY_FILE")" == 1 ]]
[[ "$(stat -c '%h' "$SSH_PUBLIC_KEY_FILE")" == 1 ]]
bash -n "$CAPACITY_HELPER"
bash -n "$CHROMIUM_SANDBOX_HELPER"
[[ "$(awk 'END {print NR}' "$SOURCE_CAPACITY_FILE")" -eq 1 ]]
RUNNER_CONCURRENT_SLOTS="$(sed -n 's/^RUNNER_CONCURRENT_SLOTS=//p' "$SOURCE_CAPACITY_FILE")"
[[ "$RUNNER_CONCURRENT_SLOTS" =~ ^[1-9][0-9]*$ ]]
SLOT_SAFETY_MAX="$RUNNER_CONCURRENT_SLOTS"
((SLOT_SAFETY_MAX <= VCPUS))

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

SSH_PUBLIC_KEY="$(awk 'NF == 2 && $1 == "ssh-ed25519" && $2 ~ /^[A-Za-z0-9+\/=]+$/ {print; accepted += 1} END {if (accepted != 1 || NR != 1) exit 42}' "$SSH_PUBLIC_KEY_FILE")"
[[ -n "$SSH_PUBLIC_KEY" ]]

for placeholder in \
  __PLUSH_RUNNER_SSH_AUTHORIZED_KEY__ \
  __PLUSH_RUNNER_CAPACITY_SCRIPT_BASE64__ \
  __PLUSH_RUNNER_CHROMIUM_SANDBOX_SCRIPT_BASE64__ \
  __PLUSH_RUNNER_SLOT_SAFETY_MAX__ \
  __RUNNER_CONCURRENT_SLOTS__; do
  [[ "$(grep -Foc "$placeholder" "$TEMPLATE_FILE")" == 1 ]]
done

virsh -c qemu:///system pool-info "$POOL" >/dev/null
[[ "$(virsh -c qemu:///system pool-info "$POOL" | awk '$1 == "State:" {print $2}')" == running ]]
[[ "$(virsh -c qemu:///system pool-info "$POOL" | awk '$1 == "Autostart:" {print $2}')" == yes ]]
[[ "$(virsh -c qemu:///system net-info "$NETWORK" | awk '$1 == "Active:" {print $2}')" == yes ]]
[[ "$(virsh -c qemu:///system net-info "$NETWORK" | awk '$1 == "Autostart:" {print $2}')" == yes ]]
virsh -c qemu:///system vol-info --pool "$POOL" "$BASE_VOLUME" >/dev/null
BASE_VOLUME_KEY="$(virsh -c qemu:///system vol-key --pool "$POOL" "$BASE_VOLUME")"
[[ -n "$BASE_VOLUME_KEY" ]]
[[ -f "$BASE_VOLUME_KEY" && ! -L "$BASE_VOLUME_KEY" ]]
[[ "$(stat -c '%h' "$BASE_VOLUME_KEY")" == 1 ]]
BASE_VOLUME_SHA256="$(timeout 600 sha256sum -- "$BASE_VOLUME_KEY" | awk '{print $1}')"
TEMPLATE_SHA256="$(sha256sum "$TEMPLATE_FILE" | awk '{print $1}')"
HELPER_SHA256="$(sha256sum "$CAPACITY_HELPER" | awk '{print $1}')"
CHROMIUM_SANDBOX_HELPER_SHA256="$(sha256sum "$CHROMIUM_SANDBOX_HELPER" | awk '{print $1}')"
SSH_PUBLIC_KEY_SHA256="$(printf '%s' "$SSH_PUBLIC_KEY" | sha256sum | awk '{print $1}')"
SOURCE_CAPACITY_SHA256="$(sha256sum "$SOURCE_CAPACITY_FILE" | awk '{print $1}')"
for digest in "$BASE_VOLUME_SHA256" "$TEMPLATE_SHA256" "$HELPER_SHA256" "$CHROMIUM_SANDBOX_HELPER_SHA256" "$SSH_PUBLIC_KEY_SHA256" "$SOURCE_CAPACITY_SHA256"; do
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]]
done
if virsh -c qemu:///system dominfo "$DOMAIN" >/dev/null 2>&1; then
  echo "[runner-vm] status=incomplete reason=domain_exists" >&2
  exit 2
fi
for volume in "$DISK_VOLUME" "$SEED_VOLUME"; do
  if virsh -c qemu:///system vol-info --pool "$POOL" "$volume" >/dev/null 2>&1; then
    echo "[runner-vm] status=incomplete reason=volume_exists" >&2
    exit 2
  fi
done

EXPECTED_CONFIRMATION="PROVISION_PLUSH_RUNNER:R640:$DOMAIN:$POOL:$NETWORK:$VCPUS:$MEMORY_MIB:$DISK_GIB:$RUNNER_CONCURRENT_SLOTS:$BASE_VOLUME_SHA256:$TEMPLATE_SHA256:$HELPER_SHA256:$CHROMIUM_SANDBOX_HELPER_SHA256:$SOURCE_CAPACITY_SHA256:$SSH_PUBLIC_KEY_SHA256"
[[ "$EUID" -eq 0 ]]
if [[ "$MODE" == execute ]]; then
  [[ "$CONFIRMATION" == "$EXPECTED_CONFIRMATION" ]]
fi

OPERATION_ROOT="$(mktemp -d /var/tmp/.plush-runner-provision.XXXXXX)"
USER_DATA="$OPERATION_ROOT/user-data"
META_DATA="$OPERATION_ROOT/meta-data"
SEED_IMAGE="$OPERATION_ROOT/seed.iso"

cleanup_operation_root() {
  rm -f -- "$USER_DATA" "$META_DATA" "$SEED_IMAGE"
  rmdir -- "$OPERATION_ROOT"
}

cleanup_uncommitted_render() {
  local status=$?
  trap - EXIT
  if ! cleanup_operation_root; then
    echo "[runner-vm] status=rollback_incomplete" >&2
    exit 70
  fi
  exit "$status"
}
trap cleanup_uncommitted_render EXIT

chmod 0700 "$OPERATION_ROOT"
HELPER_BASE64="$(base64 -w0 "$CAPACITY_HELPER")"
CHROMIUM_SANDBOX_HELPER_BASE64="$(base64 -w0 "$CHROMIUM_SANDBOX_HELPER")"

awk \
  -v ssh_key="$SSH_PUBLIC_KEY" \
  -v helper="$HELPER_BASE64" \
  -v chromium_sandbox_helper="$CHROMIUM_SANDBOX_HELPER_BASE64" \
  -v runner_concurrent_slots="$RUNNER_CONCURRENT_SLOTS" \
  -v safety_max="$SLOT_SAFETY_MAX" '
  {
    gsub(/__PLUSH_RUNNER_SSH_AUTHORIZED_KEY__/, ssh_key)
    gsub(/__PLUSH_RUNNER_CAPACITY_SCRIPT_BASE64__/, helper)
    gsub(/__PLUSH_RUNNER_CHROMIUM_SANDBOX_SCRIPT_BASE64__/, chromium_sandbox_helper)
    gsub(/__PLUSH_RUNNER_SLOT_SAFETY_MAX__/, safety_max)
    gsub(/__RUNNER_CONCURRENT_SLOTS__/, runner_concurrent_slots)
    print
  }
' "$TEMPLATE_FILE" >"$USER_DATA"
if grep -Eq '__PLUSH_RUNNER_[A-Z0-9_]+__' "$USER_DATA"; then
  echo "[runner-vm] status=incomplete reason=template_unresolved" >&2
  exit 2
fi
printf 'instance-id: plush-gitlab-runner\nlocal-hostname: plush-gitlab-runner\n' >"$META_DATA"
chmod 0600 "$USER_DATA" "$META_DATA"
cloud-localds "$SEED_IMAGE" "$USER_DATA" "$META_DATA"
chmod 0600 "$SEED_IMAGE"

if [[ "$MODE" == preview ]]; then
  cleanup_operation_root
  trap - EXIT
  [[ ! -e "$OPERATION_ROOT" ]]
  echo "[runner-vm] status=preview domain=$DOMAIN pool=$POOL network=$NETWORK vcpus=$VCPUS memoryMiB=$MEMORY_MIB diskGiB=$DISK_GIB runnerConcurrentSlots=$RUNNER_CONCURRENT_SLOTS safetyMax=$SLOT_SAFETY_MAX renderValidated=true cleanup=complete"
  echo "[runner-vm] confirmation=$EXPECTED_CONFIRMATION"
  exit 0
fi
echo "[runner-vm] status=preview domain=$DOMAIN pool=$POOL network=$NETWORK vcpus=$VCPUS memoryMiB=$MEMORY_MIB diskGiB=$DISK_GIB runnerConcurrentSlots=$RUNNER_CONCURRENT_SLOTS safetyMax=$SLOT_SAFETY_MAX renderValidated=true cleanup=pending"
echo "[runner-vm] confirmation=$EXPECTED_CONFIRMATION"

COMMITTED=false
DOMAIN_CREATED=false
DOMAIN_UUID=
DISK_CREATED=false
DISK_VOLUME_KEY=
SEED_CREATED=false
SEED_VOLUME_KEY=

rollback() {
  local status=$?
  local rollback_green=true
  trap - EXIT
  if [[ "$COMMITTED" != true ]]; then
    if [[ "$DOMAIN_CREATED" == true ]]; then
      current_domain_uuid="$(virsh -c qemu:///system domuuid "$DOMAIN" 2>/dev/null || true)"
      [[ "$current_domain_uuid" == "$DOMAIN_UUID" ]] || rollback_green=false
      if [[ "$rollback_green" == true ]]; then
        domain_state="$(virsh -c qemu:///system domstate "$DOMAIN" 2>/dev/null || true)"
        if [[ "$domain_state" != "shut off" ]]; then
          if virsh -c qemu:///system destroy "$DOMAIN" >/dev/null 2>&1; then
            domain_state="$(virsh -c qemu:///system domstate "$DOMAIN" 2>/dev/null || true)"
          else
            rollback_green=false
          fi
        fi
        [[ "$domain_state" == "shut off" ]] || rollback_green=false
        if [[ "$rollback_green" == true ]]; then
          virsh -c qemu:///system undefine "$DOMAIN" >/dev/null 2>&1 || rollback_green=false
        fi
        if virsh -c qemu:///system dominfo "$DOMAIN" >/dev/null 2>&1; then
          rollback_green=false
        fi
      fi
    elif virsh -c qemu:///system dominfo "$DOMAIN" >/dev/null 2>&1; then
      rollback_green=false
    fi
    if [[ "$rollback_green" == true && "$SEED_CREATED" == true ]]; then
      current_seed_key="$(virsh -c qemu:///system vol-key --pool "$POOL" "$SEED_VOLUME" 2>/dev/null || true)"
      [[ "$current_seed_key" == "$SEED_VOLUME_KEY" ]] || rollback_green=false
      if [[ "$current_seed_key" == "$SEED_VOLUME_KEY" ]]; then
        virsh -c qemu:///system vol-delete --pool "$POOL" "$SEED_VOLUME" >/dev/null 2>&1 || rollback_green=false
        if virsh -c qemu:///system vol-info --pool "$POOL" "$SEED_VOLUME" >/dev/null 2>&1; then
          rollback_green=false
        fi
      fi
    elif [[ "$SEED_CREATED" != true ]] && virsh -c qemu:///system vol-info --pool "$POOL" "$SEED_VOLUME" >/dev/null 2>&1; then
      rollback_green=false
    fi
    if [[ "$rollback_green" == true && "$DISK_CREATED" == true ]]; then
      current_disk_key="$(virsh -c qemu:///system vol-key --pool "$POOL" "$DISK_VOLUME" 2>/dev/null || true)"
      [[ "$current_disk_key" == "$DISK_VOLUME_KEY" ]] || rollback_green=false
      if [[ "$current_disk_key" == "$DISK_VOLUME_KEY" ]]; then
        virsh -c qemu:///system vol-delete --pool "$POOL" "$DISK_VOLUME" >/dev/null 2>&1 || rollback_green=false
        if virsh -c qemu:///system vol-info --pool "$POOL" "$DISK_VOLUME" >/dev/null 2>&1; then
          rollback_green=false
        fi
      fi
    elif [[ "$DISK_CREATED" != true ]] && virsh -c qemu:///system vol-info --pool "$POOL" "$DISK_VOLUME" >/dev/null 2>&1; then
      rollback_green=false
    fi
  fi
  cleanup_operation_root || rollback_green=false
  if [[ "$rollback_green" != true ]]; then
    echo "[runner-vm] status=rollback_incomplete" >&2
    exit 70
  fi
  exit "$status"
}
trap rollback EXIT
trap 'exit 130' HUP INT TERM

virsh -c qemu:///system vol-clone --pool "$POOL" "$BASE_VOLUME" "$DISK_VOLUME" >/dev/null
DISK_VOLUME_KEY="$(virsh -c qemu:///system vol-key --pool "$POOL" "$DISK_VOLUME")"
[[ -n "$DISK_VOLUME_KEY" ]]
DISK_CREATED=true
virsh -c qemu:///system vol-resize --pool "$POOL" "$DISK_VOLUME" "${DISK_GIB}G" >/dev/null
SEED_BYTES="$(stat -c '%s' "$SEED_IMAGE")"
[[ "$SEED_BYTES" =~ ^[1-9][0-9]*$ ]]
virsh -c qemu:///system vol-create-as "$POOL" "$SEED_VOLUME" "$SEED_BYTES" --format raw >/dev/null
SEED_VOLUME_KEY="$(virsh -c qemu:///system vol-key --pool "$POOL" "$SEED_VOLUME")"
[[ -n "$SEED_VOLUME_KEY" ]]
SEED_CREATED=true
virsh -c qemu:///system vol-upload --pool "$POOL" "$SEED_VOLUME" "$SEED_IMAGE" >/dev/null

virt-install \
  --connect qemu:///system \
  --name "$DOMAIN" \
  --memory "$MEMORY_MIB" \
  --vcpus "$VCPUS" \
  --os-variant ubuntu24.04 \
  --import \
  --disk "vol=$POOL/$DISK_VOLUME,bus=virtio" \
  --disk "vol=$POOL/$SEED_VOLUME,device=cdrom" \
  --network "network=$NETWORK,model=virtio" \
  --noautoconsole
DOMAIN_UUID="$(virsh -c qemu:///system domuuid "$DOMAIN")"
[[ "$DOMAIN_UUID" =~ ^[0-9a-fA-F-]{36}$ ]]
DOMAIN_CREATED=true
virsh -c qemu:///system autostart "$DOMAIN" >/dev/null

[[ "$(virsh -c qemu:///system dominfo "$DOMAIN" | awk '$1 == "Persistent:" {print $2}')" == yes ]]
[[ "$(virsh -c qemu:///system dominfo "$DOMAIN" | awk '$1 == "Autostart:" {print $2}')" == enable ]]
[[ "$(virsh -c qemu:///system dominfo "$DOMAIN" | awk '$1 == "CPU(s):" {print $2}')" == "$VCPUS" ]]
[[ "$(virsh -c qemu:///system dominfo "$DOMAIN" | awk '$1 == "Max" && $2 == "memory:" {print $3}')" == "$((MEMORY_MIB * 1024))" ]]
[[ "$(virsh -c qemu:///system domstate "$DOMAIN")" == running ]]
[[ "$(virsh -c qemu:///system domiflist "$DOMAIN" | awk -v network="$NETWORK" '$2 == "network" && $3 == network && $4 == "virtio" {count += 1} END {print count + 0}')" == 1 ]]
[[ "$(virsh -c qemu:///system vol-key --pool "$POOL" "$DISK_VOLUME")" == "$DISK_VOLUME_KEY" ]]
[[ "$(virsh -c qemu:///system vol-key --pool "$POOL" "$SEED_VOLUME")" == "$SEED_VOLUME_KEY" ]]

cleanup_operation_root
COMMITTED=true
trap - EXIT
echo "[runner-vm] status=vm_created_registration_pending domain=$DOMAIN vcpus=$VCPUS memoryMiB=$MEMORY_MIB diskGiB=$DISK_GIB runnerConcurrentSlots=$RUNNER_CONCURRENT_SLOTS safetyMax=$SLOT_SAFETY_MAX"
