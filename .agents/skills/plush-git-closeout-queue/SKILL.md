---
name: plush-git-closeout-queue
description: "把全局 shared-local-task-queue 应用于 plush-toy-erp：补充项目生成物、schema/migration、浏览器/Vite/数据库资源、混合 hunk 与显式 Git 收口边界。Use when several Codex top-level tasks share this repository's dirty Local checkout or a project-specific writer/resource/Git conflict must be coordinated; do not use for a clean single-writer task."
---

# Plush Git 收口队列适配层

## Required base

使用本 Skill 时，必须先完整读取全局 `$shared-local-task-queue`。全局 Skill 是通用调度真源；本文件只增加 plush-toy-erp 的项目事实和更严格边界。两者冲突时，以当前仓库 `AGENTS.md`、正式 docs、代码、migration、测试和更安全的规则为准。

仓库内 [scripts/request-lifecycle.mjs](scripts/request-lifecycle.mjs) 与测试是协议 4 的可移植项目合同；用户级 Skill 可用时由它承担跨项目调度。项目脚本仍用于 CI、克隆环境和漂移检查，不保存任何实时队列状态。

## Activation and coordinator

按仓库 `AGENTS.md` 的 Local 首次写入门禁执行：

- worktree 干净，或全部 dirty hunk 都可证明由当前任务创建：走普通单 writer，不启动队列。
- 已存在其他任务或归属不明修改：发现同项目、同 cwd、唯一置顶且标题精确为 `Git 收口队列` 的任务；取得精确路径与派生路径 writer lease 后再写。
- 找不到、找到多个或队列已归档：停止跨任务写入和 Git 动作，报告具体发现；不要自建 daemon、registry 或仓库状态文件。

并发任务存在、混合批次尚未收口或 Git owner 仍需协调时，队列会话要保持可发现且不归档，但可以 idle，不需要持续占用执行槽。所有申请终态且没有待收口批次后可归档；下一次并发再创建或发现新的唯一队列。

## Plush write closures

`paths ∪ derived_paths` 必须覆盖命令所有可能写入。以下情况不得只申报手改文件：

- `server/internal/data/model/schema/**`：按 `AGENTS.md` 纳入 `make data` 可能产生的 Ent 生成物、Atlas migration 与 `atlas.sum`；执行前必须给出完整有界闭包。
- schema-doc 生成：声明 `server/cmd/schema-doc/**` 与实际生成的 `server/docs/database/**`；不使用目录通配授权代替执行后的精确实际路径回报。
- 文档新增、删除、重命名或重分类：按文档规则纳入 `docs/文档清单.md`、相关目录 README、引用和测试；只改正文且入口不变时不得机械扩大。
- 项目 Skill：同步 `.agents/skills/README.md`、`agents/openai.yaml`、必要引用和 `scripts/qa/skill-health*`。
- 依赖或包管理：`package.json`、`pnpm-lock.yaml`、Go module 文件或其他 lockfile 是派生写入；未明确授权依赖操作时列入 `forbidden_commands`。
- formatter、generator、`make data`、schema-doc、文档索引或全仓 fix 无法枚举闭包时，当前共享 Local writer 不得执行；改为串行安全窗口或用户明确创建的 App Worktree。

同一文件即使 hunk 不同也必须串行。已登记未提交的 `full_owned_paths` 与新 writer 重叠时，先由旧 owner 降级为有证据的 mixed hunks 或完成已授权收口；不能证明时返回 `WAIT_HOT_FILE`。不相交路径不得被它阻塞。

## Project resource keys

把结构化 `resource_claims` 投影为稳定 `resource_keys`：

- Style L1 / Vite：`vite:<host>:<port>`，例如 `vite:127.0.0.1:6175`。
- 独立 DEV/browser harness：使用其实际端口，例如 `vite:127.0.0.1:15223`，并声明浏览器 profile/session key。
- 长期外部进程：本机已有 5175、8300、Plush Workbench 或用户浏览器时，声明为 external read hotspot；除非该任务创建并拥有它，否则不得停止、复用 profile 或宣称清理。
- 数据库：至少区分 `db-read:<environment>:<database>`、`db-write:<environment>:<database>` 与 `db-migrate:<environment>:<database>`；不得包含凭据。
- 同一可写数据库或同一 migration/schema 热点串行；不同端口、不同浏览器 profile、不同只读目标且源码热点不重叠时可以并行。

浏览器请求必须声明 `read_hotspots`、目标 URL、端口、browser/profile、ignored evidence 路径和 cleanup 所有权。Vite/HMR 生命周期内任一热点身份漂移都使该次证据失效；只停止任务拥有的进程。

## Writer request and release

沿用全局协议 revision 4。项目 writer request 至少包括：

```text
event_id: <source_task>:<batch>:WRITER_REQUEST:<revision>
request_id: <source_task>:<batch>:writer
protocol_revision: 4
source_task: <task-id>
batch: <stable-name>
paths: <exact paths>
derived_paths: <exact paths or none>
forbidden_commands: <bounded list>
start_identity: <HEAD/index/index.lock/path hashes>
resource_claims: <claims or none>
read_hotspots: <paths or none>
commit_authorized: false
push_authorized: false
```

一次 wake 使用 `planWriterGrants` 同时授予全部闭包与资源不重叠的请求；前面的冲突项不得造成 head-of-line blocking。规划器必须同时检查目录祖先/后代、保守 glob 字面前缀（首个通配段退到父目录判冲突）、显式 `pathAliases`、`resource_keys`、双向 `read_hotspots` 和尚未提交批次的 `full_owned_paths`。glob 或别名无法安全归一化时按冲突处理，不以字符串不相等推断可并行。App 并发槽位满时，任一 writer/turn 释放后必须立即重算下一组，不等待用户消息。

`GRANT_WRITER` 必须同时绑定宿主实际排队的 `grant_turn_id` 和本次随机 `lease_id`，只覆盖该 in-progress turn 中连续文件写入。只有明确的 turn 终态、idle/notLoaded、匹配身份下的 turn/lease 被替换或 release 才使旧租约自动失效；宿主未提供完整 lease/turn 身份或状态未知时必须 fail closed，继续保护已声明范围。恢复任务必须重验身份并申请新 lease。最后写入后立即 `WRITER_RELEASED`，且 release 的 `grant_turn_id/lease_id` 必须与 grant 完全一致，再回报 actual paths、derived paths、HEAD/index/lock/路径结束身份、`task_complete`、`next_phase` 和可被其他会话接续的 `continuation_checkpoint`。进入只读测试或浏览器验证前释放 writer。

越界写入只暂停越界任务和重叠请求，不冻结其他已证明不相交的 writer。任何新 turn、idle/notLoaded、turn complete/error/cancelled 都不能复活旧 grant。

## WAIT and wakeup

内部 writer、热点、端口、浏览器或陈旧锁等待必须带 `wait_event_id`、稳定 `blocker_identity`、`resume_on`、`requires_user_decision=false`、恢复身份和完整 checkpoint，然后结束当前 turn。用 `registerWait` 在队列任务历史中持久化一个稳定、单次消费的 `resume_token`；禁止写入仓库状态文件，也禁止为同一 wait 重造 token。禁止要求用户回复“继续”。

blocker 释放后：

- 先用 `revalidateResumeIdentity` 重验 HEAD、index、`index.lock`、声明路径哈希、资源状态和原 blocker 已清除；任一漂移返回 `WAIT_REVALIDATION`，blocker 重现返回 `WAIT_BLOCKER_REAPPEARED`。
- 宿主暴露真实顶层任务 follow-up 时，由适配器把 `RESUME_FROM_WAIT` + `resume_token` 投递给原 `target_task_id`。只有宿主明确回执 `accepted=true`、`queued=true`、`top_level_task=true`、匹配的 `target_task_id`、新的 `turn_id` 和稳定 `receipt_id` 才能记为 `WAKE_CONFIRMED`；调用失败、回执不完整或宿主没有该能力都返回 `WAIT_HOST_WAKEUP`，不得声称已经自动唤醒。
- 原任务只能由确认回执中的同一 `turn_id` 调用 `claimResumeToken`，并在恢复前再次执行相同身份重验；成功后 token 标记为 `CONSUMED`，重复事件返回 `RESUME_TOKEN_CONSUMED`，不能重复恢复。
- 队列接管不是宿主唤醒的默认替代。只有 checkpoint 明确 `adoptable_by_queue=true`，并同时证明范围有界、无需用户决定、无扩权、无破坏性动作、无 Git/push/deploy 和数据库写入时，才允许 `RESUME_ADOPTED`；否则保持 `WAIT_HOST_WAKEUP`。
- 只有新的业务选择、破坏性动作、Git/push/deploy 或数据库写授权确实缺失时，才设置 `requires_user_decision=true`。

完整闭环是 `WAIT → blocker RELEASE → planWriterGrants 重算 → WAKE_CONFIRMED → claimResumeToken → 新 GRANT_WRITER → WRITER_RELEASED`。额度为零、App 关闭或宿主没有调度能力时不能承诺离线运行；保留 checkpoint 和 token，返回 `WAIT_HOST_WAKEUP`，下一次获得可执行 turn 后恢复。不能把这类产品边界描述成代码已经继续执行。

## Index lock

只读快照优先运行 [scripts/readonly-git-snapshot.sh](scripts/readonly-git-snapshot.sh)。`.git/index.lock` 默认只阻塞 Git lane；只有活动 Git/hook 可能重写 worktree、身份漂移或操作绑定固定 Git 身份时才阻塞相关 writer。

陈旧锁只能由唯一队列在确认没有 writer/index/commit/push owner 后调用 [scripts/clear-stale-index-lock.sh](scripts/clear-stale-index-lock.sh)。脚本必须两次复核零字节普通文件、无 holder、HEAD/index/status 稳定；其他情况返回 `WAIT_INDEX_LOCK_REVIEW`。成功后发送一次 `LOCK_CLEAR_NOTICE`，只恢复真正依赖该 incident 的请求。

## Batch, Git, push, deploy

完成切片后发送 `BATCH_READY`，列出 exact full-owned paths、mixed hunks、身份、验证、盲区和建议提交信息，并保持 `commit_authorized: false`。`WRITER_RELEASED`、验证绿色和所有任务 idle 都不是 Git 授权。

用户明确授权复杂 stage/commit 后，唯一队列暂停新 grant、等待 writer 安全释放，重新核对全部路径/hunk 与 index，再使用全局 `$git-closeout-coordination`。混合文件必须精确 hunk stage；不得 `git add -A` 或按目录、时间戳猜归属。

push、部署和数据库 apply 各自需要独立明确授权。push 前 fetch 并只允许项目批准的 fast-forward 路径；不得 force、rebase 或覆盖远端。等待 CI/release/部署结果不持有 Local writer、index 或 commit owner。

## Worktree boundary

本项目普通个人开发默认 Local 单 writer；真实并发时优先使用本队列的路径级并行。只有用户明确说“开 Worktree 任务”，或写入闭包长期重叠且无法安全串行时，才创建 Codex App Worktree。Worktree 完成后只报告 `Hand off ready`；Handoff 必须由用户明确要求并重新检查 Local，不会自动带回。

## Validation and output

修改本 Skill 时运行：

```bash
node --test .agents/skills/plush-git-closeout-queue/scripts/request-lifecycle.test.mjs
node --test scripts/qa/skill-health.test.mjs
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/plush-git-closeout-queue
git diff --check -- <exact paths>
```

只在状态变化时输出简短 ACK。锁诊断、identity drift、ownership reconcile、Git/push 失败或队列轮换才展开证据；内部调度不能转嫁成用户确认。
