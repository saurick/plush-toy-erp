#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import nodeAssert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { yoyoosunFieldNumberingConfig } from "../../config/customers/yoyoosun/fieldNumberingConfig.mjs";
import { yoyoosunImportConfig } from "../../config/customers/yoyoosun/importConfig.mjs";
import { yoyoosunMenuConfig } from "../../config/customers/yoyoosun/menuConfig.mjs";

const ALLOWED_FIELD_DECISIONS = new Set(["review_required", "defer_runtime"]);
const ALLOWED_NUMBERING_DECISIONS = new Set(["review_required", "deferred"]);
const ALLOWED_IMPORT_CLASSIFICATIONS = new Set([
  "runtime_active_display_config",
  "draft_customer_config",
  "data_import_adapter",
  "deferred_runtime",
  "print_template_input",
  "forbidden_auto_import",
]);
const ALLOWED_IMPORT_DECISIONS = new Set([
  "runtime_active",
  "review_required",
  "draft_only",
  "deferred",
  "forbidden_auto_import",
]);
const FORBIDDEN_RAW_DATA_KEYS = new Set([
  "rows",
  "rawRows",
  "rawValues",
  "records",
  "sources",
  "globalScan",
  "extractedSourceStats",
  "dryRunPreview",
  "freezeCheck",
  "evidenceCount",
  "sourceRows",
  "workbooks",
  "sheets",
  "sensitiveFieldCount",
]);
const FORBIDDEN_PRIVATE_SOURCE_PATH_MARKERS = [
  "docs/customers/yoyoosun/raw-source-files",
  "docs/customers/yoyoosun/source-manifest.json",
  "output/customers/yoyoosun/source-extract",
];
const PRODUCT_RUNTIME_FILES = [
  "web/src/common/consts/brand.js",
  "web/src/erp/config/customerMenuConfig.mjs",
];
const BACKEND_PRODUCT_CORE_RUNTIME_ROOTS = [
  "server/internal/biz",
  "server/internal/core",
  "server/internal/data",
  "server/internal/service",
];
const BACKEND_PRODUCT_CORE_EXCLUDED_PREFIXES = [
  "server/internal/data/model/ent/",
  "server/internal/data/model/migrate/",
];
const BACKEND_CUSTOMER_SPECIFIC_TERMS = [
  "yoyoosun",
  "永绅",
  "config/customers/",
];
const BACKEND_ALLOWED_CUSTOMER_REFERENCES = [
  {
    path: "server/internal/biz/customer_config.go",
    pattern: /^\s*DefaultCustomerKey\s*=\s*"demo"\s*$/,
    reason:
      "neutral customer config fallback; private customer packages must be selected explicitly",
  },
];
const CUSTOMER_ASSET_ROOT = "/customer-assets/yoyoosun/";
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNonEmptyString(value, path) {
  assert(
    typeof value === "string" && value.trim() !== "",
    `${path} must be a non-empty string`,
  );
}

function assertStringList(values, path) {
  assert(Array.isArray(values), `${path} must be an array`);
  assert(values.length > 0, `${path} must not be empty`);
  values.forEach((value, index) => {
    assertNonEmptyString(value, `${path}[${index}]`);
  });
}

function assertExternalCliInput(input, pathName, expectedFlag) {
  assert(input && typeof input === "object", `${pathName} must be an object`);
  assert(
    input.cliFlag === expectedFlag,
    `${pathName}.cliFlag must stay ${expectedFlag}`,
  );
  assertNonEmptyString(input.location, `${pathName}.location`);
  assert(
    input.location.startsWith("external_"),
    `${pathName}.location must stay outside the product repository`,
  );
}

function assertNoRawDataPayload(value, path = "importConfig") {
  if (typeof value === "string") {
    for (const marker of FORBIDDEN_PRIVATE_SOURCE_PATH_MARKERS) {
      assert(
        !value.includes(marker),
        `${path} must not embed private source path ${marker}`,
      );
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert(
      !FORBIDDEN_RAW_DATA_KEYS.has(key),
      `${path}.${key} must not embed raw source rows or records`,
    );
    assertNoRawDataPayload(nestedValue, `${path}.${key}`);
  }
}

function validateProductRuntimeDoesNotBundleCustomerPackages() {
  for (const runtimeFile of PRODUCT_RUNTIME_FILES) {
    const source = readFileSync(repoPath(runtimeFile), "utf8");
    assert(
      !source.includes("config/customers/"),
      `${runtimeFile} must not import customer packages into the default product runtime`,
    );
    assert(
      !source.includes("yoyoosunMenuConfig"),
      `${runtimeFile} must not reference yoyoosun bundled menu config`,
    );
  }

  assert(
    existsSync(repoPath("web/public/customer-config.js")),
    "web/public/customer-config.js neutral runtime injection placeholder must exist",
  );
  assert(
    !existsSync(repoPath(path.join("web", "public", "favicon-yoyoosun.svg"))),
    "web/public must not include yoyoosun-specific favicon in the default product package",
  );
  assert(
    existsSync(
      repoPath("config/customers/yoyoosun/customer-config.example.js"),
    ),
    "yoyoosun customer package must keep a deployment injection example",
  );
  assert(
    existsSync(
      repoPath("config/customers/yoyoosun/public-assets/favicon-yoyoosun.svg"),
    ),
    "yoyoosun customer favicon must stay in the explicit public customer assets",
  );
}

function toRepoRelativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function shouldSkipBackendProductCorePath(relativePath) {
  return BACKEND_PRODUCT_CORE_EXCLUDED_PREFIXES.some((prefix) =>
    relativePath.startsWith(prefix),
  );
}

function collectBackendProductCoreRuntimeFiles() {
  const files = [];
  const visit = (absolutePath) => {
    const relativePath = toRepoRelativePath(absolutePath);
    if (shouldSkipBackendProductCorePath(relativePath)) {
      return;
    }

    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath)) {
        visit(path.join(absolutePath, entry));
      }
      return;
    }

    if (!relativePath.endsWith(".go") || relativePath.endsWith("_test.go")) {
      return;
    }
    files.push(relativePath);
  };

  for (const root of BACKEND_PRODUCT_CORE_RUNTIME_ROOTS) {
    visit(repoPath(root));
  }
  return files.sort();
}

function isAllowedBackendCustomerReference(relativePath, line) {
  return BACKEND_ALLOWED_CUSTOMER_REFERENCES.some(
    (allowance) =>
      allowance.path === relativePath && allowance.pattern.test(line),
  );
}

function validateBackendProductCoreDoesNotEmbedCustomerSpecificRules() {
  const files = collectBackendProductCoreRuntimeFiles();
  const violations = [];

  for (const relativePath of files) {
    const source = readFileSync(repoPath(relativePath), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        !BACKEND_CUSTOMER_SPECIFIC_TERMS.some((term) => line.includes(term))
      ) {
        return;
      }
      if (isAllowedBackendCustomerReference(relativePath, line)) {
        return;
      }
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }

  assert(
    violations.length === 0,
    `Product Core backend runtime must not embed yoyoosun/永绅/customer package rules outside customer config boundaries:\n${violations.join("\n")}`,
  );
  return files.length;
}

function validateBackendProcessContractOwnership() {
  const contractPath = "server/internal/biz/customer_process_contracts.go";
  const contractSource = readFileSync(repoPath(contractPath), "utf8");
  assert(
    !contractSource.includes('"reflect"'),
    `${contractPath} must not compare and accept caller-owned runtime graphs`,
  );
  assert(
    contractSource.includes(
      'if _, suppliedGraph := snapshot["processDefinitions"]; suppliedGraph {',
    ),
    `${contractPath} must fail closed whenever input supplies processDefinitions`,
  );
  assert(
    contractSource.includes('out["processDefinitions"] = canonicalDefinitions'),
    `${contractPath} must generate processDefinitions only as Product Core output`,
  );
  assert(
    (contractSource.match(/processDefinitions/g) || []).length === 2,
    `${contractPath} must keep exactly one input rejection and one canonical output assignment for processDefinitions`,
  );

  const servicePath = "server/internal/service/jsonrpc_customer_config.go";
  const serviceSource = readFileSync(repoPath(servicePath), "utf8");
  assert(
    serviceSource.includes(
      'if _, suppliedGraph := snapshot["processDefinitions"]; suppliedGraph {',
    ),
    `${servicePath} must reject legacy processDefinitions before manifest metadata merge`,
  );
  assert(
    (serviceSource.match(/processDefinitions/g) || []).length === 1,
    `${servicePath} must not merge, forward or fall back to a legacy process graph`,
  );
  for (const legacyPublishInput of [
    '"candidate_revision"',
    '"compiledSnapshot"',
    'getString(raw, "customerKey")',
    'getString(raw, "productVersion")',
  ]) {
    assert(
      !serviceSource.includes(legacyPublishInput),
      `${servicePath} must not accept legacy customer config input ${legacyPublishInput}`,
    );
  }
  assert(
    serviceSource.includes("for key := range pm") &&
      serviceSource.includes("if _, ok := allowedKeys[key]; !ok"),
    `${servicePath} validate/publish input must fail closed on unknown top-level fields`,
  );
  assert(
    serviceSource.includes("if _, exists := raw[key]; !exists") &&
      serviceSource.includes("if _, exists := snapshot[key]; exists"),
    `${servicePath} formal manifest metadata must have one top-level input source`,
  );
}

function validateWorkflowTaskRevisionVisibilityContract() {
  const servicePath = "server/internal/service/jsonrpc_workflow_task.go";
  const serviceSource = readFileSync(repoPath(servicePath), "utf8");
  const visibilityPath =
    "server/internal/service/jsonrpc_workflow_task_revision_visibility.go";
  const visibilitySource = readFileSync(repoPath(visibilityPath), "utf8");
  assert(
    (serviceSource.match(/workflowTaskQueryVisibilityScope\(/g) || [])
      .length === 2 &&
      (serviceSource.match(/workflowTaskReadVisibilityScope\(/g) || [])
        .length === 3 &&
      serviceSource.includes(
        "d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskApprove)",
      ) &&
      visibilitySource.includes(
        "d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)",
      ),
    `${servicePath} list, ordinary board and event reads must use supervised read scope while role-view and approval board use capability-specific revision-aware scope`,
  );
  assert(
    visibilitySource.includes(
      "d.AdminHasPermission(ctx, biz.PermissionWorkflowTaskSupervise)",
    ) &&
      visibilitySource.includes(
        "expandWorkflowTaskVisibilityForSupervision(scope, canSupervise)",
      ),
    `${visibilityPath} supervision must remain an explicit read-only expansion of the revision-aware scope`,
  );
  for (const legacyActiveFilter of [
    "filter.VisibleOwnerRoleKeys = d.workflowVisibleOwnerRoleKeys(",
    "visibleRoleKeys := d.workflowVisibleOwnerRoleKeys(",
    "query.VisibleOwnerRoleKeys = d.workflowVisibleOwnerRoleKeys(",
  ]) {
    assert(
      !serviceSource.includes(legacyActiveFilter),
      `${servicePath} must not flatten the current active revision into a query-level role list`,
    );
  }

  const predicatePath =
    "server/internal/data/workflow_task_revision_visibility.go";
  const predicateSource = readFileSync(repoPath(predicatePath), "utf8");
  assert(
    (
      predicateSource.match(
        /workflowtask\.ConfigRevisionEQ\(revision\.ConfigRevision\)/g,
      ) || []
    ).length === 2,
    `${predicatePath} list/board and role-view predicates must pair each role scope with its own revision`,
  );
  assert(
    (
      predicateSource.match(
        /workflowTaskPositiveRuntimeIDPredicate\(workflowtask\.FieldProcessInstanceID\)/g,
      ) || []
    ).length === 2 &&
      (
        predicateSource.match(
          /workflowTaskPositiveRuntimeIDPredicate\(workflowtask\.FieldProcessNodeInstanceID\)/g,
        ) || []
      ).length === 2,
    `${predicatePath} formal tasks must require both positive ProcessRuntime anchors`,
  );
  for (const legacyNullCheck of [
    "workflowtask.ConfigRevisionIsNil()",
    "workflowtask.ProcessInstanceIDIsNil()",
    "workflowtask.ProcessNodeInstanceIDIsNil()",
  ]) {
    assert(
      (
        predicateSource.match(
          new RegExp(legacyNullCheck.replace(/[()]/g, "\\$&"), "g"),
        ) || []
      ).length === 2,
      `${predicatePath} legacy visibility must require all runtime anchors to be absent`,
    );
  }

  const customerConfigPath =
    "server/internal/biz/customer_config_runtime.go";
  const customerConfigSource = readFileSync(
    repoPath(customerConfigPath),
    "utf8",
  );
  assert(
    (
      customerConfigSource.match(
        /customerConfigRevisionCanAuthorizeRuntimeTask\(stored\.Status\)/g,
      ) || []
    ).length === 2,
    `${customerConfigPath} visible-role and candidate-role lookups must reject non-runtime revisions`,
  );

  const bulkRepoPath =
    "server/internal/data/customer_config_workflow_visibility.go";
  const bulkRepoSource = readFileSync(repoPath(bulkRepoPath), "utf8");
  assert(
    bulkRepoSource.includes("status IN ($2, $3)") &&
      bulkRepoSource.includes("biz.CustomerConfigStatusActive") &&
      bulkRepoSource.includes("biz.CustomerConfigStatusSuperseded"),
    `${bulkRepoPath} must load only active/superseded revision scopes in one bulk projection`,
  );
}

function validateCustomerConfigRepositoryContract() {
  const bizPath = "server/internal/biz/customer_config.go";
  const bizSource = readFileSync(repoPath(bizPath), "utf8");
  assert(
    /CustomerConfigHashVersion\s*=\s*1\b/.test(bizSource) &&
      !bizSource.includes("CustomerConfigHashVersionFullPayload") &&
      !bizSource.includes("CustomerConfigHashVersionLegacySnapshot"),
    `${bizPath} must keep one full-payload hash v1 truth`,
  );

  const repoPathName = "server/internal/data/customer_config_repo.go";
  const repoSource = readFileSync(repoPath(repoPathName), "utf8");
  const openTaskCounter = repoSource.match(
    /func \(r \*customerConfigRepo\) CountOpenWorkflowTasksByResponsibilities[\s\S]*?\n}\n/,
  )?.[0];
  assert(
    openTaskCounter?.includes("task_status_key IN ('ready', 'blocked')"),
    `${repoPathName} open workflow blocker count must use the ready/blocked contract`,
  );
  for (const legacyStatus of ["pending", "processing", "cancelled"]) {
    assert(
      !openTaskCounter.includes(`'${legacyStatus}'`),
      `${repoPathName} open workflow blocker count must not restore ${legacyStatus}`,
    );
  }
  assert(
    repoSource.includes("ON CONFLICT (customer_key, revision) DO NOTHING") &&
      !repoSource.includes("ON CONFLICT (customer_key, revision) DO UPDATE"),
    `${repoPathName} publish must remain INSERT-only`,
  );
}

function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function pickRuntimeCustomerConfig(config) {
  return cloneJSON({
    customerKey: config?.customerKey,
    label: config?.label,
    brand: config?.brand,
    desktopMenu: config?.desktopMenu,
  });
}

function readYoyoosunCustomerConfigExample() {
  const examplePath = "config/customers/yoyoosun/customer-config.example.js";
  const source = readFileSync(repoPath(examplePath), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, {
    filename: repoPath(examplePath),
  });
  return sandbox.window.__PLUSH_ERP_CUSTOMER_CONFIG__;
}

function validateYoyoosunRuntimeInjectionExample() {
  const exampleConfig = readYoyoosunCustomerConfigExample();
  assert(
    exampleConfig && typeof exampleConfig === "object",
    "customer-config.example.js must assign window.__PLUSH_ERP_CUSTOMER_CONFIG__",
  );
  nodeAssert.deepStrictEqual(
    pickRuntimeCustomerConfig(exampleConfig),
    pickRuntimeCustomerConfig(yoyoosunMenuConfig),
    "customer-config.example.js runtime injection fields must match menuConfig.mjs customerKey/label/brand/desktopMenu",
  );

  const faviconHref = exampleConfig.brand?.faviconHref || "";
  assert(
    faviconHref.startsWith(CUSTOMER_ASSET_ROOT),
    `brand.faviconHref must live under ${CUSTOMER_ASSET_ROOT}`,
  );
  const faviconAssetName = faviconHref.slice(CUSTOMER_ASSET_ROOT.length);
  assertNonEmptyString(faviconAssetName, "brand.faviconHref asset name");
  assert(
    existsSync(
      repoPath(
        path.join("config/customers/yoyoosun/public-assets", faviconAssetName),
      ),
    ),
    "customer favicon asset referenced by runtime config must exist",
  );

  assert(
    !Object.prototype.hasOwnProperty.call(
      exampleConfig,
      "engineeringPrintSamples",
    ),
    "public customer config must not expose engineering samples or source data",
  );
}

function validateCustomerConfigReleaseOverlay() {
  for (const requiredPath of [
    "scripts/build/apply-customer-web-config.mjs",
    "scripts/build/apply-customer-web-config.test.mjs",
  ]) {
    assert(
      existsSync(repoPath(requiredPath)),
      `customer web config release boundary requires ${requiredPath}`,
    );
  }
  const dockerignore = readFileSync(repoPath(".dockerignore"), "utf8");
  const dockerignoreEntries = new Set(
    dockerignore
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  assert(
    dockerignore.includes("!scripts/build/**"),
    ".dockerignore must keep scripts/build/** in the Docker build context",
  );
  for (const privateBuildContextPath of [
    "docs",
    "deployments",
    "config/customers/**/assets",
    "**/.env",
    "**/.env.*",
    "**/.npmrc.local",
  ]) {
    assert(
      dockerignoreEntries.has(privateBuildContextPath),
      `.dockerignore must exclude ${privateBuildContextPath} from the Docker build context`,
    );
  }
  for (const publicBuildContextPath of [
    "!**/.env.example",
    "!web/.env.development",
    "!web/.env.production",
  ]) {
    assert(
      dockerignoreEntries.has(publicBuildContextPath),
      `.dockerignore must keep ${publicBuildContextPath.slice(1)} in the Docker build context`,
    );
  }
  const gitAttributes = readFileSync(repoPath(".gitattributes"), "utf8");
  for (const privateArchivePath of [
    "docs/customers/** export-ignore",
    "config/customers/*/assets/** export-ignore",
  ]) {
    assert(
      gitAttributes
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .includes(privateArchivePath),
      `.gitattributes must exclude ${privateArchivePath.split(" ")[0]} from git archives`,
    );
  }
  for (const dockerfile of ["web/Dockerfile", "server/Dockerfile"]) {
    const source = readFileSync(repoPath(dockerfile), "utf8");
    assert(
      source.includes("ERP_CUSTOMER_KEY"),
      `${dockerfile} must expose ERP_CUSTOMER_KEY build arg`,
    );
    assert(
      source.includes("apply-customer-web-config.mjs"),
      `${dockerfile} must apply customer web config during local/CI build`,
    );
  }

  const viteSharedSource = readFileSync(
    repoPath("web/vite.shared.mjs"),
    "utf8",
  );
  const viteRootImports = Array.from(
    viteSharedSource.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g),
    (match) => match[1],
  ).filter(
    (importPath) =>
      !importPath.startsWith("vite.") && !importPath.includes("/"),
  );
  const serverDockerfile = readFileSync(repoPath("server/Dockerfile"), "utf8");
  for (const importPath of viteRootImports) {
    assert(
      existsSync(repoPath(path.join("web", importPath))),
      `web/vite.shared.mjs imports missing root module ${importPath}`,
    );
    assert(
      serverDockerfile.includes(`web/${importPath}`),
      `server/Dockerfile must copy web/${importPath} because vite.shared.mjs imports it during the embedded frontend build`,
    );
  }
}

function validateYoyoosunFieldNumberingConfig(config) {
  assert(config.customerKey === "yoyoosun", "customerKey must stay yoyoosun");
  assert(
    config.status === "draft",
    "fieldNumberingConfig status must stay draft",
  );
  assert(
    config.runtimeEnabled === false,
    "fieldNumberingConfig must not be runtime-enabled",
  );

  const boundaries = config.boundaries;
  assert(
    boundaries && typeof boundaries === "object",
    "boundaries must be present",
  );
  for (const key of [
    "createsTenant",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "executesImport",
  ]) {
    assert(boundaries[key] === false, `boundaries.${key} must stay false`);
  }

  assert(
    Array.isArray(config.fieldDisplayReview),
    "fieldDisplayReview must be an array",
  );
  assert(
    config.fieldDisplayReview.length > 0,
    "fieldDisplayReview must not be empty",
  );

  for (const [
    moduleIndex,
    moduleConfig,
  ] of config.fieldDisplayReview.entries()) {
    const modulePath = `fieldDisplayReview[${moduleIndex}]`;
    assertNonEmptyString(moduleConfig.module, `${modulePath}.module`);
    assertNonEmptyString(moduleConfig.label, `${modulePath}.label`);
    assert(
      Array.isArray(moduleConfig.candidates),
      `${modulePath}.candidates must be an array`,
    );
    assert(
      moduleConfig.candidates.length > 0,
      `${modulePath}.candidates must not be empty`,
    );

    for (const [
      candidateIndex,
      candidate,
    ] of moduleConfig.candidates.entries()) {
      const candidatePath = `${modulePath}.candidates[${candidateIndex}]`;
      assertNonEmptyString(candidate.key, `${candidatePath}.key`);
      assertNonEmptyString(candidate.label, `${candidatePath}.label`);
      assert(
        ALLOWED_FIELD_DECISIONS.has(candidate.decision),
        `${candidatePath}.decision must be one of ${[...ALLOWED_FIELD_DECISIONS].join(", ")}`,
      );
      assertNonEmptyString(candidate.source, `${candidatePath}.source`);
      assert(
        candidate.source.endsWith(".md"),
        `${candidatePath}.source must point to a Markdown source`,
      );
      assertNonEmptyString(candidate.note, `${candidatePath}.note`);
    }
  }

  assert(
    Array.isArray(config.numberingRuleReview),
    "numberingRuleReview must be an array",
  );
  assert(
    config.numberingRuleReview.length > 0,
    "numberingRuleReview must not be empty",
  );

  for (const [index, item] of config.numberingRuleReview.entries()) {
    const itemPath = `numberingRuleReview[${index}]`;
    assertNonEmptyString(item.domain, `${itemPath}.domain`);
    assertNonEmptyString(item.key, `${itemPath}.key`);
    assertNonEmptyString(item.label, `${itemPath}.label`);
    assert(
      ALLOWED_NUMBERING_DECISIONS.has(item.currentDecision),
      `${itemPath}.currentDecision must be one of ${[...ALLOWED_NUMBERING_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(
      item.unresolvedQuestion,
      `${itemPath}.unresolvedQuestion`,
    );
  }
}

function validateYoyoosunImportConfig(config) {
  assert(
    config.customerKey === "yoyoosun",
    "importConfig customerKey must stay yoyoosun",
  );
  assert(config.status === "draft", "importConfig status must stay draft");
  assert(
    config.runtimeEnabled === false,
    "importConfig must not be runtime-enabled",
  );
  assertNoRawDataPayload(config);

  const sourcePolicy = config.sourcePolicy;
  assert(sourcePolicy, "importConfig.sourcePolicy must be present");
  assertExternalCliInput(
    sourcePolicy.manifestInput,
    "sourcePolicy.manifestInput",
    "--manifest",
  );
  assert(
    sourcePolicy.manifestInput.required === true,
    "sourcePolicy.manifestInput must be required",
  );
  assertExternalCliInput(
    sourcePolicy.rawSourceInput,
    "sourcePolicy.rawSourceInput",
    "--raw-dir",
  );
  assert(
    sourcePolicy.rawSourceInput.required === true,
    "sourcePolicy.rawSourceInput must be required",
  );
  assertExternalCliInput(
    sourcePolicy.extractOutput,
    "sourcePolicy.extractOutput",
    "--out",
  );
  assertNonEmptyString(
    sourcePolicy.extractOutput.location,
    "sourcePolicy.extractOutput.location",
  );
  for (const key of [
    "productRepositoryStoresManifest",
    "productRepositoryStoresRawSources",
    "productCiRequiresPrivateSources",
  ]) {
    assert(sourcePolicy[key] === false, `sourcePolicy.${key} must stay false`);
  }
  assert(
    sourcePolicy.noRawRowsInConfig === true,
    "sourcePolicy.noRawRowsInConfig must stay true",
  );
  assert(
    sourcePolicy.usesExtractedEvidenceOnly === true,
    "sourcePolicy.usesExtractedEvidenceOnly must stay true",
  );
  assert(
    sourcePolicy.requiresExistingV1SnapshotBeforeApproval === true,
    "sourcePolicy.requiresExistingV1SnapshotBeforeApproval must stay true",
  );
  assert(
    sourcePolicy.requiresHumanApprovalForRealImport === true,
    "sourcePolicy.requiresHumanApprovalForRealImport must stay true",
  );
  assert(
    sourcePolicy.pdfImageOcrEnabled === false,
    "sourcePolicy.pdfImageOcrEnabled must stay false",
  );

  for (const key of [
    "createsTenant",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "changesRuntimeLoader",
    "executesImport",
    "executesRealImport",
    "canExecuteRealImport",
    "writesBusinessRecords",
    "writesFacts",
    "writesInventoryFacts",
    "writesShipmentFacts",
    "writesFinanceFacts",
    "createsProductSkus",
    "createsPurchaseOrderRuntime",
  ]) {
    assert(
      config.boundaries?.[key] === false,
      `importConfig.boundaries.${key} must stay false`,
    );
  }

  const privateValidation = config.privateValidation;
  assert(privateValidation, "privateValidation must be present");
  assert(
    privateValidation.status === "external_required",
    "privateValidation.status must stay external_required",
  );
  assertNonEmptyString(
    privateValidation.runLocation,
    "privateValidation.runLocation",
  );
  assert(
    privateValidation.productCiMode === "not_required",
    "privateValidation must not be part of product CI",
  );
  assert(
    privateValidation.requiresManifestHashAndSourceChecksum === true,
    "private validation must verify manifest and source checksums",
  );
  assert(
    privateValidation.requiresHumanApprovalForRealImport === true,
    "real import must keep human approval",
  );
  assert(
    privateValidation.evidenceSummaryMayEnterProductRepository === false,
    "private validation evidence must stay outside the product repository",
  );
  assert(
    privateValidation.canExecuteRealImport === false,
    "private validation config must not execute real import",
  );

  assert(Array.isArray(config.configItems), "configItems must be an array");
  assert(
    config.configItems.length >= 9,
    "configItems must cover core customer config groups",
  );
  const itemIds = new Set();
  const itemGroups = new Set();
  for (const [index, item] of config.configItems.entries()) {
    const itemPath = `configItems[${index}]`;
    assertNonEmptyString(item.id, `${itemPath}.id`);
    assert(!itemIds.has(item.id), `${itemPath}.id must be unique`);
    itemIds.add(item.id);
    assertNonEmptyString(item.group, `${itemPath}.group`);
    itemGroups.add(item.group);
    assertNonEmptyString(item.label, `${itemPath}.label`);
    assert(
      ALLOWED_IMPORT_CLASSIFICATIONS.has(item.classification),
      `${itemPath}.classification must be one of ${[...ALLOWED_IMPORT_CLASSIFICATIONS].join(", ")}`,
    );
    assert(
      ALLOWED_IMPORT_DECISIONS.has(item.decision),
      `${itemPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(item.source, `${itemPath}.source`);
    assertStringList(item.appliesTo, `${itemPath}.appliesTo`);
    assert(
      item.productCoreImpact === "none",
      `${itemPath}.productCoreImpact must stay none`,
    );
    assertNonEmptyString(item.guardrail, `${itemPath}.guardrail`);
  }

  for (const group of [
    "brand_menu",
    "field_display",
    "numbering_rules",
    "source_extract_adapter",
    "master_data_import_defaults",
    "purchase_outsourcing_source_documents",
    "print_template_inputs",
    "role_permission_template",
    "forbidden_auto_import",
  ]) {
    assert(itemGroups.has(group), `configItems must include ${group}`);
  }

  assert(
    Array.isArray(config.sourceSheetGroups),
    "sourceSheetGroups must be an array",
  );
  const sheetGroupKeys = new Set(
    config.sourceSheetGroups.map((item) => item.key),
  );
  for (const key of [
    "material_bom_analysis",
    "purchase_material_summary",
    "supplier_contact_directory",
    "outsourcing_summary",
    "contract_print_samples",
  ]) {
    assert(sheetGroupKeys.has(key), `sourceSheetGroups must include ${key}`);
  }
  for (const [index, group] of config.sourceSheetGroups.entries()) {
    const groupPath = `sourceSheetGroups[${index}]`;
    assertNonEmptyString(group.key, `${groupPath}.key`);
    assertNonEmptyString(group.label, `${groupPath}.label`);
    assertStringList(group.domains, `${groupPath}.domains`);
    assertStringList(group.mappedFields, `${groupPath}.mappedFields`);
    assert(
      ALLOWED_IMPORT_DECISIONS.has(group.decision),
      `${groupPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(group.guardrail, `${groupPath}.guardrail`);
  }

  assert(
    Array.isArray(config.recommendedImportSequence),
    "recommendedImportSequence must be an array",
  );
  assert(
    config.recommendedImportSequence.length === 6,
    "recommendedImportSequence must keep the six reviewed steps",
  );
  config.recommendedImportSequence.forEach((step, index) => {
    const stepPath = `recommendedImportSequence[${index}]`;
    assert(step.step === index + 1, `${stepPath}.step must be sequential`);
    assertStringList(step.domains, `${stepPath}.domains`);
    assert(
      ALLOWED_IMPORT_DECISIONS.has(step.decision),
      `${stepPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(step.reason, `${stepPath}.reason`);
  });

  assert(Array.isArray(config.reviewQueues), "reviewQueues must be an array");
  const reviewQueueKeys = new Set(config.reviewQueues.map((item) => item.key));
  for (const key of [
    "unit_normalization",
    "supplier_role_split",
    "contact_owner_match",
    "bom_product_material_unit_match",
    "sensitive_contact_bank_fields",
    "existing_v1_snapshot",
  ]) {
    assert(reviewQueueKeys.has(key), `reviewQueues must include ${key}`);
  }
  for (const [index, item] of config.reviewQueues.entries()) {
    const itemPath = `reviewQueues[${index}]`;
    assertNonEmptyString(item.key, `${itemPath}.key`);
    assert(
      ["block", "review"].includes(item.severity),
      `${itemPath}.severity must be block or review`,
    );
    assertStringList(item.domains, `${itemPath}.domains`);
    assert(
      item.evidenceRequired === true,
      `${itemPath}.evidenceRequired must stay true`,
    );
    assert(
      item.decision === "review_required",
      `${itemPath}.decision must stay review_required`,
    );
    assertNonEmptyString(item.owner, `${itemPath}.owner`);
    assertNonEmptyString(item.note, `${itemPath}.note`);
  }

  assertStringList(
    config.forbiddenAutoImportTargets,
    "forbiddenAutoImportTargets",
  );
  for (const forbidden of [
    "tenant_id",
    "business_records",
    "product_skus",
    "purchase_orders",
    "outsourcing_facts",
    "shipments",
    "shipment_items",
    "stock_reservations",
    "inventory_txns",
    "inventory_balances",
    "inventory_lots",
    "finance_facts",
    "workflow_facts",
    "shipping_released_to_shipped",
    "workflow_done_to_fact_posted",
  ]) {
    assert(
      config.forbiddenAutoImportTargets.includes(forbidden),
      `forbiddenAutoImportTargets must include ${forbidden}`,
    );
  }
  assertStringList(config.deferredRuntimeTargets, "deferredRuntimeTargets");
}

validateYoyoosunFieldNumberingConfig(yoyoosunFieldNumberingConfig);
validateYoyoosunImportConfig(yoyoosunImportConfig);
validateProductRuntimeDoesNotBundleCustomerPackages();
const backendProductCoreRuntimeFileCount =
  validateBackendProductCoreDoesNotEmbedCustomerSpecificRules();
validateBackendProcessContractOwnership();
validateWorkflowTaskRevisionVisibilityContract();
validateCustomerConfigRepositoryContract();
validateYoyoosunRuntimeInjectionExample();
validateCustomerConfigReleaseOverlay();

console.log(
  `customer config boundaries ok: ${yoyoosunFieldNumberingConfig.customerKey}, field modules=${yoyoosunFieldNumberingConfig.fieldDisplayReview.length}, numbering rules=${yoyoosunFieldNumberingConfig.numberingRuleReview.length}, import config items=${yoyoosunImportConfig.configItems.length}, private validation=${yoyoosunImportConfig.privateValidation.status}, backend runtime files=${backendProductCoreRuntimeFileCount}`,
);
