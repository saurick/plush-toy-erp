# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。

## 2026-06-05
- 完成：精简岗位任务端长列表展开后的收起按钮文案。展开态从“收起，保留前 N 条...”改为只显示“收起”；折叠态继续保留“展开全部 / 还有 N 条”数量提示，避免按钮承担过多解释文案。
- 验证：`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过，覆盖岗位任务端长列表默认收起、展开、再收起恢复、暗色可读性和横向溢出。
- 下一步：如后续继续优化岗位任务端长列表，可进一步检查展开控制在不同列表名词下的短文案一致性。
- 阻塞/风险：本轮只改岗位任务端前端文案和本过程记录；未改列表数量限制、筛选逻辑、Workflow / Fact 语义、API、RBAC、schema、migration、seedData 或正式文档入口。

- 完成：纠偏岗位任务端列表 sticky 交互。撤回“把底部主导航复制到列表上方”的错误方向；待办页改为让列表上方的筛选分段 tab（全部 / 风险 / 已超时 / 即将超时）像消息页“预警 / 通知”一样在正文列表滚动时 sticky。已办列表继续复用既有展开 / 收起控制，不新增没有业务维度的二级 tab。
- 完成：补齐 `mobile-tasks-dark` L1 断言，滚动待办长列表后检查筛选 tab 仍贴住正文滚动区顶部、四个按钮不横向溢出；同时继续覆盖待办 / 已办展开收起、消息预警 / 通知 sticky、暗色可读性和底部导航固定。
- 完成：补强老板岗位任务端已办列表回归数据。`mobile-tasks-dark` 现在额外创建 12 条 `owner_role_key=boss`、`task_status_key=done` 的“批量老板已办任务”，并打开 `/m/boss/tasks` 切到已办页，验证已办列表不再只走空态，且同样触发展开 / 收起。
- 验证：`cd web && pnpm exec prettier --check src/erp/mobile/pages/MobileRoleTasksPage.jsx src/erp/styles/app.css scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm test` 通过，271 个测试通过；`git diff --check -- web/src/erp/mobile/pages/MobileRoleTasksPage.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如后续要给“已办任务”加类似二级 tab，应先明确业务维度（例如全部 / 完成 / 关闭 / 退回等），不能用底部主导航替代列表内部 tab。
- 阻塞/风险：本轮只改岗位任务端前端展示、局部样式、L1 回归脚本和本过程记录；未改后端、API、RBAC、schema、migration、seedData、Workflow / Fact 语义、路由或真实通知表。当前工作区仍有大量非本轮改动，本轮未回退、未整理、未提交。

- 完成：按 Product Design 反馈重新调整权限管理页面结构。创建管理员主按钮上移到页面首屏 hero 操作区；“管理员与角色”模块移动到“当前客户角色模板”之前，避免账号创建入口被角色权限矩阵推到下方才出现。
- 完成：强化权限页模块视觉分区。管理员模块使用 Account Roles 标识、绿色顶边和偏绿背景；角色模板模块使用 Role Templates 标识、蓝紫顶边和偏蓝背景；暗色模式下两个模块使用不同边框、渐变背景和强调色，肉眼可区分“管理员 / 角色管理”和“权限模板管理”。
- 完成：更新 `style:l1` 权限页断言，校验 hero 创建按钮早于管理员模块、管理员模块早于角色权限模块，并在暗色权限页校验两个模块的边框和背景不能相同。
- 验证：`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/pages/PermissionCenterPage.jsx` 通过；`cd web && pnpm css` 通过；`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm style:l1` 通过，覆盖暗色分区和桌面默认态；`cd web && pnpm test` 通过，271 个测试通过；`cd web && pnpm style:l1` 通过，42 个场景通过；`git diff --check -- web/src/erp/pages/PermissionCenterPage.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如果后续继续接客户配置，应优先让 `rbac_options` 返回当前客户角色模板排序和默认权限包；页面不需要新增本地权限真源。
- 阻塞/风险：本轮仍只改权限管理前端页面、样式、L1 回归脚本和本过程记录；未改后端 RBAC、权限码、schema、migration、API、seedData、客户配置 runtime loader、Workflow / Fact 语义或部署。Browser 插件本轮未暴露直接 in-app browser 控制工具，最终视觉证据来自 Playwright L1 截图和 DOM / box 模型断言。

- 完成：重构权限管理页面为“当前客户角色模板”优先的角色中心。页面左侧展示角色模板列表，右侧展示当前角色的权限码数量、影响账号、岗位入口数量、系统权限数量、影响管理员和关键入口 / 高风险能力；账号创建与角色分配保留下方“管理员与角色”区。
- 完成：权限矩阵继续复用现有 RBAC 权限码和 `set_role_permissions` 保存主路径，只调整前端信息架构和样式；新增客户配置边界提示，明确不同甲方可以有不同角色名称和默认权限包，但 Product Core 权限码、流程职责和业务事实规则保持稳定。
- 完成：补齐角色中心浅色 / 暗色样式和 `style:l1` 盒模型断言，检查角色中心左右布局、权限矩阵和页面横向溢出，避免后续客户角色模板入口被压缩或遮挡。
- 验证：`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/pages/PermissionCenterPage.jsx` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`STYLE_L1_SCENARIOS=permission-center-desktop pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，42 个场景通过。未执行全量 `pnpm lint`，因为该脚本会对整个 `src/` 执行 `--fix`，当前工作区已有大量非本轮改动，避免格式化无关现场。
- 下一步：后续真正接客户配置时，应让 `roles / permissions` 来源从行业默认模板或客户配置包生成；页面可以继续消费同一份 `rbac_options` 形态，不需要新增前端本地权限真源。
- 阻塞/风险：本轮只改权限管理前端页面、样式、L1 回归脚本和本过程记录；未改后端 RBAC 真源、权限码、schema、migration、API、seedData、客户配置 runtime loader、Workflow / Fact 语义或部署。当前 `config/customers/yoyoosun` 仍只是配置草案落点，未进入运行时。

- 完成：修复权限中心角色权限分组标题只有英文模块 key 的问题。新增前端权限模块显示映射，页面分组改为“中文模块名 (英文 key)”显示，例如 `业务记录 (business)`、`岗位任务端 (mobile)`、`调试能力 (debug)`；权限码和后端 RBAC 模块 key 保持不变。
- 完成：新增 `permissionModuleLabels` 单测并接入现有 `pnpm test` 列表，覆盖内置模块中文显示、空模块归入其他和未知模块保留原 key。
- 验证：`cd web && pnpm exec node --test src/erp/utils/permissionModuleLabels.test.mjs src/erp/utils/permissionCenterSearch.test.mjs` 通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过。使用 `VITE_ENABLE_RPC_MOCK=true` 临时启动 `http://127.0.0.1:5185/`，Playwright 隔离登录态打开 `/erp/system/permissions`，实际 DOM 显示 `系统管理 (system)`、`业务记录 (business)`、`岗位任务端 (mobile)`、`调试能力 (debug)` 等分组标题。
- 下一步：后续新增权限模块时，优先在同一显示映射中补中文名；不要把权限码 key 改成中文，也不要让 UI 直接裸显模块 key。
- 阻塞/风险：本轮只改权限中心前端显示、前端单测和本过程记录；未改后端 RBAC 真源、权限码、schema、migration、API、seedData、Workflow / Fact 语义或部署。in-app browser 受本地 mock 登录 token 不是 JWT 与页面执行环境限制，未作为最终已登录页验证路径；已登录页证据来自隔离 Playwright 会话。

- 完成：将入口、权限显示名、错误提示、前端 app 标题、mock 数据、回归脚本提示和正式 README/docs 中面向用户的“移动端 / 角色移动端”口径收口为“岗位任务端”。底层 `mobile.<role>.access` 权限码、`APP_ID=mobile-*`、`build/mobile-*`、`start:mobile:*`、`/m/<role>/tasks` 路由和 `mobileRoleKey` 技术字段保持不变。
- 完成：同步 `docs/current-source-of-truth.md`、RBAC 角色权限矩阵、产品 roadmap、workflow / finance / warehouse / architecture 相关正式文档和部署 README，明确设备只影响默认入口，岗位任务端仍按账号权限进入对应角色任务页。
- 验证：`bash scripts/qa/error-code-sync.sh && bash scripts/qa/error-codes.sh` 通过；`cd server && go test ./internal/biz ./internal/errcode` 通过；`cd web && pnpm test` 通过，269 个测试通过。未跑 `style:l1`，因为本轮未改 CSS、布局或交互样式。
- 下一步：后续新增用户可见入口、权限名、帮助文案时默认写“岗位任务端”；只有描述手机视口、窄屏布局、Vite 移动端端口或 `mobile-*` 技术标识时继续使用“移动端”。
- 阻塞/风险：本轮只做命名口径收口，未改权限 key、schema、migration、API 参数、路由兼容、Workflow / Fact 语义或部署。工作区同时存在非本轮的 `AdminLogin` 路由重构、`style:l1` 新场景和 `web/package.json` 测试入口改动，本轮未回退、未整理、未作为术语收口成果处理。

- 完成：修复从桌面单端口岗位任务端退出登录后，手动选择“后台管理”仍被移动端来源回跳覆盖的问题。登录后跳转逻辑已收口到 `adminLoginRouting.mjs`，`/m/<role>/tasks` 来源只有在当前仍选择“岗位任务端”时才回跳任务端；手动选择后台会进入 `/erp/dashboard`。
- 完成：补齐入口路由单测和 L1 回归场景。新增 `adminLoginRouting.test.mjs` 覆盖“任务端来源 + 继续任务端”和“任务端来源 + 手动后台”两个状态；`style:l1` 新增 `admin-login-mobile-source-desktop-choice`，从 `/m/sales/tasks` 未登录拦截到登录页，选择后台并 mock 登录后断言进入后台看板。
- 验证：`cd web && pnpm test` 通过，269 个测试通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`STYLE_L1_SCENARIOS=admin-login-mobile-source-desktop-choice pnpm style:l1` 通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个岗位任务端。Browser 复用 `http://localhost:5175`，从已登录任务端退出到 `/admin-login`，确认后台 / 岗位任务端入口可见，点击“后台管理”后选中态为后台，console error/warn 为空。
- 下一步：如果后续新增“后台 / 任务端”显式切换入口，应继续复用该路由优先级：真实来源回跳只服务当前选择的入口，用户手动选择优先于设备默认和历史任务端来源。
- 阻塞/风险：本轮只改前端登录入口路由、前端 L1 回归脚本、测试登记和过程记录；未改后端、登录接口、RBAC 权限码、seedData、schema、migration、Workflow / Fact 语义或部署。当前工作区存在大量非本轮改动，本轮未回退、未整理、未纳入成果。

- 完成：统一移除主题菜单触发按钮的 tooltip。`ERPThemeToggle` 的 menu 形态现在只保留按钮 `aria-label` 和下拉菜单选中态，不再在点击主题按钮时额外弹出“主题：浅色 / 暗色”提示，避免移动端菜单选项被 tooltip 覆盖。
- 完成：`style:l1` 的主题菜单切换 helper 新增断言，菜单打开后不允许出现可见的“主题” tooltip，防止后续重新包回 tooltip 造成遮挡回归。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,mobile-tasks-dark pnpm style:l1` 通过，覆盖桌面登录页主题菜单和移动任务端暗色主题场景。Browser 复用 `http://127.0.0.1:5175`，390x844 视口打开移动任务入口后未登录守卫落到 `/admin-login`，主题菜单打开时“跟系统 / 浅色 / 暗色”可见、可见主题 tooltip 数为 0，点击“暗色”后按钮变为“主题模式：暗色”，console error/warn 为空。
- 下一步：如后续继续优化移动端主题菜单，可优先调整菜单位置、触控尺寸或选中态，不再为该按钮恢复 hover tooltip。
- 阻塞/风险：本轮只改前端共用主题组件和 L1 回归脚本；未改主题真源、localStorage key、暗色样式 token、后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 截图接口本轮仍出现 `Page.captureScreenshot` 超时，视觉证据以 L1 产物为准；Browser DOM / console / 交互状态已验证。

- 完成：撤销生产 Compose README 中 `8.218.4.199` / Cloudflare / `yoyoosun.net` 域名 / Nginx / Let's Encrypt 作为当前部署真源的旧口径，当前部署目标改为内网服务器 `192.168.0.133`，Compose 入口为 `/opt/plush-toy-erp/current/server/deploy/compose/prod`。本轮未向 `8.218.4.199` 上传、加载镜像、重启服务或修改文件。
- 完成：按低配服务器发布约束在本机构建并上传 amd64 前端镜像 `plush-toy-erp-web:20260605T101206-0e5b65b-mobile-metrics-amd64`，服务器侧仅执行 `docker load`、更新 `.env` 的 `WEB_IMAGE`、重建 9 个 web 容器；服务端镜像仍为 `plush-toy-erp-server:20260531T145153-9b414a58-vm`。
- 完成：线上 Atlas 状态初查发现 1 个历史 pending migration `20260530161152`。该迁移为新增 `contacts / suppliers / customers / sales_orders / sales_order_items` 及索引约束，dry-run 通过后使用宿主机 `/usr/local/bin/atlas` 执行 apply；迁移后 `Migration Status: OK`，当前版本 `20260530161152`，pending files 为 0。
- 验证：`192.168.0.133` 上 `5175` 和 `5186-5193` 的 `/healthz` 均返回对应桌面 / 移动端 `{"status":"ok"}`；`8300/healthz` 返回 `ok`，`8300/readyz` 返回 `ready`；9 个 web 容器均 `healthy` 并运行新镜像。发布后按约定执行 `docker image prune -a -f` 与 `docker builder prune -f`，未执行 volume prune；清理前 `/` 为 98G / used 19G / avail 74G，清理后 avail 75G，回收 unused images 314.8MB。
- 下一步：后续如果要恢复公网域名或网关入口，必须先补新的正式部署方案、README、Compose 环境说明和 smoke，不要沿用已撤销的阿里云 / Cloudflare 旧口径。
- 阻塞/风险：本轮前端功能发布只改 web 镜像；Atlas apply 是补齐线上 release 已携带的历史 pending migration，不来自本轮移动端统计卡改动。清理已删除未被容器使用的旧 web 镜像，当前运行镜像保留；如需要更强回滚保留策略，应单独调整低配宿主机镜像清理口径。

- 完成：移动端岗位任务页统计卡改为可点击快捷入口。待办页顶部“我的预警 / 已超时 / 即将超时 / 阻塞/高优先”、已办页进度“待处理 / 处理中 / 卡住 / 完成”、我的页“待办 / 已办 / 预警 / 高优先”均只做 tab 切换和当前可见任务池筛选；点击不会选中第一条任务，也不会触发完成、催办、状态流转或 Workflow / Fact 动作。
- 完成：补齐移动端筛选主路径。新增 pending、processing、blocked、due_soon、high_priority、blocked_or_high_priority 等前端筛选 key；统计入口切换后清空选中任务、关闭详情动作态并收回对应长列表，避免沿用旧展开状态。
- 完成：`mobile-tasks-dark` L1 回归补充统计卡点击断言。测试数据新增 processing 任务，回归覆盖“处理中 / 待处理 / 完成 / 我的预警 / 阻塞或高优先 / 我的高优先 / 我的已办”等入口，确认进入正确 tab 和筛选结果。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx`、`cd web && pnpm exec stylelint "src/erp/styles/app.css"` 通过；`cd web && STYLE_L1_PORT=4187 STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && STYLE_L1_PORT=4188 pnpm style:l1` 通过，41 个场景通过。Browser 使用 `VITE_ENABLE_RPC_MOCK=true pnpm start:mobile:business` 打开 `http://localhost:5187/tasks`，390x844 视口未登录守卫落到 `/admin-login`、页面非空、console error/warn 为空；Browser 因登录表单事件和本地存储注入安全策略限制未进入已登录任务页，已登录统计卡交互证据以 L1 mock 后端回归为准。
- 下一步：如果后续希望统计入口支持 URL 可分享筛选态，再单独评审 query 参数、返回恢复态和底部 tab 状态同步；不要把点击统计卡升级为业务动作入口。
- 阻塞/风险：本轮只改移动端任务页前端交互、移动端按钮样式、L1 回归脚本和本过程记录；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Inventory / Shipment / Finance facts、部署或真实通知表。当前工作区已有同文件移动端消息、刷新和长列表现场改动，本轮在其上增量实现，未回退或清理非本轮内容。

- 完成：继续优化移动端岗位任务页在数据很多时的浏览体验。待办、已办、预警、通知四类长列表统一增加默认收起和“展开全部 / 收起”控制：待办默认 12 条，已办默认 10 条，预警 / 通知默认 8 条；展开按钮显示总数和剩余数量，筛选切换会收回待办列表，避免换筛选后直接铺满长页面。
- 完成：通知候选列表不再在数据层预先 `slice(0, 8)`，改由统一展示控制决定默认条数和展开，避免通知多时永远无法看到第 9 条之后。该调整仍只属于移动端展示层，不改变通知事实来源或后端 API。
- 完成：`mobile-tasks-dark` L1 回归改为创建大量待办、预警、通知和已办样本，逐项验证默认收起、展开后条目增加、收起后恢复、无横向溢出、消息二级 tab sticky 和暗色可读性。
- 验证：`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过；Browser 打开 `http://127.0.0.1:5175/m/sales/tasks` 验证未登录守卫落到 `/admin-login`、页面 DOM 非空、无 framework overlay、console error/warn 为空。
- 下一步：如果后续真实任务量继续增大到数百条，应先评审后端分页 / cursor 和移动端搜索，而不是继续提高前端一次性渲染上限。
- 阻塞/风险：本轮仍未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。当前优化只控制前端已加载数据的展示长度；接口仍按现有查询返回任务集合。

- 完成：移动端岗位任务页“消息”分区新增预警 / 通知二级切换。消息页默认显示预警列表，通知通过顶部 sticky 分段控件一键切换，不再把通知区块排在预警长列表后面；当前只调整前端展示信息架构，不改后端通知真源、Workflow / Fact 语义、路由、RBAC 或真实通知表。
- 完成：补齐二级切换的浅色 / 暗色样式和 `mobile-tasks-dark` L1 回归断言。回归检查消息页默认只渲染预警 section，点击“通知”后只渲染通知 section，二级 tab sticky 盒模型稳定、卡片无横向溢出，并保留暗色消息卡片对比度检查。
- 验证：`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过。Browser 打开 `http://127.0.0.1:5175/m/boss/tasks` 验证未登录守卫落到 `/admin-login`、页面非空、console error/warn 为空；Browser 受限于本地 mock 登录态写入 / Ant Design Form 状态，未进入已登录消息页，已登录消息页交互证据以 L1 的 Playwright mock 后端回归为准。
- 下一步：如后续要把“通知”从当前 active task 摘要升级为真实通知流，应先评审通知事实来源、已读状态和后端 API，再改数据层；不要只在前端继续派生长期通知真源。
- 阻塞/风险：本轮只改移动端任务页展示、移动端样式、L1 回归脚本和本过程记录；未改后端、schema、migration、RBAC、seedData、部署、WorkflowUsecase、Inventory / Shipment / Finance facts 或真实通知表。通知列表仍沿用当前 `activeTasks.slice(0, 8)` 的既有口径，本轮未重新定义通知数据来源。

- 完成：移动端岗位任务页手动刷新新增明确反馈。页面初始化加载仍保持原有加载失败提示；用户点击页头“刷新”后，成功显示“数据已刷新”，失败显示“刷新移动端任务失败，已保留上次数据”，并保留上次任务列表不清空。
- 完成：`mobile-tasks-dark` L1 回归补充手动刷新成功 / 失败提示断言。失败分支用一次未知英文业务错误模拟接口异常，验证前端不会透传英文原文，而是走当前交互的中文 fallback。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx` 通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过。Browser 使用 `VITE_ENABLE_RPC_MOCK=true pnpm start:mobile:business` 临时打开 `http://localhost:5187/tasks`，未登录守卫落到 `/admin-login`，390x844 视口非空、无 framework overlay、console error/warn 为空；目标刷新交互证据以 L1 的 Playwright mock 后端回归为准。
- 下一步：如后续要覆盖真实登录态下的移动端刷新，可复用 `mobile-auth-login-route-smoke` 的登录 mock，把刷新 toast 断言扩到全部 8 个岗位入口。
- 阻塞/风险：本轮只改移动端任务页刷新提示和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、移动端路由或部署。`cd web && pnpm style:l1` 全量运行在到达移动端场景前失败于既有 `business-module-dark-products-modal-desktop` 弹窗水平居中断言（modal centerX=1776，viewport centerX=1024），与本轮刷新入口不同页，本轮未顺手修改该无关弹窗布局。

- 完成：继续修复移动端岗位任务“消息”分区暗色模式可读性。预警 / 通知消息区块和消息卡片新增稳定语义类，暗色下不再沿用浅灰 `bg-white/bg-slate-50` 背景；预警等级、任务名、来源单号、阻塞原因和通知时间分别补齐暗色背景上的可读文字颜色。
- 完成：`mobile-tasks-dark` L1 回归扩展到消息 tab，切入“消息”后检查预警 / 通知区块、消息卡片非浅色背景、边框清晰、文字对比度不低于 4.5、底部导航固定和无横向溢出；保留详情态暗色断言。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx`、`cd web && pnpm exec stylelint "src/erp/styles/app.css"` 通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过；临时 Playwright 截图 `/tmp/plush-mobile-messages-dark.png` 验证 `/m/boss/tasks` 消息页卡片为暗色背景且 console error 为空。
- 下一步：如果继续出现暗色可读性问题，应优先把对应页面状态纳入 L1 的 computed color / box 模型断言，再调整具体样式。
- 阻塞/风险：本轮只改移动端任务消息页样式、组件语义类和前端回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 对 authenticated mock 状态仍不作为主验证路径，消息页视觉证据来自 Playwright L1 和临时截图。

- 完成：修复移动端岗位任务详情暗色模式文字可读性问题。任务详情页头、任务关键信息表格、质检不合格风险提示、关联单据、最近动态和底部处理动作按钮补齐暗色背景、边框、文字与禁用态覆盖；按钮不再依赖透明度压暗导致文字对比不足。
- 完成：`style:l1` 的 `mobile-tasks-dark` 场景新增详情态断言，进入“暗色任务验证”任务后检查详情页关键文字、暗色对比度、横向溢出、底部动作栏固定位置和 4 个动作按钮尺寸，避免列表态通过但详情态漏检。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，41 个场景通过；已查看 `web/output/playwright/style-l1/mobile-tasks-dark.png`，暗色详情页文字、风险提示和底部按钮均可读且无横向溢出。
- 下一步：如继续反馈暗色问题，优先按页面状态补语义类名和 L1 computed style / box 模型断言，不只修当前截图节点。
- 阻塞/风险：本轮只改移动端任务详情页前端样式、详情组件类名和前端回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 辅助打开未登录移动任务入口会跳转 `/admin-login` 且 console 无 error/warn；Browser 截图接口本轮仍超时，详情态视觉证据以 Playwright L1 产物为准。

- 完成：修复桌面单端口移动任务页 `/m/<role>/tasks` 的浏览器后退串回桌面后台问题。`ERPRouter` 新增 `MobileEntryBackGuard`，记录最近一次岗位任务端路径；当浏览器 `POP` 或 back/forward 整页恢复落到 `/` 或 `/erp/*` 桌面入口时，用 `replace` 回到上一条移动任务路径，避免从任务端后退到后台壳层。
- 完成：`style:l1` 新增 `mobile-tasks-browser-back-stays-mobile` 场景，覆盖已登录 `/erp/dashboard` -> `/m/sales/tasks` -> 浏览器后退，断言最终仍在 `/m/sales/tasks`、移动任务页壳层存在、桌面后台壳层不存在。
- 验证：`cd web && pnpm lint`、`pnpm css`、`pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-browser-back-stays-mobile pnpm style:l1` 通过。Browser 复用 `http://localhost:5175`，真实登录后验证 `/erp/dashboard -> /m/boss/tasks -> 浏览器后退` 最终仍停在 `/m/boss/tasks`，移动任务页壳层存在、桌面后台壳层不存在、console error/warn 为空。
- 下一步：如后续新增任务端到桌面后台的显式切换入口，应使用明确按钮或入口选择页，不依赖浏览器后退跨入口切换。
- 阻塞/风险：本轮只改桌面单端口移动任务端的前端路由返回栈和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 截图接口本轮 `Page.captureScreenshot` 超时，视觉截图证据以 `style:l1` 产物为准。

- 完成：新增移动端岗位任务页原型资产落点 `docs/assets/mobile-role-tasks/README.md`，预留列表页、详情页、风险分组页 3 个稳定原型文件名；新增 `docs/product/mobile-role-tasks-redesign.md` 记录采用方向、实现边界和“原型图非业务真源”说明。
- 完成：同步更新 `docs/README.md` 和 `docs/document-inventory.md`，把移动端岗位任务页改版说明纳入详细设计入口，并把原型资产 README / 产品改版说明纳入长期文档清单。
- 下一步：用户提供原始 PNG 文件或本地路径后，将图片补入 `docs/assets/mobile-role-tasks/` 并把产品说明中的“待补原图”更新为“已归档”。
- 阻塞/风险：当前对话中的原型图二进制文件不在本地工作区，无法直接从聊天显示内容落成 PNG；本轮只建立仓库落点和引用清单，未生成替代图片，也未改运行时代码。

- 完成：移动端岗位任务页按原型方向重做为移动优先列表。默认态改为「待办 + 岗位胶囊 + 刷新」、最后同步 / 最近任务摘要、四项指标条、分段筛选、任务列表行和底部导航；手机视口先看任务队列，进度 / 预警 / 通知下移，平板仍保留双栏。
- 完成：点选任务后进入详情态，展示任务关键信息、风险提示、关联单据、最近动态、阻塞 / 退回 / 催办原因输入和底部动作栏；状态更新、催办、下游 follow-up 仍复用现有 `moveTask` / `urgeTask` 主路径，未改后端、RBAC、Workflow/Fact 语义或事实层。
- 完成：移动端外壳去掉旧桌面卡片式页头，避免“待办”页面继续像桌面卡片；暗色模式补齐移动任务页背景、文本和强调色覆盖，保留 `surface-panel` / `erp-mobile-list-item` 回归锚点。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个移动端角色和手机 / iPad 任务页截图；`cd web && pnpm style:l1` 通过，40 个场景通过。已查看 `web/output/playwright/mobile-auth-login-route-smoke/mobile-warehouse-phone-tasks.png`，默认态已从旧桌面卡片改为移动端任务列表且无横向溢出。
- 下一步：如继续做第二轮移动端细节，可优先补“详情页真实动作流”的专门 Playwright 回归，包括阻塞原因输入、完成、催办和返回列表；也可按 PMC / 老板汇总视角做风险分组列表。
- 阻塞/风险：本轮只改移动端任务页、移动端外壳和移动端暗色样式覆盖；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。当前工作区仍有本轮之前就存在的 `web/scripts/styleL1.mjs`、`web/src/erp/pages/BusinessModulePage.jsx` 等现场改动，本轮未回退、未清理、未作为移动端改版成果处理。

- 完成：继续修正移动端岗位任务页改版遗留问题。底部 `待办 / 已办 / 消息 / 我的` 改为同页真实分区并固定在任务页视口底部；正文改为独立滚动区，退出登录从外壳底部移入“我的”分区，待办默认态不再混入旧的进度 / 预警 / 通知区块。
- 完成：详情页同步改为固定高度壳层，任务正文独立滚动，底部处理 / 阻塞 / 完成 / 催办动作栏固定在容器底部；状态更新、催办和后续 follow-up 仍复用现有 `moveTask` / `urgeTask` 主路径，未新增路由、权限码或后端事实写入。
- 完成：同步 `docs/product/mobile-role-tasks-redesign.md`，明确底部四项当前只是页面内前端分区，不升级为权限或路由真源；更新 `style:l1` 和 `mobile-auth-login-route-smoke` 断言，覆盖底部导航固定、tab 切换、退出登录只在“我的”出现，以及手机 / iPad 盒模型。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，40 个场景通过；`MOBILE_AUTH_SMOKE_APP_ID=mobile-business pnpm smoke:mobile-auth-login-route` 通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个移动端角色和手机 / iPad。Browser 打开 `http://localhost:5175/m/sales/tasks` 验证未登录守卫跳转 `/admin-login` 且 console 无 error/warn；Browser 截图接口本轮超时，移动端任务页视觉证据以 L1 / smoke Playwright 截图和 DOM 断言为准。
- 下一步：如果继续按原型细化，可补“已办 / 消息 / 我的”更完整的信息架构，或为详情页真实动作流增加专门回归：阻塞原因输入、完成、催办、返回列表和恢复态。
- 阻塞/风险：本轮只改移动端任务页、移动端外壳、移动端样式、前端回归脚本和改版说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。原型 PNG 仍未落入 `docs/assets/mobile-role-tasks/`，当前按仓库改版说明和用户截图方向实现；工作区仍保留本轮之前已有的 `BusinessModulePage.jsx`、合同纸面样式、dev docs 样式和部分 L1 框架现场改动，本轮未回退。

## 2026-06-04 22:04 CST
- 完成：修复采购合同服务端 PDF 在线预览 / 下载样式丢失。根因是后端通过 `data:text/html` 交给 Chromium 渲染时，生产构建里的外链 CSS 会被 `data:` 文档跨源加载拦截；当前快照改为在前端克隆阶段内联已加载 stylesheet，并移除外链 stylesheet / preload，保证服务端 PDF 使用同一份纸面样式。
- 完成：补齐服务器与本机字体度量差异下的采购合同短字段列样式，采购订单号、产品订单编号、单位、数量、金额列不再按字符拆行；同步让 `style:l1` 的 Chromium 直连本地地址，并对本地 `goto` 的 `ERR_ADDRESS_INVALID / ERR_CONNECTION_REFUSED` 做有限重试，修复全量回归里 Vite HMR / 127.0.0.1 导航偶发打断。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`NODE_USE_ENV_PROXY=0 pnpm style:l1` 通过，40 个场景通过；`pnpm build` 通过；本地生产页面 + 本地后端生成的在线预览和下载 PDF 均为 110328 bytes，渲染第一页确认标题、表格、边距正常；133 已部署 `WEB_IMAGE=plush-toy-erp-web:20260604T214355-5da677a-pdf-style-v3-amd64`，5175 / 5186-5193 / 8300 健康检查通过，远端在线预览和下载 PDF 均为 348096 bytes，渲染第一页确认纸面样式、编号列和 PCS 正常；最终远端 PDF `pdfinfo` 显示 `Pages: 1`，未再出现第二页空白。
- 下一步：如果后续继续调整合同模板，应优先走服务端 PDF 快照 + Poppler 渲染验证，避免只看浏览器页面；`style:l1` 若再出现非业务断言失败，应继续收口到脚本框架层，而不是在单个场景重复补局部重试。
- 阻塞/风险：本轮未改后端、schema、migration、RBAC、seedData 或业务事实层；最终发布镜像从隔离 detached worktree 构建，只套用本轮 `styleL1.mjs` 与 `app.css` diff，避免混入主工作区里非本轮 `BusinessModulePage.jsx` 改动。主工作区仍保留非本轮 `BusinessModulePage.jsx / progress.md` 现场，未回退、未提交。

## 2026-06-04 21:52 CST
- 完成：修复暗色业务弹窗明细统计区仍看不清的问题。根因是 `.erp-business-record-form__item-summary` 下的 `.erp-item-summary-metric` 自定义统计胶囊仍沿用浅色背景、浅蓝边框和 Ant Design 浅色次级文字，暗色模式下 label 对比度不足；本轮补齐暗色背景、蓝色细边、次级文字和数值颜色。
- 完成：`business-module-dark-products-modal-desktop` L1 场景新增明细统计胶囊 computed style 断言，检查至少 3 个统计 chip 的暗色背景、清晰边框、label 对比度和数值对比度，避免后续再次漏掉「已录入 / 数量合计 / 金额合计」这类自定义 UI。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`STYLE_L1_PORT=4457 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；已查看 `web/output/playwright/style-l1/business-module-dark-products-modal-desktop.png`，暗色产品弹窗渲染正常。
- 下一步：后续若继续反馈暗色主题问题，优先搜索自定义 `erp-*` 组件，不只看 Ant Design token；每个自定义状态块都应补暗色覆盖和 L1 computed style 断言。
- 阻塞/风险：本轮只改业务弹窗明细统计 chip 样式和 L1 断言；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。工作区仍存在 `tmp/pdfs/*` 未跟踪临时验证产物；`web/src/erp/styles/app.css` 中还包含非本轮采购合同纸面列宽 / 字号现场改动，本轮未回退或清理。追加前 `progress.md` 为 349 行 / 74451 bytes，未达到归档阈值。

## 2026-06-04 21:46 CST
- 完成：为桌面业务页“导出当前结果”增加空结果保护。`BusinessModulePage.jsx` 现在在导出 CSV 前检查当前筛选 / 排序后的 `displayRecords`，没有记录时提示“当前结果没有记录，无法导出”并直接返回，不再创建下载链接。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；使用临时 Playwright 回归打开 `http://127.0.0.1:5275/erp/master/products`，空记录点击导出显示提示且未触发 download；`STYLE_L1_BASE_URL=http://127.0.0.1:5275 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过。
- 下一步：如后续要把导出行为扩展到“仅导出勾选记录”等模式，再按各导出入口分别补空态文案与下载事件回归。
- 阻塞/风险：本轮只改前端业务页导出按钮行为；未改后端、schema、migration、RBAC、seedData、业务事实层、CSV 字段口径或部署。工作区已有非本轮 `progress.md`、`web/scripts/styleL1.mjs`、`web/src/erp/styles/app.css` 和 `tmp/pdfs/*` 现场改动，本轮未回退或清理。追加前 `progress.md` 为 362 行 / 77538 bytes，未达到归档阈值。

## 2026-06-04 21:37 CST
- 完成：优化开发文档查看器 `/__dev/docs` 左侧滚动列表的右侧安全区。置顶列表、搜索结果列表和目录树统一增加稳定 scrollbar gutter 和 18px 右侧内边距，避免系统 overlay 滚动条显现时盖住目录计数 badge 或行内置顶图钉，导致快速滚动后按钮难以点击。
- 验证：`pnpm --dir web css` 通过；`pnpm --dir web exec node --test src/erp/config/devDocs.test.mjs` 通过；`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs` 实测目录树右侧计数 / pin 到滚动容器右边距从约 10-11px 提升到 18-27px，滚动后可见图钉真实点击置顶数 `7 -> 8`，再次点击恢复 `7`，页面无横向溢出且 console error/warn 为空。
- 下一步：后续若继续加目录树右侧动作，优先复用该滚动安全区，避免动作按钮贴近滚动条；如新增移动端独立布局，再补对应视口回归。
- 阻塞/风险：本轮只改 dev docs 左侧滚动列表样式；未改产品菜单、seedData、RBAC、docs registry、后端、schema、migration 或部署。工作区仍有非本轮未提交现场和 `tmp/pdfs/*` 产物，本轮未回退或清理。追加前 `progress.md` 为 349 行 / 74451 bytes，未达到归档阈值。

## 2026-06-05 21:38 CST
- 完成：按 Product Design 审计方式先扫描输入控件使用点并采集权限创建管理员弹窗浅色 / 暗色近景证据；确认本轮截图里的风格不统一根因是权限中心三个 Modal 漏挂已有 `.erp-permission-modal` 样式入口，普通 `Input` 未继承权限弹窗控件圆角和边框 token。
- 完成：为创建管理员、分配角色、重置密码三个权限中心弹窗接回 `.erp-permission-modal`；`style:l1` 的权限中心创建管理员弹窗回归新增 class 挂载和普通 Input / Password / Select 圆角一致性断言，避免后续再次退回到 0px 圆角输入框。
- 验证：`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/pages/PermissionCenterPage.jsx scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`STYLE_L1_SCENARIOS=permission-center-desktop pnpm style:l1` 通过。已重新采集权限创建管理员弹窗浅色 / 暗色截图，修复后账号、手机号、密码和角色控件均为 10px 圆角、32px 高度，`erp-permission-modal` class 已挂载。
- 下一步：如果继续做全局表单控件治理，应按审计结果分层推进：先抽统一 modal/form control 规则，再逐步覆盖业务表单、V1 主数据 / 订单表单、筛选器和移动端；登录页与打印工作台控件不应直接套后台业务表单风格。
- 阻塞/风险：本轮只修复权限中心弹窗样式入口和对应前端回归断言；未改后端、schema、migration、RBAC、seedData、权限语义、角色模板配置或部署。`web/output/product-design/input-control-style-audit-2026-06-05/` 下为本轮本地审计截图和指标证据，不作为正式产品文档真源。

## 2026-06-05 22:01 CST
- 完成：修复岗位任务端待办页顶部统计快捷卡没有选中态的问题。`我的预警`、`已超时`、`即将超时`、`阻塞/高优先` 现在由 `activeMainTabKey / activeFilterKey` 派生 `aria-pressed` 和 active class；从“我的”分区点击“高优先”跳回待办后，会在顶部 `阻塞/高优先` 卡片显示选中态。
- 完成：同步补齐统计快捷卡盒模型收缩规则，长标签可换行，`0/1` 这类组合数值在 390px 四列移动视口下不再造成横向溢出；选中态只改变背景、内阴影和颜色，不改变网格结构。
- 完成：`style:l1` 的 `mobile-tasks-dark` 交互链路新增选中态断言，覆盖点击“我的预警”、点击“阻塞/高优先”、以及从“我的 / 高优先”跳回待办后的 `aria-pressed`、active class、可见背景 / 内阴影和按钮横向溢出。
- 验证：`cd web && pnpm exec prettier --check src/erp/styles/app.css src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs` 通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，42 个场景通过。Browser 打开 `http://127.0.0.1:5175/m/sales/tasks` 验证未登录跳转 `/admin-login`、页面非空、无框架 overlay、console error/warn 为空；Browser 截图接口本轮超时，视觉 / 交互证据以 `style:l1` DOM 和盒模型断言为准。
- 下一步：若继续细化岗位任务端，可再评审是否把 `高优先` 从合并统计卡拆成独立顶部筛选；本轮先沿用现有 `阻塞/高优先` 统计口径，不新增筛选项或任务语义。
- 阻塞/风险：本轮只改移动端任务页统计按钮状态、移动端样式和前端 L1 回归；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。工作区已有大量非本轮改动，本轮未回退、未提交。

## 2026-06-05 22:23 CST
- 完成：继续收口岗位任务端待办页信息架构，取消顶部统计卡和已办进度卡的筛选 / 选中态，把它们改为只读摘要，避免“统计卡 + 主筛选 tab + 我的快捷卡”三层都像 tab 的冗余交互。
- 完成：待办主筛选收敛为 `全部 / 风险 / 超时 / 我负责`；其中 `风险` 聚合预警、即将超时、阻塞和高优先任务。`我的` 分区的原 `高优先` 快捷入口同步改为 `风险`，点击后回到待办页并选中主筛选 `风险`。
- 完成：同步更新岗位任务端产品设计记录，明确顶部指标只读、进度只读、主筛选唯一承担列表过滤，避免后续继续把统计摘要做成隐性 tab。
- 验证：`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && MOBILE_AUTH_SMOKE_APP_ID=mobile-business pnpm smoke:mobile-auth-login-route` 通过；`cd web && pnpm exec prettier --check src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs scripts/mobileAuthLoginRouteSmoke.mjs src/erp/styles/app.css ../docs/product/mobile-role-tasks-redesign.md` 通过；`cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1 && pnpm smoke:mobile-auth-login-route` 通过，测试 271 个通过、L1 42 个场景通过、8 个移动角色登录路由 smoke 通过；`git diff --check` 覆盖本轮触达文件通过。Browser 打开 `http://127.0.0.1:5175/m/sales/tasks` 验证运行时可启动，未登录按预期跳转 `/admin-login`，React root 挂载、页面非空且无 Vite error overlay。
- 下一步：如果后续还要强化岗位任务端，可以再做任务风险分组 / 通知来源的正式能力评审；本轮不新增后端任务语义或通知事实。
- 阻塞/风险：本轮只改移动端岗位任务页 UI 交互、样式、前端回归脚本和产品设计说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。Browser 健康检查受限于 in-app Browser 无法安装测试脚本里的 JSON-RPC route mock，完整列表筛选交互以 `style:l1` 自动化断言为准。追加前 `progress.md` 为 163 行 / 41944 bytes，未达到归档阈值。

## 2026-06-05 23:14 CST
- 完成：修复“我的”页点击 `预警` 跳到待办后没有任何选中态的问题。根因是 `预警` 仍使用旧的 `alert` 隐藏筛选 key，而待办页主筛选已经收敛为 `全部 / 风险 / 超时 / 我负责`，目标页没有可见 `预警` tab 可以高亮。
- 完成：按主筛选对齐原则，把“我的”页快捷入口改为 `待办 / 已办 / 超时 / 风险`；`超时` 跳回待办后选中 `超时` 主筛选，`风险` 继续承接预警、即将超时、阻塞和高优先的聚合入口，避免 `预警` 与 `风险` 并列造成包含关系不清。
- 完成：`mobile-tasks-dark` L1 场景新增明确超时任务，并断言“我的 / 超时”跳回后 `mobile-role-filter-overdue` 高亮且列表进入超时集合；产品设计说明同步记录“我的”快捷入口必须落到可见主筛选。
- 验证：`cd web && pnpm exec prettier --check src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs ../docs/product/mobile-role-tasks-redesign.md` 通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；顺序执行 `cd web && pnpm style:l1` 通过，42 个场景通过；顺序执行 `cd web && pnpm smoke:mobile-auth-login-route` 通过，8 个岗位任务端角色通过；`git diff --check` 覆盖本轮触达文件通过。
- 下一步：如后续仍要保留单独“预警”入口，必须先把它设计成待办页可见主筛选或消息页入口，不能再用隐藏 filter key 跳到待办列表。
- 阻塞/风险：本轮只改移动端“我的”快捷入口、L1 回归数据 / 断言和产品设计说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。全量 `style:l1` 与移动登录 smoke 曾被并行执行互相污染本地浏览器 / 会话状态，已改为顺序执行并通过。追加前 `progress.md` 为 192 行 / 49346 bytes，未达到归档阈值。

## 2026-06-05 22:52 CST
- 完成：把岗位任务端长列表造数从临时 L1 数据补到真实 debug seed 主路径。每个业务链路调试场景现在保留原始关键任务，并额外按“老板 + 场景已有任务角色”生成待办、预警、已办三组长列表样本，每组 24 条；任务 payload 标记 `debug_mobile_list`，不改变 Workflow / Fact 业务语义。
- 完成：前端 mock JSON-RPC server 初始任务池同步补齐 8 个岗位的待办 / 预警 / 已办长列表样本，每组 24 条；`style:l1` 的移动任务场景造数扩到 30 条，并修正断言不再依赖第 1 条刚好出现在收起区。
- 验证：`cd server && go test ./internal/biz` 通过；`cd web && pnpm exec eslint --ext .js --ext .jsx src/mocks/jsonRpcMockServer.js scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过，覆盖待办筛选 sticky、待办 / 已办 / 预警 / 通知长列表展开收起和老板端已办长列表。
- 下一步：当前已存在的旧 `DBG-RUN-*` 数据不会自动补新样本；需要在业务链路调试里重新生成一个 debug run，或先清理旧 run 后再生成，才能在真实页面看到几十条。
- 阻塞/风险：本轮只改 debug seed / mock / L1 造数与后端 seed 单测；未改 schema、migration、RBAC、正式 WorkflowUsecase 规则、业务事实层、seedData、菜单或部署。追加前 `progress.md` 为 178 行 / 46209 bytes，未达到归档阈值。

## 2026-06-05 23:10 CST
- 完成：按用户要求实际运行业务链路 debug seed。先用 `RUN-20260605T2255-MOBILE-LIST` 验证老板 / 场景角色长列表可生成，随后发现采购、生产真实岗位页仍缺少样本，因此把 `server/internal/biz/debug_seed.go` 的移动端长列表角色范围扩大到 8 个岗位全覆盖。
- 完成：重建并重启本地后端 `server-dev`，用最终 run id `RUN-20260605T2310-MOBILE-ALL` 重新生成 6 个内置业务链路场景；每个场景生成约 577-579 条任务，老板、业务、采购、仓库、品质、财务、PMC、生产 8 个岗位均能查到本轮待办 / 预警 / 已办长列表任务。
- 验证：`cd server && go test ./internal/biz` 通过；`curl -fsS http://127.0.0.1:8300/healthz` 返回 `ok`；通过 JSON-RPC `workflow.list_tasks` 按 8 个 `owner_role_key` 复核 `RUN-20260605T2310-MOBILE-ALL`，每个岗位在返回窗口内均包含 ready / blocked / done 长列表任务。
- 下一步：页面如果仍显示旧数据，刷新岗位任务端或重新登录；如后续需要减少 debug 数据体积，可按 `debug_run_id` 单独清理旧 run，再保留最终 `RUN-20260605T2310-MOBILE-ALL`。
- 阻塞/风险：本轮追加了真实调试数据，没有清理旧 `RUN-20260605T2255-MOBILE-LIST`、`RUN-20260605T2305-MOBILE-ALL` 或更早 `DBG-RUN-*` 数据；未改 schema、migration、RBAC、正式 WorkflowUsecase 规则、业务事实层、seedData、菜单或部署。追加前 `progress.md` 为 185 行 / 47788 bytes，未达到归档阈值。

## 2026-06-06 11:14 CST
- 完成：补齐岗位任务端待办筛选的正式交互语义。`docs/product/mobile-role-tasks-redesign.md` 现在明确待办主筛选是视图筛选，不是互斥业务分类；`风险` 是异常聚合视图，`超时` 是其中需要单独快速定位的强风险子集，同一任务可以同时出现在两个视图中。
- 下一步：后续若继续新增待办快捷入口或筛选项，必须先判断它是互斥分类、聚合视图还是子集视图，再决定是否需要可见 tab、快捷入口或消息页入口。
- 阻塞/风险：本轮只补正式产品设计说明，不改前端代码、后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。追加前 `progress.md` 为 200 行 / 51422 bytes，未达到归档阈值。

## 2026-06-06 11:47 CST
- 完成：把岗位任务端长列表展开从“一次展开全部”改为分批展开。待办初始 12 条、已办初始 10 条、预警 / 通知初始 8 条；每次点击只增加一个同等批次，直到最后一批才显示 `收起`。
- 完成：同步更新 `mobile-tasks-dark` L1 回归，断言初始数量、`再显示 N / 剩余 N` 文案、首次只增加一个批次、连续展开到最后出现收起、收起后恢复默认数量；产品设计说明补充暂不搜索时的长列表定位策略。
- 验证：`cd web && pnpm exec prettier --check src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs ../docs/product/mobile-role-tasks-redesign.md` 通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`cd web && pnpm style:l1` 首次在 `root-redirect-mobile` 偶发等待登录页标题超时，复跑通过 42 个场景；`git diff --check` 覆盖本轮触达文件通过。
- 下一步：如果后续单角色任务量继续上升，再评审是否补轻量关键词搜索；当前先保持筛选 + 风险优先排序 + 分批展开。
- 阻塞/风险：本轮只改移动端列表展开交互、L1 回归和产品设计说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。in-app Browser 对本地 `127.0.0.1 / localhost:5175` 返回 `ERR_BLOCKED_BY_CLIENT`，本轮浏览器级交互证据以项目 `style:l1` Playwright 断言为准。追加前 `progress.md` 为 205 行 / 52240 bytes，未达到归档阈值。

## 2026-06-06 12:07 CST
- 完成：为岗位任务端列表页增加右下角回到顶部按钮。按钮只在正文滚动超过阈值后出现，点击只滚动当前 `[data-testid="mobile-role-scroll"]` 容器回到顶部，不改变筛选、展开数量或任务状态；任务详情页不渲染该按钮，避免遮挡底部动作栏。
- 完成：同步补齐浅色 / 暗色样式和正式设计说明；`mobile-tasks-dark` L1 场景新增回到顶部断言，覆盖默认隐藏、滚动后显示、按钮尺寸、与底部导航安全距离、横向溢出、点击后回到顶部并隐藏、详情页不显示。
- 验证：`cd web && pnpm exec prettier --check src/erp/mobile/pages/MobileRoleTasksPage.jsx scripts/styleL1.mjs src/erp/styles/app.css ../docs/product/mobile-role-tasks-redesign.md` 通过；`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，271 个测试通过；`cd web && pnpm style:l1` 通过，42 个场景通过；`git diff --check` 覆盖本轮触达文件通过。Browser 打开 `http://127.0.0.1:5175/m/sales/tasks` 后按未登录状态跳转 `/admin-login`，React root 正常、页面非空、无 Vite error overlay。
- 下一步：如果后续需要进一步提升长列表效率，再评审是否给顶部标题增加点击回顶或补轻量搜索；当前主路径先保留明确按钮。
- 阻塞/风险：本轮只改移动端岗位任务页列表回顶交互、样式、L1 回归和产品设计说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。Browser 无法注入 `style:l1` 的 JSON-RPC route mock，真实任务列表交互仍以项目 Playwright L1 断言为准。追加前 `progress.md` 为 212 行 / 53921 bytes，未达到归档阈值。

## 2026-06-06 13:20 CST
- 完成：新增 dev/test/demo 专用角色演示管理员账号 seed。`server/cmd/seed-role-demo-admins` 和 `scripts/seed-role-demo-admins.sh` 会显式生成 `demo_boss`、`demo_sales`、`demo_purchase`、`demo_production`、`demo_warehouse`、`demo_quality`、`demo_finance`、`demo_pmc`、`demo_admin`，每个账号只绑定对应真实 RBAC 角色；`demo_debug` 仅在 `--include-debug` 时生成。
- 完成：将 RBAC 内置 seed 抽成可复用 `SeedBuiltinRBACIfNeeded`，脚本执行前先确保内置权限和角色存在；已有演示账号重跑时恢复 `disabled=false`、`is_super_admin=false` 和单一角色绑定，默认不重置密码，`--reset-password` 才更新密码。脚本默认拒绝 prod 配置或 prod 环境变量。
- 完成：同步更新 `scripts/README.md`、`server/docs/config.md` 和 `server/Makefile`，明确角色演示账号不是 `config` 默认凭据、不是客户配置包，也不会写入 `conf.proto` 或生产配置。
- 验证：`cd server && go test ./internal/data ./cmd/seed-role-demo-admins` 通过；`cd server && go run ./cmd/seed-role-demo-admins -conf ./configs/dev/config.yaml` 按预期先拒绝缺少演示密码且不连库；`bash -n scripts/seed-role-demo-admins.sh` 通过；`cd server && go run ./cmd/seed-role-demo-admins -conf ./configs/prod/config.yaml -password role-demo-password` 按预期拒绝 prod 配置；`git diff --check` 通过；`bash scripts/project-scan.sh --strict` 通过。
- 下一步：需要实际生成账号时，在本地或验收库执行 `ERP_ROLE_DEMO_PASSWORD='...' bash scripts/seed-role-demo-admins.sh`；如需统一更新已有演示账号密码，加 `--reset-password`。
- 阻塞/风险：本轮未实际连接数据库生成账号，未改 schema、migration、前端登录态、RBAC 角色语义、seedData、Workflow / Fact、客户配置包或部署。追加前 `progress.md` 为 219 行 / 55785 bytes，未达到归档阈值。

## 2026-06-06 15:37 CST
- 完成：修复开发文档查看器 `/__dev/docs` 刷新后回到默认文档的问题。当前打开文档路径现在写入浏览器本地偏好 `plush_erp_dev_docs_selected_path`，页面初始化时只恢复仍存在的仓库 Markdown 路径；若文档被删除或路径失效，则回到默认文档。
- 完成：置顶区、搜索结果和目录树选择文档统一走当前文档选择入口；同步更新 `web/README.md` 的开发态文档查看器说明，明确当前打开文档和置顶文档都属于浏览器本地偏好。
- 验证：`cd web && pnpm exec eslint --fix --ext .js --ext .jsx src/erp/pages/DevDocsPage.jsx src/erp/config/devDocs.mjs src/erp/config/devDocs.test.mjs` 通过；`cd web && pnpm exec node --test src/erp/config/devDocs.test.mjs` 通过；`cd web && pnpm test` 通过，272 个测试通过；`cd web && pnpm css` 通过；`cd web && STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs`，搜索并选择 `docs/product/test-strategy.md` 后刷新，右侧 toolbar 仍显示 `docs/product/test-strategy.md`，置顶区 active 也保持该文档，console error/warn 为空。
- 下一步：如后续希望跨浏览器或跨设备保留文档位置，再评审 URL query 或 hash 方案；当前先使用本地偏好满足开发阶段频繁刷新场景。
- 阻塞/风险：本轮只改 dev-only 文档查看器、前端配置测试和 `web/README.md` 说明；未改产品菜单、seedData、RBAC、docs registry、后端、schema、migration、部署或正式文档真源。Browser 首次新标签导航到 `127.0.0.1:5175` 时崩溃，改用 `localhost:5175` 后完成 DOM 回归；Browser 截图接口仍超时，视觉截图证据以 `style:l1` 场景为准。追加前 `progress.md` 为 227 行 / 57755 bytes，未达到归档阈值。

## 2026-06-06 15:56 CST
- 完成：继续优化开发文档查看器 `/__dev/docs` 的刷新体验。目录树展开状态现在写入浏览器本地偏好 `plush_erp_dev_docs_expanded_dirs`，页面初始化时只恢复仍存在的 `dir:*` 目录 key；本地没有记录时仍默认展开 `docs`。
- 完成：`dev-docs-dark-desktop` L1 场景新增目录展开刷新恢复断言，覆盖清空旧偏好、默认 `product / warehouse` 未展开、手动展开、刷新后仍展开且内部文档仍可见；`web/README.md` 同步说明当前打开文档和目录树展开状态都会刷新恢复。
- 验证：`cd web && pnpm exec eslint --fix --ext .js --ext .jsx src/erp/pages/DevDocsPage.jsx src/erp/config/devDocs.mjs src/erp/config/devDocs.test.mjs scripts/styleL1.mjs` 通过；`cd web && pnpm exec prettier --check src/erp/pages/DevDocsPage.jsx src/erp/config/devDocs.mjs src/erp/config/devDocs.test.mjs scripts/styleL1.mjs README.md` 通过；`cd web && pnpm exec node --test src/erp/config/devDocs.test.mjs` 通过，7 条 devDocs 测试通过；`cd web && pnpm test` 通过，273 个测试通过；`cd web && pnpm css` 通过；`cd web && STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm style:l1` 通过；`git diff --check` 通过。
- 下一步：如果后续还想保留搜索关键词、侧栏滚动位置或右侧阅读滚动位置，应单独评审是否会干扰频繁改文档后的阅读起点；本轮先只保留文档选择和目录展开这两个低风险上下文。
- 阻塞/风险：本轮只改 dev-only 文档查看器、本地偏好归一化、L1 回归、配置测试和 `web/README.md`；未改产品菜单、seedData、RBAC、docs registry、后端、schema、migration、部署或正式文档真源。Browser 页面可读但点击目录按钮时 CDP 超时，因此交互级证明收口到项目 `style:l1` Playwright 断言。追加前 `progress.md` 为 234 行 / 59627 bytes，未达到归档阈值。
