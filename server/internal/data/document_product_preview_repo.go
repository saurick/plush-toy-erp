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

func (r *businessAttachmentRepo) ListDocumentProductPreviews(ctx context.Context, source string, ids []int, options biz.DocumentProductPreviewOptions) ([]biz.DocumentProductPreview, error) {
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
	// Table and column names are allowlisted schema constants. Both the list and
	// the gallery use the same distinct set of product identities.
	marks := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		if id <= 0 {
			return nil, biz.ErrBadParam
		}
		marks[i], args[i] = fmt.Sprintf("$%d", i+1), id
	}
	documentFields := "id"
	links := fmt.Sprintf(`SELECT DISTINCT d.id AS document_id, l.product_id FROM documents d JOIN %s l ON l.%s = d.id WHERE l.product_id IS NOT NULL`, table, owner)
	if source == biz.DocumentProductPreviewOutsourcingOrder {
		documentFields += ", version, source_wip_batch_id"
		// A material line remains a material. Its cutting allocation or the
		// document's source batch supplies the related finished product.
		links += `
		UNION SELECT d.id, pi.product_id FROM documents d
		JOIN production_wip_batches b ON b.id = d.source_wip_batch_id
		JOIN production_order_items pi ON pi.id = b.production_order_item_id
		UNION SELECT d.id, pi.product_id FROM documents d
		JOIN outsourcing_order_items l ON l.outsourcing_order_id = d.id
		JOIN production_wip_outsourcing_allocations a ON a.outsourcing_order_item_id = l.id
		JOIN production_wip_batches b ON b.id = a.production_wip_batch_id
		JOIN production_order_items pi ON pi.id = b.production_order_item_id`
	}
	cte := fmt.Sprintf(`WITH documents AS (SELECT %s FROM %s WHERE id IN (%s)), product_links AS (%s),
		linked_products AS (SELECT l.document_id, p.id, p.name, p.code, p.style_no, p.customer_style_no FROM product_links l JOIN products p ON p.id = l.product_id) `,
		documentFields, documentTable, strings.Join(marks, ","), links)
	if options.IncludeProducts {
		return r.readDocumentProductGallery(ctx, cte, ids[0], options.ExpectedVersion, args)
	}
	query := cte + `SELECT g.document_id, g.product_count, p.id, p.name, p.code, COALESCE(p.style_no, ''), COALESCE(p.customer_style_no, '')
		FROM (SELECT document_id, COUNT(*) AS product_count, MIN(id) AS product_id FROM linked_products GROUP BY document_id) g
		JOIN products p ON p.id = g.product_id`
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	byID := make(map[int]biz.DocumentProductPreview, len(ids))
	for rows.Next() {
		var row biz.DocumentProductPreview
		if err := rows.Scan(&row.DocumentID, &row.ProductCount, &row.ProductID, &row.ProductName, &row.ProductCode, &row.StyleNo, &row.CustomerStyleNo); err != nil {
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

func (r *businessAttachmentRepo) readDocumentProductGallery(ctx context.Context, cte string, id, expectedVersion int, args []any) ([]biz.DocumentProductPreview, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, cte+`SELECT d.version, COALESCE(p.id, 0), COALESCE(p.name, ''), COALESCE(p.code, ''),
		COALESCE(p.style_no, ''), COALESCE(p.customer_style_no, '')
		FROM documents d LEFT JOIN linked_products p ON p.document_id = d.id ORDER BY p.id`, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	preview := biz.DocumentProductPreview{DocumentID: id, Products: []biz.DocumentProductIdentity{}}
	found := false
	for rows.Next() {
		var version int
		var product biz.DocumentProductIdentity
		var styleNo, customerStyleNo string
		if err := rows.Scan(&version, &product.ProductID, &product.ProductName, &product.ProductCode, &styleNo, &customerStyleNo); err != nil {
			return nil, err
		}
		found = true
		if expectedVersion > 0 && version != expectedVersion {
			return nil, biz.ErrOutsourcingOrderConflict
		}
		if product.ProductID > 0 {
			if len(preview.Products) == 0 {
				preview.StyleNo, preview.CustomerStyleNo = styleNo, customerStyleNo
			}
			preview.Products = append(preview.Products, product)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if !found && expectedVersion > 0 {
		return nil, biz.ErrOutsourcingOrderConflict
	}
	preview.ProductCount = len(preview.Products)
	if preview.ProductCount > 0 {
		first := preview.Products[0]
		preview.ProductID, preview.ProductName, preview.ProductCode = first.ProductID, first.ProductName, first.ProductCode
	}
	return []biz.DocumentProductPreview{preview}, nil
}
