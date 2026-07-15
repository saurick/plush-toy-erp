# 导入准备脚本 / Import Preparation

本目录只负责通用客户来源 manifest 校验、只读提取、快照冻结和 dry-run。Product Core 不保存真实客户原件或私密 manifest；永绅原件与 manifest 已进入客户专属 Private 仓库，当前工作树已移除旧副本。仓库没有真实客户数据导入执行器。

## 主路径

| 目的 | 脚本 | 边界 |
| --- | --- | --- |
| 来源清单校验 | `customerSourceManifestCheck.mjs` | 显式读取外部 manifest 与 raw dir，校验 customer、相对路径、hash、大小、重复项和目录逃逸 |
| 结构化提取 | `customerSourceExtract.mjs` | 只提取 manifest 允许的 Excel；PDF / 图片保留人工复核，不做 OCR |
| 快照冻结 | `customerSourceSnapshotFreezeCheck.mjs` | 只读取 JSON snapshot，生成可复查的 freeze evidence |
| 导入预演 | `customerImportDryRun.mjs` | 输出候选、重复、冲突、未决项和禁止自动导入项；`canExecuteRealImport=false` |

这些脚本不得连接后端或数据库，不写正式表，不生成 migration，不创建库存、质检、出货、财务或 Workflow 事实。Product Core 普通测试只使用 `scripts/import/fixtures/synthetic/` 及其他明确标记为 synthetic / sanitized 的 fixture，不访问客户私有仓库。

## 客户私有验证

永绅客户明确使用专属 Private Git 仓库保存真实原件、私密 manifest 和验证入口。客户仓库与 Product Core 使用兄弟目录或 CI multi-checkout，不使用 submodule；Product Core 只提供客户无关的通用校验与提取工具。

```bash
cd /Users/simon/projects/plush-toy-erp-customer-yoyoosun-private
PRODUCT_ROOT=/Users/simon/projects/plush-toy-erp bash scripts/validate.sh
```

直接调用时必须显式传入所有路径：

```bash
export PRODUCT_ROOT=/Users/simon/projects/plush-toy-erp
export CUSTOMER_PRIVATE_ROOT=/Users/simon/projects/plush-toy-erp-customer-yoyoosun-private

node "$PRODUCT_ROOT/scripts/import/customerSourceManifestCheck.mjs" \
  --customer yoyoosun \
  --manifest "$CUSTOMER_PRIVATE_ROOT/manifests/source-manifest.json" \
  --raw-dir "$CUSTOMER_PRIVATE_ROOT/sources" \
  --out "$CUSTOMER_PRIVATE_ROOT/output/source-check"

node "$PRODUCT_ROOT/scripts/import/customerSourceExtract.mjs" \
  --customer yoyoosun \
  --manifest "$CUSTOMER_PRIVATE_ROOT/manifests/source-manifest.json" \
  --raw-dir "$CUSTOMER_PRIVATE_ROOT/sources" \
  --out "$CUSTOMER_PRIVATE_ROOT/output/source-extract"
```

工具不默认搜索 Product Core 客户目录或兄弟仓库。输出不得包含客户访问凭据、长期 URL 或本机绝对路径；但 source snapshot 和报告仍含原工作簿名、sheet、行号及候选业务字段，属于未脱敏客户私密数据，只能留在客户私有 ignored `output/`，不得上传为普通 CI artifact。

## 当前永绅状态

- Product Core 当前提交树与索引已移除旧原件目录和真实 manifest；普通导入测试只读取合成 fixture，不依赖客户私有仓。
- 客户原件数量、manifest 版本、hash / size、结构化提取与远端回读证据以永绅专属 Private 仓库的 manifest、README 和正式验证记录为准；Product Core 不复写易漂移的客户仓提交号和计数。
- 客户私有仓的 `product.lock.json` 是可变产品版本锁定真源。每次 Product Core `HEAD` 推进后，必须在两边已提交且工作树清洁时更新该锁，再以 `FORMAL_PRODUCT_PIN=1` 运行私有仓 `scripts/validate.sh`；没有这组证据时不能宣称最新 Product Core 版本已固定。
- Product Core 既有 Git 历史仍含旧副本，历史清理不属于普通功能提交；真实导入批准和客户签收也仍是独立未完成项。

## 真实导入边界

以后拿到经客户确认的真实数据时，应单独评审通用导入批次能力：通过正式 usecase/API 写入，具备 RBAC、事务、幂等批次、逐行结果、失败恢复、审计和导入后对账。它不能在本目录以某个客户名硬编码，也不能由 dry-run 参数偷偷开启。

## 验证

```bash
node --test \
  scripts/import/customerSourceManifestCheck.test.mjs \
  scripts/import/customerSourceExtract.test.mjs \
  scripts/import/customerSourceSnapshotFreezeCheck.test.mjs \
  scripts/import/customerImportDryRun.test.mjs
node --test scripts/qa/test-data-isolation-boundary.test.mjs
```

私有仓远端回读证明客户资料存储和来源完整性；`product.lock.json` 与正式 validate 共同证明锁定 Product Core 提交的来源工具合同可用。它们均不等于真实导入批准、全产品发布验收、Git 历史清理或客户交付签收。
