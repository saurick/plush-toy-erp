import assert from "node:assert/strict";
import test from "node:test";

import { verifyGoTestJson } from "./verify-go-test-json.mjs";

function lines(events) {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

test("go test JSON proof accepts required suites with no skip", () => {
  const result = verifyGoTestJson(
    lines([
      { Action: "run", Test: "TestPurchaseReturnPostgresFlow" },
      { Action: "pass", Test: "TestPurchaseReturnPostgresFlow" },
      { Action: "run", Test: "TestInventoryLotPostgresFlow" },
      { Action: "pass", Test: "TestInventoryLotPostgresFlow" },
    ]),
    ["TestPurchaseReturnPostgres", "TestInventoryLotPostgres"],
  );
  assert.equal(result.ok, true);
  assert.deepEqual({ run: result.run, pass: result.pass, skip: result.skip }, { run: 2, pass: 2, skip: 0 });
});

test("go test JSON proof rejects zero matches and all-skipped suites", () => {
  const zeroMatch = verifyGoTestJson("", ["TestPurchaseReturnPostgres"]);
  assert.equal(zeroMatch.ok, false);
  assert.deepEqual(zeroMatch.missingPrefixes, ["TestPurchaseReturnPostgres"]);

  const skipped = verifyGoTestJson(
    lines([
      { Action: "run", Test: "TestPurchaseReturnPostgresFlow" },
      { Action: "run", Test: "TestPurchaseReturnPostgresFlow/subtest" },
      { Action: "skip", Test: "TestPurchaseReturnPostgresFlow/subtest" },
      { Action: "pass", Test: "TestPurchaseReturnPostgresFlow" },
    ]),
    ["TestPurchaseReturnPostgres"],
  );
  assert.equal(skipped.ok, false);
  assert.deepEqual(skipped.skippedTests, ["TestPurchaseReturnPostgresFlow/subtest"]);
});

test("go test JSON proof excludes only exact caller-declared partition skips", () => {
  const result = verifyGoTestJson(
    lines([
      { Action: "run", Test: "TestOrdinaryFlow" },
      { Action: "pass", Test: "TestOrdinaryFlow" },
      { Action: "run", Test: "TestPurchaseReturnPostgresFlow" },
      { Action: "skip", Test: "TestPurchaseReturnPostgresFlow" },
    ]),
    [],
    { excludedSkipPattern: "^TestPurchaseReturnPostgresFlow$" },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    { run: result.run, pass: result.pass, skip: result.skip, excluded: result.excluded },
    { run: 1, pass: 1, skip: 0, excluded: 1 },
  );
  assert.deepEqual(result.excludedTests, ["TestPurchaseReturnPostgresFlow"]);
});

test("go test JSON proof still rejects a skipped test outside the exact exclusion", () => {
  const result = verifyGoTestJson(
    lines([
      { Action: "run", Test: "TestOrdinaryFlow" },
      { Action: "pass", Test: "TestOrdinaryFlow" },
      { Action: "run", Test: "TestUnexpectedSkip" },
      { Action: "skip", Test: "TestUnexpectedSkip" },
    ]),
    [],
    { excludedSkipPattern: "^TestPurchaseReturnPostgresFlow$" },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.skippedTests, ["TestUnexpectedSkip"]);
  assert.equal(result.excluded, 0);
});

test("go test JSON proof rejects an invalid exclusion regex", () => {
  assert.throws(
    () => verifyGoTestJson("", [], { excludedSkipPattern: "[" }),
    /invalid excluded skip pattern/u,
  );
});

test("go test JSON proof rejects malformed output", () => {
  assert.throws(() => verifyGoTestJson("not-json", []), /invalid JSON at line 1/u);
});

test("go test JSON proof rejects a run without a terminal summary", () => {
  const result = verifyGoTestJson(lines([{ Action: "run", Test: "TestStartedOnly" }]));
  assert.equal(result.ok, false);
  assert.deepEqual(result.unresolvedTests, ["TestStartedOnly"]);
});

test("go test JSON proof rejects an explicit test failure", () => {
  const result = verifyGoTestJson(
    lines([
      { Action: "run", Test: "TestFailure" },
      { Action: "fail", Test: "TestFailure" },
    ]),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedTests, ["TestFailure"]);
});

test("go test JSON proof keeps same-named tests separate by package", () => {
  const result = verifyGoTestJson(
    lines([
      { Action: "run", Package: "example/a", Test: "TestSharedName" },
      { Action: "pass", Package: "example/a", Test: "TestSharedName" },
      { Action: "run", Package: "example/b", Test: "TestSharedName" },
      { Action: "pass", Package: "example/b" },
    ]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.pass, 1);
  assert.deepEqual(result.unresolvedTests, ["example/b:TestSharedName"]);
});
