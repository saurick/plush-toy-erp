# 项目手册生成 / Project Manual Generation

`project-manuals.mjs` 生成同源业务手册，检查同步，并导出三部分项目手册。它不执行数据库、部署或客户数据操作。

| 命令（仓库根） | 结果 |
| --- | --- |
| `node scripts/docs/project-manuals.mjs` | 从共享业务帮助生成业务 Markdown，从管理 / 运维 Markdown 生成受控正文，并同步后端章节权限目录与正式交互稿的手册内容快照 |
| `node scripts/docs/project-manuals.mjs --check` | 只读核对生成文件与当前内容完全一致 |
| `node scripts/docs/project-manuals.mjs --export` | 更新生成文件，再导出三册 Markdown、HTML、PDF、阅读首页及 SHA256 来源清单 |

导出需要已安装的 `web/` 依赖及 Playwright Chromium；不自动安装浏览器。输出为 ignored 的 `output/pdf/project-manuals/`，离线产物不进入 Product Core 构建依赖。

后端内嵌的 `server/internal/projectmanuals/content.generated.json` 与 `documents.generated.json` 是正式源码生成物，须随内容变更提交，普通 Web 制品不打包管理和运维正文。交互稿中的通用章节及两册正文也从同一来源生成，`--check` 一并检查。

导出期间来源变化会拒绝成功；manifest 标明 HEAD、工作区脏状态和来源 hash，不把脏工作区包称为正式发布包。仓库导出只包含产品手册，企业补充由在线下载按当前账号可读范围合并已发布版本；数据库中的草稿和纠错不进入导出包。

业务范围读取 `businessModules.mjs`，业务规则维护在 `businessUsabilityCatalog.mjs`、`engineeringMaterialHelp.mjs`、`roleHelpContent.mjs`；逐页准备、填写、动作与问题处理维护在 `businessHandbookOperations.mjs`，并保留实际代码来源；通用阅读章节及业务组装维护在 `businessHandbook.mjs`。

在线章节、离线 HTML 和生成 Markdown 都读取这些内容。管理与运维 HTML 也复用在线下载的渲染函数，生成可点击目录及真实小节锚点。管理员和技术手册在 [docs/manuals](../../docs/manuals/README.md) 维护，专题链接在离线版保留源码路径说明。

内容或生成器修改后，运行 `node --test web/src/erp/config/businessHandbook.test.mjs scripts/docs/project-manuals.test.mjs`、同步检查和文档路径 / 锚点检查；PDF 导出后核对分页、字体及至少相关页面渲染。
