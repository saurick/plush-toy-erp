package data

import (
	"context"
	stdsql "database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderevent"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/unit"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type productionOrderRepo struct {
	data *Data
	log  *log.Helper
	inv  *inventoryRepo
}

type productionOrderCommandTx struct {
	sqlTx  *stdsql.Tx
	client *ent.Client
}

func NewProductionOrderRepo(d *Data, logger log.Logger) *productionOrderRepo {
	return &productionOrderRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.production_order_repo")),
		inv:  NewInventoryRepo(d, logger),
	}
}

func (r *productionOrderRepo) beginProductionOrderCommandTx(ctx context.Context) (*productionOrderCommandTx, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, &stdsql.TxOptions{Isolation: stdsql.LevelReadCommitted})
	if err != nil {
		return nil, err
	}
	sqlDialect := r.data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	client := ent.NewClient(ent.Driver(entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: sqlTx})))
	return &productionOrderCommandTx{sqlTx: sqlTx, client: client}, nil
}

func (r *productionOrderRepo) lockProductionOrderSalesSources(ctx context.Context, tx *stdsql.Tx, items []biz.ProductionOrderDraftItem) error {
	if tx == nil {
		return biz.ErrBadParam
	}
	ids := make([]int, 0, len(items))
	seen := make(map[int]struct{}, len(items))
	for _, item := range items {
		if item.SalesOrderItemID == nil {
			continue
		}
		id := *item.SalesOrderItemID
		if id <= 0 {
			return biz.ErrProductionOrderReferenceInvalid
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 || r.data.sqlDialect == dialect.SQLite {
		return nil
	}
	ids = sortReferenceIDs(ids)
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	rows, err := tx.QueryContext(ctx, `SELECT soi.id
FROM sales_order_items AS soi
JOIN sales_orders AS so ON so.id = soi.sales_order_id
WHERE soi.id IN (`+strings.Join(placeholders, ",")+`)
ORDER BY so.id, soi.id
FOR UPDATE OF so, soi`, args...)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	count := 0
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count != len(ids) {
		return biz.ErrProductionOrderReferenceInvalid
	}
	return nil
}

func (r *productionOrderRepo) lockProductionOrderCommandSource(ctx context.Context, tx *stdsql.Tx, orderID int) error {
	if tx == nil || orderID <= 0 {
		return biz.ErrBadParam
	}
	if r.data.sqlDialect == dialect.SQLite {
		return nil
	}
	var lockedID int
	if err := tx.QueryRowContext(ctx, `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`, orderID).Scan(&lockedID); err != nil {
		if err == stdsql.ErrNoRows {
			return biz.ErrProductionOrderNotFound
		}
		return err
	}
	return nil
}

var _ biz.ProductionOrderRepo = (*productionOrderRepo)(nil)

func (r *productionOrderRepo) GetProductionOrderAggregate(ctx context.Context, id int) (*biz.ProductionOrderAggregate, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || r.data.sqldb == nil || id <= 0 {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, &stdsql.TxOptions{Isolation: stdsql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = sqlTx.Rollback() }()
	sqlDialect := r.data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	client := ent.NewClient(ent.Driver(entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: sqlTx})))
	aggregate, err := loadProductionOrderAggregate(ctx, client, id)
	if err != nil {
		return nil, err
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	return aggregate, nil
}

func (r *productionOrderRepo) ListProductionOrders(ctx context.Context, filter biz.ProductionOrderFilter) ([]*biz.ProductionOrder, int, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, 0, biz.ErrBadParam
	}
	query := r.data.postgres.ProductionOrder.Query()
	if filter.Keyword != "" {
		query = query.Where(productionorder.Or(productionorder.OrderNoContainsFold(filter.Keyword), productionorder.NoteContainsFold(filter.Keyword)))
	}
	if filter.Status != "" {
		query = query.Where(productionorder.Status(filter.Status))
	}
	if filter.DateFrom != nil || filter.DateTo != nil {
		field := map[string]string{
			"planned_start_at": productionorder.FieldPlannedStartAt,
			"planned_end_at":   productionorder.FieldPlannedEndAt,
			"created_at":       productionorder.FieldCreatedAt,
			"updated_at":       productionorder.FieldUpdatedAt,
		}[filter.DateField]
		query = query.Where(func(selector *entsql.Selector) {
			if filter.DateFrom != nil {
				selector.Where(entsql.GTE(selector.C(field), *filter.DateFrom))
			}
			if filter.DateTo != nil {
				selector.Where(entsql.LTE(selector.C(field), *filter.DateTo))
			}
		})
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	sortField := map[string]string{
		"order_no": productionorder.FieldOrderNo, "planned_start_at": productionorder.FieldPlannedStartAt,
		"planned_end_at": productionorder.FieldPlannedEndAt, "created_at": productionorder.FieldCreatedAt,
		"updated_at": productionorder.FieldUpdatedAt,
	}[filter.SortBy]
	order := ent.Desc(sortField)
	if filter.SortDirection == "asc" {
		order = ent.Asc(sortField)
	}
	rows, err := query.Order(order, ent.Desc(productionorder.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	orderIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		orderIDs = append(orderIDs, row.ID)
	}
	itemCounts := make(map[int]int, len(orderIDs))
	if len(orderIDs) > 0 {
		var groupedCounts []struct {
			ProductionOrderID int `json:"production_order_id"`
			Count             int `json:"count"`
		}
		if err := r.data.postgres.ProductionOrderItem.Query().
			Where(productionorderitem.ProductionOrderIDIn(orderIDs...)).
			GroupBy(productionorderitem.FieldProductionOrderID).
			Aggregate(ent.Count()).
			Scan(ctx, &groupedCounts); err != nil {
			return nil, 0, err
		}
		for _, grouped := range groupedCounts {
			itemCounts[grouped.ProductionOrderID] = grouped.Count
		}
	}
	items := make([]*biz.ProductionOrder, 0, len(rows))
	for _, row := range rows {
		item := entProductionOrderToBiz(row)
		itemCount := itemCounts[row.ID]
		item.ItemCount = &itemCount
		items = append(items, item)
	}
	return items, total, nil
}

type productionOrderMutationResult struct {
	Contract  string                        `json:"contract"`
	Aggregate *biz.ProductionOrderAggregate `json:"aggregate"`
}

type productionOrderReferenceSnapshot struct {
	productCode string
	productName string
	skuCode     *string
	unitName    string
	bomVersion  *string
}

func (r *productionOrderRepo) CreateProductionOrderDraft(ctx context.Context, in *biz.ProductionOrderCreateCommand) (*biz.ProductionOrderAggregate, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || r.data.sqldb == nil || in == nil {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := resolveProductionOrderCreateReceipt(ctx, r.data.postgres, in.ActorID, in.IdempotencyKey, in.IntentHash); err != nil || found {
		return replay, err
	}

	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.sqlTx.Rollback()
		}
	}()
	client := tx.client
	if replay, found, resolveErr := resolveProductionOrderCreateReceipt(ctx, client, in.ActorID, in.IdempotencyKey, in.IntentHash); resolveErr != nil || found {
		return replay, resolveErr
	}

	if err := r.lockProductionOrderSalesSources(ctx, tx.sqlTx, in.Draft.Items); err != nil {
		return nil, err
	}
	snapshots, err := validateProductionOrderDraftReferences(ctx, client, in.Draft.Items)
	if err != nil {
		return nil, err
	}
	orderCreate := client.ProductionOrder.Create().
		SetOrderNo(in.Draft.OrderNo).
		SetStatus(biz.ProductionOrderStatusDraft).
		SetVersion(1).
		SetCreatedBy(in.ActorID).
		SetNillablePlannedStartAt(in.Draft.PlannedStartAt).
		SetNillablePlannedEndAt(in.Draft.PlannedEndAt).
		SetNillableNote(in.Draft.Note)
	orderRow, err := orderCreate.Save(ctx)
	if err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveCreateAfterWriteFailure(ctx, in, err)
	}
	if err := replaceProductionOrderItems(ctx, client, orderRow.ID, in.Draft.Items, snapshots); err != nil {
		return nil, err
	}
	aggregate, err := loadProductionOrderAggregate(ctx, client, orderRow.ID)
	if err != nil {
		return nil, err
	}
	if err := createProductionOrderReceipt(ctx, client, aggregate, in.ActorID, biz.ProductionOrderCommandCreate, nil, in.IdempotencyKey, in.IntentHash, nil); err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveCreateAfterWriteFailure(ctx, in, err)
	}
	if err := tx.sqlTx.Commit(); err != nil {
		committed = true
		return r.resolveCreateAfterWriteFailure(ctx, in, err)
	}
	committed = true
	return aggregate, nil
}

func (r *productionOrderRepo) SaveProductionOrderDraft(ctx context.Context, in *biz.ProductionOrderSaveCommand) (*biz.ProductionOrderAggregate, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil {
		return nil, biz.ErrBadParam
	}
	return r.runNonCreateCommand(ctx, in.ID, in.ActorID, biz.ProductionOrderCommandSave, in.IdempotencyKey, in.IntentHash, nil, func(client *ent.Client, sqlTx *stdsql.Tx) (*biz.ProductionOrderAggregate, error) {
		if err := r.lockProductionOrderSalesSources(ctx, sqlTx, in.Draft.Items); err != nil {
			return nil, err
		}
		snapshots, err := validateProductionOrderDraftReferences(ctx, client, in.Draft.Items)
		if err != nil {
			return nil, err
		}
		affected, err := client.ProductionOrder.Update().
			Where(productionorder.ID(in.ID), productionorder.Status(biz.ProductionOrderStatusDraft), productionorder.Version(in.ExpectedVersion)).
			SetOrderNo(in.Draft.OrderNo).
			SetNillablePlannedStartAt(in.Draft.PlannedStartAt).
			SetNillablePlannedEndAt(in.Draft.PlannedEndAt).
			SetNillableNote(in.Draft.Note).
			AddVersion(1).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, productionOrderCASFailure(ctx, client, in.ID, in.ExpectedVersion, biz.ProductionOrderStatusDraft)
		}
		if err := replaceProductionOrderItems(ctx, client, in.ID, in.Draft.Items, snapshots); err != nil {
			return nil, err
		}
		return loadProductionOrderAggregate(ctx, client, in.ID)
	})
}

func (r *productionOrderRepo) ApplyProductionOrderAction(ctx context.Context, in *biz.ProductionOrderActionCommand) (*biz.ProductionOrderAggregate, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil {
		return nil, biz.ErrBadParam
	}
	switch in.CommandKey {
	case biz.ProductionOrderCommandClose:
		if r.data.sqldb == nil {
			return nil, biz.ErrBadParam
		}
		return r.closeProductionOrder(ctx, in)
	case biz.ProductionOrderCommandCancel:
		if r.data.sqldb == nil {
			return nil, biz.ErrBadParam
		}
		return r.cancelProductionOrder(ctx, in)
	}
	return r.runNonCreateCommand(ctx, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash, in.Reason, func(client *ent.Client, sqlTx *stdsql.Tx) (*biz.ProductionOrderAggregate, error) {
		current, err := client.ProductionOrder.Get(ctx, in.ID)
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		if err != nil {
			return nil, err
		}
		if current.Version != in.ExpectedVersion {
			return nil, biz.ErrProductionOrderConflict
		}
		nextStatus := ""
		expectedStatus := ""
		switch in.CommandKey {
		case biz.ProductionOrderCommandRelease:
			expectedStatus, nextStatus = biz.ProductionOrderStatusDraft, biz.ProductionOrderStatusReleased
		default:
			return nil, biz.ErrBadParam
		}
		if current.Status != expectedStatus {
			return nil, biz.ErrProductionOrderInvalidState
		}
		if in.CommandKey == biz.ProductionOrderCommandRelease {
			items, err := loadProductionOrderDraftItems(ctx, client, in.ID)
			if err != nil {
				return nil, err
			}
			if len(items) == 0 {
				return nil, biz.ErrProductionOrderReferenceInvalid
			}
			if err := r.lockProductionOrderSalesSources(ctx, sqlTx, items); err != nil {
				return nil, err
			}
			if _, err := validateProductionOrderDraftReferences(ctx, client, items); err != nil {
				return nil, err
			}
			if err := freezeProductionOrderMaterialRequirements(ctx, client, in.ID); err != nil {
				return nil, err
			}
		}

		now := time.Now().UTC()
		update := client.ProductionOrder.Update().
			Where(productionorder.ID(in.ID), productionorder.Status(expectedStatus), productionorder.Version(in.ExpectedVersion)).
			SetStatus(nextStatus).
			AddVersion(1)
		switch in.CommandKey {
		case biz.ProductionOrderCommandRelease:
			update.SetReleasedBy(in.ActorID).SetReleasedAt(now)
		}
		affected, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, productionOrderCASFailure(ctx, client, in.ID, in.ExpectedVersion, expectedStatus)
		}
		if in.CommandKey == biz.ProductionOrderCommandRelease {
			if err := freezeProductionOrderWIPRoute(ctx, client, in.ID, in.ActorID); err != nil {
				return nil, err
			}
		}
		aggregate, err := loadProductionOrderAggregate(ctx, client, in.ID)
		if err != nil {
			return nil, err
		}
		if in.CommandKey == biz.ProductionOrderCommandRelease {
			task, state, err := biz.BuildProductionSchedulingSourceTask(aggregate)
			if err != nil {
				return nil, err
			}
			if _, _, err := ensureSourceWorkflowTaskWithClient(ctx, client, task, state, in.ActorID); err != nil {
				return nil, err
			}
		}
		return aggregate, nil
	})
}

func (r *productionOrderRepo) closeProductionOrder(ctx context.Context, in *biz.ProductionOrderActionCommand) (*biz.ProductionOrderAggregate, error) {
	if replay, found, err := resolveProductionOrderReceipt(ctx, r.data.postgres, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", in.ID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if replay, found, resolveErr := resolveProductionOrderReceipt(ctx, tx.client, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash); resolveErr != nil || found {
		if resolveErr != nil {
			return nil, resolveErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	current, err := tx.client.ProductionOrder.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if current.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionOrderConflict
	}
	if current.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionOrderInvalidState
	}
	releasedAggregate, err := loadProductionOrderAggregate(ctx, tx.client, in.ID)
	if err != nil {
		return nil, err
	}
	schedulingTask, _, err := biz.BuildProductionSchedulingSourceTask(releasedAggregate)
	if err != nil {
		return nil, err
	}
	if err := requireProductionSchedulingTaskTerminal(ctx, tx, schedulingTask, false); err != nil {
		return nil, err
	}
	activeWIP, err := productionOrderHasActiveWIP(ctx, tx.client, in.ID)
	if err != nil {
		return nil, err
	}
	if activeWIP {
		return nil, biz.ErrProductionOrderWIPActive
	}
	hasUnsettledFacts, err := tx.client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(in.ID),
		productionfact.StatusNotIn(
			biz.OperationalFactStatusPosted,
			biz.OperationalFactStatusCancelled,
		),
	).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if hasUnsettledFacts {
		return nil, biz.ErrProductionOrderFactDependency
	}
	incomplete, err := productionOrderHasIncompleteFinishedGoods(ctx, tx.client, in.ID)
	if err != nil {
		return nil, err
	}
	if incomplete && in.Reason == nil {
		return nil, biz.ErrProductionOrderCloseReasonRequired
	}
	now := time.Now().UTC()
	update := tx.client.ProductionOrder.Update().
		Where(productionorder.ID(in.ID), productionorder.Status(biz.ProductionOrderStatusReleased), productionorder.Version(in.ExpectedVersion)).
		SetStatus(biz.ProductionOrderStatusClosed).
		SetClosedBy(in.ActorID).
		SetClosedAt(now).
		AddVersion(1)
	if in.Reason == nil {
		update.ClearCloseReason()
	} else {
		update.SetCloseReason(*in.Reason)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, productionOrderCASFailure(ctx, tx.client, in.ID, in.ExpectedVersion, biz.ProductionOrderStatusReleased)
	}
	aggregate, err := loadProductionOrderAggregate(ctx, tx.client, in.ID)
	if err != nil {
		return nil, err
	}
	projectionPayload := map[string]any{
		"source_document_status": biz.ProductionOrderStatusClosed,
		"closed_at":              now.Unix(),
		"closed_by":              in.ActorID,
	}
	if in.Reason != nil {
		projectionPayload["close_reason"] = *in.Reason
	}
	if err := transitionSourceWorkflowProjection(
		ctx, tx.client, schedulingTask, "closed", biz.PMCRoleKey, in.ActorID,
		"production_order.close", projectionPayload,
	); err != nil {
		return nil, err
	}
	fromStatus := current.Status
	if err := createProductionOrderReceipt(ctx, tx.client, aggregate, in.ActorID, in.CommandKey, &fromStatus, in.IdempotencyKey, in.IntentHash, in.Reason); err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		return r.resolveNonCreateAfterWriteFailure(ctx, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash, err)
	}
	if err := tx.sqlTx.Commit(); err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		return r.resolveNonCreateAfterWriteFailure(ctx, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash, err)
	}
	tx.sqlTx = nil
	return aggregate, nil
}

func productionOrderHasActiveWIP(ctx context.Context, client *ent.Client, orderID int) (bool, error) {
	rows, err := client.ProductionWIPBatch.Query().
		Where(productionwipbatch.ProductionOrderID(orderID)).
		All(ctx)
	if err != nil {
		return false, err
	}
	for _, row := range rows {
		if row == nil {
			return false, biz.ErrProductionWIPInvalidTransition
		}
		blocks, err := biz.ProductionWIPStatusBlocksOrderClose(row.Status)
		if err != nil {
			return false, err
		}
		if blocks {
			return true, nil
		}
	}
	return false, nil
}

func productionOrderHasIncompleteFinishedGoods(ctx context.Context, client *ent.Client, orderID int) (bool, error) {
	items, err := client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(orderID)).All(ctx)
	if err != nil {
		return false, err
	}
	if len(items) == 0 {
		return false, biz.ErrProductionOrderReferenceInvalid
	}
	itemsByID := make(map[int]*ent.ProductionOrderItem, len(items))
	for _, item := range items {
		itemsByID[item.ID] = item
	}
	facts, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(orderID),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return false, err
	}
	for _, fact := range facts {
		if fact.FactType == biz.ProductionFactMaterialIssue {
			if _, err := validateProductionOrderMaterialIssueFactRowSource(ctx, client, fact, false); err != nil {
				return false, err
			}
			continue
		}
		if fact.SourceLineID == nil || fact.FactType != biz.ProductionFactFinishedGoodsReceipt || fact.SubjectType != biz.InventorySubjectProduct {
			return false, biz.ErrProductionOrderFactSourceInvalid
		}
		item := itemsByID[*fact.SourceLineID]
		if item == nil || fact.SubjectID != item.ProductID || fact.UnitID != item.UnitID || !sameOptionalInt(fact.ProductSkuID, item.ProductSkuID) {
			return false, biz.ErrProductionOrderFactSourceInvalid
		}
	}
	incomplete := false
	for _, item := range items {
		quantity, err := productionOrderEffectiveCompletedQuantity(ctx, client, item)
		if err != nil {
			return false, err
		}
		if quantity.GreaterThan(item.PlannedQuantity) {
			return false, biz.ErrProductionOrderQuantityExceeded
		}
		if quantity.LessThan(item.PlannedQuantity) {
			incomplete = true
		}
	}
	return incomplete, nil
}

func (r *productionOrderRepo) cancelProductionOrder(ctx context.Context, in *biz.ProductionOrderActionCommand) (*biz.ProductionOrderAggregate, error) {
	if replay, found, err := resolveProductionOrderReceipt(ctx, r.data.postgres, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", in.ID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if replay, found, resolveErr := resolveProductionOrderReceipt(ctx, tx.client, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash); resolveErr != nil || found {
		if resolveErr != nil {
			return nil, resolveErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	current, err := tx.client.ProductionOrder.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if current.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionOrderConflict
	}
	if current.Status != biz.ProductionOrderStatusDraft && current.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionOrderInvalidState
	}
	hasPosted, err := tx.client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(in.ID),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if hasPosted {
		return nil, biz.ErrProductionOrderHasPostedFacts
	}
	hasUnsettledFacts, err := tx.client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(in.ID),
		productionfact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if hasUnsettledFacts {
		return nil, biz.ErrProductionOrderFactDependency
	}
	var schedulingTask *biz.WorkflowTaskCreate
	if current.Status == biz.ProductionOrderStatusReleased {
		releasedAggregate, err := loadProductionOrderAggregate(ctx, tx.client, in.ID)
		if err != nil {
			return nil, err
		}
		schedulingTask, _, err = biz.BuildProductionSchedulingSourceTask(releasedAggregate)
		if err != nil {
			return nil, err
		}
		if err := requireProductionSchedulingTaskTerminal(ctx, tx, schedulingTask, true); err != nil {
			return nil, err
		}
		activeWIP, err := productionOrderHasActiveWIP(ctx, tx.client, in.ID)
		if err != nil {
			return nil, err
		}
		if activeWIP {
			return nil, biz.ErrProductionOrderWIPActive
		}
	}
	now := time.Now().UTC()
	affected, err := tx.client.ProductionOrder.Update().
		Where(productionorder.ID(in.ID), productionorder.Status(current.Status), productionorder.Version(in.ExpectedVersion)).
		SetStatus(biz.ProductionOrderStatusCancelled).
		SetCancelledBy(in.ActorID).
		SetCancelledAt(now).
		SetCancelReason(*in.Reason).
		AddVersion(1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, productionOrderCASFailure(ctx, tx.client, in.ID, in.ExpectedVersion, current.Status)
	}
	aggregate, err := loadProductionOrderAggregate(ctx, tx.client, in.ID)
	if err != nil {
		return nil, err
	}
	if schedulingTask != nil {
		if err := transitionSourceWorkflowProjection(
			ctx, tx.client, schedulingTask, "cancelled", biz.PMCRoleKey, in.ActorID,
			"production_order.cancel", map[string]any{
				"source_document_status": biz.ProductionOrderStatusCancelled,
				"cancelled_at":           now.Unix(),
				"cancelled_by":           in.ActorID,
				"cancel_reason":          *in.Reason,
			},
		); err != nil {
			return nil, err
		}
	}
	if err := createProductionOrderReceipt(ctx, tx.client, aggregate, in.ActorID, in.CommandKey, &current.Status, in.IdempotencyKey, in.IntentHash, in.Reason); err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		return r.resolveNonCreateAfterWriteFailure(ctx, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash, err)
	}
	if err := tx.sqlTx.Commit(); err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		return r.resolveNonCreateAfterWriteFailure(ctx, in.ID, in.ActorID, in.CommandKey, in.IdempotencyKey, in.IntentHash, err)
	}
	tx.sqlTx = nil
	return aggregate, nil
}

func (r *productionOrderRepo) runNonCreateCommand(
	ctx context.Context,
	orderID, actorID int,
	command, key, intentHash string,
	reason *string,
	mutate func(*ent.Client, *stdsql.Tx) (*biz.ProductionOrderAggregate, error),
) (*biz.ProductionOrderAggregate, error) {
	if replay, found, err := resolveProductionOrderReceipt(ctx, r.data.postgres, orderID, actorID, command, key, intentHash); err != nil || found {
		return replay, err
	}
	if r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.sqlTx.Rollback()
		}
	}()
	client := tx.client
	if replay, found, resolveErr := resolveProductionOrderReceipt(ctx, client, orderID, actorID, command, key, intentHash); resolveErr != nil || found {
		return replay, resolveErr
	}
	if err := r.lockProductionOrderCommandSource(ctx, tx.sqlTx, orderID); err != nil {
		return nil, err
	}
	// A concurrent command may have committed its receipt while this transaction
	// waited for the source row, so replay must be resolved again after the lock.
	if replay, found, resolveErr := resolveProductionOrderReceipt(ctx, client, orderID, actorID, command, key, intentHash); resolveErr != nil || found {
		return replay, resolveErr
	}
	current, err := client.ProductionOrder.Get(ctx, orderID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrProductionOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	aggregate, err := mutate(client, tx.sqlTx)
	if err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveNonCreateAfterWriteFailure(ctx, orderID, actorID, command, key, intentHash, err)
	}
	if err := createProductionOrderReceipt(ctx, client, aggregate, actorID, command, &current.Status, key, intentHash, reason); err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveNonCreateAfterWriteFailure(ctx, orderID, actorID, command, key, intentHash, err)
	}
	if err := tx.sqlTx.Commit(); err != nil {
		committed = true
		return r.resolveNonCreateAfterWriteFailure(ctx, orderID, actorID, command, key, intentHash, err)
	}
	committed = true
	return aggregate, nil
}

func (r *productionOrderRepo) resolveCreateAfterWriteFailure(ctx context.Context, in *biz.ProductionOrderCreateCommand, writeErr error) (*biz.ProductionOrderAggregate, error) {
	replay, found, err := resolveProductionOrderCreateReceipt(ctx, r.data.postgres, in.ActorID, in.IdempotencyKey, in.IntentHash)
	if err != nil {
		return nil, err
	}
	if found {
		return replay, nil
	}
	return nil, writeErr
}

func (r *productionOrderRepo) resolveNonCreateAfterWriteFailure(ctx context.Context, orderID, actorID int, command, key, intentHash string, writeErr error) (*biz.ProductionOrderAggregate, error) {
	replay, found, err := resolveProductionOrderReceipt(ctx, r.data.postgres, orderID, actorID, command, key, intentHash)
	if err != nil {
		return nil, err
	}
	if found {
		return replay, nil
	}
	return nil, writeErr
}

func resolveProductionOrderCreateReceipt(ctx context.Context, client *ent.Client, actorID int, key, intentHash string) (*biz.ProductionOrderAggregate, bool, error) {
	row, err := client.ProductionOrderEvent.Query().Where(
		productionorderevent.ActorID(actorID),
		productionorderevent.CommandKey(biz.ProductionOrderCommandCreate),
		productionorderevent.IdempotencyKey(key),
	).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return parseProductionOrderReceipt(row, intentHash, biz.ProductionOrderCommandCreate)
}

func resolveProductionOrderReceipt(ctx context.Context, client *ent.Client, orderID, actorID int, command, key, intentHash string) (*biz.ProductionOrderAggregate, bool, error) {
	row, err := client.ProductionOrderEvent.Query().Where(
		productionorderevent.ProductionOrderID(orderID),
		productionorderevent.ActorID(actorID),
		productionorderevent.CommandKey(command),
		productionorderevent.IdempotencyKey(key),
	).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return parseProductionOrderReceipt(row, intentHash, command)
}

func parseProductionOrderReceipt(row *ent.ProductionOrderEvent, intentHash, command string) (*biz.ProductionOrderAggregate, bool, error) {
	if row == nil || row.IntentHash != intentHash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if row.CommandKey != command || row.ResultContract != biz.ProductionOrderMutationResultV1 || row.OrderVersion <= 0 {
		return nil, true, biz.ErrProductionOrderReceiptCorrupt
	}
	expectedToStatus := map[string]string{
		biz.ProductionOrderCommandCreate:  biz.ProductionOrderStatusDraft,
		biz.ProductionOrderCommandSave:    biz.ProductionOrderStatusDraft,
		biz.ProductionOrderCommandRelease: biz.ProductionOrderStatusReleased,
		biz.ProductionOrderCommandClose:   biz.ProductionOrderStatusClosed,
		biz.ProductionOrderCommandCancel:  biz.ProductionOrderStatusCancelled,
	}[command]
	if expectedToStatus == "" || row.ToStatus != expectedToStatus ||
		(command == biz.ProductionOrderCommandCreate && row.FromStatus != nil) ||
		(command != biz.ProductionOrderCommandCreate && row.FromStatus == nil) {
		return nil, true, biz.ErrProductionOrderReceiptCorrupt
	}
	payload, err := json.Marshal(row.MutationResult)
	if err != nil {
		return nil, true, biz.ErrProductionOrderReceiptCorrupt
	}
	var result productionOrderMutationResult
	if err := json.Unmarshal(payload, &result); err != nil || result.Contract != biz.ProductionOrderMutationResultV1 || result.Aggregate == nil || result.Aggregate.Order == nil {
		return nil, true, biz.ErrProductionOrderReceiptCorrupt
	}
	if result.Aggregate.Order.ID <= 0 || strings.TrimSpace(result.Aggregate.Order.OrderNo) == "" ||
		result.Aggregate.Order.ID != row.ProductionOrderID || result.Aggregate.Order.Version != row.OrderVersion || result.Aggregate.Order.Status != row.ToStatus || len(result.Aggregate.Items) == 0 {
		return nil, true, biz.ErrProductionOrderReceiptCorrupt
	}
	seenLines := make(map[int]struct{}, len(result.Aggregate.Items))
	for _, item := range result.Aggregate.Items {
		if item == nil || item.ID <= 0 || item.ProductionOrderID != row.ProductionOrderID || item.LineNo <= 0 ||
			item.ProductID <= 0 || item.UnitID <= 0 || !item.PlannedQuantity.GreaterThan(decimal.Zero) {
			return nil, true, biz.ErrProductionOrderReceiptCorrupt
		}
		if _, exists := seenLines[item.LineNo]; exists {
			return nil, true, biz.ErrProductionOrderReceiptCorrupt
		}
		seenLines[item.LineNo] = struct{}{}
	}
	return result.Aggregate, true, nil
}

func createProductionOrderReceipt(ctx context.Context, client *ent.Client, aggregate *biz.ProductionOrderAggregate, actorID int, command string, fromStatus *string, key, intentHash string, reason *string) error {
	result := productionOrderMutationResult{Contract: biz.ProductionOrderMutationResultV1, Aggregate: aggregate}
	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	var mutationResult map[string]any
	if err := json.Unmarshal(payload, &mutationResult); err != nil {
		return err
	}
	_, err = client.ProductionOrderEvent.Create().
		SetProductionOrderID(aggregate.Order.ID).
		SetActorID(actorID).
		SetCommandKey(command).
		SetNillableFromStatus(fromStatus).
		SetToStatus(aggregate.Order.Status).
		SetOrderVersion(aggregate.Order.Version).
		SetIdempotencyKey(key).
		SetIntentHash(intentHash).
		SetResultContract(biz.ProductionOrderMutationResultV1).
		SetMutationResult(mutationResult).
		SetNillableReason(reason).
		Save(ctx)
	return err
}

func validateProductionOrderDraftReferences(ctx context.Context, client *ent.Client, items []biz.ProductionOrderDraftItem) ([]productionOrderReferenceSnapshot, error) {
	snapshots := make([]productionOrderReferenceSnapshot, len(items))
	for i, item := range items {
		productRow, err := client.Product.Query().Where(product.ID(item.ProductID), product.IsActive(true)).Only(ctx)
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderReferenceInvalid
		}
		if err != nil {
			return nil, err
		}
		unitRow, err := client.Unit.Query().Where(unit.ID(item.UnitID), unit.IsActive(true)).Only(ctx)
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderReferenceInvalid
		}
		if err != nil {
			return nil, err
		}
		snapshot := productionOrderReferenceSnapshot{productCode: productRow.Code, productName: productRow.Name, unitName: unitRow.Name}
		if item.ProductSKUID != nil {
			skuRow, err := client.ProductSKU.Query().Where(productsku.ID(*item.ProductSKUID), productsku.ProductID(item.ProductID), productsku.IsActive(true)).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrProductionOrderReferenceInvalid
			}
			if err != nil {
				return nil, err
			}
			snapshot.skuCode = &skuRow.SkuCode
		}
		if item.SalesOrderItemID != nil {
			salesItem, err := client.SalesOrderItem.Query().Where(
				salesorderitem.ID(*item.SalesOrderItemID),
				salesorderitem.LineStatus(biz.SalesOrderItemStatusOpen),
				salesorderitem.HasSalesOrderWith(salesorder.LifecycleStatus(biz.SalesOrderStatusActive)),
			).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrProductionOrderReferenceInvalid
			}
			if err != nil {
				return nil, err
			}
			if salesItem.ProductID != item.ProductID || salesItem.UnitID != item.UnitID || !sameProductionOrderOptionalInt(salesItem.ProductSkuID, item.ProductSKUID) {
				return nil, biz.ErrProductionOrderReferenceInvalid
			}
		}
		if item.BOMHeaderID != nil {
			bomRow, err := client.BOMHeader.Query().Where(bomheader.ID(*item.BOMHeaderID), bomheader.ProductID(item.ProductID), bomheader.Status("ACTIVE")).Only(ctx)
			if ent.IsNotFound(err) {
				return nil, biz.ErrProductionOrderReferenceInvalid
			}
			if err != nil {
				return nil, err
			}
			snapshot.bomVersion = &bomRow.Version
		}
		snapshots[i] = snapshot
	}
	return snapshots, nil
}

func sameProductionOrderOptionalInt(a, b *int) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}

func replaceProductionOrderItems(ctx context.Context, client *ent.Client, orderID int, items []biz.ProductionOrderDraftItem, snapshots []productionOrderReferenceSnapshot) error {
	if _, err := client.ProductionOrderItem.Delete().Where(productionorderitem.ProductionOrderID(orderID)).Exec(ctx); err != nil {
		return err
	}
	for i, item := range items {
		if _, err := createProductionOrderItem(ctx, client, orderID, item, snapshots[i]); err != nil {
			return err
		}
	}
	return nil
}

func createProductionOrderItem(ctx context.Context, client *ent.Client, orderID int, item biz.ProductionOrderDraftItem, snapshot productionOrderReferenceSnapshot) (*ent.ProductionOrderItem, error) {
	return client.ProductionOrderItem.Create().
		SetProductionOrderID(orderID).
		SetLineNo(item.LineNo).
		SetProductID(item.ProductID).
		SetNillableProductSkuID(item.ProductSKUID).
		SetUnitID(item.UnitID).
		SetPlannedQuantity(item.PlannedQuantity).
		SetNillableSalesOrderItemID(item.SalesOrderItemID).
		SetNillableBomHeaderID(item.BOMHeaderID).
		SetNillableRouteCode(item.RouteCode).
		SetCustomerInspectionRequired(item.CustomerInspectionRequired).
		SetProductCodeSnapshot(snapshot.productCode).
		SetProductNameSnapshot(snapshot.productName).
		SetNillableSkuCodeSnapshot(snapshot.skuCode).
		SetUnitNameSnapshot(snapshot.unitName).
		SetNillableBomVersionSnapshot(snapshot.bomVersion).
		SetNillableNote(item.Note).
		Save(ctx)
}

func loadProductionOrderDraftItems(ctx context.Context, client *ent.Client, orderID int) ([]biz.ProductionOrderDraftItem, error) {
	rows, err := client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(orderID)).Order(productionorderitem.ByLineNo()).All(ctx)
	if err != nil {
		return nil, err
	}
	items := make([]biz.ProductionOrderDraftItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, biz.ProductionOrderDraftItem{
			LineNo: row.LineNo, ProductID: row.ProductID, ProductSKUID: row.ProductSkuID, UnitID: row.UnitID,
			PlannedQuantity: row.PlannedQuantity, SalesOrderItemID: row.SalesOrderItemID, BOMHeaderID: row.BomHeaderID,
			RouteCode: row.RouteCode, CustomerInspectionRequired: row.CustomerInspectionRequired, Note: row.Note,
		})
	}
	return items, nil
}

func loadProductionOrderAggregate(ctx context.Context, client *ent.Client, orderID int) (*biz.ProductionOrderAggregate, error) {
	orderRow, err := client.ProductionOrder.Get(ctx, orderID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrProductionOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	itemRows, err := client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(orderID)).Order(productionorderitem.ByLineNo()).All(ctx)
	if err != nil {
		return nil, err
	}
	requirements, err := loadProductionOrderMaterialRequirements(ctx, client, orderID)
	if err != nil {
		return nil, err
	}
	requirementsState, err := resolveProductionOrderMaterialRequirementsState(ctx, client, itemRows, requirements)
	if err != nil {
		return nil, err
	}
	aggregate := &biz.ProductionOrderAggregate{
		Order:                     entProductionOrderToBiz(orderRow),
		Items:                     make([]*biz.ProductionOrderItem, 0, len(itemRows)),
		MaterialRequirements:      requirements,
		MaterialRequirementsState: requirementsState,
	}
	for _, row := range itemRows {
		aggregate.Items = append(aggregate.Items, entProductionOrderItemToBiz(row))
	}
	return aggregate, nil
}

func resolveProductionOrderMaterialRequirementsState(
	ctx context.Context,
	client *ent.Client,
	items []*ent.ProductionOrderItem,
	requirements []*biz.ProductionOrderMaterialRequirement,
) (string, error) {
	itemByID := make(map[int]*ent.ProductionOrderItem, len(items))
	for _, item := range items {
		itemByID[item.ID] = item
	}
	requirementsByItem := make(map[int]map[int]*biz.ProductionOrderMaterialRequirement, len(items))
	for _, requirement := range requirements {
		if requirement == nil {
			return biz.ProductionOrderMaterialRequirementsNeedsReview, nil
		}
		item := itemByID[requirement.ProductionOrderItemID]
		if item == nil || item.BomHeaderID == nil || requirement.ProductionOrderID != item.ProductionOrderID || requirement.BOMHeaderID != *item.BomHeaderID {
			return biz.ProductionOrderMaterialRequirementsNeedsReview, nil
		}
		byBOMItem := requirementsByItem[item.ID]
		if byBOMItem == nil {
			byBOMItem = make(map[int]*biz.ProductionOrderMaterialRequirement)
			requirementsByItem[item.ID] = byBOMItem
		}
		if _, duplicated := byBOMItem[requirement.BOMItemID]; duplicated {
			return biz.ProductionOrderMaterialRequirementsNeedsReview, nil
		}
		byBOMItem[requirement.BOMItemID] = requirement
	}
	hasBOM := false
	for _, item := range items {
		if item.BomHeaderID == nil {
			continue
		}
		hasBOM = true
		bomRows, err := client.BOMItem.Query().
			Where(bomitem.BomHeaderID(*item.BomHeaderID)).
			All(ctx)
		if err != nil {
			return "", err
		}
		byBOMItem := requirementsByItem[item.ID]
		if len(bomRows) == 0 || len(byBOMItem) != len(bomRows) {
			return biz.ProductionOrderMaterialRequirementsNeedsReview, nil
		}
		for _, bomRow := range bomRows {
			requirement := byBOMItem[bomRow.ID]
			if requirement == nil || requirement.BOMHeaderID != bomRow.BomHeaderID ||
				requirement.MaterialID != bomRow.MaterialID || requirement.UnitID != bomRow.UnitID ||
				!equalProductionOrderOptionalString(requirement.ProductionOperationCode, bomRow.ProductionOperationCode) {
				return biz.ProductionOrderMaterialRequirementsNeedsReview, nil
			}
		}
	}
	if !hasBOM {
		return biz.ProductionOrderMaterialRequirementsNotRequired, nil
	}
	return biz.ProductionOrderMaterialRequirementsReady, nil
}

func freezeProductionOrderMaterialRequirements(ctx context.Context, client *ent.Client, orderID int) error {
	existing, err := client.ProductionOrderMaterialRequirement.Query().
		Where(productionordermaterialrequirement.ProductionOrderID(orderID)).
		Count(ctx)
	if err != nil {
		return err
	}
	if existing != 0 {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	items, err := client.ProductionOrderItem.Query().
		Where(productionorderitem.ProductionOrderID(orderID)).
		Order(productionorderitem.ByLineNo()).
		All(ctx)
	if err != nil {
		return err
	}
	for _, orderItem := range items {
		if orderItem.BomHeaderID == nil {
			continue
		}
		header, err := client.BOMHeader.Query().Where(
			bomheader.ID(*orderItem.BomHeaderID),
			bomheader.ProductID(orderItem.ProductID),
			bomheader.Status(biz.BOMStatusActive),
		).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrProductionOrderReferenceInvalid
			}
			return err
		}
		if orderItem.BomVersionSnapshot == nil || *orderItem.BomVersionSnapshot != header.Version {
			return biz.ErrProductionOrderReferenceInvalid
		}
		bomRows, err := client.BOMItem.Query().
			Where(bomitem.BomHeaderID(header.ID)).
			Order(ent.Asc(bomitem.FieldID)).
			All(ctx)
		if err != nil {
			return err
		}
		if len(bomRows) == 0 {
			return biz.ErrProductionOrderReferenceInvalid
		}
		for _, bomRow := range bomRows {
			materialRow, err := client.Material.Query().Where(material.ID(bomRow.MaterialID), material.IsActive(true)).Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return biz.ErrProductionOrderReferenceInvalid
				}
				return err
			}
			unitRow, err := client.Unit.Query().Where(unit.ID(bomRow.UnitID), unit.IsActive(true)).Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return biz.ErrProductionOrderReferenceInvalid
				}
				return err
			}
			planned := orderItem.PlannedQuantity.
				Mul(bomRow.Quantity).
				Mul(decimal.NewFromInt(1).Add(bomRow.LossRate)).
				Round(6)
			if !planned.GreaterThan(decimal.Zero) {
				return biz.ErrProductionOrderMaterialRequirementInvalid
			}
			if _, err := client.ProductionOrderMaterialRequirement.Create().
				SetProductionOrderID(orderID).
				SetProductionOrderItemID(orderItem.ID).
				SetBomHeaderID(header.ID).
				SetBomItemID(bomRow.ID).
				SetMaterialID(materialRow.ID).
				SetUnitID(unitRow.ID).
				SetNillableProductionOperationCode(bomRow.ProductionOperationCode).
				SetUnitQuantitySnapshot(bomRow.Quantity).
				SetLossRateSnapshot(bomRow.LossRate).
				SetPlannedQuantity(planned).
				SetMaterialCodeSnapshot(materialRow.Code).
				SetMaterialNameSnapshot(materialRow.Name).
				SetUnitCodeSnapshot(unitRow.Code).
				SetUnitNameSnapshot(unitRow.Name).
				Save(ctx); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadProductionOrderMaterialRequirements(ctx context.Context, client *ent.Client, orderID int) ([]*biz.ProductionOrderMaterialRequirement, error) {
	rows, err := client.ProductionOrderMaterialRequirement.Query().
		Where(productionordermaterialrequirement.ProductionOrderID(orderID)).
		Order(ent.Asc(productionordermaterialrequirement.FieldProductionOrderItemID), ent.Asc(productionordermaterialrequirement.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	issuedByRequirement := make(map[int]decimal.Decimal, len(rows))
	if len(rows) > 0 {
		facts, err := client.ProductionFact.Query().Where(
			productionfact.SourceType(biz.ProductionOrderSourceType),
			productionfact.SourceID(orderID),
			productionfact.FactType(biz.ProductionFactMaterialIssue),
			productionfact.Status(biz.OperationalFactStatusPosted),
		).All(ctx)
		if err != nil {
			return nil, err
		}
		for _, fact := range facts {
			if fact.SourceLineID == nil {
				return nil, biz.ErrProductionOrderMaterialRequirementInvalid
			}
			issuedByRequirement[*fact.SourceLineID] = issuedByRequirement[*fact.SourceLineID].Add(fact.Quantity)
		}
	}
	out := make([]*biz.ProductionOrderMaterialRequirement, 0, len(rows))
	for _, row := range rows {
		issued := issuedByRequirement[row.ID]
		if issued.GreaterThan(row.PlannedQuantity) {
			return nil, biz.ErrProductionOrderMaterialIssueQuantityExceeded
		}
		out = append(out, entProductionOrderMaterialRequirementToBiz(row, issued))
	}
	return out, nil
}

func entProductionOrderMaterialRequirementToBiz(row *ent.ProductionOrderMaterialRequirement, issued decimal.Decimal) *biz.ProductionOrderMaterialRequirement {
	if row == nil {
		return nil
	}
	return &biz.ProductionOrderMaterialRequirement{
		ID: row.ID, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID,
		BOMHeaderID: row.BomHeaderID, BOMItemID: row.BomItemID, MaterialID: row.MaterialID, UnitID: row.UnitID,
		ProductionOperationCode: row.ProductionOperationCode,
		UnitQuantitySnapshot:    row.UnitQuantitySnapshot, LossRateSnapshot: row.LossRateSnapshot,
		PlannedQuantity: row.PlannedQuantity, IssuedQuantity: issued, RemainingQuantity: row.PlannedQuantity.Sub(issued),
		MaterialCodeSnapshot: row.MaterialCodeSnapshot, MaterialNameSnapshot: row.MaterialNameSnapshot,
		UnitCodeSnapshot: row.UnitCodeSnapshot, UnitNameSnapshot: row.UnitNameSnapshot,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func equalProductionOrderOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func entProductionOrderToBiz(row *ent.ProductionOrder) *biz.ProductionOrder {
	if row == nil {
		return nil
	}
	return &biz.ProductionOrder{
		ID: row.ID, OrderNo: row.OrderNo, Status: row.Status, Version: row.Version,
		PlannedStartAt: row.PlannedStartAt, PlannedEndAt: row.PlannedEndAt, Note: row.Note,
		CloseReason: row.CloseReason, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy,
		ReleasedBy: row.ReleasedBy, ClosedBy: row.ClosedBy, CancelledBy: row.CancelledBy,
		ReleasedAt: row.ReleasedAt, ClosedAt: row.ClosedAt, CancelledAt: row.CancelledAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func entProductionOrderItemToBiz(row *ent.ProductionOrderItem) *biz.ProductionOrderItem {
	if row == nil {
		return nil
	}
	return &biz.ProductionOrderItem{
		ID: row.ID, ProductionOrderID: row.ProductionOrderID, LineNo: row.LineNo,
		ProductID: row.ProductID, ProductSKUID: row.ProductSkuID, UnitID: row.UnitID,
		PlannedQuantity: row.PlannedQuantity, SalesOrderItemID: row.SalesOrderItemID, BOMHeaderID: row.BomHeaderID,
		RouteCode: row.RouteCode, CustomerInspectionRequired: row.CustomerInspectionRequired,
		ProductCodeSnapshot: row.ProductCodeSnapshot, ProductNameSnapshot: row.ProductNameSnapshot,
		SKUCodeSnapshot: row.SkuCodeSnapshot, UnitNameSnapshot: row.UnitNameSnapshot,
		BOMVersionSnapshot: row.BomVersionSnapshot, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func productionOrderCASFailure(ctx context.Context, client *ent.Client, orderID, expectedVersion int, expectedStatus string) error {
	row, err := client.ProductionOrder.Get(ctx, orderID)
	if ent.IsNotFound(err) {
		return biz.ErrProductionOrderNotFound
	}
	if err != nil {
		return err
	}
	if row.Version != expectedVersion {
		return biz.ErrProductionOrderConflict
	}
	if row.Status != expectedStatus {
		return biz.ErrProductionOrderInvalidState
	}
	return biz.ErrProductionOrderConflict
}
