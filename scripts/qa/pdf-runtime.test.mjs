import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
const runtimeScript = await readFile(
  new URL("./pdf-runtime.sh", import.meta.url),
  "utf8",
);
const trivyScript = await readFile(
  new URL("./pdf-runtime-trivy.sh", import.meta.url),
  "utf8",
);
const pins = readRuntimePins(source);

function trivyCacheFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "plush-trivy-cache-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ["bin", "package", "report", "scripts/qa"])
    mkdirSync(path.join(root, name), { recursive: true });
  const executable = (relative, text) => {
    const file = path.join(root, relative);
    writeFileSync(file, `#!${process.execPath}\n${text}\n`);
    chmodSync(file, 0o700);
  };
  executable(
    "package/trivy",
    `
const fs=require('node:fs');const path=require('node:path');const a=process.argv.slice(2);
const root=process.env.TRIVY_FIXTURE_ROOT;const cache=a[a.indexOf('--cache-dir')+1];
fs.appendFileSync(root+'/scans.jsonl',JSON.stringify(a)+'\\n');
if(process.env.TRIVY_FIXTURE_DB_FAILURE==='1'){console.error('database update unavailable');process.exit(23);}
fs.mkdirSync(cache+'/db',{recursive:true});fs.writeFileSync(cache+'/db/metadata.json',JSON.stringify({NextUpdate:'2026-10-15T00:00:00Z'}));
fs.writeFileSync(a[a.indexOf('--output')+1],JSON.stringify({SchemaVersion:2,Metadata:{ImageID:a.at(-1)},Results:[]}));
`,
  );
  const archive = path.join(root, "approved.tar.gz");
  execFileSync("tar", [
    "-czf",
    archive,
    "-C",
    path.join(root, "package"),
    "trivy",
  ]);
  const checksum = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  writeFileSync(
    path.join(root, "scripts/qa/pdf-runtime-policy.json"),
    JSON.stringify({
      trivyVersion: "9.9.9",
      trivyLinuxAMD64ArchiveSHA256: checksum,
    }),
  );
  executable(
    "bin/curl",
    `
const fs=require('node:fs');const a=process.argv.slice(2);const root=process.env.TRIVY_FIXTURE_ROOT;
if(!a.includes('https://github.com/aquasecurity/trivy/releases/download/v9.9.9/trivy_9.9.9_Linux-64bit.tar.gz'))process.exit(2);
fs.appendFileSync(root+'/downloads.txt','download\\n');
if(process.env.TRIVY_FIXTURE_BAD_DOWNLOAD==='1')fs.writeFileSync(a[a.indexOf('--output')+1],'untrusted bytes');
else fs.copyFileSync(root+'/approved.tar.gz',a[a.indexOf('--output')+1]);
`,
  );
  executable(
    "bin/sha256sum",
    `const fs=require('node:fs');const crypto=require('node:crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex')+'  '+process.argv[2]);`,
  );
  return {
    root,
    archive: path.join(
      root,
      "output/cache/pdf-runtime/trivy-9.9.9/trivy.tar.gz",
    ),
    run(image = "a".repeat(64), env = {}) {
      return spawnSync(
        "bash",
        [
          "-c",
          'set -euo pipefail; source "$1"; scan_pdf_runtime_image "$2" "$3" "$2/report"',
          "trivy-fixture",
          new URL("./pdf-runtime-trivy.sh", import.meta.url).pathname,
          root,
          `sha256:${image}`,
        ],
        {
          env: {
            ...process.env,
            PATH: `${root}/bin:${process.env.PATH}`,
            TRIVY_FIXTURE_ROOT: root,
            ...env,
          },
          encoding: "utf8",
          timeout: 20_000,
        },
      );
    },
  };
}

test("Trivy cold and warm caches reuse only verified downloads and scan every exact image", (t) => {
  const f = trivyCacheFixture(t);
  let r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /trivy-tool-cache=miss trivy-db-cache=missing/u);
  writeFileSync(
    path.join(f.root, "output/cache/pdf-runtime/trivy-9.9.9/trivy"),
    "untrusted executable",
  );
  r = f.run("b".repeat(64));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /trivy-tool-cache=hit trivy-db-cache=present/u);
  assert.equal(
    readFileSync(path.join(f.root, "downloads.txt"), "utf8").trim(),
    "download",
  );
  const scans = readFileSync(path.join(f.root, "scans.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    scans.map((args) => args.at(-1)),
    [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`],
  );
  for (const args of scans) {
    assert(args.includes("--list-all-pkgs"));
    assert(args.includes("vuln"));
    assert.equal(args[args.indexOf("--cache-backend") + 1], "memory");
    assert(
      !args.some((arg) => /skip-db-update|offline-scan|skip-scan/u.test(arg)),
    );
  }
  assert.equal(
    JSON.parse(readFileSync(path.join(f.root, "report/vulnerabilities.json")))
      .Metadata.ImageID,
    `sha256:${"b".repeat(64)}`,
  );
});

test("corrupt cached Trivy archives are replaced by a checksum-verified download", (t) => {
  const f = trivyCacheFixture(t);
  assert.equal(f.run().status, 0);
  writeFileSync(f.archive, "corrupt cache");
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /trivy-tool-cache=miss/u);
  assert.equal(
    readFileSync(path.join(f.root, "downloads.txt"), "utf8").trim().split("\n")
      .length,
    2,
  );
  assert.deepEqual(
    readFileSync(f.archive),
    readFileSync(path.join(f.root, "approved.tar.gz")),
  );
});

test("an unverified download cannot become a cached executable or a successful report", (t) => {
  const f = trivyCacheFixture(t);
  const r = f.run(undefined, { TRIVY_FIXTURE_BAD_DOWNLOAD: "1" });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(f.archive), false);
  assert.equal(existsSync(path.join(f.root, "scans.jsonl")), false);
  assert.equal(
    existsSync(path.join(f.root, "report/vulnerabilities.json")),
    false,
  );
});

test("a warm database update failure never reuses an earlier scan as success", (t) => {
  const f = trivyCacheFixture(t);
  assert.equal(f.run().status, 0);
  const report = readFileSync(
    path.join(f.root, "report/vulnerabilities.json"),
    "utf8",
  );
  const r = f.run("b".repeat(64), { TRIVY_FIXTURE_DB_FAILURE: "1" });
  assert.equal(r.status, 23);
  assert.match(r.stderr, /database update unavailable/u);
  assert.equal(
    readFileSync(path.join(f.root, "report/vulnerabilities.json"), "utf8"),
    report,
  );
  assert.deepEqual(readdirSync(path.join(f.root, "report")), [
    "vulnerabilities.json",
  ]);
});

test("symlinked cache contents cannot redirect extraction or scanning", (t) => {
  const f = trivyCacheFixture(t);
  assert.equal(f.run().status, 0);
  const outside = path.join(f.root, "outside.txt");
  writeFileSync(outside, "preserve");
  const tool = path.join(f.root, "output/cache/pdf-runtime/trivy-9.9.9/trivy");
  rmSync(tool);
  symlinkSync(outside, tool);
  assert.notEqual(f.run().status, 0);
  assert.equal(readFileSync(outside, "utf8"), "preserve");
  assert.equal(
    readFileSync(path.join(f.root, "scans.jsonl"), "utf8").trim().split("\n")
      .length,
    1,
  );
});

test("replacing a cached Trivy binary leaves hardlinked external files intact", (t) => {
  const f = trivyCacheFixture(t);
  assert.equal(f.run().status, 0);
  const outside = path.join(f.root, "outside.txt");
  writeFileSync(outside, "preserve");
  const tool = path.join(path.dirname(f.archive), "trivy");
  rmSync(tool);
  linkSync(outside, tool);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(outside, "utf8"), "preserve");
});
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

test("Trivy keeps the official database and a proxy-tolerant transfer contract", () => {
  assert.match(
    trivyScript,
    /curl --fail --location --retry 2 --connect-timeout 15 --max-time 900[\s\S]+GODEBUG=http2client=0 "\$tool_dir\/trivy" image[\s\S]+--db-repository public[.]ecr[.]aws\/aquasecurity\/trivy-db:2[\s\S]+--db-repository ghcr[.]io\/aquasecurity\/trivy-db:2[\s\S]+--timeout 30m --parallel 2/u,
  );
  assert.match(
    runtimeScript,
    /source "\$ROOT_DIR\/scripts\/qa\/pdf-runtime-trivy[.]sh"[\s\S]+scan_pdf_runtime_image "\$ROOT_DIR" "\$IMAGE_ID" "\$OUTPUT"/u,
  );
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

test("runtime upgrades inherited packages from the pinned snapshot before installing Chromium", () => {
  const runtime = source.split(" AS server-runtime\n")[1];
  assert.ok(runtime);
  assert.match(
    runtime,
    /https:\/\/snapshot[.]debian[.]org\/archive\/debian-security\/\$\{DEBIAN_SNAPSHOT\}[\s\S]+?apt-get[^\n]+ update && \\\n\s+DEBIAN_FRONTEND=noninteractive apt-get[^\n]+ upgrade -y --no-install-recommends && \\\n\s+DEBIAN_FRONTEND=noninteractive apt-get[^\n]+ install/u,
  );
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
