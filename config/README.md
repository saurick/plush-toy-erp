# 配置目录 / Config Directory

本目录保存产品化、客户差异和私有化复制相关配置。这里不是运行时多租户目录，也不是部署主路径；具体配置能否进入 runtime，必须看对应子目录 README、配置文件状态和正式文档。

## 目录职责

| 路径 | 职责 | 当前边界 |
| --- | --- | --- |
| `customers/<customer-key>/` | 单个客户配置包，例如品牌、菜单展示、字段编号草案和导入配置草案 | 不代表 SaaS tenant，不新增 `tenant_id`，不替代后端 RBAC、Workflow / Fact usecase、schema 或 migration |
| `industry-templates/plush/` | 毛绒行业模板候选配置 | 当前是 candidate，不是默认 runtime loader，不把单客户资料写成 Product Core |
| `private-deployment-template/` | 多客户私有化复制模板候选 | 不创建第二套部署主路径，不 fork 核心代码，不在客户服务器构建镜像 |

## 主路径

- 客户配置先进入 `config/customers/<customer-key>/`，并同步客户资料文档和客户差异台账。
- 行业通用能力进入 Product Core 前，必须回到代码、测试、产品 / 架构文档和客户差异边界复核。
- 私有化部署资料进入 `deployments/<customer-key>/`；当前产品部署真源仍是 `server/deploy/compose/prod`。

## 不在本目录承接

- 不承接真实客户原始 Excel / PDF / 图片；这些资料按客户资料边界进入 `docs/customers/<customer-key>/raw-source-files/`。
- 不承接真实 `.env`、secret、证书私钥、数据库备份或生产日志。
- 不承接 Ent schema、Atlas migration、RBAC 权限码、Workflow / Fact 规则或 JSON-RPC usecase。
- 不承接 SaaS tenant runtime loader、license、billing 或客户工单系统。

## 相关入口

- 客户配置包说明：`config/customers/yoyoosun/README.md`
- 行业模板说明：`config/industry-templates/plush/README.md`
- 私有化复制模板说明：`config/private-deployment-template/README.md`
- 当前真源索引：`docs/当前真源与交接顺序.md`
- 文档清单：`docs/文档清单.md`
