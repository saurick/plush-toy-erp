export const DELIVERY_PROVIDER_CONTRACT = "plush.delivery-provider/v1";
export const DELIVERY_PROVIDER_RELEASE_STATUS_CONTRACT =
  "plush.delivery-provider-release-status/v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;

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
    !Array.isArray(version.assets) ||
    version.assets.some(
      (asset) =>
        ![
          "checksums.sha256",
          "release-artifact.json",
          "release-manifest.json",
          "sbom.cdx.json",
          "server-image.tar",
          "web-image.tar",
        ].includes(asset),
    ) ||
    new Set(version.assets).size !== version.assets.length ||
    typeof version.url !== "string" ||
    !/^https:\/\/github\.com\/saurick\/plush-toy-erp\/releases\/tag\/artifact-[0-9a-f]{40}$/u.test(
      version.url,
    )
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
