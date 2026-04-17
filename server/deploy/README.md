# server/deploy 说明

当前仓库只保留一条部署主路径：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。

## 目录职责

### `compose/prod`

- 单机或单宿主机部署入口
- 默认包含 PostgreSQL、业务服务和基础 smoke 检查
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
- 任何默认 JWT 密钥和管理员密码

建议先执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
```

然后再执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```
