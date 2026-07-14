import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function verifyGoTestJson(content, requiredPrefixes = []) {
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
  const runTests = new Set(runEvents.map(identity));
  const passedTests = new Set(eventsFor("pass").map(identity));
  const skippedIdentities = new Set(eventsFor("skip").map(identity));
  const failedIdentities = new Set(eventsFor("fail").map(identity));
  const skippedTests = [...skippedIdentities].map((key) => displayByIdentity.get(key)).sort();
  const failedTests = [...failedIdentities].map((key) => displayByIdentity.get(key)).sort();
  const unresolvedIdentities = [...runTests].filter(
    (key) =>
      !passedTests.has(key) && !skippedIdentities.has(key) && !failedIdentities.has(key),
  );
  const unresolvedTests = unresolvedIdentities
    .map((key) => displayByIdentity.get(key))
    .sort();
  const passedRunCount = [...runTests].filter((key) => passedTests.has(key)).length;

  const missingPrefixes = requiredPrefixes.filter(
    (prefix) => !runEvents.some((event) => event.Test.startsWith(prefix)),
  );
  const prefixesWithoutPass = requiredPrefixes.filter((prefix) => {
    const selected = runEvents.filter((event) => event.Test.startsWith(prefix));
    return selected.length > 0 && !selected.some((event) => passedTests.has(identity(event)));
  });

  return {
    ok:
      runTests.size > 0 &&
      missingPrefixes.length === 0 &&
      prefixesWithoutPass.length === 0 &&
      skippedTests.length === 0 &&
      failedTests.length === 0 &&
      unresolvedTests.length === 0,
    run: runTests.size,
    pass: passedRunCount,
    skip: skippedTests.length,
    fail: failedTests.length,
    missingPrefixes,
    prefixesWithoutPass,
    skippedTests,
    failedTests,
    unresolvedTests,
  };
}

function parseArgs(argv) {
  const options = { report: "", requiredPrefixes: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") options.report = argv[++index] || "";
    else if (arg === "--require-prefix") options.requiredPrefixes.push(argv[++index] || "");
    else if (arg === "--json") options.json = true;
    else throw new Error(`[qa:go-test-json] unsupported argument: ${arg}`);
  }
  if (!options.report) throw new Error("[qa:go-test-json] --report is required");
  if (options.requiredPrefixes.some((prefix) => !prefix)) {
    throw new Error("[qa:go-test-json] --require-prefix needs a non-empty value");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = verifyGoTestJson(readFileSync(options.report, "utf8"), options.requiredPrefixes);
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
