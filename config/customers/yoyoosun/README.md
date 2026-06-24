# 永绅 yoyoosun 客户配置 / Yoyoosun Customer Config

本目录是 永绅 yoyoosun 客户配置包的落点。

当前口径：

- `yoyoosun` 是永绅客户的稳定客户 key。
- 本目录保存客户配置草案和已经接入的低风险前端品牌 / 菜单展示配置。
- 不代表 SaaS runtime tenant。
- 不新增 `tenant_id`。
- 不改变后端 RBAC 动作权限、Workflow / Fact 边界、schema、migration 或真实导入。
- 不改 Ent schema。

当前已接入：

- `menuConfig.mjs`：永绅 yoyoosun 前端品牌和桌面菜单配置源。该配置不再被默认产品前端静态 import；部署 yoyoosun 时应把 `customer-config.example.js` 复制或渲染为前端静态根路径的 `customer-config.js`，并发布 `assets/favicon-yoyoosun.svg` 到 `/customer-assets/yoyoosun/favicon-yoyoosun.svg`。该配置只控制登录页 / 入口页 / 后台侧栏的客户品牌展示，以及前端桌面菜单的分组、排序、隐藏和文案；菜单隐藏不是安全边界，后端仍以 RBAC action permission 和业务 usecase 校验为准。

- `customer-config.example.js`：永绅 yoyoosun 前端部署注入示例。默认产品 Web 包只带中性的 `web/public/customer-config.js` 占位，不能把本示例复制进 Product Core 默认产物。

- `fieldNumberingConfig.mjs`：永绅 yoyoosun 字段显示和编号规则配置草案。该文件当前 `runtimeEnabled=false`，只作为 Customer Config 评审清单；不接前端运行时、不改后端、不改 schema、不执行导入。

- `importConfig.mjs`：永绅 yoyoosun 导入与客户差异配置草案。该文件根据已提取的 Excel evidence、产品核心边界和客户台账收口导入顺序、字段映射分组、人工 review 队列、禁止自动导入目标和 deferred runtime 项；当前 `runtimeEnabled=false`，不嵌入 raw rows，不接 loader，不执行真实导入。

未来可继续放：

- logo / 主题色。
- 打印模板选择。
- 角色模板和权限模板。
- 初始化数据。
