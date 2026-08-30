import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalRsync,
  buildFixedTargetRsyncTransfer,
} from "./fixed-target-rsync.mjs";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const TARGET = Object.freeze({
  key: "customer-test-133",
  ssh: Object.freeze({ host: "192.168.0.133", port: 22, user: "simon" }),
  filesystem: Object.freeze({ root: "/home/simon/plush-toy-erp-test-v1" }),
});

test("fixed target rsync keeps the exact SSH and incoming-directory contract", () => {
  const sourceFiles = [
    "/workspace/server-image.tar",
    "/workspace/web-image.tar",
  ];
  const transfer = buildFixedTargetRsyncTransfer({
    target: TARGET,
    operationId: OPERATION_ID,
    sourceFiles,
  });

  assert.equal(transfer.command, "rsync");
  assert.deepEqual(transfer.args.slice(-3), [
    ...sourceFiles,
    `simon@192.168.0.133:/home/simon/plush-toy-erp-test-v1/incoming/${OPERATION_ID}/`,
  ]);
  assert(transfer.args.includes("--inplace"));
  assert(transfer.args.includes("--protect-args"));
  assert(transfer.args.includes("--rsync-path=/usr/bin/rsync"));
  assert(
    transfer.args.includes(
      "--rsh=ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes -p 22",
    ),
  );
  assert.equal(transfer.args.includes("--delete"), false);
  assert.equal(transfer.args.includes("--compress"), false);
});

test("fixed target rsync rejects target, operation and source drift", () => {
  assert.throws(
    () =>
      buildFixedTargetRsyncTransfer({
        target: { ...TARGET, ssh: { ...TARGET.ssh, host: "example.invalid" } },
        operationId: OPERATION_ID,
        sourceFiles: ["/workspace/server-image.tar"],
      }),
    /registered fixed contract/u,
  );
  assert.throws(
    () =>
      buildFixedTargetRsyncTransfer({
        target: TARGET,
        operationId: "not-an-operation",
        sourceFiles: ["/workspace/server-image.tar"],
      }),
    /operation id/u,
  );
  assert.throws(
    () =>
      buildFixedTargetRsyncTransfer({
        target: TARGET,
        operationId: OPERATION_ID,
        sourceFiles: ["relative-image.tar"],
      }),
    /source file list/u,
  );
});

test("local rsync contract accepts modern rsync and rejects missing or legacy clients", () => {
  assert.deepEqual(
    assertLocalRsync(() => ({
      status: 0,
      stdout: "rsync  version 3.4.4  protocol version 32\n",
      stderr: "",
    })),
    { version: "3.4.4", protocol: 32 },
  );
  assert.throws(
    () =>
      assertLocalRsync(() => ({
        status: 0,
        stdout: "rsync  version 2.6.9  protocol version 29\n",
        stderr: "",
      })),
    /3\.x/u,
  );
  assert.throws(
    () =>
      assertLocalRsync(() => ({
        error: new Error("ENOENT"),
        status: null,
        stdout: "",
        stderr: "",
      })),
    /could not start/u,
  );
});
