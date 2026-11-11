import assert from "node:assert/strict";
import { buildManualAcceptanceProductAlbum } from "./manual-acceptance-product-images.mjs";

function positive(id) {
  return Number.isSafeInteger(id) && id > 0;
}

export function buildManualAcceptanceImageEvidence({
  sourceReport,
  factReport,
}) {
  // Older standalone attachment receipts can still verify their fixed files.
  const images = sourceReport.productImages?.records;
  if (!images?.some((product) => Array.isArray(product.photos))) return [];
  const byID = new Map(images.map((product) => [product.productId, product]));
  const source = sourceReport.referenceRecords;
  const facts = factReport.referenceRecords;
  const choose = (rows, productOf, predicate = () => true) => {
    for (const row of rows || []) {
      const image = byID.get(productOf(row));
      if (positive(row.id) && image && predicate(row)) return { row, image };
    }
    return null;
  };
  const ofSales = (row) =>
    row.items?.find((line) => byID.has(line.productId))?.productId;
  const ofOutsource = (row) =>
    row.items?.find(
      (line) => line.subjectType === "PRODUCT" && byID.has(line.subjectId),
    )?.subjectId;
  const ofShipment = (row) =>
    row.items?.find((line) => byID.has(line.product_id))?.product_id;
  const ofQuality = (row) =>
    row.subject_type === "PRODUCT" ? row.subject_id : undefined;
  const candidates = [
    [
      "sales_order",
      "订单款式参考",
      choose(source.salesOrders, ofSales, (row) => row.items.length === 25),
      "side",
    ],
    [
      "product_sku",
      "规格外观参考",
      choose(source.skus, (row) => row.productId),
      "side",
    ],
    [
      "bom_header",
      "物料与工艺参考",
      choose(source.bomVersions, (row) => row.productId),
      "detail",
    ],
    [
      "outsourcing_order",
      "加工合同图样",
      choose(source.outsourcingOrders, ofOutsource),
      "side",
      "print_appendix",
    ],
    [
      "quality_inspection",
      "成品质检外观参考",
      choose(facts.qualityInspections, ofQuality),
      "detail",
    ],
    [
      "shipment",
      "出货款式核对",
      choose(facts.shipments, ofShipment, (row) => row.status === "SHIPPED"),
      "angle",
    ],
    [
      "shipment",
      "出货草稿款式核对",
      choose(facts.shipments, ofShipment, (row) => row.status === "DRAFT"),
      "side",
    ],
  ];
  return candidates.map(
    ([owner_type, label, candidate, viewKey, attachmentType]) => {
      assert.ok(
        candidate,
        `${label} needs a product-linked record from this batch`,
      );
      const { row, image } = candidate;
      const album = buildManualAcceptanceProductAlbum({
        name: image.productName,
      });
      const photo = album.find((item) => item.viewKey === viewKey);
      const reference = image.photos.find((item) => item.viewKey === viewKey);
      assert.equal(
        reference?.sha256,
        photo?.sha256,
        `${label} source photo differs`,
      );
      assert.ok(photo, `${label} has no matching fixture`);
      const extension = photo.file_name.slice(photo.file_name.lastIndexOf("."));
      return {
        owner_type,
        owner_id: row.id,
        files: 1,
        imageEvidence: { productCode: image.productCode, viewKey, label },
        fixtures: [
          {
            file_name: `${image.productCode}-${label}${extension}`,
            mime_type: photo.mime_type,
            content: photo.content,
            attachmentType: attachmentType || "manual_acceptance_evidence",
            sizeClass: "small",
          },
        ],
      };
    },
  );
}
