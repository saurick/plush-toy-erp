# 开发服务 Bridge / Dev Server Bridges

本目录承载研发效能工作台和本地客户调试所需的 Node/Vite development-serve 能力。浏览器端页面位于 `web/src/dev-workbench/`；这里的模块可以读取本地证据、调用固定脚本或维护受控 operation，因此不得进入浏览器源码目录。

## 职责

| 模块                                     | 职责                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devWorkbenchPlugins.mjs`                | 聚合 development-serve 插件，供 `web/vite.shared.mjs` 单点注册                                                                                                          |
| `devWebInstancePlugin.mjs`               | 仅向 loopback GET 提供前端进程、启动配置摘要和实时恢复状态，供启动器核对重复启动；不提供停服或写操作接口                                                                |
| `devCustomerConfigPlugin.mjs`            | 为本地客户调试提供受控配置和公开资源                                                                                                                                    |
| `devCustomerImportDryRunPlugin.mjs`      | 提供客户配置预检、Dry Run、runtime manifest 和发布准备读回                                                                                                              |
| `devQaTestingPlugin.mjs` | 执行固定检查与隔离压力测试，复用同一幂等 operation、仓库身份与 QA 互斥锁 |
| `devQaPressureReports.mjs` | 从固定报告目录读取有界、无符号链接的生命周期与业务证据，输出脱敏指标和源码匹配状态 |
| `devQaCoveragePlugin.mjs`                | 执行固定覆盖率采集并提供脱敏 operation 状态                                                                                                                             |
| `devQualityGatePlugin.mjs`               | 复用正式 full / strict runner 与回执，自动选择显式 loopback base 或本机托管 PostgreSQL，提供异步运行、取消、超时、清理读回和只读治理                                    |
| `devDataPreparationPlugin.mjs`           | 提供单一数据准备 operation 真源；同一 Scenario profile 显式绑定本地或 133，冻结当前数据合同、release、数据库、migration、客户配置与回滚点，长期数据与隔离验收不互相替代 |
| `devDatabaseMigrationPlugin.mjs`         | 提供本地共享开发库迁移的受控 operation service 和 HTTP 层，供页面与高层 CLI 复用                                                                                        |
| `devDatabaseMigrationRecoveryPlugin.mjs` | 本地预检失败或停服时在原业务地址显示等待页，保留迁移恢复页与固定 API；本机只读状态检查通过完整启动检查后解除 ERP / RPC 限制                                             |
| `devDatabaseMigrationRuntime.mjs`        | 执行迁移 status、plan、备份恢复、apply、读回和重启                                                                                                                      |
| `devDeliveryBridgePlugin.mjs`            | 提供不可变版本、固定目标 promotion 和受控 rollback Bridge                                                                                                               |
| `devOperatorAuthPlugin.mjs`             | 为开发工作台页面、会话、状态与全部执行 / 取消接口检查访问模式；默认独立运维认证，个人内网可显式启用直接访问，先于其他开发插件执行 |
| `devServerSecurity.mjs`                  | 集中维护 loopback、IPv4 私有网络、监听地址绑定与 same-origin 校验                                                                                                       |

测试与实现同目录放置。模块间使用 `./` 导入；仓库级 QA、部署和客户配置真源分别通过 `../../scripts/`、`../../config/` 读取，不在本目录复制实现。

## 边界

- 插件只允许在 Vite `command=serve` 且 `mode=development` 时注册。
- 正式 ERP、移动端、产品配置和 Server runtime 不得依赖本目录。
- 浏览器不得提交任意命令、路径、DSN、目标、SSH 参数或环境变量；写操作必须使用固定动作、幂等、确认、审计和读回。
- 数据准备摘要只输出数据集版本、安全数据库名、migration、客户配置 revision 和读回时间；不输出凭据、DSN、主机、端口、命令、路径或内部幂等键。本地与 133 的读取失败分别建模，结果未证明时不自动重试或创建 operation。
- 本地 Core profile 固定执行当前数据合同的角色账号、8 个标准单位与 4 个仓库引用，只允许登记的长期开发库和服务端生成的精确确认；它不再从工作台调用旧 `SIM-PLUSH-CORE` 全量 seed，材料、产品、工序、BOM、Source、Task 与 Fact 由同一 Scenario 数据合同补齐并独立读回。旧批次回执只作历史追溯，不参与当前执行、恢复选择或环境结论。
- 数据版本、批次和基础数量取自 `server/internal/manualacceptance/contract.json`；Bridge 使用已验证的合同模块，工作台浏览器校验读取同一公开模拟合同，避免前端保留旧版本常量而拒绝当前回执。流程数量按已验证的正式流程实例 ID 去重，不由岗位数或展示任务数推导。
- 133 Scenario 只能在对应目标卡中准备和二次确认；执行前重新读取固定 target attestation，并创建绑定 exact release / database / migration 的新备份回滚点。备份通过 `erp_backup` 只读角色生成并校验，只向页面返回 alias、hash、大小和时间。
- 质量门禁没有显式 database base 时只允许本机 Docker 的固定 `postgres:18.6` 托管模式：每次随机凭据、仅绑定 `127.0.0.1` 动态端口、按 operation 与 repository label 精确清理；不得删除外部容器或占用者。
- production build、production preview 和正式部署不包含本目录模块、`/__dev` 路由或本机私有路径。
- `devDatabaseMigrationRuntime.mjs` 的 source identity 包含迁移 Bridge、高层 CLI 与安全真源；路径或内容变化后，既有迁移 plan 必须失效并重新准备，不保留旧路径兼容。execute 在 apply 前还必须重新验证 operation 绑定的备份文件身份。
- 数据库迁移准备先检查能力而非绑定操作系统或桌面产品：固定需要兼容 `docker` CLI/socket 的容器运行环境、Atlas v1.3.0、PostgreSQL 18 客户端及备份恢复基础命令。Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack 或提供兼容入口的 Podman 均可；环境不完整时不得先停止后端。

调整本目录后至少运行同目录 Node 测试、工作台源码边界测试、production build、制品零残留扫描和 production `/__dev` 浏览器 smoke。

DEV 桥接共用 `devServerSecurity.mjs` 的 loopback / same-origin 校验和有界 JSON 请求解析。各插件显式提供请求大小上限，继续独立维护令牌、动作允许列表和状态机。

工作台页面和所有高权限 API 先经过 `devOperatorAuthPlugin.mjs`。`PLUSH_DEV_WORKBENCH_ACCESS` 由 Vite 开发服务读取，未设置时使用 `operator`；值无效返回 503，不回退为开放访问。

| 访问模式 | 使用场景 | 身份与连接 |
| --- | --- | --- |
| `operator`（默认） | 需要独立运维身份的开发环境 | HTTP Basic；本机 loopback、真实 TLS 私网连接或显式配置的本机 HTTPS 代理，也可使用受控 SSH 隧道 |
| `private-network` | 个人受控内网开发 | 本机与 IPv4 私网直接打开 HTTP / HTTPS 地址，无额外工作台登录 |

`operator` 使用独立于 ERP 业务账号的 HTTP Basic 运维身份。服务进程必须配置 `PLUSH_DEV_OPERATOR_USERNAME`（1～64 位字母、数字及 `_.@-`）和 `PLUSH_DEV_OPERATOR_PASSWORD`（24～1024 字符的独立随机口令）；使用当前服务用户的受控 secret 注入，禁止提交仓库、加入 `VITE_*` 或写入前端配置。未配置或配置无效返回 503，凭据缺失 / 错误返回统一 401。浏览器使用标准认证对话框，API 客户端使用同一 Authorization 合同；ERP Bearer token 不授予运维权限。远程明文 HTTP 不返回认证挑战。撤回或轮换身份后重启开发进程，浏览器再次使用新凭据认证。

个人开发可在 ignored 的 `web/.env.development.local` 中设置 `PLUSH_DEV_WORKBENCH_ACCESS=private-network`，重新加载对应 Vite 开发进程后直接打开 `http://<服务器内网 IPv4>:<前端端口>/__dev`。这是显式授权符合网络限制的设备使用开发工具，仅适用于自己控制的内网；ERP 业务登录与后端权限仍按原合同执行。删除该配置或设置为 `operator` 可恢复独立认证。环境变量优先于本地文件，此值不使用 `VITE_*`，不进入浏览器配置。

两种模式均要求本机真实 loopback 连接和 loopback Host，或私网来源、数字 Host 与实际监听 IPv4 地址和端口一致。内网 HTTPS 域名使用下述显式代理配置；其他 DNS 别名、公网、伪造 Host 和跨站元数据均拒绝。POST 继续要求精确同源 Origin、CSRF、固定动作、原有确认、状态和资源预检；直接访问不取消这些控制。

内网 HTTPS 代理可在同一 ignored 文件中设置 `PLUSH_DEV_HTTPS_ORIGIN=https://<内网域名>`，只接受单个 HTTPS origin（可带端口），不接受账号、路径、查询或片段；无效配置阻断该开发服务启动。Vite 仅放行此域名，HMR 默认跟随页面地址使用 WSS。代理必须在 TLS 入口限制内网客户端，严格匹配 SNI / Host，然后经 `127.0.0.1:<前端端口>` 回源；覆盖上游 Host 为配置 origin 的 host、`X-Forwarded-Proto=https` 和 `X-Forwarded-For=<实际客户端 IPv4>`，不能追加客户端提供的转发链。

开发服务只在远端和本地 socket 地址均为 loopback、Host 与配置完全一致、转发协议为 HTTPS、转发客户端为单个私网 IPv4、Origin / Referer / Fetch Metadata 符合同源时信任该代理。远程直连自行携带 `X-Forwarded-*`、未配置的代理和跨来源请求都不获得此信任。此配置显式信任服务器本机的代理进程，不替代所选工作台访问模式；`operator` 经代理仍要求独立运维身份。代理 TLS 终止后到本机 Vite 使用 HTTP。删除 origin 配置及对应代理入口可撤回域名访问；该配置只用于 development serve，不进入浏览器 env 或生产构建。

`/__dev/api/web-instance` 和 `/__dev/api/runtime-status` 仅保留已有进程归属 / 可用性读取合同，不提供操作会话、CSRF 或写动作；前者继续限制 loopback，后者在业务预检失败时仍可为恢复等待页提供脱敏状态。其他工作台读取、执行与取消均经过所选访问模式检查。生产不注册认证插件或开发工作台。HTTP 页面生成操作标识继续使用安全随机源，缺失时拒绝提交。
