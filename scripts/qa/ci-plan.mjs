#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildAffectedPlan, collectChangedFiles } from "./affected.mjs";

const MODES = new Set(["affected", "full"]);
const SCHEMA_OR_MIGRATION_PATH =
  /^(?:server\/internal\/data\/model\/(?:schema|ent|migrate)\/|server\/atlas\.hcl$)/u;

function commandText(command) {
  return [command.bin, ...(command.args || [])].join(" ");
}

export function buildCIPlan({ files, mode, root = process.cwd() }) {
  if (!MODES.has(mode)) throw new Error("mode must be affected or full");
  const affected = buildAffectedPlan(files, { root });
  const commandTexts = affected.commands.map(commandText);
  const full = mode === "full" || affected.localGate === "full";
  const changedWeb = affected.changedFiles.some((file) => file.startsWith("web/"));
  const changedServer = affected.changedFiles.some((file) => file.startsWith("server/"));
  const workflowContractNeedsGo = commandTexts.some((value) =>
    /(?:ci|release)-workflow\.test\.mjs/u.test(value),
  );
  const needsGo =
    full ||
    changedServer ||
    workflowContractNeedsGo ||
    affected.commands.some((command) => ["go", "make"].includes(command.bin));
  const needsWeb =
    full ||
    changedWeb ||
    affected.commands.some((command) => command.bin === "pnpm");
  const makeData =
    full || affected.changedFiles.some((file) => SCHEMA_OR_MIGRATION_PATH.test(file));
  const needsAtlas =
    full ||
    makeData ||
    affected.commands.some((command) => command.id === "db-guard");
  const needsPostgres =
    full ||
    affected.commands.some((command) =>
      /(?:critical-pg|postgres|populated-upgrade)/u.test(command.id),
    );
  return Object.freeze({
    schemaVersion: "plush.ci-plan/v2",
    requestedMode: mode,
    effectiveMode: full ? "full" : "affected",
    changedFiles: affected.changedFiles,
    affectedScopes: affected.affectedScopes,
    maxAffectedScope: affected.maxAffectedScope,
    localGate: affected.localGate,
    flags: Object.freeze({
      full,
      makeData,
      needsAtlas,
      needsChromium: full,
      needsGo,
      needsPostgres,
      needsSystemTools: full,
      needsWeb,
      sourceArchive: full,
    }),
    affected,
  });
}

function parseArgs(argv) {
  const options = { mode: "", range: "", githubOutput: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const mapping = {
      "--mode": "mode",
      "--range": "range",
      "--github-output": "githubOutput",
      "--out": "out",
    };
    if (mapping[arg]) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[mapping[arg]] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.range) throw new Error("--range is required");
  if (!MODES.has(options.mode)) throw new Error("--mode must be affected or full");
  return options;
}

function writeGitHubOutputs(file, plan) {
  const entries = {
    effective_mode: plan.effectiveMode,
    ...Object.fromEntries(
      Object.entries(plan.flags).map(([key, value]) => [
        key.replace(/[A-Z]/gu, (match) => `_${match.toLowerCase()}`),
        String(value),
      ]),
    ),
  };
  writeFileSync(
    file,
    `${Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { flag: "a" },
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(import.meta.dirname, "../..");
  const files = collectChangedFiles({ root, base: options.range });
  const plan = buildCIPlan({ files, mode: options.mode, root });
  if (options.out) {
    const output = path.resolve(root, options.out);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (options.githubOutput) writeGitHubOutputs(options.githubOutput, plan);
  console.log(JSON.stringify(plan, null, 2));
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[ci-plan] status=blocked reason=${error.message}`);
    process.exitCode = 2;
  }
}
