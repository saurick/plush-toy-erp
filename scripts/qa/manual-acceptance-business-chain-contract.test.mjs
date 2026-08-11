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
} from "./manual-acceptance-business-chain-contract.mjs";
import { MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS } from "./manual-acceptance-dataset.mjs";

function cloneCatalog() {
  return structuredClone(DEV_FLOW_STATE_CATALOG);
}

test("manual acceptance projects all registered chain steps and legal scenarios", () => {
  const contract = buildManualAcceptanceBusinessChainContract();

  assert.equal(contract.chainCount, 11);
  assert.equal(contract.stepCount, 67);
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
  assert.equal(review.stepCount, 67);
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
      nextAction: "沿用同批数据，继续原有 QA 与人工回归。",
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
  assert.equal(
    classifyManualAcceptanceBusinessChainDataReuse(current, verificationChanged)
      .status,
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.REVERIFY,
  );

  const dataCatalog = cloneCatalog();
  dataCatalog.businessChains[0].steps[0].actionRefs[0].key += ".changed";
  const dataChanged = buildManualAcceptanceBusinessChainContract({
    catalog: dataCatalog,
  });
  assert.notEqual(dataChanged.chainDataDigest, current.chainDataDigest);
  assert.equal(
    classifyManualAcceptanceBusinessChainDataReuse(current, dataChanged).status,
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
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
