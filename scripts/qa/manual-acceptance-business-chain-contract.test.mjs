import assert from "node:assert/strict";
import test from "node:test";

import { DEV_FLOW_STATE_CATALOG } from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import { DEV_BUSINESS_CHAIN_SCENARIO_KINDS } from "../../web/src/dev-workbench/config/devBusinessChainStepContracts.mjs";
import {
  MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS,
  buildManualAcceptanceBusinessChainContract,
  buildManualAcceptanceBusinessChainReviewPlan,
  classifyManualAcceptanceBusinessChainDataReuse,
  selectManualAcceptanceBusinessChainPlan,
  validateBusinessChainDefinitionSnapshot,
  compareBusinessChainReportDefinition,
  buildBusinessChainReportDiagram,
} from "./manual-acceptance-business-chain-contract.mjs";
import { MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS } from "./manual-acceptance-dataset.mjs";

function cloneCatalog() {
  return structuredClone(DEV_FLOW_STATE_CATALOG);
}

function observedSnapshot(snapshot) {
  return {
    definitionSnapshot: structuredClone(snapshot),
    chains: snapshot.chains.map((chain) => ({
      key: chain.key,
      label: chain.label,
      status: "passed",
      steps: chain.steps.map((step) => ({
        key: step.key,
        status: "passed",
      })),
      scenarios: chain.scenarios.map(({ key }) => ({ key })),
    })),
  };
}

test("frozen chain definitions detect semantic drift, preserve historical results and generate the same topology", () => {
  const snapshot =
    buildManualAcceptanceBusinessChainContract().definitionSnapshot;
  const report = observedSnapshot(snapshot);
  const before = JSON.stringify(report);
  assert.equal(
    compareBusinessChainReportDefinition(report, snapshot).status,
    "unchanged",
  );
  const changedCatalog = cloneCatalog();
  changedCatalog.businessChains[0].steps[0].condition = "来源金额已确认";
  changedCatalog.businessChainOverview.relations[0].label =
    "核对后进入生产";
  const changed = buildManualAcceptanceBusinessChainContract({
    catalog: changedCatalog,
  }).definitionSnapshot;
  const compared = compareBusinessChainReportDefinition(report, changed);
  assert.equal(compared.status, "changed");
  assert(
    compared.chains[0].stepChanges.some(
      (step) => step.status === "changed",
    ),
  );
  assert.equal(JSON.stringify(report), before);
  const diagram = buildBusinessChainReportDiagram(report);
  assert.deepEqual(
    diagram.edges,
    snapshot.relations.map((edge) => [
      edge.fromChainKey,
      edge.toChainKey,
      edge.label,
    ]),
  );
  assert(diagram.nodes.every((node) => node.kind === "success"));
  report.chains[0].steps.pop();
  assert.notEqual(
    buildBusinessChainReportDiagram(report).nodes[0].kind,
    "success",
  );
});

test("historical reports without definitions stay unverified and current-only steps stay uncovered", () => {
  const snapshot =
    buildManualAcceptanceBusinessChainContract().definitionSnapshot;
  const report = observedSnapshot(snapshot);
  delete report.definitionSnapshot;
  report.chains[0].steps.pop();
  report.chains.pop();
  const result = compareBusinessChainReportDefinition(report, snapshot);
  assert.equal(result.status, "unverified");
  assert.equal(result.chains[0].unrecordedSteps.length, 1);
  assert.equal(result.chains.at(-1).recorded, false);
  assert.equal(buildBusinessChainReportDiagram(report), null);
});

test("definition snapshots reject altered digests and report references outside the frozen plan", () => {
  const snapshot =
    buildManualAcceptanceBusinessChainContract().definitionSnapshot;
  const changed = structuredClone(snapshot);
  for (const invalid of [null, false, {}]) {
    const invalidReport = { ...observedSnapshot(snapshot), definitionSnapshot: invalid };
    assert.throws(() => compareBusinessChainReportDefinition(invalidReport, snapshot), /快照/u);
    assert.throws(() => buildBusinessChainReportDiagram(invalidReport), /快照/u);
  }
  changed.chains[0].steps[0].condition = "changed";
  assert.throws(
    () => validateBusinessChainDefinitionSnapshot(changed),
    /摘要/u,
  );
  const report = observedSnapshot(snapshot);
  report.chains[0].steps[0].key = "invented-step";
  assert.throws(
    () => compareBusinessChainReportDefinition(report, snapshot),
    /快照/u,
  );
});

test("definition comparison names added and removed steps and chains even when counts stay equal", () => {
  const original =
    buildManualAcceptanceBusinessChainContract().definitionSnapshot;
  const catalog = cloneCatalog();
  const removedChain = catalog.businessChains.pop();
  catalog.businessChainOverview.relations =
    catalog.businessChainOverview.relations.filter(
      (edge) =>
        edge.fromChainKey !== removedChain.key &&
        edge.toChainKey !== removedChain.key,
    );
  const addedChain = structuredClone(catalog.businessChains[0]);
  addedChain.key = "new_chain";
  catalog.businessChains.push(addedChain);
  const removedStep = catalog.businessChains[0].steps[0].key;
  catalog.businessChains[0].steps[0].key = "replacement_step";
  for (const scenario of catalog.businessChains[0].acceptanceScenarios) {
    scenario.stepKeys = scenario.stepKeys.map((key) =>
      key === removedStep ? "replacement_step" : key,
    );
  }
  const current = buildManualAcceptanceBusinessChainContract({
    catalog,
  }).definitionSnapshot;
  const result = compareBusinessChainReportDefinition(
    observedSnapshot(original),
    current,
  );
  assert.equal(
    result.chains.find((chain) => chain.key === removedChain.key).status,
    "removed",
  );
  assert.equal(
    result.chains.find((chain) => chain.key === addedChain.key).status,
    "added",
  );
  assert.deepEqual(
    result.chains[0].stepChanges.map(({ key, status }) => ({
      key,
      status,
    })),
    [
      { key: "replacement_step", status: "added" },
      { key: removedStep, status: "removed" },
    ],
  );
  assert.deepEqual(
    result.chains[0].unrecordedSteps.map(({ key }) => key),
    ["replacement_step"],
  );
});

test("review plan preserves alternative and sequential outcomes with the shared action descriptions", () => {
  const review = buildManualAcceptanceBusinessChainReviewPlan({
    catalogTargetCount: 51,
    datasetStageKeys: MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  });
  const finance = review.chains.find(
    (chain) => chain.key === "finance_payment_and_reversal",
  );
  const partial = finance.steps.find(
    (step) => step.key === "finance_allocation:derives:open_finance_fact",
  );
  const settled = finance.steps.find(
    (step) =>
      step.key === "finance_allocation:derives:settled_finance_fact",
  );
  assert(partial.preconditions.includes("核销后剩余未结金额大于零"));
  assert(settled.preconditions.includes("核销后剩余未结金额为零"));
  assert(settled.results.some((value) => value.includes("→")));
  assert(!partial.results.some((value) => value.includes("结清")));
  const payment = finance.steps.find(
    (step) =>
      step.key ===
      "finance_payment_process:calls_domain_command:finance_payment",
  );
  assert.equal(payment.results.length, 2);
  assert(payment.results.every((value) => value.includes("→")));
});

test("manual acceptance projects all registered chain steps and legal scenarios", () => {
  const contract = buildManualAcceptanceBusinessChainContract();

  assert.equal(contract.chainCount, 11);
  assert.equal(contract.stepCount, 72);
  assert.equal(contract.scenarioCount, 66);
  assert.equal(contract.chains.length, 11);
  for (const chain of contract.chains) {
    assert.deepEqual(
      chain.scenarios.map((scenario) => scenario.kind),
      DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
      chain.chainKey,
    );
    const stepKeys = new Set(chain.steps.map((step) => step.key));
    for (const scenario of chain.scenarios) {
      assert(
        scenario.stepKeys.every((stepKey) => stepKeys.has(stepKey)),
        scenario.key,
      );
    }
  }
});

test("manual acceptance stages contain only registered dataset or browser scenarios", () => {
  const contract = buildManualAcceptanceBusinessChainContract();
  const scenarioByKey = new Map(
    contract.chains.flatMap((chain) =>
      chain.scenarios.map((scenario) => [scenario.key, scenario]),
    ),
  );

  for (const [stageKey, scenarioKeys] of Object.entries(
    contract.stageScenarioKeys,
  )) {
    assert(scenarioKeys.length > 0, stageKey);
    assert.equal(new Set(scenarioKeys).size, scenarioKeys.length, stageKey);
    for (const scenarioKey of scenarioKeys) {
      const scenario = scenarioByKey.get(scenarioKey);
      assert(scenario, `${stageKey}/${scenarioKey}`);
      assert(scenario.dataStageKeys.includes(stageKey), scenarioKey);
      assert(
        scenario.evidenceModes.some((mode) =>
          ["dataset", "browser"].includes(mode),
        ),
        scenarioKey,
      );
      if (
        scenario.responsibilityRefs.some(
          (responsibility) => responsibility.mode === "human",
        )
      ) {
        assert(
          contract.stageScenarioKeys.role.includes(scenarioKey),
          `${scenarioKey} human responsibility must use the existing role stage`,
        );
      }
    }
  }
});

test("manual acceptance selects one chain without constructing combinations", () => {
  const contract = buildManualAcceptanceBusinessChainContract();
  const selected = selectManualAcceptanceBusinessChainPlan(
    contract,
    "delivery_to_settlement",
  );

  assert.equal(selected.chain.chainKey, "delivery_to_settlement");
  assert.equal(selected.chain.scenarios.length, 6);
  assert(
    Object.values(selected.stageScenarioKeys)
      .flat()
      .every((scenarioKey) =>
        scenarioKey.startsWith("delivery_to_settlement."),
      ),
  );
  assert.throws(
    () => selectManualAcceptanceBusinessChainPlan(contract, "unknown"),
    /unknown manual acceptance business chain/u,
  );
});

test("manual acceptance review plan is a readable projection of registered steps only", () => {
  const review = buildManualAcceptanceBusinessChainReviewPlan({
    catalogTargetCount: 51,
    datasetStageKeys: MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  });

  assert.equal(review.chainCount, 11);
  assert.equal(review.stepCount, 72);
  assert.equal(review.scenarioCount, 66);
  assert.equal(review.dataStageCount, 9);
  assert.deepEqual(
    review.dataStages.map((stage) => stage.key),
    MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
  );
  assert.equal(review.catalogTargetCount, 51);
  assert.equal(review.selectorAffectsExecution, false);
  assert.equal(review.executionScope, "all_registered_chains");
  assert.equal(review.freshBatchPerRun, true);
  assert.deepEqual(
    review.reuseRules.map((rule) => rule.status),
    ["still_usable", "reverify", "must_reseed"],
  );
  assert.deepEqual(
    review.reuseRules.map((rule) => rule.nextAction),
    [
      "保持当前 dataVersion；用新 operation / batch 绑定 exact commit 后继续回归",
      "保持当前 dataVersion 和长期数据；用新 operation / batch 重跑受影响验证",
      "先在新隔离批次修正；仅语义不兼容或冻结下一轮 UAT 时升级 dataVersion",
    ],
  );
  for (const chain of review.chains) {
    assert.equal(chain.scenarioCount, 6, chain.key);
    assert.deepEqual(chain.scenarioKinds, DEV_BUSINESS_CHAIN_SCENARIO_KINDS);
    for (const step of chain.steps) {
      assert(step.label, step.key);
      assert(step.responsibleRole, step.key);
      assert(step.preconditions.length > 0, step.key);
      assert(step.actions.length > 0, step.key);
      assert(step.results.length > 0, step.key);
      assert(step.facts.length > 0, step.key);
      assert(
        step.scenarioKinds.every((kind) =>
          DEV_BUSINESS_CHAIN_SCENARIO_KINDS.includes(kind),
        ),
        step.key,
      );
    }
  }
});

test("business chain digests distinguish reusable, reverify, and reseed data", () => {
  const current = buildManualAcceptanceBusinessChainContract();
  assert.deepEqual(
    classifyManualAcceptanceBusinessChainDataReuse(current, current),
    {
      status: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.STILL_USABLE,
      reason: "chain_contract_unchanged",
      nextAction:
        "保持当前 dataVersion；使用新的 operation / batch 绑定 exact commit，继续 QA 与人工回归。",
      currentChainDataDigest: current.chainDataDigest,
      currentChainVerificationDigest: current.chainVerificationDigest,
    },
  );

  const verificationCatalog = cloneCatalog();
  verificationCatalog.businessChains[0].acceptanceScenarios[0].sourceRefs.push(
    "server/internal/biz/new_contract_test.go",
  );
  const verificationChanged = buildManualAcceptanceBusinessChainContract({
    catalog: verificationCatalog,
  });
  assert.equal(verificationChanged.chainDataDigest, current.chainDataDigest);
  assert.notEqual(
    verificationChanged.chainVerificationDigest,
    current.chainVerificationDigest,
  );
  const reverifyDecision = classifyManualAcceptanceBusinessChainDataReuse(
    current,
    verificationChanged,
  );
  assert.equal(
    reverifyDecision.status,
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.REVERIFY,
  );
  assert.equal(
    reverifyDecision.nextAction,
    "保持当前 dataVersion 和同批数据；使用新的 operation / batch 重跑合同测试、readiness 和受影响的浏览器回归。",
  );

  const dataCatalog = cloneCatalog();
  dataCatalog.businessChains[0].steps[0].actionRefs[0].key += ".changed";
  const dataChanged = buildManualAcceptanceBusinessChainContract({
    catalog: dataCatalog,
  });
  assert.notEqual(dataChanged.chainDataDigest, current.chainDataDigest);
  const reseedDecision = classifyManualAcceptanceBusinessChainDataReuse(
    current,
    dataChanged,
  );
  assert.equal(
    reseedDecision.status,
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
  );
  assert.equal(
    reseedDecision.nextAction,
    "先在专用验收库用新的 operation / batch 重新造数；仅在业务语义不兼容或冻结下一轮 UAT 基线时升级 dataVersion。",
  );

  assert.equal(
    classifyManualAcceptanceBusinessChainDataReuse({}, current).status,
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
  );
});

test("presentation-only wording does not invalidate prepared data", () => {
  const current = buildManualAcceptanceBusinessChainContract();
  const presentationCatalog = cloneCatalog();
  presentationCatalog.businessChains[0].label += "（校对文案）";
  presentationCatalog.businessChains[0].summary += " 文案调整。";
  const changed = buildManualAcceptanceBusinessChainContract({
    catalog: presentationCatalog,
  });

  assert.equal(changed.chainDataDigest, current.chainDataDigest);
  assert.equal(
    changed.chainVerificationDigest,
    current.chainVerificationDigest,
  );
});
