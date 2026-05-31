# Current Import Dry-run Fixtures

These fixtures are synthetic samples for `scripts/import/currentCustomerDryRun.mjs`.
They contain no real customer data and are only used to verify the dry-run tooling.

## Files

| file | purpose |
|---|---|
| `source-snapshot.sample.json` | Minimal source snapshot with customer update/create, duplicate, supplier review, contact owner block, sales order candidate, sales order item unit block, SKU/purchase deferred, shipment/inventory/finance forbidden, workflow done forbidden, and demo/debug skip rows. |
| `existing-v1.sample.json` | Minimal existing V1/formal model snapshot used for matching customers, products, units, warehouses, and duplicate customer detection. |

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
