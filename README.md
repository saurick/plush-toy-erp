# 毛绒玩具 ERP / plush-toy-erp

`plush-toy-erp` 当前是一套已经开始按真实资料收口的毛绒工厂 ERP：生产前端保持一个入口，桌面后台和岗位任务端统一由 `5175` 承载，岗位任务端通过 `/m/<role>/tasks` 进入；本地开发仍保留按角色拆端口的调试命令，并开始基于真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含桌面后台统一入口、登录入口选择、生产单端口 `/m/<role>/tasks` 岗位任务端路径，以及本地开发用的按角色移动端调试入口，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，当前承载账号、鉴权、错误码、工作流协同、通用业务记录、`/healthz`、`/readyz` 与 JSON-RPC 基线 |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks |
| `docs/` | 仓库级约定、流程、数据模型、产品化架构、架构评审和部署文档 |
| `config/` | 行业模板、客户配置包和 Phase 11 私有化复制模板落点；当前已有 yoyoosun 前端品牌 / 桌面菜单展示配置 loader，不代表 SaaS tenant，也不改变后端 RBAC、schema 或事实规则 |
| `deployments/` | 客户私有化部署实例资料落点；当前唯一部署真源仍在 `server/deploy/compose/prod`，Phase 11 模板不创建第二套部署主路径 |

## 当前边界

- 当前唯一部署真源仍是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前后端统一走 `8300`
- 当前数据库默认命中 `192.168.0.106:5432/plush_erp`
- 当前账号表、工作流协同表和首版通用业务记录表已通过 Ent + Atlas 落地；Phase 2A 最小库存事实专表、Phase 2B 最小 BOM + 批次库存、Phase 2C 采购入库和 Phase 2D-A 采购退货 schema 已生成 migration；具体目标库是否已 apply 仍以 `make migrate_status` 为准
- 采购、生产、委外、品质和财务后续仍按真实样本逐步拆；BOM 当前只落最小主数据，不生成采购、生产或成本
- 业务链路调试 seed / cleanup / 业务数据清空仅作为开发验收能力接入后端 `debug` JSON-RPC 域，默认面向当前 SQL 连接开启，可通过 `ERP_DEBUG_*` 环境变量显式关闭，并受管理员权限和业务链路调试菜单权限保护；业务数据清空按本项目当前业务表 allowlist 执行，不删除账号、权限、管理员偏好、配置和数据库结构；按 debugRunId 清理还会校验 debug 数据标记
- 扩展硬件链路、PDA、条码枪、图片识别本轮统一标记为 deferred
- 模板打印当前只保留采购合同、加工合同两套正式模板；对应业务页已支持选中记录带值打开，打印中心保留默认样例和模板核对入口

## 本地启动

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认地址：`http://localhost:5175`

桌面构建同时提供单端口任务端兼容路径，例如 `http://localhost:5175/m/warehouse/tasks`。统一登录页会按设备给默认入口，手机默认岗位任务端、电脑默认后台、平板优先使用上次选择；入口按钮由前端入口配置控制。用户不在登录前手选岗位角色，岗位任务端按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位，最终访问仍由后端 RBAC 权限校验。

### 岗位任务端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:all
```

`pnpm start:mobile:all` 启动前会先停止旧的本项目移动端 Vite 进程，避免端口自动漂移导致角色入口错位。

或按角色单独启动：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:boss
pnpm start:mobile:business
pnpm start:mobile:purchasing
pnpm start:mobile:production
pnpm start:mobile:warehouse
pnpm start:mobile:finance
pnpm start:mobile:pmc
pnpm start:mobile:quality
```

端口矩阵：

| 入口 | 端口 |
| --- | --- |
| 老板岗位任务端 | `5186` |
| 业务岗位任务端 | `5187` |
| 采购岗位任务端 | `5188` |
| 生产岗位任务端 | `5189` |
| 仓库岗位任务端 | `5190` |
| 财务岗位任务端 | `5191` |
| PMC 岗位任务端 | `5192` |
| 品质岗位任务端 | `5193` |

### 生产前端

生产环境不使用 Vite dev server。前端镜像从桌面构建产物启动一个静态服务，统一监听 `5175`；岗位任务端通过 `/m/<role>/tasks` 访问，由外部网关只映射这一组前端入口：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

固定端口：前端 `5175`，后端 HTTP `8300`，后端 gRPC `9300`。

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

默认端口：

- HTTP：`8300`
- gRPC：`9300`
- PostgreSQL Compose 宿主机映射：`5435`

## 当前不做

- 扩展硬件链路、PDA、条码枪、图片识别
- 正式 Excel 导入落库
- PDF 坐标填充
- Excel 母版回写
- 打印结果自动留档或反向回写业务记录
- 未经样本验证的细分业务专表和复杂自动派单规则

## 当前推荐检查命令

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

前端改动后执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

## 文档索引

- 协作约定：`/Users/simon/projects/plush-toy-erp/AGENTS.md`
- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 文档清单：`/Users/simon/projects/plush-toy-erp/docs/document-inventory.md`
- 0 到 1 产品架构：`/Users/simon/projects/plush-toy-erp/docs/product/zero-to-one-architecture.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/product-completion-roadmap.md`
- 自动化测试策略：`/Users/simon/projects/plush-toy-erp/docs/product/test-strategy.md`
- 正式产品入口与菜单配置计划：`/Users/simon/projects/plush-toy-erp/docs/product/formal-menu-entry-plan.md`
- 产品台账索引：`/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`
- 产品能力进度台账：`/Users/simon/projects/plush-toy-erp/docs/product/capability-ledger.md`
- 永绅 yoyoosun 客户交付矩阵：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/delivery-matrix.md`
- 永绅 yoyoosun 客户差异台账：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/delta-ledger.md`
- 状态 / Workflow / Fact 边界：`/Users/simon/projects/plush-toy-erp/docs/architecture/status-workflow-fact-boundary.md`
- 永绅 yoyoosun 客户资料边界：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/README.md`
- imported design notes：`/Users/simon/projects/plush-toy-erp/docs/reference/imported-notes/README.md`
- architecture 历史评审归档：`/Users/simon/projects/plush-toy-erp/docs/archive/architecture-history/README.md`
- 工作流主任务树 v1：`/Users/simon/projects/plush-toy-erp/docs/workflow/task-flow-v1.md`
- 通知 / 预警 v1：`/Users/simon/projects/plush-toy-erp/docs/workflow/notification-alert-v1.md`
- 角色权限矩阵 v1：`/Users/simon/projects/plush-toy-erp/docs/roles/role-permission-matrix-v1.md`
- 财务 v1：`/Users/simon/projects/plush-toy-erp/docs/finance/finance-v1.md`
- 仓库与品质 v1：`/Users/simon/projects/plush-toy-erp/docs/warehouse/warehouse-quality-v1.md`
- 日志 / 审计 / Trace v1：`/Users/simon/projects/plush-toy-erp/docs/observability/log-trace-audit-v1.md`
- Workflow usecase 评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/workflow-usecase-review.md`
- 行业专表 Schema 评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/industry-schema-review.md`
- 打印模板字段与编辑行为：`/Users/simon/projects/plush-toy-erp/docs/erp-print-template-field-behavior.md`
- 打印模板实现原理：`/Users/simon/projects/plush-toy-erp/docs/erp-print-template-implementation.md`
- 当前真源索引：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 前端说明：`/Users/simon/projects/plush-toy-erp/web/README.md`
- 后端说明：`/Users/simon/projects/plush-toy-erp/server/README.md`

## 数据库约束

`server` 继续使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更必须通过 `make data`
- 工作流协同和通用业务记录已进入 Ent schema v1；后续细分业务专表仍必须先稳定字段关系，再改 `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/*.go`
