import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function installLinuxStatShim(root) {
  const binDir = path.join(root, "test-bin");
  const statPath = path.join(binDir, "stat");
  mkdirSync(binDir, { recursive: true, mode: 0o700 });
  writeFileSync(
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
    { mode: 0o700 },
  );
  chmodSync(statPath, 0o700);
  return binDir;
}

export function envWithLinuxStat(binDir, env = process.env) {
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH ?? ""}`,
  };
}
