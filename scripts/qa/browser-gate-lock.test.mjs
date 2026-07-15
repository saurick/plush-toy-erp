import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const helper = path.join(root, "scripts/qa/browser-gate-lock.sh");

function runLockScript(lockPath, command) {
  return spawnSync("/bin/bash", ["-c", command], {
    encoding: "utf8",
    env: {
      ...process.env,
      BROWSER_GATE_LOCK_HELPER: helper,
      BROWSER_GATE_LOCK_PATH: lockPath,
    },
  });
}

function runLockScriptAsync(lockPath, command) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-c", command], {
      env: {
        ...process.env,
        BROWSER_GATE_LOCK_HELPER: helper,
        BROWSER_GATE_LOCK_PATH: lockPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function lockExists(lockPath) {
  try {
    lstatSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("browser gate lock is released by the EXIT trap of its owner", () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "plush-browser-lock-"));
  const lockPath = path.join(fixtureDir, "browser.lock");
  try {
    const result = runLockScript(
      lockPath,
      'source "$BROWSER_GATE_LOCK_HELPER"; trap browser_gate_lock_release EXIT; browser_gate_lock_acquire; test "$(readlink "$BROWSER_GATE_LOCK_PATH")" = "$$"',
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(lockExists(lockPath), false);
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

test("browser gate lock preserves and rejects an active owner", () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "plush-browser-lock-"));
  const lockPath = path.join(fixtureDir, "browser.lock");
  try {
    symlinkSync(String(process.pid), lockPath);
    const result = runLockScript(
      lockPath,
      'source "$BROWSER_GATE_LOCK_HELPER"; browser_gate_lock_acquire',
    );

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /reason=browser_gate_already_running/u);
    assert.equal(readlinkSync(lockPath), String(process.pid));
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

test("concurrent stale-lock attempts fail closed without deleting the evidence", async () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "plush-browser-lock-"));
  const lockPath = path.join(fixtureDir, "browser.lock");
  const staleOwner = "99999999";
  try {
    symlinkSync(staleOwner, lockPath);
    const command =
      'source "$BROWSER_GATE_LOCK_HELPER"; browser_gate_lock_acquire';
    const results = await Promise.all([
      runLockScriptAsync(lockPath, command),
      runLockScriptAsync(lockPath, command),
    ]);

    for (const result of results) {
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.equal(result.signal, null);
      assert.match(result.stdout, /reason=browser_gate_stale_lock/u);
    }
    assert.equal(readlinkSync(lockPath), staleOwner);
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});
