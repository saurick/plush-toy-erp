import { existsSync, readFileSync } from "node:fs";
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

function currentOrBaselineSource(root, file) {
  const target = path.join(root, file);
  if (existsSync(target)) return readFileSync(target, "utf8");
  return runGit(root, ["show", `HEAD:${file}`]);
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

function dropIndexesRemovedWithTheirOnlyTrackedColumn(tokenOperations) {
  for (const [key, item] of tokenOperations) {
    if (
      item.kind !== "index" ||
      item.operations.size !== 1 ||
      !item.operations.has("drop")
    ) {
      continue;
    }
    const column = tokenOperations.get(`column:${item.token}`);
    if (
      column?.operations.size === 1 &&
      column.operations.has("drop")
    ) {
      // PostgreSQL drops a single-column index together with its removed
      // column. Atlas therefore emits only DROP COLUMN for this Ent diff.
      tokenOperations.delete(key);
    }
  }
}

function schemaDdlRequirements(root, file, range, untrackedFiles, entries) {
  const source = currentOrBaselineSource(root, file);
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
    dropIndexesRemovedWithTheirOnlyTrackedColumn(tokenOperations);
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

export function evaluateDbGuard({ root, range = "" }) {
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

  const entries = [];
  if (effectiveRange) entries.push(...nameStatus(root, [effectiveRange]));
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

  const newMigrations = new Set(
    entries
      .filter((entry) => entry.status === "A" && isMigrationSql(entry.path))
      .map((entry) => entry.path),
  );
  const immutableMigrationChanges = [];
  for (const entry of entries) {
    const paths = [entry.path, entry.oldPath].filter(Boolean);
    if (!paths.some(isMigrationSql)) continue;
    if (paths.some((file) => newMigrations.has(file))) continue;
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
  const structuralSchemaFiles = schemaFiles.filter((file) =>
    schemaDiffRequiresMigration(root, file, effectiveRange, untrackedFiles),
  );
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
      const requirements = schemaDdlRequirements(
        root,
        file,
        effectiveRange,
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

function printHelp() {
  console.log(`用法:
  node scripts/qa/db-guard.mjs

环境变量:
  SKIP_DB_GUARD=1    跳过本地检查
  QA_BASE_RANGE=...  指定 Git revision range
`);
}

function main() {
  if (process.argv.slice(2).some((arg) => arg === "-h" || arg === "--help")) {
    printHelp();
    return;
  }
  if (process.argv.length > 2) {
    throw new Error(`[qa:db-guard] unsupported arguments: ${process.argv.slice(2).join(" ")}`);
  }
  if (process.env.SKIP_DB_GUARD === "1") {
    console.log("[qa:db-guard] SKIP_DB_GUARD=1，跳过");
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = evaluateDbGuard({
    root,
    range: process.env.QA_BASE_RANGE || "",
  });
  if (!result.ok) {
    if (result.reason === "base-migration-modified") {
      console.error("[qa:db-guard] base 中已有 migration 不可修改、删除或重命名:");
    } else if (result.reason === "missing-atlas-sum") {
      console.error("[qa:db-guard] 新 migration 未同步 atlas.sum:");
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
