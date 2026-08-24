import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  const [agents, skill, snapshotScript, clearLockScript] = await Promise.all([
    readFile(path.join(ROOT, "AGENTS.md"), "utf8"),
    readFile(path.join(skillDir, "SKILL.md"), "utf8"),
    readFile(
      path.join(skillDir, "scripts", "readonly-git-snapshot.sh"),
      "utf8",
    ),
    readFile(
      path.join(skillDir, "scripts", "clear-stale-index-lock.sh"),
      "utf8",
    ),
  ]);

  assert.match(
    agents,
    /首次写文件前[\s\S]*HEAD、index、`index\.lock` 与 status/u,
  );
  assert.match(
    agents,
    /worktree 干净[\s\S]*全部脏 hunk 都可证明由当前任务创建[\s\S]*跳过队列/u,
  );
  assert.match(
    agents,
    /既有脏路径视为共享\/归属不明[\s\S]*\$plush-git-closeout-queue[\s\S]*writer lease 后再写/u,
  );
  assert.match(agents, /不得轮询或新建 registry \/ daemon/u);
  assert.match(agents, /不得回退、格式化、stage 外部脏路径/u);
  assert.match(agents, /闭包无重叠和全仓连带写入的 grant 可并行/u);
  assert.match(agents, /同一文件、派生目标或归属不明必须串行/u);
  assert.match(agents, /writer request \/ grant 声明精确路径[\s\S]*开始身份/u);
  assert.match(agents, /release 回报实际路径与结束身份/u);
  assert.match(agents, /越界只暂停越界任务/u);
  assert.match(
    agents,
    /Git index \/ stage \/ commit \/ stash \/ rebase[\s\S]*全仓唯一 owner/u,
  );
  assert.match(agents, /浏览器、Vite、数据库和端口使用独立资源租约/u);
  assert.match(agents, /stage、commit 和 push 是独立动作，均先询问用户/u);
  assert.match(skill, /必须先完整读取全局 `\$shared-local-task-queue`/u);
  assert.match(skill, /全局 Skill 是通用调度真源/u);
  assert.match(skill, /协议 4 的可移植项目合同/u);
  assert.match(skill, /唯一置顶且标题精确为 `Git 收口队列`/u);
  assert.match(skill, /队列会话要保持可发现且不归档，但可以 idle/u);
  assert.match(skill, /不需要持续占用执行槽/u);
  assert.match(skill, /`paths ∪ derived_paths` 必须覆盖命令所有可能写入/u);
  assert.match(skill, /`make data`[\s\S]*Ent 生成物[\s\S]*Atlas migration/u);
  assert.match(skill, /项目 Skill：[\s\S]*`\.agents\/skills\/README\.md`/u);
  assert.match(skill, /同一文件即使 hunk 不同也必须串行/u);
  assert.match(skill, /不相交路径不得被它阻塞/u);
  assert.match(skill, /`vite:127\.0\.0\.1:6175`/u);
  assert.match(skill, /`vite:127\.0\.0\.1:15223`/u);
  assert.match(skill, /本机已有 5175、8300[\s\S]*external read hotspot/u);
  assert.match(skill, /浏览器请求必须声明 `read_hotspots`/u);
  assert.match(skill, /同一可写数据库或同一 migration\/schema 热点串行/u);
  assert.match(skill, /`planWriterGrants`[\s\S]*head-of-line blocking/u);
  assert.match(skill, /目录祖先\/后代[\s\S]*保守 glob 字面前缀/u);
  assert.match(skill, /首个通配段退到父目录判冲突/u);
  assert.match(skill, /显式 `pathAliases`/u);
  assert.match(skill, /双向 `read_hotspots`/u);
  assert.match(skill, /尚未提交批次的 `full_owned_paths`/u);
  assert.match(skill, /任一 writer\/turn 释放后必须立即重算下一组/u);
  assert.match(skill, /`grant_turn_id`[\s\S]*`lease_id`/u);
  assert.match(skill, /状态未知时必须 fail closed/u);
  assert.match(skill, /旧租约自动失效/u);
  assert.match(skill, /最后写入后立即 `WRITER_RELEASED`/u);
  assert.match(skill, /禁止要求用户回复“继续”/u);
  assert.match(skill, /`registerWait`[\s\S]*单次消费的 `resume_token`/u);
  assert.match(skill, /`revalidateResumeIdentity`/u);
  assert.match(
    skill,
    /HEAD、index、`index\.lock`[\s\S]*声明路径哈希[\s\S]*资源状态/u,
  );
  assert.match(skill, /`RESUME_FROM_WAIT`/u);
  assert.match(skill, /`RESUME_ADOPTED`/u);
  assert.match(
    skill,
    /`accepted=true`[\s\S]*`queued=true`[\s\S]*`top_level_task=true`[\s\S]*`target_task_id`[\s\S]*`turn_id`[\s\S]*`receipt_id`/u,
  );
  assert.match(skill, /`WAIT_HOST_WAKEUP`[\s\S]*不得声称已经自动唤醒/u);
  assert.match(skill, /`claimResumeToken`/u);
  assert.match(skill, /`RESUME_TOKEN_CONSUMED`/u);
  assert.match(skill, /`adoptable_by_queue=true`/u);
  assert.match(
    skill,
    /`WAIT → blocker RELEASE → planWriterGrants 重算 → WAKE_CONFIRMED/u,
  );
  assert.match(skill, /只有新的业务选择[\s\S]*`requires_user_decision=true`/u);
  assert.doesNotMatch(skill, /请回复[“"]?继续/u);
  assert.match(skill, /默认只阻塞 Git lane/u);
  assert.match(skill, /`WAIT_INDEX_LOCK_REVIEW`/u);
  assert.match(skill, /`LOCK_CLEAR_NOTICE`/u);
  assert.match(skill, /`BATCH_READY`[\s\S]*不是 Git 授权/u);
  assert.match(skill, /push、部署和数据库 apply 各自需要独立明确授权/u);
  assert.match(skill, /只有用户明确说“开 Worktree 任务”/u);
  assert.match(skill, /Handoff 必须由用户明确要求/u);
  assert.match(snapshotScript, /export GIT_OPTIONAL_LOCKS=0/u);
  assert.doesNotMatch(snapshotScript, /\b(?:rm|unlink)\b/u);
  assert.match(clearLockScript, /--queue-confirmed-no-git-owner/u);
  assert.match(clearLockScript, /LOCK_CLEAR_NOTICE result=cleared/u);
  assert.match(clearLockScript, /WAIT_INDEX_LOCK_REVIEW/u);
  assert.match(clearLockScript, /sleep 1/u);
  assert.doesNotMatch(clearLockScript, /read\s+-(?:p|rp|pr)\b/u);
});

test("skill health: stale zero-byte index lock clears once and unsafe locks remain", async () => {
  const repository = await mkdtemp(
    path.join(os.tmpdir(), "plush-stale-index-lock-"),
  );
  const script = path.join(
    ROOT,
    ".agents",
    "skills",
    "plush-git-closeout-queue",
    "scripts",
    "clear-stale-index-lock.sh",
  );
  const run = (command, args) =>
    spawnSync(command, args, {
      cwd: repository,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });

  try {
    assert.equal(run("git", ["init", "-q"]).status, 0);
    await writeFile(path.join(repository, "tracked.txt"), "baseline\n", "utf8");
    assert.equal(run("git", ["add", "tracked.txt"]).status, 0);
    assert.equal(
      run("git", [
        "-c",
        "user.name=Skill Health",
        "-c",
        "user.email=skill-health@example.invalid",
        "commit",
        "-qm",
        "test: baseline",
      ]).status,
      0,
    );

    const lockPath = path.join(repository, ".git", "index.lock");
    await writeFile(lockPath, "", "utf8");
    const cleared = run("bash", [
      script,
      "--repo",
      repository,
      "--queue-confirmed-no-git-owner",
    ]);
    assert.equal(cleared.status, 0, cleared.stderr);
    assert.match(cleared.stdout, /LOCK_CLEAR_NOTICE result=cleared/u);
    await assert.rejects(readFile(lockPath));

    await writeFile(lockPath, "active", "utf8");
    const refused = run("bash", [
      script,
      "--repo",
      repository,
      "--queue-confirmed-no-git-owner",
    ]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /reason=lock_not_zero_bytes/u);
    assert.equal(await readFile(lockPath, "utf8"), "active");
  } finally {
    await rm(repository, { recursive: true, force: true });
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
  assert.match(skillIndex, /不是 11 个开发阶段/u);
});
