# 工程效能与交付自动化 / Engineering Enablement

本目录维护本地工作台、CI、不可变制品与目标交付之间的职责和证据边界。阅读入口如下：

| 任务 | 入口 |
| --- | --- |
| 理解 CI / 发布架构和完成标准 | [工作台与 CI/CD 设计](研发效能工作台与CI-CD设计.md)、[验收证据](研发效能工作台与CI-CD设计.md#验收证据-acceptance-evidence) |
| 查看 DEV 页面与受控操作边界 | [本地开发入口](研发效能工作台与CI-CD设计.md#本地开发入口-dev-only-surfaces) |
| 选择验证与执行脚本 | [测试策略](../product/自动化测试策略.md)、[QA 脚本](../../scripts/qa/README.md) |
| 安装 GitLab / Runner、备份和恢复 | [GitLab 运维](../../server/deploy/gitlab/README.md) |
| 发布与目标运行 | [部署约定](../部署约定.md)、[部署脚本](../../scripts/deploy/README.md) |

`.gitlab-ci.yml` 是 canonical CI/CD 编排，GitHub 只接收只读镜像并读取历史 Release，仓库不保留 workflow 或发布写入 helper；DEV 工作台只投影正式脚本与 Provider 证据，不进入生产构建。当前 SHA、pipeline、Runner、备份和目标状态使用实时读回，不再维护独立的实施勾选表。
