# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件 | 范围 |
| --- | --- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |
| `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md` | 截至 2026-06-22 项目级 AGENTS skill 维护规则补充前的完整过程流水，包含 dev-only 治理地图、登录页动效、skill metadata 中英化和运营事实筛选合同等记录。 |
| `docs/archive/progress-2026-06-24-before-menu-request-lifecycle.md` | 截至 2026-06-24 菜单请求生命周期修复前的完整过程流水，包含业务附件、清空筛选、工程字段隐藏、产品档案 Tab 统一、Tab 背景修正和刷新真源修复等记录。 |

## 最近活跃事项

- 业务页数据新鲜度主路径：切换菜单、切换主视图 Tab、顶部“刷新当前页”都应重新请求后端；不得用页内业务数据缓存替代真实读取。
- 菜单交互主路径：切换到不同菜单触发目标页面加载；重复点击当前菜单不刷新，避免请求风暴。需要强制重读时使用顶部“刷新当前页”。
- 主数据页请求生命周期：新一轮列表 / 字典 / 引用请求开始时取消上一轮同类请求；取消请求不算网络错误、不弹 toast、不回写旧页面状态。
- 业务用户可见字段继续禁止裸主键、幂等键、内部引用、source ID / source line ID 和 `#数字` 兜底；真实业务对象展示名称、编号、来源单据、状态、数量或“已关联”反馈。
- 后续若恢复生产事实或 Workflow 创建能力，必须从生产任务、来源单据、事实行或后端规则生成，不恢复无来源手填事实入口。

## 2026-06-24 产品档案 Tab 切换刷新真源修复

- 完成：撤回产品档案页内 record 缓存、idle 预取和字典跳过请求方案；保留不影响业务数据新鲜度的优化：tab 激活与表格内容更新拆分、产品档案表格固定布局。
- 完成：主数据页面顶部“刷新当前页”改为重新请求当前列表、单位字典和 SKU 产品引用；`style:l1` 正式业务壳层场景新增请求断言，锁住产品档案切换“产品规格”必须请求 `list_product_skus / list_products`、顶部刷新必须重新请求当前 SKU 列表和产品引用、点击“材料档案”菜单必须请求 `list_materials / list_units`。
- 验证：更新前 `progress.md` 为 426 行、81886 字节，未达到归档阈值；已执行业务页数据缓存关键词扫描、Playwright 手工请求计数脚本、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check`，均通过；前端单测 400 个通过。
- 下一步：后续业务页若要优化 tab 手感，只允许做渲染优先级、固定布局、loading 占位、请求并发等不缓存业务事实的优化；不得把页内缓存作为列表刷新或菜单切换的默认手段。
- 阻塞/风险：本轮不改 schema、migration、API、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；打印/PDF preview 的 Blob/草稿缓存、列顺序偏好和 dev-only 本地偏好不属于业务列表数据缓存，本轮不改。

## 2026-06-24 菜单请求生命周期与重复点击收口

- 完成：全局菜单重复点击当前路径不再触发刷新，只关闭移动侧栏；切换到其他菜单仍由目标页面 mount / type change 重新读取后端，顶部“刷新当前页”继续保留显式重读能力，并用 ref 锁避免连点刷新并发。
- 完成：`JsonRpc` 区分主动取消请求和真实网络错误，`AbortError` 标记为 `isAbortError` 且不再归类为 `isNetworkError`；主数据列表 API 透传 `AbortSignal`。
- 完成：主数据页为 records / units / productReferences / contacts 增加 latest request guard；新一轮请求会 abort 旧请求，旧请求失败或返回后不弹 toast、不写旧状态、不覆盖当前页面。
- 完成：`style:l1` 正式业务壳层场景新增当前菜单重复点击负向断言，确保切到材料档案会请求 `list_materials / list_units`，但再次点击当前“材料档案”不会重复请求；`plush-page-design-governance` 同步补充页面请求生命周期和当前菜单重复点击规则。
- 验证：追加前 `progress.md` 为 428 行、82507 字节，已归档到 `docs/archive/progress-2026-06-24-before-menu-request-lifecycle.md`；已执行真实浏览器快速切菜单回归，人为延迟 `/rpc/masterdata` 后旧请求出现 `net::ERR_ABORTED` 但页面无 console error、无 toast，同菜单重复点击无 masterdata 请求；已执行 `node --test web/src/common/utils/jsonRpc.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、skill YAML 解析和规则 grep、`git diff --check`，均通过；前端单测 401 个通过。
- 下一步：后续其他页面若出现快速切换旧请求污染，复用 `JsonRpc` 的 `isRpcAbortError` 和页面 latest request guard 思路，不用页面缓存掩盖数据新鲜度问题。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；本轮只治理主数据页的请求生命周期，其他业务页仍按各自既有加载逻辑运行。
