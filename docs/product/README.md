# 产品与路线 / Product Docs

本目录回答“产品下一步做什么、能力成熟到哪、哪些页面或菜单只是候选”的问题。它是产品路线和治理入口，不直接证明 runtime 已实现。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 判断产品长期方向和进入条件 | `产品完成路线图.md` | `docs/当前真源与交接顺序.md`、能力台账、当前代码和测试；不按路线图逐级施工 |
| 判断本项目属于 ERP / MES / CRM 等哪类系统，或传统专业能力如何映射 | `零到一产品架构.md` 的“传统专业系统能力映射” | `模块边界.md`、`../architecture/状态工作流事实边界.md`、`产品能力进度台账.md` |
| 判断多客户角色、字段、模块和流程边界 | `多甲方角色能力与流程编排.md` | `模块边界.md`、当前代码、migration 和测试 |
| 判断流程编排 runtime / preview-only 完成度 | `产品能力进度台账.md` 的 Workflow / ProcessRuntime 能力行 | `../当前真源与交接顺序.md`、对应架构文档、Workflow / ProcessRuntime / customer config 代码和测试 |
| 判断产品能力状态 | `产品能力进度台账.md` | 对应代码、migration 和测试；客户发布与验收另看受控交付资料和环境 evidence |
| 把甲方需求或使用反馈交给 Codex 闭环 | `模块实施治理.md` | 当前真源和本次真正受影响的代码 / 文档 / 测试；普通需求不遍历全部治理层级 |
| 判断架构层级、数据语义层级、验证层级、测试形态、原型状态等治理口径 | `../项目治理地图.md` | `../当前真源与交接顺序.md`、`模块边界.md`、`自动化测试策略.md`、`prototypes/README.md`、`AGENTS.md` |
| 判断字段来源、来源带值或明细列语义 | `业务主链路数据流向与字段来源规则.md` | Ent schema、usecase、JSON-RPC、前端表单 / 列表 helper 和测试 |
| 判断数量、金额、余额、净重、生产用料等计算口径 | `业务公式与计算口径.md` | Ent schema、领域 / repo 实现、前端预览 helper 和对应测试 |
| 判断页面能否出现删除 / 回收站 / 生命周期动作 | `业务数据生命周期与页面动作规则.md` | `AGENTS.md`、`docs/当前真源与交接顺序.md`、对应 usecase / RBAC / 测试 |
| 判断页面能否出现新建 / 生成 / 登记按钮 | `页面来源生成入口规则.md` | 对应 Source Document / Fact usecase、JSON-RPC、RBAC、页面级浏览器回归（Style L1） |
| 改菜单或正式入口 | `正式产品入口与菜单配置计划.md` | `菜单映射评审表.md`、`正式菜单运行时实施拆分清单.md`、menu / RBAC 代码 |
| 看页面和交互方向 | `prototypes/README.md` | 对应原型 README、真实运行页、`web/README.md` |
| 判断客户差异是否能产品化 | `客户实例策略.md`、`客户差异策略.md` | `docs/customers/<customer-key>/客户交付矩阵.md` 的客户差异与决策、Product Core 评审 |
| 实施新增私有化甲方 | `新增甲方客户实施流程.md` | `../customers/reference-customer/README.md`、`../../config/private-deployment-template/README.md`、目标客户受控交付资料 |

## 文档分组 / Document Groups

| 分组 | 文档 |
| --- | --- |
| 产品路线 | `产品完成路线图.md`、`多甲方角色能力与流程编排.md`、`零到一产品架构.md`、`产品原则.md`、`模块边界.md` |
| 能力台账 | `产品能力进度台账.md` |
| 实施治理 | `模块实施治理.md`、`业务主链路数据流向与字段来源规则.md`、`业务公式与计算口径.md`、`业务数据生命周期与页面动作规则.md`、`页面来源生成入口规则.md`、`发布门禁.md`、`迁移准备检查清单.md`、`ERP-V1主链验收计划与证据边界.md` |
| 菜单与页面 | `正式产品入口与菜单配置计划.md`、`菜单映射评审表.md`、`正式菜单运行时实施拆分清单.md`、`prototypes/` |
| 产品化策略 | `新增甲方客户实施流程.md`、`客户实例策略.md`、`客户差异策略.md`、`配置与权限策略.md`、`多客户私有化复制包评审.md`、`软件即服务进入门禁评审.md` |

## 真源边界 / Source Boundary

本目录可以定义产品路线、治理规则、候选入口、成熟度口径和交付门禁；当前实现状态仍必须回到 `docs/当前真源与交接顺序.md`、代码、migration 和测试确认。原型、路线图、能力台账或旧记录审计都不能单独证明 schema、API、菜单、RBAC、页面已上线或模块已经可交付。

## 更新规则 / Maintenance

新增、删除、重命名本目录长期维护文档，或改变 roadmap、能力台账、客户交付状态、客户差异分类时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 相关目录 README、脚本入口、dev-only viewer 或测试断言。
- 仅在跨会话、阻塞 / 风险、schema / migration、发布 / 回滚、重大决策或用户明确要求时更新 `progress.md`。
