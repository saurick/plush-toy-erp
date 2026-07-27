import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEV_FLOW_STATE_CATALOG,
  canDevFlowStateTransition,
  getDevFlowState,
  getDevFlowStateMachine,
  getDevFlowStateTransitions,
} from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const observatoryRoute = "/__dev/status-flows";
const unknownMachineKey = "__qa_unknown_machine__";
const unknownStateKey = "__qa_unknown_state__";
const expectedFlowLayerKeys = [
  "business",
  "state",
  "workflow",
  "approval",
  "task",
  "exception",
  "notification",
  "automation",
  "fact",
];
const expectedPathKinds = [
  "blocked",
  "rejected",
  "cancelled",
  "reversed",
  "adjusted",
  "returned",
  "rework",
  "resumed",
];

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertMeaningful(value, context) {
  if (typeof value === "string") {
    assert(value.trim(), `${context} must be a non-empty string`);
    return;
  }
  if (Array.isArray(value)) {
    assert(value.length > 0, `${context} must not be empty`);
    return;
  }
  assert(
    value && typeof value === "object" && Object.keys(value).length > 0,
    `${context} must be a non-empty value`,
  );
}

function assertEvidenceList(value, context) {
  assert(Array.isArray(value), `${context} must be an array`);
  assert(value.length > 0, `${context} must not be empty`);
  value.forEach((item, index) =>
    assertMeaningful(item, `${context}[${index}]`),
  );
}

function assertSemanticAuthority(value, context) {
  assert.equal(typeof value, "string", `${context} must be a string`);
  assert(value.trim(), `${context} must explain the source of authority`);
  assert.doesNotMatch(
    value,
    /^(?:true|false)$/iu,
    `${context} must not collapse authority into a boolean`,
  );
}

function getKey(value) {
  return typeof value === "string" ? value : value?.key;
}

function assertUniqueKeys(items, context) {
  const keys = items.map((item) => getKey(item));
  keys.forEach((key, index) =>
    assertMeaningful(key, `${context}[${index}].key`),
  );
  assert.equal(
    new Set(keys).size,
    keys.length,
    `${context} keys must be unique`,
  );
  return keys;
}

test("dev flow state observatory: catalog stays read-only and structurally complete", () => {
  assertMeaningful(DEV_FLOW_STATE_CATALOG.version, "catalog.version");
  assert.equal(DEV_FLOW_STATE_CATALOG.route, observatoryRoute);
  assert.equal(DEV_FLOW_STATE_CATALOG.readOnly, true);
  assertSemanticAuthority(
    DEV_FLOW_STATE_CATALOG.runtimeAuthority,
    "catalog.runtimeAuthority",
  );
  assert.equal(DEV_FLOW_STATE_CATALOG.allowsGenericStatusWrite, false);
  assert.deepEqual(DEV_FLOW_STATE_CATALOG.writeApis, []);
  assert.deepEqual(DEV_FLOW_STATE_CATALOG.pathKinds, expectedPathKinds);
  const pathKindCounts = Object.fromEntries(
    expectedPathKinds.map((pathKind) => [pathKind, 0]),
  );

  assert(Array.isArray(DEV_FLOW_STATE_CATALOG.scopes));
  assert(DEV_FLOW_STATE_CATALOG.scopes.length > 0);
  const scopeKeys = assertUniqueKeys(
    DEV_FLOW_STATE_CATALOG.scopes,
    "catalog.scopes",
  );
  DEV_FLOW_STATE_CATALOG.scopes.forEach((scope, index) => {
    assertMeaningful(scope.label, `catalog.scopes[${index}].label`);
    assertSemanticAuthority(
      scope.runtimeAuthority,
      `catalog.scopes[${index}].runtimeAuthority`,
    );
  });

  assert.deepEqual(
    DEV_FLOW_STATE_CATALOG.flowLayers.map((layer) => layer.key),
    expectedFlowLayerKeys,
    "catalog.flowLayers must cover the nine approved read-only overlays exactly",
  );
  DEV_FLOW_STATE_CATALOG.flowLayers.forEach((layer, index) => {
    const context = `catalog.flowLayers[${index}]`;
    assertMeaningful(layer.label, `${context}.label`);
    assertMeaningful(
      layer.description || layer.summary,
      `${context}.description`,
    );
    assertSemanticAuthority(
      layer.runtimeAuthority,
      `${context}.runtimeAuthority`,
    );
    assert.equal(layer.allowsGenericStatusWrite, false);
    assertEvidenceList(layer.sourceRefs, `${context}.sourceRefs`);
    assertEvidenceList(layer.evidence, `${context}.evidence`);
  });

  assert(Array.isArray(DEV_FLOW_STATE_CATALOG.flows));
  assert(DEV_FLOW_STATE_CATALOG.flows.length > 0);
  assertUniqueKeys(DEV_FLOW_STATE_CATALOG.flows, "catalog.flows");

  for (const flow of DEV_FLOW_STATE_CATALOG.flows) {
    const flowContext = `catalog.flows[${flow.key}]`;
    const allowsObjectSpecificEmptyTransitions = [
      "taxonomy",
      "projection",
    ].includes(flow.kind);
    assertMeaningful(flow.label, `${flowContext}.label`);
    assert(
      scopeKeys.includes(flow.scopeKey),
      `${flowContext}.scopeKey must reference a declared scope`,
    );
    assertMeaningful(flow.kind, `${flowContext}.kind`);
    assertMeaningful(
      flow.transitionAuthority,
      `${flowContext}.transitionAuthority`,
    );
    if (allowsObjectSpecificEmptyTransitions) {
      assert(
        ["object-specific", "derived-only"].includes(flow.transitionAuthority),
        `${flowContext}.transitionAuthority must expose its object-specific or derived-only boundary`,
      );
    }
    assert.equal(typeof flow.previewOnly, "boolean");
    assert.equal(
      flow.allowsGenericStatusWrite,
      false,
      `${flowContext} must never expose generic status writes`,
    );
    assertSemanticAuthority(
      flow.runtimeAuthority,
      `${flowContext}.runtimeAuthority`,
    );
    assertMeaningful(flow.guard, `${flowContext}.guard`);
    assertMeaningful(flow.factBoundary, `${flowContext}.factBoundary`);
    assert(Object.hasOwn(flow, "action"), `${flowContext}.action is required`);
    assert(
      Array.isArray(flow.permission),
      `${flowContext}.permission must be an array`,
    );
    assertEvidenceList(flow.sourceRefs, `${flowContext}.sourceRefs`);
    assertEvidenceList(flow.evidence, `${flowContext}.evidence`);

    assert(
      Array.isArray(flow.states),
      `${flowContext}.states must be an array`,
    );
    assert(flow.states.length > 0, `${flowContext}.states must not be empty`);
    const stateKeys = assertUniqueKeys(flow.states, `${flowContext}.states`);

    for (const state of flow.states) {
      const stateContext = `${flowContext}.states[${state.key}]`;
      assertMeaningful(state.label, `${stateContext}.label`);
      assert.equal(
        typeof state.initial,
        "boolean",
        `${stateContext}.initial must be boolean`,
      );
      assert.equal(
        typeof state.terminal,
        "boolean",
        `${stateContext}.terminal must be boolean`,
      );
      assert.equal(
        typeof state.summary,
        "string",
        `${stateContext}.summary must be a string`,
      );
      assertEvidenceList(state.sourceRefs, `${stateContext}.sourceRefs`);
      assertEvidenceList(state.evidence, `${stateContext}.evidence`);
    }

    assert(
      Array.isArray(flow.initialStates),
      `${flowContext}.initialStates must be an array`,
    );
    assert(
      Array.isArray(flow.terminalStates),
      `${flowContext}.terminalStates must be an array`,
    );
    if (!allowsObjectSpecificEmptyTransitions) {
      assert(
        flow.initialStates.length > 0,
        `${flowContext}.initialStates must not be empty`,
      );
      assert(
        ["explicit", "none_reactivatable", "none_open_lifecycle"].includes(
          flow.terminalPolicy,
        ),
        `${flowContext}.terminalPolicy must explain its terminal semantics`,
      );
      if (flow.terminalPolicy === "explicit") {
        assert(
          flow.terminalStates.length > 0,
          `${flowContext}.terminalStates must not be empty under explicit policy`,
        );
      } else {
        assert.equal(
          flow.terminalStates.length,
          0,
          `${flowContext}.terminalStates must be empty under ${flow.terminalPolicy}`,
        );
      }
    }
    const initialStateKeys = assertUniqueKeys(
      flow.initialStates,
      `${flowContext}.initialStates`,
    );
    const terminalStateKeys = assertUniqueKeys(
      flow.terminalStates,
      `${flowContext}.terminalStates`,
    );
    initialStateKeys.forEach((key) =>
      assert(
        stateKeys.includes(key),
        `${flowContext}.initialStates references unknown state ${key}`,
      ),
    );
    terminalStateKeys.forEach((key) =>
      assert(
        stateKeys.includes(key),
        `${flowContext}.terminalStates references unknown state ${key}`,
      ),
    );
    assert.deepEqual(
      [...initialStateKeys].sort(),
      flow.states
        .filter((state) => state.initial)
        .map((state) => state.key)
        .sort(),
      `${flowContext} initial state flags and index must agree`,
    );
    assert.deepEqual(
      [...terminalStateKeys].sort(),
      flow.states
        .filter((state) => state.terminal)
        .map((state) => state.key)
        .sort(),
      `${flowContext} terminal state flags and index must agree`,
    );

    assert(
      Array.isArray(flow.transitions),
      `${flowContext}.transitions must be an array`,
    );
    if (!allowsObjectSpecificEmptyTransitions) {
      assert(
        flow.transitions.length > 0,
        `${flowContext}.transitions must not be empty`,
      );
    }
    assertUniqueKeys(flow.transitions, `${flowContext}.transitions`);
    for (const transition of flow.transitions) {
      const transitionContext = `${flowContext}.transitions[${transition.key}]`;
      assert(
        stateKeys.includes(transition.from),
        `${transitionContext}.from references unknown state ${transition.from}`,
      );
      assert(
        stateKeys.includes(transition.to),
        `${transitionContext}.to references unknown state ${transition.to}`,
      );
      assertMeaningful(transition.guard, `${transitionContext}.guard`);
      assertMeaningful(transition.action, `${transitionContext}.action`);
      assert(
        Array.isArray(transition.permission),
        `${transitionContext}.permission must be an array`,
      );
      assertMeaningful(
        transition.factBoundary,
        `${transitionContext}.factBoundary`,
      );
      assertEvidenceList(
        transition.sourceRefs,
        `${transitionContext}.sourceRefs`,
      );
      assertEvidenceList(transition.evidence, `${transitionContext}.evidence`);
      assert(
        Array.isArray(transition.pathKinds),
        `${transitionContext}.pathKinds must be an array`,
      );
      assert.equal(
        new Set(transition.pathKinds).size,
        transition.pathKinds.length,
        `${transitionContext}.pathKinds must be unique`,
      );
      for (const pathKind of transition.pathKinds) {
        assert(
          expectedPathKinds.includes(pathKind),
          `${transitionContext}.pathKinds contains unknown ${pathKind}`,
        );
        pathKindCounts[pathKind] += 1;
      }
      if (transition.pathKinds.length > 0) {
        assert(
          transition.permission.length > 0,
          `${transitionContext} exceptional path must declare permission`,
        );
      }
    }
  }
  for (const [pathKind, count] of Object.entries(pathKindCounts)) {
    assert(count > 0, `catalog must include a positive ${pathKind} path`);
  }

  const bomFlow = DEV_FLOW_STATE_CATALOG.flows.find(
    (flow) => flow.key === "master.bom",
  );
  assert(bomFlow, "catalog must include the BOM lifecycle");
  assert.equal(bomFlow.kind, "state_machine");
  assert.equal(bomFlow.terminalPolicy, "none_reactivatable");
  assert.deepEqual(bomFlow.terminalStates, []);
});

test("dev flow state observatory: process catalog covers seven processes and eight exact variants", () => {
  const definitions = DEV_FLOW_STATE_CATALOG.processDefinitions;
  assert(Array.isArray(definitions));
  assert.deepEqual(
    definitions.map((definition) => definition.key),
    [
      "sales_order_acceptance/approval_pmc",
      "sales_order_acceptance/approval_engineering_pmc",
      "material_supply/purchase_order_approval",
      "finished_goods_delivery/shipment_finance_approval",
      "sales_return_acceptance/approval_receipt",
      "finance_payment_approval/approval_post",
      "inventory_adjustment_approval/manual_adjustment_approval",
      "production_exception_approval/exception_decision_approval",
    ],
  );
  assert.deepEqual(
    [...new Set(definitions.map((definition) => definition.processKey))].sort(),
    [
      "finance_payment_approval",
      "finished_goods_delivery",
      "inventory_adjustment_approval",
      "material_supply",
      "production_exception_approval",
      "sales_order_acceptance",
      "sales_return_acceptance",
    ],
  );

  const definitionByIdentity = new Map();
  for (const definition of definitions) {
    const context = `catalog.processDefinitions[${definition.key}]`;
    const identity = [
      definition.processKey,
      definition.processVersion,
      definition.variantKey,
      definition.businessRefType,
    ].join("/");
    assertMeaningful(definition.label, `${context}.label`);
    assert.equal(definition.processVersion, "v1");
    assert.equal(
      definition.key,
      `${definition.processKey}/${definition.variantKey}`,
    );
    assertMeaningful(definition.businessRefType, `${context}.businessRefType`);
    assert.equal(definition.readOnly, true);
    assert.equal(definition.allowsActionExecution, false);
    assertSemanticAuthority(
      definition.runtimeAuthority,
      `${context}.runtimeAuthority`,
    );
    assertMeaningful(definition.factBoundary, `${context}.factBoundary`);
    assertEvidenceList(definition.sourceRefs, `${context}.sourceRefs`);
    assertEvidenceList(definition.evidence, `${context}.evidence`);
    assert(
      !definitionByIdentity.has(identity),
      `${context} identity duplicated`,
    );
    definitionByIdentity.set(identity, definition);

    assert(
      Array.isArray(definition.nodes) && definition.nodes.length > 1,
      `${context}.nodes must include an initial and terminal node`,
    );
    const nodeKeys = assertUniqueKeys(definition.nodes, `${context}.nodes`);
    assert(nodeKeys.includes(definition.initial));
    assert(nodeKeys.includes(definition.terminal));
    for (const node of definition.nodes) {
      const nodeContext = `${context}.nodes[${node.key}]`;
      assertMeaningful(node.type, `${nodeContext}.type`);
      assertMeaningful(node.label, `${nodeContext}.label`);
      assert(
        node.ownerPool == null ||
          (typeof node.ownerPool === "string" && node.ownerPool.trim()),
        `${nodeContext}.ownerPool must be null or meaningful`,
      );
      assert(
        node.action == null ||
          (typeof node.action === "string" && node.action.trim()),
        `${nodeContext}.action must be null or meaningful`,
      );
      assert(
        Array.isArray(node.permission),
        `${nodeContext}.permission must be an array`,
      );
      assertMeaningful(node.factBoundary, `${nodeContext}.factBoundary`);
      assertEvidenceList(node.sourceRefs, `${nodeContext}.sourceRefs`);
      assertEvidenceList(node.evidence, `${nodeContext}.evidence`);
    }

    assert(
      Array.isArray(definition.edges) && definition.edges.length > 0,
      `${context}.edges must not be empty`,
    );
    assertUniqueKeys(definition.edges, `${context}.edges`);
    const outgoingByNode = new Map();
    const incomingByNode = new Map();
    for (const edge of definition.edges) {
      const edgeContext = `${context}.edges[${edge.key}]`;
      assert(nodeKeys.includes(edge.from), `${edgeContext}.from is unknown`);
      assert(nodeKeys.includes(edge.to), `${edgeContext}.to is unknown`);
      assertEvidenceList(edge.sourceRefs, `${edgeContext}.sourceRefs`);
      assertEvidenceList(edge.evidence, `${edgeContext}.evidence`);
      outgoingByNode.set(edge.from, [
        ...(outgoingByNode.get(edge.from) || []),
        edge.to,
      ]);
      incomingByNode.set(edge.to, [
        ...(incomingByNode.get(edge.to) || []),
        edge.from,
      ]);
    }
    assert.equal(
      (incomingByNode.get(definition.initial) || []).length,
      0,
      `${context}.initial must not have incoming edges`,
    );
    assert.equal(
      (outgoingByNode.get(definition.terminal) || []).length,
      0,
      `${context}.terminal must not have outgoing edges`,
    );

    const reachable = new Set([definition.initial]);
    const queue = [definition.initial];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of outgoingByNode.get(current) || []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        queue.push(next);
      }
    }
    assert.deepEqual(
      [...reachable].sort(),
      [...nodeKeys].sort(),
      `${context} every node must be reachable from the initial node`,
    );
  }

  for (const overlay of DEV_FLOW_STATE_CATALOG.overlays) {
    const selectionKeys = new Set();
    for (const selection of overlay.runtimeProcessSelections) {
      const context = `catalog.overlays[${overlay.key}].runtimeProcessSelections[${selection.key}]`;
      const identity = [
        selection.processKey,
        selection.processVersion,
        selection.variantKey,
        selection.businessRefType,
      ].join("/");
      assert(
        !selectionKeys.has(selection.processKey),
        `${context} duplicates a process selection`,
      );
      selectionKeys.add(selection.processKey);
      assert.equal(selection.status, "registered_preview_selection");
      assert.equal(selection.previewOnly, true);
      assert.equal(selection.readOnly, true);
      assert.equal(selection.allowsActionExecution, false);
      assertSemanticAuthority(
        selection.runtimeAuthority,
        `${context}.runtimeAuthority`,
      );
      assertEvidenceList(selection.sourceRefs, `${context}.sourceRefs`);
      assertEvidenceList(selection.evidence, `${context}.evidence`);
      assertMeaningful(selection.definition, `${context}.definition`);
      const canonical = definitionByIdentity.get(identity);
      assert(
        canonical,
        `${context} references an unknown Product Core variant`,
      );
      assert.equal(selection.canonicalProcessDefinition, canonical);
    }
  }
});

test("dev flow state observatory: customer overlays remain preview-only", () => {
  assert(Array.isArray(DEV_FLOW_STATE_CATALOG.overlays));
  assert(
    DEV_FLOW_STATE_CATALOG.overlays.length > 0,
    "catalog.overlays must expose the registered customer previews",
  );

  const overlayKeys = DEV_FLOW_STATE_CATALOG.overlays.map(
    (overlay) => overlay.key || overlay.definition?.key,
  );
  overlayKeys.forEach((key, index) =>
    assertMeaningful(key, `catalog.overlays[${index}].key`),
  );
  assert.equal(
    new Set(overlayKeys).size,
    overlayKeys.length,
    "catalog overlay keys must be unique",
  );

  DEV_FLOW_STATE_CATALOG.overlays.forEach((overlay, index) => {
    const context = `catalog.overlays[${overlayKeys[index]}]`;
    assert.equal(
      overlay.previewOnly,
      true,
      `${context} must never be promoted to runtime authority`,
    );
    assertSemanticAuthority(
      overlay.runtimeAuthority,
      `${context}.runtimeAuthority`,
    );
    assert.equal(overlay.allowsGenericStatusWrite, false);
    assertMeaningful(overlay.definition, `${context}.definition`);
    assertEvidenceList(overlay.sourceRefs, `${context}.sourceRefs`);
    assertEvidenceList(overlay.evidence, `${context}.evidence`);

    for (const collectionKey of [
      "businessFlows",
      "stateMachines",
      "processPolicies",
    ]) {
      assert(
        Array.isArray(overlay[collectionKey]),
        `${context}.${collectionKey} must be an array`,
      );
      for (const preview of overlay[collectionKey]) {
        const previewContext = `${context}.${collectionKey}[${preview.key}]`;
        assert.equal(preview.previewOnly, true);
        assertSemanticAuthority(
          preview.runtimeAuthority,
          `${previewContext}.runtimeAuthority`,
        );
        assert.equal(preview.allowsGenericStatusWrite, false);
        assertMeaningful(preview.definition, `${previewContext}.definition`);
        assertEvidenceList(preview.sourceRefs, `${previewContext}.sourceRefs`);
        assertEvidenceList(preview.evidence, `${previewContext}.evidence`);
        assertMeaningful(preview.comparison, `${previewContext}.comparison`);
      }
    }
  });
});

test("dev flow state observatory: every sourceRefs entry resolves inside the repository", () => {
  const visited = new WeakSet();

  function visit(value, context) {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${context}[${index}]`));
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      const itemContext = `${context}.${key}`;
      if (key !== "sourceRefs") {
        visit(item, itemContext);
        continue;
      }

      assert(
        Array.isArray(item) && item.length > 0,
        `${itemContext} must be a non-empty array of repository paths`,
      );
      item.forEach((sourceRef, index) => {
        const sourceContext = `${itemContext}[${index}]`;
        assert.equal(
          typeof sourceRef,
          "string",
          `${sourceContext} must be a string`,
        );
        assert.equal(
          sourceRef,
          sourceRef.trim(),
          `${sourceContext} must use an exact path without padding`,
        );
        assert(sourceRef, `${sourceContext} must not be empty`);
        assert(
          !path.isAbsolute(sourceRef) && !sourceRef.split("/").includes(".."),
          `${sourceContext} must stay repository-relative`,
        );
        const resolved = path.resolve(repoRoot, sourceRef);
        assert(
          resolved.startsWith(`${repoRoot}${path.sep}`),
          `${sourceContext} must stay inside the repository`,
        );
        assert(
          existsSync(resolved),
          `${sourceContext} does not exist: ${sourceRef}; identifiers and RPC methods belong in semantic evidence, not sourceRefs`,
        );
      });
    }
  }

  visit(DEV_FLOW_STATE_CATALOG, "catalog");
});

test("dev flow state observatory: lookups and transition checks fail closed", () => {
  assert.equal(getDevFlowStateMachine(unknownMachineKey), null);
  assert.equal(getDevFlowState(unknownMachineKey, unknownStateKey), null);
  assert.deepEqual(
    getDevFlowStateTransitions(unknownMachineKey, unknownStateKey),
    [],
  );
  assert.equal(
    canDevFlowStateTransition(
      unknownMachineKey,
      unknownStateKey,
      unknownStateKey,
    ),
    false,
  );

  const flow = DEV_FLOW_STATE_CATALOG.flows.find(
    (item) => item.transitions.length > 0,
  );
  assert(flow, "catalog must include at least one explicit state machine");
  const state = flow.states[0];
  const transition = flow.transitions[0];
  assert.equal(getDevFlowStateMachine(flow.key)?.key, flow.key);
  assert.equal(getDevFlowState(flow.key, state.key)?.key, state.key);
  assert.equal(
    getDevFlowStateMachine(` ${flow.key}`),
    null,
    "machine lookup must not trim or alias keys",
  );
  assert.equal(
    getDevFlowState(flow.key, ` ${state.key}`),
    null,
    "state lookup must not trim or alias keys",
  );
  assert.equal(
    canDevFlowStateTransition(flow.key, transition.from, transition.to),
    true,
  );
  assert.equal(
    canDevFlowStateTransition(flow.key, ` ${transition.from}`, transition.to),
    false,
    "transition lookup must not normalize unknown state keys",
  );
});

test("dev flow state observatory: route and page stay DEV-only and read-only", () => {
  const catalogSource = read("web/src/dev-workbench/config/devFlowStateCatalog.mjs");
  const devRoutesSource = read("web/src/dev-workbench/config/devRoutes.mjs");
  const devHubSource = read("web/src/dev-workbench/config/devHub.mjs");
  const routerSource = read("web/src/erp/router.jsx");
  const workbenchRoutesSource = read("web/src/dev-workbench/DevWorkbenchRoutes.jsx");
  const pageSource = read("web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx");
  const formalMenuSources = [
    read("web/src/erp/config/menuPermissions.mjs"),
    read("web/src/erp/config/seedData.mjs"),
  ].join("\n");

  assert.match(
    devRoutesSource,
    /export const DEV_[A-Z_]+_ROUTE\s*=\s*["']\/__dev\/status-flows["']/u,
  );
  const routeConstantMatch = devRoutesSource.match(
    /export const (DEV_[A-Z_]+_ROUTE)\s*=\s*["']\/__dev\/status-flows["']/u,
  );
  assert(routeConstantMatch, "observatory route constant must be declared");
  assert(
    devHubSource.includes(routeConstantMatch[1]),
    "dev hub must consume the observatory route constant",
  );
  assert.doesNotMatch(formalMenuSources, /\/__dev\/status-flows/u);
  assert.match(
    routerSource,
    /const DevWorkbenchRoutes\s*=\s*import\.meta\.env\.DEV[\s\S]{0,180}?@\/dev-workbench\/DevWorkbenchRoutes\.jsx/u,
  );
  assert.match(
    routerSource,
    /<Route path="\/__dev\/\*" element=\{<DevWorkbenchRoutes \/>\}/u,
  );
  assert.match(
    workbenchRoutesSource,
    /import\(['"]\.\/pages\/DevFlowStateObservatoryPage\.jsx['"]\)/u,
  );
  assert.match(
    workbenchRoutesSource,
    /path="status-flows"[\s\S]{0,100}?<DevFlowStateObservatoryPage/u,
  );

  assert.match(
    pageSource,
    /import\.meta\.glob\(["']\.\.\/config\/devFlowStateCatalog\.mjs["']\)/u,
  );
  assert.match(
    pageSource,
    /moduleValue\?\.DEV_FLOW_STATE_CATALOG/u,
    "observatory page must consume the canonical catalog export",
  );
  assert.match(pageSource, /<DevPageNav/u);
  assert.match(pageSource, /<h1|<Title\s+level=\{1\}/u);
  for (const visibleCopy of [
    "流程与状态观察台",
    "只读观察，不改写任何业务状态",
    "Product Core",
    "甲方差异",
    "状态字典",
    "客户差异",
    "运行轨迹",
    "叠加层",
  ]) {
    assert(
      pageSource.includes(visibleCopy),
      `observatory page must include read-only copy: ${visibleCopy}`,
    );
  }
  assert.match(pageSource, /单机(?:状态)?图/u);
  assert.match(pageSource, /流程编排|甲方编排/u);
  assert.match(
    pageSource,
    /没有匹配|暂无匹配|暂无符合|未找到/u,
    "observatory page must expose an explicit empty state",
  );
  assert.match(
    pageSource,
    /\boverlays?\b/u,
    "observatory page must consume the preview overlay catalog",
  );
  assert.match(
    pageSource,
    /function EvidenceDisclosure/u,
    "source evidence must remain available through one disclosure component",
  );
  assert.match(
    pageSource,
    /<details\b[^>]*data-evidence-disclosure/u,
    "source evidence must use a native keyboard-accessible disclosure",
  );
  assert.doesNotMatch(
    pageSource,
    /<details\b[^>]*\bopen(?:=|\s|>)/u,
    "source evidence must stay collapsed by default",
  );
  assert.doesNotMatch(
    pageSource,
    /selectedOverlay\.evidence\.at\(0\)\?\.path/u,
    "customer summary must not expose a raw file path before disclosure",
  );
  const transitionCardsStart = pageSource.indexOf("function TransitionCards");
  const transitionCardsEnd = pageSource.indexOf(
    "\nfunction OverviewView",
    transitionCardsStart,
  );
  assert(
    transitionCardsStart >= 0 && transitionCardsEnd > transitionCardsStart,
    "TransitionCards source must remain statically inspectable",
  );
  assert.doesNotMatch(
    pageSource.slice(transitionCardsStart, transitionCardsEnd),
    /<EvidenceList/u,
    "each transition card must not repeat source file paths",
  );
  assert.match(
    pageSource.slice(transitionCardsStart, transitionCardsEnd),
    /<EvidenceDisclosure/u,
    "each transition card must expose its canonical evidence on demand",
  );
  const graphLabelStart = pageSource.indexOf("function transitionLayerValues");
  const graphLabelEnd = pageSource.indexOf(
    "\nfunction buildFlowMermaid",
    graphLabelStart,
  );
  assert(
    graphLabelStart >= 0 && graphLabelEnd > graphLabelStart,
    "graph label policy must remain statically inspectable",
  );
  const graphLabelSource = pageSource.slice(graphLabelStart, graphLabelEnd);
  assert.match(
    graphLabelSource,
    /compactGraphText/u,
    "graph labels must pass through the compact text policy",
  );
  assert.match(
    graphLabelSource,
    /transition\.pathKinds/u,
    "exception, correction and recovery labels must use registered pathKinds",
  );
  assert.doesNotMatch(
    graphLabelSource,
    /block\|reject\|cancel\|exception\|error/u,
    "path authority must not be inferred from transition keywords",
  );
  for (const queryKey of ["path_mode", "path_kind", "path_objects"]) {
    assert(
      pageSource.includes(queryKey),
      `observatory deep links must preserve ${queryKey}`,
    );
  }
  assert.match(
    pageSource,
    /fail closed 拒绝放宽/u,
    "unknown path filters must fail closed visibly",
  );
  assert.doesNotMatch(
    graphLabelSource,
    /addUnique\([^)]*,\s*transition\.(?:key|action|permission|guard|factBoundary)/u,
    "graph labels must not render raw transition keys, actions, permissions, guards, or boundaries",
  );
  assert.doesNotMatch(
    graphLabelSource,
    /workflowEvidence\?\.label|noticeEvidence\?\.label/u,
    "graph labels must not promote evidence paths or descriptions into edges",
  );
  for (const compactGraphCopy of [
    "完整条件、权限与来源在下方查看",
    "叠加层只增加短提示",
  ]) {
    assert(
      pageSource.includes(compactGraphCopy),
      `observatory must explain the compact graph boundary: ${compactGraphCopy}`,
    );
  }

  const inspectedSources = [
    ["catalog", catalogSource],
    ["page", pageSource],
  ];
  const forbiddenMutationPattern =
    /\b(?:set_status|setStatus|updateStatus|transitionStatus|mutate|createTask|updateTask|completeTask|approveTask|rejectTask|executeDomainCommand|activateCustomerConfig|rollbackCustomerConfig|publishCustomerConfig)\s*\(/u;
  const directDatabasePattern =
    /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_][\w.]*\s+SET|DELETE\s+FROM)\b/iu;
  const writeRequestPattern =
    /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/iu;
  const forbiddenImportPattern =
    /from\s+["'][^"']*(?:mutation|set[_-]?status|database|\/db\/)[^"']*["']/iu;
  const forbiddenMutationBindingPattern =
    /\b(?:createTask|updateTask|deleteTask|completeTask|approveTask|rejectTask|mutate\w*|setStatus\w*|transitionStatus\w*)\b/u;

  for (const [name, source] of inspectedSources) {
    assert.doesNotMatch(source, forbiddenMutationPattern, `${name} mutation`);
    assert.doesNotMatch(source, directDatabasePattern, `${name} direct DB`);
    assert.doesNotMatch(source, writeRequestPattern, `${name} write request`);
    assert.doesNotMatch(
      source,
      forbiddenImportPattern,
      `${name} forbidden import`,
    );
    for (const importMatch of source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s+["'][^"']+["']/gu,
    )) {
      assert.doesNotMatch(
        importMatch[1],
        forbiddenMutationBindingPattern,
        `${name} mutation binding import`,
      );
    }
  }
});
