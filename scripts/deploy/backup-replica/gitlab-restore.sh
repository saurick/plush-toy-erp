#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${1:?restore directory required}"
image="${2:?immutable image required}"
version="${3:?version required}"
repository_hash="${4:?repository hash required}"
config_hash="${5:?configuration hash required}"
[[ "$root" =~ ^/srv/raid5/gitlab/restore-drills/replica-[A-Za-z0-9]+$ ]]
[[ -d "$root" && ! -L "$root" && "$(realpath -e "$root")" == "$root" ]]
[[ "$(cat "$root/.plush-replica-drill")" == plush.gitlab-replica-drill/v1 ]]
[[ "$image" =~ ^gitlab/gitlab-ce@sha256:[0-9a-f]{64}$ && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$repository_hash" =~ ^[0-9a-f]{64}$ && "$config_hash" =~ ^[0-9a-f]{64}$ ]]
name="plush-gitlab-$(basename "$root")"
receipts="/srv/raid5/gitlab/restore-drills/receipts"
install -d -m 0700 "$receipts"
receipt="$receipts/$(basename "$root")"
exec 3>&1
exec >"$root/restore.log" 2>&1
cid=""
stage=validate_inputs
cleanup() {
  local status=$? cleanup_ok=true
  trap - EXIT
  set +e
  if [[ -n "$cid" ]]; then
    if [[ "$(docker inspect --format '{{.Id}}' "$name" 2>/dev/null)" == "$cid" && "$(docker inspect --format '{{index .Config.Labels "plush.backup.restore-root"}}' "$name")" == "$root" ]]; then
      docker logs "$name" >"$receipt.container.log" 2>&1
      docker stop --time 60 "$name" >/dev/null && docker rm "$name" >/dev/null || cleanup_ok=false
    else cleanup_ok=false; fi
  fi
  cp "$root/restore.log" "$receipt.log"
  if [[ -f "$root/inventory.json" ]]; then cp "$root/inventory.json" "$receipt.inventory.json"; fi
  if [[ "$cleanup_ok" == true ]]; then
    find "$root" -xdev -depth -delete || cleanup_ok=false
  fi
  if [[ "$status" == 0 && "$cleanup_ok" == true ]]; then
    printf '{"status":"passed","version":"%s","image":"%s","cleanup":"container-and-plaintext-removed","inventory":' "$version" "$image" >"$receipt.json"
    cat "$receipt.inventory.json" >>"$receipt.json"
    printf '}\n' >>"$receipt.json"
  else
    printf '{"status":"failed","stage":"%s","exitCode":%s,"cleanupPassed":%s}\n' "$stage" "$status" "$cleanup_ok" >"$receipt.json"
    status=1
  fi
  cat "$receipt.json" >&3
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM HUP
trap 'exit 130' INT
printf '%s  %s\n%s  %s\n' "$repository_hash" "$root/repository.tar" "$config_hash" "$root/config.tar.gz" | sha256sum -c --strict
bytes="$(stat -c %s "$root/repository.tar")"
free="$(df -B1 --output=avail "$root" | tail -n 1 | tr -d ' ')"
((free >= bytes * 4 + 10737418240))
available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
((available_kib >= 10 * 1024 * 1024))
docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
install -d -m 0700 "$root/config" "$root/data" "$root/logs"
tar -xzf "$root/config.tar.gz" -C "$root/config" ./gitlab-secrets.json
[[ -f "$root/config/gitlab-secrets.json" && ! -L "$root/config/gitlab-secrets.json" ]]
cat >"$root/config/gitlab.rb" <<'RUBY'
external_url 'http://gitlab.saurick.me:8929'
letsencrypt['enable'] = false
nginx['listen_port'] = 8929
nginx['listen_https'] = false
prometheus_monitoring['enable'] = false
gitlab_kas['enable'] = false
registry['enable'] = false
gitlab_rails['smtp_enable'] = false
gitlab_rails['gitlab_email_enabled'] = false
puma['worker_processes'] = 2
sidekiq['concurrency'] = 5
RUBY
stage=start_same_version_instance
cid="$(docker run --detach --name "$name" --hostname gitlab-replica-drill.invalid --network none --restart no --memory 8g --memory-swap 8g --cpus 4 --shm-size 256m --label "plush.backup.restore-root=$root" --volume "$root/config:/etc/gitlab" --volume "$root/data:/var/opt/gitlab" --volume "$root/logs:/var/log/gitlab" "$image")"
[[ "$cid" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$name")" == none ]]
[[ "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$name")" == 0 ]]
wait_ready() {
  local start
  start=$(date +%s)
  until docker exec "$name" curl --max-time 4 -fsS 'http://127.0.0.1:8929/-/readiness?all=1' >"$root/readiness.json" 2>/dev/null; do
    (($(date +%s) - start < 1200)) || return 1
    [[ "$(docker inspect --format '{{.State.Running}}' "$name")" == true ]] || return 1
    sleep 5
  done
  grep -q '"status":"ok"' "$root/readiness.json"
}
wait_ready
docker logs "$name" >"$root/startup.log" 2>&1
grep -q 'gitlab Reconfigured!' "$root/startup.log"
[[ "$(docker exec "$name" cat /opt/gitlab/embedded/service/gitlab-rails/VERSION)" == "$version" ]]
# Populate the backup directory only after reconfigure has established its
# ownership. The archive stays inside this operation's disposable data mount.
mv "$root/repository.tar" "$root/data/backups/replica_gitlab_backup.tar"
chown "$(docker exec "$name" id -u git):$(docker exec "$name" id -g git)" "$root/data/backups/replica_gitlab_backup.tar"
stage=restore_database_and_files
docker exec "$name" gitlab-ctl stop puma
docker exec "$name" gitlab-ctl stop sidekiq
timeout 7200 docker exec -e GITLAB_ASSUME_YES=1 "$name" gitlab-backup restore BACKUP=replica
stage=validate_restored_data
docker cp "$root/inventory.rb" "$name:/tmp/plush-backup-inventory.rb"
docker exec "$name" chmod 0644 /tmp/plush-backup-inventory.rb
docker exec "$name" gitlab-rails runner /tmp/plush-backup-inventory.rb >"$root/inventory.json"
docker exec "$name" gitlab-ctl start puma
docker exec "$name" gitlab-ctl start sidekiq
wait_ready
docker exec "$name" gitlab-rake gitlab:check SANITIZE=true gitlab:doctor:secrets db:migrate:status >"$root/check.log" 2>&1
grep -q 'All migrations up? ... yes' "$root/check.log"
grep -q 'Total: 0 row(s) affected' "$root/check.log"
if grep -Eq '^[[:space:]]+down[[:space:]]+[0-9]|failures: [1-9]' "$root/check.log"; then exit 1; fi
if grep -E '\.\.\. no[[:space:]]*$' "$root/check.log" | grep -v 'Database contains orphaned GroupMembers? ... no'; then exit 1; fi
cp "$root/check.log" "$receipt.check.log"
stage=complete
