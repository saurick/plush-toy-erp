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
const currentRelease = "a".repeat(40);

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
elif [[ "$1" == "inspect" && "$2" == "--format" ]]; then
  printf 'GIT_SHA=%s\\n' "$FAKE_CURRENT_RELEASE"
elif [[ "$1" == "inspect" && "$2" == "plush-toy-erp-web-old" ]]; then
  :
elif [[ "$1" == "inspect" ]]; then
  exit 1
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
  const args = [
    scriptPath,
    "--image",
    "plush-toy-erp-web:yoyoosun-immutable",
    "--release",
    release,
    "--current-container",
    current,
    "--endpoint",
    "https://demo.yoyoosun.net",
    "--api-origin",
    "http://app-server:8300",
    "--network",
    "plush-toy-erp-demo-v1_default",
    "--container-prefix",
    "plush-toy-erp-demo-web-public-",
    "--host-port",
    "5176",
    "--candidate-port",
    "15176",
    "--execute",
    "--confirm",
    `PUBLIC_WEB_CUTOVER:${current}:${release}`,
  ];
  const result = spawnSync("bash", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_CURRENT_RELEASE: currentRelease,
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /passed .*provider=true/);
  const dockerCalls = fs.readFileSync(dockerLog, "utf8");
  assert.doesNotMatch(dockerCalls, /State\.Health\.Status/);
  assert.match(dockerCalls, /127\.0\.0\.1:15176:5175/);
  assert.match(dockerCalls, /0\.0\.0\.0:5176:5175/);
  assert.match(
    dockerCalls,
    /update --restart=no plush-toy-erp-web-old[\s\S]*stop plush-toy-erp-web-old/u,
  );
  assert.equal(
    dockerCalls.match(/API_ORIGIN=http:\/\/app-server:8300/g)?.length,
    2,
  );
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /curl\s+-k/u);
  assert.match(
    source,
    /rollback_old\(\) \{[\s\S]*docker update --restart=always "\$current_container"[\s\S]*docker start "\$current_container"/u,
  );

  fs.writeFileSync(dockerLog, "", "utf8");
  const reused = spawnSync("bash", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_CURRENT_RELEASE: release,
    },
  });
  assert.equal(reused.status, 0, `${reused.stdout}\n${reused.stderr}`);
  assert.match(reused.stdout, /reused=true/u);
  assert.doesNotMatch(fs.readFileSync(dockerLog, "utf8"), /run -d|stop /u);
});

test("public web cutover rejects admin because it is not a deployment environment", () => {
  const result = spawnSync(
    "bash",
    [
      scriptPath,
      "--image",
      "plush-toy-erp-web:yoyoosun-immutable",
      "--release",
      release,
      "--current-container",
      "plush-toy-erp-web-old",
      "--endpoint",
      "https://admin.yoyoosun.net",
      "--api-origin",
      "http://app-server:8300",
      "--network",
      "plush-toy-erp-demo-v1_default",
      "--container-prefix",
      "plush-toy-erp-demo-web-public-",
      "--host-port",
      "5176",
      "--candidate-port",
      "15176",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /admin 不是部署环境/u);
});

test("public web cutover can create one first entry without inventing an old environment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-web-initialize-"));
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
elif [[ "$1" == "inspect" && "$2" == "plush-toy-erp-demo-v1_default" ]]; then
  :
elif [[ "$1" == "inspect" ]]; then
  exit 1
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

  const result = spawnSync(
    "bash",
    [
      scriptPath,
      "--image",
      "plush-toy-erp-web:yoyoosun-immutable",
      "--release",
      release,
      "--current-container",
      "none",
      "--endpoint",
      "https://demo.yoyoosun.net",
      "--api-origin",
      "http://app-server:8300",
      "--network",
      "plush-toy-erp-demo-v1_default",
      "--container-prefix",
      "plush-toy-erp-demo-web-public-",
      "--host-port",
      "5176",
      "--candidate-port",
      "15176",
      "--execute",
      "--confirm",
      `PUBLIC_WEB_CUTOVER:none:${release}`,
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
  assert.match(result.stdout, /rollback=none .*reused=false/u);
  const dockerCalls = fs.readFileSync(dockerLog, "utf8");
  assert.doesNotMatch(dockerCalls, /update --restart=no none|stop none/u);
  assert.match(dockerCalls, /0\.0\.0\.0:5176:5175/u);
});
