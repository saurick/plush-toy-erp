# 多客户私有化复制模板 / Private Deployment Template

本目录定义新增私有化客户时的最小交付边界。它只提供参数示例和检查入口，生产 Compose 唯一真源仍是 `server/deploy/compose/prod`。

`reference-customer` 是中性工程参考，状态为草案/预览，不代表真实客户、生产部署、发布证据或客户签收。仓库不创建 `deployments/reference-customer/`；真实客户部署资料仍进入各自的 `deployments/<customer-key>/`。

## 五类内容的职责

| 内容 | 职责 |
| --- | --- |
| `config/customers/demo/` | 最小 lint/compile smoke fixture |
| `config/customers/reference-customer/` | 中性、可审查的工程参考配置 |
| `config/customers/yoyoosun/` | 当前真实客户配置 |
| 本目录 | 新客户的最小交付边界和参数示例 |
| `config/industry-templates/plush/` | 行业候选输入，不是运行时默认 |

## 最小客户包

| 层级 | 必须内容 | 说明 |
| --- | --- | --- |
| 客户文档 | `README.md`、`差异与边界.md`、`实施测试部署验收.md` | 面向开发、测试、运维和业务验收 |
| 客户配置 | `README.md`、`customerPackage.mjs`、`customer-config.example.js` | 只声明当前编译器和前端配置实际消费的内容 |
| 部署资料 | `README.md`、客户 env 文件 | 复用生产 Compose，不复制部署架构 |

`reference-customer.override.example.yml` 只补充容器日志保留策略，必须与生产 Compose 合并使用，不是第二套 Compose 真源，也不冒充尚未实现的应用文件存储。

## 参数边界

| 参数 | 用途 |
| --- | --- |
| `ERP_CUSTOMER_KEY` | 固定实例客户身份；请求中的其他 key 不能切换实例 |
| `PROJECT_SLUG`、`COMPOSE_PROJECT_NAME` | 隔离容器名称与 Compose project |
| `APP_IMAGE`、`WEB_IMAGE` | 固定发布制品，目标机不构建 |
| `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DATA_DIR` | 独立数据库、账号和数据目录 |
| `CONTAINER_LOG_MAX_SIZE`、`CONTAINER_LOG_MAX_FILE` | 由可选 override 消费的容器日志轮转上限 |
| `MIGRATION_LOCK_FILE` | 独立 migration 串行锁 |

当前应用没有已交付的文件存储或对象存储运行时配置，本模板不虚构挂载目录。真实客户原件仍进入客户受控私有仓库或对象存储；备份目标、secret store 和恢复操作者权限也必须在目标环境评审后记录。

## 目标环境隔离登记

以下内容是首次部署前的必填评审，不是仓库静态变量：

| 隔离项 | 必须登记的证据 |
| --- | --- |
| 数据库 | 独立库、账号、数据目录、备份及恢复目标 |
| 客户原件 | 私有仓库或对象存储别名、访问主体、保留策略；未接入时明确 `N/A` |
| 运行日志 | Compose project、容器日志轮转、采集目标和访问权限 |
| secrets | 受控 secret store 别名、注入方式和轮换责任人 |
| 恢复权限 | 恢复操作者身份、审批人、隔离演练环境和最近演练结果 |

## 生成并检查 Compose 配置

先复制 `reference-customer.env.example` 到受控目录，替换所有占位值，再运行：

```bash
export DEPLOY_ENV='<controlled-path>/reference-customer.env'
docker compose --env-file "$DEPLOY_ENV" \
  -f server/deploy/compose/prod/compose.yml \
  -f config/private-deployment-template/reference-customer.override.example.yml \
  config
```

## 首次部署、升级和回滚

1. 确认固定 customer key、镜像 tag/digest、数据库、Compose project、日志和 secrets 隔离。
2. 备份数据库及已登记的客户私有存储；若涉及 migration，先完成 migration preflight 和恢复点验证。
3. 目标机只加载已构建制品，使用生产 Compose 加客户 env/可选 override 启动。
4. 检查 health、ready、桌面路由、登录、RBAC 和选定业务纵向链路。
5. 升级时记录旧/新产品版本、镜像 digest 和 customer-config revision。
6. 应用回滚使用兼容的旧制品和已验证配置 revision；本参考实现没有 schema 变更，不设计数据库降级。
7. 恢复演练必须在隔离环境验证数据库与已登记私有存储的一致性，不能用模板检查代替真实恢复证据。

## 证据边界

本目录的 QA 只能证明模板边界、路径和禁止项成立。目标机部署、真实备份恢复、真实账号浏览器 smoke、业务验收和客户签收都必须在对应客户的受控环境形成证据；未执行时必须明确写为未执行。

## 禁止项

- 不新增 `tenant_id`、SaaS 多租户、微服务或动态插件。
- 不复制核心 schema、migration、usecase、RBAC 或前端应用。
- 不在目标机构建镜像。
- 不执行真实客户数据导入，不写业务记录或 Fact。
- 不把行业候选或 reference 工程样例描述为客户已验收能力。
