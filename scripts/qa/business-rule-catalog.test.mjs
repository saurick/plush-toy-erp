import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BUSINESS_RULES,
  BUSINESS_RULE_CATEGORIES,
  BUSINESS_RULE_DIAGRAMS,
  businessRuleTests,
  businessTestKey,
} from "./lib/business-rule-catalog.mjs";
import {
  GO_BUSINESS_SCENARIOS,
  CRITICAL_POSTGRES_TEST_PATTERN,
} from "./test-coverage-collect.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("critical rules resolve to real named tests in the existing gate partitions", () => {
  const ids = new Set();
  const partition = new RegExp(CRITICAL_POSTGRES_TEST_PATTERN, "u");
  for (const rule of BUSINESS_RULES) {
    assert(!ids.has(rule.id), `duplicate rule ${rule.id}`);
    ids.add(rule.id);
    assert(
      BUSINESS_RULE_CATEGORIES.some((item) => item.value === rule.category),
    );
    assert(rule.standard && rule.tests.length > 0);
    for (const target of rule.tests) {
      const source = readFileSync(path.join(root, target.file), "utf8");
      if (target.gate === "web") {
        assert(
          source.includes(`test('${target.name}'`),
          `missing ${businessTestKey(target)}`,
        );
        continue;
      }
      assert(
        source.includes(`func ${target.name}(`),
        `missing ${businessTestKey(target)} in ${target.file}`,
      );
      assert.equal(
        partition.test(target.name),
        target.gate === "postgres",
        `wrong gate for ${target.name}`,
      );
      if (target.gate === "server") {
        assert(
          GO_BUSINESS_SCENARIOS[rule.domain].some(
            (scenario) =>
              scenario.package === target.package &&
              scenario.testPrefix === target.name,
          ),
          `baseline omitted ${target.name}`,
        );
      }
    }
  }
  assert.equal(
    new Set(businessRuleTests("postgres").map(businessTestKey)).size,
    businessRuleTests("postgres").length,
  );
  assert.throws(() => businessRuleTests("unknown"));
});

test("rule diagrams stay identical in the strategy and workbench", () => {
  const strategy = readFileSync(
    path.join(root, "docs/product/自动化测试策略.md"),
    "utf8",
  );
  for (const diagram of Object.values(BUSINESS_RULE_DIAGRAMS)) {
    assert(
      strategy.includes("```mermaid\n" + diagram.chart + "\n```"),
      diagram.label,
    );
  }
});

test("formal gate commands enforce both named scenario sets", () => {
  const server = readFileSync(path.join(root, "scripts/qa/full.sh"), "utf8");
  const postgres = readFileSync(
    path.join(root, "scripts/purchase-receipt-pg.sh"),
    "utf8",
  );
  assert.match(server, /--business-rules server --kind go --label server-all/u);
  assert.match(
    postgres,
    /verify-go-test-json\.mjs[^\n]+--business-rules postgres/u,
  );
});
