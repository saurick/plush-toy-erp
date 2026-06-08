# 永绅 yoyoosun 客户配置 / Yoyoosun Customer Config

本目录是 永绅 yoyoosun 客户配置包的落点。

当前口径：

- `yoyoosun` 是永绅客户的稳定客户 key。
- 本目录保存客户配置草案和已经接入的低风险前端菜单配置。
- 不代表 SaaS runtime tenant。
- 不新增 `tenant_id`。
- 不改变后端 RBAC 动作权限、Workflow / Fact 边界、schema、migration 或真实导入。
- 不改 Ent schema。

当前已接入：

- `menuConfig.mjs`：永绅 yoyoosun 桌面菜单配置。该配置只控制前端桌面菜单的分组、排序、隐藏和文案；菜单隐藏不是安全边界，后端仍以 RBAC action permission 和业务 usecase 校验为准。

- `fieldNumberingConfig.mjs`：永绅 yoyoosun 字段显示和编号规则配置草案。该文件当前 `runtimeEnabled=false`，只作为 Customer Config 评审清单；不接前端运行时、不改后端、不改 schema、不执行导入。

未来可继续放：

- 公司信息。
- logo / 主题色。
- 打印模板选择。
- 角色模板和权限模板。
- 初始化数据。
