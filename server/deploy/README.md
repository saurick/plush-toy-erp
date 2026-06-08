# server/deploy 说明

当前仓库只保留一条部署主路径：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。

部署构建边界：目标服务器配置较低，只负责加载已构建镜像、启动 Compose、执行 migration 和部署后检查；服务端/前端镜像必须先在本地或 CI 构建完成，再上传到服务器。不要在服务器上执行 `docker build`、`pnpm build`、`go build`、`make build_server` 等重构建步骤。

Atlas migration 在生产 / 低配服务器上统一使用宿主机 `/usr/local/bin/atlas`。不要拉起 `arigaio/atlas:*` 临时容器，也不要把 Atlas 增加到 Compose；迁移脚本应使用宿主机可达的 PostgreSQL 端口和 `flock /tmp/atlas-migrate.lock`。

## 目录职责

### `compose/prod`

- 单机或单宿主机部署入口
- 默认包含 PostgreSQL、Jaeger、业务服务、前端单入口静态服务和基础 smoke 检查
- 服务端镜像内置 Chromium / CJK 字体用于 `/templates/render-pdf`，Compose 默认通过 `ERP_PDF_CHROME_PATH=/usr/bin/chromium` 和 `ERP_PDF_RENDER_CONCURRENCY=2` 控制 PDF 引擎
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
- `APP_JWT_SECRET`
- `APP_ADMIN_USERNAME`
- 任何默认 JWT 密钥和管理员密码

说明：生产 Compose 默认不注入 `APP_ADMIN_PASSWORD`，避免环境变量长期覆盖配置文件里的管理员初始化口径。只有明确需要通过环境变量覆盖首次初始化密码时才临时添加；如果 `admin` 已经存在，重启不会重置旧密码，应通过管理员改密或受控 SQL 更新密码哈希。

建议先执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
```

然后再执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```
