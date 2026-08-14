# 开发服务 Bridge / Dev Server Bridges

本目录承载研发效能工作台和本地客户调试所需的 Node/Vite development-serve 能力。浏览器端页面位于 `web/src/dev-workbench/`；这里的模块可以读取本地证据、调用固定脚本或维护受控 operation，因此不得进入浏览器源码目录。

## 职责

| 模块                                | 职责                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `devWorkbenchPlugins.mjs`           | 聚合 development-serve 插件，供 `web/vite.shared.mjs` 单点注册                                                                       |
| `devCustomerConfigPlugin.mjs`       | 为本地客户调试提供受控配置和公开资源                                                                                                 |
| `devCustomerImportDryRunPlugin.mjs` | 提供客户配置预检、Dry Run、runtime manifest 和发布准备读回                                                                           |
| `devQaCoveragePlugin.mjs`           | 执行固定覆盖率采集并提供脱敏 operation 状态                                                                                          |
| `devQualityGatePlugin.mjs`          | 复用正式 full / strict runner 与回执，自动选择显式 loopback base 或本机托管 PostgreSQL，提供异步运行、取消、超时、清理读回和只读治理 |
| `devDataPreparationPlugin.mjs`      | 提供单一数据准备 operation 真源；同一 Scenario profile 显式绑定本地或 133，冻结 V6、release、数据库、migration、客户配置与回滚点，长期数据与隔离验收不互相替代 |
| `devDatabaseMigrationPlugin.mjs`    | 提供本地共享开发库迁移的受控 operation service 和 HTTP 层，供页面与高层 CLI 复用                                                     |
| `devDatabaseMigrationRuntime.mjs`   | 执行迁移 status、plan、备份恢复、apply、读回和重启                                                                                   |
| `devDeliveryBridgePlugin.mjs`       | 提供不可变版本、固定目标 promotion 和受控 rollback Bridge                                                                            |
| `devServerSecurity.mjs`             | 集中维护 loopback remote address 与 Host 校验                                                                                        |

测试与实现同目录放置。模块间使用 `./` 导入；仓库级 QA、部署和客户配置真源分别通过 `../../scripts/`、`../../config/` 读取，不在本目录复制实现。

## 边界

- 插件只允许在 Vite `command=serve` 且 `mode=development` 时注册。
- 正式 ERP、移动端、产品配置和 Server runtime 不得依赖本目录。
- 浏览器不得提交任意命令、路径、DSN、目标、SSH 参数或环境变量；写操作必须使用固定动作、幂等、确认、审计和读回。
- 数据准备摘要只输出数据集版本、安全数据库名、migration、客户配置 revision 和读回时间；不输出凭据、DSN、主机、端口、命令、路径或内部幂等键。本地与 133 的读取失败分别建模，结果未证明时不自动重试或创建 operation。
- 133 Scenario 只能在对应目标卡中准备和二次确认；执行前重新读取固定 target attestation，并创建绑定 exact release / database / migration 的新备份回滚点。备份通过 `erp_backup` 只读角色生成并校验，只向页面返回 alias、hash、大小和时间。
- 质量门禁没有显式 database base 时只允许本机 Docker 的固定 `postgres:18.1` 托管模式：每次随机凭据、仅绑定 `127.0.0.1` 动态端口、按 operation 与 repository label 精确清理；不得删除外部容器或占用者。
- production build、production preview 和正式部署不包含本目录模块、`/__dev` 路由或本机私有路径。
- `devDatabaseMigrationRuntime.mjs` 的 source identity 包含迁移 Bridge、高层 CLI 与安全真源；路径或内容变化后，既有迁移 plan 必须失效并重新准备，不保留旧路径兼容。execute 在 apply 前还必须重新验证 operation 绑定的备份文件身份。

调整本目录后至少运行同目录 Node 测试、工作台源码边界测试、production build、制品零残留扫描和 production `/__dev` 浏览器 smoke。
