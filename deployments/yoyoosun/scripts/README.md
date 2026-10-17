# yoyoosun 运维适配 / Operations Adapters

本目录保存 yoyoosun 的 env 校验、测试凭据合同与轮换、公网入口切流适配。通用发布、smoke、采证和备份恢复入口统一见[仓库部署脚本](../../../scripts/deploy/README.md#共用检查与证据)。

| 脚本 | 用途 |
| --- | --- |
| `verify-env.sh` | 校验 env 样例或受控 `.env` 的必需变量和危险配置 |
| `rotate-credentials-133.sh` | 按固定目标计划、目标锁、隔离恢复校验与 operation-bound 备份执行精确账号轮换；仅经 SSH stdin 注入凭据并输出脱敏回执 |
| `cutover-public-web.sh` | 先准备公网切流计划，再核对候选镜像 release、健康和 provider capabilities；失败恢复旧容器并保留回滚点 |

日常备份复用仓库级 `scripts/deploy/backup-set/cli.mjs`：同一停写窗口成套保存 PG 与全部登记附件，本地及异地只发布加密包和 checksum；恢复检查使用新建隔离 PG / S3。操作与证据见[备份恢复](../runbooks/04-backup-restore.md)，安装入口见 [`systemd`](../systemd/README.md)。旧 PG 专用脚本保留原范围；模板更新不表示目标已安装。

常用调用、准备计划和执行顺序统一见[首次部署](../runbooks/01-first-deploy.md)、[证据说明](../evidence/README.md)与[仓库发布脚本](../../../scripts/deploy/README.md)；脚本参数以各自 `--help` 为准，不在本页复制完整命令。

生产使用 `base-release` 和独立受控凭据；`production-133` 不进入测试凭据轮换或测试登录矩阵。

133 测试凭据合同是 `deployments/yoyoosun/env/credential.contract.json`，只登记 `demo-133` 与 `customer-test-133`。两目标稳定 `admin` 使用同一份固定测试凭据；demo 另外轮换合同列出的 11 个 `uat_*` 岗位账号，验收登录矩阵共 12 个身份；test 只轮换并登录 admin，同时证明非管理员 `id/username` 集合未变化，不读取或改写其密码。该轮换和登录矩阵只属于 `customer-trial-acceptance`，普通 `base-release` 不执行。

真实 `.env`、备份、证书私钥和 raw customer files 不得放入本目录。运行与凭据合同继续使用 `../env/runtime.contract.json`、`../env/credential.contract.json`，通用执行器读取这些合同，不派生第二份客户规则。
