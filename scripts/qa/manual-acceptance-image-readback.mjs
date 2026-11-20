import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  MANUAL_ACCEPTANCE_BUSINESS_ROLE_KEYS,
  manualAcceptanceAccountSetForTarget,
} from "./manual-acceptance-account-identities.mjs";
import {
  assertManualAcceptanceRuntimeIdentityPrecondition,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function samplesBy(rows, key, perKind = 3) {
  const counts = new Map();
  return rows.filter((row) => {
    const kind = row[key];
    const count = counts.get(kind) || 0;
    if (count >= perKind) return false;
    counts.set(kind, count + 1);
    return true;
  });
}

function sameBatch(a, b) {
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
  ]) {
    assert.ok(a?.[key], `image readback is missing ${key}`);
    assert.equal(a[key], b?.[key], `image readback ${key} differs`);
  }
}

function sourceDocuments(report, type, references) {
  const indexed = new Map(references.map((row) => [row.id, row]));
  const records = report.steps.filter((step) => step.target === type);
  assert.ok(
    records.length >= indexed.size,
    `${type} batch steps are incomplete`,
  );
  assert.equal(new Set(records.map((step) => step.id)).size, records.length);
  return records.map((step) => indexed.get(step.id) || step);
}

export async function verifyManualAcceptanceImageReadback({
  sourceReport,
  factReport,
  attachmentReport,
  taskReport,
  rolePassword,
  targetAttestation,
  fetchImpl = fetch,
}) {
  sameBatch(sourceReport, factReport);
  sameBatch(sourceReport, attachmentReport);
  const policy = resolveManualAcceptanceTarget(sourceReport);
  const boundedFetch = (url, init) =>
    fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(25000),
    });
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    attestation: targetAttestation,
    fetchImpl: boundedFetch,
  });
  const users = manualAcceptanceAccountSetForTarget(
    policy.target,
  ).roleUsernames;
  let sequence = 0;
  async function rpc(domain, method, params, token) {
    const response = await boundedFetch(
      new URL(`/rpc/${domain}`, policy.backendURL),
      {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `manual-image-readback-${++sequence}`,
          method,
          params,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok || data.result?.code !== 0) {
      throw new Error(
        `${domain}.${method} HTTP ${response.status} / RPC ${data.result?.code ?? "unknown"}`,
      );
    }
    return data.result.data;
  }
  const tokens = new Map();
  async function call(role, domain, method, params) {
    assert.ok(users[role], `unregistered image verification role ${role}`);
    if (!tokens.has(role)) {
      tokens.set(
        role,
        rpc("auth", "admin_login", {
          username: users[role],
          password: rolePassword,
        }).then((auth) => {
          const token = auth?.access_token || auth?.token;
          assert.ok(token, `cannot verify images for ${role}`);
          return token;
        }),
      );
    }
    return rpc(domain, method, params, await tokens.get(role));
  }
  const session = await call(
    "admin",
    "customer_config",
    "get_effective_session",
    {
      customer_key: sourceReport.runtime.customerKey,
    },
  );
  assert.equal(
    session.session?.configRevision,
    sourceReport.runtime.configRevision,
  );

  const albums = sourceReport.productImages?.records;
  assert.ok(
    Array.isArray(albums) && albums.length > 0,
    "missing verified product albums",
  );
  assert.equal(albums.length, sourceReport.productImages.actual);
  const byProduct = new Map(albums.map((row) => [row.productId, row]));
  assert.equal(byProduct.size, albums.length);
  assert.equal(
    albums.reduce((total, row) => total + row.photos.length, 0),
    sourceReport.productImages.photoCount,
  );
  for (const album of albums) {
    assert.ok(
      album.photos.length >= 4,
      `${album.productCode} is missing album photos`,
    );
    assert.equal(album.photos[0].attachmentId, album.attachmentId);
    assert.equal(album.photos[0].slotKey, "primary");
    assert.equal(album.photos[1].slotKey, "secondary");
  }
  const code = (id) => {
    const product = byProduct.get(id);
    assert.ok(product, "image relationship is outside this product batch");
    return product.productCode;
  };
  async function thumbnailRefs(role, productIDs) {
    for (const product_ids of chunks([...new Set(productIDs)], 80)) {
      const { images } = await call(
        role,
        "attachment",
        "list_product_image_references",
        { product_ids },
      );
      const byID = new Map(
        images.map((row) => [row.product_id, row.image_attachment_id]),
      );
      assert.equal(byID.size, product_ids.length);
      for (const id of product_ids)
        assert.equal(
          byID.get(id),
          byProduct.get(id)?.attachmentId,
          `${role} ${code(id)} thumbnail`,
        );
    }
  }
  async function download(role, attachmentId, expected) {
    const { attachment } = await call(
      role,
      "attachment",
      "download_attachment",
      { id: attachmentId },
    );
    assert.equal(attachment?.id, attachmentId);
    for (const [key, value] of Object.entries(expected))
      assert.equal(attachment[key], value, `${role} image ${key}`);
    const bytes = Buffer.from(attachment.content_base64 || "", "base64");
    assert.ok(bytes.length > 0, `${role} image is empty`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expected.sha256,
      `${role} image bytes`,
    );
  }
  await thumbnailRefs(
    "engineering",
    albums.map((row) => row.productId),
  );
  const source = sourceReport.referenceRecords;
  const fact = factReport.referenceRecords;
  const documents = [];
  for (const [sourceType, role, rows, productsFor] of [
    [
      "sales_order",
      "sales",
      sourceDocuments(sourceReport, "sales_order", source.salesOrders),
      (row) => row.items?.map((item) => item.productId),
    ],
    ["production_order", "pmc", fact.productionOrders, null],
    [
      "outsourcing_order",
      "purchase",
      sourceDocuments(
        sourceReport,
        "outsourcing_order",
        source.outsourcingOrders,
      ),
      (row) =>
        row.items
          ?.filter((item) => item.subjectType === "PRODUCT")
          .map((item) => item.subjectId),
    ],
  ]) {
    assert.ok(rows?.length, `${sourceType} needs image-bearing samples`);
    const productIDs = new Set();
    const status = {};
    const samples = [];
    const materialOnlySamples = [];
    let withProduct = 0;
    for (const group of chunks(rows, 40)) {
      const { previews } = await call(
        role,
        "attachment",
        "list_document_product_previews",
        {
          source_type: sourceType,
          document_ids: group.map((row) => row.id),
        },
      );
      const indexed = new Map(previews.map((row) => [row.document_id, row]));
      assert.equal(indexed.size, group.length, `${sourceType} preview scope`);
      for (const row of group) {
        const preview = indexed.get(row.id);
        assert.ok(preview, `${sourceType} missing preview`);
        const expectedProducts = productsFor?.(row);
        const expected = expectedProducts
          ? [...new Set(expectedProducts)]
          : null;
        if (expected)
          assert.equal(
            preview.product_count,
            expected.length,
            `${sourceType} product count`,
          );
        if (!preview.product_count) {
          assert.equal(sourceType, "outsourcing_order");
          const lines = await call(
            role,
            "outsourcing_order",
            "list_outsourcing_order_items",
            {
              outsourcing_order_id: row.id,
              limit: 100,
              offset: 0,
            },
          );
          assert.ok(
            lines.total > 0 &&
              lines.outsourcing_order_items.length === lines.total,
          );
          assert.ok(
            lines.outsourcing_order_items.every(
              (item) =>
                item.subject_type === "MATERIAL" &&
                item.material_id > 0 &&
                !item.product_id,
            ),
            "an outsourcing record without a product image is not material-only",
          );
          if (materialOnlySamples.length < 3)
            materialOnlySamples.push(row.orderNo || row.key);
          continue;
        }
        assert.ok(preview.product_count > 0, `${sourceType} missing product`);
        const productID = preview.product_id;
        assert.ok(
          !expected || expected.includes(productID),
          `${sourceType} wrong product image owner`,
        );
        code(productID);
        productIDs.add(productID);
        withProduct++;
        const state = row.status || "source";
        status[state] = (status[state] || 0) + 1;
        if (status[state] <= 3)
          samples.push({
            sourceNo: row.orderNo || row.order_no || row.key,
            productCode: code(productID),
            productCount: preview.product_count,
            status: state,
          });
      }
    }
    assert.ok(withProduct > 0);
    await thumbnailRefs(role, [...productIDs]);
    documents.push({
      sourceType,
      role,
      total: rows.length,
      withProduct,
      materialOnly: rows.length - withProduct,
      status,
      samples,
      materialOnlySamples,
    });
  }

  const shipments = [];
  const shipmentProducts = new Set();
  for (const group of chunks(fact.shipments, 4)) {
    shipments.push(
      ...(await Promise.all(
        group.map(async (row) => {
          const { shipment } = await call(
            "warehouse",
            "operational_fact",
            "get_shipment",
            { id: row.id },
          );
          assert.equal(shipment?.shipment_no, row.shipment_no);
          const ids = shipment.items.map((item) => item.product_id);
          assert.ok(ids.length);
          assert.deepEqual(
            ids,
            row.items.map((item) => item.product_id),
            `${row.shipment_no} product identities`,
          );
          for (const id of ids) shipmentProducts.add(id);
          return {
            sourceNo: row.shipment_no,
            status: shipment.status,
            products: ids.map(code),
          };
        }),
      )),
    );
  }
  assert.ok(shipments.length > 0);
  await thumbnailRefs("warehouse", [...shipmentProducts]);
  const inventorySamples = [];
  for (const row of samplesBy(
    fact.inventoryTxns.filter(
      (row) => row.subject_type === "PRODUCT" && byProduct.has(row.subject_id),
    ),
    "txn_type",
  )) {
    const data = await call("warehouse", "inventory", "list_inventory_txns", {
      subject_type: "PRODUCT",
      subject_id: row.subject_id,
      lot_id: row.lot_id,
      txn_type: row.txn_type,
      limit: 100,
    });
    assert.ok(
      data.inventory_txns.some(
        (item) => item.id === row.id && item.subject_id === row.subject_id,
      ),
    );
    inventorySamples.push({
      transactionID: row.id,
      type: row.txn_type,
      productCode: code(row.subject_id),
      productID: row.subject_id,
    });
  }
  assert.ok(inventorySamples.length > 0);
  await thumbnailRefs(
    "warehouse",
    inventorySamples.map((row) => row.productID),
  );
  const qualitySamples = [];
  for (const row of samplesBy(
    fact.qualityInspections.filter(
      (row) => row.subject_type === "PRODUCT" && byProduct.has(row.subject_id),
    ),
    "status",
  )) {
    const { quality_inspection: inspection } = await call(
      "quality",
      "quality",
      "get_quality_inspection",
      { id: row.id },
    );
    assert.equal(inspection?.inspection_no, row.inspection_no);
    assert.equal(inspection.subject_id, row.subject_id);
    qualitySamples.push({
      sourceNo: row.inspection_no,
      status: inspection.status,
      productCode: code(row.subject_id),
      productID: row.subject_id,
    });
  }
  assert.ok(qualitySamples.length > 0);
  await thumbnailRefs(
    "quality",
    qualitySamples.map((row) => row.productID),
  );

  const taskRoles = {};
  const defaultBoards = {};
  for (const roleGroup of chunks(MANUAL_ACCEPTANCE_BUSINESS_ROLE_KEYS, 3)) {
    await Promise.all(
      roleGroup.map(async (role) => {
        const statusCounts = {};
        const samples = [];
        let linked = 0;
        let total = null;
        for (
          let offset = 0, pages = 0;
          total === null || offset < total;
          pages++
        ) {
          assert.ok(
            pages < 100,
            `${role} task image pagination exceeded its bound`,
          );
          const data = await call(role, "workflow", "list_tasks", {
            owner_role_key: role,
            limit: 100,
            offset,
          });
          assert.ok(
            total === null || total === data.total,
            `${role} task list changed during verification`,
          );
          total = data.total;
          for (const task of data.tasks) {
            const items =
              task.display_context?.items?.filter(
                (item) =>
                  item.kind === "product" && byProduct.has(item.product_id),
              ) || [];
            if (!items.length) continue;
            assert.equal(task.owner_role_key, role);
            assert.ok(
              task.source_type && task.source_id > 0 && task.source_no,
              `${role} task has no source`,
            );
            for (const item of items)
              assert.equal(
                item.image_attachment_id,
                byProduct.get(item.product_id).attachmentId,
                `${role} ${task.task_code} image differs`,
              );
            linked++;
            const status = task.task_status_key;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            if (statusCounts[status] <= 3)
              samples.push({
                code: task.task_code,
                sourceNo: task.source_no,
                status,
                productCode: code(items[0].product_id),
                productID: items[0].product_id,
              });
          }
          assert.ok(
            data.tasks.length || offset === total,
            `${role} tasks ended before their declared total`,
          );
          if (!data.tasks.length) break;
          offset += data.tasks.length;
        }
        assert.ok(
          samples.length > 0,
          `${role} has no product-linked tasks with images`,
        );
        const product = byProduct.get(samples[0].productID);
        await download(role, product.attachmentId, {
          owner_type: "product",
          owner_id: product.productId,
          sha256: product.sha256,
        });
        taskRoles[role] = { linked, statusCounts, samples };
      if (taskReport?.dailyTaskBoard) {
        const board = await call(role, "workflow", "get_task_board", {
          todo_only: true, limit: 20, offset: 0,
        });
        const rows = board.lanes.flatMap((lane) => lane.tasks || []);
        const preserved = new Set(taskReport.dailyTaskBoard.preserved.map((row) => row.code));
        const previousPrefix = taskReport.dailyTaskBoard.previousPrefixes[role];
        assert.ok(previousPrefix, `${role} previous fixture scope was not recorded`);
        const unexpected = rows.filter((row) =>
          row.task_code.startsWith(previousPrefix) && !row.source_id && !preserved.has(row.task_code));
        assert.equal(unexpected.length, 0, `${role} default board still has old source-less fixtures`);
        const linkedDefault = rows.filter((row) => (row.display_context?.items || []).some((item) =>
          item.kind === "product" && byProduct.get(item.product_id)?.attachmentId === item.image_attachment_id)).length;
        assert.ok(linkedDefault > 0, `${role} default board has no current product images`);
        defaultBoards[role] = { returnedByLane: rows.length, linkedCurrentProducts: linkedDefault };
      }
      }),
    );
  }

  const attachmentRoles = {
    sales_order: "sales",
    product_sku: "engineering",
    bom_header: "engineering",
    outsourcing_order: "purchase",
    quality_inspection: "quality",
    shipment: "warehouse",
  };
  const imageEvidence = attachmentReport.steps.filter(
    (step) => step.imageEvidence,
  );
  assert.equal(
    imageEvidence.length,
    7,
    "business attachment image samples are incomplete",
  );
  for (const step of imageEvidence)
    await download(attachmentRoles[step.ownerType], step.attachmentId, {
      owner_type: step.ownerType,
      owner_id: step.ownerId,
      sha256: step.sha256,
      attachment_type: step.attachmentType,
    });
  assert.ok(
    imageEvidence.some((row) => row.attachmentType === "print_appendix"),
  );
  return {
    passed: true,
    dataVersion: sourceReport.dataVersion,
    runId: sourceReport.runId,
    products: albums.length,
    photos: sourceReport.productImages.photoCount,
    documents,
    shipmentsChecked: shipments.length,
    shipmentSamples: samplesBy(shipments, "status"),
    inventorySamples,
    qualitySamples,
    taskRoles,
    ...(taskReport?.dailyTaskBoard ? { defaultBoards } : {}),
    linkedTasks: Object.values(taskRoles).reduce(
      (n, role) => n + role.linked,
      0,
    ),
    attachments: imageEvidence.map(
      ({ ownerType, ownerId, imageEvidence, attachmentType }) => ({
        ownerType,
        ownerId,
        ...imageEvidence,
        attachmentType,
      }),
    ),
    browserAndPdfPending: true,
  };
}
