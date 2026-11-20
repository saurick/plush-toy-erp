import { spawnSync } from "node:child_process";
import { resolveTargetReadOnlyExecution } from "./target-readonly-execution.mjs";

const IMAGE =
  /^[a-z0-9][a-z0-9./_-]{0,110}:[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}(?:@sha256:[a-f0-9]{64})?$/u;
const CONTENT_ID = /^sha256:[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const SERVICES = ["postgres", "jaeger", "attachment-store"];
const FILES = ["compose", "targetCompose", "postgresRoles", "jaegerConfig"];
const PINS = {
  postgres: "promotion_postgres_image",
  jaeger: "promotion_jaeger_image",
  "attachment-store": "promotion_attachment_store_image",
};

function invalid() {
  return new Error("promotion service scope is unavailable or invalid");
}

function bytes(value) {
  const match = /^([1-9][0-9]{0,6})([bkmg])$/u.exec(value);
  const multiplier = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[match?.[2]];
  const result = Number(match?.[1]) * multiplier;
  if (!Number.isSafeInteger(result)) throw invalid();
  return result;
}

function readPromotionServicePins(source) {
  // Read the exact executor's literal settings without running candidate code.
  const setting = (key, pattern) => {
    const lines = source
      .split("\n")
      .filter((line) => line.startsWith(`${key}=`));
    const value = lines[0]?.slice(key.length + 1);
    if (lines.length !== 1 || !pattern.test(value)) throw invalid();
    return value;
  };
  return Object.fromEntries(
    SERVICES.map((service) => [
      service,
      {
        image: setting(PINS[service], IMAGE),
        ...(service === "jaeger"
          ? {
              memoryLimit: bytes(
                setting(
                  "promotion_jaeger_mem_limit",
                  /^[1-9][0-9]{0,6}[bkmg]$/u,
                ),
              ),
              memoryReservation: bytes(
                setting(
                  "promotion_jaeger_mem_reservation",
                  /^[1-9][0-9]{0,6}[bkmg]$/u,
                ),
              ),
            }
          : {}),
      },
    ]),
  );
}

function exactKeys(object, expected) {
  return (
    object &&
    typeof object === "object" &&
    !Array.isArray(object) &&
    Object.keys(object).length === expected.length &&
    expected.every((key) => Object.hasOwn(object, key))
  );
}

export function validatePromotionServiceScope(scope) {
  if (
    !exactKeys(scope, ["attachmentMode", "services", "configurationChanges"]) ||
    !["managed", "external"].includes(scope.attachmentMode) ||
    !Array.isArray(scope.services) ||
    !Array.isArray(scope.configurationChanges) ||
    JSON.stringify(scope.configurationChanges) !==
      JSON.stringify(
        FILES.filter((key) => scope.configurationChanges.includes(key)),
      )
  ) {
    throw invalid();
  }
  const expected =
    scope.attachmentMode === "managed" ? SERVICES : SERVICES.slice(0, 2);
  if (scope.services.length !== expected.length) throw invalid();
  for (const [index, item] of scope.services.entries()) {
    if (
      !exactKeys(item, ["key", "current", "candidate"]) ||
      item.key !== expected[index]
    )
      throw invalid();
    for (const value of [item.current, item.candidate]) {
      const keys =
        item.key === "jaeger"
          ? ["image", "contentId", "memoryLimit", "memoryReservation"]
          : ["image", "contentId"];
      if (
        !exactKeys(value, keys) ||
        typeof value.image !== "string" ||
        !IMAGE.test(value.image) ||
        typeof value.contentId !== "string" ||
        !CONTENT_ID.test(value.contentId) ||
        (item.key === "jaeger" &&
          ![value.memoryLimit, value.memoryReservation].every(
            (n) => Number.isSafeInteger(n) && n >= 0,
          ))
      ) {
        throw invalid();
      }
    }
  }
  return scope;
}

function capture(command, args, options, run) {
  const result = run(command, args, {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 128 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string")
    throw invalid();
  return result.stdout;
}

export function readPromotionServiceScope(
  { repoRoot, targetKey, currentGitSha, candidateGitSha },
  { run = spawnSync } = {},
) {
  if (!SHA.test(currentGitSha) || !SHA.test(candidateGitSha)) throw invalid();
  const execution = resolveTargetReadOnlyExecution(targetKey);
  const { target } = execution;
  const readBlob = (sha, file) =>
    capture(
      "git",
      ["cat-file", "blob", `${sha}:${file}`],
      {
        cwd: repoRoot,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
      run,
    );
  const pins = readPromotionServicePins(
    readBlob(candidateGitSha, "scripts/deploy/remote-promotion.sh"),
  );
  const compose = target.compose.directory;
  const files = [
    `${compose}/${target.compose.baseFile}`,
    `${compose}/${target.compose.overrideFile}`,
    `${compose}/database_roles.sh`,
    `${compose}/jaeger-v2.yml`,
  ];
  const configurationChanges = FILES.filter(
    (_key, i) =>
      readBlob(currentGitSha, files[i]) !== readBlob(candidateGitSha, files[i]),
  );
  const shell = `set -eu
test "$(hostname -s)" = '${target.ssh.expectedHostname}'
test "$(id -un)" = '${target.ssh.user}'
env_file='${target.filesystem.runtimeEnv}'
test -f "$env_file" && test ! -L "$env_file"
mode=$(awk -F= '$1=="ATTACHMENT_STORAGE_MODE" {mode=substr($0,index($0,"=")+1); count++} END {if(count!=1) exit 1; print mode}' "$env_file")
case "$mode" in managed|external) ;; *) exit 1 ;; esac
printf '%s\\n' "$mode"
project='${target.compose.projectName}'
container() {
  local id
  id=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$1")
  [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || exit 1
  printf '%s\\n' "$id"
}
for app in app-server web-desktop; do
  id=$(container "$app")
  sha=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id" | awk -F= '$1=="GIT_SHA" {print $2}')
  [[ "$sha" = '${currentGitSha}' ]] || exit 1
done
service() {
  local name=$1 wanted=$2 id actual desired
  id=$(container "$name")
  actual=$(docker inspect --format '{{.Config.Image}} {{.Image}} {{.HostConfig.Memory}} {{.HostConfig.MemoryReservation}}' "$id")
  desired=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$wanted")
  printf '%s %s %s\\n' "$name" "$actual" "$desired"
}
service postgres '${pins.postgres.image}'
service jaeger '${pins.jaeger.image}'
if [[ "$mode" = managed ]]; then service attachment-store '${pins["attachment-store"].image}'; fi
`;
  const [attachmentMode, ...lines] = capture(
    execution.command,
    execution.args,
    { input: shell },
    run,
  )
    .trim()
    .split("\n");
  const services = lines.map((line) => {
    const [
      key,
      image,
      contentId,
      limit,
      reservation,
      candidateId,
      platform,
      extra,
    ] = line.split(" ");
    if (
      !SERVICES.includes(key) ||
      extra !== undefined ||
      platform !== "linux/amd64" ||
      !/^\d+$/u.test(limit) ||
      !/^\d+$/u.test(reservation)
    )
      throw invalid();
    return {
      key,
      current: {
        image,
        contentId,
        ...(key === "jaeger"
          ? {
              memoryLimit: Number(limit),
              memoryReservation: Number(reservation),
            }
          : {}),
      },
      candidate: { ...pins[key], contentId: candidateId },
    };
  });
  return validatePromotionServiceScope({
    attachmentMode,
    services,
    configurationChanges,
  });
}
