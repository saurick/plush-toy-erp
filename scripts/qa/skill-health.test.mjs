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

  assert.match(agents, /只有真实并发 writer[\s\S]*\$plush-git-closeout-queue/u);
  assert.match(agents, /writer grant 只覆盖[\s\S]*当前 `inProgress` turn/u);
  assert.match(agents, /`idle`、`notLoaded` 或已结束 turn 的旧租约继续阻塞/u);
  assert.match(agents, /stage、commit 和 push 是独立动作，均先询问用户/u);
  assert.match(skill, /协议版本为 `3`/u);
  assert.match(skill, /`INDEX_LOCK_OBSERVED`/u);
  assert.match(skill, /worker 发现锁时只发送一次/u);
  assert.match(skill, /收到任何 `WAIT_\*` 后立即结束当前 turn/u);
  assert.match(skill, /writer grant 是 turn-scoped 写入租约/u);
  assert.match(skill, /按 `TURN_ENDED` 使旧租约失效/u);
  assert.match(skill, /不得继续返回 `WAIT_WRITER`，也不等待原任务补发 release/u);
  assert.match(skill, /进入只读验证时，发送一次 `WRITER_RELEASE_REQUIRED`/u);
  assert.match(skill, /旧任务恢复或新 turn 开始时也必须重新发现队列并申请/u);
  assert.match(skill, /未报告的文件变化登记为 `UNREPORTED_WRITES`/u);
  assert.match(skill, /`commit_authorized` 默认且缺省为 `false`/u);
  assert.match(skill, /`BATCH_READY`[\s\S]*不是 Git 授权/u);
  assert.match(skill, /`auto_local` 不能授权 Git 动作/u);
  assert.doesNotMatch(skill, /安全批次默认自动本地提交|缺省为 `auto_local`/u);
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

test("skill health: testing and capability guidance avoid duplicate mandatory layer catalogs", async () => {
  const [strategy, testSkill, capabilitySkill, skillIndex] = await Promise.all([
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
    readFile(path.join(ROOT, ".agents/skills/README.md"), "utf8"),
  ]);

  assert.equal(
    strategy.match(/^## 验证层级 T0-T8$/gmu)?.length,
    1,
    "test strategy must keep one machine-consumed validation table",
  );
  assert.equal(
    strategy.match(/^\| T[0-8] /gmu)?.length,
    9,
    "test strategy must keep the nine stable internal keys",
  );
  assert(
    strategy.split("\n").length <= 180,
    "test strategy must remain a routing policy, not a second test catalog",
  );
  assert.doesNotMatch(
    strategy,
    /^### 岗位任务数量守恒门禁|^## 按领域的必测合同/gmu,
  );

  assert(testSkill.split("\n").length <= 70);
  assert.doesNotMatch(
    testSkill,
    /^## (?:Terms|Verification Levels|Test Shapes|Selection Rules)$/gmu,
  );
  assert.doesNotMatch(testSkill, /^\| T[0-8] /gmu);

  assert(capabilitySkill.split("\n").length <= 55);
  assert.doesNotMatch(capabilitySkill, /^## Evidence Layers|1\. Product truth/u);
  assert.match(capabilitySkill, /只核对当前问题需要的证据类型/u);
  assert.match(skillIndex, /不是 11 个开发阶段/u);
});
