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

test("skill health: every task leaves one passive Git handoff record", async () => {
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

  assert.match(
    agents,
    /Goal 只是普通任务来源[\s\S]*其写明闭环按全局 `\$prompt-governance` 默认授权[\s\S]*所有任务仍各自完成业务切片、验证和回滚[\s\S]*最终仅留被动 `Git handoff record`/u,
  );
  assert.match(
    agents,
    /精确文件或 hunk[\s\S]*建议 commit 分组[\s\S]*简体中文提交意图[\s\S]*已完成验证[\s\S]*未完成验证[\s\S]*需排除的外部脏文件[\s\S]*commit \/ push 是否已获授权/u,
  );
  assert.match(agents, /只是当次交接证据，不是 Git 授权/u);
  assert.match(
    agents,
    /首次写入前和任务收口时[\s\S]*`GIT_OPTIONAL_LOCKS=0`[\s\S]*实时 HEAD、index、`index\.lock`、status 和 scoped diff/u,
  );
  assert.match(agents, /同一时点只能有一个 Git index 操作者/u);
  assert.match(
    agents,
    /无法证明安全时停止相关写入或 Git 动作并报告[\s\S]*不建立任务调度、资源租约、registry、daemon、轮询、定时唤醒或消息广播/u,
  );
  assert.match(
    agents,
    /非 Goal 或 Goal 未写明的 stage、commit、push 仍分别询问/u,
  );
  assert.match(skillsReadme, /当前 10 个 Skill/u);
  assert.match(
    skillsReadme,
    /所有任务按 `AGENTS\.md` 只产出一份被动 `Git handoff record`/u,
  );
  assert.match(
    auditSkill,
    /`GIT_OPTIONAL_LOCKS=0`[\s\S]*`git status --short --untracked-files=all`[\s\S]*scoped diff/u,
  );
  assert.match(progress, /被动 Git handoff record 治理/u);
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

test("skill health: testing and capability guidance avoid duplicate mandatory layer catalogs", async () => {
  const [projectAgents, strategy, testSkill, capabilitySkill, skillIndex] =
    await Promise.all([
      readFile(path.join(ROOT, "AGENTS.md"), "utf8"),
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

  assert.match(
    projectAgents,
    /高成本验证按 `\$plush-test-governance` 在执行前点名授权/u,
  );
  assert.match(strategy, /同一候选可一次合并确认/u);
  assert.doesNotMatch(strategy, /新任务提示词在创建任务前完整展示/u);
  assert.match(testSkill, /高成本门禁失败即停止，不自动扩圈或重跑/u);

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
  assert.doesNotMatch(
    capabilitySkill,
    /^## Evidence Layers|1\. Product truth/u,
  );
  assert.match(capabilitySkill, /只核对当前问题需要的证据类型/u);
  assert.match(skillIndex, /不是 10 个开发阶段/u);
});
