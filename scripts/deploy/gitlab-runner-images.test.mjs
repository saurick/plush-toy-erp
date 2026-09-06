import assert from "node:assert/strict";
import test from "node:test";
import { cleanupRunnerImages } from "./gitlab-runner-images.mjs";

const sha = "a".repeat(40);
const id = `sha256:${"b".repeat(64)}`;
const env = {
  CI: "true",
  GITLAB_CI: "true",
  CI_PROJECT_PATH: "saurick/plush-toy-erp",
};
function fixture(overrides = {}) {
  const calls = [];
  const run = (_command, args) => {
    calls.push(args);
    const answer = overrides.reply?.(args, calls);
    if (answer) return answer;
    const image = { Id: id, Config: { Env: [`GIT_SHA=${sha}`] } };
    return {
      status: 0,
      stdout: args[1] === "inspect" ? JSON.stringify([image]) : "",
      stderr: "",
    };
  };
  return {
    calls,
    options: { env, hostname: "plush-gitlab-runner", execute: true, run },
  };
}
const removals = (calls) =>
  calls.filter((args) => args[0] === "image" && args[1] === "rm");

test("cleanup requires exact project, dedicated host, CI context and SHA", () => {
  for (const override of [
    { hostname: "r640" },
    { env: {} },
    { env: { ...env, CI_PROJECT_PATH: "saurick/trade-erp" } },
  ]) {
    const f = fixture();
    assert.throws(
      () => cleanupRunnerImages(sha, { ...f.options, ...override }),
      /dedicated/u,
    );
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.throws(() => cleanupRunnerImages("main", f.options), /exact SHA/u);
});

test("cleanup only removes the six verified aliases for the published build", () => {
  const f = fixture();
  const result = cleanupRunnerImages(sha, f.options);
  assert.equal(result.status, "cleaned");
  assert.equal(result.removedTags.length, 6);
  assert.equal(removals(f.calls).length, 1);
  assert.ok(
    result.removedTags.every(
      (tag) => tag.endsWith(sha) || tag.endsWith(sha.slice(0, 12)),
    ),
  );
  assert.ok(
    f.calls.every(
      (args) => !args.includes("--force") && !args.includes("prune"),
    ),
  );
});

test("preview and existing container references preserve images", () => {
  const f = fixture();
  assert.equal(
    cleanupRunnerImages(sha, { ...f.options, execute: false }).status,
    "preview",
  );
  assert.equal(removals(f.calls).length, 0);
  const busy = fixture({
    reply: (args) =>
      args[0] === "ps" ? { status: 0, stdout: "a-container" } : undefined,
  });
  assert.equal(cleanupRunnerImages(sha, busy.options).status, "preserved");
  assert.equal(removals(busy.calls).length, 0);
});

test("revision mismatch and Docker failures cannot turn into successful cleanup", () => {
  for (const reply of [
    () => ({
      status: 1,
      stdout: "",
      stderr: "Cannot connect to Docker daemon",
    }),
    () => ({
      status: 0,
      stdout: JSON.stringify([
        { Id: id, Config: { Env: [`GIT_SHA=${"c".repeat(40)}`] } },
      ]),
    }),
  ]) {
    const f = fixture({ reply });
    assert.throws(() => cleanupRunnerImages(sha, f.options));
    assert.equal(removals(f.calls).length, 0);
  }
});

test("missing aliases are idempotent but a moved tag blocks all removals", () => {
  const missing = fixture({
    reply: () => ({
      status: 1,
      stdout: "",
      stderr: "Error: No such image: absent",
    }),
  });
  assert.equal(cleanupRunnerImages(sha, missing.options).removedTags.length, 0);
  const moved = fixture({
    reply: (args, calls) =>
      calls.length > 7 && args[1] === "inspect"
        ? {
            status: 0,
            stdout: JSON.stringify([{ Id: `sha256:${"c".repeat(64)}` }]),
          }
        : undefined,
  });
  assert.throws(() => cleanupRunnerImages(sha, moved.options), /changed/u);
  assert.equal(removals(moved.calls).length, 0);
});
