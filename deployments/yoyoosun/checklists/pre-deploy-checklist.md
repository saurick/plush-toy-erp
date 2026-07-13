# yoyoosun 部署前检查 / Pre-deploy Checklist

## Release

- [ ] Release version 已固定。
- [ ] Git commit 已记录。
- [ ] Server image tag 和 digest 已记录。
- [ ] Web image tag 和 digest 已记录。
- [ ] Release notes 和 known limitations 已确认。
- [ ] 回滚负责人和停机窗口已确认。

## 配置

- [ ] 生产 `.env` 位于受控外部路径，未提交到 Git。
- [ ] `POSTGRES_DSN` 已确认目标库，密码已按 URL 规则编码。
- [ ] `APP_JWT_SECRET` 非 placeholder。
- [ ] `POSTGRES_PASSWORD` 非 placeholder。
- [ ] `APP_ADMIN_PASSWORD` 如需首次初始化，仅与 `BOOTSTRAP_ADMIN_ONCE=true` 一起一次性注入；初始化成功后移除并恢复为 `false`。
- [ ] `ERP_DEBUG_ENV=prod`。
- [ ] `ERP_DEBUG_SEED_ENABLED=false`。
- [ ] `ERP_DEBUG_CLEANUP_ENABLED=false`。
- [ ] `ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false`。
- [ ] public register 关闭。
- [ ] SMS mock 关闭。
- [ ] SQL args tracing 关闭。
- [ ] CORS 不是 `*`。

## 服务器

- [ ] Docker / Compose 可用。
- [ ] `/usr/local/bin/atlas` 可用。
- [ ] `MIGRATION_LOCK_FILE` 使用专用私有绝对路径，不在 `/tmp` / `/var/tmp` / `/dev/shm`。
- [ ] 数据目录、附件目录和备份目录存在。
- [ ] 磁盘空间充足。
- [ ] 不在目标服务器执行构建命令。
- [ ] 旧镜像回滚信息已记录。

## 数据与导入

- [ ] pre-migration 数据库备份已完成。
- [ ] 备份 id、hash、大小和存储别名已记录。
- [ ] 当前无未经审批的真实导入 apply。
- [ ] dry-run / unresolved queue 状态已记录。

## 文档与证据

- [ ] `release-evidence.md` 草稿已创建。
- [ ] `backup-evidence.md` 已准备，且 backupPurpose 明确为 pre-migration / pre-deploy。
- [ ] `migration-evidence` 模板已准备。
- [ ] `backup-evidence` 模板已准备。
- [ ] `smoke-test-checklist.md` 已确认。
- [ ] `release-signoff-checklist.md` 已准备。
- [ ] 资料包 lint 通过。
