# 研发效能工作台与 CI/CD 设计 / Engineering Workbench And CI/CD Design

- [研发效能工作台设计](研发效能工作台设计.md)用于查工作台的页面、工具与受控操作。
- [持续交付设计](持续交付设计.md)用于查 CI 验证、制品发布和目标交付。

## 按任务阅读 / Reader Paths

| 要解决的问题 | 阅读入口 | 实际核对 |
| --- | --- | --- |
| 代码、CI、镜像与目标之间如何衔接 | [拓扑与职责](持续交付设计.md#拓扑与职责)、[CI 主链](持续交付设计.md#ci-主链) | `.gitlab-ci.yml`、Provider 与正式发布脚本 |
| GitLab、GitHub 与审查镜像如何分工 | [GitLab 交付边界](持续交付设计.md#gitlab-交付边界) | 当前保护规则、镜像和不可变制品 |
| 工作台页面、工具与受控操作如何维护 | [本地开发入口](研发效能工作台设计.md#本地开发入口-dev-only-surfaces) | 对应页面、Bridge、命令与 operation 回执 |
| 独立工作台如何运行 | [独立部署说明](../../server/deploy/workbench/README.md) | 登录、资源与工具 API 的实际可达性 |
| 备份、恢复和回滚如何核对 | [备份恢复](持续交付设计.md#备份恢复和回滚)、[GitLab 运维](../../server/deploy/gitlab/README.md) | 固定目标、备份身份与恢复演练 |
| 什么能证明完成 | [证据分层](持续交付设计.md#证据分层)、[验收证据](持续交付设计.md#验收证据-acceptance-evidence) | 当前 SHA、pipeline、制品、目标读回与客户验收 |

具体工具章节保留稳定的路由与锚点；维护一项工具时只读其对应章节和实际消费者。

## 工作台章节入口

<a id="工作台信息架构"></a>

### [工作台信息架构](研发效能工作台设计.md#工作台信息架构)

<a id="本地开发入口-dev-only-surfaces"></a>

### [本地开发入口 Dev-only surfaces](研发效能工作台设计.md#本地开发入口-dev-only-surfaces)

<a id="产品与业务"></a>
<a id="产品与设计"></a>

### [产品与业务](研发效能工作台设计.md#产品与业务)

<a id="开发资源"></a>
<a id="开发与验证"></a>

### [开发资源](研发效能工作台设计.md#开发资源)

<a id="交付运维"></a>
<a id="数据交付与运行"></a>

### [交付运维](研发效能工作台设计.md#交付运维)

<a id="页面任务与内容归属"></a>

### [页面任务与内容归属](研发效能工作台设计.md#页面任务与内容归属)

<a id="链路实测报告-__devbusiness-chain-audit"></a>
<a id="链路实测-__devbusiness-chain-audit"></a>

### [链路实测报告 /__dev/business-chain-audit](研发效能工作台设计.md#链路实测报告-__devbusiness-chain-audit)

<a id="产品与业务入口-__devproduct-engineering"></a>
<a id="产品工程入口-__devproduct-engineering"></a>

### [产品与业务入口 /__dev/product-engineering](研发效能工作台设计.md#产品与业务入口-__devproduct-engineering)

<a id="开发资源入口-__devdevelopment-resources"></a>
<a id="development-resources"></a>

### [开发资源入口 /__dev/development-resources](研发效能工作台设计.md#开发资源入口-__devdevelopment-resources)

<a id="可视化规范-__devvisualization"></a>
<a id="visualization-standards"></a>

### [可视化规范 /__dev/visualization](研发效能工作台设计.md#可视化规范-__devvisualization)

<a id="接口与集成-__devintegration"></a>

### [接口与集成 /__dev/integration](研发效能工作台设计.md#接口与集成-__devintegration)

<a id="产品能力-__devproduct-core"></a>
<a id="产品内核-__devproduct-core"></a>

### [产品能力 /__dev/product-core](研发效能工作台设计.md#产品能力-__devproduct-core)

<a id="能力业务链与交付证据--capability-and-evidence-links"></a>
<a id="capability-evidence-links"></a>

### [能力、业务链与交付证据 / Capability and Evidence Links](研发效能工作台设计.md#能力业务链与交付证据--capability-and-evidence-links)

<a id="权限关系-__devpermission-relationships"></a>

### [权限关系 /__dev/permission-relationships](研发效能工作台设计.md#权限关系-__devpermission-relationships)

<a id="任务办理-__devtask-handling"></a>
<a id="task-handling"></a>

### [任务办理 /__dev/task-handling](研发效能工作台设计.md#任务办理-__devtask-handling)

<a id="定义目录与状态规则"></a>

### [定义目录与状态规则](研发效能工作台设计.md#定义目录与状态规则)

<a id="项目-skill-__devproject-skills"></a>
<a id="project-skills"></a>
<a id="工程规范与-skill-__devproject-skills"></a>

### [项目 Skill /__dev/project-skills](研发效能工作台设计.md#项目-skill-__devproject-skills)

<a id="执行指引来源与维护--execution-guide-source"></a>
<a id="skill-execution-guides"></a>

### [执行指引来源与维护 / Execution Guide Source](研发效能工作台设计.md#执行指引来源与维护--execution-guide-source)

<a id="增长评估与容量证据--growth-and-capacity"></a>
<a id="growth-and-capacity"></a>

### [增长评估与容量证据 / Growth and Capacity](研发效能工作台设计.md#增长评估与容量证据--growth-and-capacity)

<a id="项目文档-__devdocs"></a>
<a id="开发文档-__devdocs"></a>

### [项目文档 /__dev/docs](研发效能工作台设计.md#项目文档-__devdocs)

<a id="交互设计-__devui-design"></a>
<a id="ui-交互设计-__devui-design"></a>

### [交互设计 /__dev/ui-design](研发效能工作台设计.md#交互设计-__devui-design)

<a id="tab筛选与按钮--interaction-controls"></a>
<a id="interaction-controls"></a>

### [Tab、筛选与按钮 / Interaction Controls](研发效能工作台设计.md#tab筛选与按钮--interaction-controls)

<a id="阅读尺寸与工作台密度"></a>

### [阅读尺寸与工作台密度](研发效能工作台设计.md#阅读尺寸与工作台密度)

<a id="测试入口-__devtesting"></a>
<a id="pressure-workbench"></a>

### [测试入口 /__dev/testing](研发效能工作台设计.md#测试入口-__devtesting)

<a id="门禁规则入口关键流程与测试结构"></a>
<a id="quality-gate-rules"></a>

### [门禁规则：入口、关键流程与测试结构](研发效能工作台设计.md#门禁规则入口关键流程与测试结构)

<a id="ci-结果摘要与精准跳转"></a>
<a id="服务器门禁先读证据再画轨道"></a>

### [CI 结果：摘要与精准跳转](研发效能工作台设计.md#ci-结果摘要与精准跳转)

<a id="确认与恢复"></a>
<a id="data-preparation-recovery"></a>

### [确认与恢复](研发效能工作台设计.md#确认与恢复)

<a id="数据库迁移-__devdatabase-migration"></a>

### [数据库迁移 /__dev/database-migration](研发效能工作台设计.md#数据库迁移-__devdatabase-migration)

<a id="客户配置包预检与发布-__devcustomer-config"></a>

### [客户配置包预检与发布 /__dev/customer-config](研发效能工作台设计.md#客户配置包预检与发布-__devcustomer-config)

<a id="交付运维总览-__devdelivery"></a>
<a id="交付运行总览-__devdelivery"></a>

### [交付运维总览 /__dev/delivery](研发效能工作台设计.md#交付运维总览-__devdelivery)

<a id="版本发布与部署中心-__devversion-center"></a>

### [版本发布与部署中心 /__dev/version-center](研发效能工作台设计.md#版本发布与部署中心-__devversion-center)

<a id="操作指引与发布部署耗时"></a>
<a id="操作指引与流水线耗时"></a>

### [操作指引与发布部署耗时](研发效能工作台设计.md#操作指引与发布部署耗时)

<a id="流程探索"></a>
<a id="business-chain-design-draft"></a>

### [流程探索](研发效能工作台设计.md#流程探索)

## 持续交付章节入口

<a id="结论"></a>

### [结论](持续交付设计.md#结论)

<a id="拓扑与职责"></a>

### [拓扑与职责](持续交付设计.md#拓扑与职责)

<a id="gitlab-宿主存储与进程隔离"></a>

### [GitLab 宿主存储与进程隔离](持续交付设计.md#gitlab-宿主存储与进程隔离)

<a id="ci-主链"></a>

### [CI 主链](持续交付设计.md#ci-主链)

<a id="gitlab-交付边界"></a>

### [GitLab 交付边界](持续交付设计.md#gitlab-交付边界)

<a id="github-单向镜像与-gpt-review"></a>

### [GitHub 单向镜像与 GPT Review](持续交付设计.md#github-单向镜像与-gpt-review)

<a id="目标环境与真实数据"></a>

### [目标环境与真实数据](持续交付设计.md#目标环境与真实数据)

<a id="secrets权限与审计"></a>

### [Secrets、权限与审计](持续交付设计.md#secrets权限与审计)

<a id="备份恢复和回滚"></a>

### [备份、恢复和回滚](持续交付设计.md#备份恢复和回滚)

<a id="证据分层"></a>

### [证据分层](持续交付设计.md#证据分层)

<a id="明确不做"></a>

### [明确不做](持续交付设计.md#明确不做)

<a id="验收证据-acceptance-evidence"></a>

### [验收证据 Acceptance Evidence](持续交付设计.md#验收证据-acceptance-evidence)
