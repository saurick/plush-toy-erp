import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function writeExecutable(filePath, source) {
  writeFileSync(filePath, source, { mode: 0o700 });
  chmodSync(filePath, 0o700);
}

export function installLinuxStatShim(root) {
  const binDir = path.join(root, "test-bin");
  const statPath = path.join(binDir, "stat");
  mkdirSync(binDir, { recursive: true, mode: 0o700 });
  writeExecutable(
    statPath,
    `#!${process.execPath}
const { statSync } = require("node:fs");

const [flag, format, ...files] = process.argv.slice(2);
if (flag !== "-c" || files.length === 0) process.exit(2);
for (const file of files) {
  const stat = statSync(file);
  if (format === "%u") console.log(stat.uid);
  else if (format === "%a") console.log((stat.mode & 0o7777).toString(8));
  else if (format === "%s") console.log(stat.size);
  else process.exit(2);
}
`,
  );
  return binDir;
}

export function installTargetReleaseCacheCommandShims(root) {
  const binDir = installLinuxStatShim(root);
  const nodeShebang = `#!${process.execPath}\n`;

  writeExecutable(
    path.join(binDir, "readlink"),
    `${nodeShebang}const { realpathSync } = require("node:fs");

const [flag, separator, candidate, ...rest] = process.argv.slice(2);
if (flag !== "-f" || separator !== "--" || !candidate || rest.length !== 0) {
  process.exit(2);
}
console.log(realpathSync(candidate));
`,
  );
  writeExecutable(
    path.join(binDir, "find"),
    `${nodeShebang}const { readdirSync } = require("node:fs");
const path = require("node:path");

const [directory, minDepthFlag, minDepth, maxDepthFlag, maxDepth, action, format, ...rest] = process.argv.slice(2);
const filenameFormat = "%f" + String.fromCharCode(92) + "n";
if (
  !directory ||
  minDepthFlag !== "-mindepth" ||
  minDepth !== "1" ||
  maxDepthFlag !== "-maxdepth" ||
  maxDepth !== "1" ||
  !["-print", "-printf"].includes(action)
) {
  process.exit(2);
}
const quit = action === "-print" && format === "-quit" && rest.length === 0;
if (
  (action === "-printf" && (![filenameFormat, "."].includes(format) || rest.length !== 0)) ||
  (action === "-print" && !quit && (format !== undefined || rest.length !== 0))
) {
  process.exit(2);
}
for (const name of readdirSync(directory)) {
  if (action === "-printf" && format === ".") process.stdout.write(".");
  else console.log(action === "-printf" ? name : path.join(directory, name));
  if (quit) break;
}
`,
  );
  writeExecutable(
    path.join(binDir, "sha256sum"),
    `${nodeShebang}const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const files = process.argv.slice(2);
if (files.some((file) => file.startsWith("-"))) process.exit(2);
const inputs = files.length > 0 ? files : [null];
for (const file of inputs) {
  const content = readFileSync(file === null ? 0 : file);
  const digest = createHash("sha256").update(content).digest("hex");
  console.log(digest + "  " + (file ?? "-"));
}
`,
  );
  writeExecutable(
    path.join(binDir, "docker"),
    `${nodeShebang}process.exit(1);\n`,
  );

  return binDir;
}

export function envWithLinuxCommandShims(binDir, env = process.env) {
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH ?? ""}`,
  };
}

export function envWithLinuxStat(binDir, env = process.env) {
  return envWithLinuxCommandShims(binDir, env);
}
