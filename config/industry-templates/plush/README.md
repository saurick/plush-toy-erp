# 毛绒行业模板 / Plush Industry Template

本目录是毛绒玩具行业模板的配置落点。

当前 Phase 10 已新增：

- `templateConfig.mjs`：行业模板候选配置，覆盖默认角色、桌面菜单、岗位任务模式、字段显示、编号规则、导入模板、培训验收清单和 deferred 项。

当前口径：

- `templateConfig.mjs` 是 Phase 10 行业模板沉淀产物。
- 配置状态是 `candidate`，`runtimeEnabled=false`。
- yoyoosun 只能作为候选输入来源，不代表单客户样本已经成为行业默认。
- 不创建运行时配置加载器。
- 不改 seed。
- 不恢复产品内 docs registry。
- 不执行真实导入。
- 不改变 schema、migration、后端 RBAC、Workflow / Fact usecase 或事实规则。

行业模板是 Product Core 的配置输入，不是客户运行时租户。
