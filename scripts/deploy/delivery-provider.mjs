export const DELIVERY_PROVIDER_CONTRACT = "plush.delivery-provider/v1";
export const DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT =
  "plush.delivery-provider-release-status/v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
export const LEGACY_DELIVERY_RELEASE_ASSETS = Object.freeze([
  "checksums.sha256",
  "release-artifact.json",
  "release-manifest.json",
  "sbom.cdx.json",
  "server-image.tar",
  "web-image.tar",
]);
export const DELIVERY_RELEASE_ASSETS = Object.freeze([
  ...LEGACY_DELIVERY_RELEASE_ASSETS.slice(0, 3),
  "release-rehearsal.json",
  ...LEGACY_DELIVERY_RELEASE_ASSETS.slice(3),
]);
const ALLOWED_DELIVERY_RELEASE_ASSETS = new Set(DELIVERY_RELEASE_ASSETS);

function exactAssetSet(assets, expected) {
  const sorted = [...expected].sort();
  return (
    assets.length === sorted.length &&
    assets.every((asset, index) => asset === sorted[index])
  );
}

function validSize(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validBuildPerformance(value) {
  return (
    value === null ||
    (value?.schemaVersion === "plush.release-build-performance/v1" &&
      validSize(value.durationMs) &&
      ["builder", "gha"].includes(value.cacheMode) &&
      validSize(value.completedVertexCount) &&
      validSize(value.cacheHitCount) &&
      validSize(value.cacheMissCount) &&
      value.cacheHitCount + value.cacheMissCount ===
        value.completedVertexCount &&
      Number.isSafeInteger(value.cacheHitRateBasisPoints) &&
      value.cacheHitRateBasisPoints >= 0 &&
      value.cacheHitRateBasisPoints <= 10_000)
  );
}

export function validateDeliveryReleaseVersion(version) {
  if (
    !version ||
    typeof version !== "object" ||
    version.schemaVersion !== "plush.delivery-version/v1" ||
    !SHA_PATTERN.test(String(version.gitSha || "")) ||
    !VERSION_PATTERN.test(String(version.version || "")) ||
    version.tag !== `artifact-${version.gitSha}` ||
    !["published", "draft", "prerelease"].includes(version.status) ||
    typeof version.publishedAt !== "string" ||
    Number.isNaN(Date.parse(version.publishedAt)) ||
    typeof version.completeAssets !== "boolean" ||
    typeof version.promotionEligible !== "boolean" ||
    !Array.isArray(version.assets) ||
    version.assets.some((asset) => !ALLOWED_DELIVERY_RELEASE_ASSETS.has(asset)) ||
    new Set(version.assets).size !== version.assets.length ||
    version.assets.some((asset, index) => index > 0 && version.assets[index - 1] >= asset) ||
    (version.completeAssets !==
      (exactAssetSet(version.assets, DELIVERY_RELEASE_ASSETS) ||
        exactAssetSet(version.assets, LEGACY_DELIVERY_RELEASE_ASSETS))) ||
    (version.promotionEligible &&
      (version.status !== "published" ||
        !version.completeAssets ||
        !exactAssetSet(version.assets, DELIVERY_RELEASE_ASSETS))) ||
    !version.artifactSummary ||
    !validSize(version.artifactSummary.totalBytes) ||
    !validSize(version.artifactSummary.serverImageBytes) ||
    !validSize(version.artifactSummary.webImageBytes) ||
    !validSize(version.artifactSummary.sbomBytes) ||
    version.artifactSummary.serverImageBytes +
      version.artifactSummary.webImageBytes +
      version.artifactSummary.sbomBytes >
      version.artifactSummary.totalBytes ||
    !validBuildPerformance(version.buildPerformance) ||
    (version.imageDigests !== null &&
      (!DIGEST_PATTERN.test(String(version.imageDigests?.server || "")) ||
        !DIGEST_PATTERN.test(String(version.imageDigests?.web || "")))) ||
    typeof version.url !== "string" ||
    ![
      /^https:\/\/github\.com\/saurick\/plush-toy-erp\/releases\/tag\/artifact-[0-9a-f]{40}$/u,
      /^https:\/\/gitlab\.saurick\.me\/saurick\/plush-toy-erp\/-\/releases\/artifact-[0-9a-f]{40}$/u,
    ].some((pattern) => pattern.test(version.url))
  ) {
    throw new Error("delivery release version contract is invalid");
  }
  return version;
}

export function validateReleaseDispatchRequest(request) {
  if (
    !request ||
    typeof request !== "object" ||
    !SHA_PATTERN.test(String(request.gitSha || "")) ||
    !VERSION_PATTERN.test(String(request.version || "")) ||
    request.customer !== "yoyoosun"
  ) {
    throw new Error("release dispatch request is invalid");
  }
  return request;
}

export function validateDeliveryProvider(provider) {
  if (
    !provider ||
    provider.schemaVersion !== DELIVERY_PROVIDER_CONTRACT ||
    typeof provider.listVersions !== "function" ||
    typeof provider.getReleaseStatus !== "function" ||
    typeof provider.dispatchRelease !== "function" ||
    typeof provider.downloadRelease !== "function"
  ) {
    throw new Error("delivery provider contract is invalid");
  }
  return provider;
}
