#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function createConsoleFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "plush-console-drill-"));
  const project = `plush-console-drill-${randomBytes(6).toString("hex")}`;
  const secret = () => randomBytes(24).toString("hex");
  const viewerPassword = secret();
  const adminPassword = secret();
  const values = {
    ATTACHMENT_DATA_DIR: path.join(directory, "data"),
    ATTACHMENT_ADMIN_PASSWORD: adminPassword,
    ATTACHMENT_VIEWER_PASSWORD: viewerPassword,
    ATTACHMENT_S3_ACCESS_KEY_ID: secret(),
    ATTACHMENT_S3_SECRET_ACCESS_KEY: secret(),
    ATTACHMENT_S3_BUCKET: "plush-console-fixture",
  };
  mkdirSync(values.ATTACHMENT_DATA_DIR, { mode: 0o700 });
  const example = readFileSync(
    path.join(root, "server/deploy/compose/prod/.env.example"),
    "utf8",
  );
  const env = example
    .split("\n")
    .map((line) => {
      const key = line.split("=", 1)[0];
      return Object.hasOwn(values, key) ? `${key}=${values[key]}` : line;
    })
    .join("\n");
  writeFileSync(path.join(directory, "fixture.env"), env, { mode: 0o600 });
  // Docker Desktop cannot publish ports on an internal-only network. This extra
  // network and loopback port exist only in the disposable browser fixture.
  writeFileSync(
    path.join(directory, "compose.fixture.yml"),
    "services:\n  attachment-store:\n    ports:\n      - '127.0.0.1::23646'\n    networks: [attachment-private, console-fixture]\n    restart: 'no'\nnetworks:\n  console-fixture: {}\n",
  );
  const composeArgs = [
    "compose",
    "--env-file",
    path.join(directory, "fixture.env"),
    "-p",
    project,
    "-f",
    path.join(root, "server/deploy/compose/prod/compose.yml"),
    "-f",
    path.join(directory, "compose.fixture.yml"),
  ];
  const docker = (args, options = {}) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
  const compose = (...args) => docker([...composeArgs, ...args]);
  const cleanup = () => {
    compose("down", "--volumes", "--timeout", "5");
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const config = JSON.parse(
      docker([...composeArgs.slice(0, -2), "config", "--format", "json"]),
    );
    const service = config.services["attachment-store"];
    assert.deepEqual(Object.keys(service.networks), ["attachment-private"]);
    assert.equal(config.networks["attachment-private"].internal, true);
    assert.equal(service.ports, undefined);
    assert.ok(service.command.includes("-admin.ui=true"));
    assert.ok(
      !service.command.some(
        (arg) => arg.includes(viewerPassword) || arg.includes(adminPassword),
      ),
    );
    compose("up", "-d", "--no-deps", "attachment-store");
    const cid = compose("ps", "-q", "attachment-store").trim();
    const published = compose("port", "attachment-store", "23646").trim();
    assert.match(published, /^127\.0\.0\.1:[0-9]+$/u);
    const origin = `http://${published}`;
    const request = async (url, options = {}) =>
      fetch(`${origin}${url}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        ...options,
      });
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      try {
        const response = await request("/login");
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* Wait only for this disposable fixture's startup. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(ready, "console fixture did not become ready");
    docker(
      [
        "exec",
        "-i",
        cid,
        "curl",
        "--fail",
        "--silent",
        "--max-time",
        "5",
        "-F",
        "file=@-;filename=check.txt",
        "http://127.0.0.1:8888/buckets/plush-console-fixture/check.txt",
      ],
      { input: "plush-console-fixture\n" },
    );
    return {
      directory,
      cid,
      origin,
      viewerPassword,
      adminPassword,
      request,
      docker,
      compose,
      cleanup,
    };
  } catch (error) {
    try {
      cleanup();
    } catch {
      /* Preserve the original startup failure. */
    }
    throw error;
  }
}

function sessionCookie(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

export async function verifyConsole(fixture) {
  const { request } = fixture;
  const anonymous = await request("/");
  assert.equal(
    anonymous.status,
    307,
    "anonymous console requests must require login",
  );
  assert.match(anonymous.headers.get("location"), /^\/login/u);
  const login = await request("/login");
  const loginHtml = await login.text();
  const csrf = loginHtml.match(/name="csrf_token"[^>]*value="([^"]+)"/u)?.[1];
  assert.ok(csrf, "login must include CSRF protection");
  const loginHeaders = {
    cookie: sessionCookie(login),
    "content-type": "application/x-www-form-urlencoded",
  };
  const bad = await request("/login", {
    method: "POST",
    headers: loginHeaders,
    body: new URLSearchParams({
      username: "viewer",
      password: "invalid-password",
      csrf_token: csrf,
    }),
  });
  assert.match(bad.headers.get("location"), /^\/login\?error=/u);
  const authenticated = await request("/login", {
    method: "POST",
    headers: loginHeaders,
    body: new URLSearchParams({
      username: "viewer",
      password: fixture.viewerPassword,
      csrf_token: csrf,
    }),
  });
  assert.equal(authenticated.status, 303);
  assert.equal(authenticated.headers.get("location"), "/admin");
  const headers = { cookie: sessionCookie(authenticated) };
  const dashboard = await request("/admin", { headers });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /SeaweedFS/u);
  for (const page of [
    "/files?path=/buckets/plush-console-fixture",
    "/object-store/buckets",
  ]) {
    const response = await request(page, { headers });
    assert.equal(response.status, 200, `viewer can open ${page}`);
    const content = await response.text();
    assert.ok(content.length > 500);
    if (page.startsWith("/files")) assert.match(content, /check\.txt/u);
  }
  const download = await request(
    "/api/files/download?path=/buckets/plush-console-fixture/check.txt",
    { headers },
  );
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "plush-console-fixture\n");
  // Use the valid authenticated session; rejection must come from read-only authorization.
  const csrfAfterLogin = html.match(
    /name="csrf-token" content="([^"]+)"/u,
  )?.[1];
  assert.ok(csrfAfterLogin, "authenticated page must expose its CSRF token");
  for (const [method, url] of [
    ["POST", "/api/s3/buckets"],
    ["DELETE", "/api/s3/buckets/plush-console-fixture"],
    ["POST", "/api/files/upload"],
    [
      "DELETE",
      "/api/files/delete?path=/buckets/plush-console-fixture/check.txt",
    ],
  ]) {
    const response = await request(url, {
      method,
      headers: {
        ...headers,
        "X-CSRF-Token": csrfAfterLogin,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(
      response.status,
      403,
      `viewer must be forbidden from ${method} ${url}`,
    );
    assert.match(await response.text(), /read.only/iu);
  }
  const logout = await request("/logout", { headers });
  assert.equal(logout.status, 303);
  const loggedOut = await request("/admin", {
    headers: { cookie: sessionCookie(logout) },
  });
  assert.equal(loggedOut.status, 307);
  return {
    assertions:
      "anonymous access, invalid login, viewer login, dashboard, files, buckets, write rejection, logout",
    headers,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let fixture;
  try {
    fixture = await createConsoleFixture();
    const result = await verifyConsole(fixture);
    console.log(`[attachment-console] passed: ${result.assertions}`);
  } catch (error) {
    console.error(`[attachment-console] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (fixture) fixture.cleanup();
  }
}
