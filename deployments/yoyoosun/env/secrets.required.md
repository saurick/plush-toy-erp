# yoyoosun 部署必需 Secret / Required Secrets

以下值必须通过服务器环境变量、Docker Secret、CI Secret 或受控配置文件注入，不允许提交到 Git。

## 必需项

| Secret | 用途 | 注入位置 | 轮换要求 |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 账号密码 | 生产 `.env` 或 Docker Secret | 上线前固定，泄露后立即轮换 |
| `POSTGRES_DSN` | 服务端数据库连接串 | 生产 `.env` | 密码变更后同步更新 |
| `APP_JWT_SECRET` | 登录 token 签名 | 生产 `.env` 或 Secret | 泄露后立即轮换并要求重新登录 |
| `APP_ADMIN_PASSWORD` | 仅首次初始化管理员时临时使用 | 与 `BOOTSTRAP_ADMIN_ONCE=true` 一起受控一次性注入 | 初始化成功写入 marker 后移除，不长期保留 |
| `BACKUP_ENCRYPTION_KEY` | 备份加密 | 外部密钥管理或受控文件 | 按备份策略轮换 |
| `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID` | 阿里云短信访问标识 | 生产 `.env` 或外部 Secret | 泄露后立即轮换 |
| `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET` | 阿里云短信访问密钥 | 生产 `.env` 或外部 Secret | 泄露后立即轮换 |
| `APP_AUTH_SMS_ALIYUN_SIGN_NAME` | 已审核短信签名 | 生产 `.env` 或外部 Secret | 签名变更后同步更新 |
| `APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE` | 已审核验证码模板 | 生产 `.env` 或外部 Secret | 模板变更后同步更新 |
| `OBJECT_STORAGE_SECRET` | 对象存储，如启用 | 外部 Secret | 泄露后立即轮换 |

## 禁止项

- 禁止把真实 secret 写入 `.env.example`。
- 禁止把真实 `.env`、`.env.production`、`.env.customer-trial` 提交到 `deployments/yoyoosun`。
- 禁止在 runbook 中记录真实 token、真实数据库连接串或真实下载链接。
- 禁止在 evidence 中粘贴带 secret 的终端输出。
- 禁止在截图中展示 token、密码、手机号、地址、价格或客户敏感订单明细。

## 验证

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --env-file /secure/path/yoyoosun/.env
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
```

真实 env 校验必须在受控服务器或受控工作站执行；命令输出不得包含 secret 明文。
