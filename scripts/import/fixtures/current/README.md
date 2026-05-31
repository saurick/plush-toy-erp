# Current Import Dry-run Fixtures

These fixtures are synthetic samples for `scripts/import/currentCustomerDryRun.mjs`.
They contain no real customer data and are only used to verify the dry-run tooling.

The `*.freeze.sample.json` fixtures are also synthetic / sanitized. They are not
customer data, not import approval, and not evidence that real import execution is
allowed. They exist only for the 012 source snapshot freeze checker and dry-run
evidence preparation flow.

## Files

| file | purpose |
|---|---|
| `source-snapshot.sample.json` | Minimal source snapshot with customer update/create, duplicate, supplier review, contact owner block, sales order candidate, sales order item unit block, SKU/purchase deferred, shipment/inventory/finance forbidden, workflow done forbidden, and demo/debug skip rows. |
| `existing-v1.sample.json` | Minimal existing V1/formal model snapshot used for matching customers, products, units, warehouses, and duplicate customer detection. |
| `source-snapshot.freeze.sample.json` | Larger sanitized freeze source snapshot covering customer update/create, supplier review, contact with owner, contact missing owner, sales order and item candidates, unknown unit, product/material/unit/warehouse references, BOM candidate, product_skus and purchase_orders deferred rows, shipment/inventory/finance forbidden rows, shipping boundary, workflow/fact boundary, and sensitive field-name warning. |
| `existing-v1.freeze.sample.json` | Sanitized existing V1/formal model snapshot for freeze evidence and real dry-run evidence generation. |

## Source Snapshot Format

```json
{
  "version": 1,
  "generatedAt": "2026-05-31T00:00:00.000Z",
  "sources": [
    {
      "sourceId": "src-customer-update",
      "sourceType": "Data Import Source",
      "sourceKind": "business_records",
      "moduleKey": "partners",
      "fileName": "business-records-export.json",
      "sheetName": null,
      "rowNumber": 1,
      "domain": "customers",
      "fields": {
        "document_no": "C001",
        "title": "Existing Customer"
      },
      "items": []
    }
  ]
}
```

`--strict-source` requires every source row to include `sourceId`, `sourceType`, `sourceKind`, `moduleKey`, `domain`, and `fields`.

## Existing Snapshot Format

```json
{
  "version": 1,
  "customers": [
    {
      "id": "customer-1",
      "code": "C001",
      "name": "Existing Customer",
      "displayName": "Existing Customer",
      "status": "active"
    }
  ],
  "suppliers": [],
  "contacts": [],
  "salesOrders": [],
  "salesOrderItems": [],
  "products": [],
  "materials": [],
  "units": [],
  "warehouses": [],
  "bomHeaders": [],
  "bomItems": []
}
```

The existing snapshot is read-only matching input. The CLI never reads from or writes to a database.

## Freeze Fixture Boundary

`source-snapshot.freeze.sample.json` and `existing-v1.freeze.sample.json` are
safe fixtures for repeatable evidence generation:

- Synthetic / sanitized only.
- No real customer sensitive data.
- No import approval.
- No database read or write.
- No loader, SQL, migration, API, UI, seedData, docs registry, or
  `business_records` runtime change.
- `shipment`, `inventory`, and `finance` rows are intentionally present only as
  forbidden evidence.
- `shipping_released != shipped`.
- `workflow task done != fact posted`.
