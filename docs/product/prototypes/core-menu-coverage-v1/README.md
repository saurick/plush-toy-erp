# 产品核心菜单覆盖样板 / Core Menu Coverage Pattern

本目录保存 `待实现 / To Implement` 的产品核心菜单覆盖样板。它把 `docs/reference/第二次20260611/产品核心菜单与页面功能规格.md` 中的每个二级菜单收口成可筛选、可查找的页面内容矩阵，用于后续判断哪些菜单复用现有页面样板，哪些需要单独做变体评审。

## 文件

| 文件 | 用途 |
| --- | --- |
| `index.html` | 单文件可交互 HTML 原型，覆盖 20260611 参考规格里的 51 个二级菜单，并标注页面类型、事实源、关键字段、核心动作、对应样板和实现边界。 |

## 标准样板口径

- 本样板不逐菜单复制一套完整页面，而是逐菜单列出内容范围，再映射到列表页、详情页、表单页、动作浮层、工作台、报表、导入和移动任务等既有样板。
- 菜单覆盖来源是 `docs/reference/第二次20260611/产品核心菜单与页面功能规格.md`，该 reference 目录只作为设计输入；它可作为原型来源，但必须按当前真源复核，不替代运行时菜单、schema、API、RBAC、migration 或测试真源。
- 当前正式运行时菜单仍以 `web/src/erp/config/seedData.mjs`、`web/src/erp/config/businessModules.mjs`、`config/customers/yoyoosun/menuConfig.mjs` 和后端 RBAC 返回为准。
- 第一批 / 第二批原型优先级只用于安排设计和实现顺序，不表示这些页面已经进入 Current，也不表示客户菜单必须全部启用。
- 数据导入、系统配置、备份恢复、客户配置和 Legacy Archive 在本样板中保持“页面内容可评审”，不因此进入正式菜单、后端业务或生产构建。

## 边界

- 本样板保持 `To Implement`，不晋级 `Current`。
- 不新增正式菜单、路由、权限码、后端 API、schema、migration、seedData、客户配置 runtime 或 Fact 写入。
- 不把参考规格里的字段全集写成当前字段真源；真实落地时必须回到 Ent schema、JSON-RPC/API、usecase、RBAC 和当前正式产品文档。
- 不把 Workflow 任务完成写成库存、出货、财务、开票或收付款事实过账。
- 不把客户配置、导入和部署资料包从 dev-only / docs-only 边界升级为产品内核运行时能力。

## 验收关注点

- 页面能按一级菜单、原型批次和关键词筛选，且每个二级菜单都有内容卡片。
- 选中卡片后能看到事实源、关键字段、核心动作、对应样板和实现边界。
- 桌面和移动视口不横向溢出，筛选按钮能换行。
- 文案明确区分 Reference Only、To Implement 和 Current，避免误读为正式菜单承诺。
- 浅色 / 暗色模式均可读，状态标签不依赖单一颜色表达。
