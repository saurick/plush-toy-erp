package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strings"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

// Aggregate and filter in SQL before paging. Reading a page never loads every
// production order or reconstructs business state from workflow payloads.
func warehouseProductionWorkQuery(ctx context.Context, filter biz.WarehouseProductionWorkFilter) (string, []any) {
	args := []any{}
	bind := func(value any) string { args = append(args, value); return fmt.Sprintf("$%d", len(args)) }
	identity := `COALESCE(NULLIF(i.product_name_snapshot,''),p.name,'') AS product_name,
 COALESCE(NULLIF(i.product_code_snapshot,''),p.code,'') AS product_code,
 COALESCE(NULLIF(i.sku_code_snapshot,''),sk.sku_code,'') AS sku_code,
 COALESCE(NULLIF(i.unit_name_snapshot,''),u.name,'') AS unit_name`
	var base string
	if filter.Kind == biz.WarehouseProductionKindReturn {
		base = `WITH work AS (
 SELECT b.id,b.production_order_id,b.production_order_item_id,po.order_no,
 0 AS fact_id,'' AS fact_no,'' AS fact_status,0 AS fact_version,b.id AS batch_id,b.batch_no,
 op.process_name_snapshot AS operation_name,` + identity + `,0 AS warehouse_id,'' AS warehouse_name,'' AS lot_no,
 CAST(b.quantity AS TEXT) AS quantity,'0' AS pending_inspection_quantity,'0' AS pending_packaging_quantity,
 0 AS packaging_confirmed,b.id AS action_batch_id,
 CASE WHEN b.status='OUTSOURCED' THEN 'RECEIVE_OUTSOURCING_RETURN' ELSE '' END AS action,
 CASE WHEN b.status='OUTSOURCED' THEN 'AWAITING_RETURN'
 WHEN b.status='WAITING_QUALITY' THEN 'AWAITING_QUALITY'
 WHEN b.status='REJECTED' THEN 'REJECTED'
 WHEN b.status='CANCELLED' THEN 'CANCELLED' ELSE 'COMPLETED' END AS stage
 FROM production_wip_batches b
 JOIN production_order_operations op ON op.id=b.production_order_operation_id
 JOIN production_order_items i ON i.id=b.production_order_item_id
 JOIN production_orders po ON po.id=b.production_order_id
 JOIN products p ON p.id=i.product_id JOIN units u ON u.id=i.unit_id
 LEFT JOIN product_skus sk ON sk.id=i.product_sku_id
 WHERE b.execution_mode='OUTSOURCED' AND b.started_at IS NOT NULL AND b.status<>'SPLIT'
 )`
	} else {
		scopeSQL := ""
		if scope, exists := biz.WarehouseDataScopeFromContext(ctx); exists && !scope.IsAll() {
			ids := []string{}
			if scope.Mode == biz.DataScopeModeAssigned {
				for _, id := range scope.WarehouseIDs {
					ids = append(ids, bind(id))
				}
			}
			if len(ids) == 0 {
				scopeSQL = " AND 1=0"
			} else {
				scopeSQL = " AND f.warehouse_id IN (" + strings.Join(ids, ",") + ")"
			}
		}
		// The remaining and packing quantities follow the same receipt-grain
		// rules as inventory readiness, including rework and signed disposition.
		base = `WITH receipts AS (
 SELECT f.* FROM production_facts f WHERE f.fact_type='FINISHED_GOODS_RECEIPT'` + scopeSQL + `
 ), packed AS (
 SELECT b.finished_goods_receipt_id AS receipt_id,
 SUM(CASE WHEN b.status='ACCEPTED' THEN b.quantity ELSE 0 END) AS quantity,
 MIN(CASE WHEN b.status='IN_PROGRESS' THEN b.id END) AS running_id,
 MIN(CASE WHEN b.status='PLANNED' AND b.execution_mode IS NULL THEN b.id END) AS unassigned_id,
 MIN(CASE WHEN b.status='PLANNED' THEN b.id END) AS planned_id
 FROM production_wip_batches b JOIN production_order_operations op ON op.id=b.production_order_operation_id
 JOIN receipts f ON f.id=b.finished_goods_receipt_id
 WHERE op.operation_code='PACKAGING' AND b.status NOT IN ('CANCELLED','SPLIT') GROUP BY b.finished_goods_receipt_id
 ), reworked AS (
 SELECT f.source_id AS receipt_id,SUM(f.quantity) AS quantity FROM production_facts f JOIN receipts r ON r.id=f.source_id
 WHERE f.fact_type='REWORK' AND f.source_type='PRODUCTION_FACT' AND f.status='POSTED' GROUP BY f.source_id
 ), disposed AS (
 SELECT t.source_line_id AS receipt_id,SUM(t.quantity*t.direction) AS signed_quantity FROM inventory_txns t
 JOIN receipts r ON r.id=t.source_line_id WHERE t.source_type='PRODUCTION_EXCEPTION' GROUP BY t.source_line_id
 ), remaining AS (
 SELECT f.*,CASE WHEN f.quantity-COALESCE(r.quantity,0)+COALESCE(d.signed_quantity,0)>0
 THEN f.quantity-COALESCE(r.quantity,0)+COALESCE(d.signed_quantity,0) ELSE 0 END AS remaining_quantity
 FROM receipts f LEFT JOIN reworked r ON r.receipt_id=f.id LEFT JOIN disposed d ON d.receipt_id=f.id
 ), ready AS (
 SELECT f.*,b.status AS batch_status,op.operation_code,COALESCE(pc.status='CONFIRMED',FALSE) AS packaging_confirmed,
 COALESCE(pk.running_id,pk.unassigned_id,pk.planned_id,b.id,0) AS action_batch_id,
 CASE WHEN f.status<>'POSTED' OR (op.operation_code='PACKAGING' AND b.status='ACCEPTED') THEN 0
 WHEN b.status IS NULL OR b.status<>'ACCEPTED' THEN f.remaining_quantity ELSE 0 END AS inspection_quantity,
 CASE WHEN f.status='POSTED' AND b.status='ACCEPTED' AND op.operation_code<>'PACKAGING' AND f.remaining_quantity>COALESCE(pk.quantity,0)
 THEN f.remaining_quantity-COALESCE(pk.quantity,0) ELSE 0 END AS packaging_quantity,
 CASE WHEN pk.running_id IS NOT NULL THEN 'COMPLETE_OPERATION' WHEN pk.unassigned_id IS NOT NULL THEN 'ASSIGN_EXECUTION' WHEN pk.planned_id IS NOT NULL THEN 'START_OPERATION'
 ELSE 'TRANSFER_TO_NEXT_OPERATION' END AS packing_action
 FROM remaining f LEFT JOIN production_wip_batches b ON b.id=f.production_wip_batch_id
 LEFT JOIN production_order_operations op ON op.id=b.production_order_operation_id
 LEFT JOIN production_packaging_confirmations pc ON pc.production_order_item_id=b.production_order_item_id
 LEFT JOIN packed pk ON pk.receipt_id=f.id
 ), work AS (
 SELECT f.id,COALESCE(b.production_order_id,0) AS production_order_id,COALESCE(b.production_order_item_id,0) AS production_order_item_id,
 COALESCE(po.order_no,'') AS order_no,f.id AS fact_id,f.fact_no,f.status AS fact_status,f.version AS fact_version,
 COALESCE(b.id,0) AS batch_id,COALESCE(b.batch_no,'') AS batch_no,COALESCE(op.process_name_snapshot,'') AS operation_name,
 ` + identity + `,f.warehouse_id,w.name AS warehouse_name,COALESCE(l.lot_no,'') AS lot_no,CAST(f.quantity AS TEXT) AS quantity,
 CAST(f.inspection_quantity AS TEXT) AS pending_inspection_quantity,CAST(f.packaging_quantity AS TEXT) AS pending_packaging_quantity,
 f.packaging_confirmed,f.action_batch_id,
 CASE WHEN f.status='POSTED' AND f.packaging_quantity>0 THEN f.packing_action ELSE '' END AS action,
 CASE WHEN f.status='CANCELLED' THEN 'CANCELLED' WHEN f.status='DRAFT' THEN 'AWAITING_INBOUND'
 WHEN f.remaining_quantity=0 THEN 'COMPLETED' WHEN f.batch_status='REJECTED' THEN 'REJECTED'
 WHEN f.inspection_quantity>0 THEN 'AWAITING_QUALITY' WHEN f.packaging_quantity>0 THEN 'AWAITING_PACKAGING' ELSE 'READY' END AS stage
 FROM ready f LEFT JOIN production_wip_batches b ON b.id=f.production_wip_batch_id
 LEFT JOIN production_order_operations op ON op.id=b.production_order_operation_id
 LEFT JOIN production_order_items i ON i.id=b.production_order_item_id
 LEFT JOIN production_orders po ON po.id=b.production_order_id
 JOIN products p ON p.id=f.subject_id JOIN units u ON u.id=f.unit_id
 LEFT JOIN product_skus sk ON sk.id=f.product_sku_id
 JOIN warehouses w ON w.id=f.warehouse_id LEFT JOIN inventory_lots l ON l.id=f.lot_id
 )`
	}
	where := "1=1"
	if filter.Keyword != "" {
		pattern := bind("%" + strings.ToLower(filter.Keyword) + "%")
		parts := []string{}
		for _, field := range []string{"order_no", "fact_no", "batch_no", "product_name", "product_code", "sku_code", "warehouse_name", "lot_no", "operation_name"} {
			parts = append(parts, "LOWER("+field+") LIKE "+pattern)
		}
		where += " AND (" + strings.Join(parts, " OR ") + ")"
	}
	return base + ", filtered AS (SELECT * FROM work WHERE " + where + ")", args
}

func (r *productionOrderRepo) ListWarehouseProductionWork(ctx context.Context, filter biz.WarehouseProductionWorkFilter) (*biz.WarehouseProductionWorkPage, error) {
	result := &biz.WarehouseProductionWorkPage{Items: []*biz.WarehouseProductionWork{}, Counts: map[string]int{}}
	options := &stdsql.TxOptions{}
	if r.data.sqlDialect != dialect.SQLite {
		options.ReadOnly = true
		options.Isolation = stdsql.LevelRepeatableRead
	}
	tx, err := r.data.sqldb.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	cte, args := warehouseProductionWorkQuery(ctx, filter)
	counts, err := tx.QueryContext(ctx, cte+" SELECT stage,COUNT(*) FROM filtered GROUP BY stage", args...)
	if err != nil {
		return nil, err
	}
	for counts.Next() {
		var stage string
		var count int
		if err = counts.Scan(&stage, &count); err != nil {
			_ = counts.Close()
			return nil, err
		}
		result.Counts[stage] = count
		result.Counts[""] += count
	}
	if err = counts.Err(); err != nil {
		_ = counts.Close()
		return nil, err
	}
	if err = counts.Close(); err != nil {
		return nil, err
	}
	result.Total = result.Counts[filter.Stage]
	where := "1=1"
	if filter.Stage != "" {
		args = append(args, filter.Stage)
		where = fmt.Sprintf("stage=$%d", len(args))
	}
	args = append(args, filter.Limit, filter.Offset)
	query := cte + ` SELECT id,production_order_id,production_order_item_id,order_no,fact_id,fact_no,fact_status,fact_version,
 batch_id,batch_no,operation_name,product_name,product_code,sku_code,unit_name,warehouse_id,warehouse_name,lot_no,
 quantity,pending_inspection_quantity,pending_packaging_quantity,packaging_confirmed,action_batch_id,action,stage FROM filtered WHERE ` + where +
		fmt.Sprintf(" ORDER BY CASE WHEN stage IN ('AWAITING_RETURN','AWAITING_INBOUND') THEN 0 WHEN stage='AWAITING_PACKAGING' THEN 1 WHEN stage='AWAITING_QUALITY' THEN 2 ELSE 3 END,id DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		row := &biz.WarehouseProductionWork{Kind: filter.Kind}
		err = rows.Scan(&row.ID, &row.ProductionOrderID, &row.ProductionOrderItemID, &row.OrderNo, &row.FactID, &row.FactNo, &row.FactStatus, &row.FactVersion, &row.BatchID, &row.BatchNo, &row.OperationName, &row.ProductName, &row.ProductCode, &row.SKUCode, &row.UnitName, &row.WarehouseID, &row.WarehouseName, &row.LotNo, &row.Quantity, &row.PendingInspectionQuantity, &row.PendingPackagingQuantity, &row.PackagingConfirmed, &row.ActionBatchID, &row.Action, &row.Stage)
		if err != nil {
			_ = rows.Close()
			return nil, err
		}
		for _, quantity := range []*string{&row.Quantity, &row.PendingInspectionQuantity, &row.PendingPackagingQuantity} {
			*quantity, err = normalizeWarehouseWorkQuantity(*quantity)
			if err != nil {
				_ = rows.Close()
				return nil, err
			}
		}
		result.Items = append(result.Items, row)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

func normalizeWarehouseWorkQuantity(value string) (string, error) {
	quantity, err := decimal.NewFromString(value)
	return quantity.String(), err
}
