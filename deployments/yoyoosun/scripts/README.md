# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本 | 用途 |
| --- | --- |
| `verify-env.sh` | 校验 env 样例或受控 `.env` 的必需变量和危险配置 |
| `run-smoke.sh` | 对指定 endpoint 执行轻量 health / route smoke，并输出脱敏 JSON |
| `collect-evidence.sh` | 生成 release evidence 草稿目录，不采集 secret |
| `verify-backup-restore.sh` | 检查备份恢复 evidence 是否具备必要字段，不处理备份文件本体 |

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --report output/yoyoosun-smoke.json
```

真实生产 `.env`、备份文件、证书私钥和 raw customer files 不得放入本目录。
