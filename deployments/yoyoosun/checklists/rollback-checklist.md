# yoyoosun 回滚检查 / Rollback Checklist

- [ ] 回滚原因已记录。
- [ ] 影响范围已确认。
- [ ] 是否保留现场 evidence 已确认。
- [ ] 使用哪个旧镜像已确认。
- [ ] 使用哪个配置版本已确认。
- [ ] 使用哪个备份已确认，如涉及数据库恢复。
- [ ] migration 回滚或 forward-fix 策略已确认。
- [ ] 客户通知方式已确认。
- [ ] 回滚命令已由第二人复核，如涉及生产。
- [ ] 回滚后 server health / ready 通过。
- [ ] 回滚后 web health 通过。
- [ ] 回滚后关键页面 smoke 通过。
- [ ] rollback evidence 已生成。
- [ ] 后续 root cause 分析责任人已记录。
