package data

import (
	"context"
	"strings"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
)

func validSalesOrderCreateIdentity(in *biz.SalesOrderMutation) bool {
	if in.IdempotencyKey == "" {
		return in.OrderNo != "" && in.CreateIntentHash == ""
	}
	return in.ActorID > 0 && in.IdempotencyKey == strings.TrimSpace(in.IdempotencyKey) &&
		len(in.IdempotencyKey) <= 128 && len(in.CreateIntentHash) == 64
}

func (r *salesOrderRepo) ResolveSalesOrderCreateReplay(ctx context.Context, in *biz.SalesOrderMutation) (*biz.SalesOrderWithItems, bool, error) {
	tx, err := beginSalesOrderDraftTx(ctx, r.data)
	if err != nil {
		return nil, false, err
	}
	defer tx.rollback(ctx, r.log)
	return r.salesOrderCreateReplayInTx(ctx, tx.Client, in)
}

func (r *salesOrderRepo) salesOrderCreateReplayInTx(ctx context.Context, client *ent.Client, in *biz.SalesOrderMutation) (*biz.SalesOrderWithItems, bool, error) {
	if !validSalesOrderCreateIdentity(in) || in.IdempotencyKey == "" {
		return nil, false, biz.ErrBadParam
	}
	query := client.SalesOrder.Query().Where(salesorder.CreateIdempotencyKey(in.IdempotencyKey))
	if r.data.sqlDialect == dialect.Postgres {
		query = query.Where(func(selector *sql.Selector) { selector.ForUpdate() })
	}
	row, err := query.Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.CreateActorID == nil || *row.CreateActorID != in.ActorID || row.CreateIntentHash == nil || *row.CreateIntentHash != in.CreateIntentHash {
		return nil, false, biz.ErrIdempotencyConflict
	}
	items, err := client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(row.ID)).
		Order(sourceDocumentItemOrder(salesorderitem.FieldDisplayOrder, salesorderitem.FieldLineNo, salesorderitem.FieldID)).All(ctx)
	if err != nil {
		return nil, false, err
	}
	return &biz.SalesOrderWithItems{Order: entSalesOrderToBiz(row), Items: entSalesOrderItemsToBiz(items)}, true, nil
}
