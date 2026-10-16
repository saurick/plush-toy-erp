# 项目手册生成 / Project Manual Generation

`project-manuals.mjs` 生成同源业务手册，检查同步，并导出三部分项目手册。它不执行数据库、部署或客户数据操作。

| 命令（仓库根） | 结果 |
| --- | --- |
| `node scripts/docs/project-manuals.mjs` | 从共享业务帮助生成 `docs/manuals/业务使用手册.md` |
| `node scripts/docs/project-manuals.mjs --check` | 只读核对生成文件与当前内容完全一致 |
| `node scripts/docs/project-manuals.mjs --export` | 更新生成文件，再导出三册 Markdown、HTML、PDF、阅读首页及 SHA256 来源清单 |

导出需要已安装的 `web/` 依赖及 Playwright Chromium；不自动安装浏览器。输出为 ignored 的 `output/pdf/project-manuals/`，不进入 Product Core 构建依赖。导出期间来源变化会拒绝成功；manifest 标明 HEAD、工作区脏状态和来源 hash，不把脏工作区包称为正式发布包。

业务范围读取 `businessModules.mjs`，业务规则维护在 `businessUsabilityCatalog.mjs`、`engineeringMaterialHelp.mjs`、`roleHelpContent.mjs`；通用阅读章节维护在 `businessHandbook.mjs`。在线章节、离线 HTML 和生成 Markdown 都读取这些内容。管理员和技术手册在 [docs/manuals](../../docs/manuals/README.md) 维护，专题链接在离线版保留源码路径说明。

内容或生成器修改后，运行 `node --test web/src/erp/config/businessHandbook.test.mjs scripts/docs/project-manuals.test.mjs`、同步检查和文档路径 / 锚点检查；PDF 导出后核对分页、字体及至少相关页面渲染。
