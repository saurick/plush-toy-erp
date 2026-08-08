import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { getDeploymentTarget } from "./deployment-targets.mjs";
import { verifyReleaseArtifact } from "./release-artifact-verify.mjs";
import { sha256File, validateReleaseManifest } from "./release-catalog.mjs";

export const TARGET_RELEASE_CACHE_CONTRACT = "plush.target-release-cache/v1";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CACHE_BASIS = Object.freeze([
  "release_manifest_sha256",
  "archive_sha256",
  "registry_digest",
  "docker_content_id",
  "embedded_git_sha",
]);

function plainFile(file, maximumBytes = 2 * 1024 ** 3) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size <= 0 ||
    stat.size > maximumBytes
  ) {
    throw new Error("target cache identity input is invalid");
  }
  return file;
}

function fixedSshArgs(target) {
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
  ];
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} failed before promotion: ${result.error?.message || result.status}`,
    );
  }
  return String(result.stdout || "");
}

export function buildTargetReleaseCacheIdentity({
  bundleDir,
  releaseManifestPath,
}) {
  const bundle = realpathSync(bundleDir);
  const manifestFile = plainFile(realpathSync(releaseManifestPath), 512 * 1024);
  const manifest = validateReleaseManifest(
    JSON.parse(readFileSync(manifestFile, "utf8")),
  );
  const artifactFile = plainFile(
    path.join(bundle, "release-artifact.json"),
    512 * 1024,
  );
  verifyReleaseArtifact(artifactFile);
  const artifact = JSON.parse(readFileSync(artifactFile, "utf8"));
  if (
    artifact.git?.commit !== manifest.gitSha ||
    sha256File(artifactFile) !== manifest.artifact.manifestSha256
  ) {
    throw new Error("target cache artifact does not match release manifest");
  }
  const imageArtifacts = new Map(
    artifact.images.map((image) => [image.kind, image]),
  );
  const imageManifests = new Map(
    manifest.images.map((image) => [image.kind, image]),
  );
  const server = imageArtifacts.get("server");
  const web = imageArtifacts.get("web");
  const serverManifest = imageManifests.get("server");
  const webManifest = imageManifests.get("web");
  if (!server || !web || !serverManifest || !webManifest) {
    throw new Error("target cache image identity is incomplete");
  }
  return Object.freeze({
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    gitSha: manifest.gitSha,
    version: manifest.version,
    releaseManifestSha256: sha256File(manifestFile),
    releaseArtifactSha256: sha256File(artifactFile),
    sourceArchiveSha256: artifact.sourceArchive.sha256,
    sbomSha256: artifact.sbom.sha256,
    serverArchiveSha256: server.archive.sha256,
    webArchiveSha256: web.archive.sha256,
    serverContentId: server.contentId,
    webContentId: web.contentId,
    serverDigest: serverManifest.digest,
    webDigest: webManifest.digest,
    serverRef: server.ref,
    webRef: web.ref,
  });
}

function identityArgs(identity) {
  for (const field of [
    "releaseManifestSha256",
    "releaseArtifactSha256",
    "sourceArchiveSha256",
    "sbomSha256",
    "serverArchiveSha256",
    "webArchiveSha256",
  ]) {
    if (!SHA256_PATTERN.test(String(identity[field] || ""))) {
      throw new Error(`target cache ${field} is invalid`);
    }
  }
  if (
    !SHA_PATTERN.test(identity.gitSha) ||
    !DIGEST_PATTERN.test(identity.serverContentId) ||
    !DIGEST_PATTERN.test(identity.webContentId) ||
    !DIGEST_PATTERN.test(identity.serverDigest) ||
    !DIGEST_PATTERN.test(identity.webDigest) ||
    identity.serverRef !== `plush-toy-erp-server:yoyoosun-${identity.gitSha}` ||
    identity.webRef !== `plush-toy-erp-web:yoyoosun-${identity.gitSha}`
  ) {
    throw new Error("target cache release/image identity is invalid");
  }
  return [
    identity.gitSha,
    identity.version,
    identity.releaseManifestSha256,
    identity.releaseArtifactSha256,
    identity.sourceArchiveSha256,
    identity.sbomSha256,
    identity.serverArchiveSha256,
    identity.webArchiveSha256,
    identity.serverContentId,
    identity.webContentId,
    identity.serverDigest,
    identity.webDigest,
    identity.serverRef,
    identity.webRef,
  ];
}

const CACHE_PROBE_SCRIPT = String.raw`set -euo pipefail
root=/home/simon/plush-toy-erp-v5
cache_root=$root/release-cache
incoming_root=$root/incoming
git_sha="$1"; shift; version="$1"; shift; manifest_sha="$1"; shift; artifact_sha="$1"; shift
source_sha="$1"; shift; sbom_sha="$1"; shift; server_archive_sha="$1"; shift; web_archive_sha="$1"; shift
server_content_id="$1"; shift; web_content_id="$1"; shift; server_digest="$1"; shift; web_digest="$1"; shift
server_ref="$1"; shift; web_ref="$1"
portable_manifest_digest() {
  local archive="$1" ref="$2" content_id="$3" content_hex config_path manifest_digest manifest_hex manifest_member
  content_hex="$(printf '%s' "$content_id" | sed 's/^sha256://')"
  config_path="blobs/sha256/$content_hex"
  tar -xOf "$archive" manifest.json | jq -e --arg ref "$ref" --arg configPath "$config_path" \
    'type == "array" and length == 1 and .[0].Config == $configPath and .[0].RepoTags == [$ref]' >/dev/null
  [[ "$(tar -xOf "$archive" "$config_path" | sha256sum | awk '{print $1}')" == "$content_hex" ]]
  manifest_digest="$(tar -xOf "$archive" index.json | jq -er '.manifests | select(type == "array" and length == 1) | .[0].digest')"
  [[ "$manifest_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  manifest_hex="$(printf '%s' "$manifest_digest" | sed 's/^sha256://')"
  manifest_member="blobs/sha256/$manifest_hex"
  [[ "$(tar -xOf "$archive" "$manifest_member" | sha256sum | awk '{print $1}')" == "$manifest_hex" ]]
  printf '%s\n' "$manifest_digest"
}
validate_candidate() {
  local candidate="$1" required actual_server_manifest actual_web_manifest
  [[ -d "$candidate" && ! -L "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]]
  for required in release-manifest.json release-artifact.json sbom.cdx.json source.tar server-image.tar web-image.tar; do
    [[ -f "$candidate/$required" && ! -L "$candidate/$required" && "$(stat -c '%u' "$candidate/$required")" == "$(id -u)" ]]
  done
  [[ "$(sha256sum "$candidate/release-manifest.json" | awk '{print $1}')" == "$manifest_sha" ]]
  [[ "$(sha256sum "$candidate/release-artifact.json" | awk '{print $1}')" == "$artifact_sha" ]]
  [[ "$(sha256sum "$candidate/source.tar" | awk '{print $1}')" == "$source_sha" ]]
  [[ "$(sha256sum "$candidate/sbom.cdx.json" | awk '{print $1}')" == "$sbom_sha" ]]
  [[ "$(sha256sum "$candidate/server-image.tar" | awk '{print $1}')" == "$server_archive_sha" ]]
  [[ "$(sha256sum "$candidate/web-image.tar" | awk '{print $1}')" == "$web_archive_sha" ]]
  jq -e --arg sha "$git_sha" --arg version "$version" --arg serverDigest "$server_digest" --arg webDigest "$web_digest" \
    '.schemaVersion == "plush.release-manifest/v1" and .gitSha == $sha and .version == $version and
     ([.images[] | select(.kind == "server") | .digest] == [$serverDigest]) and
     ([.images[] | select(.kind == "web") | .digest] == [$webDigest])' "$candidate/release-manifest.json" >/dev/null
  jq -e --arg sha "$git_sha" --arg serverId "$server_content_id" --arg webId "$web_content_id" \
    '.schemaVersion == "plush-release-artifact/v1" and .git.commit == $sha and
     ([.images[] | select(.kind == "server") | .contentId] == [$serverId]) and
     ([.images[] | select(.kind == "web") | .contentId] == [$webId])' "$candidate/release-artifact.json" >/dev/null
  actual_server_manifest="$(portable_manifest_digest "$candidate/server-image.tar" "$server_ref" "$server_content_id")"
  actual_web_manifest="$(portable_manifest_digest "$candidate/web-image.tar" "$web_ref" "$web_content_id")"
  printf '%s|%s\n' "$actual_server_manifest" "$actual_web_manifest"
}
candidate=""; source_kind=none; source_token=none; manifests=""
formal="$cache_root/$manifest_sha"
if [[ -e "$formal" ]]; then
  manifests="$(validate_candidate "$formal")" || { echo '[target-cache] invalid formal cache' >&2; exit 21; }
  candidate="$formal"; source_kind=formal; source_token=formal
else
  shopt -s nullglob
  for retained in "$incoming_root"/*; do
    [[ -d "$retained" && ! -L "$retained" && -f "$retained/release-manifest.json" && ! -L "$retained/release-manifest.json" ]] || continue
    [[ "$(sha256sum "$retained/release-manifest.json" | awk '{print $1}')" == "$manifest_sha" ]] || continue
    manifests="$(validate_candidate "$retained")" || { echo '[target-cache] invalid retained cache' >&2; exit 22; }
    candidate="$retained"; source_kind=retained_operation; source_token="$(basename "$retained")"; break
  done
fi
if [[ -z "$candidate" ]]; then
  jq -n --arg schemaVersion "plush.target-release-cache/v1" --arg manifest "$manifest_sha" \
    '{schemaVersion:$schemaVersion,releaseManifestSha256:$manifest,packageHit:false,imageHit:false,cacheSource:"none",sourceToken:"none",avoidedBytes:0,basis:[]}'
  exit 0
fi
IFS='|' read -r server_manifest web_manifest <<<"$manifests"
image_hit=false
if actual_server_id="$(docker image inspect --format '{{.Id}}' "$server_ref" 2>/dev/null)" &&
   actual_web_id="$(docker image inspect --format '{{.Id}}' "$web_ref" 2>/dev/null)" &&
   [[ "$actual_server_id" == "$server_content_id" || "$actual_server_id" == "$server_manifest" ]] &&
   [[ "$actual_web_id" == "$web_content_id" || "$actual_web_id" == "$web_manifest" ]] &&
   [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$server_ref")" == linux/amd64 ]] &&
   [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$web_ref")" == linux/amd64 ]] &&
   [[ "$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$server_ref" | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$git_sha" ]] &&
   [[ "$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$web_ref" | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$git_sha" ]]; then
  image_hit=true
fi
avoided_bytes="$(stat -c '%s' "$candidate/release-manifest.json" "$candidate/release-artifact.json" "$candidate/sbom.cdx.json" "$candidate/source.tar" "$candidate/server-image.tar" "$candidate/web-image.tar" | awk '{total += $1} END {print total + 0}')"
jq -n --arg schemaVersion "plush.target-release-cache/v1" --arg manifest "$manifest_sha" --arg source "$source_kind" --arg token "$source_token" \
  --argjson imageHit "$image_hit" --argjson avoidedBytes "$avoided_bytes" \
  '{schemaVersion:$schemaVersion,releaseManifestSha256:$manifest,packageHit:true,imageHit:$imageHit,cacheSource:$source,sourceToken:$token,avoidedBytes:$avoidedBytes,basis:["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"]}'
`;

export function validateTargetCacheProbe(value, expectedManifestSha256) {
  if (
    value?.schemaVersion !== TARGET_RELEASE_CACHE_CONTRACT ||
    value?.releaseManifestSha256 !== expectedManifestSha256 ||
    typeof value?.packageHit !== "boolean" ||
    typeof value?.imageHit !== "boolean" ||
    !["none", "formal", "retained_operation"].includes(value?.cacheSource) ||
    !Number.isSafeInteger(value?.avoidedBytes) ||
    value.avoidedBytes < 0 ||
    !Array.isArray(value?.basis) ||
    value.basis.join(",") !== (value.packageHit ? CACHE_BASIS.join(",") : "") ||
    (value.packageHit && value.avoidedBytes <= 0) ||
    (!value.packageHit &&
      (value.imageHit ||
        value.cacheSource !== "none" ||
        value.avoidedBytes !== 0)) ||
    (value.cacheSource === "retained_operation" &&
      !UUID_V4_PATTERN.test(String(value.sourceToken || ""))) ||
    (value.cacheSource === "formal" && value.sourceToken !== "formal") ||
    (value.cacheSource === "none" && value.sourceToken !== "none")
  ) {
    throw new Error("target release cache probe contract is invalid");
  }
  return Object.freeze(value);
}

export function estimateAvoidedTransferDuration(avoidedBytes, operations) {
  if (!Number.isSafeInteger(avoidedBytes) || avoidedBytes < 0) {
    throw new Error("avoided transfer bytes are invalid");
  }
  if (!Array.isArray(operations)) {
    throw new Error("delivery operation history is invalid");
  }
  const baseline = [...operations]
    .filter(
      (operation) =>
        ["promote", "rollback"].includes(operation?.action) &&
        operation.status === "passed" &&
        operation.metadata?.targetCacheHit === false &&
        Number.isSafeInteger(operation.metadata?.transferBytesPerSecond) &&
        operation.metadata.transferBytesPerSecond > 0,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!baseline || avoidedBytes === 0) {
    return Object.freeze({ durationMs: null, baselineOperationId: null });
  }
  return Object.freeze({
    durationMs: Math.max(
      1,
      Math.round(
        (avoidedBytes * 1000) / baseline.metadata.transferBytesPerSecond,
      ),
    ),
    baselineOperationId: baseline.id,
  });
}

export function probeTargetReleaseCache(
  identity,
  { runCommand = spawnSync } = {},
) {
  const target = getDeploymentTarget("test-133");
  const raw = runChecked(
    runCommand,
    "ssh",
    [...fixedSshArgs(target), "bash", "-s", "--", ...identityArgs(identity)],
    { input: CACHE_PROBE_SCRIPT, timeout: 5 * 60_000 },
    "read target release cache",
  );
  return validateTargetCacheProbe(
    JSON.parse(raw.trim()),
    identity.releaseManifestSha256,
  );
}

const PREPARE_CACHE_SCRIPT = String.raw`set -euo pipefail
umask 077
root=/home/simon/plush-toy-erp-v5
operation_id="$1"; shift; manifest_sha="$1"; shift; package_hit="$1"; shift; image_hit="$1"; shift
source_kind="$1"; shift; source_token="$1"; shift; avoided_bytes="$1"; shift; artifact_sha="$1"; shift
source_sha="$1"; shift; sbom_sha="$1"; shift; server_archive_sha="$1"; shift; web_archive_sha="$1"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
incoming_root=$root/incoming; incoming=$incoming_root/$operation_id
mkdir -p "$incoming_root"; chmod 700 "$incoming_root"
if [[ -e "$incoming" ]]; then
  [[ -d "$incoming" && ! -L "$incoming" && -z "$(find "$incoming" -mindepth 1 -maxdepth 1 -print -quit)" ]]
else
  mkdir "$incoming"
fi
chmod 700 "$incoming"
if [[ "$package_hit" == true ]]; then
  if [[ "$source_kind" == formal && "$source_token" == formal ]]; then
    source_dir=$root/release-cache/$manifest_sha
  elif [[ "$source_kind" == retained_operation && "$source_token" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]; then
    source_dir=$incoming_root/$source_token
  else
    exit 31
  fi
  [[ -d "$source_dir" && ! -L "$source_dir" ]]
  for file in release-manifest.json release-artifact.json source.tar sbom.cdx.json server-image.tar web-image.tar; do
    [[ -f "$source_dir/$file" && ! -L "$source_dir/$file" ]]
    case "$file" in
      release-manifest.json) expected_value="$manifest_sha" ;;
      release-artifact.json) expected_value="$artifact_sha" ;;
      source.tar) expected_value="$source_sha" ;;
      sbom.cdx.json) expected_value="$sbom_sha" ;;
      server-image.tar) expected_value="$server_archive_sha" ;;
      web-image.tar) expected_value="$web_archive_sha" ;;
      *) exit 32 ;;
    esac
    [[ "$(sha256sum "$source_dir/$file" | awk '{print $1}')" == "$expected_value" ]]
    ln "$source_dir/$file" "$incoming/$file"
  done
fi
jq -n --arg schemaVersion "plush.target-release-cache/v1" --arg operationId "$operation_id" --arg manifest "$manifest_sha" \
  --arg source "$source_kind" --argjson packageHit "$package_hit" --argjson imageHit "$image_hit" --argjson avoidedBytes "$avoided_bytes" \
  '{schemaVersion:$schemaVersion,operationId:$operationId,releaseManifestSha256:$manifest,packageHit:$packageHit,imageHit:$imageHit,cacheSource:$source,avoidedBytes:$avoidedBytes,basis:(if $packageHit then ["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"] else [] end)}' >"$incoming/.target-cache.json"
chmod 600 "$incoming/.target-cache.json"
`;

export function prepareTargetReleaseIncoming(
  { operationId, identity, probe },
  { runCommand = spawnSync } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("target cache operation id is invalid");
  }
  validateTargetCacheProbe(probe, identity.releaseManifestSha256);
  const target = getDeploymentTarget("test-133");
  runChecked(
    runCommand,
    "ssh",
    [
      ...fixedSshArgs(target),
      "bash",
      "-s",
      "--",
      operationId,
      identity.releaseManifestSha256,
      String(probe.packageHit),
      String(probe.imageHit),
      probe.cacheSource,
      probe.sourceToken,
      String(probe.avoidedBytes),
      identity.releaseArtifactSha256,
      identity.sourceArchiveSha256,
      identity.sbomSha256,
      identity.serverArchiveSha256,
      identity.webArchiveSha256,
    ],
    { input: PREPARE_CACHE_SCRIPT, timeout: 5 * 60_000 },
    "prepare target release cache",
  );
  return probe;
}

const CLEANUP_PREPARED_INCOMING_SCRIPT = String.raw`set -euo pipefail
root=/home/simon/plush-toy-erp-v5
operation_id="$1"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
incoming=$root/incoming/$operation_id
[[ -e "$incoming" ]] || exit 0
[[ -d "$incoming" && ! -L "$incoming" && "$(stat -c '%u' "$incoming")" == "$(id -u)" ]]
rm -rf -- "$incoming"
`;

export function cleanupPreparedTargetReleaseIncoming(
  operationId,
  { runCommand = spawnSync } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("target cache cleanup operation id is invalid");
  }
  const target = getDeploymentTarget("test-133");
  runChecked(
    runCommand,
    "ssh",
    [...fixedSshArgs(target), "bash", "-s", "--", operationId],
    { input: CLEANUP_PREPARED_INCOMING_SCRIPT, timeout: 60_000 },
    "clean prepared target incoming",
  );
}
