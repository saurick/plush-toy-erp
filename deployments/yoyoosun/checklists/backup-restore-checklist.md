# yoyoosun 备份恢复检查 / Backup Restore Checklist

## 备份

- [ ] 备份脚本或运维命令已确认。
- [ ] 备份目录存在。
- [ ] 数据库备份生成。
- [ ] 附件目录备份或快照生成，如当前启用附件。
- [ ] 备份 hash 已记录。
- [ ] 备份大小已记录。
- [ ] 备份加密状态已记录。
- [ ] 备份存储位置只记录 alias，不记录真实 access key。
- [ ] 备份文件未提交到 Git。

## 恢复演练

- [ ] 恢复目标是隔离测试库或明确恢复窗口。
- [ ] 恢复前确认 backup id 和 hash。
- [ ] 已执行 `run-backup-restore-rehearsal.sh` 或等价真实恢复命令。
- [ ] 恢复后 migration status 正常。
- [ ] 恢复后 smoke query 通过。
- [ ] 恢复后 web / server 健康检查通过。
- [ ] `backup-restore-report.json` 已生成，并声明 `backupCreated=true`、`restoreCompleted=true`、`migrationStatus=ok`、`smokeQueryStatus=passed`。

## 收口

- [ ] RPO / RTO 记录为实测或待演练，不虚假承诺。
- [ ] 失败项和后续修复项已记录。
- [ ] evidence 无 secret、dump 内容或客户敏感明细。
