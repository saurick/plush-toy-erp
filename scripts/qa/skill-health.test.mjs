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
  assert.match(skill, /协议版本为 `3`/u);
  assert.match(
    skill,
    /首次写入非 ignored 文件前[\s\S]*HEAD、index、`index\.lock`、status/u,
  );
  assert.match(
    skill,
    /worktree 干净[\s\S]*每个 dirty hunk 都可证明由当前任务创建[\s\S]*跳过队列/u,
  );
  assert.match(
    skill,
    /既有脏路径视为共享\/归属不明[\s\S]*精确 `paths` \+ `derived_paths` 的 writer lease/u,
  );
  assert.match(skill, /该检测不轮询、不建 registry \/ daemon/u);
  assert.match(skill, /不回退、格式化或 stage 外部脏路径/u);
  assert.match(skill, /`paths ∪ derived_paths` 作为写入闭包/u);
  assert.match(skill, /未提交 `BATCH_READY` 的 `full_owned_paths`/u);
  assert.match(
    skill,
    /优先完成已获授权的 ready closeout[\s\S]*显式降级为可证明的 mixed hunks[\s\S]*`WAIT_HOT_FILE`/u,
  );
  assert.match(skill, /未授权的 `HOLD` 只保护其已声明路径[\s\S]*不得阻塞无关路径/u);
  assert.match(skill, /同一文件即使 hunk 不同也必须串行/u);
  assert.match(skill, /`GRANT_WRITER` 必须回显写入闭包[\s\S]*开始身份/u);
  assert.match(skill, /`release_identity`[\s\S]*所有声明和实际写入路径/u);
  assert.match(skill, /只暂停越界任务[\s\S]*不冻结其他已证明不重叠的 writer/u);
  assert.match(skill, /规则升级前已经发出的 lease 不撤销/u);
  assert.match(skill, /旧 lease 释放后立即重审等待队列/u);
  assert.match(skill, /浏览器请求声明源码 `read_hotspots`/u);
  assert.match(skill, /同一端口串行，不同端口不互相阻塞/u);
  assert.match(skill, /同一可写目标或相同 schema\/migration 热点串行/u);
  assert.match(skill, /`INDEX_LOCK_OBSERVED`/u);
  assert.match(skill, /worker 发现锁时只发送一次/u);
  assert.match(skill, /`STALE_INDEX_LOCK`[\s\S]*自助清理一次/u);
  assert.match(skill, /不得再请求用户确认/u);
  assert.match(skill, /非零字节[\s\S]*`WAIT_INDEX_LOCK_REVIEW`/u);
  assert.match(skill, /`LOCK_CLEAR_NOTICE` 作为其 `resume_on`/u);
  assert.match(skill, /收到任何 `WAIT_\*` 后立即结束当前 turn/u);
  assert.match(skill, /writer grant 是 turn-scoped 写入租约/u);
  assert.match(skill, /按 `TURN_ENDED` 仅释放该任务的 lease/u);
  assert.match(
    skill,
    /活动 turn 已进入只读验证时发送一次 `WRITER_RELEASE_REQUIRED`/u,
  );
  assert.match(skill, /验证失败或新 turn 恢复都要重新申请/u);
  assert.match(skill, /未报告变化登记为 `UNREPORTED_WRITES`/u);
  assert.match(skill, /`EXACT_CLEAN_FREEZE`、`PUSH_FREEZE`、`CLOSEOUT_FREEZE` 不是协议事件/u);
  assert.match(skill, /任何全工作树冻结请求都返回 `UNSUPPORTED_LOCK_DOMAIN`/u);
  assert.match(skill, /`task_complete`、`next_phase` 和紧凑 `continuation_checkpoint`/u);
  assert.match(skill, /发送后无需等待 ACK 即继续只读验证或最终收口/u);
  assert.match(skill, /把每个 WAIT 登记为 `external` 或 `self_actionable`/u);
  assert.match(skill, /`WAIT_SCOPE`[\s\S]*`WAIT_RECONCILE`[\s\S]*`WAIT_HOT_FILE`/u);
  assert.match(skill, /投递一次 `RESUME_FROM_WAIT`/u);
  assert.match(skill, /WAIT 所在 turn 必须先结束/u);
  assert.match(skill, /同一 token 最多发送一次/u);
  assert.match(skill, /在匹配 `resume_on` 到来前不发送自助恢复，也不轮询/u);
  assert.match(skill, /返回 `WAIT_RESUME_TRIGGER`/u);
  assert.match(skill, /插入当前 turn 的普通消息或 ACK 不算 fresh-turn trigger/u);
  assert.match(skill, /未完成任务不得只回复 ACK 后结束/u);
  assert.match(skill, /额度耗尽时模型不能继续推理、调用工具或发送消息/u);
  assert.match(skill, /从 checkpoint 续做，不能复活旧 writer/u);
  assert.match(skill, /发出 `PUSH_FINISHED` 或 `PUSH_FAILED` 后立即释放 push owner/u);
  assert.match(skill, /等待远端 CI \/ Release \/ 部署结果不得维持 clean-worktree freeze/u);
  assert.match(skill, /只阻止该目标的新 push，不阻止文件 writer/u);
  assert.match(skill, /不保证 App 关闭或额度为零时自动运行/u);
  assert.match(skill, /`commit_authorized` 默认且缺省为 `false`/u);
  assert.match(skill, /`BATCH_READY`[\s\S]*不是 Git 授权/u);
  assert.match(skill, /`auto_local` 不能授权 Git 动作/u);
  assert.doesNotMatch(skill, /安全批次默认自动本地提交|缺省为 `auto_local`/u);
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
