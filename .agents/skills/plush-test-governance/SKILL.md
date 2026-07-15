---
name: plush-test-governance
description: 项目测试治理（plush-toy-erp）。Use when choosing, running, reviewing, or explaining validation scope, T0-T8 levels, test shapes, browser checks, migrations, or release evidence.
---

# Plush Test Governance

用这份 skill 把 plush-toy-erp 的测试选择、执行和汇报收口到项目真实边界。它不是“多跑命令越好”，而是按改动影响面选出足够但不过度的验证组合。

`T0-T8` 是验证层级，不是项目架构分层。Workflow / Fact / RBAC / API/UI 这类架构层级用于判断系统责任和风险边界；验证层级用于判断本轮测到哪里；测试形态用于说明测试证明了什么。

## 项目测试门禁 Project Test Gates

- 足够但不过度：按改动影响面选择最小必要验证组合；docs/skill-only 不机械跑全量，业务真源、RBAC、migration、页面交互或发布链路必须升级验证。
- 证明真实风险：测试要覆盖本轮最可能出错的合同、状态、权限、旧数据、边界值、浏览器状态或目标环境；不能只证明 happy path。
- 不用测试掩盖设计问题：测试通过不能替代 Workflow / Fact、字段真源、客户差异、可维护性、可回滚性和文档同步判断。
- 汇报可信度：最终必须说明验证层级、测试形态、证据环境、未跑项和剩余盲区，避免“已通过测试”被误读成全系统已验收。

## Workflow

1. 先收敛本轮改动类型和风险层级。
   - 只改文档、skill、README 或进度记录时，默认做静态校验、Markdown/skill 校验和相关引用检查，不机械运行前后端全量测试。
   - 触达服务端 usecase、repo、schema、RBAC、JSON-RPC、业务事实或 migration 时，必须升级到对应 Go/API/迁移测试。
   - 触达页面、样式、表单、表格、导航、交互态或可见文案时，必须纳入 `web` 测试和浏览器级回归，不能只跑静态 lint。
   - 触达部署、初始化、seed、导入导出或真实写入链路时，必须按真实边界补 dry-run、real-write 或发布前检查。
2. 先读相关真源，再定测试。
   - 常用入口：`README.md`、`docs/当前真源与交接顺序.md`、`docs/product/自动化测试策略.md`、`server/README.md`、`web/README.md`、`scripts/README.md`。
   - 不把历史 changes、聊天规划或单个测试名当成测试范围真源。
3. 按影响面选择验证层级 T0-T8，不用一个固定清单套所有任务。
4. 开发期先用 `bash scripts/qa/affected.sh --plan` 核对自动选择、required follow-up 与保守升级；确认计划后再用 `--run`。`affected` 不替代 pre-push `full.sh` 或发布前 `strict.sh`。
5. 执行前检查工作区状态；执行后记录命令、实际测试数、pass/fail/skip、未覆盖项和剩余风险。缺 summary、`0 tests executed` 或 skip 必须按 fail-closed 报告，不能写成通过。
6. 有文件改动时，按项目约定更新 `progress.md`。

## Terms

| 口径 | 作用 | 示例 |
| --- | --- | --- |
| 架构层级 | 判断系统责任、真源和风险边界 | MasterData、Workflow、Fact、RBAC、API/UI、Productization/Delivery |
| 验证层级 T0-T8 | 判断本轮验证测到哪里 | T0 静态现场、T5 Frontend / Page、T8 Release / Deploy |
| 测试形态 | 说明测试证明了什么 | unit、integration、contract、UI regression、smoke、E2E、deployment |
| 证据环境 | 说明测试在哪里发生、可信度到哪 | static scan、local mock、local real DB、browser runtime、dev/test env、target deployment env |

## Verification Levels

| Level | 适用场景 | 常用命令 / 验证 |
| --- | --- | --- |
| T0 静态现场 | 任意改动、提交前、skill/docs 小改 | `git status --short`、`git diff --stat`、`git diff --check`、必要时 `rg` 查引用 |
| T1 文档与边界 | README/docs/AGENTS/skill/菜单口径/真源文档 | Markdown 结构、链接/引用、`docs/文档清单.md`、相关 README、skill validator |
| T2 Schema / Migration | Ent schema、migration、DB 字段、数据真源 | `cd server && make print_db_url`、`make data`、`make migrate_status`、相关 schema/data Go tests |
| T3 Usecase / Repo / Core | Inventory/Purchase/Quality/Shipment/Finance/Workflow 事实或业务逻辑 | `cd server && go test ./internal/core/... ./internal/biz ./internal/data`，按域收窄或扩大 |
| T4 API / RBAC / JSON-RPC | JSON-RPC handler、权限码、角色、错误码、鉴权 | `cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`，错误码同步脚本 |
| T5 Frontend / Page | 页面、表单、样式、表格、导航、交互态 | `cd web && pnpm lint`、`pnpm css`、`pnpm test`、`pnpm style:l1`，必要时真实浏览器脚本 |
| T6 Config / Seed / Import | 客户配置、seed/fixture、source snapshot、模拟数据、导入预演 | 配置 manifest/边界测试、`node --test scripts/import/*.test.mjs`、相关 dry-run / freeze 检查 |
| T7 Business Integration / E2E | 隔离 PostgreSQL 关键事务、JSON-RPC/RBAC、真实浏览器业务闭环 | 项目关键 PostgreSQL gate、定向 JSON-RPC/浏览器 E2E；必须实际执行且 fail/skip 为 0 |
| T8 Release / Deploy | 冻结树门禁、制品、migration、目标运行态、恢复与回滚 | `full.sh` / `strict.sh` + production preflight + 固定 image + migration lock + target health/smoke + backup/restore/rollback evidence |

## Test Shapes

| 测试形态 | 证明内容 | 常见证据环境 |
| --- | --- | --- |
| unit | 单个函数、组件或纯规则在输入输出层面正确 | local mock、static scan |
| integration | repo、usecase、DB、脚本或多个模块协作正确 | local real DB、local runtime |
| contract | API、JSON-RPC、RBAC、错误码、参数和返回语义稳定 | local runtime、dev/test env |
| UI regression | 页面默认态、交互态、恢复态、布局、焦点和相邻区域没有被破坏 | browser runtime |
| smoke | 主路径可打开、可登录、关键入口未炸 | browser runtime、dev/test env、target deployment env |
| E2E | 跨前端、后端、DB 或事实链路完成真实闭环 | local real DB、dev/test env |
| deployment | 构建产物、migration、健康检查、启动、回滚或发布后检查可用 | target deployment env |

## Selection Rules

- Workflow 改动至少覆盖 `done / blocked / rejected`、reason 必填、旧原因清理、重复提交、settled 状态、JSON-RPC/RBAC 边界。
- Fact / Inventory / Purchase / Quality / Shipment / Finance 改动至少覆盖 happy path、非法状态、重复提交、取消/冲正、幂等、事务失败和事实表一致性。
- RBAC / API 改动至少覆盖未登录、disabled 管理员、非管理员、无权限、角色不匹配、super_admin 和前端隐藏菜单不是安全边界。
- 页面治理改动至少覆盖默认态、交互态、恢复态、相邻区域、长文本/大数字/多标签等边界样本；`style:l1` 是浏览器级回归，不替代真实后端读写回归。
- Import / Seed 改动必须区分 dry-run、fixture、模拟客户数据和真实客户数据；当前没有可直接执行的真实客户数据导入。
- 部署测试默认不在低配服务器构建；远端只做加载制品、migration、启动、健康检查和必要 smoke。
- `full.sh` / `strict.sh` 绿色只证明对应当前树的本地门禁；没有目标环境 release、migration、health/smoke、恢复与回滚证据时，不能写成已发布或已交付。

## Reporting Standard

最终回复必须写清：

- 本轮选了哪些验证层级 T0-T8，为什么。
- 本轮对应哪些测试形态和证据环境。
- 实际运行了哪些命令，结果如何。
- 哪些测试没有跑，原因是什么。
- 是否覆盖默认态、交互态、恢复态、真实后端读写、migration 或发布边界。
- 剩余盲区和下一步建议，不能只写“已通过测试”。
