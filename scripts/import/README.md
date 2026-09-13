# 导入准备脚本 / Import Preparation

本目录只负责通用客户来源 manifest 校验、只读提取、快照冻结和 dry-run。Product Core 不保存真实客户原件或私密 manifest；永绅原件与 manifest 已进入客户专属 Private 仓库，当前工作树已移除旧副本。本目录没有真实客户数据写入执行器；BOM 版本页的 `.xlsx` 辅助录入是独立的窄范围业务入口，不由这里的脚本执行。

## 主路径

| 目的 | 脚本 | 边界 |
| --- | --- | --- |
| 来源清单校验 | `customerSourceManifestCheck.mjs` | 显式读取外部 manifest 与 raw dir，校验 customer、相对路径、hash、大小、重复项和目录逃逸 |
| 结构化提取 | `customerSourceExtract.mjs` | 只提取 manifest 允许的 `.xlsx`；Numbers、旧版 Excel、Word、PDF / 图片保留人工复核，不做格式转换或 OCR |
| 快照冻结 | `customerSourceSnapshotFreezeCheck.mjs` | 只读取 JSON snapshot，生成可复查的 freeze evidence |
| 导入预演 | `customerImportDryRun.mjs` | 输出候选、重复、冲突、未决项和禁止自动导入项；`canExecuteRealImport=false` |

这些脚本不得连接后端或数据库，不写正式表，不生成 migration，不创建库存、质检、出货、财务或 Workflow 事实。Product Core 普通测试只使用 `scripts/import/fixtures/synthetic/` 及其他明确标记为 synthetic / sanitized 的 fixture，不访问客户私有仓库。

Numbers 原件可使用 `.numbers` 和 `application/vnd.apple.numbers` 登记到私有来源清单，并校验 hash 与大小；`structuredExtract.enabled` 必须为 `false`。这只支持原件归档，不解析 Numbers 表格或批准导入。

## 客户私有验证

永绅客户明确使用专属 Private Git 仓库保存真实原件、私密 manifest 和验证入口。客户仓库与 Product Core 使用兄弟目录或 CI multi-checkout，不使用 submodule；Product Core 只提供客户无关的通用校验与提取工具。

```bash
PRODUCT_ROOT="$(git rev-parse --show-toplevel)"
CUSTOMER_PRIVATE_ROOT="$(dirname "$PRODUCT_ROOT")/plush-toy-erp-customer-yoyoosun-private"
cd "$CUSTOMER_PRIVATE_ROOT"
FORMAL_PRODUCT_PIN=1 PRODUCT_ROOT="$PRODUCT_ROOT" bash scripts/validate.sh
```

直接调用时必须显式传入所有路径：

```bash
export PRODUCT_ROOT="$(git rev-parse --show-toplevel)"
export CUSTOMER_PRIVATE_ROOT="$(dirname "$PRODUCT_ROOT")/plush-toy-erp-customer-yoyoosun-private"

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

## Source Manifest 校验 / Manifest Check

私有 manifest 记录稳定 `customerKey`、`sourceId`、相对路径、hash、大小、media type、分类和 `structuredExtract` 策略。可选 storage 字段只能记录逻辑 `bucketAlias` 与不可变 object key，不能记录 endpoint 凭据、长期预签名 URL 或绝对本机路径。

checker 至少阻断：

- customer key 不一致。
- hash / size 漂移。
- 重复 `sourceId` 或相对路径。
- 绝对路径、`..` 穿越和符号链接逃逸 raw dir。
- 未登记文件。
- 非 Excel 来源被错误标记为结构化提取。
- `canExecuteRealImport` 未保持 `false`。

输出只记录 sourceId、manifest hash、文件 hash、脱敏统计与 no-real-import 边界，不输出客户访问凭据、长期 URL 或本机绝对路径。

## 原始 Excel 提取器 / Source Extractor

提取器只处理私有 manifest 中 `structuredExtract.enabled=true` 的 `.xlsx`，不直接 glob 任意目录。PDF / 图片只保留人工来源引用，不做 OCR，不从图片生成结构化事实。

客户私有 ignored `output/source-extract/` 可包含：

| 文件 | 说明 |
| --- | --- |
| `source-snapshot.extracted.json` | 只读提取的 source snapshot，继续交给 freeze / dry-run；可能含私密行，不得提交 |
| `existing-v1.empty-preview.json` | 空 existing preview，只供本地预览，不是真实 V1 数据快照 |
| `customer-import-config.candidate.json` | 字段映射、顺序、阻断项和配置候选，不是 runtime 配置 |
| `extraction-summary.json` | 脱敏统计，不复写真实文件名或绝对路径 |
| `extraction-report.md` | 人工 review 报告，仍留在私有 ignored output |

相同 manifest 与原件重复执行应得到等价业务内容；工具不得因此写 DB、生成 SQL、migration 或新的业务事实。

## Freeze 与 dry-run / Freeze And Dry-run

`customerSourceSnapshotFreezeCheck.mjs` 和 `customerImportDryRun.mjs` 继续只读取 JSON snapshot。Product Core 内的 synthetic / sanitized fixture 用于锁住正常、边界和禁止自动导入合同；真实客户 snapshot 只能留在客户私有 ignored output。

合成示例命令：

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze

node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

这些命令生成的候选、重复、冲突、未决项和 forbidden report 只证明 dry-run 规则可运行。fixture / sample / placeholder 输入不能进入真实 `--execute`，也不能替代客户签收、备份、回滚和目标环境证据。

## Dry-run 参数 / Dry-run Arguments

| 参数 | 必填 | 说明 |
| --- | ---: | --- |
| `--source` | 是 | source snapshot JSON 路径 |
| `--existing` | 是 | existing formal model snapshot JSON 路径 |
| `--out` | 是 | ignored dry-run package 输出目录 |
| `--format` | 否 | `json`、`md` 或 `json,md`，默认 `json,md` |
| `--fail-on-blockers` | 否 | 有 block / forbidden 时先写报告再返回非 0 |
| `--strict-source` | 否 | source metadata 不完整时返回非 0 |
| `--help` | 否 | 输出帮助 |

`validation-summary.json` 的 `canExecuteRealImport` 必须始终为 `false`。existing snapshot 只作为只读匹配输入，CLI 不从数据库获取，也不写回。

## 写入边界

BOM 版本页可以把结构匹配的材料分析 `.xlsx` 在浏览器本地解析为待复核表单，只唯一匹配已有产品、材料和单位，全部必填项解决后再通过既有 `save_bom_with_items` 新建 `DRAFT`。它不自动创建主数据或 SKU，不覆盖 / 激活已有 BOM，不写采购、库存、生产、成本或财务事实，也不把原文件自动上传到业务附件；文件名和 sheet 仅作为来源说明写入 BOM 备注。

这个页面入口不改变本目录的无写入合同，`canExecuteRealImport=false` 仍只描述这里的 freeze / dry-run 工具。

## 通用批量导入边界

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
