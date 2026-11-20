import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildManualAcceptanceSourceDataPlan } from "./manual-acceptance-source-data.mjs";
import {
  MANUAL_ACCEPTANCE_PRODUCT_STYLES,
  buildManualAcceptanceProductAlbum,
  buildManualAcceptanceProductImage,
  reconcileManualAcceptanceProductImages,
} from "./manual-acceptance-product-images.mjs";

function backend() {
  const attachments = new Map();
  const calls = [];
  const rpc = async ({ method, params }) => {
    calls.push(method);
    if (method === "list_attachments")
      return {
        attachments: [...attachments.values()].filter(
          (item) => item.owner_id === params.owner_id,
        ),
      };
    if (method === "upload_attachment") {
      const content = Buffer.from(params.content_base64, "base64");
      const sha256 = createHash("sha256").update(content).digest("hex");
      const id = Math.max(0, ...attachments.keys()) + 1;
      const siblings = [...attachments.values()].filter(
        (item) => item.owner_id === params.owner_id,
      );
      const supplemental = params.slot_key === "supplemental";
      const supplementalRows = siblings.filter((item) =>
        item.slot_key.startsWith("supplemental_"),
      );
      const existing = supplementalRows.find((item) => item.sha256 === sha256);
      if (supplemental && existing) return { attachment: existing };
      const slot_key = supplemental
        ? Array.from({ length: 8 }, (_, i) => `supplemental_${i + 1}`).find(
            (slot) => !siblings.some((item) => item.slot_key === slot),
          )
        : params.slot_key;
      assert.ok(slot_key);
      for (const [key, row] of attachments)
        if (row.owner_id === params.owner_id && row.slot_key === slot_key)
          attachments.delete(key);
      const attachment = {
        ...params,
        id,
        slot_key,
        file_size: content.length,
        sha256,
      };
      attachments.set(attachment.id, attachment);
      return { attachment };
    }
    if (method === "download_attachment")
      return { attachment: attachments.get(params.id) };
    throw new Error(`unexpected ${method}`);
  };
  return { attachments, calls, rpc };
}

test("every product has matched main, alternate and detail photos in both volume profiles", () => {
  assert.equal(MANUAL_ACCEPTANCE_PRODUCT_STYLES.length, 20);
  assert.equal(
    new Set(MANUAL_ACCEPTANCE_PRODUCT_STYLES.map((item) => item.sha256)).size,
    20,
  );
  const albums = new Map();
  for (const sourceScaleProfile of ["acceptance", "volume"]) {
    const plan = buildManualAcceptanceSourceDataPlan({ sourceScaleProfile });
    for (const product of plan.records.products) {
      if (!albums.has(product.name))
        albums.set(product.name, buildManualAcceptanceProductAlbum(product));
      const photos = albums.get(product.name);
      assert.ok(photos.length >= 4);
      assert.equal(photos[0].slot, "primary");
      assert.equal(photos[1].slot, "secondary");
      assert.ok(photos.slice(2).every((item) => item.slot === "supplemental"));
      assert.ok(
        photos.every((item) => item.file_name.startsWith(product.name)),
      );
      assert.equal(
        new Set(photos.map((item) => item.sha256)).size,
        photos.length,
      );
    }
  }
  assert.equal(albums.size, 20);
  assert.deepEqual(
    [
      ...new Set([...albums.values()].flat().map((item) => item.mime_type)),
    ].sort(),
    ["image/jpeg", "image/png", "image/webp"],
  );
  assert.throws(
    () => buildManualAcceptanceProductImage({ name: "未登记款式" }),
    /not registered/u,
  );
});

test("an explicit repair replaces only the exact downloaded repository placeholder and replays safely", async () => {
  const b = backend();
  const product = { id: 7, code: "YS8-CP-001", name: "云朵小熊" };
  const placeholder = {
    id: 1,
    owner_type: "product",
    owner_id: 7,
    attachment_type: "product_image",
    slot_key: "primary",
    file_name: "YS8-CP-001-样品示意.png",
    sha256: "b17460cf5231ad74cbc4c2c15844e15f1fcbacbacdd83eac1571ae270ddc2833",
    content_base64: readFileSync(
      new URL("./fixtures/manual-acceptance-image.png", import.meta.url),
    ).toString("base64"),
  };
  b.attachments.set(1, structuredClone(placeholder));
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products: [product],
      rpc: b.rpc,
      apply: true,
    }),
  );
  assert.equal(b.calls.includes("upload_attachment"), false);
  b.attachments.get(1).content_base64 =
    Buffer.from("changed").toString("base64");
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products: [product],
      rpc: b.rpc,
      apply: true,
      placeholderReplacementIDs: [7],
    }),
    /placeholder download differs/u,
  );
  assert.equal(b.calls.includes("upload_attachment"), false);
  b.attachments.set(1, structuredClone(placeholder));
  const report = await reconcileManualAcceptanceProductImages({
    products: [product],
    rpc: b.rpc,
    apply: true,
    placeholderReplacementIDs: [7],
  });
  assert.equal(report.records[0].operation, "replace-placeholder");
  assert.equal(b.attachments.size, 1);
  b.calls.length = 0;
  await reconcileManualAcceptanceProductImages({
    products: [product],
    rpc: b.rpc,
    apply: true,
    placeholderReplacementIDs: [7],
  });
  assert.equal(b.calls.includes("upload_attachment"), false);
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products: [product],
      rpc: b.rpc,
      apply: true,
      placeholderReplacementIDs: [8],
    }),
    /scope/u,
  );
});

test("image apply persists the product slot, downloads bytes, and replays without writes", async () => {
  const b = backend();
  const products = [
    { id: 7, code: "YS9-CP-001", name: "云朵小熊" },
    { id: 8, code: "YS9-CP-002", name: "星星挂兔" },
  ];
  const applied = await reconcileManualAcceptanceProductImages({
    products,
    rpc: b.rpc,
    apply: true,
  });
  assert.equal(applied.actual, 2);
  assert.equal(applied.distinctStyles, 2);
  assert.ok(applied.photoCount >= 8);
  assert.equal(applied.photoCount, b.attachments.size);
  assert.equal(
    applied.records.every((item) => item.operation === "upload"),
    true,
  );
  b.calls.length = 0;
  const verified = await reconcileManualAcceptanceProductImages({
    products,
    rpc: b.rpc,
  });
  assert.equal(
    verified.records.every((item) => item.operation === "reuse"),
    true,
  );
  assert.equal(b.calls.includes("upload_attachment"), false);
  assert.equal(
    b.calls.filter((method) => method === "download_attachment").length,
    applied.photoCount,
  );
});

test("an existing main is reused and an unrelated secondary or full album is never overwritten", async () => {
  const b = backend();
  const product = { id: 7, code: "YS9-CP-001", name: "云朵小熊" };
  const main = buildManualAcceptanceProductImage(product);
  await b.rpc({
    method: "upload_attachment",
    params: {
      owner_type: "product",
      owner_id: product.id,
      attachment_type: "product_image",
      slot_key: "primary",
      file_name: main.file_name,
      mime_type: main.mime_type,
      content_base64: main.content.toString("base64"),
    },
  });
  b.attachments.set(2, {
    ...b.attachments.get(1),
    id: 2,
    slot_key: "secondary",
    file_name: "既有辅图.jpg",
  });
  b.calls.length = 0;
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products: [product],
      rpc: b.rpc,
      apply: true,
    }),
  );
  assert.ok(!b.calls.includes("upload_attachment"));
  b.attachments.delete(2);
  for (let i = 1; i <= 8; i++)
    b.attachments.set(i + 1, {
      ...b.attachments.get(1),
      id: i + 1,
      slot_key: `supplemental_${i}`,
      file_name: `已有附件${i}.jpg`,
    });
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products: [product],
      rpc: b.rpc,
      apply: true,
    }),
    /removing existing photos/u,
  );
  assert.ok(!b.calls.includes("upload_attachment"));
  for (let i = 2; i <= 9; i++) b.attachments.delete(i);
  const {
    records: [record],
  } = await reconcileManualAcceptanceProductImages({
    products: [product],
    rpc: b.rpc,
    apply: true,
  });
  assert.equal(record.operation, "reuse");
  assert.equal(record.attachmentId, 1);
  assert.ok(
    record.photos.slice(1).every((item) => item.operation === "upload"),
  );
});

test("readback refuses missing images, changed manual photos and corrupt downloads", async () => {
  const b = backend();
  const products = [{ id: 7, code: "YS9-CP-001", name: "云朵小熊" }];
  await assert.rejects(
    reconcileManualAcceptanceProductImages({ products, rpc: b.rpc }),
    /missing/u,
  );
  assert.equal(b.calls.includes("upload_attachment"), false);
  await reconcileManualAcceptanceProductImages({
    products,
    rpc: b.rpc,
    apply: true,
  });
  const photo = b.attachments.get(1);
  const originalName = photo.file_name;
  photo.file_name = "人工确认产品图.jpg";
  b.calls.length = 0;
  await assert.rejects(
    reconcileManualAcceptanceProductImages({
      products,
      rpc: b.rpc,
      apply: true,
    }),
  );
  assert.equal(b.calls.includes("upload_attachment"), false);
  photo.file_name = originalName;
  photo.content_base64 = Buffer.from("broken").toString("base64");
  await assert.rejects(
    reconcileManualAcceptanceProductImages({ products, rpc: b.rpc }),
    /download differs/u,
  );
});
