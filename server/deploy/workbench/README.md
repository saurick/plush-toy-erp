# 独立效能工作台 / Standalone Engineering Workbench

效能工作台可独立部署到测试环境，通过 `https://workbench.saurick.me` 登录。它使用单独的前端制品和 Node 服务；ERP 正式构建仍排除工作台。本地 `pnpm start` 与 `private-network` 配置继续免工作台登录。

## 入口与职责

精确部署身份以 [target.json](target.json) 为准。它登记研发工具服务，不新增业务数据库、Compose project 或业务 deployment target。

| 项目 | 真源与边界 |
| --- | --- |
| 页面制品 | `web/workbench.html`、`web/vite.workbench.config.mjs`，输出 `web/build-workbench/` |
| 独立服务 | `web/dev-server/standaloneWorkbench.mjs`，复用现有受控工具 Bridge |
| 域名与 TLS | 香港 Nginx，配置 [nginx.conf](nginx.conf)，复用已受管的 `*.saurick.me` 证书 |
| 内部链路 | 香港 `10.252.70.1` 经现有 Netmaker 加密网络访问 133 的 `10.252.70.2:15300`；服务只信任指定代理、精确 Host 和 HTTPS 转发头 |
| 常驻服务 | [plush-workbench-test.service](plush-workbench-test.service)，发布目录与本地开发 checkout 分离 |
| 业务接口 | `/rpc`、`/templates` 只代理业务 registry 内 `customer-test-133` 的固定地址；仍需 ERP 业务身份与权限 |
| 数据与执行 | 不自动迁移、造数、发版或重建；已有固定动作继续经过各自确认、CSRF、权限、目标预检与读回 |

登录身份只授予研发运维人员，不使用甲方 ERP 账号。工作台的本地开发库工具需要独立登记的开发运行配置和工具链；缺少配置时显示未就绪，不借用 test 业务库或管理员凭据。GitLab 只读凭据、目标 SSH 权限和执行器所需权限分别配置，登录成功不代表这些能力已就绪。

权限关系读取登记的共享开发库。独立服务使用构建机预编译的 `toolchain/bin/dev-permission-relationships`，不在目标机执行 `go run` 或构建。`PLUSH_WORKBENCH_PERMISSION_AUDIT_DSN_FILE` 指向服务用户持有的 `0600` 普通文件，只保存登记共享开发库的现有只读审计连接；调用前核验账号实际权限，Go 工具再次核验集群身份并强制只读。该文件不进入源码包、浏览器或操作历史，不使用应用、迁移、test 或正式库凭据替代。

“测试执行”默认打开“服务器验证”，读取同一套 GitLab CI、JUnit 测试摘要、分类覆盖率、固定目标预检和持久化 operation 详情。CI 摘要与报告链接绑定当前已提交 SHA 及确切 Pipeline / Job；展开任务、日志和完整流水线请跳转 GitLab。报告缺失、暂时读取失败、解析异常及制品过期分别显示，不使用旧报告补造当前通过。

服务器验证分别展示 demo、test、erp 的运行冒烟、迁移、新备份的隔离恢复和部署读回。回执可在当前页展开，沿 operation 与 SHA-256 追溯 GitLab 原始证据；运行版本、回执和迁移版本必须一致且目标预检通过，才显示该运行版本通过；工作台源码与目标版本是否一致另列，独立工作台升级不会抹掉原运行版本的有效证据，也不表示新源码已部署。已有失败、阻断和结果未证明记录继续保留。

“项目专项与历史”明确标注本独立服务保存的报告。开发机本地诊断与报告留在 Vite 入口；服务器不会读取开发机文件，也不会把 GitLab Runner 结果称为业务服务器实跑。独立服务在认证后拒绝 `/qa/quality-gates/actions` 与 `/qa/coverage/actions`，不重复执行通用 full / strict 和覆盖基线；原有查询、取消、压力及项目专有检查保留。版本发布、备份恢复、迁移及环境历史沿既有入口和门禁执行。

独立制品的“本轮验证”提示从服务器验证核对证据，“数据库迁移”展示三个发布目标的真实回执；本机迁移准备和本机专项运行继续留在 Vite 开发入口。该显示范围由独立构建的固定标记决定，不接受浏览器参数切换。安全与恢复页同样可核对三个目标的当次备份与隔离恢复。

文档构建沿用源码包的分发边界：客户反馈输入备忘保留在完整仓库，不进入工作台的静态文档资源。

## 登录与凭据

独立服务必填 `PLUSH_WORKBENCH_ORIGIN`、`PLUSH_WORKBENCH_USERNAME` 与 `PLUSH_WORKBENCH_PASSWORD_HASH`。域名必须匹配 target。密码使用至少 24 字符的独立随机值，经 `hashWorkbenchPassword` 转成 `scrypt:salt:hash`；运行 env 只保存哈希，不保存原密码。

env 文件必须由服务用户持有、权限 `0600`，放在部署根目录的 `runtime/workbench.env`，不放进源码或浏览器 `VITE_*` 变量。

版本交付需要分别核对 GitLab 只读、发布写入、目标取件及目标 SSH 配置。只读重载使用 `PLUSH_GITLAB_READ_TOKEN_FILE`；部署执行器和“补录 GitLab”使用 `PLUSH_GITLAB_TOKEN_FILE`，两者均指向服务用户持有的 `0600` 文件。Bridge 的发布授权和目标取件沿用 `PLUSH_GITLAB_TOKEN`、`PLUSH_GITLAB_TARGET_FETCH_TOKEN`；配置与轮换时须同步对应受控文件，不能用只读令牌替代写入授权。在 133 本机执行固定目标预检时，SSH 仍须通过主机密钥校验；同机访问仅授予该主机来源，不复制开发者私钥。

登录表单使用 `/__dev/login`，提交到固定 `/__dev/auth/login`。服务检查同源后设置 `Secure; HttpOnly; SameSite=Strict; Path=/` 的 `__Host-` Cookie；服务端会话绝对有效期为 1 小时，访问工作台不会续期，重启或更换身份后失效。重新登录轮换会话，退出登录立即撤回服务端会话。失败按来源限制尝试次数，并保留全局上限；日志仅记录结果、请求 ID、方法、状态和耗时。

未登录页面返回登录入口，API 和工具资源返回统一 401；深链接登录后恢复，拒绝外部跳转和 auth/API 返回地址。登录页和工作台共用 `/favicon-dev.svg`，该图标仅开放 HTTPS 受信代理边界内的 GET / HEAD，登录页 CSP 允许读取同源图片。外部网页的顶层导航只允许进入公开登录页；跨站 API、表单提交和 iframe 继续拒绝。服务另提供无操作能力的 `/healthz`；不运行 Vite，不提供源码、HMR、任意文件、命令或目标代理。

本地开发默认 `local` 模式，本机 loopback 无需工作台登录；受控内网共享可在 ignored `web/.env.development.local` 中显式设置 `PLUSH_DEV_WORKBENCH_ACCESS=private-network`。这些模式只作用于本地 Vite，不会关闭独立部署的登录保护。

<a id="workbench-release"></a>

## 构建、发布与回滚

日常升级使用仓库入口 `scripts/deploy/workbench-release.mjs`，接收在构建机准备的完整目录。目标固定为 `target.json` 登记的独立工作台；业务版本发布继续沿用 Delivery Service。默认命令只读，只有显式 `--execute` 才写入。命令从该源码根目录执行。

### 准备与封装

1. 固定拥有授权的 clean committed source。制品携带自包含 `.git`，不能使用指向原 checkout 的 alternates、关联工作树或凭据配置；客户 Private、客户反馈及其可读历史 blob、运行 env 和运行状态不进入制品。未提交预览使用本地 Vite，不经正式制品入口。
2. 按 `.n-node-version` 和 `web/pnpm-lock.yaml` 准备目标 OS / 架构的运行依赖。`web/node_modules/` 必须完整，pnpm symlink 只能相对引用包内依赖；`toolchain/bin/node` 和 `toolchain/bin/dev-permission-relationships` 必须是预编译的 `linux/amd64` 可执行文件。只读权限工具的构建命令为：

   ```bash
   (cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /path/to/prepared-release/toolchain/bin/dev-permission-relationships ./cmd/dev-permission-relationships)
   ```

3. 在同一固定源码的 `web/` 执行 `GIT_OPTIONAL_LOCKS=0 pnpm build:workbench`。构建生成 `workbench-build.json`，绑定构建前后的源码身份、Node 与依赖锁摘要；源码在构建期间变化会失败。运行工作台认证与边界回归，并以 ERP 正式构建和 `dev-workbench-production-boundary.mjs` 核对产物隔离。目标机不安装依赖或构建源码。
4. 将固定源码、已构建页面、运行依赖与工具链放在同一准备目录，依赖和构建产物通过本包 `.gitignore` / `.git/info/exclude` 排除；`output/` 为空或不存在。在该目录源码对应的构建机入口封装并复核：

   ```bash
   WORKBENCH_RELEASE_DIR=/path/to/prepared-release
   node scripts/deploy/workbench-release.mjs seal --input "$WORKBENCH_RELEASE_DIR"
   node scripts/deploy/workbench-release.mjs seal --input "$WORKBENCH_RELEASE_DIR" --execute
   node scripts/deploy/workbench-release.mjs verify --input "$WORKBENCH_RELEASE_DIR"
   ```

   第一条只读检查源码；第二条写入唯一 `.workbench-artifact.json`，返回 `artifactId`，绑定全部文件内容、权限、依赖 symlink、源码与构建身份；已有清单不覆盖。第三条重新计算完整清单。清单生成后不再修改目录；变化时重新准备制品。

### 升级与回滚

目标必须已有经同一清单校验的旧版本、`releases/`、`current` 和服务用户持有的 `0600 runtime/workbench.env`。systemd 使用本目录 service 单元：主进程及子进程 `PATH` 都优先指向 `current/toolchain/bin`，不替换宿主共享 Node。旧版本缺少制品清单、维护状态读回或固定工具链时先阻断；首次接入须在另获授权的维护窗口核清旧版本与状态、保全原配置并安装对应服务，不能补造身份绕过检查。

1. 只读核对制品和固定目标计划，明确审批的 `artifactId`；获得本次目标升级授权后才执行第二条：

   ```bash
   node scripts/deploy/workbench-release.mjs deploy --input "$WORKBENCH_RELEASE_DIR"
   WORKBENCH_ARTIFACT_ID=填入封装返回的artifactId
   node scripts/deploy/workbench-release.mjs deploy --input "$WORKBENCH_RELEASE_DIR" --artifact "$WORKBENCH_ARTIFACT_ID" --execute
   ```

2. 执行器校验固定 SSH 主机身份、上传内容与 Node，再取得本次维护锁。锁期间拒绝新工具 POST，保留只读访问；有在途写请求、未结束或未知操作、执行锁、外部 store override、未知 `output/` 时不停止服务。只传输代码和依赖，不传输本机运行状态。
3. 校验候选后停止本工作台服务，逐文件保全当前 `output/dev-workbench`、`output/qa`、`output/playwright`，核对内容、权限与清单完全一致，再原子切换 `current`。成功须读回 exact artifact / source SHA、固定 Node、空闲状态、HTTPS 登录页和未登录 API 拒绝；历史记录与原回执继续保留。
4. 停服结果不确定或新版本读回失败时，保留候选和旧版本，主动恢复旧服务并核对旧制品身份和公网边界。恢复未证明时保留维护锁；不自动重复发布、删除历史或重新启动数据操作。结果、第一失败阶段及恢复失败原因写入私有 `runtime/release-<operation-id>.json`，失败按该回执人工处理，不能仅因服务进程存在就宣称恢复。
5. 显式回滚使用已保留的精确 release key；先执行只读计划，获得授权后再加 `--execute`：

   ```bash
   WORKBENCH_ROLLBACK_RELEASE=填入已保留的精确release-key
   node scripts/deploy/workbench-release.mjs rollback --release "$WORKBENCH_ROLLBACK_RELEASE"
   node scripts/deploy/workbench-release.mjs rollback --release "$WORKBENCH_ROLLBACK_RELEASE" --execute
   ```

   回滚同样先保全当前最新记录，再切回所选代码与依赖；不回退数据、丢弃新增回执或复制旧状态覆盖当前记录。

首次安装 HTTPS / Nginx / Cloudflare、凭据、服务单元与历史导入仍需各自授权。变更前保留对应配置前态；Nginx 检查通过后才重载，登录、读取、退出及访问边界分别验证。一次性历史导入只接收已结束操作和相应回执、计划、请求索引及 GitLab 引用，按 operation ID 与 SHA-256 核对，未结束操作及原库保留原执行端，不建定时复制任务。

操作回执与日志放 ignored `output/` 或目标私有部署目录。该入口的代码和隔离测试不等于已完成真实目标升级；源码、制品、配置、运行、恢复与客户验收分别记录。业务 Compose、数据库、上传和证书不在此入口的切换或删除范围内。

## 发布状态刷新与故障定位

并发读取同一次发布摘要时共用在途请求，避免重复访问 GitLab、启动目标预检和比较版本关系。目标预检缓存从成功完成时计时；失败立即移出缓存，下一次显式刷新重新检查。写操作前后使相关读取失效，旧请求的迟到结果不能重新填充缓存。历史记录继续通过独立的环境列表与详情入口读取。

预检不可用表示本次状态未确认，不表示目标尚未部署，也不触发首次部署检查或自动重试。页面保留历史查看，相关写入口继续关闭。超时会终止本次本地预检进程组，防止遗留子进程叠加到下一次刷新。

服务日志的 `delivery_preflight` 事件以 `requestId` 关联 HTTP 请求，记录固定目标、错误分类、最近检查阶段、耗时、退出码和本地/SSH 通道；不记录 stderr、命令参数、环境变量或数据库查询原文。阶段包括运行身份、配置、健康、公开入口、部署回滚资料、数据库及备份。出现异常时先按请求编号核对该事件，区分超时、执行失败与响应不完整，再检查相应步骤；不能把刷新后恢复当成原因已查明。

## 保留状态

版本与恢复页面读取固定的 `/var/lib/plush-retention/summary.json`，本机走文件读取，开发机走既有固定 SSH 目标。汇总只包含版本 / 备份标识、环境、保留状态、原因及时间，不包含凭据或绝对路径。轮换由独立受控定时任务执行，工作台没有任意清理入口；已清理的制品保留记录并关闭部署动作。
