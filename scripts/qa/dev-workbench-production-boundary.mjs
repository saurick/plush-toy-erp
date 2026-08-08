#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
]);

export const productionArtifactForbiddenMarkers = Object.freeze([
  "/__dev",
  "/__dev/quality-gates",
  "dev-workbench",
  "研发效能工作台",
  "Engineering Delivery Workbench",
  "erp-dev-docs",
  "erp-dev-governance",
  "erp-dev-capability",
  "erp-dev-prototypes",
  "erp-dev-hub",
  "erp-dev-flow-state",
  "erp-dev-workspace-nav",
  "erp-dev-permission-relationships",
  "erp-dev-quality-gates",
  "质量门禁",
  "权限关系 / Effective Access",
  "favicon-dev.svg",
  "plush_erp_dev_hub",
  "customer-yoyoosun-private",
  "/Users/simon/",
]);

function listArtifactFiles(rootDir) {
  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    return entry.isDirectory()
      ? listArtifactFiles(absolutePath)
      : [absolutePath];
  });
}

export function scanProductionArtifact(buildDir) {
  const absoluteBuildDir = path.resolve(buildDir);
  const indexPath = path.join(absoluteBuildDir, "index.html");
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error(`production artifact index is missing: ${indexPath}`);
  }

  const textFiles = listArtifactFiles(absoluteBuildDir).filter((file) =>
    textExtensions.has(path.extname(file).toLowerCase()),
  );
  const violations = [];
  for (const file of textFiles) {
    const source = readFileSync(file, "utf8");
    for (const marker of productionArtifactForbiddenMarkers) {
      if (source.includes(marker)) {
        violations.push({
          file: path.relative(absoluteBuildDir, file),
          marker,
        });
      }
    }
  }
  if (violations.length > 0) {
    const detail = violations
      .map(({ file, marker }) => `${file}: ${JSON.stringify(marker)}`)
      .join("\n");
    throw new Error(
      `production artifact contains DEV/private markers:\n${detail}`,
    );
  }

  return Object.freeze({
    buildDir: absoluteBuildDir,
    filesScanned: textFiles.length,
    status: "passed",
  });
}

function parseArgs(argv) {
  let buildDir = path.resolve(import.meta.dirname, "../../web/build");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--build-dir") {
      throw new Error(`unknown argument: ${argv[index]}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--build-dir requires a path");
    }
    buildDir = path.resolve(value);
    index += 1;
  }
  return { buildDir };
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const result = scanProductionArtifact(
      parseArgs(process.argv.slice(2)).buildDir,
    );
    process.stdout.write(
      `[dev-workbench-production-boundary] status=${result.status} files=${result.filesScanned} build=${result.buildDir}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `[dev-workbench-production-boundary] ${error.message}\n`,
    );
    process.exit(1);
  }
}
