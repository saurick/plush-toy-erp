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

test("production route review fixes sewing before handwork and keeps every quality gate distinct", () => {
  const mainLine = review.match(/## 正式生产主线\n([\s\S]*?)\n## /u)?.[1];
  assert.ok(mainLine, "production main line section is required");
  const graphs = [...mainLine.matchAll(/```mermaid\nflowchart LR\n([\s\S]*?)\n```/gu)];
  assert.deepEqual(graphs.map(([, body]) => body.split("\n").map((line) => line.trim())), [
    [
      'fabric["布料加工"] --> cuts["裁片检验"]',
      'cuts --> sew["车缝"]',
      'sew --> shell["皮套检验"]',
      'shell --> hand["手工"]',
      'hand --> inbound["正式成品入库<br/>待检、待包装"]',
    ],
    [
      'inbound["正式成品入库"] --> quality["成品检验"]',
      'quality --> needle["针检"]',
      'needle --> sample["抽检"]',
      'sample --> gate{"订单要求客户验货？"}',
      'gate -->|是| customer["客户验货"]',
      'gate -->|否| pack["查货与包装"]',
      "customer --> pack",
      'pack --> ready["可发货"]',
    ],
  ]);
  assert.match(mainLine, /车缝和手工依次进行，各自选择本厂或外发/u);
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
