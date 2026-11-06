import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import catalog from "./fixtures/plush-products/catalog.json" with { type: "json" };

export const MANUAL_ACCEPTANCE_PRODUCT_STYLES = Object.freeze(catalog.products);
export const MANUAL_ACCEPTANCE_PRODUCT_IMAGE_FILES = Object.freeze([
  "scripts/qa/manual-acceptance-product-images.mjs",
  "scripts/qa/fixtures/plush-products/catalog.json",
  ...catalog.products.map(
    ({ file }) => `scripts/qa/fixtures/plush-products/${file}`,
  ),
]);

export function buildManualAcceptanceProductImage(product) {
  const style = catalog.products.find(({ name }) => name === product?.name);
  assert.ok(style, `product image is not registered for ${product?.name}`);
  const content = readFileSync(
    new URL(`./fixtures/plush-products/${style.file}`, import.meta.url),
  );
  const sha256 = createHash("sha256").update(content).digest("hex");
  assert.equal(sha256, style.sha256, `${style.name} image content drifted`);
  assert.ok(
    content.length > 10_000 && content.length < 5 * 1024 * 1024,
    `${style.name} image size is invalid`,
  );
  return {
    file_name: `${style.name}-产品图.jpg`,
    mime_type: "image/jpeg",
    content,
    sha256,
    styleKey: style.key,
  };
}

function assertMetadata(attachment, fixture, ownerID) {
  assert.ok(
    Number.isSafeInteger(attachment?.id) && attachment.id > 0,
    "product image attachment is missing",
  );
  assert.equal(attachment.owner_type, "product");
  assert.equal(Number(attachment.owner_id), ownerID);
  assert.equal(attachment.attachment_type, "product_image");
  assert.equal(attachment.slot_key, "primary");
  assert.equal(attachment.file_name, fixture.file_name);
  assert.equal(attachment.mime_type, fixture.mime_type);
  assert.equal(Number(attachment.file_size), fixture.content.length);
  assert.equal(attachment.sha256, fixture.sha256);
  assert.ok(!attachment.withdrawn_at, "product image has been withdrawn");
}

// 显式修复清单只允许仓库旧占位 PNG；正式接口继续保护已冻结的图片引用。
const PLACEHOLDER_PNG_SHA256 =
  "b17460cf5231ad74cbc4c2c15844e15f1fcbacbacdd83eac1571ae270ddc2833";

export async function reconcileManualAcceptanceProductImages({
  products,
  rpc,
  apply = false,
  placeholderReplacementIDs = [],
}) {
  const replacements = new Set(placeholderReplacementIDs);
  assert.ok(
    [...replacements].every(
      (id) =>
        Number.isSafeInteger(id) &&
        products.some((product) => product.id === id),
    ),
    "placeholder replacement scope must be explicit persisted products",
  );
  const records = [];
  for (const product of products) {
    const ownerID = Number(product.id);
    assert.ok(
      Number.isSafeInteger(ownerID) && ownerID > 0,
      `${product.code} has no persisted product`,
    );
    const fixture = buildManualAcceptanceProductImage(product);
    const params = { owner_type: "product", owner_id: ownerID };
    const list = () =>
      rpc({ domain: "attachment", method: "list_attachments", params });
    const listed = await list();
    assert.ok(
      Array.isArray(listed.attachments),
      `${product.code} image listing is incomplete`,
    );
    const slots = listed.attachments.filter(
      (item) =>
        item.attachment_type === "product_image" &&
        item.slot_key === "primary" &&
        !item.withdrawn_at,
    );
    assert.ok(slots.length <= 1, `${product.code} primary image is ambiguous`);
    let attachment = slots[0];
    let operation = "reuse";
    const replacing =
      attachment &&
      attachment.sha256 !== fixture.sha256 &&
      replacements.has(ownerID);
    if (replacing) {
      assert.equal(
        attachment.file_name,
        `${product.code}-样品示意.png`,
        "replacement must match the known generated placeholder name",
      );
      assert.equal(
        attachment.sha256,
        PLACEHOLDER_PNG_SHA256,
        "replacement must match the exact known placeholder content",
      );
      const original = (
        await rpc({
          domain: "attachment",
          method: "download_attachment",
          params: { id: attachment.id },
        })
      ).attachment;
      assert.equal(original.owner_type, "product");
      assert.equal(Number(original.owner_id), ownerID);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(original.content_base64 || "", "base64"))
          .digest("hex"),
        PLACEHOLDER_PNG_SHA256,
        "placeholder download differs",
      );
    }
    if ((!attachment || replacing) && apply) {
      attachment = (
        await rpc({
          domain: "attachment",
          method: "upload_attachment",
          params: {
            ...params,
            customer_key: "yoyoosun",
            attachment_type: "product_image",
            slot_key: "primary",
            file_name: fixture.file_name,
            mime_type: fixture.mime_type,
            content_base64: fixture.content.toString("base64"),
            note: "产品款式与外观资料",
          },
        })
      ).attachment;
      operation = replacing ? "replace-placeholder" : "upload";
    }
    assertMetadata(attachment, fixture, ownerID);
    const after = await list();
    const persisted = after.attachments?.filter(
      (item) =>
        item.attachment_type === "product_image" &&
        item.slot_key === "primary" &&
        !item.withdrawn_at,
    );
    assert.equal(
      persisted?.length,
      1,
      `${product.code} image slot did not persist`,
    );
    assertMetadata(persisted[0], fixture, ownerID);
    assert.equal(persisted[0].id, attachment.id);
    const downloaded = (
      await rpc({
        domain: "attachment",
        method: "download_attachment",
        params: { id: attachment.id },
      })
    ).attachment;
    assertMetadata(downloaded, fixture, ownerID);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(downloaded.content_base64 || "", "base64"))
        .digest("hex"),
      fixture.sha256,
      `${product.code} image download differs`,
    );
    records.push({
      productId: ownerID,
      productCode: product.code,
      productName: product.name,
      attachmentId: attachment.id,
      styleKey: fixture.styleKey,
      sha256: fixture.sha256,
      fileSize: fixture.content.length,
      operation,
    });
  }
  return {
    expected: products.length,
    actual: records.length,
    distinctStyles: new Set(records.map(({ styleKey }) => styleKey)).size,
    records,
  };
}
