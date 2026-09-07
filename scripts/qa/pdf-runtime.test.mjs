import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareBrowserVersions,
  inspectRuntime,
  policy,
  readRuntimePins,
} from "./pdf-runtime.mjs";
import { verifyBusinessPDF } from "./pdf-runtime-pdfs.mjs";

const source = await readFile(
  new URL("../../server/Dockerfile", import.meta.url),
  "utf8",
);
const pins = readRuntimePins(source);
const image = [
  {
    Id: `sha256:${"a".repeat(64)}`,
    Os: "linux",
    Architecture: "amd64",
    Size: policy.baselineImageBytes,
    Config: {
      User: "app",
      Env: [
        "HOME=/home/app",
        `CHROMIUM_DEBIAN_SNAPSHOT=${pins.debianSnapshot}`,
        `PDF_RUNTIME_BASE_IMAGE=${pins.baseImage}`,
      ],
    },
  },
];
const packages = `chromium\t${pins.chromiumVersion}\nchromium-common\t${pins.chromiumVersion}\nlibc6:amd64\t2.36-9+deb12u13\n`;
const banner = `Chromium ${pins.chromiumVersion.split("-")[0]} built on Debian GNU/Linux 12`;
const cleanScan = {
  SchemaVersion: 2,
  Metadata: { OS: { Family: "debian" } },
  Results: [
    {
      Class: "os-pkgs",
      Type: "debian",
      Target: "image",
      Packages: ["chromium", "chromium-common"].map((Name) => ({
        Name,
        Epoch: 0,
        Version: pins.chromiumVersion.split("-")[0],
        Release: pins.chromiumVersion.split("-").slice(1).join("-"),
      })),
    },
  ],
};

test("PDF runtime keeps repeatable source pins while comparing numeric upstream versions", () => {
  for (const changed of [
    source.replace(
      /debian:bookworm-slim@sha256:[a-f0-9]{64}/,
      "debian:bookworm-slim",
    ),
    source.replace(/^ARG CHROMIUM_VERSION=.+/m, "ARG CHROMIUM_VERSION=latest"),
    source.replace(/^ARG DEBIAN_SNAPSHOT=.+/m, "ARG DEBIAN_SNAPSHOT=latest"),
  ])
    assert.throws(() => readRuntimePins(changed), /must pin/);
  assert.equal(compareBrowserVersions("152.0.7977.100", "152.0.7977.82"), 1);
  assert.equal(compareBrowserVersions("152.0.7977.9", "152.0.7977.82"), -1);
  assert.equal(compareBrowserVersions("152.0.7977.82", "152.0.7977.82"), 0);
});

test("actual image packages, executable, user and bytes determine acceptance", () => {
  assert.equal(
    inspectRuntime(image, packages, banner, cleanScan, pins).status,
    "passed",
  );
  const wrong = structuredClone(image);
  wrong[0].Config.User = "root";
  wrong[0].Size = policy.maximumImageBytes + 1;
  const result = inspectRuntime(
    wrong,
    packages.replace("chromium\t", "missing\t"),
    "Chromium 1",
    cleanScan,
    pins,
  );
  assert(result.errors.some((error) => error.includes("app")));
  assert(result.errors.some((error) => error.includes("chromium")));
  assert(result.errors.some((error) => error.includes("exceeds")));
});

test("image security retains unresolved findings and rejects available high severity fixes", () => {
  const scan = structuredClone(cleanScan);
  scan.Results[0].Vulnerabilities = [
    {
      VulnerabilityID: "CVE-EXAMPLE",
      PkgName: "libc6",
      InstalledVersion: "old",
      Severity: "HIGH",
      FixedVersion: "",
    },
  ];
  assert.equal(
    inspectRuntime(image, packages, banner, scan, pins).findings.length,
    1,
  );
  assert.equal(
    inspectRuntime(image, packages, banner, scan, pins).status,
    "passed",
  );
  scan.Results[0].Vulnerabilities[0].FixedVersion = "new";
  assert.equal(
    inspectRuntime(image, packages, banner, scan, pins).status,
    "failed",
  );
  const applicationScan = structuredClone(cleanScan);
  applicationScan.Results.push({
    Class: "lang-pkgs",
    Type: "gobinary",
    Target: "app/server",
    Vulnerabilities: scan.Results[0].Vulnerabilities,
  });
  const applicationResult = inspectRuntime(
    image,
    packages,
    banner,
    applicationScan,
    pins,
  );
  assert.equal(applicationResult.status, "passed");
  assert.equal(
    applicationResult.blockingVulnerabilityScope,
    "debian-os-packages",
  );
  assert.equal(applicationResult.applicationPackageFindingCount, 1);
  assert.equal(applicationResult.findings[0].fixed, "new");
  assert.equal(
    inspectRuntime(
      image,
      packages,
      banner,
      { SchemaVersion: 2, Results: [] },
      pins,
    ).status,
    "failed",
  );
  for (const invalidScan of [
    { ...cleanScan, Results: {} },
    { ...cleanScan, Metadata: { OS: { Family: "alpine" } } },
    { ...cleanScan, Results: [{ ...cleanScan.Results[0], Packages: [] }] },
    {
      ...cleanScan,
      Results: [
        {
          ...cleanScan.Results[0],
          Packages: cleanScan.Results[0].Packages.map((entry) => ({
            ...entry,
            Release: "wrong",
          })),
        },
      ],
    },
    {
      ...cleanScan,
      Results: [
        {
          ...cleanScan.Results[0],
          Packages: cleanScan.Results[0].Packages.map((entry) => ({
            ...entry,
            Version: "1.0",
          })),
        },
      ],
    },
  ])
    assert.equal(
      inspectRuntime(image, packages, banner, invalidScan, pins).status,
      "failed",
      "missing or unrelated OS inventory must not be accepted as a clean scan",
    );
});

test("business PDF evidence rejects missing Chinese fonts, paper changes and leaked editor hints", () => {
  const info =
    "Pages: 1\nPage size: 595.28 x 841.89 pts (A4)\nJavaScript: no\n";
  const fonts =
    "name type encoding emb sub uni object ID\n---------------------------------------\nNotoSerifSC-Regular Type 3 Custom yes yes yes 12 0\n";
  const text = "合同订单供应商采购材料货款结算方式交货日期采购经办人";
  assert.equal(verifyBusinessPDF(info, fonts, text).pages, 1);
  assert.throws(
    () =>
      verifyBusinessPDF(info, fonts.replace("yes yes yes", "no yes yes"), text),
    /embedded/,
  );
  assert.throws(
    () => verifyBusinessPDF(info.replace("(A4)", "(Letter)"), fonts, text),
    /A4/,
  );
  assert.throws(
    () => verifyBusinessPDF(info, fonts, `${text}点击填写`),
    /hints/,
  );
  assert.throws(() => verifyBusinessPDF(info, fonts, "missing"), /Chinese/);
});
