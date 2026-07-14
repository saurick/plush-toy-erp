import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from "./index.mjs";

const customersRoot = import.meta.dirname;

test("customer package index: lists every tracked package in stable order", () => {
  assert.deepEqual(listCustomerPackageKeys(), [
    "demo",
    "reference-customer",
    "yoyoosun",
  ]);

  const packageDirectories = readdirSync(customersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      readdirSync(path.join(customersRoot, entry.name)).includes(
        "customerPackage.mjs",
      ),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(listCustomerPackageKeys(), packageDirectories);
});

test("customer package index: registered keys match package identity", () => {
  const packageKeys = new Set();
  for (const customerKey of listCustomerPackageKeys()) {
    const customerPackage = getCustomerPackage(customerKey);
    assert(customerPackage);
    assert.equal(customerPackage.customerKey, customerKey);
    assert.equal(
      customerPackage.packageKey.startsWith(`${customerKey}-`),
      true,
    );
    assert.match(customerPackage.packageKey, /-package-v[1-9][0-9]*$/u);
    assert.equal(packageKeys.has(customerPackage.packageKey), false);
    packageKeys.add(customerPackage.packageKey);
  }
  assert.equal(getCustomerPackage("unknown-customer"), null);
  assert.equal(getCustomerPackage("../yoyoosun"), null);
});
