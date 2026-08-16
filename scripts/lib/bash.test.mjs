import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("project Bash guard rejects an old PATH bash before expensive gates", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "plush-bash-guard-"));
  const fakeBash = path.join(tempDir, "bash");
  writeFileSync(fakeBash, "#!/bin/sh\nprintf '3'\n", { mode: 0o700 });
  chmodSync(fakeBash, 0o700);

  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; PATH="$2:/usr/bin:/bin" require_project_bash qa:test',
        "bash",
        path.join(root, "scripts/lib/bash.sh"),
        tempDir,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Bash 版本不满足|请安装 Bash/u,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
