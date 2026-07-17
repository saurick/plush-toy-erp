# server/deploy 说明

当前仓库只保留一条部署主路径：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。

部署构建边界：目标服务器配置较低，只负责加载已构建镜像、启动 Compose、执行 migration 和部署后检查；服务端/前端镜像必须先在本地或 CI 构建完成，再上传到服务器。不要在服务器上执行 `docker build`、`pnpm build`、`go build`、`make build_server` 等重构建步骤。

Atlas migration 在生产 / 低配服务器上统一使用宿主机 `/usr/local/bin/atlas`。不要拉起 `arigaio/atlas:*` 临时容器，也不要把 Atlas 增加到 Compose；迁移脚本应使用宿主机可达的 PostgreSQL 端口，并在同一个私有 `flock /run/lock/plush-toy-erp/atlas-migrate.lock` 锁内完成 `status -> 20260714055504 存量升级只读审计 -> 20260714055825 客户配置切换只读审计 -> dry-run -> apply`，避免并发发布在步骤之间穿插。`--status-only` 只查看状态，不执行后续步骤。

升级链跨越 `20260714055504` 或 `20260714055825` 时，必须在 apply 前分别通过 `scripts/qa/populated-upgrade-preflight.sh --audit populated-upgrade` 和 `--audit customer-config-cutover`。两项审计只读检查现存行，不执行 migration，也不自动 `INSERT / UPDATE / DELETE`；发现阻断数据后应停止发布，按单独评审的人工治理方案处理并保留审计与回滚证据。fresh schema、静态 DDL 或空库 Atlas 通过只能证明迁移链可执行，不能替代 populated upgrade 证据；备份恢复演练也必须在 restored DB 上先审计、再 apply。

## 目录职责

### `compose/prod`

- 单机或单宿主机部署入口
- 默认包含 PostgreSQL、Jaeger、业务服务、前端单入口静态服务和基础 smoke 检查
- 服务端镜像内置 Chromium / CJK 字体用于 `/templates/render-pdf`，Compose 默认通过 `ERP_PDF_CHROME_PATH=/usr/bin/chromium` 和 `ERP_PDF_RENDER_CONCURRENCY=4` 控制 PDF 引擎；高配客户实例可在独立部署配置中提高并发和容器内存预算
- 提供迁移脚本，不再保留远端增量发布脚本

关键文件：

- `compose.yml`
- `.env.example`
- `migrate_online.sh`

详细说明见 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/README.md`。

## 必须替换的占位

- `POSTGRES_PASSWORD`
- `POSTGRES_DSN`
- `APP_IMAGE`
- `WEB_IMAGE`
- `POSTGRES_IMAGE` 和 `JAEGER_IMAGE` 必须使用固定版本 tag，不能用 `latest` / `dev`
- `APP_JWT_SECRET`
- `APP_AUTH_SMS_MODE=disabled`，生产环境不能使用 `mock`；如启用 `provider`，必须同时通过运行时 Secret 注入阿里云 PNVS `APP_AUTH_SMS_ALIYUN_*` 配置
- `APP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_ONCE=false`；只有新库首次初始化 bootstrap 管理员时才临时改为 `true`
- `POSTGRES_BIND_ADDR=127.0.0.1`，PostgreSQL 宿主机映射只允许 loopback
- `APP_HTTP_BIND_ADDR=127.0.0.1` 和 `APP_GRPC_BIND_ADDR=127.0.0.1`，后端宿主机端口只允许 loopback；外部业务流量先进入前端 / 网关
- `WEB_DESKTOP_BIND_ADDR=0.0.0.0`，普通内网部署前端默认对宿主机网络开放；也允许改为 `127.0.0.1` 交给同机网关。`customer-trial-133` 必须精确使用 `127.0.0.1` 并通过 SSH tunnel 验收
- `ERP_DEBUG_ENV=prod`
- `ERP_DEBUG_SEED_ENABLED=false`
- `ERP_DEBUG_CLEANUP_ENABLED=false`
- `ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false`
- 任何默认 JWT 密钥；新库首次初始化 bootstrap 管理员时再临时注入 `APP_ADMIN_PASSWORD`

说明：生产启动会阻断 `POSTGRES_DSN`、`APP_JWT_SECRET` 或 bootstrap 管理员密码中的 `change-this` / placeholder，拒绝已知本地开发默认密码，并拒绝 SMS mock、未显式关闭的 debug seed、按 run cleanup 和全量业务清空。生产 Compose 默认不注入 `APP_ADMIN_PASSWORD`，避免环境变量长期覆盖配置文件里的管理员初始化口径。只有新库首次初始化需要创建 bootstrap 管理员时，才允许同时临时设置 `BOOTSTRAP_ADMIN_ONCE=true` 和 `APP_ADMIN_PASSWORD`；初始化成功后会写入 runtime marker 和 runtime audit event，后续重复 bootstrap 会被拒绝。已有 `admin` 或同名管理员不会被启动逻辑自动提权，应通过管理员改密或受控 SQL 更新密码哈希。

建议先执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
```

然后再执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```
