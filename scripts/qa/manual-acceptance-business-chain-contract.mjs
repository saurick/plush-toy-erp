import { createHash } from "node:crypto";

import { getPermissionCenterRoleName } from "../../web/src/erp/utils/permissionCenterAccess.mjs";
import { DEV_FLOW_STATE_CATALOG } from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import {
  DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS,
  DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
} from "../../web/src/dev-workbench/config/devBusinessChainStepContracts.mjs";

export const MANUAL_ACCEPTANCE_BUSINESS_CHAIN_CONTRACT_VERSION =
  "manual-acceptance-business-chain-contract-v1";
export const MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REVIEW_PLAN_VERSION =
  "manual-acceptance-business-chain-review-plan-v1";

export const MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS = Object.freeze({
  STILL_USABLE: "still_usable",
  REVERIFY: "reverify",
  MUST_RESEED: "must_reseed",
});

const DATA_EVIDENCE_MODES = new Set(["dataset", "browser"]);

const SCENARIO_KIND_LABELS = Object.freeze({
  happy_path: "正常主路径",
  interruption_recovery: "阻塞、退回与恢复",
  unauthorized: "无权限",
  wrong_state: "错误状态",
  correction: "取消、调整或冲正",
  idempotency: "重复提交与幂等",
});

const DATA_STAGE_LABELS = Object.freeze({
  core: "基础资料核对",
  baseline: "空库基线核对",
  role: "岗位账号与责任",
  source: "来源单据",
  task: "协同任务",
  facts: "正式业务结果",
  "purchase-quality": "采购与质检覆盖",
  attachments: "模拟附件",
  readiness: "数据就绪核验",
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalJSON(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "business chain contract cannot digest non-finite numbers",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJSON(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`business chain contract cannot digest ${typeof value}`);
}

function digest(value) {
  return createHash("sha256").update(canonicalJSON(value)).digest("hex");
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(String).filter(Boolean))];
}

function describeStateRef(catalog, ref) {
  const flow = asArray(catalog?.flows).find(
    (candidate) => candidate.key === ref.machineKey,
  );
  const state = asArray(flow?.states).find(
    (candidate) => candidate.key === ref.stateKey,
  );
  return flow && state ? `${flow.label}为“${state.label}”` : "";
}

function describeFact(catalog, factKey) {
  return (
    asArray(catalog?.factDefinitions).find(
      (candidate) => candidate.factKey === factKey,
    )?.label || ""
  );
}

function describeResponsibility(responsibility) {
  const ownerPoolKeys = uniqueStrings(responsibility.ownerPoolKeys);
  const knownLabels = uniqueStrings(
    ownerPoolKeys
      .map((roleKey) => getPermissionCenterRoleName({ role_key: roleKey }))
      .filter((label) => label !== "已配置岗位"),
  );
  const labels = [...knownLabels];
  if (
    responsibility.mode === "human" &&
    (knownLabels.length !== ownerPoolKeys.length ||
      responsibility.capabilityKeys.length > 0)
  ) {
    labels.push("具有对应业务权限的岗位");
  }
  if (responsibility.mode === "system") labels.push("系统自动处理");
  if (responsibility.mode === "derived") {
    labels.push("系统按已生效结果计算");
  }
  return uniqueStrings(labels).join("、") || "当前正式合同未定义";
}

function buildReviewStep(catalog, rawChain, chainPlan, step) {
  const nodeByKey = new Map(rawChain.nodes.map((node) => [node.key, node]));
  const scenarioKinds = uniqueStrings(
    chainPlan.scenarios
      .filter((scenario) => scenario.stepKeys.includes(step.key))
      .map((scenario) => scenario.kind),
  );
  return Object.freeze({
    key: step.key,
    label:
      rawChain.steps.find((candidate) => candidate.key === step.key)?.label ||
      step.key,
    fromLabel: nodeByKey.get(step.fromNodeKey)?.label || "上一步",
    toLabel: nodeByKey.get(step.toNodeKey)?.label || "下一步",
    responsibleRole: describeResponsibility(step.responsibility),
    preconditions:
      uniqueStrings(
        step.preconditionStateRefs.map((ref) => describeStateRef(catalog, ref)),
      ).length > 0
        ? uniqueStrings(
            step.preconditionStateRefs.map((ref) =>
              describeStateRef(catalog, ref),
            ),
          )
        : ["无额外前置状态"],
    actions: [
      rawChain.steps.find((candidate) => candidate.key === step.key)?.label ||
        "按已登记动作办理",
    ],
    results:
      uniqueStrings(
        step.resultStateRefs.map((ref) => describeStateRef(catalog, ref)),
      ).length > 0
        ? uniqueStrings(
            step.resultStateRefs.map((ref) => describeStateRef(catalog, ref)),
          )
        : ["本步骤不直接改变业务状态"],
    facts:
      uniqueStrings(
        step.factKeys.map((factKey) => describeFact(catalog, factKey)),
      ).length > 0
        ? uniqueStrings(
            step.factKeys.map((factKey) => describeFact(catalog, factKey)),
          )
        : ["本步骤不直接形成 Fact"],
    scenarioKinds,
  });
}

function projectResponsibility(value) {
  return {
    mode: value.mode,
    ownerPoolKeys: [...value.ownerPoolKeys],
    capabilityKeys: [...value.capabilityKeys],
  };
}

function projectStateRef(value) {
  return {
    machineKey: value.machineKey,
    stateKey: value.stateKey,
    phase: value.phase,
  };
}

function projectTransitionRef(value) {
  return {
    machineKey: value.machineKey,
    transitionKey: value.transitionKey,
    from: value.from,
    to: value.to,
    actionKey: value.actionKey,
    capabilityKeys: [...value.capabilityKeys],
    factBoundary: value.factBoundary,
    pathKinds: [...value.pathKinds],
  };
}

function projectProcessNodeRef(value) {
  return {
    processDefinitionKey: value.processDefinitionKey,
    processKey: value.processKey,
    nodeKey: value.nodeKey,
    ownerPoolKey: value.ownerPoolKey,
    actionKey: value.actionKey,
    capabilityKeys: [...value.capabilityKeys],
    factBoundary: value.factBoundary,
  };
}

function projectActionRef(value) {
  return {
    kind: value.kind,
    key: value.key,
    authorityKey: value.authorityKey,
  };
}

function buildChainPlan(chain) {
  const edgeByKey = new Map(chain.edges.map((edge) => [edge.key, edge]));
  const steps = chain.steps.map((step) => {
    const edge = edgeByKey.get(step.edgeKey);
    if (!edge) {
      throw new Error(`${chain.key}/${step.key} has no topology edge`);
    }
    return {
      key: step.key,
      fromNodeKey: step.fromNodeKey,
      toNodeKey: step.toNodeKey,
      edgeKind: edge.kind,
      responsibility: projectResponsibility(step.responsibility),
      preconditionStateRefs: step.preconditionStateRefs.map(projectStateRef),
      stateTransitionRefs: step.stateTransitionRefs.map(projectTransitionRef),
      processNodeRefs: step.processNodeRefs.map(projectProcessNodeRef),
      actionRefs: step.actionRefs.map(projectActionRef),
      resultStateRefs: step.resultStateRefs.map(projectStateRef),
      factKeys: [...step.factKeys],
      factBoundary: step.factBoundary,
    };
  });
  const stepKeys = new Set(steps.map((step) => step.key));
  const scenarios = chain.acceptanceScenarios.map((scenario) => {
    if (scenario.stepKeys.some((stepKey) => !stepKeys.has(stepKey))) {
      throw new Error(`${scenario.key} references an unknown chain step`);
    }
    return {
      key: scenario.key,
      kind: scenario.kind,
      stepKeys: [...scenario.stepKeys],
      interruptionKinds: [...scenario.interruptionKinds],
      responsibilityRefs: scenario.responsibilityRefs.map(
        projectResponsibility,
      ),
      stateTransitionRefs:
        scenario.stateTransitionRefs.map(projectTransitionRef),
      processNodeRefs: scenario.processNodeRefs.map(projectProcessNodeRef),
      factKeys: [...scenario.factKeys],
      evidenceModes: [...scenario.evidenceModes],
      dataStageKeys: [...scenario.dataStageKeys],
      expectedOutcome: scenario.expectedOutcome,
      sourceRefs: [...scenario.sourceRefs],
    };
  });
  const scenarioKinds = scenarios.map((scenario) => scenario.kind);
  if (
    scenarios.length !== DEV_BUSINESS_CHAIN_SCENARIO_KINDS.length ||
    DEV_BUSINESS_CHAIN_SCENARIO_KINDS.some(
      (kind) => !scenarioKinds.includes(kind),
    )
  ) {
    throw new Error(
      `${chain.key} does not cover every registered scenario kind`,
    );
  }
  return {
    chainKey: chain.key,
    steps,
    scenarios,
  };
}

function buildStageScenarioKeys(chainPlans) {
  const result = Object.fromEntries(
    DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS.map((stageKey) => [stageKey, []]),
  );
  for (const chain of chainPlans) {
    for (const scenario of chain.scenarios) {
      if (
        !scenario.evidenceModes.some((mode) => DATA_EVIDENCE_MODES.has(mode))
      ) {
        continue;
      }
      for (const stageKey of scenario.dataStageKeys) {
        if (!Object.hasOwn(result, stageKey)) {
          throw new Error(
            `${scenario.key} references unknown data stage ${stageKey}`,
          );
        }
        result[stageKey].push(scenario.key);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(result).map(([stageKey, scenarioKeys]) => [
      stageKey,
      uniqueStrings(scenarioKeys),
    ]),
  );
}

function buildDataDigestInput(chainPlans) {
  return {
    contract: "manual-acceptance-business-chain-data-shape-v1",
    chains: chainPlans.map((chain) => ({
      chainKey: chain.chainKey,
      steps: chain.steps,
      scenarios: chain.scenarios.map((scenario) => {
        const evidenceModes = scenario.evidenceModes.filter((mode) =>
          DATA_EVIDENCE_MODES.has(mode),
        );
        return {
          key: scenario.key,
          kind: scenario.kind,
          stepKeys: scenario.stepKeys,
          dataStageKeys: scenario.dataStageKeys,
          evidenceModes,
          responsibilityRefs:
            evidenceModes.length > 0 ? scenario.responsibilityRefs : [],
          stateTransitionRefs:
            evidenceModes.length > 0 ? scenario.stateTransitionRefs : [],
          processNodeRefs:
            evidenceModes.length > 0 ? scenario.processNodeRefs : [],
          factKeys: evidenceModes.length > 0 ? scenario.factKeys : [],
        };
      }),
    })),
  };
}

function buildVerificationDigestInput(chainPlans) {
  return {
    contract: "manual-acceptance-business-chain-verification-shape-v1",
    chains: chainPlans.map((chain) => ({
      chainKey: chain.chainKey,
      scenarios: chain.scenarios.map((scenario) => ({
        key: scenario.key,
        kind: scenario.kind,
        stepKeys: scenario.stepKeys,
        interruptionKinds: scenario.interruptionKinds,
        expectedOutcome: scenario.expectedOutcome,
        evidenceModes: scenario.evidenceModes,
        stateTransitionRefs: scenario.stateTransitionRefs,
        processNodeRefs: scenario.processNodeRefs,
        factKeys: scenario.factKeys,
        sourceRefs: scenario.sourceRefs,
      })),
    })),
  };
}

export function buildManualAcceptanceBusinessChainContract({
  catalog = DEV_FLOW_STATE_CATALOG,
} = {}) {
  if (
    catalog?.readOnly !== true ||
    !Array.isArray(catalog?.businessChains) ||
    catalog.businessChains.length === 0
  ) {
    throw new Error(
      "manual acceptance requires the read-only business chain catalog",
    );
  }
  const chainPlans = catalog.businessChains.map(buildChainPlan);
  const chainKeys = chainPlans.map((chain) => chain.chainKey);
  if (new Set(chainKeys).size !== chainKeys.length) {
    throw new Error("manual acceptance business chain keys must be unique");
  }
  const stageScenarioKeys = buildStageScenarioKeys(chainPlans);
  const dataDigestInput = buildDataDigestInput(chainPlans);
  const verificationDigestInput = buildVerificationDigestInput(chainPlans);
  return Object.freeze({
    contract: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_CONTRACT_VERSION,
    catalogVersion: catalog.version,
    chainDataDigest: digest(dataDigestInput),
    chainVerificationDigest: digest(verificationDigestInput),
    chainCount: chainPlans.length,
    stepCount: chainPlans.reduce(
      (total, chain) => total + chain.steps.length,
      0,
    ),
    scenarioCount: chainPlans.reduce(
      (total, chain) => total + chain.scenarios.length,
      0,
    ),
    stageScenarioKeys,
    chains: chainPlans,
    dataPlan: dataDigestInput,
    verificationPlan: verificationDigestInput,
  });
}

export function buildManualAcceptanceBusinessChainReviewPlan({
  catalog = DEV_FLOW_STATE_CATALOG,
  catalogTargetCount,
  datasetStageKeys,
} = {}) {
  if (!Number.isSafeInteger(catalogTargetCount) || catalogTargetCount < 1) {
    throw new Error(
      "manual acceptance review requires the current catalog target count",
    );
  }
  const executionStageKeys = uniqueStrings(datasetStageKeys);
  if (
    executionStageKeys.length === 0 ||
    executionStageKeys.length !== asArray(datasetStageKeys).length ||
    executionStageKeys.some((key) => !DATA_STAGE_LABELS[key])
  ) {
    throw new Error(
      "manual acceptance review requires the registered dataset stage order",
    );
  }
  const contract = buildManualAcceptanceBusinessChainContract({ catalog });
  const rawChainByKey = new Map(
    catalog.businessChains.map((chain) => [chain.key, chain]),
  );
  const scenarioKinds = DEV_BUSINESS_CHAIN_SCENARIO_KINDS.map((key) =>
    Object.freeze({ key, label: SCENARIO_KIND_LABELS[key] }),
  );
  const chains = contract.chains.map((chainPlan) => {
    const rawChain = rawChainByKey.get(chainPlan.chainKey);
    if (!rawChain) {
      throw new Error(
        `${chainPlan.chainKey} is missing from the review catalog`,
      );
    }
    return Object.freeze({
      key: chainPlan.chainKey,
      label: rawChain.label,
      summary: rawChain.summary,
      stepCount: chainPlan.steps.length,
      scenarioCount: chainPlan.scenarios.length,
      scenarioKinds: chainPlan.scenarios.map((scenario) => scenario.kind),
      steps: chainPlan.steps.map((step) =>
        buildReviewStep(catalog, rawChain, chainPlan, step),
      ),
    });
  });
  return Object.freeze({
    contract: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REVIEW_PLAN_VERSION,
    sourceContract: contract.contract,
    catalogVersion: contract.catalogVersion,
    chainDataDigest: contract.chainDataDigest,
    chainVerificationDigest: contract.chainVerificationDigest,
    chainCount: contract.chainCount,
    stepCount: contract.stepCount,
    scenarioCount: contract.scenarioCount,
    dataStageCount: executionStageKeys.length,
    catalogTargetCount,
    selectorAffectsExecution: false,
    executionScope: "all_registered_chains",
    freshBatchPerRun: true,
    scenarioKinds,
    dataStages: executionStageKeys.map((key) =>
      Object.freeze({ key, label: DATA_STAGE_LABELS[key] }),
    ),
    reuseRules: Object.freeze([
      Object.freeze({
        status: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.STILL_USABLE,
        label: "仍可用",
        condition: "数据摘要和验证摘要都没有变化",
        nextAction: "可以继续原 QA 与人工回归",
      }),
      Object.freeze({
        status: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.REVERIFY,
        label: "只需重新核验",
        condition: "数据摘要相同，但验证摘要变化或缺失",
        nextAction: "保留数据，重跑合同、就绪度和受影响页面",
      }),
      Object.freeze({
        status: MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
        label: "必须重新造数",
        condition: "数据摘要变化或旧数据摘要缺失",
        nextAction: "使用现有 runner 在新隔离库建立新批次",
      }),
    ]),
    chains: Object.freeze(chains),
  });
}

export function selectManualAcceptanceBusinessChainPlan(contract, chainKey) {
  const normalizedChainKey = String(chainKey || "").trim();
  const chain = asArray(contract?.chains).find(
    (candidate) => candidate.chainKey === normalizedChainKey,
  );
  if (!chain) {
    throw new Error(
      `unknown manual acceptance business chain: ${normalizedChainKey}`,
    );
  }
  const scenarioKeys = new Set(chain.scenarios.map((scenario) => scenario.key));
  return Object.freeze({
    contract: contract.contract,
    catalogVersion: contract.catalogVersion,
    chainDataDigest: contract.chainDataDigest,
    chainVerificationDigest: contract.chainVerificationDigest,
    chain,
    stageScenarioKeys: Object.fromEntries(
      Object.entries(contract.stageScenarioKeys).map(
        ([stageKey, registeredScenarioKeys]) => [
          stageKey,
          registeredScenarioKeys.filter((scenarioKey) =>
            scenarioKeys.has(scenarioKey),
          ),
        ],
      ),
    ),
  });
}

function reuseDecision(status, reason, current) {
  const nextAction =
    status === MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.STILL_USABLE
      ? "沿用同批数据，继续原有 QA 与人工回归。"
      : status === MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.REVERIFY
        ? "保留同批数据，重跑合同测试、readiness 和受影响的浏览器回归。"
        : "不要沿用旧批；按现有 runner 在专用验收库重新造数。";
  return Object.freeze({
    status,
    reason,
    nextAction,
    currentChainDataDigest: current.chainDataDigest,
    currentChainVerificationDigest: current.chainVerificationDigest,
  });
}

export function classifyManualAcceptanceBusinessChainDataReuse(
  previous,
  current,
) {
  if (
    current?.contract !== MANUAL_ACCEPTANCE_BUSINESS_CHAIN_CONTRACT_VERSION ||
    !current?.chainDataDigest ||
    !current?.chainVerificationDigest
  ) {
    throw new Error("current business chain contract is incomplete");
  }
  if (!previous?.chainDataDigest) {
    return reuseDecision(
      MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
      "previous_chain_data_digest_missing",
      current,
    );
  }
  if (previous.chainDataDigest !== current.chainDataDigest) {
    return reuseDecision(
      MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.MUST_RESEED,
      "chain_data_contract_changed",
      current,
    );
  }
  if (
    !previous.chainVerificationDigest ||
    previous.chainVerificationDigest !== current.chainVerificationDigest
  ) {
    return reuseDecision(
      MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.REVERIFY,
      previous.chainVerificationDigest
        ? "chain_verification_contract_changed"
        : "previous_chain_verification_digest_missing",
      current,
    );
  }
  return reuseDecision(
    MANUAL_ACCEPTANCE_BUSINESS_CHAIN_REUSE_STATUS.STILL_USABLE,
    "chain_contract_unchanged",
    current,
  );
}
