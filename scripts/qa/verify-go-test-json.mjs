import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { businessRuleTests, businessTestKey } from "./lib/business-rule-catalog.mjs";

function compileExcludedSkipPattern(source) {
  if (!source) return null;
  try {
    return new RegExp(source, "u");
  } catch {
    throw new Error("[qa:go-test-json] invalid excluded skip pattern");
  }
}

export function verifyGoTestJson(
  content,
  requiredPrefixes = [],
  { excludedSkipPattern = "", businessRules = "" } = {},
) {
  const excludedSkipRegex = compileExcludedSkipPattern(excludedSkipPattern);
  const events = [];
  for (const [index, line] of String(content).split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      throw new Error(`[qa:go-test-json] invalid JSON at line ${index + 1}`);
    }
  }

  const testEvents = events.filter((event) => event.Test);
  const identity = (event) => `${event.Package || ""}\0${event.Test}`;
  const display = (event) => (event.Package ? `${event.Package}:${event.Test}` : event.Test);
  const displayByIdentity = new Map(testEvents.map((event) => [identity(event), display(event)]));
  const eventsFor = (action) => testEvents.filter((event) => event.Action === action);
  const runEvents = eventsFor("run");
  const passedTests = new Set(eventsFor("pass").map(identity));
  const skippedEvents = eventsFor("skip");
  const excludedSkippedIdentities = new Set(
    skippedEvents
      .filter((event) => excludedSkipRegex?.test(event.Test))
      .map(identity),
  );
  const skippedIdentities = new Set(
    skippedEvents
      .filter((event) => !excludedSkippedIdentities.has(identity(event)))
      .map(identity),
  );
  const failedIdentities = new Set(eventsFor("fail").map(identity));
  const eligibleRunEvents = runEvents.filter(
    (event) => !excludedSkippedIdentities.has(identity(event)),
  );
  const eligibleRunTests = new Set(eligibleRunEvents.map(identity));
  const skippedTests = [...skippedIdentities].map((key) => displayByIdentity.get(key)).sort();
  const excludedTests = [...excludedSkippedIdentities]
    .map((key) => displayByIdentity.get(key))
    .sort();
  const failedTests = [...failedIdentities].map((key) => displayByIdentity.get(key)).sort();
  const unresolvedIdentities = [...eligibleRunTests].filter(
    (key) =>
      !passedTests.has(key) && !skippedIdentities.has(key) && !failedIdentities.has(key),
  );
  const unresolvedTests = unresolvedIdentities
    .map((key) => displayByIdentity.get(key))
    .sort();
  const passedRunCount = [...eligibleRunTests].filter((key) => passedTests.has(key)).length;

  const missingPrefixes = requiredPrefixes.filter(
    (prefix) => !eligibleRunEvents.some((event) => event.Test.startsWith(prefix)),
  );
  const prefixesWithoutPass = requiredPrefixes.filter((prefix) => {
    const selected = eligibleRunEvents.filter((event) => event.Test.startsWith(prefix));
    return selected.length > 0 && !selected.some((event) => passedTests.has(identity(event)));
  });
  const missingBusinessTests = businessRules
    ? businessRuleTests(businessRules).filter((test) => {
        const key = `${test.package}\0${test.name}`;
        return !eligibleRunTests.has(key) || !passedTests.has(key);
      }).map(businessTestKey)
    : [];

  return {
    ok:
      eligibleRunTests.size > 0 &&
      missingPrefixes.length === 0 &&
      prefixesWithoutPass.length === 0 &&
      skippedTests.length === 0 &&
      failedTests.length === 0 &&
      unresolvedTests.length === 0 &&
      missingBusinessTests.length === 0,
    ...(businessRules ? { missingBusinessTests } : {}),
    run: eligibleRunTests.size,
    pass: passedRunCount,
    skip: skippedTests.length,
    excluded: excludedTests.length,
    fail: failedTests.length,
    missingPrefixes,
    prefixesWithoutPass,
    skippedTests,
    excludedTests,
    failedTests,
    unresolvedTests,
  };
}

export function businessRuleTestResults(events, gate) {
  return businessRuleTests(gate).map((test) => {
    const selected = events.filter((event) => event.Package === test.package &&
      (event.Test === test.name || event.Test?.startsWith(`${test.name}/`)));
    const result = verifyGoTestJson(selected.map((event) => JSON.stringify(event)).join('\n'));
    const parentPassed = selected.some((event) => event.Test === test.name && event.Action === 'pass');
    const parentRan = selected.some((event) => event.Test === test.name && event.Action === 'run');
    return {
      id: businessTestKey(test),
      status: result.fail ? 'failed' : result.skip ? 'skipped' : result.ok && parentRan && parentPassed ? 'passed' : 'missing',
      counts: { executed: result.run, passed: result.pass, failed: result.fail, skipped: result.skip },
    };
  });
}

function parseArgs(argv) {
  const options = { report: "", requiredPrefixes: [], json: false, businessRules: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") options.report = argv[++index] || "";
    else if (arg === "--require-prefix") options.requiredPrefixes.push(argv[++index] || "");
    else if (arg === "--json") options.json = true;
    else if (arg === "--business-rules" && !options.businessRules) {
      options.businessRules = argv[++index] || "";
      businessRuleTests(options.businessRules);
    }
    else throw new Error(`[qa:go-test-json] unsupported argument: ${arg}`);
  }
  if (!options.report) throw new Error("[qa:go-test-json] --report is required");
  if (options.businessRules) businessRuleTests(options.businessRules);
  if (options.requiredPrefixes.some((prefix) => !prefix)) {
    throw new Error("[qa:go-test-json] --require-prefix needs a non-empty value");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = verifyGoTestJson(readFileSync(options.report, "utf8"), options.requiredPrefixes, { businessRules: options.businessRules });
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(
      `[qa:go-test-json] run=${result.run} pass=${result.pass} skip=${result.skip} fail=${result.fail}`,
    );
    for (const prefix of result.missingPrefixes) {
      console.error(`[qa:go-test-json] required suite did not run: ${prefix}`);
    }
    for (const prefix of result.prefixesWithoutPass) {
      console.error(`[qa:go-test-json] required suite has no passing test: ${prefix}`);
    }
    for (const testName of result.skippedTests) {
      console.error(`[qa:go-test-json] skipped: ${testName}`);
    }
    for (const testName of result.failedTests) {
      console.error(`[qa:go-test-json] failed: ${testName}`);
    }
    for (const testName of result.unresolvedTests) {
      console.error(`[qa:go-test-json] missing terminal summary: ${testName}`);
    }
    for (const testName of result.missingBusinessTests || []) {
      console.error(`[qa:go-test-json] required business test did not pass: ${testName}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
