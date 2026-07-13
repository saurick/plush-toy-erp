# yoyoosun 安全检查 / Security Checklist

## Secret

- [ ] 资料包不包含真实 `.env`。
- [ ] 资料包不包含 `.pem`、`.key`、`.sql`、`.dump`。
- [ ] evidence 不包含 token、cookie、Authorization header。
- [ ] 日志摘要不包含完整 DSN 或密码。
- [ ] 截图已遮挡手机号、地址、金额、订单敏感号和个人信息。

## 生产危险配置

- [ ] public register 关闭。
- [ ] SMS mock 关闭。
- [ ] debug seed 关闭。
- [ ] debug cleanup 关闭。
- [ ] 全量业务数据清空关闭。
- [ ] SQL args tracing 关闭。
- [ ] CORS 不是 `*`。
- [ ] 默认管理员密码已修改或首次初始化后已移除临时注入。

## 网络与访问

- [ ] HTTPS 如启用则证书有效。
- [ ] Nginx 配置测试通过。
- [ ] 只暴露必要端口。
- [ ] 数据库端口暴露范围符合部署方案。

## 权限

- [ ] super admin 边界已确认。
- [ ] disabled 管理员不可登录。
- [ ] 普通管理员只拥有角色权限。
- [ ] 角色权限变更有审计。
- [ ] 前端菜单隐藏不作为唯一安全边界。

## 资料包 lint

- [ ] `node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun` 通过。
- [ ] `bash deployments/yoyoosun/scripts/verify-env.sh --example` 通过。
