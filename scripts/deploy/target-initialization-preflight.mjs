import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

import { getDeploymentTarget } from "./deployment-targets.mjs";

export const TARGET_INITIALIZATION_PREFLIGHT_CONTRACT =
  "plush.target-initialization-preflight/v1";
export const REMOTE_TARGET_INITIALIZATION_PREFLIGHT_CONTRACT =
  "plush.remote-target-initialization-preflight/v1";

const BLOCKER_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const REPORT_KEYS = Object.freeze([
  "SCHEMA_VERSION",
  "STATUS",
  "TARGET",
  "HOSTNAME",
  "USER",
  "ROOT_STATE",
  "TARGET_CONTAINER_COUNT",
  "TARGET_NETWORK_COUNT",
  "PUBLIC_CONTAINER_COUNT",
  "TCP_CONFLICT_COUNT",
  "UDP_CONFLICT_COUNT",
  "ROOT_AVAILABLE_BYTES",
  "MINIMUM_AVAILABLE_BYTES",
  "TOOLING_STATUS",
  "ATLAS_STATUS",
  "BASE_IMAGES_STATUS",
  "BLOCKERS",
]);

const REMOTE_SCRIPT_TEMPLATE = String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 077

target=__TARGET__
expected_hostname=__HOSTNAME__
expected_user=__USER__
root=__ROOT__
project=__PROJECT__
public_prefix=__PUBLIC_PREFIX__
minimum_available_bytes=__MINIMUM_AVAILABLE_BYTES__
tcp_ports=(__TCP_PORTS__)
udp_ports=(__UDP_PORTS__)

status=eligible
root_state=absent
target_container_count=0
target_network_count=0
public_container_count=0
tcp_conflict_count=0
udp_conflict_count=0
tooling_status=passed
atlas_status=passed
base_images_status=passed
blockers=()

block() {
  status=blocked
  blockers+=("$1")
}

actual_hostname="$(hostname)"
actual_user="$(id -un)"
[[ "$actual_hostname" == "$expected_hostname" ]] || block initialization_hostname_mismatch
[[ "$actual_user" == "$expected_user" ]] || block initialization_user_mismatch

if [[ -e "$root" || -L "$root" ]]; then
  root_state=present
  block initialization_root_not_absent
fi

for command_name in docker jq curl python3 zstd tar sha256sum openssl rsync ss psql flock; do
  command -v "$command_name" >/dev/null 2>&1 || {
    tooling_status=blocked
    block initialization_tooling_unavailable
  }
done
if ! docker compose version >/dev/null 2>&1; then
  tooling_status=blocked
  block initialization_compose_unavailable
fi

if [[ ! -x /usr/local/bin/atlas ]] ||
  ! /usr/local/bin/atlas version 2>&1 |
    grep -Eq '(^|[[:space:]])v1[.]2[.]0([[:space:]]|$)'; then
  atlas_status=blocked
  block initialization_atlas_unavailable
fi

for image in postgres:18.1 jaegertracing/all-in-one:1.76.0; do
  if ! docker image inspect "$image" >/dev/null 2>&1 ||
    [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)" != linux/amd64 ]]; then
    base_images_status=blocked
    block initialization_base_image_unavailable
  fi
done

target_container_count="$({
  docker ps -aq --filter "label=com.docker.compose.project=$project" 2>/dev/null || true
  docker ps -aq --filter "name=^/\${project}-(postgres|jaeger|server|web-desktop)$" 2>/dev/null || true
} | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"
[[ "$target_container_count" == 0 ]] || block initialization_target_container_exists

target_network_count="$(docker network ls -q --filter "name=^\${project}_default$" 2>/dev/null | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$target_network_count" == 0 ]] || block initialization_target_network_exists

public_container_count="$({ docker ps -aq --format '{{.Names}}' 2>/dev/null | grep -E "^\${public_prefix}" || true; } | wc -l | tr -d ' ')"
[[ "$public_container_count" == 0 ]] || block initialization_public_container_exists

listening_tcp_ports="$({ ss -H -lnt 2>/dev/null || true; } | awk '{address=$4; sub(/.*:/, "", address); if (address ~ /^[0-9]+$/) print address}' | sort -u)"
for port in "\${tcp_ports[@]}"; do
  if printf '%s\n' "$listening_tcp_ports" | grep -Fxq "$port"; then
    tcp_conflict_count=$((tcp_conflict_count + 1))
  fi
done
[[ "$tcp_conflict_count" == 0 ]] || block initialization_tcp_port_conflict

listening_udp_ports="$({ ss -H -lnu 2>/dev/null || true; } | awk '{address=$5; if (address == "") address=$4; sub(/.*:/, "", address); if (address ~ /^[0-9]+$/) print address}' | sort -u)"
for port in "\${udp_ports[@]}"; do
  if printf '%s\n' "$listening_udp_ports" | grep -Fxq "$port"; then
    udp_conflict_count=$((udp_conflict_count + 1))
  fi
done
[[ "$udp_conflict_count" == 0 ]] || block initialization_udp_port_conflict

root_available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
if [[ ! "$root_available_bytes" =~ ^[0-9]+$ ]]; then
  root_available_bytes=0
  block initialization_capacity_unknown
elif (( root_available_bytes < minimum_available_bytes )); then
  block initialization_disk_capacity_low
fi

blockers_csv=none
if (( \${#blockers[@]} > 0 )); then
  blockers_csv="$(printf '%s\n' "\${blockers[@]}" | sort -u | paste -sd, -)"
fi

printf '%s\n' \
  "SCHEMA_VERSION=plush.remote-target-initialization-preflight/v1" \
  "STATUS=$status" \
  "TARGET=$target" \
  "HOSTNAME=$actual_hostname" \
  "USER=$actual_user" \
  "ROOT_STATE=$root_state" \
  "TARGET_CONTAINER_COUNT=$target_container_count" \
  "TARGET_NETWORK_COUNT=$target_network_count" \
  "PUBLIC_CONTAINER_COUNT=$public_container_count" \
  "TCP_CONFLICT_COUNT=$tcp_conflict_count" \
  "UDP_CONFLICT_COUNT=$udp_conflict_count" \
  "ROOT_AVAILABLE_BYTES=$root_available_bytes" \
  "MINIMUM_AVAILABLE_BYTES=$minimum_available_bytes" \
  "TOOLING_STATUS=$tooling_status" \
  "ATLAS_STATUS=$atlas_status" \
  "BASE_IMAGES_STATUS=$base_images_status" \
  "BLOCKERS=$blockers_csv"
`.replaceAll("\\${", "${");

function safeTemplateValue(value, field) {
  const text = String(value ?? "");
  if (
    ["__TCP_PORTS__", "__UDP_PORTS__"].includes(field) &&
    /^[0-9]+(?: [0-9]+)*$/u.test(text)
  ) {
    return text;
  }
  if (!text || /[\s'"`$\\]/u.test(text)) {
    throw new Error(`${field} is unsafe for initialization preflight`);
  }
  return text;
}

function targetPorts(target) {
  const tcp = [
    target.runtime.postgres.hostPort,
    target.runtime.app.hostPort,
    target.runtime.web.hostPort,
    target.publicEntry.hostPort,
    ...Object.entries(target.runtime.jaeger.ports)
      .filter(
        ([key]) =>
          !["agentCompact", "agentThriftCompact", "agentThriftBinary"].includes(
            key,
          ),
      )
      .map(([, port]) => port),
  ];
  const udp = [
    target.runtime.jaeger.ports.agentCompact,
    target.runtime.jaeger.ports.agentThriftCompact,
    target.runtime.jaeger.ports.agentThriftBinary,
  ];
  return { tcp, udp };
}

export function buildRemoteTargetInitializationPreflightScript(target) {
  const ports = targetPorts(target);
  const replacements = {
    __TARGET__: target.key,
    __HOSTNAME__: target.ssh.expectedHostname,
    __USER__: target.ssh.user,
    __ROOT__: target.filesystem.root,
    __PROJECT__: target.compose.projectName,
    __PUBLIC_PREFIX__: target.publicEntry.containerPrefix,
    __MINIMUM_AVAILABLE_BYTES__: target.capacity.minimumAvailableBytes,
    __TCP_PORTS__: ports.tcp.join(" "),
    __UDP_PORTS__: ports.udp.join(" "),
  };
  let script = REMOTE_SCRIPT_TEMPLATE;
  for (const [placeholder, value] of Object.entries(replacements)) {
    script = script.replaceAll(
      placeholder,
      safeTemplateValue(value, placeholder),
    );
  }
  if (/__[A-Z0-9_]+__/u.test(script)) {
    throw new Error("initialization preflight template is incomplete");
  }
  return script;
}

function safeInteger(value, field) {
  if (!/^[0-9]+$/u.test(String(value ?? ""))) {
    throw new Error(`${field} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} is invalid`);
  }
  return parsed;
}

export function parseRemoteTargetInitializationPreflight(raw, target) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 32 * 1024 ||
    raw.includes("\0")
  ) {
    throw new Error("initialization preflight output is invalid");
  }
  const values = {};
  for (const line of raw.trim().split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator <= 0)
      throw new Error("initialization preflight line is invalid");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!REPORT_KEYS.includes(key) || Object.hasOwn(values, key)) {
      throw new Error("initialization preflight key is invalid or duplicated");
    }
    values[key] = value;
  }
  if (Object.keys(values).length !== REPORT_KEYS.length) {
    throw new Error("initialization preflight output is incomplete");
  }
  if (
    values.SCHEMA_VERSION !== REMOTE_TARGET_INITIALIZATION_PREFLIGHT_CONTRACT ||
    values.TARGET !== target.key ||
    values.HOSTNAME !== target.ssh.expectedHostname ||
    values.USER !== target.ssh.user
  ) {
    throw new Error("initialization preflight identity is invalid");
  }
  const status = values.STATUS;
  if (!["eligible", "blocked"].includes(status)) {
    throw new Error("initialization preflight status is invalid");
  }
  const blockers =
    values.BLOCKERS === "none"
      ? []
      : values.BLOCKERS.split(",").map((value) => {
          if (!BLOCKER_PATTERN.test(value)) {
            throw new Error("initialization preflight blocker is invalid");
          }
          return value;
        });
  const count = (key) => safeInteger(values[key], key);
  const report = {
    schemaVersion: REMOTE_TARGET_INITIALIZATION_PREFLIGHT_CONTRACT,
    status,
    target: target.key,
    host: { hostname: values.HOSTNAME, user: values.USER },
    rootState: values.ROOT_STATE,
    conflicts: {
      targetContainers: count("TARGET_CONTAINER_COUNT"),
      targetNetworks: count("TARGET_NETWORK_COUNT"),
      publicContainers: count("PUBLIC_CONTAINER_COUNT"),
      tcpPorts: count("TCP_CONFLICT_COUNT"),
      udpPorts: count("UDP_CONFLICT_COUNT"),
    },
    capacity: {
      availableBytes: count("ROOT_AVAILABLE_BYTES"),
      minimumAvailableBytes: count("MINIMUM_AVAILABLE_BYTES"),
    },
    tooling: values.TOOLING_STATUS,
    atlas: values.ATLAS_STATUS,
    baseImages: values.BASE_IMAGES_STATUS,
    blockers,
  };
  const zeroConflicts = Object.values(report.conflicts).every(
    (value) => value === 0,
  );
  if (
    !["absent", "present"].includes(report.rootState) ||
    ![report.tooling, report.atlas, report.baseImages].every((value) =>
      ["passed", "blocked"].includes(value),
    ) ||
    report.capacity.minimumAvailableBytes !== 30 * 1024 ** 3 ||
    new Set(blockers).size !== blockers.length ||
    (status === "eligible" &&
      (blockers.length !== 0 ||
        report.rootState !== "absent" ||
        !zeroConflicts ||
        report.tooling !== "passed" ||
        report.atlas !== "passed" ||
        report.baseImages !== "passed")) ||
    (status === "blocked" && blockers.length === 0)
  ) {
    throw new Error("initialization preflight contract is inconsistent");
  }
  return report;
}

function sshArgs(target) {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=yes",
    "-p",
    String(target.ssh.port),
    `${target.ssh.user}@${target.ssh.host}`,
    "bash",
    "-s",
  ];
}

function publicReport(target, remote, generatedAt) {
  return {
    schemaVersion: TARGET_INITIALIZATION_PREFLIGHT_CONTRACT,
    generatedAt,
    status: remote.status,
    target: target.key,
    purpose: target.purpose,
    customer: target.customer,
    trialTarget: target.trialTarget,
    remote,
    blockers: remote.blockers,
    nextAction:
      remote.status === "eligible"
        ? "initialize this pristine registered target from one immutable release"
        : "resolve the fixed initialization blockers without taking over partial state",
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
    },
  };
}

export function runTargetInitializationPreflight(
  targetKey,
  {
    runCommand = spawnSync,
    timeoutMs = 30_000,
    now = new Date().toISOString(),
  } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const result = runCommand("ssh", sshArgs(target), {
    input: buildRemoteTargetInitializationPreflightScript(target),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `target initialization preflight SSH failed: ${result.error?.message || result.status}`,
    );
  }
  return publicReport(
    target,
    parseRemoteTargetInitializationPreflight(
      String(result.stdout || ""),
      target,
    ),
    now,
  );
}

export async function runTargetInitializationPreflightAsync(
  targetKey,
  {
    spawnCommand = spawn,
    timeoutMs = 30_000,
    now = new Date().toISOString(),
  } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const child = spawnCommand("ssh", sshArgs(target), {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let bytes = 0;
    let settled = false;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const collect = (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        child.kill("SIGTERM");
        finish(() =>
          reject(new Error("initialization preflight output is too large")),
        );
        return;
      }
      stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) child.kill("SIGTERM");
    });
    child.on("error", (error) =>
      finish(() =>
        reject(
          new Error(`initialization preflight SSH failed: ${error.message}`),
        ),
      ),
    );
    child.on("close", (code) =>
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(`initialization preflight SSH failed: ${String(code)}`),
          );
          return;
        }
        try {
          resolve(
            publicReport(
              target,
              parseRemoteTargetInitializationPreflight(stdout, target),
              now,
            ),
          );
        } catch (error) {
          reject(error);
        }
      }),
    );
    child.stdin.on("error", (error) =>
      finish(() =>
        reject(
          new Error(`initialization preflight input failed: ${error.message}`),
        ),
      ),
    );
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("initialization preflight timed out")));
    }, timeoutMs);
    child.stdin.end(buildRemoteTargetInitializationPreflightScript(target));
  });
}
