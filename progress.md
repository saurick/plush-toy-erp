# plush-toy-erp progress

本文件只保留需要跨会话继续的活跃事项、显著风险、最近完成和归档入口。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 代码与固定版本收口（2026-09-26）

- 业务进度看板、移动岗位任务、研发效能与部署治理等本批改动已提交并推送；应用 release SHA 为 `0ead42f904ed11b03ad4163852ef818026ab230d`。GitLab exact-SHA CI pipeline `#222` 通过，release pipeline `#223` 在一次 Runner 下载中断后以同一版本重试成功。
- 不可变版本 `2026.09.26-1` 已发布，7 项资产完整且可推广；发布清单、排练回执、server / web 镜像摘要均绑定同一 exact SHA。业务接口口径继续见 [`server/docs/api.md`](server/docs/api.md#进度看板-business)。
- 仓库 IQC 通用来料验收七项及共享开发库 migration `20260919004642` 的历史交接见[完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#仓库-iqc-通用来料验收2026-09-19)；该历史证据不替代本次目标运行读回。

### 两套测试环境当前运行读回（2026-09-26）

- `demo-133` 与 `customer-test-133` 已由正式 promotion 合同升级到 `2026.09.26-1`；server、web 与公网入口均绑定 `0ead42f904ed11b03ad4163852ef818026ab230d`，migration 均为 `20260919004642`。两套环境的 migration plan / apply / readback、health / ready、Web health、公网 health / provider 和迁移锁读回均通过。
- 两套目标均在维护窗口前创建并恢复检查了新备份，旧版不可变制品也已重新验证为可回滚输入；本次没有执行回滚演练或数据库 down migration。`demo-133` 的固定 Atlas v1.3.0 工具已按目标范围补齐并通过预检。
- PostgreSQL 均为 `18.6` 且健康，Jaeger 均为摘要固定的 `2.21.0`；两套目标的附件模式都是 `external`，因此没有重启或升级目标外部的附件存储。active customer config 保持原目标配置：demo 为 trial package v8，customer-test 为 customer package v7。

### 部署与恢复治理（2026-09-26）

- 生产 Compose 必填镜像/密钥、GitLab 发布写路径、备份健康检查、独立解密校验、失败通知和版本化 systemd 合同已随本批代码收口；两套测试环境仅启用了本次 promotion 所需的固定发布、迁移、备份恢复检查和运行读回。
- GitLab 异机加密备份的独立挂载、`age` recipient、HTTPS 告警 receiver 与正式备份窗口仍未提供，本次没有安装对应 timer、触发高 I/O 异机备份或把该能力写成已现场闭环。

### 仍需后续闭环

- 下一次目标发布必须重新绑定 immutable release、exact SHA、migration、active revision、fresh backup / rollback point、health / ready、业务 smoke 与公网读回；本次读回只能证明 `2026.09.26-1` 当时的运行状态。
- GitLab 备份现场启用前必须取得真实异机挂载、独立保管的 `age` 私钥/公钥 recipient、HTTPS 告警 receiver 和备份窗口；完成首次加密副本、独立解密校验及同版本恢复演练后，才能把 timer/restore 状态写成已闭环。
- 客户交付仍缺绑定 `2026.09.26-1` 的真实岗位场景、受控业务写入与客户 UAT / 签收；技术上线和 active revision 不得写成客户已验收。

## 最近完成

| 事项 | 当前结论 | 详细证据 |
| --- | --- | --- |
| 测试环境全量升级（2026-09-26） | `2026.09.26-1` 已发布并升级 `demo-133`、`customer-test-133`；应用、PostgreSQL、Jaeger、备份恢复检查、migration 与公网入口读回通过；外部附件存储未纳入目标写操作 | GitLab pipelines `#222` / `#223`、两目标 promotion 终态回执、发布后 `target-preflight` |
| 文档治理（2026-09-26） | 统一 GitHub 与产品查看器标题锚点，显式别名采用受限安全渲染并加入真实 DOM 回归；将 `progress.md` 与归档 README 纳入当前链接检查，冻结归档正文保持豁免；归档压缩过程记录、收窄根 README，并将历史逐文件清单下沉到归档索引 | 当前 diff、`docs/文档清单.md`、`docs/archive/README.md`、Markdown 组件与文档守卫测试 |
| 仓库 IQC 通用来料验收（2026-09-19） | 本地实现及分层验证完成；目标交付和客户验收分开判断 | [完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#仓库-iqc-通用来料验收2026-09-19) |
| 客户发布门禁与固定版本发布（2026-09-19） | 当时 release、两目标部署、附件迁移与恢复证据完成；当前运行版本以本页 2026-09-26 读回为准 | [完整快照](docs/archive/progress-2026-09-25-before-document-governance.md#客户发布门禁收口与固定版本发布2026-09-19) |
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
