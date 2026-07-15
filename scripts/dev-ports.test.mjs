import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findAvailableDevAuxPort,
  loadDevPorts,
  resolveDevAuxPort,
  validateDevAuxPort,
} from "./dev-ports.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.resolve(import.meta.dirname, "dev-ports.mjs");

test("tracked manifest defines the plush local development bundle", () => {
  const ports = loadDevPorts(repoRoot, {});
  assert.deepEqual(
    {
      projectId: ports.projectId,
      web: ports.web,
      http: ports.http,
      grpc: ports.grpc,
      style: ports.style,
      auxStart: ports.auxStart,
    },
    {
      projectId: "plush-toy-erp",
      web: 5175,
      http: 8300,
      grpc: 9300,
      style: 6175,
      auxStart: 15200,
    },
  );
});

test("local override must replace the complete port bundle", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-dev-ports-"));
  try {
    mkdirSync(path.join(root, "config"));
    writeFileSync(
      path.join(root, "config", "dev-ports.env"),
      [
        "DEV_PROJECT_ID=example",
        "DEV_WEB_PORT=5100",
        "DEV_HTTP_PORT=8100",
        "DEV_GRPC_PORT=9100",
        "DEV_STYLE_PORT=6100",
        "DEV_AUX_PORT_START=15200",
        "",
      ].join("\n"),
    );
    writeFileSync(
      path.join(root, "config", "dev-ports.local.env"),
      "DEV_WEB_PORT=5101\n",
    );
    assert.throws(() => loadDevPorts(root, {}), /complete port bundle/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest rejects overlapping ports inside one project bundle", () => {
  assert.throws(
    () => loadDevPorts(repoRoot, { DEV_HTTP_PORT: "5175" }),
    /DEV_HTTP_PORT.*overlaps DEV_WEB_PORT/u,
  );
  assert.throws(
    () => loadDevPorts(repoRoot, { DEV_WEB_PORT: "15250" }),
    /DEV_AUX_PORT_START.*overlaps DEV_WEB_PORT/u,
  );
});

test("auxiliary consumers stay inside the project-owned 100-port block", () => {
  const ports = loadDevPorts(repoRoot, {});
  assert.equal(resolveDevAuxPort(ports, 30), 15230);
  assert.equal(validateDevAuxPort(ports, "15299"), 15299);
  assert.throws(
    () => resolveDevAuxPort(ports, 100),
    /integer between 0 and 99/u,
  );
  assert.throws(
    () => validateDevAuxPort(ports, "15300"),
    /inside 15200-15299/u,
  );
});

test("auxiliary port discovery scans only inside the owned block", async () => {
  const ports = loadDevPorts(repoRoot, {});
  const checked = [];
  const selected = await findAvailableDevAuxPort(ports, {
    startOffset: 90,
    endOffset: 94,
    isPortAvailable: async (port) => {
      checked.push(port);
      return port === 15292;
    },
  });

  assert.equal(selected, 15292);
  assert.deepEqual(checked, [15290, 15291, 15292]);
  await assert.rejects(
    findAvailableDevAuxPort(ports, {
      startOffset: 98,
      endOffset: 99,
      isPortAvailable: async () => false,
    }),
    /inside 15298-15299/u,
  );
});

test("auxiliary port discovery treats wildcard listeners as occupied", async (t) => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "0.0.0.0", port: 0, exclusive: true }, resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.equal(typeof address, "object");
  const occupiedPort = address.port;
  const auxStart = occupiedPort <= 65436 ? occupiedPort : occupiedPort - 99;
  const offset = occupiedPort - auxStart;

  await assert.rejects(
    findAvailableDevAuxPort(
      { auxStart },
      { startOffset: offset, endOffset: offset },
    ),
    new RegExp(`inside ${occupiedPort}-${occupiedPort}`, "u"),
  );
});

test("dev port CLI rejects a missing project root value", () => {
  for (const args of [["--project-root"], ["--project-root", "--check"]]) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--project-root requires a path value/u);
  }
});
