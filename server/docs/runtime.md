# 服务运行说明

本文档说明服务端当前的默认启动方式、对外端口和运行时约定。

## 启动方式

最常用的本地启动命令：

```bash
cd "$(git rev-parse --show-toplevel)/server"
make init
make run
```

如果要显式指定配置文件：

```bash
cd "$(git rev-parse --show-toplevel)/server"
go run ./cmd/server -conf ./configs/dev/config.yaml
```

说明：

- `make run` 会先构建稳定路径的本地二进制，再启动它。
- `cmd/server/main.go` 支持自动探测配置路径；未传 `-conf` 时，默认优先找 `configs/dev/config.yaml`。

## 默认端口

- HTTP：`8300`
- 本地开发数据库：`192.168.0.133:5432/plush_erp`
- PostgreSQL Compose 宿主机映射：`5435`

配置来源：

- `server/configs/dev/config.yaml`
- `server/configs/prod/config.yaml`

## HTTP 入口

| 入口 | 用途与限制 |
| --- | --- |
| `/rpc/{url}` | JSON-RPC 只接受 `POST`。GET 查询参数不能传鉴权信息或调用业务方法。普通请求正文最多 2 MiB，附件入口 7 MiB。已知 `Content-Length` 或分块请求超限都在业务 handler 前返回 413，Web 代理用相同上限。 |
| `/ping` | 探活，返回 `pong`。 |
| `/healthz` | 检查进程健康，返回 `ok`。 |
| `/readyz` | 检查 PostgreSQL 连通性与 PDF 启动预热，就绪返回 `ready`。 |
| `/metrics` | 只读 Prometheus 指标，包含 Go 堆与 GC、数据库连接池、PDF 渲染占用与队列、附件表大小和估算行数。生产仅允许从回环后端端口或受控采集网络访问。 |

### 在线 PDF 渲染 / Online PDF Rendering

`/templates/render-pdf` 接收 HTML 快照并返回 PDF。每次渲染使用独立浏览器上下文，按当次账号权限和已生效的客户配置检查打印动作与模板模块。

| 接口或资源 | 范围与限制 |
| --- | --- |
| 请求字段 | 仅 `title`、`file_name`、`template_key`、`html`。客户 key 取部署环境，拒绝客户端 `customer_key` 和 `base_url`。路由使用统一管理员认证及实时 session / RBAC。 |
| 渲染内容 | 静态 HTML / CSS 白名单、文档内锚点和内嵌位图。Chromium 关闭脚本与缓存，网络请求仅允许 `data:` 和 `about:blank`。 |
| 图片 | 最多 32 张，解码后单图最多 5 MiB，合计最多 16 MiB。 |
| 文档 | HTML 最多 24 MiB、CSS 合计最多 4 MiB、DOM 最多 20,000 个节点。请求体和成品 PDF 各最多 32 MiB，超限在继续分配或渲染前拒绝。 |
| 并发 | 共享 Headless Chromium，默认并发 4、排队 2。满额后直接返回忙碌，停止读取大请求体。分别由 `ERP_PDF_RENDER_CONCURRENCY` 和 `ERP_PDF_QUEUE_CAPACITY` 设置。 |

**启动、预热与退出**

- 生产 Linux 使用内置 `/usr/bin/chromium`，固定经目标宿主验证的 Debian 版本，非 root 运行并启用 sandbox。macOS 优先用本架构已装的最高修订 Playwright `chrome-headless-shell`，缺失时用系统 Chrome/Chromium。显式 `ERP_PDF_CHROME_PATH` 优先，无效即报错。
- 发布用 `ERP_PDF_WARMUP=async` 异步预热一次中文合同 PDF。预热未完成或失败时 `/readyz` 保持未就绪。`off` 仅用于临时隔离故障。发布冒烟需持受控管理员 token 生成非空 PDF。
- macOS / Linux 以独立 DevTools pipe 绑定后端和浏览器，调试 HTTP 只监听 loopback。后端异常退出时管道关闭，浏览器随之退出。正常停止先等待请求结束，关闭浏览器最多等待 2 秒，再回收本次独立进程组。停止后拒绝再启动，正常回收时移除临时 profile，强制结束后的目录由系统清理。日常浏览器与其他服务独立运行。

### 静态资源与请求标识

容器有静态目录才挂载前端资源，先读 `STATIC_DIR`，未配置则读 `/app/public`。健康和静态资源路由都使用统一观测包装。HTTP 层透传 `X-Request-Id`，缺失时生成 `request_id` 并写回响应头。

## 启动依赖

当前服务默认把以下项目视为启动硬依赖：

- PostgreSQL

当前配置里虽然还保留了 `etcd` 字段，但默认代码路径并未实际初始化 etcd 客户端，因此它不是当前运行时的启动硬依赖。

## 本地开发常用命令

```bash
cd "$(git rev-parse --show-toplevel)/server"

# 代码生成
make config
make api
go generate ./cmd/server

# 数据模型与迁移
make data
make migrate

# 测试
go test ./...
```

`make migrate` 是登记共享开发库的人机交互入口。非交互执行必须先运行
`make migrate_prepare`，再原样使用同一次 ready 输出运行 `make migrate_execute`；
prepare 成功不表示数据库已经升级。133 上演示、验收和生产实例不使用这些本地目标。

## 启动与观测

`data.NewData(...)` 初始化 PostgreSQL 时对瞬时连接失败做有界重试，不能代替目标数据库迁移或就绪检查。HTTP 健康路由有定向回归；PDF 异步预热完成前 `/readyz` 保持未就绪。

Compose 保留 PostgreSQL healthcheck，业务发布分别读回 health / ready 和业务 smoke。Jaeger 只绑定 loopback，远程查看通过 SSH tunnel；它不承担长期审计或业务事实存储。日志、Trace、控制面审计和已知盲区统一见 [服务端观测接入](../../docs/observability/服务端观测接入.md)。


## 任务搜索与汇总查询边界

任务管理、岗位任务（含不取数量的续页）、通用任务列表和状态计数、流程跟踪共用 `readWorkflowSnapshot`。同一次读取的权限过滤、计数、分页和关联资料位于只读一致性快照；带关键词时在该事务内使用 `SET LOCAL jit = off`。提交、回滚及取消后恢复连接设置，不改变数据库全局配置。工作台读取复用同一快照入口。

任务管理总数与四个分类使用一次条件聚合。流程跟踪按状态分别聚合任务与流程，两个类型只做一次合并分页，再按本页 ID 读取实体；不重复执行完整的跨来源搜索。来源任务、正式流程和岗位可见性的原有校验保持一致，各消费者明确自己的投影字段。

任务日历按上海自然日分组，只返回月内日期计数、所选范围的数量与不透明校验值，以及当前页任务。PostgreSQL 在数据库内生成 SHA-256 校验值，应用不接收全部任务版本行；SQLite 测试适配器对聚合文本生成同类校验值。范围发生变化时仍从第一页恢复，不把旧页拼接进新范围。

员工目录的角色和权限按有界 ID 批次读取，复用同一权限真源、停用角色过滤和超级管理员规则。交付与应收统计以一条查询返回汇总和当前分组页，来源明细也合并校验、总数和分页；复杂聚合只在自己的读事务内关闭即时编译，不产生持久缓存或后台预计算。

## 来源任务修复

以下命令在 `server/` 执行。

存量来源任务修复使用后端专用命令，并先由受控环境注入 `POSTGRES_DSN`，不要把连接串写入命令或报告：

```bash
# 默认在事务中执行与正式修复相同的检查和写入，然后回滚
go run ./cmd/backfill-workflow-source-tasks

# 核对 dry-run 的数据库名、扫描数和新增数后，才允许显式提交
go run ./cmd/backfill-workflow-source-tasks \
  --apply \
  --confirm-database=<精确数据库名>
```

该命令扫描当前 `RELEASED` 生产订单、`POSTED REWORK` 返工事实及 `DRAFT` 出货单，补齐缺失的 task / `created` event / business state 包；确定性编号被占用、已有包不完整或来源不合法时整批失败。排程、返工和待检任务交给责任岗位。发货准备任务按该出货单当前有效检验显示可办理或受阻，不补造历史办理记录。

它重算已发布生产订单的来源待办，并扫描有明细的 `DRAFT` 出货单生成业务准备任务，并给该单仍在草稿或已提交的有效出货前检验补齐品质待办，不推断曾经提交或审批通过；出货放行仍必须从出货页显式提交。命令可执行不表示任何共享库、目标环境或客户数据库已经 dry-run / apply。

来源任务的时间参与幂等校验时统一按 UTC 计算。修复命令可以转换旧记录仅因时区表示不同产生的校验差异：逐项核对来源与原始创建事件，更新任务和业务状态的校验值，追加 `source_time_normalized` 事件，保留原始事件、办理结果和事实。报告中的 `source_time_intents_normalized` 单列转换数；同一时刻以外的日期或内容变化仍阻断。

历史时区匹配仅用于这条显式修复路径，正常业务命令不保留宽松读取。重跑必须不再产生转换事件；已有出货放行任务会被核对，未提交的出货单不会因此生成放行审批。


## 实现命名写入边界

自动生成的 Workflow 任务名称 / payload、核心演示 seed 和试用 MasterData seed 复用 `internal/biz/implementation_naming.go`，避免自动化重新写入编号阶段标签。

普通 MasterData 和客户业务数据不套用开发阶段命名规则；风险等级（内部优先级 P0/P1/P2）、p50/p95/p99 百分位、产品编码和部署技术步骤按原业务 / 技术语义保留。历史数据库残值按需使用只读 SQL 专项盘点，不建立常驻全表扫描流程。

### 任务治理升级边界 / Task Fulfillment Upgrade

| 查什么 | 从哪里看 |
| --- | --- |
| 成品收仓、包装及出货门禁，任务链分页与委外回货 | [接口与升级规则](api.md#任务治理升级边界--task-fulfillment-upgrade) |
| 升级后重算来源待办 | [来源任务修复](#来源任务修复) |

迁移和待办重算分别留痕。迁移前运行只读升级审计，在真实备份的隔离恢复库升级，验证待办修复的 dry-run、apply 和重跑。登记共享库确认具体迁移候选并 apply 后，运行同一候选的 `backfill-workflow-source-tasks`。修复命令只重算待办，库存、质量判定和出货审批由原领域动作负责。客户岗位菜单以配置发布、转换检查和激活结果为准。
