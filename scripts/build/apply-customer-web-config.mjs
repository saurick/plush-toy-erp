#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    customer: process.env.ERP_CUSTOMER_KEY || "",
    configRoot: path.resolve(process.cwd(), "config"),
    webBuildDir: path.resolve(process.cwd(), "web", "build"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--customer") {
      options.customer = next || "";
      index += 1;
    } else if (arg === "--config-root") {
      options.configRoot = path.resolve(next || "");
      index += 1;
    } else if (arg === "--web-build-dir") {
      options.webBuildDir = path.resolve(next || "");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.customer = String(options.customer || "").trim();
  return options;
}

function assertPathExists(targetPath, description) {
  if (!existsSync(targetPath)) {
    throw new Error(`${description} does not exist: ${targetPath}`);
  }
}

export function applyCustomerWebConfig({
  customer,
  configRoot,
  webBuildDir,
} = {}) {
  const normalizedCustomer = String(customer || "").trim();
  if (!normalizedCustomer) {
    return {
      applied: false,
      reason: "no customer selected",
    };
  }

  const customerDir = path.join(configRoot, "customers", normalizedCustomer);
  const customerConfigPath = path.join(
    customerDir,
    "customer-config.example.js",
  );
  const customerAssetsDir = path.join(customerDir, "assets");
  const targetConfigPath = path.join(webBuildDir, "customer-config.js");
  const targetAssetsDir = path.join(
    webBuildDir,
    "customer-assets",
    normalizedCustomer,
  );

  assertPathExists(customerConfigPath, "customer web config");
  assertPathExists(customerAssetsDir, "customer web assets");
  assertPathExists(webBuildDir, "web build directory");

  mkdirSync(path.dirname(targetConfigPath), { recursive: true });
  mkdirSync(targetAssetsDir, { recursive: true });
  cpSync(customerConfigPath, targetConfigPath);
  cpSync(customerAssetsDir, targetAssetsDir, { recursive: true });

  return {
    applied: true,
    customer: normalizedCustomer,
    customerConfigPath,
    targetConfigPath,
    targetAssetsDir,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = applyCustomerWebConfig(parseArgs(process.argv.slice(2)));
  if (result.applied) {
    process.stdout.write(
      `[apply-customer-web-config] applied customer=${result.customer} target=${result.targetConfigPath}\n`,
    );
  } else {
    process.stdout.write(
      `[apply-customer-web-config] skipped: ${result.reason}\n`,
    );
  }
}
