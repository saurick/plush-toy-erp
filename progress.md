# plush-toy-erp progress

本文件只保留需要跨会话继续的活跃事项、显著风险、最近完成和归档入口。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 本地共享工作区（2026-09-25）

- 老板与 PMC 进度看板正在当前共享工作区实现：原业务看板改为订单交付 / 生产执行查询，后端按正式事实与责任范围汇总，提供风险筛选、明细侧栏和原单追溯；本地验证已完成，尚未提交、发布或验收。接口口径见 [`server/docs/api.md`](server/docs/api.md#进度看板-business)，精确范围以实时 Git diff、代码和测试为准。
- 仓库 IQC 通用来料验收七项已在本地实现并完成定向验证；共享开发库此前升级到 `20260919004642`。完整交接、验证与保留改动已冻结在[本次完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#仓库-iqc-通用来料验收2026-09-19)。
- 业务列表列顺序与全筛选导出的历史构建阻塞已不再复现，2026-09-24 本地 Web 构建通过；目标岗位 smoke 与客户 UAT 仍需独立证据。原始范围见[归档](docs/archive/progress-2026-09-19-before-iqc-acceptance-closeout.md)。
- 当前工作区混有多项未提交业务、页面、测试和文档改动；Git 收口前必须重读 HEAD、index、锁、实时 status 与精确 hunk，不把本页摘要当作改动归属或提交授权。

### `customer-test-133` 当前运行读回（2026-09-25）

- 正式只读 `target-preflight` 通过：当前版本 `2026.09.25-2`，server、web 与公网入口一致绑定 `ee648214f68d41ad78d934c5c88ae76686a82444`；migration 为 `20260919004642`。
- 数据库和 active customer config 读回通过；active revision 为 `yoyoosun-customer-package-v7.runtime-manifest-v1`，配置 product version 为 `local-customer-package`。服务 health / ready、Web health、公网 health / provider、资源身份及迁移锁均正常。
- 本次只做实时只读核验，没有部署、迁移、切换配置、清理或创建备份。该结果不证明下一版本的 fresh backup、migration plan / apply、promotion、回滚演练、真实岗位 smoke、客户 UAT 或签收。

### 部署与恢复治理待现场启用（2026-09-25）

- 本地已收紧生产 Compose 必填镜像/密钥、移除 GitHub 发布写路径，并补齐 GitLab 加密异机备份、健康检查、独立解密校验、失败通知和版本化 systemd 合同；定向测试和生产预检回归已通过，尚未提交、推送或安装到目标机。
- `customer-test-133` 只读预检通过；`demo-133` 的运行、数据库、health / ready、公网入口和备份工具通过，但目标根缺少固定 Atlas v1.3.0，整体仍按 `target_atlas_tooling_invalid` 阻断。两套运行环境均未被本轮修改。
- GitLab 现有 timer 仍启用，最近一次 service 因当时存储前检失败；本轮读回时存储前检已恢复通过，但最新可见本地归档仍为 2026-09-11。独立异机挂载、`age` 公钥工具链和 HTTPS 告警 receiver 尚未提供，业务应用 backup / restore-check timer 也未安装，因此没有触发高 I/O 备份、安装 unit、重启服务或伪造现场完成状态。

### 仍需后续闭环

- 对共享工作区内的进度看板、移动端和其他业务改动，按各自范围完成最小充分验证并单 writer 收口；提交、push、发布分别取得授权。
- 下一次目标发布必须重新绑定 immutable release、exact SHA、migration、active revision、fresh backup / rollback point、health / ready、业务 smoke 与公网读回；2026-09-25 的读回只能证明当时运行状态。
- GitLab 备份现场启用前必须取得真实异机挂载、独立保管的 `age` 私钥/公钥 recipient、HTTPS 告警 receiver 和备份窗口；完成首次加密副本、独立解密校验及同版本恢复演练后，才能把 timer/restore 状态写成已闭环。
- 客户交付仍缺真实岗位场景、受控业务写入与客户 UAT / 签收；技术上线和 active revision 不得写成客户已验收。

## 最近完成

| 事项 | 当前结论 | 详细证据 |
| --- | --- | --- |
| 文档治理（2026-09-26） | 统一 GitHub 与产品查看器标题锚点，显式别名采用受限安全渲染并加入真实 DOM 回归；将 `progress.md` 与归档 README 纳入当前链接检查，冻结归档正文保持豁免；归档压缩过程记录、收窄根 README，并将历史逐文件清单下沉到归档索引 | 当前 diff、`docs/文档清单.md`、`docs/archive/README.md`、Markdown 组件与文档守卫测试 |
| 客户测试环境实时核验（2026-09-25） | 版本、exact SHA、migration、active revision、health / ready 与公网入口读回一致；没有环境写操作 | 本页“当前运行读回”、`docs/customers/yoyoosun/客户交付矩阵.md` |
| 仓库 IQC 通用来料验收（2026-09-19） | 本地实现及分层验证完成；目标交付和客户验收分开判断 | [完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#仓库-iqc-通用来料验收2026-09-19) |
| 客户发布门禁与固定版本发布（2026-09-19） | 当时 release、两目标部署、附件迁移与恢复证据完成；当前运行版本已由 2026-09-25 读回替代 | [完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#客户发布门禁收口与固定版本发布2026-09-19) |
| 共享开发库迁移主路径与 CD 收口 | 高层迁移入口、目标预检、固定制品和终态回执已形成；后续仍按实时版本重跑 | [CD 归档](docs/archive/progress-2026-09-17-before-cd-closeout.md) |

## 下一步与停止条件

1. 继续任何本地实现前，按目标模块读取正式文档、代码、测试与实时 Git 现场；不要从本页恢复旧阶段或旧文件清单。
2. 合并或提交共享工作区前，逐项核对改动归属和依赖，保留其他任务改动；没有明确授权不 stage、commit 或 push。
3. 发布前重新执行正式 release / target preflight / promotion 合同。目标身份、备份、迁移、digest、runtime、active revision 或公网读回任一不确定时停止发布。
4. 客户验收必须绑定目标版本、岗位账号、真实业务场景、异常恢复和签收结果；本地、CI、技术 smoke 或过程记录均不能替代。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- 历史 V5 / V7 或任一旧 release 证据只证明其绑定版本，不能外推到当前 checkout、未来 release 或客户签收。
- Git index 同一时点只允许一个操作者；CI、Release、promotion、部署和客户验收分别按当前明确授权与正式流程串行执行。

## 归档索引

- [2026-09-25 文档治理前完整快照](docs/archive/progress-2026-09-25-before-document-governance.md)：归档前 337 行原文，包含所有历史活跃事项、验证、Git 交接和当时未决风险。
- [2026-09-19 IQC 收口前快照](docs/archive/progress-2026-09-19-before-iqc-acceptance-closeout.md)：业务列表列顺序与全筛选导出的完整原文。
- [2026-09-17 CD 收口前快照](docs/archive/progress-2026-09-17-before-cd-closeout.md)：共享开发库迁移主路径和终态回执原文。
- [2026-09-16 CI / migration 收口前快照](docs/archive/progress-2026-09-16-before-ci-migration-closeout.md)：CI 与共享开发库历史过程。
- [2026-09-08 测试打印发布前快照](docs/archive/progress-2026-09-08-before-test-print-release.md)：此前发布与运行过程。
- 更早记录统一从 [`docs/archive/README.md`](docs/archive/README.md) 进入；当前页不重复完整历史清单。
