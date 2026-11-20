import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
export const policy = JSON.parse(
  await readFile(new URL("./pdf-runtime-policy.json", import.meta.url), "utf8"),
);

export function readRuntimePins(dockerfile) {
  const argument = (name) =>
    dockerfile.match(new RegExp(`^ARG ${name}=([^\\s]+)$`, "m"))?.[1];
  const pins = {
    baseImage: argument("RUNTIME_BASE_IMAGE"),
    chromiumVersion: argument("CHROMIUM_VERSION"),
    debianSnapshot: argument("DEBIAN_SNAPSHOT"),
  };
  if (
    !/^debian:bookworm-slim@sha256:[a-f0-9]{64}$/.test(pins.baseImage || "") ||
    !/^\d+\.\d+\.\d+\.\d+-\d+~deb12u\d+$/.test(pins.chromiumVersion || "") ||
    !/^\d{8}T\d{6}Z$/.test(pins.debianSnapshot || "")
  )
    throw new Error(
      "PDF runtime must pin base digest, Chromium package and Debian snapshot",
    );
  return pins;
}

export function inspectRuntime(
  metadata,
  packagesText,
  chromiumBanner,
  vulnerabilities,
  pins,
) {
  const image = metadata[0];
  const errors = [];
  const packages = new Map(
    packagesText
      .trim()
      .split("\n")
      .map((line) => line.split("\t")),
  );
  const env = Object.fromEntries(
    (image?.Config?.Env || []).map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
  if (
    !/^sha256:[a-f0-9]{64}$/.test(image?.Id || "") ||
    image.Os !== "linux" ||
    image.Architecture !== "amd64"
  )
    errors.push("runtime identity or platform is invalid");
  if (image?.Config?.User !== "app" || env.HOME !== "/home/app")
    errors.push("runtime must use app and writable /home/app");
  if (env.CHROMIUM_DEBIAN_SNAPSHOT !== pins.debianSnapshot)
    errors.push("installed snapshot differs from Dockerfile");
  if (env.PDF_RUNTIME_BASE_IMAGE !== pins.baseImage)
    errors.push("runtime base differs from Dockerfile");
  for (const name of ["chromium", "chromium-common"])
    if (packages.get(name) !== pins.chromiumVersion)
      errors.push(`${name} differs from Dockerfile`);
  if (
    !chromiumBanner.includes(`Chromium ${pins.chromiumVersion.split("-")[0]} `)
  )
    errors.push("actual Chromium executable differs from installed package");
  if (packages.has("fonts-noto-cjk"))
    errors.push("system CJK fonts duplicate the bundled print fonts");
  const budget = Math.min(
    policy.maximumImageBytes,
    Math.floor(
      policy.baselineImageBytes * (1 + policy.maximumGrowthPercent / 100),
    ),
  );
  if (
    !Number.isSafeInteger(image?.Size) ||
    image.Size <= 0 ||
    image.Size > budget
  )
    errors.push(`image exceeds ${budget} bytes or size is unavailable`);
  const scanResults = Array.isArray(vulnerabilities?.Results)
    ? vulnerabilities.Results
    : [];
  const scannedOSPackages = scanResults
    .filter((result) => result.Class === "os-pkgs" && result.Type === "debian")
    .flatMap((result) => result.Packages || []);
  if (
    vulnerabilities?.SchemaVersion !== 2 ||
    vulnerabilities?.Metadata?.OS?.Family !== "debian" ||
    !scannedOSPackages.length
  )
    errors.push("valid Debian package security evidence is required");
  for (const name of ["chromium", "chromium-common"])
    if (
      !scannedOSPackages.some((entry) => {
        const epoch = entry.Epoch ? `${entry.Epoch}:` : "";
        const release = entry.Release ? `-${entry.Release}` : "";
        return (
          entry.Name === name &&
          `${epoch}${entry.Version || ""}${release}` === pins.chromiumVersion
        );
      })
    )
      errors.push(`security scan is missing the installed ${name} package`);
  const findings = scanResults.flatMap((result) =>
    (result.Vulnerabilities || []).map((entry) => ({
      target: result.Target,
      class: result.Class,
      type: result.Type,
      id: entry.VulnerabilityID,
      package: entry.PkgName,
      installed: entry.InstalledVersion,
      fixed: entry.FixedVersion || "",
      severity: entry.Severity,
    })),
  );
  const actionable = findings.filter(
    (entry) =>
      entry.class === "os-pkgs" &&
      entry.type === "debian" &&
      entry.fixed &&
      ["HIGH", "CRITICAL"].includes(entry.severity),
  );
  if (actionable.length)
    errors.push(
      `${actionable.length} HIGH/CRITICAL Debian OS package findings have available fixes`,
    );
  return {
    schemaVersion: "plush.pdf-runtime/v1",
    checkedAt: new Date().toISOString(),
    imageId: image?.Id,
    sourceCommit: env.GIT_SHA,
    imageBytes: image?.Size,
    sizeBudgetBytes: budget,
    sizeMetric: policy.sizeMetric,
    ...pins,
    scannedOSPackageCount: scannedOSPackages.length,
    packages: [...packages].map(([name, version]) => ({ name, version })),
    blockingVulnerabilityScope: "debian-os-packages",
    applicationPackageFindingCount: findings.filter(
      (entry) => entry.class === "lang-pkgs",
    ).length,
    findings,
    errors,
    status: errors.length ? "failed" : "passed",
  };
}

async function main() {
  const [mode = "check-source", directory = "output/ci/pdf-runtime"] =
    process.argv.slice(2);
  const pins = readRuntimePins(
    await readFile(path.join(root, "server/Dockerfile"), "utf8"),
  );
  const deps = JSON.parse(
    await readFile(path.join(root, "web/package.json"), "utf8"),
  ).dependencies;
  for (const family of ["noto-sans-sc", "noto-serif-sc"])
    if (!/^\d+\.\d+\.\d+$/.test(deps[`@fontsource-variable/${family}`] || ""))
      throw new Error("print font versions must be exact");
  if (mode === "check-source") {
    console.log(`[pdf-runtime] source pins valid: ${pins.chromiumVersion}`);
    return;
  }
  await mkdir(directory, { recursive: true });
  if (mode === "report") {
    const read = (file) => readFile(path.join(directory, file), "utf8");
    const [metadata, packages, banner, scan] = await Promise.all([
      read("image.json"),
      read("packages.tsv"),
      read("chromium-version.txt"),
      read("vulnerabilities.json"),
    ]);
    const report = inspectRuntime(
      JSON.parse(metadata),
      packages,
      banner,
      JSON.parse(scan),
      pins,
    );
    await writeFile(
      path.join(directory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(
      `[pdf-runtime] ${report.status}: Chromium ${pins.chromiumVersion}; image ${report.imageBytes} bytes`,
    );
    if (report.errors.length) throw new Error(report.errors.join("; "));
    return;
  }
  if (mode === "upstream") {
    const source =
      "https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions?pageSize=1";
    const response = await fetch(source, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Chrome version history returned ${response.status}`);
    const latest = (await response.json()).versions?.[0]?.version;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(latest || ""))
      throw new Error("invalid Chrome stable response");
    const pinned = pins.chromiumVersion.split("-")[0];
    const report = {
      checkedAt: new Date().toISOString(),
      pinned,
      latest,
      updateAvailable: compareBrowserVersions(latest, pinned) > 0,
      source,
      debianSecuritySource:
        "https://security-tracker.debian.org/tracker/source-package/chromium",
    };
    await writeFile(
      path.join(directory, "upstream.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (report.updateAvailable)
      throw new Error(
        `Chrome stable ${latest} is newer than ${pinned}; review fixed Debian source and rerun final-image PDF checks before updating`,
      );
    console.log(
      `[pdf-runtime] reviewed Chromium matches Linux stable ${latest}`,
    );
    return;
  }
  throw new Error(
    "usage: pdf-runtime.mjs check-source | report DIR | upstream DIR",
  );
}
export function compareBrowserVersions(left, right) {
  if (![left, right].every((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value)))
    throw new Error("invalid browser version");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < a.length; index += 1)
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  return 0;
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main().catch((error) => {
    console.error(`[pdf-runtime] ${error.message}`);
    process.exitCode = 1;
  });
