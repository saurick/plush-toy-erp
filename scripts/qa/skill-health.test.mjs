import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

test("skill health: retired cross-session scheduling entries remain absent", async () => {
  const obsoleteProjectSkill = ["plush", "git", "closeout", "queue"].join("-");
  const obsoleteGlobalSkill = ["shared", "local", "task", "queue"].join("-");
  const obsoleteTaskTitle = ["Git 收口", "队列"].join("");
  const obsoleteProtocolMarkers = [
    ["WRITER", "RELEASED"].join("_"),
    ["BATCH", "READY"].join("_"),
    ["RESUME", "FROM", "WAIT"].join("_"),
  ];

  assert.equal(
    existsSync(path.join(ROOT, ".agents", "skills", obsoleteProjectSkill)),
    false,
  );

  const [agents, skillsReadme, auditSkill, progress] = await Promise.all([
    readFile(path.join(ROOT, "AGENTS.md"), "utf8"),
    readFile(path.join(ROOT, ".agents", "skills", "README.md"), "utf8"),
    readFile(
      path.join(
        ROOT,
        ".agents",
        "skills",
        "plush-capability-evidence-audit",
        "SKILL.md",
      ),
      "utf8",
    ),
    readFile(path.join(ROOT, "progress.md"), "utf8"),
  ]);
  const activeGovernance = [agents, skillsReadme, auditSkill, progress].join(
    "\n",
  );

  for (const obsoleteMarker of [
    obsoleteProjectSkill,
    obsoleteGlobalSkill,
    obsoleteTaskTitle,
    ...obsoleteProtocolMarkers,
  ]) {
    assert.equal(activeGovernance.includes(obsoleteMarker), false);
  }
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
    assert(result.errors.some((error) => error.includes("short_description")));
    assert(
      result.errors.some((error) =>
        error.includes("expected one $plush-example"),
      ),
    );
    assert(result.errors.some((error) => error.includes("$plush-missing")));
  });
});

test("skill health: machine-consumed validation keys have one formal source", async () => {
  const [strategy, testSkill, capabilitySkill] = await Promise.all([
    readFile(path.join(ROOT, "docs/product/自动化测试策略.md"), "utf8"),
    readFile(
      path.join(ROOT, ".agents/skills/plush-test-governance/SKILL.md"),
      "utf8",
    ),
    readFile(
      path.join(
        ROOT,
        ".agents/skills/plush-capability-evidence-audit/SKILL.md",
      ),
      "utf8",
    ),
  ]);

  assert.equal(
    strategy.match(/^## 验证层级 T0-T8$/gmu)?.length,
    1,
    "test strategy must keep one machine-consumed validation table",
  );
  const keys = [...strategy.matchAll(/^\| (T[0-8]) /gmu)].map(
    (match) => match[1],
  );
  assert.deepEqual(keys, [
    "T0",
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T6",
    "T7",
    "T8",
  ]);
  assert.doesNotMatch(testSkill, /^\| T[0-8] /gmu);
  assert.doesNotMatch(capabilitySkill, /^\| T[0-8] /gmu);
});
