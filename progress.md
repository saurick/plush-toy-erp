# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、产品能力台账、客户交付矩阵、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 审批任务、异常流 V1 及四项收口 Worktree 已带回 Local；本次保留 Local 的能力台账收敛、岗位导航与客户确认文档结构，只吸收 Worktree 的新领域事实，没有恢复已删除的旧状态台账。
- 登记的专用本地验收库 `plush_erp_acceptance_20260716_v5_dev` 与 133 V5 固定库 `plush_erp_uat_20260716_v5` 仍只证明已应用到 `20260722000505` 的固定版本；当前 latest migration `20260722174820` 未对共享库、133 或生产库 apply。
- 133 V5 仍运行固定 release `80b77faeab566660c77fc23cc66c272096692f16` 的技术试用版本；当前异常收口、客户退货 / RMA、收付款及岗位导航后续切片未整体重发，客户 UAT / 签收仍是独立关口。
- 当前 Git 由单一 owner 收口。本次只完成 Local Handoff 与定向验证，未获 stage、commit、push 或部署授权。

## 2026-07-23 异常流 V1 四项收口与 Local Handoff

完成：首次 IQC 拒绝改为按精确来源行和部分数量累计办理退厂或供应商补换；补换确认生成新的 DRAFT 收货、单行待收、零余额 HOLD 批次和 SUBMITTED IQC，原收货不整单取消。创建、确认和取消使用幂等 intent、version CAS、来源锁与事务边界，已过账或已有下游的补换链 fail closed。

完成：委外不合格返厂 / 返工补齐正式品质页和列表读回；返厂以库存 OUT / REVERSAL 为事实真源，返工持久化结果 WIP 并只在无活动下游时允许取消。生产报废、WIP 让步与超领保持“审批决定不等于事实执行”：报废 / 让步由独立执行和冲正动作落 Fact / WIP，超领额度由正式生产领料事务消费。

完成：财务 CreditNote 在 repo 事务内只接受应收 / 应付来源，发票、付款、核对及其他类型均拒绝；反向红冲支持 exact replay，正式收付款页对 408 / 5xx / 非法 success 通过详情与列表读回。正式真源、客户交付矩阵、流程图、岗位帮助和合同测试已同步；Product Core 本地能力没有写成永绅已授权、133 已发布或客户已 UAT。

Handoff：Codex App 自动 Handoff 因 Local dirty 在 checkout-local-branch 前安全停止，未覆盖 Local。确认 Local 无活动 writer 后，手工转入 69 个可 clean apply 的 tracked 变更和 4 个新增文件，再对 11 个同路径文件做三方语义合并；68 个无重叠 tracked 文件与 4 个新增文件逐字核对无差异。Local 主动删除的 `产品能力证据详情.md` 与 `流程编排运行时完成度台账.md` 保持删除，其新增事实已迁入唯一产品能力台账和现有流程文档。

Worktree 验证：冻结树已从头完成 `full.sh` 与 `strict.sh`；scripts Node `1318 / 1318`、Web contract `209 / 209`、Web all `1729 / 1729`、server all `2879 / 2879`、隔离 PostgreSQL `192 / 192`，均为零失败、零跳过，最终输出 `full status=complete` 与 `strict status=complete`。这只证明 Worktree 固定树，不替代 Local 合并树验证。

Local 验证：角色 / 流程与生产路线文档合同 `15 / 15`、异常相关 Web 定向 `36 / 36`、文档 / 客户 / 生产合同 `46 / 46` 通过；`go test ./internal/biz ./internal/data ./internal/service -count=1` 三包通过，`db-guard` 与 `git diff --check` 通过。最终从头执行 `bash scripts/qa/full.sh`，其中 server quick `2719 / 2719`、server all `2879 / 2879` 均为零失败、零跳过，构建、隔离 PostgreSQL、真实 Chromium smoke 与 Go 漏洞扫描依次完成，最终输出 `full status=complete`。首轮文档合同发现并修正 1 条仍锁定“整单取消”的旧断言后已从头复跑绿色。

下一步：若要进入 Git 收口，由单一 owner 在 Local 最终树上重新核对 status / diff，并在用户明确授权后精确 stage、提交和推送。发布前仍须绑定最终 commit / image，完成目标 migration、health / ready、真实岗位 smoke、回滚点与客户 UAT。

风险：本轮未部署 133、未执行客户 UAT，也未对共享 / 133 / 生产数据库应用 migration。Worktree 保留为恢复副本；Local 的本地绿色和历史固定目标证据均不代表当前版本已上线。

## 2026-07-23 九岗位易用性与流程帮助

完成：永绅侧栏统一为“看板中心 → 常用工作 → 更多功能”，岗位帮助放更多；财务常用固定应付、应收、发票，对账进更多。老板即使优先项全是看板也会补足 3 个常用业务；有电脑端菜单的岗位可从手机顶部或“我的”直接进入电脑端。入口按菜单投影判断，不按账号名硬编码；权限中心继续分开说明页面入口和页面内操作。

验证：Web `1730 / 1730`、增量 `59 / 59`、客户文档 `37 / 37`、Chromium `3 / 3`、后端定向、ESLint 和构建通过。真实登录确认 `demo_boss` 手机直达电脑端、`demo_finance` 菜单顺序正确；十账号审计因 `demo_admin` 使用另一密码未完成，未重置。未改 schema / RBAC / Fact，未发布、UAT、提交或推送。

## 2026-07-23 产品能力台账收敛

完成：四份全局能力文档和两份 yoyoosun 客户状态文档已收敛为产品、客户两份真源，四份冗余文档已删除。开发态能力页改为两张真源入口卡，只导航，不再解析或统计台账；三视图、成熟度指标、筛选、详情和内嵌摘要已删除，导航、配置来源与项目 skill 已同步。

验证：文档收敛阶段 affected 曾通过 `12 / 12`、`42 / 42`、Web `1734 / 1734` 与客户边界 `76 / 76`；页面改造后 Web `1726 / 1726`、定向 `45 / 45`、Chromium `4 / 4`、CSS、lint、skill health 和 diff 通过。当前异常收口 Handoff 没有恢复已删除台账，新增事实已迁入唯一产品能力台账。

## 2026-07-23 永绅甲方确认表复审修正

完成：甲方确认表把岗位职责、审批 / 办理节点、业务目标、产品基础能力、永绅配置、目标环境、用户验收和交付范围分轴记录；首次 IQC 处置、补换新到货、FinanceFact / Payment / Allocation / CreditNote 与固定版本证据分层，不让甲方替乙方实现、配置、发布或 UAT 背书。

验证：原复审阶段 affected 文档与角色合同 `12 / 12`、WIP / 角色 / 原型合同 `35 / 35`、客户配置与私有部署边界 `76 / 76` 通过。本次 Handoff 又按新“精确行部分处置 + 新待收待检链 + CreditNote 来源守卫”语义更新确认表和自动化合同，角色 / 流程文档合同 `15 / 15` 通过。

下一步：会前在受控工作副本填入客户交付矩阵状态日期、目标环境证据编号和 R / A 卡预填内容；面谈后按 D / Q 分流到决策、问题，并把批准差异写入客户交付矩阵。未发布、未 UAT、未接银行直连 / 总账 / 税控，不能外推为完整财务或客户交付闭环。

## 下一步与停止条件

1. Git 收口前重新读取 Local `git status / diff`，确认无其他 writer；只有用户明确授权后才精确 stage、提交和推送。
2. 发布前必须绑定最终 commit / image，按正式流程执行备份 / 回滚点、migration status / apply / readback、health / ready、真实账号与业务 smoke。
3. 客户交付仍须甲方岗位 UAT / 签收；本地或固定旧版本绿色不能替代。

## 归档索引

- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：本次异常流四项收口 Handoff 前的完整过程记录；归档前为 354 行 / 81,412 bytes，SHA-256 `7ecb190e0242aaf42a16d946eeb2045c4ddeba290f611f2bfe9d5452a8cfb4a2`。
- `docs/archive/progress-2026-07-18-before-source-lineage-draft-cancellation-closeout.md`：来源血缘和草稿取消集中收口前的完整过程记录。
- `docs/archive/progress-2026-07-17-before-workflow-source-task-producers.md` 与 `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：更早完整过程记录。
- 其余历史过程记录索引见 `docs/archive/README.md`、`docs/文档清单.md` 和 Git 历史。
