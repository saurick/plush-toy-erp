import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OUTPUT_FILES,
  extractSourcesFromWorkbooks,
  readXlsxWorkbook,
  runExtraction,
} from "./customerSourceExtract.mjs";
import {
  createSyntheticPurchaseSourceFixture,
  createSyntheticSourceFixture,
} from "./fixtures/synthetic/createSyntheticSourceFixture.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");
const cliPath = path.join(testDir, "customerSourceExtract.mjs");

test("help 输出可运行", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer source extractor/);
  assert.match(result.stdout, /--manifest/);
  assert.match(result.stdout, /--raw-dir/);
  assert.ok(!/yoyoosun|永绅/iu.test(result.stdout));
});

test("xlsx reader 正确处理合成 fixture 的自闭合空单元格", async (t) => {
  const fixture = await prepareSyntheticFixture(t);
  const workbook = await readXlsxWorkbook(fixture.xlsxPath);
  const sheet = workbook.sheets.find((item) => item.name === "材料分析明细表");
  assert.ok(sheet);
  const row = sheet.rows.find((item) => item.rowNumber === 7);
  assert.ok(row);
  assert.equal(row.values[2], undefined);
  assert.equal(row.values[4], "左侧片");
  assert.equal(row.values[6], "激光");
});

test("委外汇总与加工厂资料保持加工项目、工序能力和公司对接人边界", () => {
  const extraction = extractSourcesFromWorkbooks(
    [
      {
        fileName: "synthetic-outsourcing.xlsx",
        sheets: [
          {
            name: "委外加工汇总表",
            rows: [
              {
                rowNumber: 2,
                values: [
                  "委外加工订单号",
                  "产品订单编号",
                  "产品编号",
                  "产品名称",
                  "加工项目",
                  "厂家名称",
                  "工序类别",
                  "单位",
                  "单价",
                  "数量",
                  "加工金额",
                  "备注",
                  "下单人",
                  "联系电话",
                  "回货日期",
                ],
              },
              {
                rowNumber: 3,
                values: [
                  "OUT-SYN-001",
                  "SO-SYN-001",
                  "PROD-SYN-001",
                  "合成样品",
                  "脸*1",
                  "合成加工厂",
                  "电绣",
                  "片",
                  "0.2",
                  "100",
                  "20",
                  "合成备注",
                  "合成下单人",
                  "0769-00000001",
                  "2026-07-30",
                ],
              },
            ],
          },
          {
            name: "加工厂商资料",
            rows: [
              {
                rowNumber: 2,
                values: [
                  "序号",
                  "厂家简称",
                  "厂家全称",
                  "加工工序",
                  "联系人",
                  "联系电话",
                  "开票类型",
                  "开票点数",
                  "加工商地址",
                  "银行卡号",
                  "公司对接人",
                  "对接人电话",
                  "备注",
                ],
              },
              {
                rowNumber: 3,
                values: [
                  "1",
                  "合成加工厂",
                  "合成加工厂",
                  "电绣",
                  "外部联系人",
                  "0769-00000002",
                  "",
                  "",
                  "合成工业园 1 号",
                  "6222000000000000",
                  "内部跟单人",
                  "0769-00000003",
                  "合成厂备注",
                ],
              },
              {
                rowNumber: 4,
                values: [
                  "2",
                  "合成加工厂",
                  "合成加工厂",
                  "激光",
                  "第二联系人",
                  "13800000000",
                  "",
                  "",
                  "合成工业园 2 号",
                  "6222000000001111",
                  "",
                  "",
                  "第二条资料备注",
                ],
              },
            ],
          },
        ],
      },
    ],
    { customerKey: "synthetic" },
  );

  const outsourcing = extraction.sources.find(
    (source) => source.domain === "outsourcing",
  );
  assert.equal(outsourcing.fields.processing_item, "脸*1");
  assert.equal(outsourcing.fields.process_name, "电绣");
  assert.equal(Object.hasOwn(outsourcing.fields, "process_category"), false);
  const outsourcingMapping = extraction.mappings.find(
    (mapping) => mapping.sheetName === "委外加工汇总表",
  );
  assert.equal(
    outsourcingMapping.domain,
    "outsourcing / suppliers / products / units / processes",
  );
  assert.deepEqual(outsourcingMapping.mappedFields, [
    "委外加工订单号",
    "产品订单编号",
    "产品编号",
    "产品名称",
    "加工项目",
    "厂家名称",
    "工序类别",
    "单位",
    "单价",
    "数量",
    "加工金额",
    "备注",
    "下单人",
    "联系电话",
    "回货日期",
  ]);

  const supplier = extraction.sources.find(
    (source) =>
      source.sheetName === "加工厂商资料" &&
      source.domain === "suppliers" &&
      source.fields.factory_name === "合成加工厂",
  );
  assert.equal(Object.hasOwn(supplier.fields, "partner_type"), false);
  assert.equal(supplier.fields.address, "合成工业园 1 号");
  assert.equal(Object.hasOwn(supplier.fields, "document_no"), false);
  assert.equal(supplier.fields.bank_account_source_present, true);
  assert.equal(supplier.fields.bank_account_redacted, true);
  const directorySuppliers = extraction.sources.filter(
    (source) =>
      source.sheetName === "加工厂商资料" && source.domain === "suppliers",
  );
  assert.equal(directorySuppliers.length, 2);
  assert.equal(directorySuppliers[1].fields.address, "合成工业园 2 号");
  assert.equal(directorySuppliers[1].fields.note, "第二条资料备注");

  const contact = extraction.sources.find(
    (source) => source.domain === "contacts",
  );
  assert.equal(contact.fields.item_name, "外部联系人");
  assert.equal(contact.fields.phone, "0769-00000002");
  assert.equal(Object.hasOwn(contact.fields, "mobile_phone"), false);
  const directoryContacts = extraction.sources.filter(
    (source) =>
      source.sheetName === "加工厂商资料" && source.domain === "contacts",
  );
  assert.equal(directoryContacts.length, 2);
  for (const directoryContact of directoryContacts) {
    const sameRowSupplier = directorySuppliers.find(
      (candidate) => candidate.rowNumber === directoryContact.rowNumber,
    );
    assert.equal(
      directoryContact.fields.owner_source_id,
      sameRowSupplier?.sourceId,
    );
  }

  const capability = extraction.sources.find(
    (source) => source.domain === "supplier_process_capabilities",
  );
  assert.equal(capability.fields.supplier_name, "合成加工厂");
  assert.equal(capability.fields.process_name, "电绣");
  assert.equal(
    extraction.sources.filter(
      (source) => source.domain === "supplier_process_capabilities",
    ).length,
    2,
  );

  const companyLiaison = extraction.sources.find(
    (source) => source.domain === "customer_material",
  );
  assert.equal(companyLiaison.fields.company_liaison_name, "内部跟单人");
  assert.equal(companyLiaison.fields.company_liaison_phone, "0769-00000003");
  const supplierMapping = extraction.mappings.find(
    (mapping) => mapping.sheetName === "加工厂商资料",
  );
  assert.equal(
    supplierMapping.domain,
    "suppliers / contacts / processes / supplier_process_capabilities / customer_material",
  );
  assert.deepEqual(supplierMapping.mappedFields, [
    "厂家简称",
    "厂家全称",
    "加工工序",
    "联系人",
    "联系电话",
    "开票类型",
    "开票点数",
    "加工商地址",
    "银行卡号",
    "公司对接人",
    "对接人电话",
    "备注",
  ]);
  assert.doesNotMatch(JSON.stringify(extraction), /6222000000000000/u);
  assert.doesNotMatch(JSON.stringify(extraction), /6222000000001111/u);
});

test("extractSourcesFromWorkbooks 不把非日期回货说明写入预计回货日期", () => {
  const extraction = extractSourcesFromWorkbooks(
    [
      {
        fileName: "synthetic-processing.xlsx",
        sourceManifest: null,
        sheets: [
          {
            name: "委外加工汇总表",
            rows: [
              {
                rowNumber: 2,
                values: [
                  "委外加工订单号",
                  "产品编号",
                  "加工项目",
                  "厂家名称",
                  "工序类别",
                  "单位",
                  "数量",
                  "回货日期",
                ],
              },
              {
                rowNumber: 3,
                values: [
                  "",
                  "P-1",
                  "脸*1",
                  "加工厂",
                  "电绣",
                  "片",
                  "10",
                  "补合同",
                ],
              },
              {
                rowNumber: 4,
                values: [
                  "",
                  "P-2",
                  "耳*2",
                  "加工厂",
                  "电绣",
                  "片",
                  "20",
                  "2026/7/30",
                ],
              },
            ],
          },
        ],
      },
    ],
    { customerKey: "synthetic" },
  );

  const sources = extraction.sources.filter(
    (source) => source.domain === "outsourcing",
  );
  assert.equal(sources.length, 2);
  assert.equal(Object.hasOwn(sources[0].fields, "expected_return_date"), false);
  assert.equal(sources[0].fields.return_date_source_text, "补合同");
  assert.equal(sources[0].fields.return_date_review_required, true);
  assert.equal(sources[1].fields.expected_return_date, "2026-07-30");
  assert.equal(
    Object.hasOwn(sources[1].fields, "return_date_source_text"),
    false,
  );
});

test("extractSourcesFromWorkbooks 不按厂商资料表名猜供应商类型", () => {
  const extraction = extractSourcesFromWorkbooks(
    [
      {
        fileName: "synthetic-suppliers.xlsx",
        sourceManifest: null,
        sheets: [
          {
            name: "材料厂商编号",
            rows: [
              {
                rowNumber: 2,
                values: [
                  "序号",
                  "厂商简称",
                  "厂商名称",
                  "联系人",
                  "联系电话",
                  "类别",
                ],
              },
              {
                rowNumber: 3,
                values: [
                  "1",
                  "材料厂",
                  "合成材料供应商",
                  "联系人",
                  "13800000000",
                  "material",
                ],
              },
            ],
          },
        ],
      },
    ],
    { customerKey: "synthetic" },
  );

  const supplier = extraction.sources.find(
    (source) => source.domain === "suppliers",
  );
  assert.equal(supplier.fields.factory_name, "合成材料供应商");
  assert.equal(supplier.fields.partner_type, "material");
  assert.equal(Object.hasOwn(supplier.fields, "document_no"), false);
  const contact = extraction.sources.find(
    (source) => source.domain === "contacts",
  );
  assert.equal(contact.fields.mobile_phone, "13800000000");
  assert.equal(Object.hasOwn(contact.fields, "phone"), false);
});

test("runExtraction 只用合成 fixture 生成 no-real-import evidence", async (t) => {
  const fixture = await prepareSyntheticFixture(t);
  const outDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-source-extract-"),
  );
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const manifestBefore = await readFile(fixture.manifestPath);
  const sourcesBefore = await Promise.all(
    fixture.sourcePaths.map((sourcePath) => readFile(sourcePath)),
  );
  const result = await runExtraction({
    manifest: fixture.manifestPath,
    rawDir: fixture.rawDir,
    out: outDir,
    customer: fixture.manifest.customerKey,
  });

  assert.deepEqual((await readdir(outDir)).sort(), [...OUTPUT_FILES].sort());
  for (const fileName of OUTPUT_FILES) {
    const content = await readFile(path.join(outDir, fileName), "utf8");
    assert.ok(content.length > 0, `${fileName} should not be empty`);
  }

  assert.deepEqual(await readFile(fixture.manifestPath), manifestBefore);
  for (const [index, sourcePath] of fixture.sourcePaths.entries()) {
    assert.deepEqual(await readFile(sourcePath), sourcesBefore[index]);
  }
  assert.equal(result.sourceSnapshot.canExecuteRealImport, false);
  assert.equal(result.sourceSnapshot.noRealImport, true);
  assert.equal(
    result.sourceSnapshot.sourceManifest.path,
    "source-manifest.json",
  );
  assert.equal(result.summary.sourceManifest.path, "source-manifest.json");
  assert.equal(result.summary.sourceManifest.sourceCount, 2);
  assert.equal(result.summary.sourceManifest.structuredExtractCount, 2);
  assert.ok(
    result.sourceSnapshot.sources.every((source) => source.sourceManifestId),
  );
  assert.equal(result.importConfig.boundaries.executesImport, false);
  assert.equal(result.importConfig.boundaries.createsTenant, false);
  assert.deepEqual(
    result.importConfig.recommendedImportSequence.map((item) => item.domains),
    [
      ["units"],
      ["products", "materials", "processes", "suppliers"],
      ["supplier_process_capabilities"],
      ["contacts", "customer_material"],
      ["bom"],
      ["purchase_orders", "outsourcing"],
    ],
  );
  assert.ok(result.summary.sourceCount > 0);
  assert.ok(result.summary.countsByDomain.materials > 0);
  assert.ok(result.summary.countsByDomain.bom > 0);
  assert.ok(result.summary.countsByDomain.purchase_orders > 0);
  assert.ok(result.summary.countsByDomain.suppliers > 0);
  assert.equal(result.summary.countsByDomain.outsourcing, undefined);
  assert.ok(!result.report.includes(fixture.tempDir));
  assert.ok(!result.report.includes(fixture.relativePath));
});

test("固定 generatedAt 时提取输出可重复", async (t) => {
  const fixture = await prepareSyntheticFixture(t);
  const firstOut = await mkdtemp(
    path.join(os.tmpdir(), "customer-source-extract-first-"),
  );
  const secondOut = await mkdtemp(
    path.join(os.tmpdir(), "customer-source-extract-second-"),
  );
  t.after(() =>
    Promise.all([
      rm(firstOut, { recursive: true, force: true }),
      rm(secondOut, { recursive: true, force: true }),
    ]),
  );
  const generatedAt = "2026-07-14T00:00:00.000Z";
  const options = {
    manifest: fixture.manifestPath,
    rawDir: fixture.rawDir,
    customer: fixture.manifest.customerKey,
    generatedAt,
  };

  const first = await runExtraction({ ...options, out: firstOut });
  const second = await runExtraction({ ...options, out: secondOut });

  assert.deepEqual(second, first);
  for (const fileName of OUTPUT_FILES) {
    assert.equal(
      await readFile(path.join(secondOut, fileName), "utf8"),
      await readFile(path.join(firstOut, fileName), "utf8"),
    );
  }
});

test("提取输出不能进入 raw-dir 或覆盖来源 manifest", async (t) => {
  const fixture = await prepareSyntheticFixture(t);
  await assert.rejects(
    () =>
      runExtraction({
        manifest: fixture.manifestPath,
        rawDir: fixture.rawDir,
        out: fixture.rawDir,
        customer: fixture.manifest.customerKey,
      }),
    /must be outside the raw source directory/u,
  );

  const collisionDir = path.join(fixture.tempDir, "collision");
  await mkdir(collisionDir);
  const collisionManifest = path.join(
    collisionDir,
    "source-snapshot.extracted.json",
  );
  const manifestBytes = `${JSON.stringify(fixture.manifest, null, 2)}\n`;
  await writeFile(collisionManifest, manifestBytes, "utf8");
  await assert.rejects(
    () =>
      runExtraction({
        manifest: collisionManifest,
        rawDir: fixture.rawDir,
        out: collisionDir,
        customer: fixture.manifest.customerKey,
      }),
    /would overwrite a source manifest or source file/u,
  );
  assert.equal(await readFile(collisionManifest, "utf8"), manifestBytes);

  const linkedOut = path.join(fixture.tempDir, "linked-output");
  await mkdir(linkedOut);
  const sentinelPath = path.join(fixture.tempDir, "outside-sentinel.txt");
  await writeFile(sentinelPath, "sentinel\n", "utf8");
  await symlink(
    "../outside-sentinel.txt",
    path.join(linkedOut, "extraction-report.md"),
  );
  await assert.rejects(
    () =>
      runExtraction({
        manifest: fixture.manifestPath,
        rawDir: fixture.rawDir,
        out: linkedOut,
        customer: fixture.manifest.customerKey,
      }),
    /regular files, not links or directories/u,
  );
  assert.equal(await readFile(sentinelPath, "utf8"), "sentinel\n");
});

test("损坏或超限 xlsx fail-closed 且 CLI 不泄露本地路径", async (t) => {
  const fixture = await prepareSyntheticFixture(t);
  const malformed = Buffer.alloc(22);
  malformed.writeUInt32LE(0x06054b50, 0);
  malformed.writeUInt16LE(1, 8);
  malformed.writeUInt16LE(1, 10);
  malformed.writeUInt32LE(46, 12);
  malformed.writeUInt32LE(0xffffffff, 16);
  await writeFile(fixture.xlsxPath, malformed);
  const source = fixture.manifest.sources.find(
    (item) => item.relativePath === fixture.relativePath,
  );
  source.sha256 = createHash("sha256").update(malformed).digest("hex");
  source.sizeBytes = malformed.length;
  await writeFile(
    fixture.manifestPath,
    `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    "utf8",
  );

  const cliResult = spawnSync(
    process.execPath,
    [
      cliPath,
      "--manifest",
      "source-manifest.json",
      "--raw-dir",
      "raw",
      "--out",
      "out",
      "--customer",
      fixture.manifest.customerKey,
    ],
    { cwd: fixture.tempDir, encoding: "utf8" },
  );
  assert.equal(cliResult.status, 2);
  assert.match(cliResult.stderr, /Invalid xlsx zip central directory bounds/u);
  assert.doesNotMatch(
    cliResult.stderr,
    /RangeError|customerSourceExtract\.mjs/u,
  );
  assert.ok(!cliResult.stderr.includes(fixture.tempDir));

  const valid = createSyntheticSourceFixture().xlsx;
  const oversizedEntry = Buffer.from(valid);
  const centralOffset = findZipSignature(oversizedEntry, 0x02014b50);
  oversizedEntry.writeUInt32LE(64 * 1024 * 1024 + 1, centralOffset + 24);
  const oversizedPath = path.join(fixture.tempDir, "oversized.xlsx");
  await writeFile(oversizedPath, oversizedEntry);
  await assert.rejects(
    () => readXlsxWorkbook(oversizedPath),
    /entry exceeds the extraction size limit/u,
  );

  const checksumDrift = Buffer.from(valid);
  const workbookDataOffset = findStoredZipEntryData(
    checksumDrift,
    "xl/workbook.xml",
  );
  checksumDrift[workbookDataOffset] ^= 1;
  const checksumDriftPath = path.join(fixture.tempDir, "checksum-drift.xlsx");
  await writeFile(checksumDriftPath, checksumDrift);
  await assert.rejects(
    () => readXlsxWorkbook(checksumDriftPath),
    /entry checksum mismatch/u,
  );
});

async function prepareSyntheticFixture(t) {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-source-extract-fixture-"),
  );
  t.after(() => rm(tempDir, { recursive: true, force: true }));
  const rawDir = path.join(tempDir, "raw");
  await mkdir(rawDir, { recursive: true });
  const synthetic = createSyntheticSourceFixture();
  const purchase = createSyntheticPurchaseSourceFixture({
    customerKey: synthetic.manifest.customerKey,
  });
  const manifest = structuredClone(synthetic.manifest);
  manifest.description =
    "Synthetic material, BOM, and purchase source fixtures for Product Core tests.";
  manifest.sources.push(...purchase.manifest.sources);
  const manifestPath = path.join(tempDir, "source-manifest.json");
  const xlsxPath = path.join(rawDir, synthetic.relativePath);
  const purchaseXlsxPath = path.join(rawDir, purchase.relativePath);
  await writeFile(xlsxPath, synthetic.xlsx);
  await writeFile(purchaseXlsxPath, purchase.xlsx);
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return {
    tempDir,
    rawDir,
    manifestPath,
    xlsxPath,
    sourcePaths: [xlsxPath, purchaseXlsxPath],
    relativePath: synthetic.relativePath,
    manifest,
  };
}

function findZipSignature(buffer, signature) {
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  throw new Error("synthetic zip signature not found");
}

function findStoredZipEntryData(buffer, expectedName) {
  for (let offset = 0; offset <= buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      continue;
    }
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    if (name === expectedName) {
      return offset + 30 + nameLength + extraLength;
    }
  }
  throw new Error("synthetic zip entry not found");
}
