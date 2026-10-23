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

文档构建沿用源码包的分发边界：客户反馈输入备忘保留在完整仓库，不进入工作台的静态文档资源。

## 登录与凭据

独立服务必填 `PLUSH_WORKBENCH_ORIGIN`、`PLUSH_WORKBENCH_USERNAME` 与 `PLUSH_WORKBENCH_PASSWORD_HASH`。域名必须匹配 target。密码使用至少 24 字符的独立随机值，经 `hashWorkbenchPassword` 转成 `scrypt:salt:hash`；运行 env 只保存哈希，不保存原密码。

env 文件必须由服务用户持有、权限 `0600`，放在部署根目录的 `runtime/workbench.env`，不放进源码或浏览器 `VITE_*` 变量。

版本交付需要分别核对 GitLab 只读、发布写入、目标取件及目标 SSH 配置。只读重载使用 `PLUSH_GITLAB_READ_TOKEN_FILE`；部署执行器和“补录 GitLab”使用 `PLUSH_GITLAB_TOKEN_FILE`，两者均指向服务用户持有的 `0600` 文件。Bridge 的发布授权和目标取件沿用 `PLUSH_GITLAB_TOKEN`、`PLUSH_GITLAB_TARGET_FETCH_TOKEN`；配置与轮换时须同步对应受控文件，不能用只读令牌替代写入授权。在 133 本机执行固定目标预检时，SSH 仍须通过主机密钥校验；同机访问仅授予该主机来源，不复制开发者私钥。

登录表单使用 `/__dev/login`，提交到固定 `/__dev/auth/login`。服务检查同源后设置 `Secure; HttpOnly; SameSite=Strict; Path=/` 的 `__Host-` Cookie；服务端会话绝对有效期为 8 小时，重启或更换身份后失效。重新登录轮换会话，退出登录立即撤回服务端会话。失败按来源限制尝试次数，并保留全局上限；日志仅记录结果、请求 ID、方法、状态和耗时。

未登录页面返回登录入口，API 和工具资源返回统一 401；深链接登录后恢复，拒绝外部跳转和 auth/API 返回地址。登录页和工作台共用 `/favicon-dev.svg`，该图标仅开放 HTTPS 受信代理边界内的 GET / HEAD，登录页 CSP 允许读取同源图片。外部网页的顶层导航只允许进入公开登录页；跨站 API、表单提交和 iframe 继续拒绝。服务另提供无操作能力的 `/healthz`；不运行 Vite，不提供源码、HMR、任意文件、命令或目标代理。

本地开发默认 `local` 模式，本机 loopback 无需工作台登录；受控内网共享可在 ignored `web/.env.development.local` 中显式设置 `PLUSH_DEV_WORKBENCH_ACCESS=private-network`。这些模式只作用于本地 Vite，不会关闭独立部署的登录保护。

## 构建、发布与回滚

1. 在拥有授权的源码范围内固定源版本。正式发布使用已提交版本；未提交改动的测试预览另记录基础 SHA、精确文件内容摘要和源码包 SHA-256，不冒充正式产品 Release。共享脏工作区使用一次性独立验证副本，只覆盖本轮精确路径；不打包 ignored env、客户 Private、依赖目录或其他任务改动。

   源码包若需携带 Git ancestry，须同时排除客户反馈文件及该路径的历史 blob，并在关闭 lazy fetch 时核对对象库；不能只从工作树删文件而保留其历史正文。
2. 在构建机的 `web/` 执行：

   ```bash
   GIT_OPTIONAL_LOCKS=0 pnpm build:workbench
   ```

3. 运行工作台认证、网络及源码边界检查。另执行 ERP 正式构建和 `dev-workbench-production-boundary.mjs`，确认独立制品不会进入 ERP 产物。

   将源码工具与已构建的 `web/build-workbench/` 打成固定包，记录 SHA-256；运行依赖另在目标 OS/架构准备为固定制品，绑定 `web/package.json`、`pnpm-lock.yaml`、仓库 Node 与 pnpm 版本，核对文件清单及 pnpm 内部 symlink。

   目标机只校验、解包和运行，不 install/build；package 或 lock 改变后重新准备匹配依赖。

   Node 必须匹配制品的 `.n-node-version`。需要随工作台升级时，将固定 Linux Node 放入制品 `toolchain/bin/node`，通过本服务的 systemd drop-in 设置 `ExecStart` 和子进程 `PATH`；该运行依赖在 `.git/info/exclude` 排除，保持源码身份核对只覆盖已提交文件。保留 drop-in 的前态，不替换宿主机共享 Node。
4. 目标机先核对主机名、登记的私网地址、端口、旧 `current` 与 systemd 状态。将包放入 `releases/<content-id>/`，核对源身份、所有文件、运行 env 与 Node 版本，不得覆盖远端日常开发 checkout。

   操作者须先确认工作台空闲，按现有 store root 与引用关系盘点并保存 operation store 及必要证据；运行中操作、执行锁、外部 store override 或未知非空 output 未查明时停止切换。

   在维护窗口停止本工作台服务后保留这些状态，保留旧 `current`、output 与 runtime env 作为回滚点，再原子切换并启动 `plush-workbench-test`，读回历史记录仍可访问。依赖和状态保全不通过时不切换，不批量复制镜像或缓存。

   将已有执行器历史接入独立工作台时，仅一次性导入已结束操作及其回执、计划、请求索引和 GitLab 引用，按 operation ID 与逐文件 SHA-256 核对；同 ID 内容冲突须先查明。原库和未结束操作保留在原执行端，账号凭据及取件缓存不混入记录包。后续工作台操作由本服务记录并沿既有协议登记 GitLab，不另建定时复制任务。
5. 香港入口先备份已有同名配置，再安装本目录 Nginx 配置。`nginx -t` 通过后 reload，读回 HTTPS 登录页、未登录 API 拒绝、真实登录、页面/工具只读请求、退出与健康状态；Cloudflare 只添加或精确更新工作台记录，不覆盖其他域名。
6. 回滚时先保全切换后的新增操作，再把 `current`、本次改动的 runtime 配置和 systemd drop-in 恢复到记录的前态；执行 `daemon-reload` 后重启，重新核对登录、健康与记录。首次部署无旧版本时停用本服务与其精确域名入口；保留 runtime、日志和发布证据。业务 Compose、数据库、上传、证书和本地开发进程不在回滚删除范围内。

本节为手工 SOP。`build:workbench` 与独立服务启动入口不会自动完成源码封装、依赖传输、状态保全或 current 切换；操作者须逐项核验并留证，不能把一次性操作脚本当成仓库长期发布入口。

操作回执与日志放 ignored `output/` 或目标私有部署目录。源码版本、制品摘要、配置、目标运行和客户验收分别记录；工作台可访问不等于执行器全部就绪，也不等于甲方业务验收通过。

## 发布状态刷新与故障定位

并发读取同一次发布摘要时共用在途请求，避免重复访问 GitLab、启动目标预检和比较版本关系。目标预检缓存从成功完成时计时；失败立即移出缓存，下一次显式刷新重新检查。写操作前后使相关读取失效，旧请求的迟到结果不能重新填充缓存。历史记录继续通过独立的环境列表与详情入口读取。

预检不可用表示本次状态未确认，不表示目标尚未部署，也不触发首次部署检查或自动重试。页面保留历史查看，相关写入口继续关闭。超时会终止本次本地预检进程组，防止遗留子进程叠加到下一次刷新。

服务日志的 `delivery_preflight` 事件以 `requestId` 关联 HTTP 请求，记录固定目标、错误分类、最近检查阶段、耗时、退出码和本地/SSH 通道；不记录 stderr、命令参数、环境变量或数据库查询原文。阶段包括运行身份、配置、健康、公开入口、部署回滚资料、数据库及备份。出现异常时先按请求编号核对该事件，区分超时、执行失败与响应不完整，再检查相应步骤；不能把刷新后恢复当成原因已查明。

## 保留状态

版本与恢复页面读取固定的 `/var/lib/plush-retention/summary.json`，本机走文件读取，开发机走既有固定 SSH 目标。汇总只包含版本 / 备份标识、环境、保留状态、原因及时间，不包含凭据或绝对路径。轮换由独立受控定时任务执行，工作台没有任意清理入口；已清理的制品保留记录并关闭部署动作。
