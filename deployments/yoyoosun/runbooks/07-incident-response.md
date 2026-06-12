# yoyoosun 故障处理 / Incident Response Runbook

## 通用流程

1. 记录发现时间、影响范围、当前 release、操作人角色。
2. 判断是否需要暂停客户使用或切流。
3. 收集最小 evidence：health、ready、compose ps、最近错误日志摘要、migration status。
4. 先定位服务归属，再决定是否回滚、修复配置或修代码。
5. 处理后执行 smoke，并写入 incident evidence。

## 常见故障

| 现象 | 检查 | 初步处理 |
| --- | --- | --- |
| 服务无法启动 | `docker compose ps`、容器日志摘要 | 核对 image tag、env、端口、内存 |
| 数据库连接失败 | PostgreSQL health、`POSTGRES_DSN` 脱敏摘要 | 核对密码 URL 编码、端口、容器网络 |
| migration 失败 | `migrate_online.sh --status-only` | 停止 apply，按 migration runbook 处理 |
| 磁盘满 | `df -h /`、`docker system df` | 清理未使用镜像和 builder cache，不删除 volume |
| 登录失败 | `/readyz`、auth RPC、账号禁用状态 | 区分未登录、账号禁用、权限不足和密码错误 |
| 权限异常 | `auth.me`、角色权限矩阵 | 后端 RBAC 是安全边界，前端菜单不是 |
| 导入失败 | dry-run report、unresolved queue | 当前不执行真实导入；只处理 dry-run / report |
| 页面 500 | web console 摘要、server 日志摘要 | 记录路由、release、request id，如有 |
| Nginx/HTTPS 问题 | Nginx config test、证书有效期 | 不在本仓库记录私钥或真实证书内容 |

## 日志脱敏

提交到 evidence 前必须移除：

- token、cookie、Authorization header。
- 完整 DSN、密码、access key。
- 手机号、地址、客户敏感订单号。
- 未脱敏金额 / 价格明细。

## 升级处理

如果影响库存、出货、财务、真实客户数据或登录安全，必须停止继续操作并升级为正式故障评审，不用局部 workaround 掩盖根因。
