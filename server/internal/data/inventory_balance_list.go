package data

import (
	"context"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/warehouse"
)

func (r *inventoryRepo) ListInventoryBalances(ctx context.Context, filter biz.InventoryBalanceFilter) ([]*biz.InventoryBalance, int, error) {
	return r.listInventoryBalances(ctx, filter, biz.WarehouseDataScope{Mode: biz.DataScopeModeAll})
}

func (r *inventoryRepo) ListInventoryBalancesForAccess(ctx context.Context, filter biz.InventoryBalanceFilter, scope biz.WarehouseDataScope) ([]*biz.InventoryBalance, int, error) {
	return r.listInventoryBalances(ctx, filter, biz.NormalizeWarehouseDataScope(scope))
}

func inventoryBalancePredicates(filter biz.InventoryBalanceFilter, scope biz.WarehouseDataScope) []predicate.InventoryBalance {
	var predicates []predicate.InventoryBalance
	if filter.StockCategory != "" {
		predicates = append(predicates, inventoryMaterialCategoryPredicate(filter.StockCategory))
	}
	if scope.Mode == biz.DataScopeModeAssigned {
		predicates = append(predicates, inventorybalance.WarehouseIDIn(scope.WarehouseIDs...))
	}
	if filter.SubjectType != "" {
		predicates = append(predicates, inventorybalance.SubjectTypeEQ(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		predicates = append(predicates, inventorybalance.SubjectIDEQ(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		predicates = append(predicates, inventorybalance.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		predicates = append(predicates, inventorybalance.WarehouseIDEQ(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		predicates = append(predicates, inventorybalance.LotIDEQ(filter.LotID))
	}
	if filter.Keyword != "" {
		id := parsePositiveIntOrZero(filter.Keyword)
		predicates = append(predicates, inventorybalance.Or(
			businessDocumentKeyword("balance", filter.Keyword),
			inventorybalance.SubjectTypeContainsFold(filter.Keyword),
			inventorybalance.IDEQ(id), inventorybalance.SubjectIDEQ(id), inventorybalance.ProductSkuIDEQ(id),
			inventorybalance.WarehouseIDEQ(id), inventorybalance.LotIDEQ(id), inventorybalance.UnitIDEQ(id),
		))
	}
	return predicates
}

func (r *inventoryRepo) listInventoryBalances(ctx context.Context, filter biz.InventoryBalanceFilter, scope biz.WarehouseDataScope) ([]*biz.InventoryBalance, int, error) {
	out := []*biz.InventoryBalance{}
	if scope.Mode != biz.DataScopeModeAll && scope.Mode != biz.DataScopeModeAssigned {
		return out, 0, nil
	}
	predicates := inventoryBalancePredicates(filter, scope)
	total, err := r.data.postgres.InventoryBalance.Query().Where(predicates...).Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	if total <= filter.Offset {
		return out, total, nil
	}
	query, args := inventoryBalanceListPageSQL(ctx, r.data.sqlDialect, filter, predicates)
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		item := &biz.InventoryBalance{}
		var invalidSource int
		if err := rows.Scan(&item.ID, &item.SubjectType, &item.SubjectID, &item.ProductSkuID, &item.WarehouseID, &item.LotID,
			&item.UnitID, &item.Quantity, &item.UpdatedAt, &item.StockCategory, &item.LotStatus, &item.ActiveReservedQuantity,
			&item.AvailableQuantity, &item.IssuableQuantity, &item.RestrictedQuantity, &item.PendingInspectionQuantity,
			&item.PendingPackagingQuantity, &item.ReadyToShipQuantity, &invalidSource); err != nil {
			return nil, 0, err
		}
		if invalidSource != 0 {
			return nil, 0, biz.ErrProductionOrderFactSourceInvalid
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

func inventoryBalanceListPageSQL(ctx context.Context, dialectName string, filter biz.InventoryBalanceFilter, predicates []predicate.InventoryBalance) (string, []any) {
	if dialectName == "" {
		dialectName = dialect.Postgres
	}
	d := entsql.Dialect(dialectName)
	balance := d.Table(inventorybalance.Table)
	lot := d.Table(inventorylot.Table)
	m := d.Table(material.Table)
	scoped := d.Select(balance.Columns(inventorybalance.Columns...)...).From(balance).WithContext(ctx)
	scoped.LeftJoin(lot).On(balance.C(inventorybalance.FieldLotID), lot.C(inventorylot.FieldID))
	scoped.LeftJoin(m).OnP(entsql.And(
		entsql.EQ(balance.C(inventorybalance.FieldSubjectType), biz.InventorySubjectMaterial),
		entsql.ColumnsEQ(balance.C(inventorybalance.FieldSubjectID), m.C(material.FieldID)),
	))
	scoped.AppendSelectExprAs(entsql.Expr("COALESCE("+lot.C(inventorylot.FieldStatus)+", 'ACTIVE')"), "lot_status")
	scoped.AppendSelectExprAs(entsql.Expr("COALESCE("+m.C(material.FieldStockCategory)+", '')"), "stock_category")
	for _, predicate := range predicates {
		predicate(scoped)
	}

	field := "updated_at"
	groupByUnit := false
	switch filter.SortBy {
	case biz.InventorySortSubjectCode:
		p := d.Table(product.Table)
		scoped.LeftJoin(p).OnP(entsql.And(
			entsql.EQ(balance.C(inventorybalance.FieldSubjectType), biz.InventorySubjectProduct),
			entsql.ColumnsEQ(balance.C(inventorybalance.FieldSubjectID), p.C(product.FieldID)),
		))
		scoped.AppendSelectExprAs(entsql.Expr("COALESCE("+m.C(material.FieldCode)+", "+p.C(product.FieldCode)+")"), "subject_code")
		field = "subject_code"
	case biz.InventorySortWarehouseName:
		w := d.Table(warehouse.Table)
		scoped.LeftJoin(w).On(balance.C(inventorybalance.FieldWarehouseID), w.C(warehouse.FieldID))
		scoped.AppendSelectExprAs(entsql.Expr(w.C(warehouse.FieldName)), "warehouse_name")
		field = "warehouse_name"
	case biz.InventorySortLotNo:
		scoped.AppendSelectExprAs(entsql.Expr(lot.C(inventorylot.FieldLotNo)), "lot_no")
		field = "lot_no"
	case biz.InventorySortQuantity:
		field = "quantity"
	case biz.InventorySortIssuable:
		field, groupByUnit = "issuable_quantity", true
	case biz.InventorySortRestricted:
		field, groupByUnit = "restricted_quantity", true
	case biz.InventorySortReadyToShip:
		field, groupByUnit = "ready_to_ship_quantity", true
	}
	direction := " DESC"
	if filter.SortDirection == "asc" {
		direction = " ASC"
	}
	order := field + direction + " NULLS LAST,id DESC"
	if groupByUnit {
		order = "CASE WHEN " + field + " IS NULL THEN 1 ELSE 0 END,unit_id," + order
	}
	candidateSQL, args := scoped.Query()
	params := inventorySQLPlaceholders(dialectName, len(args)+2)
	page := " LIMIT " + params[len(args)] + " OFFSET " + params[len(args)+1]
	args = append(args, filter.Limit, filter.Offset)
	// Only shipment readiness needs reservation and receipt aggregates before
	// paging. Ordinary browsing and the lot-only sorts calculate them for the page.
	basePage, finalPage := " ORDER BY "+order+page, ""
	if filter.SortBy == biz.InventorySortReadyToShip {
		basePage, finalPage = "", page
	}
	return `WITH scoped AS (` + candidateSQL + `), stock AS (
 SELECT scoped.*,
 CASE WHEN subject_type='MATERIAL' THEN CASE WHEN lot_status='ACTIVE' THEN quantity ELSE 0 END END AS issuable_quantity,
 CASE WHEN lot_status<>'ACTIVE' THEN quantity ELSE 0 END AS restricted_quantity
 FROM scoped
 ), balances AS (SELECT * FROM stock` + basePage + `),
 reservations AS (
 SELECT b.id AS balance_id,SUM(s.quantity) AS quantity FROM balances b JOIN stock_reservations s
 ON s.product_id=b.subject_id AND s.warehouse_id=b.warehouse_id AND s.unit_id=b.unit_id
 AND s.product_sku_id IS NOT DISTINCT FROM b.product_sku_id AND s.lot_id IS NOT DISTINCT FROM b.lot_id
 WHERE b.subject_type='PRODUCT' AND s.status='ACTIVE' GROUP BY b.id
 ), receipts AS (
 SELECT f.*,b.id AS balance_id FROM balances b JOIN production_facts f
 ON f.subject_id=b.subject_id AND f.warehouse_id=b.warehouse_id AND f.unit_id=b.unit_id
 AND f.product_sku_id IS NOT DISTINCT FROM b.product_sku_id AND f.lot_id IS NOT DISTINCT FROM b.lot_id
 WHERE b.subject_type='PRODUCT' AND f.fact_type='FINISHED_GOODS_RECEIPT' AND f.status='POSTED'
 AND f.production_wip_batch_id IS NOT NULL
 )` + productionReceiptReadinessCTEs + `, readiness AS (
 SELECT balance_id,SUM(inspection_quantity) AS pending_inspection_quantity,
 SUM(packaging_quantity) AS pending_packaging_quantity,MAX(invalid_source) AS invalid_source
 FROM receipt_readiness GROUP BY balance_id
 ), available AS (
 SELECT b.*,COALESCE(s.quantity,0) AS active_reserved_quantity,
 CASE WHEN b.quantity>COALESCE(s.quantity,0) THEN b.quantity-COALESCE(s.quantity,0) ELSE 0 END AS available_quantity,
 COALESCE(r.pending_inspection_quantity,0) AS pending_inspection_quantity,
 COALESCE(r.pending_packaging_quantity,0) AS pending_packaging_quantity,COALESCE(r.invalid_source,0) AS invalid_source
 FROM balances b LEFT JOIN reservations s ON s.balance_id=b.id LEFT JOIN readiness r ON r.balance_id=b.id
 ), ranked AS (
 SELECT available.*,CASE WHEN subject_type='PRODUCT' THEN
 CASE WHEN lot_status='ACTIVE' AND available_quantity>pending_inspection_quantity+pending_packaging_quantity
 THEN available_quantity-pending_inspection_quantity-pending_packaging_quantity ELSE 0 END END AS ready_to_ship_quantity
 FROM available
 ) SELECT id,subject_type,subject_id,product_sku_id,warehouse_id,lot_id,unit_id,quantity,updated_at,stock_category,lot_status,
 active_reserved_quantity,available_quantity,COALESCE(issuable_quantity,0),restricted_quantity,
 pending_inspection_quantity,pending_packaging_quantity,COALESCE(ready_to_ship_quantity,0),invalid_source
 FROM ranked ORDER BY ` + order + finalPage, args
}
