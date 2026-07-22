import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/cutover-public-web.sh",
);
const release = "be09bdee911ab54280265988cad124b2251e15b4";

test("public web cutover uses HTTP health when the image has no Docker healthcheck", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-web-cutover-"));
  const binDir = path.join(root, "bin");
  const dockerLog = path.join(root, "docker.log");
  fs.mkdirSync(binDir);

  fs.writeFileSync(
    path.join(binDir, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ "$1 $2" == "image inspect" && "$3" == "--format" ]]; then
  printf 'GIT_SHA=${release}\\n'
elif [[ "$1" == "ps" ]]; then
  :
elif [[ "$1" == "run" ]]; then
  printf 'fake-container-id\\n'
fi
`,
    "utf8",
  );
  fs.chmodSync(path.join(binDir, "docker"), 0o755);

  fs.writeFileSync(
    path.join(binDir, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
url="\${@: -1}"
if [[ "$url" == */healthz ]]; then
  printf '200'
else
  printf '%s\\n' '{"result":{"code":0,"data":{"sms_login":{"enabled":true,"mode":"provider","mock_delivery":false}}}}'
fi
`,
    "utf8",
  );
  fs.chmodSync(path.join(binDir, "curl"), 0o755);

  const current = "plush-toy-erp-web-old";
  const result = spawnSync(
    "bash",
    [
      scriptPath,
      "--image",
      "plush-toy-erp-web:yoyoosun-immutable",
      "--release",
      release,
      "--current-container",
      current,
      "--endpoint",
      "https://admin.yoyoosun.net",
      "--execute",
      "--confirm",
      `PUBLIC_WEB_CUTOVER:${current}:${release}`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        FAKE_DOCKER_LOG: dockerLog,
      },
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /passed .*provider=true/);
  const dockerCalls = fs.readFileSync(dockerLog, "utf8");
  assert.doesNotMatch(dockerCalls, /State\.Health\.Status/);
  assert.match(dockerCalls, /127\.0\.0\.1:15175:5175/);
  assert.match(dockerCalls, /0\.0\.0\.0:5175:5175/);
});
