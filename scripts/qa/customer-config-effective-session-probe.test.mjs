import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  buildEffectiveSessionProbeReport,
  normalizeBackendURL,
  parseArgs,
} from "./customer-config-effective-session-probe.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.resolve(
  import.meta.dirname,
  "customer-config-effective-session-probe.mjs",
);

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("effective session probe records no-auth boundary without proving active revision", async () => {
  const calls = [];
  const report = await buildEffectiveSessionProbeReport(
    {
      backendURL: "http://127.0.0.1:8300",
      customer: "yoyoosun",
    },
    {
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        if (String(url).endsWith("/healthz")) {
          return jsonResponse(200, {});
        }
        assert.equal(options.headers.Authorization, undefined);
        return jsonResponse(200, {
          result: {
            code: 40302,
            message: "未登录",
            data: null,
          },
        });
      },
    },
  );

  assert.equal(report.scope, "customer-config-effective-session-local-probe");
  assert.equal(report.readOnly, true);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.callsJSONRPC, true);
  assert.equal(report.usesAuthorizationHeader, false);
  assert.equal(report.readsSecrets, false);
  assert.equal(report.health.ok, true);
  assert.equal(report.effectiveSessionProbe.status, "auth_required");
  assert.equal(report.effectiveSessionProbe.unauthenticated, true);
  assert.equal(report.activeRevisionVerified, false);
  assert(report.blockers.includes("missing-authenticated-admin-session"));
  assert.equal(calls.length, 2);
});

test("effective session probe rejects backend URLs and report paths with secrets or evidence targets", () => {
  assert.equal(
    normalizeBackendURL("http://127.0.0.1:8300/"),
    "http://127.0.0.1:8300",
  );
  assert.throws(
    () => normalizeBackendURL("http://user:secret@127.0.0.1:8300"),
    /must not contain username or password/,
  );
  assert.throws(
    () =>
      parseArgs([
        "--report",
        "deployments/yoyoosun/evidence/releases/2026-06-29/effective-session.json",
      ]),
    /must not be inside deployments evidence/,
  );
});

test("effective session probe help and report output stay no-write", () => {
  const help = spawnSync(process.execPath, [scriptPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--report output\/customers\/yoyoosun\/customer-config-effective-session-probe\/current\.json/);
  assert.match(help.stdout, /不读取 token/);

  const reportPath = path.join(
    repoRoot,
    "output/customers/yoyoosun/customer-config-effective-session-probe/test.json",
  );
  rmSync(reportPath, { force: true });

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--backend-url",
      "http://127.0.0.1:1",
      "--json",
      "--report",
      "output/customers/yoyoosun/customer-config-effective-session-probe/test.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /report written: output\/customers\/yoyoosun\/customer-config-effective-session-probe\/test\.json/,
  );
  assert.equal(report.writesReport, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.usesAuthorizationHeader, false);
  assert.equal(report.activeRevisionVerified, false);

  rmSync(reportPath, { force: true });
});
