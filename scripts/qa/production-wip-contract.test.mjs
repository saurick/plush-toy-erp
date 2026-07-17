import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const review = read("docs/architecture/生产工艺路线与在制品边界评审.md");
const customerPackage = read("config/customers/yoyoosun/customerPackage.mjs");
const customerDeltaLedger = read("docs/customers/yoyoosun/客户差异台账.md");
const flowCoverage = read("docs/customers/yoyoosun/流程编排闭环矩阵.md");

test("production route review fixes sewing before handwork and keeps every quality gate distinct", () => {
  assert.match(
    review,
    /布料加工 → 裁片检验 → 车缝 → 皮套检验 → 手工 → 成品检验 → 针检 → 抽检 →（订单要求时）客户验货 → 最终包装 → 成品入仓/u,
  );
  assert.match(review, /`车缝 → 手工` 是前后步骤，不是两个可互换选项/u);
  assert.match(
    review,
    /车缝和手工各自再选择本厂或外发，前一步的执行方式不得自动复制为后一步决定/u,
  );
  for (const gate of [
    "主辅料 IQC",
    "裁片检验",
    "皮套检验",
    "成品检验",
    "针检",
    "抽检",
    "客户验货",
  ]) {
    assert.match(review, new RegExp(gate, "u"));
  }
});

test("production route review keeps internal WIP transfer separate from outsource return", () => {
  assert.match(review, /“车间移交”或“WIP 转移”/u);
  assert.match(
    review,
    /只有物料或在制品交给外部加工方后返回，才使用“外发回仓”语义/u,
  );
  assert.match(review, /裁片和皮套在路线执行中作为正式 WIP 工序产出处理/u);
  assert.match(review, /本次全部有效子批数量之和必须精确等于父批数量/u);
  assert.match(
    review,
    /返工批次已经是产品 WIP，若再次外发必须新建并绑定数量相等的 PRODUCT 委外合同行/u,
  );
  assert.match(
    review,
    /返工创建新的执行记录，不覆盖或重新打开已经结算的原执行/u,
  );
});

test("production route review keeps customer inspection conditional and separate from customer acceptance", () => {
  assert.match(
    review,
    /客户验货是订单级条件关口，不是所有生产订单的全局强制步骤/u,
  );
  assert.match(
    review,
    /不要求时只记录 `not_applicable` 及规则来源，不生成虚假的客户验货合格记录/u,
  );
  assert.match(
    review,
    /客户验货结果是条件质量关口，不等于客户已经完成整套系统 UAT 或交付签收/u,
  );
});

test("production route review separates packaging business confirmation from formal quality inspection", () => {
  assert.match(review, /业务对版 \/ 外观确认/u);
  assert.match(review, /品质正式检验/u);
  assert.match(review, /两类独立记录互不代替/u);
  assert.match(
    review,
    /业务确认通过不能把不合格包材改成合格，品质检验通过也不能证明版面已经获得客户或业务确认/u,
  );
});

test("yoyoosun customer package no longer claims production route runtime is absent", () => {
  assert.doesNotMatch(
    customerPackage,
    /尚未形成工艺路线、WIP、分流或分段质检 runtime/u,
  );
  assert.match(customerPackage, /车缝完成并检验后再进入手工/u);
  assert.match(customerPackage, /车缝和手工分别由生产经理决定本厂或外发/u);
});

test("yoyoosun governance separates Product Core WIP runtime from preview-only customer flow config", () => {
  for (const document of [customerDeltaLedger, flowCoverage]) {
    assert.doesNotMatch(
      document,
      /尚无可执行的生产路线、WIP、逐工序分流或分段质检链|Product Core 尚无 route step/u,
    );
    assert.match(document, /PLUSH_SEW_HAND_V1/u);
    assert.match(document, /preview_only/u);
    assert.match(document, /migrations.*未 apply/u);
  }
  assert.match(
    customerDeltaLedger,
    /固定产品路线已进入；客户流程配置仍不作为执行真源/u,
  );
  assert.match(
    flowCoverage,
    /Product Core 本地源码已有正式入口/u,
  );
});
