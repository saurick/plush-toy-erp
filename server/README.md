# server 后端说明

图片与业务附件使用统一 S3 存储接口；PG 保存文件元数据和对象 key，文件内容落在 RAID5 上的私有 SeaweedFS。配置、旧文件迁移、独立备份与恢复见 [Compose 附件说明](deploy/compose/prod/README.md#附件存储与raid5)。开发启动同样需要 `ATTACHMENT_S3_*` 配置，迁移前必须先完成旧附件导出校验。

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 环境版本

后端 Go 版本以 `server/go.mod` 为准：`go 1.26.0`，当前 toolchain 为 `go1.26.8`。本机检查走仓库根目录的 `scripts/doctor.sh`，该脚本会在 `server/` 模块内读取实际 Go toolchain，避免只看仓库根目录默认 Go 版本造成误判。

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/doctor.sh
```

若 `doctor` 报 Go 低于 `1.26.8`，先升级 Go 或启用 Go toolchain 自动切换，再执行 `make init`、`make data`、`go test` 或 migration 相关命令。

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / JSON-RPC 接入层
- `service`：DTO 转换、JSON-RPC URL / method 分发、入口级鉴权与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

HTTP transport 日志只记录 operation、JSON-RPC domain / method / id、结果码和耗时，不序列化请求体；密码、验证码、token、附件内容和客户业务参数必须留在脱敏后的业务日志边界内。

## 快速开始

```bash
cd "$(git rev-parse --show-toplevel)/server"
make init
make run
```

`make run`、`make dev` 和 `make dev_restart` 先校验端口清单、当前工作区的迁移及禁止数据库可编程对象规则，再从当前代码构建新制品；构建通过后才停止旧后端，启动并验证新后端。预检或编译失败均保留原进程，不会把旧制品重启当作最新代码已启动；构建或后端切换验证期间检测到后端代码、migration、端口或运行配置更新时，命令丢弃未激活候选或保留已验证候选继续服务，并有界重读、重建，持续多轮仍有写入才明确退出。前端开发页由 Vite 直接读取工作区并热更新，单纯页面改动不会再阻断后端重启；迁移准备仍固定并核对完整前后端候选。构建期间终端分阶段显示后端、附件、页面和候选核对进度；只有最终出现 `started ... health=passed ready=passed business=passed` 才表示本次重启完成，在此之前无需重复执行。成功输出还包含 `workspace-source`、`backend-source` 内容摘要。重复执行 `make dev_restart` 时，后发命令等待同类工作区重启完成，再重新核对并加载届时的当前后端工作区；数据库迁移或迁移页后端恢复仍会立即阻断本次重启。后端保持独立运行，日志在 `output/dev-workbench/database-migration-runtime/`，停止使用 `make dev_stop`。首次使用先执行 `make dev_database_roles`；有待执行迁移时通过迁移页或 `make migrate` 完成检查、恢复演练及确认，启动入口不自动 apply。

人工终端的启动、重启成功后持续显示后端日志，并显示 PID、启动时间、运行版本和日志文件。按 `Ctrl+C` 只退出日志查看，随后可在同一终端执行 `make dev_restart` 或 `make dev_stop`；单独查看已有服务使用 `make dev_logs`，它不构建、不启动、不迁移数据库。Codex、前端冷启动和迁移恢复等非交互入口在 macOS 打开可见的日志终端，优先使用已安装的 iTerm2，否则使用系统 Terminal；已有同工作区日志终端时复用，服务重启后自动切换到新日志。日志查看在重启锁释放后进行，不占用迁移锁；关闭日志终端不停止后端。CI、SSH 和非 macOS 的非交互入口只输出查看指引；需要明确返回且不打开终端时使用 `make dev_restart ARGS=--background`。日志终端打开失败会提示 `make dev_logs`，不改变已经完成的服务验证结果。

重启锁与迁移执行锁共用，避免两次重启互相切换服务，或在迁移维护期间启动业务。排队、数据库预检及构建期间按 `Ctrl+C` 会取消本轮子任务，结束后释放本轮持有的锁；取消排队不会释放前一条命令的锁。构建阶段取消保留原后端；已经开始的服务切换先完成运行核验，再退出，避免取消时留下未验证的进程。若进程被强制结束并留下锁，下一次重启立即报告中断，不再空等 120 秒；通过迁移恢复页刷新状态、核对中断结果后恢复，不直接删除仍被占用的锁或跳过迁移检查。

前端开发页直接使用当前工作区和 Vite 热更新。后端每次启动构建的代码、配置与 migration 快照保存在 `output/dev-workbench/runtime-bundles/`，用于运行身份核对和迁移恢复证据，不覆盖开发页面。数据库迁移的准备阶段保留现有服务，在临时恢复库验证存量升级、附件恢复、PDF 就绪、登录与业务读取；确认后进入维护窗口，重新备份与演练，再迁移、读回和切换。无待执行迁移的代码变更直接使用日常重启入口。详情见 [数据库迁移工作流](../docs/engineering/研发效能工作台与CI-CD设计.md#数据库迁移-__devdatabase-migration)。

终端与迁移页共用忽略 Git 的 `server/.env`（权限 `0600`），固定版本按白名单读取附件、认证及客户运行配置，仅读取文本，不执行 shell。开发附件必须使用独立桶，配置和恢复边界见 [附件存储](deploy/compose/prod/README.md#附件存储与raid5)。数据库角色凭据保存在同样受保护的 `configs/dev/database-roles.local.json`；应用、迁移、审计分别使用 `plush_dev_app`、`plush_dev_migrator`、`plush_dev_backup`。审计账号无表所有权、写入或角色切换权限，不能以超级用户加默认只读参数替代。角色配置中断后使用 `make dev_database_roles ARGS=--reconcile` 恢复已有凭据对应的权限，不生成新密码。

主端口不自动顺延。`make dev_stop` / `make dev_restart` 虽按登记端口查找 listener，但停止前会逐个校验进程 cwd 位于本仓库；端口被其他项目占用时会报告 PID、cwd 和命令并拒绝 kill。前后端共用有超时的进程检查；macOS 通过系统端口表定位 PID，再逐个读取 cwd，避免全机 `lsof` 扫描阻塞启动。检查失败或超时时保留服务并退出。整组本机覆盖必须写入 ignored 的 `config/dev-ports.local.env`，且包含完整端口组。

启动提示区分固定版本不可用与候选升级未完成；候选数据冲突不会把仍与数据库匹配的日常版本停掉。数据库、固定制品或 health / ready 核对失败时，保留迁移恢复入口。

Linux 本地终端确实以 root 运行时，`make run` / `make dev_restart` 会把 `ERP_PDF_ALLOW_LOCAL_NO_SANDBOX=1` 只传给本地后端，供 Playwright Chromium 完成 PDF warmup；服务端还会同时核对 Linux 与 effective UID 0。非 root 本地进程继续启用 Chromium sandbox，生产镜像也不设置该开关，并由运行预检拒绝 root app-server。

登记的本地开发库未显式设置管理员账号或密码时，分别使用 `admin` / `adminadmin`。配置或 `APP_ADMIN_*` 显式值优先；启动只创建缺失账号，不会覆盖已有账号密码。管理员账号创建、初始化和重置密码统一要求 8～20 位，并继续受 bcrypt 72-byte 安全边界保护。若本地验收工具曾改动稳定管理员，使用以下专用命令恢复当前开发库；它会递增认证版本并撤销旧会话，且没有通往演示、验收或生产实例的逃逸开关：

```bash
make reset_local_admin_password
```

本地后端默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，并只在 `make run`、`make dev`、`make dev_restart` 这些本地入口中设置 `ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG=1`。前者避免显式 session 请求读取永绅、而未携带 customer key 的业务 RPC 回落到 `demo`；后者只允许本地服务接收带 `local_test_apply` 标记的测试 revision。专用别名仍可用于强调意图：

```bash
make run_yoyoosun
make dev_restart_yoyoosun
```

客户选择随每次构建记录到运行制品；更改 `server/.env` 中的 `ERP_CUSTOMER_KEY` 后执行 `make dev_restart`，或在本次重启时显式设置该变量，新配置经业务验证后生效。前端构建复用 `apply-customer-web-config.mjs` 将同一客户的公开配置与素材写入固定制品；客户业务配置仍须在开发控制台显式发布、激活并读回，上述启动目标不会代为操作。未通过本地 Make 入口启动的后端默认拒绝 local-test manifest 及其切换操作；本地 gate 开启时，启动预检和 JSON-RPC dispatcher 会基于同一份启动时配置，按 pgx 最终连接结果把 DSN 固定到 `192.168.0.133:5432` 上的 `plush_erp` 或 `plush_erp_*_dev` 开发库，不会因运行中修改环境变量、query override、multi-host fallback 或 `ERP_ALLOW_TEST_DB_AS_DEV=1` 放行 133 其他实例或 loopback tunnel。人工验收数据 runner 另行把 `local-dev` 精确绑定到当前版本的隔离验收库，不会写共享开发库；production 配置发现该环境开关时也会直接失败。

## 常用命令

在 `server/` 执行；先按当前任务选择所需项。

| 目的 | 命令与说明 |
| --- | --- |
| 启动 / 重启 / 停止 | `make run` / `make dev_restart` / `make dev_stop`，先做只读预检 |
| 协议 / 配置生成 | `make api` / `make config`，构造注入见 `go generate ./cmd/server` |
| 模型、Ent 和版本化迁移 | `make data`，随后核对生成差异与零漂移 |
| 共享开发库迁移 | 交互 `make migrate`；非交互按同一次 `make migrate_prepare` 回执执行 `make migrate_execute` |
| 普通测试 / 构建 | `go test ./...` / `make build`；普通测试不代替真实 PostgreSQL 事务验证 |
| 本地管理员恢复 | `make reset_local_admin_password`，撤销旧会话，范围仅登记开发库 |

## 迁移说明

操作合同统一见 [Ent + Atlas](docs/ent.md)。模型生成、隔离验证与目标库 apply 分别留证据；生产只使用 [prod Compose 迁移入口](deploy/compose/prod/README.md)，不由本地命令代替。

## 目录结构（简版）

| 路径                   | 职责                                                                                                                                                                                                                                          |
| --- | --- |
| `api/`、`internal/conf/` | 协议与配置结构、生成入口 |
| `cmd/` | 服务、迁移、受控 seed 与恢复命令 |
| `internal/server/`、`internal/service/` | HTTP / JSON-RPC 接入、鉴权、DTO 和调用编排 |
| [internal/biz](internal/biz/README.md) | 业务 usecase 与真源边界 |
| [internal/core](internal/core/README.md) | 无 IO 的领域规则、值对象、状态机与计算 |
| [internal/data](internal/data/README.md) | 数据与外部依赖、Ent schema / migration |
| `internal/devdbguard/`、`internal/errcode/` | 登记目标保护与错误码真源 |
| `pkg/`、`third_party/` | 复用基础设施、第三方协议依赖 |
| `configs/`、[deploy](deploy/README.md)、[docs](docs/README.md) | 环境配置、部署与后端专题 |

## 文档索引

| 主题 | 唯一维护入口 |
| --- | --- |
| 启动、HTTP、健康与来源任务修复 | [服务运行](docs/runtime.md) |
| 环境配置与账号初始化 | [配置说明](docs/config.md) |
| JSON-RPC 领域方法、状态、权限和幂等 | [API 合同](docs/api.md) |
| Ent / Atlas 与共享开发库迁移 | [模型与迁移](docs/ent.md)、[生成的数据字典](docs/database/README.md) |
| 日志、Trace 与审计 | [可观测性](../docs/observability/日志链路追踪审计第一版.md) |
| PostgreSQL 事务与定向验证 | [QA 脚本](../scripts/qa/README.md#postgresql-领域事务验证) |
| 目标机发布、附件存储、备份与恢复 | [部署总览](deploy/README.md)、[prod Compose](deploy/compose/prod/README.md) |

## 实现命名写入边界

自动化命名统一复用后端 validator；适用范围见 [服务运行说明](docs/runtime.md#实现命名写入边界)。

## 部署

当前运行主路径是 `server/deploy/compose/prod`。目标机只加载不可变制品并执行正式迁移和运行检查；发布证据与客户 UAT 分别验收。
