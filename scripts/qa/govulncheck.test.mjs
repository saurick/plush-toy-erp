import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT_DIR, "scripts/qa/govulncheck.sh");

async function runFakeGovulncheck(statuses, { strict = true } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "plush-govulncheck-"));
  const bin = path.join(directory, "bin");
  const counter = path.join(directory, "attempts");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin));
  const executable = path.join(bin, "govulncheck");
  const sleep = path.join(bin, "sleep");

  await writeFile(
    executable,
    `#!/usr/bin/env bash
set -euo pipefail
counter="\${FAKE_GOVULNCHECK_COUNTER:?}"
attempt=0
if [[ -f "$counter" ]]; then
  read -r attempt < "$counter"
fi
attempt=$((attempt + 1))
printf '%s\\n' "$attempt" > "$counter"
IFS=',' read -r -a statuses <<< "\${FAKE_GOVULNCHECK_STATUSES:?}"
index=$((attempt - 1))
if [[ "$index" -ge "\${#statuses[@]}" ]]; then
  index=$((\${#statuses[@]} - 1))
fi
status="\${statuses[$index]}"
printf 'fake govulncheck attempt=%s status=%s\\n' "$attempt" "$status"
exit "$status"
`,
  );
  await writeFile(sleep, "#!/usr/bin/env bash\nexit 0\n");
  await Promise.all([chmod(executable, 0o755), chmod(sleep, 0o755)]);

  try {
    const result = spawnSync("bash", [SCRIPT], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_GOVULNCHECK_COUNTER: counter,
        FAKE_GOVULNCHECK_STATUSES: statuses.join(","),
        GOVULNCHECK_STRICT: strict ? "1" : "0",
        PATH: `${bin}:${process.env.PATH}`,
      },
    });
    const attempts = Number((await readFile(counter, "utf8")).trim());
    return {
      attempts,
      output: `${result.stdout || ""}\n${result.stderr || ""}`,
      status: result.status,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("govulncheck succeeds without retry when the first scan is clean", async () => {
  const result = await runFakeGovulncheck([0]);

  assert.equal(result.status, 0);
  assert.equal(result.attempts, 1);
  assert.doesNotMatch(result.output, /status=retry/u);
});

test("govulncheck retries one scanner or database failure and can recover", async () => {
  const result = await runFakeGovulncheck([1, 0]);

  assert.equal(result.status, 0);
  assert.equal(result.attempts, 2);
  assert.match(
    result.output,
    /status=retry reason=scanner_or_database_failure attempt=1 next=2 max=2/u,
  );
});

test("govulncheck remains fail-closed after the bounded retry is exhausted", async () => {
  const result = await runFakeGovulncheck([1, 1]);

  assert.equal(result.status, 1);
  assert.equal(result.attempts, 2);
  assert.match(
    result.output,
    /status=failed reason=scanner_or_database_failure attempts=2/u,
  );
  assert.match(result.output, /GOVULNCHECK_STRICT=1，阻断/u);
});

test("govulncheck never retries a detected vulnerability", async () => {
  const result = await runFakeGovulncheck([3, 0]);

  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
  assert.doesNotMatch(result.output, /status=retry/u);
  assert.match(
    result.output,
    /status=failed reason=vulnerabilities_found retry=forbidden/u,
  );
});
