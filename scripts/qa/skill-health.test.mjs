import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("skill health: rejects non-string and unsupported YAML scalars", () => {
  for (const scalar of [
    "null",
    "true",
    "123",
    "[]",
    "{}",
    "*description",
    "|",
    "'unclosed",
    "'invalid'quote'",
    "invalid: nested mapping",
    "Example:",
    "description # inline comment",
  ]) {
    assert.throws(
      () => parseSkillFrontmatter(
        `---\nname: plush-example\ndescription: ${scalar}\n---\n`,
      ),
      /string/u,
      scalar,
    );
  }
  assert.equal(
    parseSkillFrontmatter(
      '---\nname: plush-example\ndescription: "true"\n---\n',
    ).description,
    "true",
  );
  assert.equal(
    parseSkillFrontmatter('---\nname: plush-example\ndescription: "Example:"\n---\n').description,
    "Example:",
  );
});

test("skill health: flat mappings require a key and value separator", () => {
  assert.throws(
    () => parseSkillFrontmatter("---\nname: plush-example\ndescription:Example skill\n---\n"),
    /unsupported YAML line/u,
  );
  assert.throws(
    () => parseOpenAIYaml('interface:\n  display_name:"Plush Example"\n'),
    /unsupported YAML line/u,
  );
});

test("skill health: variable-length fences keep example instructions inert", async () => {
  await withSkillRoot(async ({ root, skillDir }) => {
    const file = path.join(skillDir, "SKILL.md");
    const original = await readFile(file, "utf8");
    const backtick = "`";
    for (const body of [
      [backtick.repeat(4) + "markdown", "[TODO: example]", "$plush-missing", "[example](missing.md)", backtick.repeat(4)],
      [backtick.repeat(4), backtick.repeat(3), "nested example", backtick.repeat(3), "[TODO: example]", "$plush-missing", "[example](missing.md)", backtick.repeat(5)],
      ["~".repeat(5), backtick.repeat(3), "[TODO: example]", "$plush-missing", "[example](missing.md)", "~".repeat(6)],
    ]) {
      await writeFile(file, original + "\n" + body.join("\n") + "\n");
      assert.deepEqual(validateSkillRoot(root).errors, []);
    }
    await appendFile(file, "\n$plush-missing\n");
    assert(validateSkillRoot(root).errors.some((error) => error.includes("unknown project skill $plush-missing")));
  });
});

test("skill health: output assets allow placeholders while their entry links remain checked", async () => {
  await withSkillRoot(async ({ root, skillDir }) => {
    await mkdir(path.join(skillDir, "assets"));
    const template = path.join(skillDir, "assets", "report.md");
    await writeFile(template, "[TODO: output]\n$plush-missing\n[filled later](future.md)\n");
    await appendFile(path.join(skillDir, "SKILL.md"), "\n[Output template](assets/report.md)\n");
    assert.deepEqual(validateSkillRoot(root).errors, []);
    await rm(template);
    assert(validateSkillRoot(root).errors.some((error) => error.includes("assets/report.md")));
  });
});

const INVALID_INSTRUCTION_CASES = [
  {
    name: "missing index link",
    file: "README.md",
    content: "| `$plush-example` | fixture |\n[missing](missing.md)\n",
    error: "README.md -> missing.md",
  },
  {
    name: "broken link inside a nested reference",
    file: "plush-example/references/nested/detail.md",
    content: "# Detail\n[missing](missing.md)\n",
    error: "references/nested/detail.md -> missing.md",
  },
  {
    name: "missing section in a reference",
    file: "plush-example/references/detail.md",
    content: "# Detail\n[missing](#missing-section)\n",
    error: "missing anchor #missing-section",
  },
  {
    name: "unknown project skill in a reference",
    file: "plush-example/references/detail.md",
    content: "Use $plush-missing for this task.\n",
    error: "unknown project skill $plush-missing",
  },
  {
    name: "unknown project skill in metadata",
    file: "plush-example/agents/openai.yaml",
    content: 'interface:\n  display_name: "Plush Example"\n  short_description: "Validate example project skill metadata"\n  default_prompt: "Use $plush-example with $plush-missing."\n',
    error: "unknown project skill $plush-missing",
  },
  {
    name: "unfinished description scaffold",
    file: "plush-example/SKILL.md",
    content: '---\nname: plush-example\ndescription: "[TODO: describe the skill]"\n---\n',
    error: "description contains an unfinished TODO placeholder",
  },
  {
    name: "unfinished reference scaffold",
    file: "plush-example/references/detail.md",
    content: "# Detail\n[TODO: define the workflow]\n",
    error: "unfinished TODO placeholder",
  },
];

for (const scenario of INVALID_INSTRUCTION_CASES) {
  test(`skill health: rejects ${scenario.name}`, async () => {
    await withSkillRoot(async ({ root }) => {
      const target = path.join(root, ".agents/skills", scenario.file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, scenario.content, "utf8");
      const result = validateSkillRoot(root);
      assert(
        result.errors.some((error) => error.includes(scenario.error)),
        JSON.stringify(result.errors),
      );
    });
  });
}

test("skill health: accepts complete references and ignores fenced examples", async () => {
  await withSkillRoot(async ({ root, skillDir }) => {
    await mkdir(path.join(skillDir, "references/nested"), { recursive: true });
    await writeFile(
      path.join(skillDir, "references/nested/detail.md"),
      '<a id="stable-anchor"></a>\n\n# Detail\nUse $plush-example with $runtime-diagnostics.\n[section](#stable-anchor)\n',
    );
    await appendFile(
      path.join(skillDir, "SKILL.md"),
      '[detail](references/nested/detail.md#stable-anchor)\n\n```markdown\n[TODO: illustrative placeholder]\nUse $plush-missing.\n[example](missing.md#missing-section)\n```\n',
    );
    await appendFile(
      path.join(root, ".agents/skills/README.md"),
      '~~~markdown\n[TODO: illustrative placeholder]\nUse $plush-missing.\n[example](missing.md)\n~~~\n',
    );
    assert.deepEqual(validateSkillRoot(root).errors, []);
  });
});

test("skill health: CLI validates an explicit root from another working directory", async () => {
  await withSkillRoot(async ({ root, skillDir }) => {
    const run = () => spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/qa/skill-health.mjs"), "--root", root],
      { cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } },
    );
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /status=ok skills=1/u);
    await appendFile(path.join(skillDir, "SKILL.md"), "[TODO: complete workflow]\n");
    const invalid = run();
    assert.equal(invalid.status, 1, invalid.stdout);
    assert.match(invalid.stderr, /plush-example\/SKILL\.md: unfinished TODO placeholder/u);
    assert.doesNotMatch(invalid.stdout, /status=ok/u);
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
