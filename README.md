# 毛绒玩具 ERP / plush-toy-erp

`plush-toy-erp` 当前是一套已经开始按真实资料收口的毛绒工厂 ERP：生产前端保持一个入口，桌面后台和岗位任务端统一由 `5175` 承载，岗位任务端通过 `/m/<role>/tasks` 进入，并开始基于真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含桌面后台统一入口、登录入口选择和生产单端口 `/m/<role>/tasks` 岗位任务端路径，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，当前承载管理员账号、鉴权、错误码、工作流协同、领域 usecase、业务看板 `dashboard_stats`、客户配置版本 `customer_config` JSON-RPC 域、采购订单 `purchase_order` JSON-RPC 域、采购入库 `purchase` JSON-RPC 域、库存台账只读 `inventory` JSON-RPC 域、来料质检 `quality` JSON-RPC 域、业务事实 `operational_fact` JSON-RPC 域、`/healthz`、`/readyz` 与 JSON-RPC 基线 |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks |
| [`.agents/skills/`](.agents/skills/README.md) | Codex 项目专属 skills，维护 plush 文档治理、页面治理、打印模板源文件治理、代码审查、测试治理、提示词治理、发布治理、业务边界、运行诊断、seed/import、可观测错误和安全隐私工作流，并提供“按问题选 Skill”的使用场景速查；作为仓库内 canonical，不依赖个人本机 `~/.codex/skills` 副本 |
| `docs/` | 仓库级约定、流程、数据模型、产品化架构、架构评审和部署文档 |
| `config/` | 行业模板、客户配置包、客户配置 catalog / schema 和私有化复制模板落点；当前已有 yoyoosun 前端品牌 / 桌面菜单展示配置源、部署注入示例、字段 / 编号 / 导入草案和流程结构 preview，默认产品前端包不静态打包具体客户配置；后端只接收受控编译后的客户配置 revision 并生成 effective session，不代表 SaaS tenant，也不改变 Workflow / Fact 真源，内部目录职责见 [`config/README.md`](config/README.md) |
| `deployments/` | 客户私有化部署实例资料落点；当前唯一部署真源仍在 `server/deploy/compose/prod`，私有化模板不创建第二套部署主路径 |

## 当前边界

- 文档入口：[docs/README.md](docs/README.md)；当前真源：[docs/当前真源与交接顺序.md](docs/当前真源与交接顺序.md)；项目治理地图：[docs/项目治理地图.md](docs/项目治理地图.md)。
- 当前唯一部署真源仍是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前后端统一走 `8300`
- 本地开发数据库默认命中 `192.168.0.106:5432/plush_erp`；`192.168.0.133:5435/plush_erp` 是测试 / 目标环境，不作为本地开发默认库
- 当前管理员账号 / RBAC 表、工作流协同表、库存 / 采购 / 质检 / 生产 / 委外 / 出货 / 预留 / 财务事实表、`product_skus`、`purchase_orders`、`processes`、`outsourcing_orders` 和 V1 主数据 / 销售订单表已通过 Ent + Atlas 落地；旧普通 `users` 表和 `user` JSON-RPC 普通账号管理链路已退出，账号登录与岗位任务端统一使用 `admin_users`、角色和权限码；旧 `business_records / business_record_items / business_record_events` 表族已由 `20260612112337` migration 删除，普通 `business` JSON-RPC 不再提供旧记录查询或写入，只保留 `dashboard_stats`；采购订单已接入独立 `purchase_order` JSON-RPC / RBAC 和 V1 页面，BOM 管理已接入独立 `bom` JSON-RPC / RBAC 和 V1 页面，产品基础信息 / 产品规格已接入 `masterdata` JSON-RPC、`product.* / product_sku.*` RBAC 和 `/erp/master/products` V1 页面，销售订单行 UI/API 已支持从 SKU 选择带出产品 / 单位 / 快照并保存 `product_sku_id`；工序档案已接入 `masterdata` JSON-RPC / `process.*` RBAC 和 `/erp/engineering/processes` V1 页面，采购入库已接入独立 `purchase` JSON-RPC / RBAC、V1 页面和业务看板入库 projection，来料质检已接入独立 `quality` JSON-RPC / RBAC 和 `/erp/production/quality-inspections` V1 页面，库存台账已接入独立只读 `inventory` JSON-RPC / RBAC 和 `/erp/warehouse/inventory` V1 页面，委外订单已接入独立 `outsourcing_order` JSON-RPC / `outsourcing.order.*` RBAC 和 `/erp/purchase/processing-contracts` V1 加工合同源单页面，生产进度、出库管理、应收、应付、发票和对账仍按现有 `operational_fact` facts 接入收窄 V1 页面；余额视图已按 ACTIVE `stock_reservations` 返回已预留和可用量只读 read model；采购入库行可选关联采购订单行做来源追溯；`product_skus` 已具备基础维护和销售订单行选用能力，显式 SKU 已贯通销售订单行、批次、库存流水 / 余额、生产 / 委外事实、出货与预留，并以产品 + SKU + 仓库 + 单位 + 批次作为精确库存 grain；历史 `product_sku_id=NULL` 只表示未分规格产品库存，不自动回填、不与任一 SKU 共池；BOM SKU 粒度、受控导入创建 SKU 和旧库存人工重分类仍待后续评审；具体目标库是否已 apply 仍以 `make migrate_status` 为准
- `出货单` 当前已作为 Shipment Fact V1 正式入口接入 `/erp/warehouse/shipments`，复用 `operational_fact` JSON-RPC 和 `shipment.*` RBAC；`出库管理` 已作为收窄的出货出库 / 库存预留 V1 入口复用 `shipments / stock_reservations`；`出货放行` 仍只表示可发货，只有出货单 `SHIPPED` 才是真实出货事实
- 采购订单当前只表达采购承诺，不写库存、批次、应付、发票或付款事实；采购需求、采购订单余额、在途统计、采购合同审批、生产、委外、品质和财务后续仍按真实样本逐步拆；BOM Version 当前只维护工程版本、明细、复制、激活和归档，不生成采购需求、生产任务、库存事实或成本；加工环节 / processes 工序主数据只维护工序编号、名称、类别和可委外 / 可内制 / 需质检标记，不生成委外源单、生产任务、质检事实、库存流水或财务事实
- 业务链路调试 seed / cleanup / 业务数据清空仅作为开发验收能力接入后端 `debug` JSON-RPC 域，默认面向当前 SQL 连接开启，可通过 `ERP_DEBUG_*` 环境变量显式关闭，并受管理员权限和业务链路调试菜单权限保护；业务数据清空按本项目当前业务表 allowlist 执行，覆盖工序档案和委外源单，不删除账号、权限、管理员偏好、配置和数据库结构；按 debugRunId 清理还会校验 debug 数据标记
- 扩展硬件链路、PDA、条码枪、图片识别本轮统一标记为 deferred
- 模板打印当前保留采购合同、加工合同、物料分析明细表、色卡和作业指导书五套正式模板；采购订单带值打开采购合同，委外订单带值打开加工合同和外发作业指导书，BOM 管理带值打开物料分析明细表、色卡和内部 / 工程资料作业指导书，打印中心保留默认样例、纸面预览和打印窗口入口

## 本地工具版本

新人拉仓库后先跑 `scripts/doctor.sh`，确认本机工具链与仓库锁定一致；不一致时先修环境，再安装依赖或跑 QA。

| 工具 | 当前锁定 | 真源 |
| --- | --- | --- |
| Node.js | `24.14.0` | `.n-node-version`、`.node-version`、`.nvmrc` |
| pnpm | `10.13.1` | `web/package.json` 的 `packageManager` |
| Go | `>= 1.26.4` | `server/go.mod` 的 `toolchain go1.26.4` |
| PostgreSQL | 本地开发默认 `192.168.0.106:5432/plush_erp` | `server/configs/dev/config.yaml` / `config.local.yaml` 和 `make print_db_url` |

推荐初始化顺序：

```bash
cd /Users/simon/projects/plush-toy-erp
corepack enable
bash scripts/doctor.sh
bash scripts/bootstrap.sh
```

## 本地启动

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

默认地址：`http://localhost:5175`

同一个 Vite 服务同时提供桌面后台和岗位任务端，例如 `http://localhost:5175/m/warehouse/tasks`。统一登录页会按设备给默认入口，手机默认岗位任务端、电脑默认后台、平板优先使用上次选择；入口按钮由前端入口配置控制。用户不在登录前手选岗位角色，岗位任务端按管理员账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位，最终访问仍由后端 RBAC 权限校验。

### 岗位任务端

岗位任务端不再单独启动 Vite，也不再按角色拆端口。本地和生产都通过同一个前端入口访问：

```text
http://localhost:5175/m/boss/tasks
http://localhost:5175/m/sales/tasks
http://localhost:5175/m/purchase/tasks
http://localhost:5175/m/production/tasks
http://localhost:5175/m/warehouse/tasks
http://localhost:5175/m/finance/tasks
http://localhost:5175/m/pmc/tasks
http://localhost:5175/m/quality/tasks
http://localhost:5175/m/engineering/tasks
```

### 生产前端

生产环境不使用 Vite dev server。前端镜像从桌面构建产物启动一个静态服务，统一监听 `5175`；岗位任务端通过 `/m/<role>/tasks` 访问，由外部网关只映射这一组前端入口：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

yoyoosun 等客户私有化前端包必须在本地或 CI 构建时显式注入客户配置，目标服务器仍只负责加载镜像：

```bash
docker build \
  --build-arg ERP_CUSTOMER_KEY=yoyoosun \
  -f web/Dockerfile \
  -t plush-toy-erp-web:yoyoosun-dev .
```

固定端口：前端 `5175`；生产 Compose 中后端 HTTP `127.0.0.1:8300`、后端 gRPC `127.0.0.1:9300` 只绑定宿主机 loopback，浏览器业务流量通过前端容器 `/rpc` 反代进入 Docker 网络内的 `app-server:8300`。

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

默认端口：

- HTTP：`8300`
- gRPC：`9300`
- 本地开发 PostgreSQL：`192.168.0.106:5432/plush_erp`
- 测试 / 目标环境 PostgreSQL：`192.168.0.133:5435/plush_erp`，只在显式测试服发布、测试服回归或目标环境验收时使用

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

- 协作约定：[AGENTS.md](AGENTS.md)
- 阅读顺序与真源：[docs/当前真源与交接顺序.md](docs/当前真源与交接顺序.md)
- 文档清单：[docs/文档清单.md](docs/文档清单.md)
- 0 到 1 产品架构：[docs/product/零到一产品架构.md](docs/product/零到一产品架构.md)
- 产品完成路线图：[docs/product/产品完成路线图.md](docs/product/产品完成路线图.md)
- 自动化测试策略：[docs/product/自动化测试策略.md](docs/product/自动化测试策略.md)
- 正式产品入口与菜单配置计划：[docs/product/正式产品入口与菜单配置计划.md](docs/product/正式产品入口与菜单配置计划.md)
- 产品台账索引：[docs/product/产品台账索引.md](docs/product/产品台账索引.md)
- 产品能力进度台账：[docs/product/产品能力进度台账.md](docs/product/产品能力进度台账.md)
- 永绅 yoyoosun 客户交付矩阵：[docs/customers/yoyoosun/客户交付矩阵.md](docs/customers/yoyoosun/客户交付矩阵.md)
- 永绅 yoyoosun 客户差异台账：[docs/customers/yoyoosun/客户差异台账.md](docs/customers/yoyoosun/客户差异台账.md)
- 状态 / Workflow / Fact 边界：[docs/architecture/状态工作流事实边界.md](docs/architecture/状态工作流事实边界.md)
- 永绅 yoyoosun 客户资料边界：[docs/customers/yoyoosun/README.md](docs/customers/yoyoosun/README.md)
- 外部参考资料：[docs/reference/README.md](docs/reference/README.md)
- architecture 历史评审归档：[docs/archive/architecture-history/README.md](docs/archive/architecture-history/README.md)
- 业务与协同流程地图：[docs/workflow/业务与协同流程地图.md](docs/workflow/业务与协同流程地图.md)
- 通知 / 预警 v1：[docs/workflow/通知预警催办与升级第一版.md](docs/workflow/通知预警催办与升级第一版.md)
- 角色权限矩阵 v1：[docs/roles/角色权限矩阵第一版.md](docs/roles/角色权限矩阵第一版.md)
- 财务 v1：[docs/finance/财务第一版.md](docs/finance/财务第一版.md)
- 仓库与品质 v1：[docs/warehouse/仓库与品质第一版.md](docs/warehouse/仓库与品质第一版.md)
- 日志 / 审计 / Trace v1：[docs/observability/日志链路追踪审计第一版.md](docs/observability/日志链路追踪审计第一版.md)
- 行业专表 Schema 评审：[docs/architecture/行业专表模型评审.md](docs/architecture/行业专表模型评审.md)
- 打印模板字段与编辑行为：[docs/打印模板字段与编辑行为清单.md](docs/打印模板字段与编辑行为清单.md)
- 打印模板实现原理：[docs/打印模板实现原理.md](docs/打印模板实现原理.md)
- 前端说明：[web/README.md](web/README.md)
- 后端说明：[server/README.md](server/README.md)

## 数据库约束

`server` 继续使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更必须通过 `make data`
- 工作流协同和通用业务记录已进入 Ent schema v1；后续细分业务专表仍必须先稳定字段关系，再改 `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/*.go`
