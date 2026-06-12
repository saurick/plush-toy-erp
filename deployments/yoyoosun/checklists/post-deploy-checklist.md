# yoyoosun 部署后检查 / Post-deploy Checklist

## 健康检查

- [ ] `app-server` 容器状态正常。
- [ ] `web-desktop` 容器状态正常。
- [ ] PostgreSQL healthcheck 通过。
- [ ] server `/healthz` 返回 ok。
- [ ] server `/readyz` 返回 ready。
- [ ] web `/healthz` 返回 ok。
- [ ] Nginx / HTTPS 如启用则访问正常。

## Migration

- [ ] migration status 已记录。
- [ ] migration after version 符合 release 预期。
- [ ] 无 dirty / failed migration。

## 功能

- [ ] 登录成功。
- [ ] `auth.me` 返回角色和权限码。
- [ ] 后台首页打开。
- [ ] 岗位任务端 `/m/<role>/tasks` 打开。
- [ ] 核心只读页面打开。
- [ ] 权限菜单符合预期。
- [ ] 不出现 Phase 命名菜单、demo 数据入口或 test fixture 入口。

## 安全与运维

- [ ] 生产危险配置仍关闭。
- [ ] evidence 中无 secret 明文。
- [ ] 日志无明显 `panic`、`fatal` 或持续 `error`。
- [ ] 备份任务状态正常。
- [ ] 发布后旧镜像 / builder cache 清理按规则执行，未删除 volume。

## 收口

- [ ] release evidence 完成。
- [ ] known limitations 更新。
- [ ] 客户访问确认或内部试用确认已记录。
