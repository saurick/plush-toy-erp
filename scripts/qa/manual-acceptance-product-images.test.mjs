import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildManualAcceptanceSourceDataPlan } from "./manual-acceptance-source-data.mjs";
import {
  MANUAL_ACCEPTANCE_PRODUCT_STYLES,
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
      const fixture = buildManualAcceptanceProductImage({
        name: params.file_name.replace(/-产品图\.jpg$/u, ""),
      });
      assert.equal(content.equals(fixture.content), true);
      const id = Math.max(0, ...attachments.keys()) + 1;
      for (const [key, row] of attachments)
        if (
          row.owner_id === params.owner_id &&
          row.slot_key === params.slot_key
        )
          attachments.delete(key);
      const attachment = {
        ...params,
        id,
        file_size: content.length,
        sha256: fixture.sha256,
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

test("every product in both scale profiles has a concrete, distinct style asset", () => {
  assert.equal(MANUAL_ACCEPTANCE_PRODUCT_STYLES.length, 20);
  assert.equal(
    new Set(MANUAL_ACCEPTANCE_PRODUCT_STYLES.map((item) => item.sha256)).size,
    20,
  );
  for (const sourceScaleProfile of ["acceptance", "volume"]) {
    const plan = buildManualAcceptanceSourceDataPlan({ sourceScaleProfile });
    for (const product of plan.records.products) {
      const image = buildManualAcceptanceProductImage(product);
      assert.equal(image.content.readUInt16BE(0), 0xffd8);
      assert.equal(image.file_name.includes(product.name), true);
    }
  }
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
    2,
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
