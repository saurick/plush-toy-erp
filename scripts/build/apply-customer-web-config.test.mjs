import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyCustomerWebConfig } from "./apply-customer-web-config.mjs";

const scriptPath = fileURLToPath(
  new URL("./apply-customer-web-config.mjs", import.meta.url),
);
const neutralConfigSource =
  "window.__PLUSH_ERP_CUSTOMER_CONFIG__=null;\n";

async function setupCustomerPackage() {
  const root = await mkdtemp(path.join(os.tmpdir(), "customer-web-config-"));
  const configRoot = path.join(root, "config");
  const customerDir = path.join(configRoot, "customers", "yoyoosun");
  const assetsDir = path.join(customerDir, "public-assets");
  const privateAssetsDir = path.join(customerDir, "assets");
  const referenceCustomerDir = path.join(
    configRoot,
    "customers",
    "reference-customer",
  );
  const referenceAssetsDir = path.join(
    referenceCustomerDir,
    "public-assets",
  );
  const webBuildDir = path.join(root, "web", "build");
  const webPublicDir = path.join(root, "web", "public");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(privateAssetsDir, { recursive: true });
  fs.mkdirSync(referenceAssetsDir, { recursive: true });
  fs.mkdirSync(webBuildDir, { recursive: true });
  fs.mkdirSync(webPublicDir, { recursive: true });
  fs.writeFileSync(
    path.join(webPublicDir, "customer-config.js"),
    neutralConfigSource,
  );
  fs.writeFileSync(
    path.join(customerDir, "customer-config.example.js"),
    "window.__PLUSH_ERP_CUSTOMER_CONFIG__={customerKey:'yoyoosun'};\n",
  );
  fs.writeFileSync(path.join(assetsDir, "favicon-yoyoosun.svg"), "<svg />\n");
  fs.writeFileSync(path.join(privateAssetsDir, "customer-process-photo.png"), "private\n");
  fs.writeFileSync(
    path.join(referenceCustomerDir, "customer-config.example.js"),
    "window.__PLUSH_ERP_CUSTOMER_CONFIG__={customerKey:'reference-customer'};\n",
  );
  fs.writeFileSync(
    path.join(referenceAssetsDir, "favicon-reference-customer.svg"),
    "<svg />\n",
  );
  return { assetsDir, customerDir, root, configRoot, webBuildDir };
}

function seedStaleCustomerBuild(webBuildDir) {
  fs.mkdirSync(webBuildDir, { recursive: true });
  fs.writeFileSync(
    path.join(webBuildDir, "customer-config.js"),
    "window.__PLUSH_ERP_CUSTOMER_CONFIG__={customerKey:'stale'};\n",
  );
  const staleAssetsDir = path.join(webBuildDir, "customer-assets", "stale");
  fs.mkdirSync(staleAssetsDir, { recursive: true });
  fs.writeFileSync(path.join(staleAssetsDir, "stale.svg"), "<svg />\n");
}

async function assertNeutralCustomerBuild(webBuildDir) {
  assert.equal(
    await readFile(path.join(webBuildDir, "customer-config.js"), "utf8"),
    neutralConfigSource,
  );
  assert.equal(fs.existsSync(path.join(webBuildDir, "customer-assets")), false);
}

async function assertRejectedAndNeutralized(options, expectedError) {
  seedStaleCustomerBuild(options.webBuildDir);
  assert.throws(() => applyCustomerWebConfig(options), expectedError);
  await assertNeutralCustomerBuild(options.webBuildDir);
}

test("applyCustomerWebConfig writes a neutral build when no customer is selected", async () => {
  const { root, webBuildDir } = await setupCustomerPackage();
  try {
    seedStaleCustomerBuild(webBuildDir);

    const result = applyCustomerWebConfig({ customer: "", webBuildDir });

    assert.equal(result.applied, false);
    assert.equal(result.neutral, true);
    assert.equal(result.reason, "no customer selected");
    await assertNeutralCustomerBuild(webBuildDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig safely creates a missing web build directory", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    await rm(webBuildDir, { recursive: true, force: true });
    const result = applyCustomerWebConfig({
      customer: "yoyoosun",
      configRoot,
      webBuildDir,
    });
    assert.equal(result.applied, true);
    assert.equal(fs.existsSync(path.join(webBuildDir, "customer-config.js")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig overlays customer-config.js and assets", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    const result = applyCustomerWebConfig({
      customer: "yoyoosun",
      configRoot,
      webBuildDir,
    });

    assert.equal(result.applied, true);
    assert.equal(result.customer, "yoyoosun");
    assert.match(
      await readFile(path.join(webBuildDir, "customer-config.js"), "utf8"),
      /customerKey:'yoyoosun'/,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "yoyoosun",
          "favicon-yoyoosun.svg",
        ),
      ),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "yoyoosun",
          "customer-process-photo.png",
        ),
      ),
      false,
      "production overlay must not publish private customer evidence assets",
    );

    fs.writeFileSync(
      path.join(
        webBuildDir,
        "customer-assets",
        "yoyoosun",
        "stale-public-asset.txt",
      ),
      "stale\n",
    );
    applyCustomerWebConfig({ customer: "yoyoosun", configRoot, webBuildDir });
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "yoyoosun",
          "stale-public-asset.txt",
        ),
      ),
      false,
      "repeated overlays must remove stale public assets",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig replaces assets when switching customers", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    applyCustomerWebConfig({
      customer: "yoyoosun",
      configRoot,
      webBuildDir,
    });
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "yoyoosun",
          "favicon-yoyoosun.svg",
        ),
      ),
      true,
    );

    const result = applyCustomerWebConfig({
      customer: "reference-customer",
      configRoot,
      webBuildDir,
    });

    assert.equal(result.applied, true);
    assert.equal(result.customer, "reference-customer");
    const publishedConfig = await readFile(
      path.join(webBuildDir, "customer-config.js"),
      "utf8",
    );
    assert.match(publishedConfig, /customerKey:'reference-customer'/);
    assert.doesNotMatch(publishedConfig, /yoyoosun/);
    assert.equal(
      fs.existsSync(
        path.join(webBuildDir, "customer-assets", "yoyoosun"),
      ),
      false,
      "switching customers must remove the previous customer asset directory",
    );
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "reference-customer",
          "favicon-reference-customer.svg",
        ),
      ),
      true,
    );
    assert.deepEqual(
      fs.readdirSync(path.join(webBuildDir, "customer-assets")),
      ["reference-customer"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig neutralizes a registered package with missing web config", async () => {
  const { customerDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    fs.rmSync(path.join(customerDir, "customer-config.example.js"));
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /customer web config does not exist/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig uses the static package index as its allowlist", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  const unregisteredDir = path.join(
    configRoot,
    "customers",
    "unregistered-customer",
  );
  try {
    fs.mkdirSync(path.join(unregisteredDir, "public-assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(unregisteredDir, "customer-config.example.js"),
      "window.__PLUSH_ERP_CUSTOMER_CONFIG__={customerKey:'unregistered-customer'};\n",
    );
    fs.writeFileSync(
      path.join(unregisteredDir, "public-assets", "favicon.svg"),
      "<svg />\n",
    );

    await assertRejectedAndNeutralized(
      { customer: "unregistered-customer", configRoot, webBuildDir },
      /unknown customer web package: unregistered-customer/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects invalid and unknown customer keys", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    await assertRejectedAndNeutralized(
      { customer: "../../escape", configRoot, webBuildDir },
      /customer key must match/,
    );
    await assertRejectedAndNeutralized(
      { customer: "unknown", configRoot, webBuildDir },
      /unknown customer web package: unknown/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects symbolic links in public assets", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    fs.symlinkSync(
      "/etc/passwd",
      path.join(
        configRoot,
        "customers",
        "yoyoosun",
        "public-assets",
        "passwd-link",
      ),
    );
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /customer public web assets must not contain symbolic links/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects dangerous or secret asset names", async () => {
  const { assetsDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    fs.writeFileSync(path.join(assetsDir, "client-secret.svg"), "<svg />\n");
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /dangerous or secret file name/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects unsupported public asset extensions", async () => {
  const { assetsDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    fs.writeFileSync(path.join(assetsDir, "favicon.txt"), "not an svg\n");
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /unsupported extension \.txt/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects binary public asset content", async () => {
  const { assetsDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    fs.writeFileSync(
      path.join(assetsDir, "binary.svg"),
      Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x00, 0x3e]),
    );
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /not binary content/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects oversized customer web files", async () => {
  const { assetsDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    fs.writeFileSync(
      path.join(assetsDir, "oversized.svg"),
      Buffer.alloc(256 * 1024 + 1, 0x61),
    );
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /exceeds maximum size 262144 bytes/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects non-regular public asset files", async () => {
  const { assetsDir, root, configRoot, webBuildDir } =
    await setupCustomerPackage();
  try {
    const fifoPath = path.join(assetsDir, "named-pipe.svg");
    const mkfifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(mkfifo.status, 0, mkfifo.stderr);
    await assertRejectedAndNeutralized(
      { customer: "yoyoosun", configRoot, webBuildDir },
      /must contain regular files/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects symbolic links in target paths", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    const outside = path.join(root, "outside-assets");
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(webBuildDir, "customer-assets"));
    assert.throws(
      () =>
        applyCustomerWebConfig({
          customer: "yoyoosun",
          configRoot,
          webBuildDir,
        }),
      /target assets must not traverse symbolic links/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply-customer-web-config CLI executes through a symlinked path", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    const linkedScript = path.join(root, "apply-customer-web-config.mjs");
    fs.symlinkSync(scriptPath, linkedScript);
    const result = spawnSync(
      process.execPath,
      [
        linkedScript,
        "--customer",
        "yoyoosun",
        "--config-root",
        configRoot,
        "--web-build-dir",
        webBuildDir,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /applied customer=yoyoosun/);
    assert.equal(
      fs.existsSync(path.join(webBuildDir, "customer-config.js")),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
