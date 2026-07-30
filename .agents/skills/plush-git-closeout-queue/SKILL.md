---
name: plush-git-closeout-queue
description: "协调 plush-toy-erp 共享 Local checkout 的唯一 writer、默认自动本地提交、独立 push、遗留修改盘点与 Git 收口队列轮换。Use when 多个 Codex 顶层任务共享 dirty worktree、热点文件需要继续排队、App 重启后要恢复队列，或用户要求新建一模一样的收口队列；不用于单一 writer 的常规本地自动提交。"
---

# Plush Git 收口队列

## 目标与边界

把共享 Local 的并行协作收口为被动、事件驱动的协议。任务消息负责唤醒和交接；安全批次默认自动本地提交，用户明确说“不提交”才暂停。仓库只保存协议；不要创建 daemon、定时扫描、automation 或仓库内队列状态文件。

本 Skill 管 writer、批次和队列生命周期。真正执行复杂 stage、commit 或 push 时再使用全局 `$git-closeout-coordination`。单一 writer、index 为空、路径归属完整的普通自动提交继续遵循全局 Git 规则，不加载本 Skill。

## 不变量

- 同一 Local checkout 同时只允许一个顶层文件 writer；Git index、commit 和 push 各自始终只有一个 owner。
- writer 权不包含 stage、commit 或 push。业务或验证任务的“解除冻结”也不等于取得 writer / Git owner。
- 不回退、清理、格式化、暂存或提交其他任务现场。路径或 hunk 归属不明时 fail closed。
- 本地提交策略只有 `auto_local` 和 `hold`：默认 `auto_local`；只有可追溯到用户明确“不提交 / 先别提交”的指令才使用 `hold`。
- 默认本地提交不包含 push。push 始终需要独立明确授权，且不能从 `BATCH_READY`、本地 commit 或“任务均已 idle”推导。
- 所有跨任务事件都要得到匹配 ACK；发送成功、任务历史存在或 App 恢复都不能代替 ACK。

## 发现唯一队列

每个新顶层任务轮次，以及旧任务被重新启用后的第一轮：

1. 使用 Codex 任务能力在同一项目和 cwd 中查找唯一置顶、标题精确为 `Git 收口队列` 的任务。
2. 不把 task/thread id 写入仓库、提示模板或长期文档。
3. 找不到、找到多个、队列已归档或无法读取时停止跨任务写入与 Git 动作，简短报告；需要恢复时走“遗留修改盘点”或“轮换长上下文队列”。
4. Subagent 不直接占用顶层队列，只向所属主任务报告，由主任务发送事件。

## 事件与 ACK

协议版本为 `2`。消息至少携带：

```text
event_id: <source_task>:<batch>:<event>:<revision>
protocol_revision: 2
source_task: <task id>
batch: <stable batch name>
event: <event name>
revision: <stable revision or content token>
```

按需追加 `paths`、`owned_hunks`、`last_write_at`、`validation`、`commit_policy`、`hold_reason`、`push_authorized`、目标分支和 exact commit range。`commit_policy` 缺省为 `auto_local`；`hold` 必须附用户原意或可定位的指令证据，不能因任务未写“请提交”而设置。`event_id` 在幂等重发时保持不变；内容实质变化才生成新 revision 和新 event_id。

协议 1 的 `commit_authorized: false` 只表示当时没有显式提交请求，不能自动迁移为 `hold`。队列重新读取协议 2 后，若历史事件没有用户明确禁止提交的证据，将其按 `auto_local` 重新排队；证据不足或归属漂移则进入 reconcile，不猜测范围。

协议升级批次必须先于旧批次精确提交并确认 index 复空；只有新协议进入 HEAD 后才重分类和排空历史队列，不能用尚未提交的工作区规则批量收口旧现场。

队列先回复精确的 `ACK <event_id>`，再附一行状态。只有匹配 ACK 才算登记成功。未收到 ACK 时：

- 发送方保留原状态和现场，不自行推断 writer 已释放或事件已登记。
- 下一轮向动态发现的当前队列幂等重发同一 event_id。
- 队列对重复 event_id 只返回既有结果，不重复读取 Git、授予 owner 或执行副作用。

## Writer 生命周期

写任务在首次写入非 ignored 文件前发送 `WRITER_REQUEST`，列出精确路径和计划 hunk，并等待队列返回匹配 ACK 与 `GRANT_WRITER`。只有被授予的路径可写。

最后一次文件写入后立即停止写入并发送 `WRITER_RELEASED`，包含最后写入时间和实际路径。只读测试、浏览器检查和 diff 审查不占 writer；若验证失败需要修复文件，重新申请 writer。任务取消时发送 `WRITER_CANCELLED`，不要让废弃租约长期阻塞队列。

队列收到 release / cancelled 后，应在同一轮先处理已登记的安全 `auto_local` 批次，再按顺序处理下一项 writer 请求，不要求各 worker 定时轮询或反复询问。`hold` 或被阻塞批次不能阻塞无重叠的后续安全项。授予 writer 或 commit owner 前一次性重读 HEAD、index、lock / 活动 Git 进程和请求路径；热点仍在写、请求已漂移或 owner 不清楚时返回 `WAIT_WRITER` / `WAIT_HOT_FILE` 并保留队列项。

## 批次与本地提交

完成一个可验证切片后：

- 默认发送 `BATCH_READY`，同时报告 exact paths / hunks、最后写入、验证、建议 Conventional Commit 和 `commit_policy: auto_local`。
- 用户明确要求暂不提交时仍发送 `BATCH_READY`，但使用 `commit_policy: hold` 并附 `hold_reason`；用户随后解除暂停时发送新 revision 或 `CLOSEOUT_REQUEST`。
- `COMMIT_READY` 作为旧事件兼容别名按 `BATCH_READY + auto_local` 处理，不能扩大 paths / hunks 或包含 push。
- 热点文件随后再次被写入时，把相关批次保留为 `WAIT_HOT_FILE`；不要丢弃、抢提或要求 worker 重做验证。热点释放后重新核对 revision 和归属。

`BATCH_READY`、`WRITER_RELEASED`、`WRITER_CANCELLED` 和队列恢复消息都是唤醒信号。每次被唤醒后，队列从最早的 `auto_local` 批次开始处理；不等待“所有任务 idle”这一不存在的可靠全局信号，也不要求 worker 重发。只有 `hold` 批次解除暂停、reconcile 后选定批次或用户要求手动分组时才需要 `CLOSEOUT_REQUEST`。

执行自动或手动本地收口时：

1. 暂停新 writer grant，确认当前无 writer、commit 或 push owner。
2. 重新读取 HEAD、status、index、lock / Git 进程、批次 revision 和目标 diff；混合文件必须按 owned hunk 精确 stage。
3. 只有验证已完成、路径或 hunk 归属完整、热点已释放且没有显式 `hold` 时，使用 `$git-closeout-coordination` 完成一个 Conventional Commit。
4. hook 改写、index 污染、路径重叠、revision 漂移或 ownership 不完整时停止该批并保留现场；不要用 `git add -A`、目录归类或时间戳猜测。
5. 提交成功后报告 exact commit、实际文件、验证和 index 状态；确认 index 复空后释放 Git owner，再处理下一安全批次。
6. 未明确授权 push 时保持本地，不顺带推送。

## Push 与并发外部 Git

push 使用独立事件 `PUSH_REQUEST`、`PUSH_STARTED`、`PUSH_FINISHED`、`PUSH_FAILED`。授权必须说明目标 remote / branch 和允许推送的 exact commit range；本地 ahead 中混有未授权 commit 时停止。

队列只在没有 writer、commit 或其他 push owner 时授予 push owner。开始前 fetch 并记录 local HEAD、upstream OID、remote OID、index 和工作区身份；执行前再次确认未漂移。发现其他任务、GitHub Desktop 或外部终端正在 push，或 remote ref 已变化时，把请求保留排队并 fail closed；不要自动 pull、merge、rebase、force、重试或扩大授权。

普通 push 自身会拒绝非 fast-forward，但这不是提前并发锁。无法阻止外部客户端时，只报告已观察到的 Git / remote 状态，不声称拥有全局排他锁。

## 遗留修改盘点

App 重启、旧任务没有发 ready/release、队列丢失或本地留有无人认领修改时，只有用户明确的 `RECONCILE_REQUEST` 才做一次只读盘点：

1. 确认没有已知 writer、commit 或 push owner。
2. 一次性读取 HEAD、status、index、diff 和同项目相关任务 / batch 历史。
3. 输出 `RECONCILE_REPORT`，分开：可由 exact 路径 / hunk 与任务证据证明的批次、归属不明或混合修改、活动锁 / 进程、观察到的 HEAD / index。
4. 不在 reconcile 阶段 stage、commit 或 push。可证明且没有显式 `hold` 的批次恢复为 `auto_local` 队列；无法证明的文件原样保留，等待用户选择或来源任务补证。

不要把“没有任务正在运行”解释成“所有本地修改都可提交”，也不要按目录、时间戳或提交信息猜 ownership。

## 轮换长上下文队列

用户要求“新开一模一样的 Git 收口队列”、当前队列上下文过长或需主动交接时，使用显式的 `QUEUE_ROTATE_REQUEST`。不要 fork 旧任务，因为 fork 会携带长历史；创建同项目、Local 环境的空白新任务。

轮换前必须没有 writer、commit 或 push owner。旧队列进入 `ROTATING`，暂停新 grant，但继续 ACK 已在途的 release / ready 事件。随后：

1. 旧队列生成一份紧凑 `QUEUE_SNAPSHOT`：`protocol_revision`、`snapshot_id`、旧队列 task id、当前 owner、待处理 writer 请求、已知 batch 与授权、各来源最后 ACK event_id、活动 closeout / push、未知路径、观察到的 HEAD / index。
2. 创建临时标题 `Git 收口队列（接班）` 的新任务并置顶；把本 Skill 的读取要求和 snapshot 发给它。
3. 新队列重新读取仓库 `AGENTS.md` 与本 Skill，再实时复核 HEAD、status、index、lock / Git 进程；返回 `ACK <snapshot_id>` 与 `QUEUE_ACCEPTED`。snapshot 是交接线索，不覆盖实时仓库。
4. 收到接受确认后，旧队列改名为 `Git 收口队列（已交接 YYYY-MM-DD）`，取消置顶并归档；再把新队列改为精确标题 `Git 收口队列` 并保持置顶。
5. 任一步失败都停止轮换，避免同时存在两个精确标题的置顶队列。旧队列无法读取时，用户可明确创建新队列并先走 `RECONCILE_REQUEST`，但不得声称旧消息已完整迁移。

## 持久化与恢复语义

- Codex 任务及其历史可以在 App 中重新读取和 resume，长上下文也可能被自动压缩；因此协议和轮换步骤必须在仓库里，动态状态仍留在任务消息与实时 Git 中。
- 不假定 App 关闭期间存在有保证的跨任务离线邮箱。无匹配 ACK 的消息按未交付处理，App 恢复后的下一轮再幂等重发。
- 仓库不得保存当前 task id、writer、batch、ACK 日志、HEAD / index / OID 或 queue snapshot。这些值会漂移，也会制造第二状态真源。
- 队列默认休眠，任务消息是唤醒信号；被唤醒后可按本协议自动完成安全的本地 commit，但它不是持续运行的 daemon，也不会凭任务状态或脏文件数量自行扫描。

## 精简输出

常规响应只保留两行：`ACK <event_id>` 与一个状态（如 `GRANT_WRITER`、`AUTO_COMMIT_QUEUED`、`HOLD`、`WAIT_HOT_FILE`）。只有 reconcile、实际 closeout、push 失败或 queue rotation 才展开必要证据，避免用持续状态播报消耗 token。
