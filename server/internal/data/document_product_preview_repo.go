package data

import (
	"context"
	"fmt"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
)

var _ biz.DocumentProductPreviewRepo = (*businessAttachmentRepo)(nil)

func (r *businessAttachmentRepo) ListDocumentProductPreviews(ctx context.Context, source string, ids []int) ([]biz.DocumentProductPreview, error) {
	var table, owner, documentTable string
	switch source {
	case biz.DocumentProductPreviewSalesOrder:
		table, owner = salesorderitem.Table, salesorderitem.FieldSalesOrderID
		documentTable = salesorder.Table
	case biz.DocumentProductPreviewProductionOrder:
		table, owner = productionorderitem.Table, productionorderitem.FieldProductionOrderID
		documentTable = productionorder.Table
	case biz.DocumentProductPreviewOutsourcingOrder:
		table, owner = outsourcingorderitem.Table, outsourcingorderitem.FieldOutsourcingOrderID
		documentTable = outsourcingorder.Table
	default:
		return nil, biz.ErrBadParam
	}
	if len(ids) == 0 || len(ids) > biz.DocumentProductPreviewBatchLimit {
		return nil, biz.ErrBadParam
	}
	// The allowlisted table/column names are schema constants. Group before joining
	// media metadata so repeated lines or SKUs never inflate a product count.
	marks := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		if id <= 0 {
			return nil, biz.ErrBadParam
		}
		marks[i], args[i] = fmt.Sprintf("$%d", i+1), id
	}
	query := fmt.Sprintf(`SELECT g.document_id, g.product_count, p.id, p.name, p.code
		FROM (SELECT l.%s AS document_id, COUNT(DISTINCT l.product_id) AS product_count, MIN(l.product_id) AS product_id
		FROM %s l INNER JOIN %s document ON document.id = l.%s INNER JOIN products linked ON linked.id = l.product_id
		WHERE l.%s IN (%s) GROUP BY l.%s) g
		INNER JOIN products p ON p.id = g.product_id`, owner, table, documentTable, owner, owner, strings.Join(marks, ","), owner)
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	byID := make(map[int]biz.DocumentProductPreview, len(ids))
	for rows.Next() {
		var row biz.DocumentProductPreview
		if err := rows.Scan(&row.DocumentID, &row.ProductCount, &row.ProductID, &row.ProductName, &row.ProductCode); err != nil {
			return nil, err
		}
		byID[row.DocumentID] = row
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result := make([]biz.DocumentProductPreview, 0, len(ids))
	for _, id := range ids {
		row := byID[id]
		row.DocumentID = id
		result = append(result, row)
	}
	return result, nil
}
