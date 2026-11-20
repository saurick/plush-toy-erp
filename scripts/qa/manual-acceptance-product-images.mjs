import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AttachmentPolicy } from "../../web/src/common/consts/attachments.generated.mjs";
import { rasterImageMimeType } from "../../web/src/erp/utils/rasterImageType.mjs";
import catalog from "./fixtures/plush-products/catalog.json" with { type: "json" };

export const MANUAL_ACCEPTANCE_PRODUCT_STYLES = Object.freeze(catalog.products);
const ASSET_DIR = "scripts/qa/fixtures/plush-products";
const SUPPLEMENTAL = AttachmentPolicy.productImageSupplementalSlot;
const SUPPLEMENTAL_SLOTS = new Set(
  Array.from(
    { length: AttachmentPolicy.productImageSupplementalMaxCount },
    (_, index) => `${SUPPLEMENTAL}_${index + 1}`,
  ),
);
export const MANUAL_ACCEPTANCE_PRODUCT_IMAGE_FILES = Object.freeze([
  "scripts/qa/manual-acceptance-product-images.mjs",
  "web/src/common/consts/attachments.generated.mjs",
  "web/src/erp/utils/rasterImageType.mjs",
  `${ASSET_DIR}/catalog.json`,
  ...catalog.products.flatMap(({ file, views = [] }) =>
    [file, ...views.map((view) => view.file)].map(
      (asset) => `${ASSET_DIR}/${asset}`,
    ),
  ),
]);

function styleFor(product) {
  const style = catalog.products.find(({ name }) => name === product?.name);
  assert.ok(style, `product image is not registered for ${product?.name}`);
  return style;
}

function readFixture(style, image) {
  const extension = image.file.slice(image.file.lastIndexOf("."));
  assert.match(image.file, /^(?:views\/)?[a-z0-9_-]+\.(?:jpg|png|webp)$/u);
  const mime = AttachmentPolicy.productImageFileTypes[extension]?.[0];
  assert.ok(mime, `${style.name} has an unsupported fixture format`);
  const content = readFileSync(
    new URL(`./fixtures/plush-products/${image.file}`, import.meta.url),
  );
  const sha256 = createHash("sha256").update(content).digest("hex");
  assert.equal(sha256, image.sha256, `${style.name} image content drifted`);
  assert.equal(
    rasterImageMimeType(content),
    mime,
    `${style.name} image content does not match its format`,
  );
  assert.ok(
    content.length > 10_000 && content.length < 5 * 1024 * 1024,
    `${style.name} image size is invalid`,
  );
  return {
    file_name: `${style.name}-${image.label}${extension}`,
    mime_type: mime,
    content,
    sha256,
    styleKey: style.key,
    viewKey: image.key,
    slot: image.slot,
  };
}

export function buildManualAcceptanceProductImage(product) {
  const style = styleFor(product);
  return readFixture(style, {
    ...style,
    key: "front",
    slot: "primary",
    label: "产品图",
  });
}

export function buildManualAcceptanceProductAlbum(product) {
  const style = styleFor(product);
  const views = style.views;
  assert.ok(
    Array.isArray(views) &&
      views.length >= 2 &&
      views[0].slot === "secondary" &&
      views.slice(1).every((view) => view.slot === SUPPLEMENTAL) &&
      views.length - 1 <= SUPPLEMENTAL_SLOTS.size,
    `${style.name} album must contain an alternate angle and detail photos`,
  );
  const album = [
    buildManualAcceptanceProductImage(product),
    ...views.map((view) => readFixture(style, view)),
  ];
  for (const field of ["viewKey", "file_name", "sha256"]) {
    assert.equal(
      new Set(album.map((view) => view[field])).size,
      album.length,
      `${style.name} album repeats ${field}`,
    );
  }
  return album;
}

function matchesSlot(attachment, fixture) {
  return fixture.slot === SUPPLEMENTAL
    ? SUPPLEMENTAL_SLOTS.has(attachment.slot_key)
    : attachment.slot_key === fixture.slot;
}

function matchingPhoto(attachments, fixture) {
  const matches = attachments.filter(
    (item) =>
      matchesSlot(item, fixture) &&
      (fixture.slot !== SUPPLEMENTAL ||
        item.file_name === fixture.file_name ||
        item.sha256 === fixture.sha256),
  );
  assert.ok(
    matches.length <= 1,
    `${fixture.file_name} image slot is ambiguous`,
  );
  return matches[0];
}

function assertMetadata(attachment, fixture, ownerID) {
  assert.ok(
    Number.isSafeInteger(attachment?.id) && attachment.id > 0,
    "product image attachment is missing",
  );
  assert.equal(attachment.owner_type, "product");
  assert.equal(Number(attachment.owner_id), ownerID);
  assert.equal(attachment.attachment_type, "product_image");
  assert.ok(
    matchesSlot(attachment, fixture),
    `${fixture.file_name} has an invalid image slot`,
  );
  assert.equal(attachment.file_name, fixture.file_name);
  assert.equal(attachment.mime_type, fixture.mime_type);
  assert.equal(Number(attachment.file_size), fixture.content.length);
  assert.equal(attachment.sha256, fixture.sha256);
  assert.ok(!attachment.withdrawn_at, "product image has been withdrawn");
}

// 显式修复清单只允许仓库旧占位 PNG；正式接口继续保护已冻结的图片引用。
const PLACEHOLDER_PNG_SHA256 =
  "b17460cf5231ad74cbc4c2c15844e15f1fcbacbacdd83eac1571ae270ddc2833";

function assertDownloaded(attachment, fixture, ownerID) {
  assertMetadata(attachment, fixture, ownerID);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(attachment.content_base64 || "", "base64"))
      .digest("hex"),
    fixture.sha256,
    `${fixture.file_name} image download differs`,
  );
}

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
  const albumsByStyle = new Map();
  const activeImages = (listed, productCode) => {
    assert.ok(
      Array.isArray(listed.attachments),
      `${productCode} image listing is incomplete`,
    );
    return listed.attachments.filter(
      (item) => item.attachment_type === "product_image" && !item.withdrawn_at,
    );
  };
  for (const product of products) {
    const ownerID = Number(product.id);
    assert.ok(
      Number.isSafeInteger(ownerID) && ownerID > 0,
      `${product.code} has no persisted product`,
    );
    if (!replacements.has(ownerID) && !albumsByStyle.has(product.name)) {
      albumsByStyle.set(
        product.name,
        buildManualAcceptanceProductAlbum(product),
      );
    }
    const album = replacements.has(ownerID)
      ? [buildManualAcceptanceProductImage(product)]
      : albumsByStyle.get(product.name);
    const params = { owner_type: "product", owner_id: ownerID };
    const list = () =>
      rpc({ domain: "attachment", method: "list_attachments", params });
    const download = async (id) =>
      (
        await rpc({
          domain: "attachment",
          method: "download_attachment",
          params: { id },
        })
      ).attachment;
    const listed = activeImages(await list(), product.code);
    const planned = album.map((fixture) => {
      const attachment = matchingPhoto(listed, fixture);
      const replacing =
        fixture.slot === "primary" &&
        attachment &&
        attachment.sha256 !== fixture.sha256 &&
        replacements.has(ownerID);
      if (!replacing && (attachment || !apply))
        assertMetadata(attachment, fixture, ownerID);
      return { fixture, attachment, replacing, operation: "reuse" };
    });
    const missingSupplemental = planned.filter(
      ({ fixture, attachment }) => fixture.slot === SUPPLEMENTAL && !attachment,
    ).length;
    assert.ok(
      listed.filter((item) => SUPPLEMENTAL_SLOTS.has(item.slot_key)).length +
        missingSupplemental <=
        SUPPLEMENTAL_SLOTS.size,
      `${product.code} album cannot be added without removing existing photos`,
    );
    for (const item of planned) {
      const { fixture, attachment, replacing } = item;
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
        const original = await download(attachment.id);
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
        item.attachment = (
          await rpc({
            domain: "attachment",
            method: "upload_attachment",
            params: {
              ...params,
              customer_key: "yoyoosun",
              attachment_type: "product_image",
              slot_key: fixture.slot,
              file_name: fixture.file_name,
              mime_type: fixture.mime_type,
              content_base64: fixture.content.toString("base64"),
              note: "产品款式与外观资料",
            },
          })
        ).attachment;
        item.operation = replacing ? "replace-placeholder" : "upload";
      }
      assertMetadata(item.attachment, fixture, ownerID);
    }
    const after = planned.some((item) => item.operation !== "reuse")
      ? activeImages(await list(), product.code)
      : listed;
    const photos = await Promise.all(
      planned.map(async ({ fixture, attachment, operation }) => {
        const persisted = matchingPhoto(after, fixture);
        assertMetadata(persisted, fixture, ownerID);
        assert.equal(
          persisted.id,
          attachment.id,
          `${fixture.file_name} did not persist`,
        );
        assertDownloaded(await download(attachment.id), fixture, ownerID);
        return {
          attachmentId: attachment.id,
          viewKey: fixture.viewKey,
          slotKey: attachment.slot_key,
          fileName: fixture.file_name,
          mimeType: fixture.mime_type,
          sha256: fixture.sha256,
          fileSize: fixture.content.length,
          operation,
        };
      }),
    );
    const [primary] = photos;
    records.push({
      productId: ownerID,
      productCode: product.code,
      productName: product.name,
      attachmentId: primary.attachmentId,
      styleKey: album[0].styleKey,
      sha256: primary.sha256,
      fileSize: primary.fileSize,
      operation: primary.operation,
      photos,
    });
  }
  return {
    expected: products.length,
    actual: records.length,
    distinctStyles: new Set(records.map(({ styleKey }) => styleKey)).size,
    photoCount: records.reduce((sum, { photos }) => sum + photos.length, 0),
    records,
  };
}
