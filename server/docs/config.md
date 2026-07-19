# 服务配置说明

本文档对应：

- `/Users/simon/projects/plush-toy-erp/server/internal/conf/conf.proto`
- `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml`
- `/Users/simon/projects/plush-toy-erp/server/configs/prod/config.yaml`

## 顶层结构

当前配置分为 4 组：

- `server`
- `log`
- `trace`
- `data`

## `server`

用于定义监听地址和超时：

- `server.http.addr`
- `server.http.timeout`
- `server.grpc.addr`
- `server.grpc.timeout`

默认值：

- HTTP `0.0.0.0:8300`
- gRPC `0.0.0.0:9300`
- `server.http.timeout=45s`，给 `/templates/render-pdf` 这类重渲染链路留出稳定完成窗口
- `server.grpc.timeout=10s`

## `log`

- `log.debug`
  - `true` 时更适合本地开发
  - `false` 时更适合生产环境

## `trace`

当前只保留 `jaeger` 这一组字段：

- `trace.jaeger.traceName`
- `trace.jaeger.endpoint`
- `trace.jaeger.ratio`

说明：

- `traceName` 为空时，会回退到 `cmd/server/main.go` 里的默认服务名。
- `endpoint` 为空时，服务仍能启动，只是使用本地无 exporter 的 tracer provider。
- `ratio` 会被夹到 `[0,1]`；生产默认低采样，排障时可临时调高，`1` 表示全量采样。
- 当前通过 OTLP HTTP exporter 发 trace，仓库默认内置 Jaeger 作为 tracing 存储和查询入口。
- 宿主机本地调试当前默认连 `192.168.0.106:4318`；若本机 Jaeger VM IP 变化，需同步改 dev 本地配置。
- 宿主机线上进程当前默认连 `127.0.0.1:4318`。
- Compose 里的 `app-server` 容器仍通过 `TRACE_ENDPOINT=jaeger:4318` 走容器网络，不读宿主机的 `127.0.0.1`。
- Compose 里的 `TRACE_RATIO` 可覆盖 `trace.jaeger.ratio`，默认 `0.1`。
- Compose 里的 Jaeger 宿主机端口默认由 `JAEGER_BIND_ADDR=127.0.0.1` 只绑定 loopback；需要远程查看时优先使用 SSH tunnel。
- 如果后续改用其他 OTLP 兼容后端，只需替换 endpoint 和服务名即可。

## `data.postgres`

- `data.postgres.dsn`
- `data.postgres.debug`

说明：

- 这是当前仓库唯一真正运行时必需的数据依赖。
- `debug=true` 时会输出更多 SQL 调试信息，更适合开发环境。
- `data.postgres.debug` 只控制 Ent SQL debug 日志；SQL trace 独立接入 `otelsql`，当前不写入 SQL text、语句模板、bind args 或 SQL 参数值。
- 本地开发默认 DSN 已收口到共享 PG `192.168.0.106:5432/plush_erp`。
- 若你在数据库客户端里使用的是 `zos_test_user` 等其他账号，应该通过 `server/configs/dev/config.local.yaml` 或环境变量覆盖用户名和密码，而不是改公共仓库默认值。

## `data.etcd`

- `data.etcd.hosts`

说明：

- 当前配置骨架里保留了这一组字段，方便后续继续扩展。
- 但当前默认代码路径并未真正初始化 etcd 客户端，所以它只是扩展位，不是现阶段必填运行依赖。

## `data.auth`

- `data.auth.jwtSecret`
- `data.auth.jwtExpireSeconds`
- `data.auth.sms.mode`
- `data.auth.admin.username`
- `data.auth.admin.password`

说明：

- 这组字段决定用户 token 签名和默认管理员初始化逻辑。
- 必须替换仓库里的默认 JWT 密钥。登记的本地开发库中，管理员账号或密码留空时分别使用 `admin` / `adminadmin`；`config.local.yaml`、显式配置字段或 `APP_ADMIN_*` 会覆盖对应默认值。
- 本地默认值只用于首次创建缺失管理员，不会在每次启动时重置已有账号。已有开发库凭据漂移时使用 `make reset_local_admin_password`；该命令只接受登记开发库、要求账号绑定的精确确认、递增认证版本并撤销旧会话。
- 生产和 133 试用环境没有这组本地默认值。生产新库只有在 `BOOTSTRAP_ADMIN_ONCE=true` 时才允许通过 `APP_ADMIN_PASSWORD` 临时注入独立密码。
- `data.auth.sms.mode` 控制短信登录运行时能力，当前支持 `disabled`、`mock` 和 `provider`：
  - `disabled`：关闭短信登录，`auth.capabilities` 返回不可用，`send_sms_code` / `sms_login` 返回 `AuthSMSLoginDisabled`。
  - `mock`：仅用于 local / dev / test，后端返回 `mock_code` 方便本地回归。
  - `provider`：接入阿里云号码认证 PNVS 短信认证，后端调用 `SendSmsVerifyCode` 发送验证码并调用 `CheckSmsVerifyCode` 核验；生产必须通过 env / 密钥管理提供阿里云配置。
- `provider` 模式下，阿里云频控返回 `AuthSMSCodeTooFrequent`，套餐 / 余额 / 额度不足返回 `AuthSMSServiceQuotaExceeded`，服务异常、网络超时或服务商拒绝发送 / 核验返回 `AuthSMSServiceUnavailable`；前端按错误码展示中文提示，不透传阿里云原始错误。
- dev 默认 `mock`，prod 默认 `disabled`；生产环境禁止返回 mock 验证码，启动校验会拒绝 `APP_AUTH_SMS_MODE=mock` 或配置文件里的 `data.auth.sms.mode: mock`。
- 短信登录是后端 Auth 能力配置，不是客户业务配置包、`tenant_id` 或 SaaS tenant 级认证策略。

## Auth 运行环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_JWT_SECRET` | 读取配置文件 | 覆盖 `data.auth.jwtSecret`，不在日志中输出密钥明文 |
| `APP_AUTH_SMS_MODE` | 读取配置文件 | 覆盖 `data.auth.sms.mode`，当前支持 `disabled` / `mock` / `provider` |
| `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID` | 空 | `provider` 模式必填，阿里云 PNVS RAM AccessKey ID |
| `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET` | 空 | `provider` 模式必填，阿里云 PNVS RAM AccessKey Secret，不写入 Git、日志、trace 或测试输出 |
| `APP_AUTH_SMS_ALIYUN_SIGN_NAME` | 空 | `provider` 模式必填，PNVS 短信认证签名，例如控制台赠送签名 |
| `APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE` | 空 | `provider` 模式必填，PNVS 短信认证模板，例如登录 / 注册模板 `100001` |
| `APP_AUTH_SMS_ALIYUN_TEMPLATE_PARAM` | `{"code":"##code##","min":"5"}` | PNVS 模板参数，默认让阿里云生成验证码并写入 `code` 变量 |
| `APP_AUTH_SMS_ALIYUN_SCHEME_NAME` | 空 | PNVS 认证方案名，空值使用阿里云默认方案 |
| `APP_ADMIN_USERNAME` | 本地开发为 `admin`；其它环境读取配置文件 | 覆盖管理员账号 |
| `BOOTSTRAP_ADMIN_ONCE` | `false` | 仅在新库首次初始化 bootstrap 管理员时临时设为 `true`；成功后写 marker 并恢复为 `false` |
| `APP_ADMIN_PASSWORD` | 本地开发为 `adminadmin`；其它环境为空 | 本地覆盖默认密码；生产仅在 `BOOTSTRAP_ADMIN_ONCE=true` 的首次初始化窗口临时注入；已有同名管理员不会被自动重置或提权 |

生产启动会阻断 `POSTGRES_DSN`、`APP_JWT_SECRET`、阿里云 PNVS 必填配置或 bootstrap 管理员密码中的 `change-this` / placeholder，显式拒绝已知本地开发默认密码，并拒绝 SMS mock、未显式关闭的 debug seed / cleanup。Compose 默认不注入 `APP_ADMIN_PASSWORD`，避免环境变量长期覆盖配置文件里的管理员初始化口径。只有新库首次初始化需要创建 bootstrap 管理员时，才允许同时临时设置 `BOOTSTRAP_ADMIN_ONCE=true` 和 `APP_ADMIN_PASSWORD`；初始化成功后会写入 runtime marker 和 runtime audit event，后续重复 bootstrap 会被拒绝。如果 `admin` 或同名管理员已经存在，启动逻辑不会重置密码，也不会自动提权，应通过管理员改密或受控 SQL 更新密码哈希。本地专用重置命令无生产或 133 逃逸开关。当前产品不提供公开自助注册 API 或前端路由，协作账号来源回到受控初始化或后续账号管理流程。

## HTTP 安全响应头

后端 HTTP 服务统一写入基础安全响应头，覆盖 JSON-RPC、健康检查、模板 PDF 和后端静态 handler：

- `Content-Security-Policy`
- `Referrer-Policy: same-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

CSP 当前保留 `script-src 'unsafe-inline'` 和 `style-src 'unsafe-inline'`，用于兼容现有前端构建和模板渲染；后续若要收紧到 nonce / hash，应先做前端生产构建和模板 PDF 回归。

## 角色演示账号 seed

角色演示账号不属于 `data.auth` 配置，不写入 `conf.proto`，也不进入 `server/configs/dev|prod/config.yaml`。需要切换角色或同时登录多个岗位做开发 / 验收时，应显式执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/seed-role-demo-admins.sh
```

该脚本可生成 `demo_boss`、`demo_sales`、`demo_purchase`、`demo_production`、`demo_warehouse`、`demo_quality`、`demo_finance`、`demo_pmc`、`demo_engineering` 和 `demo_admin`，每个账号只绑定对应内置角色，权限仍来自 `roles -> role_permissions` 真源。默认不生成 `debug_operator` 账号；如果确需调试权限账号，必须显式加 `--include-debug`。

无显式密码时，脚本只允许连接登记的 `192.168.0.106:5432/plush_erp_*_dev` 隔离开发库，并以公开测试密码 `12345678` 生成九个普通业务角色账号；不会生成 `demo_admin`、`demo_debug`，也不会重置人工验收场景账号。`demo_admin`、调试账号、人工验收账号或完整角色回归必须通过 `--password` 或 `ERP_ROLE_DEMO_PASSWORD` 显式提供非默认密码。已有账号仍需加 `--reset-password` 才会重置密码。公开测试值一旦 seed 就是可登录凭据，不得写入共享、试用、staging 或生产目标。

安全边界：

- 生产默认不应生成角色演示账号；脚本默认拒绝 `configs/prod` 或 `APP_ENV / ERP_ENV / GO_ENV=prod|production`。
- 显式传入的覆盖密码只通过 `ERP_ROLE_DEMO_PASSWORD` 或命令参数临时提供，脚本不会把覆盖值写入配置文件。公开测试值即使显式传入也只能用于登记的隔离 `*_dev` 库；使用 `--allow-prod` 时必须提供非默认密码。
- 已有演示账号重跑时默认不重置密码，只恢复 `disabled=false`、`is_super_admin=false` 和单一角色绑定；如需重置必须显式加 `--reset-password`。

## debug seed / cleanup 环境变量

业务链路调试的 seed（生成调试数据）、按 debugRunId cleanup（清理调试数据）和全量业务数据清空不写入 `conf.proto`，只通过运行时环境变量显式启用，避免把调试写入开关固化到公共配置文件：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ERP_DEBUG_ENV` | `sql` | 仅用于能力面板展示，可显式设为 `local`、`dev`、`shared`、`remote`、`prod` 等环境名 |
| `ERP_DEBUG_SEED_ENABLED` | `false` | 仅在受控调试环境显式设为 `true` 时允许生成调试数据 |
| `ERP_DEBUG_CLEANUP_ENABLED` | `false` | 仅在受控调试环境显式设为 `true` 时允许按 debugRunId 清理；不再连带开启全量业务清空 |
| `ERP_DEBUG_BUSINESS_CLEAR_ENABLED` | `false` | 全量业务清空独立开关；仅 `ERP_DEBUG_ENV=local|dev` 时可用，shared / remote / prod / 默认 `sql` 均拒绝 |
| `ERP_DEBUG_CLEANUP_SCOPE` | `debug_run` | 当前只允许 `debug_run`，表示必须按 debugRunId 清理 |

## PDF 运行环境变量

在线 PDF 使用后端 `/templates/render-pdf` 和 Headless Chromium。生产镜像已内置 Debian `chromium` 与 `fonts-noto-cjk`；Chromium 精确固定为已在目标宿主验证的 `150.0.7871.100-1~deb12u1`，构建时校验包版本，升级必须显式修改 pin 并重跑目标 PDF smoke。Compose 默认设置：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ERP_PDF_CHROME_PATH` | `/usr/bin/chromium` | Chrome / Chromium 可执行文件路径；本地开发可留空由服务自动探测系统 Chrome |
| `ERP_PDF_RENDER_CONCURRENCY` | `4` | 同时渲染 PDF 的服务端默认上限；通用 Compose 使用 4，高配客户实例可配 8，并同步提高 `APP_MEM_LIMIT` |
| `ERP_PDF_WARMUP` | `async` | 正式发布预热开关；服务启动后异步跑一次中文合同 PDF 渲染，提前启动共享 Chromium 并加载 CJK 字体；`/readyz` 在预热完成前或预热失败后保持未就绪。`off` 只用于临时故障隔离，会被 production preflight 判为非 release-ready，且不能替代真实 PDF smoke |

生产镜像固定以 `app`（uid / gid `10001`）运行，Chrome 参数不允许 `--no-sandbox` 或 `--disable-setuid-sandbox`。`production-preflight --runtime` 会同时拒绝 root app-server、非 `async` warmup 和偏离 Docker exact pin 的 Chromium；静态配置绿色仍不能替代容器内 sandbox 启动和受控 token 的真实 PDF smoke。
安全边界：

- seed、debugRunId cleanup 和全量业务数据清空默认关闭，必须分别显式启用；开启 scoped cleanup 不会隐式开启全量清空。
- cleanup 必须提供 debugRunId，后端只清理带 `DBG-<debugRunId>` 前缀且 payload 中包含 debug 标记的数据。
- 全量业务清空不要求 debugRunId，但默认 `dryRun=true`，只统计 allowlist 中各表的匹配数量；实际删除必须传 `dryRun=false` 与精确确认短语 `CLEAR_ALL_PROJECT_BUSINESS_DATA`，并且只允许 local / dev。
- 全量清空只覆盖本项目当前业务表 allowlist；不会删除账号、权限、管理员偏好、客户配置和数据库结构。
- 前端隐藏按钮不作为安全边界；后端仍会检查管理员身份、业务链路调试菜单权限、环境开关和 debug 标记。

## 初始化后必须改的字段

以下内容不应直接进入交付项目：

- `data.postgres.dsn`
- `data.auth.jwtSecret`
- `data.auth.admin.username`
- `data.auth.admin.password`
- `trace.jaeger.traceName`
- `trace.jaeger.endpoint`

仓库内生产配置只保留占位值，不保留 token 形态样例、真实 webhook token、真实短信供应商 token、阿里云 AK Secret 或聊天群 ID。需要接入外部通知或短信服务商时，只能通过生产 `.env` / 密钥管理注入，并在日志、trace、文档和测试输出中保持脱敏。

## 配置选择建议

- 本地开发：
  - `log.debug=true`
  - `data.postgres.debug=true`
  - `trace.jaeger.ratio=1`
- 生产环境：
  - `log.debug=false`
  - `data.postgres.debug=false`
  - `trace.jaeger.ratio=0.1` 或按观测成本调整

## 额外建议

- 生产环境不要把最终密钥长期写死在仓库中的 YAML 文件里。
- 如果项目会长期运行，建议把敏感配置迁移到 `.env`、密钥管理服务、K8s Secret 或其他外部注入方式。
