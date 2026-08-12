import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readNullDelimited,
  resolveDefaultRange,
  runGit,
  validateGitRange,
} from "./lib/git-range.mjs";

const STRUCTURAL_SCHEMA_CHANGE =
  /^[+-].*(field\.|edge\.(?:To|From)\(|index\.|entsql\.Annotation|\bTable:\s*"|"[a-z0-9_]+"\s*:\s*"|\.(Unique|Optional|Nillable|Default|MaxLen|MinLen|Positive|NonNegative|SchemaType|StorageKey|Annotations|GoType|Enum|Values|NotEmpty|Match|Required|Field|Through)\()/mu;

const DETACHED_DDL_MODIFIER =
  /\.(?:Unique|Optional|Nillable|Default|MaxLen|MinLen|Positive|NonNegative|SchemaType|StorageKey|Annotations|GoType|Enum|Values|NotEmpty|Match|Required|Field|Through)\(/u;

const BUILDER_START =
  /\b(?:field\.[A-Za-z][A-Za-z0-9]*\(|index\.(?:Fields|Edges)\(|edge\.(?:To|From)\()/u;

const POSTGRES_IDENTIFIER_MAX_BYTES = 63;
const LEGACY_PROGRAMMABILITY_MIGRATION =
  "server/internal/data/model/migrate/20260714055825_customer_config_append_only_and_role_backfill.sql";
const LEGACY_PROGRAMMABILITY_OBJECTS = Object.freeze([
  ["function", "enforce_customer_config_revision_lifecycle"],
  ["function", "enforce_workflow_task_process_anchor_match"],
  ["function", "prevent_customer_config_revision_content_update"],
  ["function", "prevent_customer_config_revision_delete"],
  ["function", "protect_customer_config_projection"],
  ["trigger", "access_entitlements_immutable"],
  ["trigger", "customer_config_revision_content_immutable"],
  ["trigger", "customer_config_revision_delete_immutable"],
  ["trigger", "customer_config_revision_lifecycle_guard"],
  ["trigger", "deployment_module_states_immutable"],
  ["trigger", "role_profiles_immutable"],
  ["trigger", "work_pool_memberships_immutable"],
  ["trigger", "work_pools_immutable"],
  ["trigger", "workflow_task_process_anchor_match"],
]);
const PROGRAMMABILITY_SCAN_ROOTS = Object.freeze(["server", "scripts"]);
const PROGRAMMABILITY_SCAN_EXTENSIONS = new Set([
  ".cjs",
  ".go",
  ".js",
  ".mjs",
  ".sh",
  ".sql",
]);
const PROGRAMMABILITY_SCAN_EXCLUSIONS = new Set([
  "scripts/qa/db-guard.mjs",
  "scripts/qa/db-guard.test.mjs",
]);
const CREATE_PROGRAMMABILITY_OBJECT =
  /\bcreate\s+(?:or\s+replace\s+)?(?:(?:constraint|event)\s+)?(function|procedure|trigger)\s+"?([a-z_][a-z0-9_]*)"?/giu;
const EXECUTE_PROGRAMMABILITY_OBJECT =
  /\bexecute\s+(?:function|procedure)\b/iu;

function collectProgrammabilityFiles(root) {
  const files = [];
  const visit = (relativePath) => {
    const absolutePath = path.join(root, relativePath);
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      const child = path.posix.join(relativePath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (
        entry.isFile() &&
        PROGRAMMABILITY_SCAN_EXTENSIONS.has(path.extname(entry.name)) &&
        !PROGRAMMABILITY_SCAN_EXCLUSIONS.has(child)
      ) {
        files.push(child);
      }
    }
  };
  for (const relativePath of PROGRAMMABILITY_SCAN_ROOTS) {
    if (existsSync(path.join(root, relativePath))) visit(relativePath);
  }
  return files.sort();
}

function createdProgrammabilityObjects(source) {
  return [...source.matchAll(CREATE_PROGRAMMABILITY_OBJECT)].map((match) => [
    match[1].toLowerCase(),
    match[2].toLowerCase(),
  ]);
}

function sameProgrammabilityObjects(actual, expected) {
  const normalize = (values) =>
    values.map(([kind, name]) => `${kind}:${name}`).sort();
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

function legacyProgrammabilityRetired(root) {
  const migrationDir = path.join(
    root,
    "server/internal/data/model/migrate",
  );
  const cleanupSource = readdirSync(migrationDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sql") &&
        entry.name > path.basename(LEGACY_PROGRAMMABILITY_MIGRATION),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFileSync(path.join(migrationDir, entry.name), "utf8"))
    .join("\n");
  const missing = LEGACY_PROGRAMMABILITY_OBJECTS.filter(([kind, name]) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern =
      kind === "function"
        ? new RegExp(
            `\\bdrop\\s+function\\s+(?:if\\s+exists\\s+)?(?:public\\.)?"?${escaped}"?\\s*\\(`,
            "iu",
          )
        : new RegExp(
            `\\bdrop\\s+trigger\\s+(?:if\\s+exists\\s+)?"?${escaped}"?\\s+on\\b`,
            "iu",
          );
    return !pattern.test(cleanupSource);
  });
  return missing.map(([kind, name]) => `${kind}:${name}`);
}

export function evaluateDatabaseProgrammabilityPolicy(root) {
  const legacyPath = path.join(root, LEGACY_PROGRAMMABILITY_MIGRATION);
  if (existsSync(legacyPath)) {
    const legacyObjects = createdProgrammabilityObjects(
      readFileSync(legacyPath, "utf8"),
    );
    if (
      !sameProgrammabilityObjects(
        legacyObjects,
        LEGACY_PROGRAMMABILITY_OBJECTS,
      )
    ) {
      return {
        ok: false,
        reason: "legacy-programmability-contract-changed",
        files: [LEGACY_PROGRAMMABILITY_MIGRATION],
      };
    }
  }

  const violations = [];
  for (const relativePath of collectProgrammabilityFiles(root)) {
    if (relativePath === LEGACY_PROGRAMMABILITY_MIGRATION) continue;
    const source = readFileSync(path.join(root, relativePath), "utf8");
    if (
      createdProgrammabilityObjects(source).length > 0 ||
      EXECUTE_PROGRAMMABILITY_OBJECT.test(source)
    ) {
      violations.push(relativePath);
    }
  }
  if (violations.length > 0) {
    return {
      ok: false,
      reason: "database-programmability-forbidden",
      files: violations,
    };
  }

  if (existsSync(legacyPath)) {
    const missing = legacyProgrammabilityRetired(root);
    if (missing.length > 0) {
      return {
        ok: false,
        reason: "legacy-programmability-not-retired",
        files: [LEGACY_PROGRAMMABILITY_MIGRATION],
        missing,
      };
    }
  }
  return { ok: true };
}

function parseNameStatus(buffer) {
  const values = readNullDelimited(buffer);
  const entries = [];
  for (let index = 0; index < values.length; ) {
    const status = values[index++];
    const firstPath = values[index++];
    if (!status || !firstPath) {
      throw new Error("[qa:db-guard] malformed git name-status output");
    }
    if (/^[RC]/u.test(status)) {
      const secondPath = values[index++];
      if (!secondPath) {
        throw new Error("[qa:db-guard] malformed git rename/copy output");
      }
      entries.push({ status, oldPath: firstPath, path: secondPath });
    } else {
      entries.push({ status, path: firstPath });
    }
  }
  return entries;
}

function nameStatus(root, args) {
  return parseNameStatus(
    runGit(
      root,
      ["diff", "--name-status", "-z", "--find-renames", ...args, "--"],
      { encoding: null },
    ),
  );
}

function diffText(root, args, file, unified = 0) {
  return runGit(root, ["diff", `--unified=${unified}`, ...args, "--", file]);
}

function isMigrationSql(file) {
  return /^server\/internal\/data\/model\/migrate\/[^/]+\.sql$/u.test(file);
}

function isSchemaFile(file) {
  return /^server\/internal\/data\/model\/schema\//u.test(file);
}

function isGeneratedEntFile(file) {
  return /^server\/internal\/data\/model\/ent\//u.test(file);
}

function schemaDiffText(root, file, range, untrackedFiles, unified = 0) {
  let combined = "";
  if (range) combined += diffText(root, [range], file, unified);
  combined += diffText(root, [], file, unified);
  combined += diffText(root, ["--cached"], file, unified);

  if (untrackedFiles.has(file)) {
    combined += readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .map((line) => `+${line}`)
      .join("\n");
  }
  return combined;
}

function schemaDiffRequiresMigration(root, file, range, untrackedFiles) {
  return STRUCTURAL_SCHEMA_CHANGE.test(
    schemaDiffText(root, file, range, untrackedFiles),
  );
}

function toSnakeCase(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase();
}

function pluralizeTableName(value) {
  if (/[^aeiou]y$/u.test(value)) return `${value.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/u.test(value)) return `${value}es`;
  return `${value}s`;
}

function currentOrBaselineSource(root, file, range) {
  const target = path.join(root, file);
  if (existsSync(target)) return readFileSync(target, "utf8");
  return baselineSource(root, file, range);
}

function baselineRevision(root, range) {
  if (!range) return "HEAD";

  const threeDot = range.match(/^(.+)\.\.\.(.+)$/u);
  if (threeDot) {
    return runGit(root, ["merge-base", threeDot[1], threeDot[2]]).trim();
  }

  const twoDot = range.match(/^(.+)\.\.(.+)$/u);
  return twoDot ? twoDot[1] : range;
}

function baselineSource(root, file, range) {
  return runGit(root, ["show", `${baselineRevision(root, range)}:${file}`]);
}

function fieldBuilderExpression(source, start) {
  let index = start;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  let state = "code";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] || "";

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "double-quote" || state === "single-quote") {
      const delimiter = state === "double-quote" ? '"' : "'";
      if (char === "\\") {
        index += 2;
      } else {
        index += 1;
        if (char === delimiter) state = "code";
      }
      continue;
    }
    if (state === "raw-quote") {
      index += 1;
      if (char === "`") state = "code";
      continue;
    }

    if (char === "/" && next === "/") {
      state = "line-comment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }
    if (char === '"') {
      state = "double-quote";
      index += 1;
      continue;
    }
    if (char === "'") {
      state = "single-quote";
      index += 1;
      continue;
    }
    if (char === "`") {
      state = "raw-quote";
      index += 1;
      continue;
    }

    if (char === "(") parentheses += 1;
    else if (char === ")") parentheses -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets -= 1;
    else if (char === "{") braces += 1;
    else if (char === "}" && braces > 0) braces -= 1;
    else if (
      (char === "," || char === "}") &&
      parentheses === 0 &&
      brackets === 0 &&
      braces === 0
    ) {
      return source.slice(start, index);
    }

    index += 1;
  }
  return source.slice(start);
}

function normalizeGoBuilderChain(source) {
  let normalized = "";
  let index = 0;
  let state = "code";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] || "";

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "double-quote" || state === "single-quote") {
      normalized += char;
      if (char === "\\" && next) {
        normalized += next;
        index += 2;
      } else {
        const delimiter = state === "double-quote" ? '"' : "'";
        index += 1;
        if (char === delimiter) state = "code";
      }
      continue;
    }
    if (state === "raw-quote") {
      normalized += char;
      index += 1;
      if (char === "`") state = "code";
      continue;
    }

    if (char === "/" && next === "/") {
      state = "line-comment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }
    if (char === '"') state = "double-quote";
    else if (char === "'") state = "single-quote";
    else if (char === "`") state = "raw-quote";

    if (!/\s/u.test(char)) normalized += char;
    index += 1;
  }
  return normalized;
}

function fieldBuilderChains(source) {
  const chains = new Map();
  for (const match of source.matchAll(
    /\bfield\.[A-Za-z][A-Za-z0-9]*\(\s*"([a-z0-9_]+)"/gu,
  )) {
    chains.set(
      match[1],
      normalizeGoBuilderChain(fieldBuilderExpression(source, match.index)),
    );
  }
  return chains;
}

function dropUnchangedColumnOperations(
  root,
  baselineFile,
  currentFile,
  range,
  tokenOperations,
) {
  const addAndDropColumns = [...tokenOperations.entries()].filter(
    ([, item]) =>
      item.kind === "column" &&
      item.operations.has("add") &&
      item.operations.has("drop"),
  );
  if (addAndDropColumns.length === 0) return;

  const baselineChains = fieldBuilderChains(
    baselineSource(root, baselineFile, range),
  );
  const currentChains = fieldBuilderChains(
    readFileSync(path.join(root, currentFile), "utf8"),
  );
  for (const [key, item] of addAndDropColumns) {
    const baseline = baselineChains.get(item.token);
    const current = currentChains.get(item.token);
    if (baseline && current && baseline === current) tokenOperations.delete(key);
  }
}

function schemaTableName(source, file) {
  const explicit = source.match(/\bTable:\s*"([a-z0-9_]+)"/u)?.[1];
  if (explicit) return explicit;
  const typeName = source.match(/\btype\s+([A-Za-z][A-Za-z0-9]*)\s+struct\s*\{/u)?.[1];
  const fallbackName = path.basename(file, path.extname(file));
  const schemaName = typeName ? toSnakeCase(typeName) : fallbackName;
  if (!schemaName) throw new Error(`[qa:db-guard] cannot derive Ent schema from ${file}`);
  return pluralizeTableName(schemaName);
}

function changedSchemaLines(diff) {
  return diff
    .split("\n")
    .filter((line) => /^[+-](?![+-]{2})/u.test(line));
}

function diffHunks(diff) {
  const hunks = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) hunks.push(current);
    current = [];
  };
  for (const line of diff.split("\n")) {
    if (/^(?:diff --git|@@ )/u.test(line)) flush();
    if (/^(?: |\+|-)(?![+-]{2})/u.test(line)) current.push(line);
  }
  flush();
  return hunks;
}

function physicalTokenRequirements(source) {
  const requirements = new Map();
  const add = (token, kind) => requirements.set(`${kind}:${token}`, { token, kind });
  for (const match of source.matchAll(
    /\bfield\.[A-Za-z][A-Za-z0-9]*\(\s*"([a-z0-9_]+)"/gu,
  )) {
    add(match[1], "column");
  }
  for (const match of source.matchAll(/\.Field\(\s*"([a-z0-9_]+)"/gu)) {
    add(match[1], "column");
  }
  for (const match of source.matchAll(
    /\bedge\.Column\(\s*"([a-z0-9_]+)"/gu,
  )) {
    add(match[1], "column");
  }
  for (const indexMatch of source.matchAll(/\bindex\.Fields\(([^)]*)\)/gsu)) {
    for (const fieldMatch of indexMatch[1].matchAll(/"([a-z0-9_]+)"/gu)) {
      add(fieldMatch[1], "index");
    }
  }
  return [...requirements.values()];
}

function physicalTokens(source) {
  return [...new Set(physicalTokenRequirements(source).map(({ token }) => token))];
}

function namedCheckTokens(source) {
  return [...source.matchAll(/"([a-z0-9_]+)"\s*:\s*"/gu)].map(
    (match) => match[1],
  );
}

function builderStartIndex(hunk, changedIndex) {
  let start = -1;
  for (let index = changedIndex; index >= 0 && changedIndex - index <= 24; index -= 1) {
    const code = hunk[index].slice(1);
    if (BUILDER_START.test(code)) {
      start = index;
      break;
    }
  }
  return start;
}

function builderChain(hunk, changedIndex) {
  const start = builderStartIndex(hunk, changedIndex);
  if (start < 0) return "";

  let end = changedIndex;
  for (let index = changedIndex + 1; index < hunk.length && index - start <= 24; index += 1) {
    const code = hunk[index].slice(1);
    if (BUILDER_START.test(code)) break;
    end = index;
    if (/[,}]\s*$/u.test(code.trim()) && !/\.\s*$/u.test(code.trim())) break;
  }
  return hunk
    .slice(start, end + 1)
    .map((line) => line.slice(1))
    .join("\n");
}

function namedCheckExpressions(source) {
  const expressions = new Map();
  for (const match of source.matchAll(
    /"([a-z0-9_]+)"\s*:\s*"((?:\\.|[^"\\])*)"/gu,
  )) {
    expressions.set(match[1], match[2]);
  }
  return expressions;
}

function publicationEquivalentSchemaRequirements(
  root,
  file,
  publicationRange,
  requirements,
) {
  if (!publicationRange || requirements.length === 0) return requirements;

  let publishedSource;
  try {
    publishedSource = baselineSource(root, file, publicationRange);
  } catch {
    // Added, renamed or otherwise unresolved publication paths stay strict.
    return requirements;
  }
  const target = path.join(root, file);
  if (!existsSync(target)) return requirements;

  const currentSource = readFileSync(target, "utf8");
  if (publishedSource === currentSource) return [];

  const publishedChecks = namedCheckExpressions(publishedSource);
  const currentChecks = namedCheckExpressions(currentSource);
  const publishedFields = fieldBuilderChains(publishedSource);
  const currentFields = fieldBuilderChains(currentSource);
  const indexesUnchanged =
    JSON.stringify(indexFieldGroups(publishedSource).sort()) ===
    JSON.stringify(indexFieldGroups(currentSource).sort());
  const publishedTable = schemaTableName(publishedSource, file);
  const currentTable = schemaTableName(currentSource, file);

  return requirements.filter((requirement) => {
    const token = requirement.tokens.at(-1);
    if (requirement.kind === "check") {
      return !(
        publishedChecks.has(token) === currentChecks.has(token) &&
        publishedChecks.get(token) === currentChecks.get(token)
      );
    }
    if (
      requirement.kind === "column" &&
      publishedFields.has(token) &&
      currentFields.has(token)
    ) {
      return publishedFields.get(token) !== currentFields.get(token);
    }
    if (requirement.kind === "index" && indexesUnchanged) return false;
    if (requirement.kind === "table" && requirement.operation === "rename-table") {
      return publishedTable !== currentTable;
    }
    return true;
  });
}

function dropUnchangedCheckOperations(
  root,
  baselineFile,
  currentFile,
  range,
  tokenOperations,
) {
  const baselineChecks = namedCheckExpressions(
    baselineSource(root, baselineFile, range),
  );
  const currentChecks = namedCheckExpressions(
    readFileSync(path.join(root, currentFile), "utf8"),
  );
  for (const [key, item] of tokenOperations) {
    if (
      item.kind !== "check" ||
      !item.operations.has("add") ||
      !item.operations.has("drop")
    ) {
      continue;
    }
    const baseline = baselineChecks.get(item.token);
    const current = currentChecks.get(item.token);
    if (baseline !== undefined && baseline === current) {
      tokenOperations.delete(key);
    }
  }
}

function indexFieldGroups(source) {
  const groups = [];
  for (const indexMatch of source.matchAll(/\bindex\.Fields\(([^)]*)\)/gsu)) {
    const fields = [
      ...indexMatch[1].matchAll(/"([a-z0-9_]+)"/gu),
    ].map((match) => match[1]);
    if (fields.length > 0) groups.push(fields);
  }
  return groups;
}

function removedIndexFieldGroups(baseline, current) {
  const currentCounts = new Map();
  for (const fields of indexFieldGroups(current)) {
    const signature = JSON.stringify(fields);
    currentCounts.set(signature, (currentCounts.get(signature) || 0) + 1);
  }

  const removed = [];
  for (const fields of indexFieldGroups(baseline)) {
    const signature = JSON.stringify(fields);
    const remaining = currentCounts.get(signature) || 0;
    if (remaining > 0) {
      currentCounts.set(signature, remaining - 1);
    } else {
      removed.push(fields);
    }
  }
  return removed;
}

function dropIndexesRemovedWithDroppedColumns(
  root,
  baselineFile,
  currentFile,
  range,
  tokenOperations,
) {
  const droppedColumns = new Set(
    [...tokenOperations.values()]
      .filter(
        (item) =>
          item.kind === "column" &&
          item.operations.size === 1 &&
          item.operations.has("drop"),
      )
      .map((item) => item.token),
  );
  if (droppedColumns.size === 0) return;

  const automaticallyDroppedIndexTokens = new Set();
  const explicitlyDroppedIndexTokens = new Set();
  const removedIndexes = removedIndexFieldGroups(
    baselineSource(root, baselineFile, range),
    readFileSync(path.join(root, currentFile), "utf8"),
  );
  for (const fields of removedIndexes) {
    const destination = fields.some((field) => droppedColumns.has(field))
      ? automaticallyDroppedIndexTokens
      : explicitlyDroppedIndexTokens;
    for (const field of fields) destination.add(field);
  }

  for (const [key, item] of tokenOperations) {
    if (
      item.kind !== "index" ||
      item.operations.size !== 1 ||
      !item.operations.has("drop") ||
      !automaticallyDroppedIndexTokens.has(item.token) ||
      explicitlyDroppedIndexTokens.has(item.token)
    ) {
      continue;
    }
    // PostgreSQL drops every index that depends on a removed column, including
    // composite indexes. Atlas therefore omits a redundant DROP INDEX. Keep a
    // shared token when another removed index still needs explicit DDL proof.
    tokenOperations.delete(key);
  }
}

function schemaDdlRequirements(root, file, range, untrackedFiles, entries) {
  const source = currentOrBaselineSource(root, file, range);
  const table = schemaTableName(source, file);
  const zeroContext = schemaDiffText(root, file, range, untrackedFiles);
  const changedLines = changedSchemaLines(zeroContext);
  const tokenOperations = new Map();
  const ambiguous = [];
  const addOperation = (token, kind, operation) => {
    const key = `${kind}:${token}`;
    if (!tokenOperations.has(key)) {
      tokenOperations.set(key, { token, kind, operations: new Set() });
    }
    tokenOperations.get(key).operations.add(operation);
  };

  for (const line of changedLines) {
    const operation = line[0] === "+" ? "add" : "drop";
    const code = line.slice(1);
    for (const { token, kind } of physicalTokenRequirements(code)) {
      addOperation(token, kind, operation);
    }
    for (const token of namedCheckTokens(code)) {
      addOperation(token, "check", operation);
    }
  }

  for (const hunk of diffHunks(
    schemaDiffText(root, file, range, untrackedFiles, 24),
  )) {
    for (const [index, line] of hunk.entries()) {
      if (!/^[+-]/u.test(line) || !DETACHED_DDL_MODIFIER.test(line.slice(1))) {
        continue;
      }
      const start = builderStartIndex(hunk, index);
      if (start >= 0 && hunk[start][0] === line[0]) {
        // The whole builder was added or removed; its physical operation already
        // carries the DDL requirement. Detached modifiers only mean "modify"
        // when the builder itself is unchanged context.
        continue;
      }
      const chain = builderChain(hunk, index);
      const tokens = physicalTokens(chain);
      if (tokens.length === 0) {
        ambiguous.push(line.slice(1).trim() || "detached Ent modifier");
        continue;
      }
      const kind = /\bindex\.(?:Fields|Edges)\(/u.test(chain)
        ? "index"
        : /\bedge\.(?:To|From)\(/u.test(chain)
          ? "edge"
          : "column";
      for (const token of tokens) addOperation(token, kind, "modify");
    }
  }

  const statusEntries = entries.filter(
    (entry) => entry.path === file || entry.oldPath === file,
  );
  const newlyAdded = statusEntries.some(
    (entry) => entry.status === "A" && entry.path === file,
  );
  const deleted = statusEntries.some(
    (entry) => entry.status === "D" && entry.path === file,
  );
  let baselineFile = file;
  if (!newlyAdded && !deleted) {
    baselineFile =
      statusEntries.find((entry) => entry.path === file && entry.oldPath)
        ?.oldPath || file;
    dropUnchangedColumnOperations(
      root,
      baselineFile,
      file,
      range,
      tokenOperations,
    );
    dropUnchangedCheckOperations(
      root,
      baselineFile,
      file,
      range,
      tokenOperations,
    );
    dropIndexesRemovedWithDroppedColumns(
      root,
      baselineFile,
      file,
      range,
      tokenOperations,
    );
  }
  const requirements = [];
  const allPhysicalTokens = [
    ...new Set([...tokenOperations.values()].map(({ token }) => token)),
  ].sort();

  if (newlyAdded) {
    requirements.push({
      operation: "create-table",
      kind: "table",
      tokens: [table, ...allPhysicalTokens],
      detail: "new Ent schema",
    });
    return requirements;
  }
  if (deleted) {
    requirements.push({
      operation: "drop-table",
      kind: "table",
      tokens: [table],
      detail: "removed Ent schema",
    });
    return requirements;
  }

  const baselineTable = schemaTableName(
    baselineSource(root, baselineFile, range),
    baselineFile,
  );
  if (baselineTable !== table) {
    requirements.push({
      operation: "rename-table",
      kind: "table",
      tokens: [baselineTable, table],
      detail: "Ent table annotation changed",
    });
  }

  for (const [, item] of [...tokenOperations].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const { token, kind, operations } = item;
    let operation;
    if (operations.has("modify") || (operations.has("add") && operations.has("drop"))) {
      operation = "modify";
    } else if (operations.has("add")) {
      operation = "add";
    } else {
      operation = "drop";
    }
    requirements.push({
      operation,
      kind,
      tokens: [table, token],
      detail: `${operation} ${token}`,
    });
  }
  for (const detail of ambiguous) {
    requirements.push({
      operation: "ambiguous",
      kind: "ambiguous",
      tokens: [table],
      detail,
    });
  }
  return requirements;
}

function sqlCodeStatements(source) {
  const statements = [];
  let current = "";
  let index = 0;
  let state = "code";
  let dollarTag = "";
  let blockDepth = 0;

  const pushStatement = () => {
    const normalized = current.trim().toLowerCase();
    if (normalized) statements.push(normalized);
    current = "";
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] || "";
    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        current += "\n";
      } else {
        current += " ";
      }
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        current += "  ";
        index += 2;
      } else if (char === "*" && next === "/") {
        blockDepth -= 1;
        current += "  ";
        index += 2;
        if (blockDepth === 0) state = "code";
      } else {
        current += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (char === "'" && next === "'") {
        current += "  ";
        index += 2;
      } else if (char === "'") {
        current += " ";
        state = "code";
        index += 1;
      } else {
        current += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, index)) {
        current += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "code";
      } else {
        current += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      current += "  ";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      current += "  ";
      index += 2;
      continue;
    }
    if (char === "'") {
      state = "single-quote";
      current += " ";
      index += 1;
      continue;
    }
    if (char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u);
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        current += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        continue;
      }
    }
    if (char === ";") {
      pushStatement();
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  pushStatement();
  return statements;
}

const TRANSACTION_INCOMPATIBLE_MIGRATION_SQL =
  /\b(?:create|drop)\s+index\s+concurrently\b|\bvacuum\b|\balter\s+system\b|\b(?:create|drop)\s+database\b/iu;
const HIGH_GROWTH_TABLE =
  /\b(?:inventory_txns|workflow_task_events|production_order_events|production_wip_events|runtime_audit_events)\b/iu;
const MIGRATION_DDL =
  /\b(?:create|alter|drop|truncate|comment\s+on|grant|revoke)\b/iu;
const MIGRATION_DML = /\b(?:insert\s+into|update|delete\s+from|merge\s+into)\b/iu;
const REQUIRED_RISK_METADATA = Object.freeze([
  "migration-risk",
  "affected-table",
  "expected-lock",
  "preflight",
  "recovery",
  "maintenance-required",
]);

function migrationRiskReasons(statements) {
  const joined = statements.join("\n");
  const reasons = [];
  if (/\bdrop\s+table\b/iu.test(joined)) reasons.push("drop-table");
  if (/\bdrop\s+column\b/iu.test(joined)) reasons.push("drop-column");
  if (/\balter\s+column\b[\s\S]*\btype\b/iu.test(joined)) {
    reasons.push("alter-column-type");
  }
  if (/\balter\s+column\b[\s\S]*\bset\s+not\s+null\b/iu.test(joined)) {
    reasons.push("set-not-null");
  }
  if (
    /\badd\s+(?:column\s+)?[^;\n]*\bnot\s+null\b[^;\n]*\bdefault\b|\badd\s+(?:column\s+)?[^;\n]*\bdefault\b[^;\n]*\bnot\s+null\b/iu.test(
      joined,
    )
  ) {
    reasons.push("add-not-null-default");
  }
  if (
    statements.some(
      (statement) =>
        /\balter\s+table\b/iu.test(statement) &&
        /\badd\s+constraint\b/iu.test(statement) &&
        /\b(?:foreign\s+key|check\s*\()/iu.test(statement) &&
        !/\bnot\s+valid\b/iu.test(statement),
    )
  ) {
    reasons.push("validated-constraint-on-existing-table");
  }
  if (/\bvalidate\s+constraint\b/iu.test(joined)) {
    reasons.push("validate-constraint");
  }
  if (
    statements.some(
      (statement) =>
        /\bcreate\s+(?:unique\s+)?index\b/iu.test(statement) &&
        /\bon\s+/iu.test(statement) &&
        HIGH_GROWTH_TABLE.test(statement),
    )
  ) {
    reasons.push("high-growth-table-index");
  }
  if (
    statements.some((statement) => MIGRATION_DDL.test(statement)) &&
    statements.some((statement) => MIGRATION_DML.test(statement))
  ) {
    reasons.push("ddl-dml-mixed");
  }
  return [...new Set(reasons)].sort();
}

function migrationRiskMetadata(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*--\s*([a-z-]+):\s*(.*?)\s*$/u);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

export function evaluateMigrationRiskPolicy({ root, files }) {
  const violations = [];
  const transactionIncompatible = [];
  for (const file of [...files].sort()) {
    const target = path.join(root, file);
    if (!existsSync(target)) continue;
    const source = readFileSync(target, "utf8");
    const statements = sqlCodeStatements(source);
    if (statements.some((statement) => TRANSACTION_INCOMPATIBLE_MIGRATION_SQL.test(statement))) {
      transactionIncompatible.push(file);
      continue;
    }
    const reasons = migrationRiskReasons(statements);
    if (reasons.length === 0) continue;

    const metadata = migrationRiskMetadata(source);
    const missing = REQUIRED_RISK_METADATA.filter(
      (key) => !String(metadata.get(key) || "").trim(),
    );
    if (
      metadata.has("migration-risk") &&
      !/^(?:maintenance|online)$/u.test(metadata.get("migration-risk"))
    ) {
      missing.push("migration-risk(valid: maintenance|online)");
    }
    if (
      metadata.has("maintenance-required") &&
      !/^(?:true|false)$/u.test(metadata.get("maintenance-required"))
    ) {
      missing.push("maintenance-required(valid: true|false)");
    }
    const preflight = String(metadata.get("preflight") || "");
    if (
      preflight &&
      (!/^scripts\/qa\/[A-Za-z0-9._/-]+$/u.test(preflight) ||
        !existsSync(path.join(root, preflight)))
    ) {
      missing.push("preflight(existing scripts/qa path)");
    }
    if (missing.length > 0) {
      violations.push({ file, reasons, missing: [...new Set(missing)].sort() });
    }
  }
  if (transactionIncompatible.length > 0) {
    return {
      ok: false,
      reason: "transaction-incompatible-migration",
      files: transactionIncompatible,
    };
  }
  if (violations.length > 0) {
    return {
      ok: false,
      reason: "migration-risk-metadata-missing",
      files: violations.map((violation) => violation.file),
      violations,
    };
  }
  return { ok: true };
}

function containsSqlIdentifier(source, identifier) {
  let physicalIdentifier = "";
  for (const character of identifier) {
    if (
      Buffer.byteLength(`${physicalIdentifier}${character}`, "utf8") >
      POSTGRES_IDENTIFIER_MAX_BYTES
    ) {
      break;
    }
    physicalIdentifier += character;
  }
  const escaped = physicalIdentifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, "u").test(
    source,
  );
}

function matchesDdlOperation(statement, { operation, kind }) {
  if (operation === "create-table") return /\bcreate\s+table\b/u.test(statement);
  if (operation === "drop-table") return /\bdrop\s+table\b/u.test(statement);
  if (operation === "rename-table") return /\brename\s+to\b/u.test(statement);
  if (operation === "add") {
    if (kind === "column") return /\badd\s+column\b/u.test(statement);
    if (kind === "index") {
      return /\bcreate\s+(?:unique\s+)?index\b/u.test(statement);
    }
    if (kind === "check") {
      return (
        /\badd\s+constraint\b/u.test(statement) &&
        /\bcheck\s*\(/u.test(statement)
      );
    }
    if (kind === "edge") {
      return (
        /\badd\s+constraint\b/u.test(statement) &&
        /\bforeign\s+key\b/u.test(statement)
      );
    }
    return false;
  }
  if (operation === "drop") {
    if (kind === "column") return /\bdrop\s+column\b/u.test(statement);
    if (kind === "index") return /\bdrop\s+index\b/u.test(statement);
    if (kind === "check" || kind === "edge") {
      return /\bdrop\s+constraint\b/u.test(statement);
    }
    return false;
  }
  if (operation === "modify") {
    if (kind === "index") {
      return /\b(?:create\s+(?:unique\s+)?index|drop\s+index)\b/u.test(statement);
    }
    if (kind === "check") {
      return /\b(?:add\s+constraint|drop\s+constraint)\b/u.test(statement);
    }
    if (kind === "edge") {
      return /\b(?:alter\s+column|add\s+constraint|drop\s+constraint|create\s+(?:unique\s+)?index|drop\s+index)\b/u.test(
        statement,
      );
    }
    return /\b(?:alter\s+column|rename\s+column|add\s+constraint|drop\s+constraint|create\s+(?:unique\s+)?index|drop\s+index)\b/u.test(
      statement,
    );
  }
  return false;
}

function statementProvesRequirement(statement, requirement) {
  return (
    matchesDdlOperation(statement, requirement) &&
    requirement.tokens.every((token) => containsSqlIdentifier(statement, token))
  );
}

export function evaluateDbGuard({ root, range = "", indexTransition = false }) {
  const modelDir = path.join(root, "server/internal/data/model");
  try {
    runGit(root, ["rev-parse", "--show-toplevel"]);
  } catch (error) {
    throw new Error(`[qa:db-guard] repository check failed: ${error.message}`);
  }
  if (!existsSync(modelDir)) {
    throw new Error(`[qa:db-guard] required model directory is missing: ${modelDir}`);
  }

  const effectiveRange = range || resolveDefaultRange(root);
  if (effectiveRange) validateGitRange(root, effectiveRange);
  const publicationEntries =
    indexTransition && effectiveRange ? nameStatus(root, [effectiveRange]) : [];
  const transitionRange = indexTransition ? "HEAD...HEAD" : effectiveRange;
  if (transitionRange) validateGitRange(root, transitionRange);
  const programmability = evaluateDatabaseProgrammabilityPolicy(root);
  if (!programmability.ok) {
    return {
      ...programmability,
      range: effectiveRange,
    };
  }

  const entries = [];
  if (transitionRange) entries.push(...nameStatus(root, [transitionRange]));
  entries.push(...nameStatus(root, []));
  entries.push(...nameStatus(root, ["--cached"]));

  const untrackedFiles = new Set(
    readNullDelimited(
      runGit(
        root,
        [
          "ls-files",
          "--others",
          "--exclude-standard",
          "-z",
          "--",
          "server/internal/data/model/schema",
          "server/internal/data/model/migrate",
        ],
        { encoding: null },
      ),
    ),
  );
  for (const file of untrackedFiles) entries.push({ status: "A", path: file });

  const changedFiles = new Set();
  for (const entry of entries) {
    changedFiles.add(entry.path);
    if (entry.oldPath) changedFiles.add(entry.oldPath);
  }
  if (changedFiles.size === 0) {
    return { ok: true, skipped: true, range: effectiveRange, changedFiles: [] };
  }

  const addedMigrations = new Set(
    entries
      .filter((entry) => entry.status === "A" && isMigrationSql(entry.path))
      .map((entry) => entry.path),
  );
  const unpublishedMigrations = new Set(
    publicationEntries
      .filter((entry) => entry.status === "A" && isMigrationSql(entry.path))
      .map((entry) => entry.path),
  );
  const modifiedUnpublishedMigrations = new Set(
    entries
      .filter(
        (entry) =>
          entry.status === "M" &&
          isMigrationSql(entry.path) &&
          unpublishedMigrations.has(entry.path),
      )
      .map((entry) => entry.path),
  );
  const newMigrations = new Set([
    ...addedMigrations,
    ...modifiedUnpublishedMigrations,
  ]);
  const immutableMigrationChanges = [];
  for (const entry of entries) {
    const paths = [entry.path, entry.oldPath].filter(Boolean);
    if (!paths.some(isMigrationSql)) continue;
    if (entry.status === "A" && paths.some((file) => addedMigrations.has(file))) {
      continue;
    }
    if (
      indexTransition &&
      entry.status === "M" &&
      paths.every((file) => unpublishedMigrations.has(file))
    ) {
      continue;
    }
    if (/^[MDRCT]/u.test(entry.status)) {
      immutableMigrationChanges.push(
        entry.oldPath ? `${entry.status}:${entry.oldPath}->${entry.path}` : `${entry.status}:${entry.path}`,
      );
    }
  }
  if (immutableMigrationChanges.length > 0) {
    return {
      ok: false,
      reason: "base-migration-modified",
      files: [...new Set(immutableMigrationChanges)].sort(),
      range: effectiveRange,
    };
  }

  const schemaFiles = [...changedFiles].filter(isSchemaFile);
  const schemaRequirements = new Map();
  const structuralSchemaFiles = schemaFiles.filter((file) => {
    if (!schemaDiffRequiresMigration(root, file, transitionRange, untrackedFiles)) {
      return false;
    }
    const requirements = schemaDdlRequirements(
      root,
      file,
      transitionRange,
      untrackedFiles,
      entries,
    );
    const netRequirements = indexTransition
      ? publicationEquivalentSchemaRequirements(
          root,
          file,
          effectiveRange,
          requirements,
        )
      : requirements;
    schemaRequirements.set(file, netRequirements);
    return requirements.length === 0 || netRequirements.length > 0;
  });
  const generatedEntChanged = [...changedFiles].some(isGeneratedEntFile);
  const schemaRequiresMigration = structuralSchemaFiles.length > 0;
  const needsMigration = schemaRequiresMigration || (generatedEntChanged && schemaFiles.length === 0);

  if (needsMigration && newMigrations.size === 0) {
    return {
      ok: false,
      reason: "missing-new-migration",
      files: schemaFiles,
      range: effectiveRange,
    };
  }

  const atlasSumChanged = changedFiles.has(
    "server/internal/data/model/migrate/atlas.sum",
  );
  if (newMigrations.size > 0 && !atlasSumChanged) {
    return {
      ok: false,
      reason: "missing-atlas-sum",
      files: [...newMigrations].sort(),
      range: effectiveRange,
    };
  }

  if (generatedEntChanged && schemaFiles.length === 0) {
    return {
      ok: false,
      reason: "generated-ent-without-schema-proof",
      files: [...changedFiles].filter(isGeneratedEntFile).sort(),
      range: effectiveRange,
    };
  }

  if (structuralSchemaFiles.length > 0) {
    const migrationStatements = sqlCodeStatements(
      [...newMigrations]
        .sort()
        .map((file) => {
          const target = path.join(root, file);
          if (!existsSync(target)) {
            throw new Error(`[qa:db-guard] new migration is missing from worktree: ${file}`);
          }
          return readFileSync(target, "utf8");
        })
        .join("\n"),
    );
    const proofs = structuralSchemaFiles.sort().map((file) => {
      const requirements =
        schemaRequirements.get(file) ||
        schemaDdlRequirements(
          root,
          file,
          transitionRange,
          untrackedFiles,
          entries,
        );
      const missingRequirements = requirements.filter(
        (requirement) =>
          !migrationStatements.some((statement) =>
            statementProvesRequirement(statement, requirement),
          ),
      );
      return {
        file,
        requiredTokens: [
          ...new Set(requirements.flatMap((requirement) => requirement.tokens)),
        ].sort(),
        missingTokens: [
          ...new Set(
            missingRequirements.flatMap((requirement) => requirement.tokens),
          ),
        ].sort(),
        missingRequirements,
      };
    });
    const missingProofs = proofs.filter(
      (proof) => proof.missingRequirements.length > 0,
    );
    if (missingProofs.length > 0) {
      return {
        ok: false,
        reason: "schema-migration-proof-missing",
        files: missingProofs.map((proof) => proof.file),
        proofs: missingProofs,
        range: effectiveRange,
      };
    }
  }

  return {
    ok: true,
    skipped: false,
    range: effectiveRange,
    changedFiles: [...changedFiles].sort(),
    newMigrations: [...newMigrations].sort(),
  };
}

export function evaluateDbGuardWithMigrationRisk(options) {
  const result = evaluateDbGuard(options);
  if (!result.ok || (result.newMigrations || []).length === 0) return result;
  const migrationRisk = evaluateMigrationRiskPolicy({
    root: options.root,
    files: result.newMigrations,
  });
  if (migrationRisk.ok) return result;
  return {
    ...migrationRisk,
    range: result.range,
  };
}

function printHelp() {
  console.log(`用法:
  node scripts/qa/db-guard.mjs [--index-transition]

环境变量:
  SKIP_DB_GUARD=1    跳过本地检查
  QA_BASE_RANGE=...  指定 Git revision range
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === "-h" || arg === "--help")) {
    printHelp();
    return;
  }
  const indexTransition = args.includes("--index-transition");
  const unsupported = args.filter((arg) => arg !== "--index-transition");
  if (unsupported.length > 0) {
    throw new Error(`[qa:db-guard] unsupported arguments: ${unsupported.join(" ")}`);
  }
  if (process.env.SKIP_DB_GUARD === "1") {
    console.log("[qa:db-guard] SKIP_DB_GUARD=1，跳过");
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = evaluateDbGuardWithMigrationRisk({
    root,
    range: process.env.QA_BASE_RANGE || "",
    indexTransition,
  });
  if (!result.ok) {
    if (result.reason === "base-migration-modified") {
      console.error("[qa:db-guard] base 中已有 migration 不可修改、删除或重命名:");
    } else if (result.reason === "database-programmability-forbidden") {
      console.error(
        "[qa:db-guard] 禁止新增数据库 Function、Procedure、非内部 Trigger 或其执行语句:",
      );
    } else if (result.reason === "legacy-programmability-contract-changed") {
      console.error(
        "[qa:db-guard] 冻结历史 migration 的数据库可编程对象清单发生变化:",
      );
    } else if (result.reason === "legacy-programmability-not-retired") {
      console.error(
        "[qa:db-guard] 冻结历史 migration 的数据库可编程对象缺少后续精确退出:",
      );
      for (const item of result.missing || []) console.error(`  - ${item}`);
    } else if (result.reason === "missing-atlas-sum") {
      console.error("[qa:db-guard] 新 migration 未同步 atlas.sum:");
    } else if (result.reason === "transaction-incompatible-migration") {
      console.error(
        "[qa:db-guard] 默认 tx-mode=all 禁止直接加入非事务 migration；请拆成专项执行合同:",
      );
    } else if (result.reason === "migration-risk-metadata-missing") {
      console.error("[qa:db-guard] 风险 migration 缺少完整的锁、预检和恢复元数据:");
      for (const violation of result.violations || []) {
        console.error(`  - ${violation.file}`);
        console.error(`    risks: ${violation.reasons.join(", ")}`);
        console.error(`    missing: ${violation.missing.join(", ")}`);
      }
      process.exitCode = 1;
      return;
    } else if (result.reason === "schema-migration-proof-missing") {
      console.error("[qa:db-guard] 以下 schema 缺少逐项 versioned DDL proof:");
      for (const proof of result.proofs || []) {
        console.error(`  - ${proof.file}`);
        console.error(`    missing: ${proof.missingTokens.join(", ")}`);
      }
      console.error(
        "[qa:db-guard] 静态 proof 不能替代冻结后的 Ent/Atlas generate 零漂移与 fresh/upgrade 验证",
      );
      process.exitCode = 1;
      return;
    } else if (result.reason === "generated-ent-without-schema-proof") {
      console.error("[qa:db-guard] generated Ent 发生变化，但没有对应 schema proof:");
    } else {
      console.error("[qa:db-guard] 检测到 schema/ent 结构变更但没有新增 migration:");
    }
    for (const file of result.files || []) console.error(`  - ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.skipped ? "[qa:db-guard] 未检测到变更，跳过" : "[qa:db-guard] 通过");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
