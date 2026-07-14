#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from "../../config/customers/index.mjs";

const CUSTOMER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CUSTOMER_CONFIG_EXTENSIONS = new Set([".js"]);
const PUBLIC_ASSET_EXTENSIONS = new Set([".svg"]);
const MAX_CUSTOMER_WEB_FILE_BYTES = 256 * 1024;
const DANGEROUS_SOURCE_EXTENSIONS = new Set([
  ".cer",
  ".crt",
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);
const SECRET_SOURCE_NAME_PATTERN =
  /(?:^|[._-])(?:credential|credentials|id_ed25519|id_rsa|passwd|password|private[._-]?key|secret|secrets|token)(?:[._-]|$)/u;
const UNSAFE_TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

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

function assertDirectory(targetPath, description) {
  assertPathExists(targetPath, description);
  if (!statSync(targetPath).isDirectory()) {
    throw new Error(`${description} must be a directory: ${targetPath}`);
  }
}

function assertSafeSourceName(name, description) {
  const normalizedName = String(name || "").toLowerCase();
  const extension = path.extname(normalizedName);
  if (
    normalizedName === "" ||
    normalizedName.startsWith(".") ||
    /[\u0000-\u001f\u007f]/u.test(normalizedName) ||
    SECRET_SOURCE_NAME_PATTERN.test(normalizedName) ||
    DANGEROUS_SOURCE_EXTENSIONS.has(extension)
  ) {
    throw new Error(
      `${description} has a dangerous or secret file name: ${name}`,
    );
  }
}

function assertSafeTextFile(
  targetPath,
  description,
  allowedExtensions,
) {
  assertPathExists(targetPath, description);
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`${description} must not contain symbolic links: ${targetPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${description} must be a regular file: ${targetPath}`);
  }

  assertSafeSourceName(path.basename(targetPath), description);
  const extension = path.extname(targetPath).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error(
      `${description} has unsupported extension ${extension || "(none)"}: ${targetPath}`,
    );
  }
  if (stat.size > MAX_CUSTOMER_WEB_FILE_BYTES) {
    throw new Error(
      `${description} exceeds maximum size ${MAX_CUSTOMER_WEB_FILE_BYTES} bytes: ${targetPath}`,
    );
  }

  let source;
  try {
    source = utf8Decoder.decode(readFileSync(targetPath));
  } catch {
    throw new Error(
      `${description} must contain UTF-8 text, not binary content: ${targetPath}`,
    );
  }
  if (UNSAFE_TEXT_CONTROL_PATTERN.test(source)) {
    throw new Error(
      `${description} must contain UTF-8 text, not binary content: ${targetPath}`,
    );
  }
}

function assertSafePublicAssetTree(targetPath, description) {
  assertDirectory(targetPath, description);
  if (lstatSync(targetPath).isSymbolicLink()) {
    throw new Error(`${description} must not contain symbolic links: ${targetPath}`);
  }

  const visit = (currentPath) => {
    for (const entry of readdirSync(currentPath)) {
      const entryPath = path.join(currentPath, entry);
      const stat = lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        throw new Error(
          `${description} must not contain symbolic links: ${entryPath}`,
        );
      }
      assertSafeSourceName(entry, description);
      if (stat.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`${description} must contain regular files: ${entryPath}`);
      }
      assertSafeTextFile(
        entryPath,
        description,
        PUBLIC_ASSET_EXTENSIONS,
      );
    }
  };
  visit(targetPath);
}

function assertInsideRoot(rootPath, targetPath, description) {
  const relativePath = path.relative(rootPath, targetPath);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${description} must stay inside ${rootPath}: ${targetPath}`);
  }
}

function assertNoSymlinksInTree(targetPath, description) {
  const visit = (currentPath) => {
    const stat = lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${description} must not contain symbolic links: ${currentPath}`);
    }
    if (!stat.isDirectory()) {
      return;
    }
    for (const entry of readdirSync(currentPath)) {
      visit(path.join(currentPath, entry));
    }
  };
  visit(targetPath);
}

function assertNoSymlinkPath(rootPath, targetPath, description) {
  assertInsideRoot(rootPath, targetPath, description);
  const relativeParts = path.relative(rootPath, targetPath).split(path.sep);
  let currentPath = rootPath;
  for (const part of relativeParts) {
    currentPath = path.join(currentPath, part);
    if (!existsSync(currentPath)) {
      return;
    }
    if (lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`${description} must not traverse symbolic links: ${currentPath}`);
    }
  }
}

function prepareWebBuildDirectory(webBuildDir) {
  const absoluteWebBuildDir = path.resolve(webBuildDir);
  let existingAnchor = absoluteWebBuildDir;
  while (!existsSync(existingAnchor)) {
    const parent = path.dirname(existingAnchor);
    if (parent === existingAnchor) {
      throw new Error(`web build directory has no existing parent: ${absoluteWebBuildDir}`);
    }
    existingAnchor = parent;
  }
  if (lstatSync(existingAnchor).isSymbolicLink()) {
    throw new Error(
      `web build directory must not traverse symbolic links: ${existingAnchor}`,
    );
  }
  assertDirectory(existingAnchor, "web build directory parent");
  const relativeSuffix = path.relative(existingAnchor, absoluteWebBuildDir);
  const realExistingAnchor = realpathSync(existingAnchor);
  const resolvedWebBuildDir = path.join(realExistingAnchor, relativeSuffix);
  if (relativeSuffix !== "") {
    assertNoSymlinkPath(
      realExistingAnchor,
      resolvedWebBuildDir,
      "web build directory",
    );
  }
  mkdirSync(resolvedWebBuildDir, { recursive: true });
  assertDirectory(resolvedWebBuildDir, "web build directory");
  return realpathSync(resolvedWebBuildDir);
}

function applyNeutralWebConfig(webBuildDir) {
  const realWebBuildDir = prepareWebBuildDirectory(webBuildDir);
  const publicDir = path.join(path.dirname(realWebBuildDir), "public");
  const neutralConfigPath = path.join(publicDir, "customer-config.js");
  const targetConfigPath = path.join(realWebBuildDir, "customer-config.js");
  const targetAssetsRoot = path.join(realWebBuildDir, "customer-assets");

  assertDirectory(publicDir, "web public directory");
  assertNoSymlinkPath(path.dirname(realWebBuildDir), publicDir, "web public directory");
  assertSafeTextFile(
    neutralConfigPath,
    "neutral web config",
    CUSTOMER_CONFIG_EXTENSIONS,
  );
  assertNoSymlinkPath(realWebBuildDir, targetConfigPath, "target config");
  assertNoSymlinkPath(realWebBuildDir, targetAssetsRoot, "target assets");

  if (existsSync(targetAssetsRoot)) {
    assertNoSymlinksInTree(targetAssetsRoot, "target assets");
    rmSync(targetAssetsRoot, { recursive: true, force: true });
  }
  cpSync(neutralConfigPath, targetConfigPath);
  assertSafeTextFile(
    targetConfigPath,
    "published neutral web config",
    CUSTOMER_CONFIG_EXTENSIONS,
  );

  return {
    applied: false,
    reason: "no customer selected",
    neutral: true,
    neutralConfigPath,
    targetConfigPath,
  };
}

function resolveCustomerPackage({ customer, configRoot }) {
  if (!CUSTOMER_KEY_PATTERN.test(customer)) {
    throw new Error(
      `customer key must match ${CUSTOMER_KEY_PATTERN.source}: ${customer}`,
    );
  }

  if (!getCustomerPackage(customer)) {
    throw new Error(
      `unknown customer web package: ${customer}; allowed=${listCustomerPackageKeys().join(",") || "none"}`,
    );
  }

  assertPathExists(configRoot, "config root");
  if (lstatSync(configRoot).isSymbolicLink()) {
    throw new Error(`config root must not be a symbolic link: ${configRoot}`);
  }
  assertDirectory(configRoot, "config root");
  const realConfigRoot = realpathSync(configRoot);
  const customersRoot = path.join(realConfigRoot, "customers");
  assertDirectory(customersRoot, "customer config root");
  assertNoSymlinkPath(realConfigRoot, customersRoot, "customer config root");

  const customerDir = path.join(customersRoot, customer);
  assertNoSymlinkPath(customersRoot, customerDir, "customer package");
  assertDirectory(customerDir, "customer package");
  const realCustomerDir = realpathSync(customerDir);
  assertInsideRoot(customersRoot, realCustomerDir, "customer package");

  const customerConfigPath = path.join(
    realCustomerDir,
    "customer-config.example.js",
  );
  const customerAssetsDir = path.join(realCustomerDir, "public-assets");
  assertSafeTextFile(
    customerConfigPath,
    "customer web config",
    CUSTOMER_CONFIG_EXTENSIONS,
  );
  assertSafePublicAssetTree(
    customerAssetsDir,
    "customer public web assets",
  );

  return {
    customerConfigPath,
    customerAssetsDir,
  };
}

function failClosedWithNeutralWebConfig(sourceError, webBuildDir) {
  try {
    applyNeutralWebConfig(webBuildDir);
  } catch (neutralError) {
    throw new AggregateError(
      [sourceError, neutralError],
      `customer web package was rejected and neutral fallback failed: ${sourceError.message}`,
    );
  }
  throw sourceError;
}

export function applyCustomerWebConfig({
  customer,
  configRoot,
  webBuildDir,
} = {}) {
  const normalizedCustomer = String(customer || "").trim();
  if (!normalizedCustomer) {
    return applyNeutralWebConfig(webBuildDir);
  }

  let customerPackagePaths;
  try {
    customerPackagePaths = resolveCustomerPackage({
      customer: normalizedCustomer,
      configRoot: path.resolve(configRoot),
    });
  } catch (error) {
    failClosedWithNeutralWebConfig(error, webBuildDir);
  }
  const { customerConfigPath, customerAssetsDir } = customerPackagePaths;
  const realWebBuildDir = prepareWebBuildDirectory(webBuildDir);
  const targetConfigPath = path.join(realWebBuildDir, "customer-config.js");
  const targetAssetsRoot = path.join(realWebBuildDir, "customer-assets");
  const targetAssetsDir = path.join(
    targetAssetsRoot,
    normalizedCustomer,
  );

  assertNoSymlinkPath(realWebBuildDir, targetConfigPath, "target config");
  assertNoSymlinkPath(realWebBuildDir, targetAssetsRoot, "target assets");
  assertNoSymlinkPath(realWebBuildDir, targetAssetsDir, "target assets");

  mkdirSync(path.dirname(targetConfigPath), { recursive: true });
  if (existsSync(targetAssetsRoot)) {
    assertNoSymlinksInTree(targetAssetsRoot, "target assets");
    rmSync(targetAssetsRoot, { recursive: true, force: true });
  }
  mkdirSync(targetAssetsDir, { recursive: true });
  cpSync(customerConfigPath, targetConfigPath);
  cpSync(customerAssetsDir, targetAssetsDir, { recursive: true });
  assertSafeTextFile(
    targetConfigPath,
    "published customer web config",
    CUSTOMER_CONFIG_EXTENSIONS,
  );
  assertSafePublicAssetTree(
    targetAssetsDir,
    "published customer web assets",
  );

  return {
    applied: true,
    customer: normalizedCustomer,
    customerConfigPath,
    targetConfigPath,
    targetAssetsDir,
  };
}

export function isMainModule(
  moduleUrl = import.meta.url,
  argvPath = process.argv[1],
) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

if (isMainModule()) {
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
