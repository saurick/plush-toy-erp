import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { getDeploymentTarget } from "./deployment-targets.mjs";
import { parseReleaseChecksums } from "./github-release-asset-set.mjs";
import { assertReleaseArtifactManifest } from "./release-artifact-bundle.mjs";
import {
  validateReleaseArtifactBinding,
  validateReleaseManifest,
} from "./release-catalog.mjs";
import {
  TARGET_RELEASE_FETCH_FILE,
  validateTargetReleaseFetch,
} from "./target-release-fetch.mjs";
import { readBoundedPlainFile } from "../lib/file-digest.mjs";

export const TARGET_RELEASE_CACHE_CONTRACT = "plush.target-release-cache/v2";
export const TARGET_RELEASE_CACHE_MODES = Object.freeze({
  direct: "v2_direct",
  legacy: "legacy_v1_existing_only",
});
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
const FIXED_CACHE_ROOTS = new Set([
  "/home/simon/plush-toy-erp-demo-v1",
  "/home/simon/plush-toy-erp-test-v1",
]);

function fileMetadata(fetch, name) {
  return fetch.formal.files.find((file) => file.name === name);
}

export function buildTargetReleaseCacheIdentityFromEvidence({
  manifest,
  artifact,
  fetch,
  controlDigests,
}) {
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
  const expected = {
    "checksums.sha256": controlDigests.checksumsSha256,
    "release-artifact.json": controlDigests.releaseArtifactSha256,
    "release-manifest.json": controlDigests.releaseManifestSha256,
    "release-rehearsal.json": controlDigests.releaseRehearsalSha256,
    "sbom.cdx.json": artifact.sbom?.sha256,
    "server-image.tar": server?.archive?.sha256,
    "web-image.tar": web?.archive?.sha256,
  };
  if (
    !server ||
    !web ||
    !serverManifest ||
    !webManifest ||
    fetch.gitSha !== manifest.gitSha ||
    fetch.version !== manifest.version ||
    Object.entries(expected).some(
      ([name, sha256]) => fileMetadata(fetch, name)?.sha256 !== sha256,
    ) ||
    fileMetadata(fetch, "server-image.tar")?.size !==
      server.archive.sizeBytes ||
    fileMetadata(fetch, "web-image.tar")?.size !== web.archive.sizeBytes ||
    fetch.source.file.sha256 !== artifact.sourceArchive?.sha256
  ) {
    throw new Error("target cache control evidence is inconsistent");
  }
  return Object.freeze({
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    cacheMode: TARGET_RELEASE_CACHE_MODES.direct,
    gitSha: manifest.gitSha,
    version: manifest.version,
    ...controlDigests,
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

function buildLegacyTargetReleaseCacheIdentity({
  manifest,
  artifact,
  manifestSnapshot,
  artifactSnapshot,
  checksumsSnapshot,
}) {
  if (manifest.schemaVersion !== "plush.release-manifest/v1") {
    throw new Error("legacy target cache requires a v1 release manifest");
  }
  const manifestSha256 = manifestSnapshot.sha256;
  const artifactSha256 = artifactSnapshot.sha256;
  const checksumsSha256 = checksumsSnapshot.sha256;
  const checksums = parseReleaseChecksums(
    checksumsSnapshot.content.toString("utf8"),
  );
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
  const expectedChecksums = new Map([
    ["release-artifact.json", artifactSha256],
    ["release-manifest.json", manifestSha256],
    ["sbom.cdx.json", artifact.sbom?.sha256],
    ["server-image.tar", server?.archive?.sha256],
    ["web-image.tar", web?.archive?.sha256],
  ]);
  if (
    !server ||
    !web ||
    !serverManifest ||
    !webManifest ||
    [...expectedChecksums].some(
      ([name, sha256]) => checksums.get(name) !== sha256,
    )
  ) {
    throw new Error("legacy target cache control evidence is inconsistent");
  }
  return Object.freeze({
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    cacheMode: TARGET_RELEASE_CACHE_MODES.legacy,
    gitSha: manifest.gitSha,
    version: manifest.version,
    releaseManifestSha256: manifestSha256,
    releaseArtifactSha256: artifactSha256,
    checksumsSha256,
    releaseRehearsalSha256: null,
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

function plainFile(file, maximumBytes = 2 * 1024 ** 3) {
  const input = path.resolve(file);
  const absolute = path.join(
    realpathSync(path.dirname(input)),
    path.basename(input),
  );
  try {
    return {
      absolute,
      ...readBoundedPlainFile(absolute, { maximumBytes }),
    };
  } catch (error) {
    throw new Error("target cache identity input is invalid", { cause: error });
  }
}

function plainDirectory(directory) {
  const absolute = path.resolve(directory);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("target cache bundle is invalid");
  }
  return realpathSync(absolute);
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
  const { env = process.env, ...commandOptions } = options || {};
  const childEnv = { ...env };
  delete childEnv.PLUSH_GITLAB_TOKEN;
  delete childEnv.PLUSH_GITLAB_TARGET_FETCH_TOKEN;
  const result = runCommand(command, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...commandOptions,
    env: childEnv,
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
  const bundle = plainDirectory(bundleDir);
  const manifestSnapshot = plainFile(releaseManifestPath, 512 * 1024);
  if (manifestSnapshot.absolute !== path.join(bundle, "release-manifest.json")) {
    throw new Error("target cache release manifest is outside its bundle");
  }
  const manifest = validateReleaseManifest(
    JSON.parse(manifestSnapshot.content.toString("utf8")),
  );
  const artifactSnapshot = plainFile(
    path.join(bundle, "release-artifact.json"),
    512 * 1024,
  );
  const artifact = assertReleaseArtifactManifest(
    JSON.parse(artifactSnapshot.content.toString("utf8")),
  );
  validateReleaseArtifactBinding(manifest, artifact, artifactSnapshot.sha256);
  const checksumsSnapshot = plainFile(
    path.join(bundle, "checksums.sha256"),
    4 * 1024 * 1024,
  );
  if (manifest.schemaVersion === "plush.release-manifest/v1") {
    return buildLegacyTargetReleaseCacheIdentity({
      manifest,
      artifact,
      manifestSnapshot,
      artifactSnapshot,
      checksumsSnapshot,
    });
  }
  const rehearsalSnapshot = plainFile(
    path.join(bundle, "release-rehearsal.json"),
    4 * 1024 * 1024,
  );
  const fetchSnapshot = plainFile(
    path.join(bundle, TARGET_RELEASE_FETCH_FILE),
    512 * 1024,
  );
  const fetch = validateTargetReleaseFetch(
    JSON.parse(fetchSnapshot.content.toString("utf8")),
  );
  if (rehearsalSnapshot.sha256 !== manifest.rehearsal?.receiptSha256) {
    throw new Error("target cache rehearsal identity is invalid");
  }
  return buildTargetReleaseCacheIdentityFromEvidence({
    manifest,
    artifact,
    fetch,
    controlDigests: {
      releaseManifestSha256: manifestSnapshot.sha256,
      releaseArtifactSha256: artifactSnapshot.sha256,
      checksumsSha256: checksumsSnapshot.sha256,
      releaseRehearsalSha256: rehearsalSnapshot.sha256,
    },
  });
}

function identityArgs(identity) {
  const requiredDigestFields = [
    "releaseManifestSha256",
    "releaseArtifactSha256",
    "checksumsSha256",
    "sourceArchiveSha256",
    "sbomSha256",
    "serverArchiveSha256",
    "webArchiveSha256",
  ];
  if (identity.cacheMode === TARGET_RELEASE_CACHE_MODES.direct) {
    requiredDigestFields.push("releaseRehearsalSha256");
  }
  for (const field of requiredDigestFields) {
    if (!SHA256_PATTERN.test(String(identity[field] || ""))) {
      throw new Error(`target cache ${field} is invalid`);
    }
  }
  if (
    !Object.values(TARGET_RELEASE_CACHE_MODES).includes(identity.cacheMode) ||
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
    identity.cacheMode,
    identity.gitSha,
    identity.version,
    identity.releaseManifestSha256,
    identity.releaseArtifactSha256,
    identity.checksumsSha256,
    identity.releaseRehearsalSha256 || "none",
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

const CACHE_PROBE_SCRIPT_TEMPLATE = String.raw`set -euo pipefail
root=__ROOT__
cache_mode="$1"; shift
case "$cache_mode" in
  v2_direct) cache_root=$root/release-cache-v2 ;;
  legacy_v1_existing_only) cache_root=$root/release-cache ;;
  *) exit 20 ;;
esac
incoming_root=$root/incoming
owned_directory() {
  local candidate="$1" canonical mode
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  canonical="$(readlink -f -- "$candidate")" || return 1
  [[ "$canonical" == "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_plain_file() {
  local candidate="$1" mode
  [[ -f "$candidate" && ! -L "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_directory "$root"
if [[ -e "$cache_root" ]]; then
  owned_directory "$cache_root"
fi
if [[ -e "$incoming_root" ]]; then
  owned_directory "$incoming_root"
fi
git_sha="$1"; shift; version="$1"; shift; manifest_sha="$1"; shift; artifact_sha="$1"; shift
checksums_sha="$1"; shift; rehearsal_sha="$1"; shift; source_sha="$1"; shift; sbom_sha="$1"; shift
server_archive_sha="$1"; shift; web_archive_sha="$1"; shift
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
  local candidate="$1" required actual_server_manifest actual_web_manifest expected_manifest_schema
  owned_directory "$candidate"
  local required_files=(release-manifest.json release-artifact.json sbom.cdx.json source.tar server-image.tar web-image.tar)
  if [[ "$cache_mode" == v2_direct ]]; then
    required_files=(checksums.sha256 release-manifest.json release-artifact.json release-rehearsal.json sbom.cdx.json source.tar server-image.tar web-image.tar)
  fi
  for required in "${"$"}{required_files[@]}"; do
    owned_plain_file "$candidate/$required"
  done
  [[ "$(sha256sum "$candidate/release-manifest.json" | awk '{print $1}')" == "$manifest_sha" ]]
  [[ "$(sha256sum "$candidate/release-artifact.json" | awk '{print $1}')" == "$artifact_sha" ]]
  if [[ "$cache_mode" == v2_direct ]]; then
    [[ "$(sha256sum "$candidate/checksums.sha256" | awk '{print $1}')" == "$checksums_sha" ]]
    [[ "$(sha256sum "$candidate/release-rehearsal.json" | awk '{print $1}')" == "$rehearsal_sha" ]]
  fi
  [[ "$(sha256sum "$candidate/source.tar" | awk '{print $1}')" == "$source_sha" ]]
  [[ "$(sha256sum "$candidate/sbom.cdx.json" | awk '{print $1}')" == "$sbom_sha" ]]
  [[ "$(sha256sum "$candidate/server-image.tar" | awk '{print $1}')" == "$server_archive_sha" ]]
  [[ "$(sha256sum "$candidate/web-image.tar" | awk '{print $1}')" == "$web_archive_sha" ]]
  expected_manifest_schema=plush.release-manifest/v2
  [[ "$cache_mode" == legacy_v1_existing_only ]] && expected_manifest_schema=plush.release-manifest/v1
  jq -e --arg schema "$expected_manifest_schema" --arg sha "$git_sha" --arg version "$version" --arg serverDigest "$server_digest" --arg webDigest "$web_digest" \
    '.schemaVersion == $schema and
     .gitSha == $sha and .version == $version and
     ([.images[] | select(.kind == "server") | .digest] == [$serverDigest]) and
     ([.images[] | select(.kind == "web") | .digest] == [$webDigest])' "$candidate/release-manifest.json" >/dev/null
  jq -e --arg sha "$git_sha" --arg version "$version" --arg serverId "$server_content_id" --arg webId "$web_content_id" \
    '.schemaVersion == "plush-release-artifact/v1" and .git.commit == $sha and .releaseVersion == $version and
     ([.images[] | select(.kind == "server") | .contentId] == [$serverId]) and
     ([.images[] | select(.kind == "web") | .contentId] == [$webId])' "$candidate/release-artifact.json" >/dev/null
  actual_server_manifest="$(portable_manifest_digest "$candidate/server-image.tar" "$server_ref" "$server_content_id")"
  actual_web_manifest="$(portable_manifest_digest "$candidate/web-image.tar" "$web_ref" "$web_content_id")"
  printf '%s|%s\n' "$actual_server_manifest" "$actual_web_manifest"
}
has_exact_formal_inventory() {
  local candidate="$1" actual expected
  if [[ "$cache_mode" == v2_direct ]]; then
    expected="$(printf '%s\n' checksums.sha256 release-artifact.json release-manifest.json release-rehearsal.json sbom.cdx.json server-image.tar source.tar web-image.tar | LC_ALL=C sort)"
  else
    expected="$(printf '%s\n' release-artifact.json release-manifest.json sbom.cdx.json server-image.tar source.tar web-image.tar | LC_ALL=C sort)"
  fi
  actual="$(find "$candidate" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)"
  [[ "$actual" == "$expected" ]]
}
has_safe_retained_inventory() {
  local candidate="$1" entry name
  while IFS= read -r entry; do
    name="$(basename -- "$entry")"
    case "$name" in
      .target-cache.json|checksums.sha256|release-artifact.json|release-manifest.json|release-rehearsal.json|sbom.cdx.json|server-image.tar|source.tar|web-image.tar|promotion-manifest.json|rollback-manifest.json|current-release-manifest.json|remote-promotion.sh|remote-code-rollback.sh|remote-release-acquire.sh|target-release-fetch.json|transfer-checksums.sha256)
        owned_plain_file "$entry" || return 1
        ;;
      *) return 1 ;;
    esac
  done < <(find "$candidate" -mindepth 1 -maxdepth 1 -print)
}
candidate=""; source_kind=none; source_token=none; manifests=""
formal="$cache_root/$manifest_sha"
if [[ -e "$formal" ]]; then
  has_exact_formal_inventory "$formal" || { echo '[target-cache] invalid formal cache inventory' >&2; exit 21; }
  manifests="$(validate_candidate "$formal")" || { echo '[target-cache] invalid formal cache' >&2; exit 21; }
  candidate="$formal"; source_kind=formal; source_token=formal
else
  if [[ "$cache_mode" == v2_direct ]]; then
    shopt -s nullglob
    for retained in "$incoming_root"/*; do
      owned_directory "$retained" || continue
      has_safe_retained_inventory "$retained" || continue
      owned_plain_file "$retained/release-manifest.json" || continue
      owned_plain_file "$retained/.target-cache.json" || continue
      retained_operation="$(basename -- "$retained")"
      [[ "$retained_operation" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || continue
      jq -e --arg operationId "$retained_operation" --arg manifest "$manifest_sha" \
        '.schemaVersion == "plush.target-release-cache/v2" and
         .operationId == $operationId and .cacheMode == "v2_direct" and
         .releaseManifestSha256 == $manifest' \
        "$retained/.target-cache.json" >/dev/null 2>&1 || continue
      [[ "$(sha256sum "$retained/release-manifest.json" | awk '{print $1}')" == "$manifest_sha" ]] || continue
      manifests="$(validate_candidate "$retained")" || { echo '[target-cache] invalid retained cache' >&2; exit 22; }
      candidate="$retained"; source_kind=retained_operation; source_token="$retained_operation"; break
    done
  fi
fi
if [[ -z "$candidate" ]]; then
  jq -n --arg schemaVersion "plush.target-release-cache/v2" --arg manifest "$manifest_sha" \
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
if [[ "$cache_mode" == v2_direct ]]; then
  avoided_bytes="$(stat -c '%s' "$candidate/checksums.sha256" "$candidate/release-manifest.json" "$candidate/release-artifact.json" "$candidate/release-rehearsal.json" "$candidate/sbom.cdx.json" "$candidate/source.tar" "$candidate/server-image.tar" "$candidate/web-image.tar" | awk '{total += $1} END {print total + 0}')"
else
  avoided_bytes="$(stat -c '%s' "$candidate/release-manifest.json" "$candidate/release-artifact.json" "$candidate/sbom.cdx.json" "$candidate/source.tar" "$candidate/server-image.tar" "$candidate/web-image.tar" | awk '{total += $1} END {print total + 0}')"
fi
jq -n --arg schemaVersion "plush.target-release-cache/v2" --arg manifest "$manifest_sha" --arg source "$source_kind" --arg token "$source_token" \
  --argjson imageHit "$image_hit" --argjson avoidedBytes "$avoided_bytes" \
  '{schemaVersion:$schemaVersion,releaseManifestSha256:$manifest,packageHit:true,imageHit:$imageHit,cacheSource:$source,sourceToken:$token,avoidedBytes:$avoidedBytes,basis:["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"]}'
`;

function targetScript(template, target) {
  const root = String(target?.filesystem?.root || "");
  if (!FIXED_CACHE_ROOTS.has(root)) {
    throw new Error("target release cache root is invalid");
  }
  return template.replaceAll("__ROOT__", root);
}

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

export function targetReleaseCacheEvidenceFingerprint({
  targetKey,
  identity,
  probe,
}) {
  getDeploymentTarget(targetKey);
  identityArgs(identity);
  validateTargetCacheProbe(probe, identity.releaseManifestSha256);
  return createHash("sha256")
    .update(
      JSON.stringify([
        targetKey,
        identity.cacheMode,
        identity.gitSha,
        identity.version,
        identity.releaseManifestSha256,
        probe.packageHit,
        probe.cacheSource,
        probe.avoidedBytes,
        probe.basis,
      ]),
    )
    .digest("hex");
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
        operation.metadata?.targetAcquisitionMode === "gitlab_internal" &&
        Number.isSafeInteger(
          operation.metadata?.targetAcquisitionBytesPerSecond,
        ) &&
        operation.metadata.targetAcquisitionBytesPerSecond > 0,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!baseline || avoidedBytes === 0) {
    return Object.freeze({ durationMs: null, baselineOperationId: null });
  }
  return Object.freeze({
    durationMs: Math.max(
      1,
      Math.round(
        (avoidedBytes * 1000) /
          baseline.metadata.targetAcquisitionBytesPerSecond,
      ),
    ),
    baselineOperationId: baseline.id,
  });
}

export function probeTargetReleaseCache(
  identity,
  { runCommand = spawnSync, targetKey = "demo-133" } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const raw = runChecked(
    runCommand,
    "ssh",
    [...fixedSshArgs(target), "bash", "-s", "--", ...identityArgs(identity)],
    { input: targetScript(CACHE_PROBE_SCRIPT_TEMPLATE, target), timeout: 5 * 60_000 },
    "read target release cache",
  );
  return validateTargetCacheProbe(
    JSON.parse(raw.trim()),
    identity.releaseManifestSha256,
  );
}

const PREPARE_CACHE_SCRIPT_TEMPLATE = String.raw`set -euo pipefail
umask 077
root=__ROOT__
operation_id="$1"; shift; cache_mode="$1"; shift; manifest_sha="$1"; shift; package_hit="$1"; shift; image_hit="$1"; shift
source_kind="$1"; shift; source_token="$1"; shift; avoided_bytes="$1"; shift; artifact_sha="$1"; shift
checksums_sha="$1"; shift; rehearsal_sha="$1"; shift; source_sha="$1"; shift; sbom_sha="$1"; shift
server_archive_sha="$1"; shift; web_archive_sha="$1"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
incoming_root=$root/incoming; incoming=$incoming_root/$operation_id
owned_directory() {
  local candidate="$1" canonical mode
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  canonical="$(readlink -f -- "$candidate")" || return 1
  [[ "$canonical" == "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_plain_file() {
  local candidate="$1" mode
  [[ -f "$candidate" && ! -L "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
safe_retained_inventory() {
  local candidate="$1" entry name
  while IFS= read -r entry; do
    name="$(basename -- "$entry")"
    case "$name" in
      .target-cache.json|checksums.sha256|release-artifact.json|release-manifest.json|release-rehearsal.json|sbom.cdx.json|server-image.tar|source.tar|web-image.tar|promotion-manifest.json|rollback-manifest.json|current-release-manifest.json|remote-promotion.sh|remote-code-rollback.sh|remote-release-acquire.sh|target-release-fetch.json|transfer-checksums.sha256)
        owned_plain_file "$entry" || return 1
        ;;
      *) return 1 ;;
    esac
  done < <(find "$candidate" -mindepth 1 -maxdepth 1 -print)
}
owned_directory "$root"
if [[ -e "$incoming_root" ]]; then
  owned_directory "$incoming_root"
else
  mkdir "$incoming_root"
fi
chmod 700 "$incoming_root"
owned_directory "$incoming_root"
if [[ -e "$incoming" ]]; then
  owned_directory "$incoming"
  [[ -z "$(find "$incoming" -mindepth 1 -maxdepth 1 -print -quit)" ]]
else
  mkdir "$incoming"
fi
chmod 700 "$incoming"
owned_directory "$incoming"
if [[ "$package_hit" == true ]]; then
  if [[ "$cache_mode" == legacy_v1_existing_only ]]; then
    [[ "$source_kind" == formal && "$source_token" == formal ]] || exit 31
    source_root=$root/release-cache
    source_dir=$source_root/$manifest_sha
    cache_files=(release-manifest.json release-artifact.json source.tar sbom.cdx.json server-image.tar web-image.tar)
  elif [[ "$cache_mode" == v2_direct ]]; then
    if [[ "$source_kind" == formal && "$source_token" == formal ]]; then
      source_root=$root/release-cache-v2
      source_dir=$source_root/$manifest_sha
    elif [[ "$source_kind" == retained_operation && "$source_token" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]; then
      [[ "$source_token" != "$operation_id" ]] || exit 31
      source_root=$incoming_root
      source_dir=$source_root/$source_token
    else
      exit 31
    fi
    cache_files=(checksums.sha256 release-manifest.json release-artifact.json release-rehearsal.json source.tar sbom.cdx.json server-image.tar web-image.tar)
  else
    exit 31
  fi
  owned_directory "$source_root"
  owned_directory "$source_dir"
  if [[ "$source_kind" == formal ]]; then
    [[ "$(find "$source_dir" -mindepth 1 -maxdepth 1 -printf '.' | wc -c | tr -d ' ')" == "${"$"}{#cache_files[@]}" ]]
  else
    safe_retained_inventory "$source_dir"
    owned_plain_file "$source_dir/.target-cache.json"
    jq -e --arg operationId "$source_token" --arg manifest "$manifest_sha" \
      '.schemaVersion == "plush.target-release-cache/v2" and
       .operationId == $operationId and .cacheMode == "v2_direct" and
       .releaseManifestSha256 == $manifest' \
      "$source_dir/.target-cache.json" >/dev/null
  fi
  for file in "${"$"}{cache_files[@]}"; do
    owned_plain_file "$source_dir/$file"
    case "$file" in
      release-manifest.json) expected_value="$manifest_sha" ;;
      release-artifact.json) expected_value="$artifact_sha" ;;
      checksums.sha256) expected_value="$checksums_sha" ;;
      release-rehearsal.json) expected_value="$rehearsal_sha" ;;
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
jq -n --arg schemaVersion "plush.target-release-cache/v2" --arg operationId "$operation_id" --arg cacheMode "$cache_mode" --arg manifest "$manifest_sha" \
  --arg source "$source_kind" --argjson packageHit "$package_hit" --argjson imageHit "$image_hit" --argjson avoidedBytes "$avoided_bytes" \
  '{schemaVersion:$schemaVersion,operationId:$operationId,cacheMode:$cacheMode,releaseManifestSha256:$manifest,packageHit:$packageHit,imageHit:$imageHit,cacheSource:$source,avoidedBytes:$avoidedBytes,basis:(if $packageHit then ["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"] else [] end)}' >"$incoming/.target-cache.json"
chmod 600 "$incoming/.target-cache.json"
owned_plain_file "$incoming/.target-cache.json"
`;

export function prepareTargetReleaseIncoming(
  { operationId, identity, probe },
  { runCommand = spawnSync, targetKey = "demo-133" } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("target cache operation id is invalid");
  }
  validateTargetCacheProbe(probe, identity.releaseManifestSha256);
  if (
    identity.cacheMode === TARGET_RELEASE_CACHE_MODES.legacy &&
    (!probe.packageHit || probe.cacheSource !== "formal")
  ) {
    throw new Error("legacy target release cache is unavailable");
  }
  const target = getDeploymentTarget(targetKey);
  runChecked(
    runCommand,
    "ssh",
    [
      ...fixedSshArgs(target),
      "bash",
      "-s",
      "--",
      operationId,
      identity.cacheMode,
      identity.releaseManifestSha256,
      String(probe.packageHit),
      String(probe.imageHit),
      probe.cacheSource,
      probe.sourceToken,
      String(probe.avoidedBytes),
      identity.releaseArtifactSha256,
      identity.checksumsSha256,
      identity.releaseRehearsalSha256 || "none",
      identity.sourceArchiveSha256,
      identity.sbomSha256,
      identity.serverArchiveSha256,
      identity.webArchiveSha256,
    ],
    {
      input: targetScript(PREPARE_CACHE_SCRIPT_TEMPLATE, target),
      timeout: 5 * 60_000,
    },
    "prepare target release cache",
  );
  return probe;
}

const CLEANUP_PREPARED_INCOMING_SCRIPT_TEMPLATE = String.raw`set -euo pipefail
root=__ROOT__
operation_id="$1"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
incoming_root=$root/incoming
incoming=$incoming_root/$operation_id
owned_directory() {
  local candidate="$1" canonical mode
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  canonical="$(readlink -f -- "$candidate")" || return 1
  [[ "$canonical" == "$candidate" && "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
owned_directory "$root"
[[ -e "$incoming_root" ]] || exit 0
owned_directory "$incoming_root"
[[ -e "$incoming" ]] || exit 0
owned_directory "$incoming"
rm -rf -- "$incoming"
`;

export function cleanupPreparedTargetReleaseIncoming(
  operationId,
  { runCommand = spawnSync, targetKey = "demo-133" } = {},
) {
  if (!UUID_V4_PATTERN.test(String(operationId || ""))) {
    throw new Error("target cache cleanup operation id is invalid");
  }
  const target = getDeploymentTarget(targetKey);
  runChecked(
    runCommand,
    "ssh",
    [...fixedSshArgs(target), "bash", "-s", "--", operationId],
    {
      input: targetScript(CLEANUP_PREPARED_INCOMING_SCRIPT_TEMPLATE, target),
      timeout: 60_000,
    },
    "clean prepared target incoming",
  );
}
