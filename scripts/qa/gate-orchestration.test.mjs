import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  isOwnedProcessGroupAlive,
  terminateOwnedProcessGroup,
} from "../../web/scripts/styleL1.mjs";

const root = path.resolve(import.meta.dirname, "../..");

function read(file) {
  return readFileSync(path.join(root, file), "utf8");
}

function cleanGateEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of [
    "SKIP_DB_GUARD",
    "SKIP_PRE_PUSH",
    "SKIP_ERROR_CODE_SYNC",
    "SKIP_ERROR_CODE_GUARD",
    "ERROR_CODE_GUARD_STAGED_ONLY",
    "SKIP_SECRETS_SCAN",
    "SECRETS_STAGED_ONLY",
    "SKIP_GOVULNCHECK",
    "SKIP_SHELLCHECK",
    "SKIP_SHFMT",
    "SKIP_YAMLLINT",
    "STRICT_SKIP_SHELLCHECK",
    "STRICT_SKIP_SHFMT",
    "STRICT_SKIP_GOVULNCHECK",
    "STYLE_L1_BASE_URL",
    "QA_GATE_COVERAGE_RECEIPT",
    "QA_GATE_ORCHESTRATOR",
  ]) {
    if (!(key in overrides)) delete env[key];
  }
  return env;
}

async function reserveDistinctPorts(count) {
  const servers = Array.from({ length: count }, () => net.createServer());
  try {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
          }),
      ),
    );
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      ),
    );
  }
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

async function waitFor(predicate, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(25);
  }
  assert.fail(message);
}

const listenerSource = String.raw`
  const net = require('node:net');
  const port = Number(process.argv[1]);
  process.on('SIGTERM', () => {});
  process.on('SIGHUP', () => {});
  net.createServer((socket) => {
    socket.on('error', () => {});
    socket.end();
  }).listen(port, '127.0.0.1');
  setInterval(() => {}, 1000);
`;

function spawnUnrelatedListener(port) {
  return spawn(process.execPath, ["-e", listenerSource, String(port)], {
    detached: true,
    stdio: "ignore",
  });
}

function spawnLeaderWithStubbornListener(port) {
  const leaderSource = String.raw`
    const { spawn } = require('node:child_process');
    const net = require('node:net');
    const port = process.argv[1];
    const source = ${JSON.stringify(listenerSource)};
    process.on('SIGTERM', () => process.exit(0));
    const child = spawn(process.execPath, ['-e', source, port], {
      detached: false,
      stdio: 'ignore',
    });
    const reportWhenReady = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
      socket.once('connect', () => {
        socket.destroy();
        process.stdout.write(String(child.pid) + '\n');
      });
      socket.once('error', () => setTimeout(reportWhenReady, 10));
    };
    reportWhenReady();
    setInterval(() => {}, 1000);
  `;
  return spawn(process.execPath, ["-e", leaderSource, String(port)], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readSpawnedPID(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            `fixture leader did not report its child PID: ${stderr.trim()}`,
          ),
        ),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (!output.includes("\n")) return;
      clearTimeout(timeout);
      const pid = Number(output.trim());
      if (!Number.isInteger(pid) || pid <= 0) {
        reject(new Error(`invalid fixture child PID: ${output.trim()}`));
        return;
      }
      resolve(pid);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (output.includes("\n")) return;
      clearTimeout(timeout);
      reject(
        new Error(
          `fixture leader exited before reporting child PID: code=${code} stderr=${stderr.trim()}`,
        ),
      );
    });
  });
}

function readProcessGroupID(pid) {
  const result = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const processGroupID = Number(result.stdout.trim());
  assert(Number.isInteger(processGroupID) && processGroupID > 0);
  return processGroupID;
}

async function killFixtureProcess(child) {
  if (!child?.pid) return;
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), delay(1000)]);
  }
  child.stderr?.destroy();
  child.unref();
}

test("full and strict reject ordinary skip environments before running gates", () => {
  for (const [script, variable] of [
    ["scripts/qa/full.sh", "SKIP_DB_GUARD"],
    ["scripts/qa/full.sh", "SKIP_ERROR_CODE_SYNC"],
    ["scripts/qa/full.sh", "SKIP_ERROR_CODE_GUARD"],
    ["scripts/qa/full.sh", "ERROR_CODE_GUARD_STAGED_ONLY"],
    ["scripts/qa/full.sh", "SKIP_SECRETS_SCAN"],
    ["scripts/qa/full.sh", "SECRETS_STAGED_ONLY"],
    ["scripts/qa/full.sh", "SKIP_GOVULNCHECK"],
    ["scripts/qa/strict.sh", "SKIP_SHELLCHECK"],
    ["scripts/qa/strict.sh", "SKIP_SHFMT"],
    ["scripts/qa/strict.sh", "SKIP_YAMLLINT"],
    ["scripts/qa/strict.sh", "STRICT_SKIP_SHELLCHECK"],
    ["scripts/qa/strict.sh", "STRICT_SKIP_SHFMT"],
    ["scripts/qa/strict.sh", "STRICT_SKIP_GOVULNCHECK"],
  ]) {
    const result = spawnSync("bash", [script], {
      cwd: root,
      encoding: "utf8",
      env: cleanGateEnv({ [variable]: "1" }),
    });
    assert.equal(result.status, 2, `${script} ${variable}: ${result.stderr}`);
    assert.match(result.stdout, /status=incomplete reason=forbidden_skip/u);
    assert.match(result.stdout, new RegExp(`variable=${variable}`, "u"));
  }
});

test("full browser evidence is current-worktree self-hosted on an isolated port", () => {
  const full = read("scripts/qa/full.sh");
  const style = read("web/scripts/styleL1.mjs");

  assert.match(full, /external_browser_target_forbidden/u);
  assert.match(full, /dev-ports\.mjs/u);
  assert.match(full, /--find-free-aux-port/u);
  assert.doesNotMatch(full, /listen\(0/u);
  assert.match(
    full,
    /source "\$ROOT_DIR\/scripts\/qa\/browser-gate-lock\.sh"/u,
  );
  assert.match(full, /trap browser_gate_lock_release EXIT/u);
  assert.match(full, /browser_gate_lock_acquire/u);
  assert.match(full, /browser_gate_lock_release/u);
  assert.match(full, /STYLE_L1_BASE_URL=""/u);
  assert.match(full, /STYLE_L1_PORT="\$browser_port"/u);
  assert.match(full, /"\$PNPM_BIN" style:l1/u);
  assert.doesNotMatch(full, /QA_BROWSER_SMOKE/u);

  assert.match(style, /target=self-host worktree=/u);
  assert.match(style, /target=external base_url=/u);
  assert.match(style, /detached:\s*true/u);
  assert.match(style, /assertPortAvailable\(devServerPort\)/u);
  assert.match(
    style,
    /assertDevServerPortOwnership\(devServerProcessGroupID\)/u,
  );
  assert.match(style, /terminateOwnedProcessGroup\(devServerProcessGroupID\)/u);
  assert.match(style, /process\.kill\(-processGroupID, signal\)/u);
  assert.match(style, /self-host ownership verified/u);
  assert.doesNotMatch(style, /killDevServerPortListeners/u);
});

test("style cleanup SIGKILLs a surviving owned group without touching an unrelated listener", async () => {
  const [ownedPort, unrelatedPort] = await reserveDistinctPorts(2);
  const ownedLeader = spawnLeaderWithStubbornListener(ownedPort);
  const ownedGrandchildPID = await readSpawnedPID(ownedLeader);
  const unrelatedListener = spawnUnrelatedListener(unrelatedPort);
  let ownedCleanupCompleted = false;

  try {
    await waitFor(
      () => canConnect(ownedPort),
      "owned grandchild listener did not start",
    );
    await waitFor(
      () => canConnect(unrelatedPort),
      "unrelated listener did not start",
    );
    assert.equal(ownedLeader.exitCode, null, "fixture leader exited before cleanup");
    assert.equal(readProcessGroupID(ownedGrandchildPID), ownedLeader.pid);
    assert.equal(isOwnedProcessGroupAlive(ownedLeader.pid), true);

    const leaderExit = once(ownedLeader, "exit");
    const cleanup = terminateOwnedProcessGroup(ownedLeader.pid, {
      termGraceMs: 500,
      killGraceMs: 1500,
      pollIntervalMs: 20,
    });
    await Promise.race([
      leaderExit,
      delay(2000).then(() => {
        throw new Error("fixture leader did not exit after SIGTERM");
      }),
    ]);
    assert.equal(ownedLeader.exitCode, 0, "fixture leader must exit cleanly on SIGTERM");
    assert.equal(
      await canConnect(ownedPort),
      true,
      "owned grandchild listener must survive the leader's SIGTERM exit",
    );

    const result = await cleanup;
    assert.equal(result.signal, "SIGKILL");
    await waitFor(
      async () => !(await canConnect(ownedPort)),
      "owned grandchild listener survived cleanup",
    );
    ownedCleanupCompleted = true;
    assert.equal(
      await canConnect(unrelatedPort),
      true,
      "cleanup killed an unrelated listener",
    );
    assert.equal(isOwnedProcessGroupAlive(unrelatedListener.pid), true);
  } finally {
    if (!ownedCleanupCompleted) {
      try {
        if (isOwnedProcessGroupAlive(ownedLeader.pid)) {
          process.kill(-ownedLeader.pid, "SIGKILL");
        }
      } catch (error) {
        if (!new Set(["EPERM", "ESRCH"]).has(error?.code)) throw error;
      }
      try {
        process.kill(ownedGrandchildPID, "SIGKILL");
      } catch (error) {
        if (!new Set(["EPERM", "ESRCH"]).has(error?.code)) throw error;
      }
    }
    await killFixtureProcess(unrelatedListener);
    ownedLeader.stdout?.destroy();
    ownedLeader.stderr?.destroy();
    ownedLeader.unref();
  }
});

test("fixed full and strict gates cannot disappear behind file or package probes", () => {
  const criticalPostgres = read("scripts/qa/critical-postgres-tests.sh");
  const full = read("scripts/qa/full.sh");
  const pdfChromiumIntegration = read(
    "server/internal/server/template_pdf_chromium_integration_test.go",
  );
  const strict = read("scripts/qa/strict.sh");
  for (const source of [full, strict]) {
    assert.doesNotMatch(source, /\[ -[fx] /u);
    assert.doesNotMatch(source, /\[\[.*-[fx] /u);
  }
  assert.match(full, /web\/package\.json 缺少 scripts\.test/u);
  assert.match(full, /"\$PNPM_BIN" test/u);
  assert.match(full, /--kind node --label web-all/u);
  assert.match(full, /--kind go --label server-all/u);
  assert.match(
    full,
    /ERP_PDF_CHROMIUM_INTEGRATION=1\s+\\\s+node "\$ROOT_DIR\/scripts\/qa\/run-test-gate\.mjs"/u,
  );
  assert.match(
    full,
    /source "\$ROOT_DIR\/scripts\/qa\/critical-postgres-tests\.sh"/u,
  );
  assert.match(
    full,
    /go test -count=1 -json -skip "\$CRITICAL_POSTGRES_TEST_PATTERN" \.\/\.\.\./u,
  );
  assert.match(full, /purchase-receipt-pg\.sh" test-critical-disposable/u);
  assert.match(criticalPostgres, /TestProductionWIPQualityInspectionPostgres/u);
  assert.match(criticalPostgres, /TestOperationalFactPostgres/u);
  assert.doesNotMatch(
    full,
    /make purchase_return_(?:pg_createdb|migrate_apply|pg_test)/u,
  );
  assert.doesNotMatch(full, /-skip '[^']*TemplatePDFChromiumSecurityIntegration/u);
  assert.match(
    pdfChromiumIntegration,
    /ERP_PDF_CHROMIUM_INTEGRATION[\s\S]*t\.Skip/u,
  );
  assert.match(
    pdfChromiumIntegration,
    /strings\.HasPrefix\(string\(pdfBytes\), "%PDF"\)/u,
  );
  assert.match(pdfChromiumIntegration, /egressHits\.Load\(\)[\s\S]*hits != 0/u);
  assert.doesNotMatch(full, /未定义 test，跳过/u);
  assert.match(strict, /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u);
  assert.match(strict, /YAMLLINT_STRICT=1 YAMLLINT_ALL=1/u);
  assert.match(strict, /scripts\/qa\/yamllint\.sh/u);
});

test("direct full rejects caller-supplied synthetic coverage before any gate", () => {
  const result = spawnSync("bash", ["scripts/qa/full.sh"], {
    cwd: root,
    encoding: "utf8",
    env: cleanGateEnv({
      QA_GATE_COVERAGE_RECEIPT: "/tmp/forged-receipt.json",
      QA_GATE_ORCHESTRATOR: "pre-push",
    }),
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /reason=forbidden_coverage/u);
  assert.doesNotMatch(result.stdout, /先运行 fast 检查/u);
});

test("local receipt has one repository-owned issuer while full and CI stay real", () => {
  const full = read("scripts/qa/full.sh");
  const strict = read("scripts/qa/strict.sh");
  const prePush = read("scripts/git-hooks/pre-push.sh");
  const preparePush = read("scripts/qa/prepare-push.sh");
  const receipt = read("scripts/qa/pre-push-receipt.mjs");
  const ci = read(".github/workflows/ci.yml");

  assert.match(full, /SECRETS_STRICT=1 bash/u);
  assert.match(full, /GOVULNCHECK_STRICT=1 bash/u);
  assert.doesNotMatch(full, /gate-coverage\.mjs|covered_by_|component_complete/u);
  assert.doesNotMatch(strict, /gate-coverage\.mjs|covered_by_|component_complete/u);
  assert.match(strict, /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u);
  assert.match(strict, /GOVULNCHECK_STRICT=1/u);
  assert.match(strict, /status=complete/u);
  assert.doesNotMatch(
    `${full}\n${strict}\n${ci}`,
    /pre-push-receipt|PRE_PUSH_RECEIPT/u,
  );

  assert.match(preparePush, /pre-push-receipt\.mjs" prepare/u);
  assert.match(prePush, /args=\(verify-hook --remote "\$remote_name"\)/u);
  assert.doesNotMatch(prePush, /full\.sh|SKIP_PRE_PUSH/u);
  assert.match(receipt, /PRE_PUSH_RECEIPT_TTL_MS = 30 \* 60 \* 1000/u);
  assert.match(receipt, /rev-parse", "--git-common-dir"/u);
  assert.match(receipt, /createHmac\("sha256"/u);
  assert.match(receipt, /acquireReceiptLock/u);
  assert.match(receipt, /renameSync\(temporary, target\)/u);
  assert.match(receipt, /readFileSync\(0, "utf8"\)/u);
  assert.match(receipt, /git", \["log", "--check", "--format=", ref\.range\]/u);
  assert.match(receipt, /SECRETS_STRICT: "1"/u);
  assert.doesNotMatch(receipt, /process\.env\.PRE_PUSH_RECEIPT_/u);
  assert.doesNotMatch(strict, /SKIP_GOVULNCHECK=1/u);
});

test("fixed Node and Go gates require fail-closed execution summaries", () => {
  const criticalPostgres = read("scripts/qa/critical-postgres-tests.sh");
  const fast = read("scripts/qa/fast.sh");
  const full = read("scripts/qa/full.sh");

  assert.match(fast, /run-node-tests\.mjs/u);
  assert.match(fast, /--kind node --label customer-index/u);
  assert.match(fast, /--kind node --label web-contracts/u);
  assert.match(fast, /--kind go --label server-quick/u);
  assert.match(
    fast,
    /go test -count=1 -json\s+\\\s+-skip "\$\{CRITICAL_POSTGRES_TEST_PATTERN\}\|\^TestTemplatePDFChromiumSecurityIntegration\$"\s+\\\s+\.\/internal\/\.\.\. \.\/pkg\/\.\.\./u,
  );
  assert.match(full, /--kind node --label web-all/u);
  assert.match(full, /"\$PNPM_BIN" test --test-reporter=tap/u);
  assert.match(full, /--kind go --label server-all/u);
  assert.match(
    full,
    /go test -count=1 -json -skip "\$CRITICAL_POSTGRES_TEST_PATTERN" \.\/\.\.\./u,
  );
  assert.match(full, /purchase-receipt-pg\.sh" test-critical-disposable/u);
  assert.match(full, /ERP_PDF_CHROMIUM_INTEGRATION=1/u);
  assert.match(
    criticalPostgres,
    /readonly CRITICAL_POSTGRES_TEST_PATTERN/u,
  );
  assert.match(
    criticalPostgres,
    /readonly -a CRITICAL_POSTGRES_REQUIRED_PREFIXES/u,
  );
});
