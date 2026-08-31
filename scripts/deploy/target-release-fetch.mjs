import { DELIVERY_RELEASE_ASSETS } from "./delivery-provider.mjs";

export const TARGET_RELEASE_FETCH_CONTRACT = "plush.target-release-fetch/v2";
export const TARGET_RELEASE_FETCH_FILE = "target-release-fetch.json";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u;
const FORMAL_PACKAGE = "plush-release";
export const TARGET_RELEASE_SOURCE_PACKAGE = "plush-release-source";
const SOURCE_FILE = "source.tar";
const FIXED_PROJECT = "saurick/plush-toy-erp";
const FIXED_HOST = "gitlab.saurick.me";
const FIXED_ADDRESS = "192.168.0.133";
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_.-]{20,512}$/u;

export function requireTargetReleaseFetchCredential(value) {
  const credential = String(value || "");
  if (!CREDENTIAL_PATTERN.test(credential)) {
    throw new Error("dedicated target release fetch credential is unavailable");
  }
  return credential;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function validateFile(value, expectedName, maximumBytes = 32 * 1024 ** 3) {
  if (
    !exactKeys(value, ["name", "size", "sha256"]) ||
    value.name !== expectedName ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > maximumBytes ||
    !SHA256_PATTERN.test(String(value.sha256 || ""))
  ) {
    throw new Error(`target release fetch file is invalid: ${expectedName}`);
  }
  return Object.freeze({
    name: value.name,
    size: value.size,
    sha256: value.sha256,
  });
}

export function validateTargetReleaseFetch(value) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "provider",
      "project",
      "host",
      "resolvedAddress",
      "gitSha",
      "version",
      "packageVersion",
      "formal",
      "source",
      "redaction",
    ]) ||
    value.schemaVersion !== TARGET_RELEASE_FETCH_CONTRACT ||
    value.provider !== "gitlab" ||
    value.project !== FIXED_PROJECT ||
    value.host !== FIXED_HOST ||
    value.resolvedAddress !== FIXED_ADDRESS ||
    !SHA_PATTERN.test(String(value.gitSha || "")) ||
    !VERSION_PATTERN.test(String(value.version || "")) ||
    value.packageVersion !== `artifact-${value.gitSha}` ||
    !exactKeys(value.formal, ["package", "files"]) ||
    value.formal.package !== FORMAL_PACKAGE ||
    !Array.isArray(value.formal.files) ||
    value.formal.files.length !== DELIVERY_RELEASE_ASSETS.length ||
    !exactKeys(value.source, ["package", "file"]) ||
    value.source.package !== TARGET_RELEASE_SOURCE_PACKAGE ||
    !exactKeys(value.redaction, ["containsCredentials", "containsSecrets"]) ||
    value.redaction.containsCredentials !== false ||
    value.redaction.containsSecrets !== false
  ) {
    throw new Error("target release fetch contract is invalid");
  }
  const files = new Map(
    value.formal.files.map((file) => [String(file?.name || ""), file]),
  );
  if (
    files.size !== DELIVERY_RELEASE_ASSETS.length ||
    DELIVERY_RELEASE_ASSETS.some((name) => !files.has(name))
  ) {
    throw new Error("target release fetch formal asset set is invalid");
  }
  const formalFiles = DELIVERY_RELEASE_ASSETS.map((name) =>
    validateFile(files.get(name), name),
  );
  const sourceFile = validateFile(value.source.file, SOURCE_FILE, 8 * 1024 ** 3);
  return Object.freeze({
    ...value,
    formal: Object.freeze({
      package: FORMAL_PACKAGE,
      files: Object.freeze(formalFiles),
    }),
    source: Object.freeze({
      package: TARGET_RELEASE_SOURCE_PACKAGE,
      file: sourceFile,
    }),
    redaction: Object.freeze({ containsCredentials: false, containsSecrets: false }),
  });
}

export function buildTargetReleaseFetch({ gitSha, version, formalFiles, sourceFile }) {
  return validateTargetReleaseFetch({
    schemaVersion: TARGET_RELEASE_FETCH_CONTRACT,
    provider: "gitlab",
    project: FIXED_PROJECT,
    host: FIXED_HOST,
    resolvedAddress: FIXED_ADDRESS,
    gitSha,
    version,
    packageVersion: `artifact-${gitSha}`,
    formal: { package: FORMAL_PACKAGE, files: formalFiles },
    source: { package: TARGET_RELEASE_SOURCE_PACKAGE, file: sourceFile },
    redaction: { containsCredentials: false, containsSecrets: false },
  });
}
