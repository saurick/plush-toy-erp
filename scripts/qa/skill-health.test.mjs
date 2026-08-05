import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseOpenAIYaml,
  parseSkillFrontmatter,
  validateSkillRoot,
} from "./skill-health.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function withSkillRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-skill-health-"));
  const skillDir = path.join(root, ".agents", "skills", "plush-example");
  try {
    await mkdir(path.join(skillDir, "agents"), { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: plush-example\ndescription: Example skill. Use when validating fixtures.\n---\n\n# Example\n",
      "utf8",
    );
    await writeFile(
      path.join(skillDir, "agents", "openai.yaml"),
      'interface:\n  display_name: "Plush Example"\n  short_description: "Validate example project skill metadata"\n  default_prompt: "Use $plush-example to validate the fixture."\n',
      "utf8",
    );
    await writeFile(
      path.join(root, ".agents", "skills", "README.md"),
      "| Skill | Scope |\n| --- | --- |\n| `$plush-example` | fixture |\n",
      "utf8",
    );
    await callback({ root, skillDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("skill health: current repository skills satisfy the contract", () => {
  const result = validateSkillRoot(ROOT);
  assert.deepEqual(result.errors, []);
  assert(result.skills.length > 0);
});

test("skill health: Git closeout keeps read-only probes and lock recovery centralized", async () => {
  const skillDir = path.join(
    ROOT,
    ".agents",
    "skills",
    "plush-git-closeout-queue",
  );
  const [agents, skill, snapshotScript] = await Promise.all([
    readFile(path.join(ROOT, "AGENTS.md"), "utf8"),
    readFile(path.join(skillDir, "SKILL.md"), "utf8"),
    readFile(
      path.join(skillDir, "scripts", "readonly-git-snapshot.sh"),
      "utf8",
    ),
  ]);

  assert.match(agents, /GIT_OPTIONAL_LOCKS=0/u);
  assert.match(agents, /收到 `WAIT_\*` 后结束当前 turn/u);
  assert.match(skill, /协议版本为 `3`/u);
  assert.match(skill, /`INDEX_LOCK_OBSERVED`/u);
  assert.match(skill, /worker 发现锁时只发送一次/u);
  assert.match(skill, /收到任何 `WAIT_\*` 后立即结束当前 turn/u);
  assert.match(snapshotScript, /export GIT_OPTIONAL_LOCKS=0/u);
  assert.doesNotMatch(snapshotScript, /\b(?:rm|unlink)\b/u);
});

test("skill health: parses the supported frontmatter and metadata subset", () => {
  assert.deepEqual(
    parseSkillFrontmatter(
      "---\nname: plush-example\ndescription: Example description\n---\n",
    ),
    { name: "plush-example", description: "Example description" },
  );
  assert.deepEqual(
    parseOpenAIYaml(
      'interface:\n  display_name: "Plush Example"\n  short_description: "Validate example project skill metadata"\n  default_prompt: "Use $plush-example for this task."\n',
    ),
    {
      display_name: "Plush Example",
      short_description: "Validate example project skill metadata",
      default_prompt: "Use $plush-example for this task.",
    },
  );
});

test("skill health: rejects stale index entries and invalid short descriptions", async () => {
  await withSkillRoot(async ({ root, skillDir }) => {
    await writeFile(
      path.join(skillDir, "agents", "openai.yaml"),
      'interface:\n  display_name: "Plush Example"\n  short_description: "too short"\n  default_prompt: "Use $plush-example for this task."\n',
      "utf8",
    );
    await writeFile(
      path.join(root, ".agents", "skills", "README.md"),
      "| `$plush-missing` | stale |\n",
      "utf8",
    );
    const result = validateSkillRoot(root);
    assert(
      result.errors.some((error) => error.includes("short_description")),
    );
    assert(
      result.errors.some((error) => error.includes("expected one $plush-example")),
    );
    assert(
      result.errors.some((error) => error.includes("$plush-missing")),
    );
  });
});
