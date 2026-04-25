# 运行记录

> 目的：告诉研发、测试和验收同事当前最近应该跑什么命令、这些命令覆盖什么，以及哪些结果还没有被结构化沉淀。

## 1. 当前结论

- 当前还没有通用持久化运行记录页；字段联动专项已先生成 `public/qa/erp-field-linkage-coverage.latest.json` 摘要。
- 当前运行记录仍以本地命令输出、Playwright 截图、测试报告、字段联动 latest JSON 和终端结果为准。
- 这页先统一命令入口和记录格式，后续再把其他专项接成结构化摘要。

## 2. 当前命令分层

| 命令                                           | 覆盖范围                                 | 建议时机                                   |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `cd web && pnpm lint`                          | 前端 ESLint 和基础语法                   | 前端改动后                                 |
| `cd web && pnpm css`                           | 样式规则检查                             | CSS、页面布局或样式类改动后                |
| `cd web && pnpm test`                          | 前端单元测试和配置测试                   | 前端逻辑、文档配置、权限配置改动后         |
| `cd web && pnpm style:l1`                      | 浏览器级页面、表单、菜单、打印和文档回归 | 页面、导航、布局、打印或帮助中心改动后     |
| `cd web && pnpm smoke:mobile-auth-login-route` | 移动端登录、鉴权和角色路由 smoke         | 移动端任务可见性、角色入口或菜单改动后     |
| `node scripts/qa/erp-field-linkage.mjs`        | 字段联动专项测试并刷新 latest 报告       | 改字段真源、保存转换、合同金额、打印快照后 |
| `cd server && go test ./...`                   | Go 单元测试和服务端包级回归              | 改 Go 代码后                               |
| `cd server && make build`                      | 服务端构建                               | 改 Go 代码或发布相关代码后                 |
| `git diff --check`                             | 补丁空白和格式检查                       | 每轮收口前                                 |
| `scripts/qa/fast.sh`                           | 高频前后端快速检查                       | 日常开发或提交前按需                       |
| `scripts/qa/full.sh`                           | 更完整的提交前检查                       | 提交前或推送前按需                         |
| `scripts/qa/strict.sh`                         | 严格检查                                 | 发版前                                     |

## 3. 跳过规则

- 没改 Go 可以不跑 `cd server && go test ./...` 和 `cd server && make build`，但最终总结要说明原因。
- 没改 Ent schema 可以不跑 `make data` 和 `make migrate_status`。
- `pnpm style:l1` 如果因为端口占用失败，应释放端口后重跑；端口失败不算通过。
- 没有结构化 latest 报告的专项只能记为未生成或待补，不要在页面上伪装成已通过。
- 业务链路调试页的 seed（生成调试数据）/ cleanup（清理调试数据）已经接入受控后端 API；未开启环境开关或处于 remote / prod / shared 环境时，页面必须显示后端禁用原因，不能用手写 SQL 或全库清空替代。
- 架构评审文档改动不等于后端行为改动；若本轮只改文档、帮助中心入口和测试，不需要跑 Go 测试、`make data` 或 `make migrate_status`，但必须在最终记录里写清楚。

## 4. 业务链路调试场景重建后的推荐命令

每次通过安全的 `debug.rebuild_business_chain_scenario` 或 `debug.clear_business_chain_scenario` 重建 / 清理单个场景样本后，至少执行：

```bash
cd web && pnpm test
cd web && pnpm style:l1
cd web && pnpm smoke:mobile-auth-login-route
```

本轮已接入后端 debug API，改动相关 Go 代码后同时执行：

```bash
cd server && go test ./...
cd server && make build
```

当前本页不要求 `make data` 和 `make migrate_status`，除非同时改了 Ent schema。

## 5. 推荐每轮 Codex 完成后记录格式

| 字段               | 记录内容                                           |
| ------------------ | -------------------------------------------------- |
| 改动范围           | 改了哪些页面、配置、工具函数、文档或测试           |
| 执行命令           | 实际运行的命令和工作目录                           |
| 通过 / 失败 / 跳过 | 每条命令的结果；失败保留第一处错误                 |
| 未执行原因         | 例如未改 Go、未改 Ent schema、环境缺依赖或端口冲突 |
| 剩余风险           | 未覆盖的真实数据、浏览器状态、后端 E2E 或人工联调  |
| 下一步建议         | 下一条业务闭环、专项报告或 schema 评审建议         |

## 6. 当前产物在哪里

| 产物                    | 当前位置                                               | 说明                                                   |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| 浏览器回归截图          | `web/output/playwright/style-l1/`                      | `pnpm style:l1` 失败或通过时用于人工核对               |
| 字段联动专项 TAP        | `output/qa/field-linkage/node-test.tap`                | `node scripts/qa/erp-field-linkage.mjs` 的原始测试输出 |
| 字段联动 latest 报告    | `web/public/qa/erp-field-linkage-coverage.latest.json` | 字段联动覆盖看板读取的结构化摘要                       |
| 合同真实登录 smoke 截图 | `web/output/playwright/`                               | 合同编辑与 PDF 预览链路留证                            |
| 前端测试输出            | 终端输出                                               | 当前未单独归档                                         |
| 后端测试输出            | 终端输出                                               | 当前未单独归档                                         |

## 7. 本轮业务链路调试记录建议

业务链路调试页增强后，应至少记录：

- 6 个已接入 v1 主干场景 key 是否存在。
- deferred 扩展链路是否继续显示为 deferred 或 partial。
- out_of_scope 能力是否没有进入已完成统计。
- `填入并查询` 是否只触发当前只读查询，不触发写操作。
- seed（生成调试数据）是否返回 `scenarioKey`、`debugRunId`、`createdRecords`、`createdTasks`、`nextCheckpoints` 和 `warnings`。
- cleanup（清理调试数据）是否强制要求 `debugRunId`，dryRun（只预览不执行）是否只返回影响范围。
- local / dev 以外环境是否显示禁用原因，普通帮助中心首页是否没有新增 debug seed / cleanup 普通入口。
- 页面和文档是否都明确说明 6 条主干闭环不是全量业务覆盖。

涉及任务可见性、角色任务池、移动端任务卡或协同任务调试页改动时，至少记录：

- `mobileTaskQueries.test.mjs`：覆盖全量加载角色和 `owner_role_key` 直查角色，以及查询计划解释。
- `mobileTaskView.test.mjs`：覆盖 owner 命中、终态标记、PMC / boss / production 扩展可见性和不可见原因。
- `pnpm smoke:mobile-auth-login-route`：确认 8 个角色移动端登录、路由和任务页主路径。
- `pnpm style:l1`：确认开发与验收页面、帮助中心入口和相邻区域没有布局回归。

测试通过数量不要手写进文档，除非后续 runner 能提供结构化 latest 摘要。

涉及 workflow usecase review 或 industry schema review 文档入口改动时，至少记录：

- 两个文档是否已注册到 `docRegistry`。
- 两个文档是否只出现在高级文档 / 开发验收入口，不进入普通业务用户 primary nav。
- `qa-reports.md` 是否包含两个专项评审入口。
- 本轮是否确实没有改 Ent schema、没有生成 migration、没有改后端 workflow usecase 行为。

## 8. 后续升级条件

后续如果要把运行记录做成真正页面，需要先让 runner 统一写摘要：

- 最近一次运行时间。
- 命令和环境。
- 状态、失败摘要和跳过原因。
- raw 产物路径。
- 对应专项章节锚点。
