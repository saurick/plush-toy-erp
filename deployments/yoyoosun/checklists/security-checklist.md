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

## 个人信息告知与委托处理

- [ ] `/legal/privacy` 与 `/legal/system-rules` 在未登录状态可查阅，登录页、电脑账号菜单和手机“我的”均有入口。
- [ ] `customer-config.js` 中的处理者名称、联系渠道、主要存储位置和跨境口径与本次部署一致。
- [ ] 短信登录未启用时不发送手机号；启用时外部处理方清单与实际供应商一致。
- [ ] 新账号对当前内容版本写入一条不含手机号、密码、token 或业务原文的知悉审计；内容变化会重新提示。
- [ ] 账号、安全日志、业务与审计记录的实际保存和删除制度已由甲方确认，网络运行与安全日志不少于适用的六个月要求。
- [ ] 如实施、托管、运维、短信或备份方会受托处理个人信息，双方已在受控合同系统签署委托处理协议；仓库模板不作为签署证据。

## 资料包 lint

- [ ] `node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun` 通过。
- [ ] `bash deployments/yoyoosun/scripts/verify-env.sh --example` 通过。
