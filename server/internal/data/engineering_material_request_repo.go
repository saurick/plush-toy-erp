package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"fmt"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/engineeringmaterialrequestitem"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/supplier"
	"sort"
	"time"
)

var _ biz.EngineeringMaterialRequestRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) GetEngineeringMaterialRequest(ctx context.Context, orderID int, preview bool) (*biz.EngineeringMaterialRequest, error) {
	if !preview {
		row, err := r.data.postgres.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(orderID)).Order(ent.Desc(engineeringmaterialrequest.FieldID)).First(ctx)
		if err == nil {
			return loadEngineeringMaterialRequest(ctx, r.data.postgres, row)
		}
		if !ent.IsNotFound(err) {
			return nil, err
		}
	}
	order, err := r.data.postgres.SalesOrder.Get(ctx, orderID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrSalesOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.buildEngineeringMaterialPreview(ctx, r.data.postgres, order, false)
}

func (r *salesOrderRepo) lockEngineeringOrder(ctx context.Context, client *ent.Client, orderID int) (*ent.SalesOrder, error) {
	query := client.SalesOrder.Query().Where(salesorder.ID(orderID))
	if r.data.sqlDialect == dialect.Postgres {
		query.Where(func(s *sql.Selector) { s.ForUpdate() })
	}
	row, err := query.Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrSalesOrderNotFound
	}
	return row, err
}

func (r *salesOrderRepo) buildEngineeringMaterialPreview(ctx context.Context, client *ent.Client, order *ent.SalesOrder, lock bool) (*biz.EngineeringMaterialRequest, error) {
	result := &biz.EngineeringMaterialRequest{SalesOrderID: order.ID, OrderNo: order.OrderNo, SourceOrderVersion: order.Version, Status: "PREVIEW", Items: []*biz.EngineeringMaterialRequestItem{}, Sources: []map[string]any{}, Issues: []string{}, PurchaseOrders: []biz.EngineeringMaterialPurchaseOrder{}}
	if order.LifecycleStatus != biz.SalesOrderStatusActive {
		result.Issues = append(result.Issues, "订单生效后才能提交采购用料审批")
	}
	lines, err := client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(order.ID), salesorderitem.LineStatus(biz.SalesOrderItemStatusOpen)).Order(ent.Asc(salesorderitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		result.Issues = append(result.Issues, "订单没有待生产的需求明细")
	}
	byKey := map[[2]int]*biz.EngineeringMaterialRequestItem{}
	for _, line := range lines {
		if line.ProductID == 0 || line.SampleBomID == nil {
			result.Issues = append(result.Issues, fmt.Sprintf("第 %d 行尚未关联工程产品和 BOM", line.LineNo))
			continue
		}
		q := client.BOMHeader.Query().Where(bomheader.ID(*line.SampleBomID), bomheader.ProductID(line.ProductID)).WithItems(func(q *ent.BOMItemQuery) { q.Order(ent.Asc(bomitem.FieldID)) })
		if lock {
			q.Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) })
		}
		header, err := q.Only(ctx)
		if ent.IsNotFound(err) {
			result.Issues = append(result.Issues, fmt.Sprintf("第 %d 行 BOM 与产品不符", line.LineNo))
			continue
		}
		if err != nil {
			return nil, err
		}
		lockDialect := ""
		if lock {
			lockDialect = r.data.sqlDialect
		}
		fingerprint, err := salesOrderBOMFingerprint(ctx, client, header, lockDialect)
		if err != nil {
			return nil, err
		}
		if line.EngineeringStatus != biz.SalesOrderEngineeringConfirmed || header.Status != biz.BOMStatusActive || line.SampleBomFingerprint == nil || *line.SampleBomFingerprint != fingerprint {
			result.Issues = append(result.Issues, fmt.Sprintf("第 %d 行需确认当前样品并启用量产 BOM", line.LineNo))
		}
		imageID, err := currentSalesOrderSampleImage(ctx, client, line.ProductID)
		if err != nil {
			return nil, err
		}
		if line.SampleImageAttachmentID == nil || imageID != *line.SampleImageAttachmentID {
			result.Issues = append(result.Issues, fmt.Sprintf("第 %d 行产品图片已变更，请重新确认样品", line.LineNo))
		}
		if len(header.Edges.Items) == 0 {
			result.Issues = append(result.Issues, fmt.Sprintf("第 %d 行 BOM 没有材料明细", line.LineNo))
		}
		productionQuantity := line.OrderedQuantity.Add(line.PreShipmentSampleQuantity)
		for _, part := range header.Edges.Items {
			mq := client.Material.Query().Where(material.ID(part.MaterialID)).WithSupplier().WithDefaultUnit()
			if lock {
				mq.Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) })
			}
			m, err := mq.Only(ctx)
			if err != nil {
				return nil, err
			}
			u, err := client.Unit.Get(ctx, part.UnitID)
			if err != nil {
				return nil, err
			}
			if !m.IsActive || !u.IsActive || m.DefaultUnitID != part.UnitID {
				result.Issues = append(result.Issues, fmt.Sprintf("材料 %s 的状态或计量单位需要核对", m.Name))
			}
			supplierID, supplierName := 0, ""
			if m.SupplierID != nil && m.Edges.Supplier != nil {
				supplierID, supplierName = *m.SupplierID, m.Edges.Supplier.Name
			}
			if supplierID == 0 || !m.Edges.Supplier.IsActive {
				result.Issues = append(result.Issues, fmt.Sprintf("材料 %s 尚未选择有效厂商", m.Name))
			}
			usage := biz.MaterialPartUsage(productionQuantity, part.Quantity, part.LossRate)
			if !usage.IsPositive() || usage.GreaterThanOrEqual(decimal.New(1, 14)) {
				result.Issues = append(result.Issues, fmt.Sprintf("材料 %s 的用量不在有效范围", m.Name))
			}
			key := [2]int{m.ID, part.UnitID}
			group := byKey[key]
			if group == nil {
				group = &biz.EngineeringMaterialRequestItem{MaterialID: m.ID, UnitID: part.UnitID, SupplierID: supplierID, MaterialCode: m.Code, MaterialName: m.Name, SupplierName: supplierName, SupplierItemNo: m.SupplierItemNo, Color: m.Color, Spec: m.Spec, UnitName: u.Name}
				byKey[key] = group
				result.Items = append(result.Items, group)
			}
			group.RequiredQuantity = group.RequiredQuantity.Add(usage)
			result.Sources = append(result.Sources, map[string]any{"sales_order_item_id": line.ID, "line_no": line.LineNo, "product_id": line.ProductID, "product_name": line.ProductNameSnapshot, "product_sku_id": line.ProductSkuID, "bom_id": header.ID, "bom_version": header.Version, "bom_edit_version": header.UpdatedAt.UnixMicro(), "sample_image_attachment_id": imageID, "bom_item_id": part.ID, "material_id": m.ID, "unit_id": u.ID, "position": part.Position, "piece_count": part.PieceCount, "unit_usage": part.Quantity.String(), "loss_rate": part.LossRate.String(), "production_quantity": productionQuantity.String(), "total_usage": usage.String(), "process_base": part.ProcessBase, "process_method": part.ProcessMethod})
		}
	}
	if len(result.Items) > 2000 {
		return nil, biz.ErrMaterialRequestNotReady
	}
	for _, item := range result.Items {
		if item.RequiredQuantity.GreaterThanOrEqual(decimal.New(1, 14)) {
			result.Issues = append(result.Issues, "汇总数量超出有效范围")
		}
	}
	result.SourceHash = engineeringMaterialSourceHash(result)
	return result, nil
}

func engineeringMaterialSourceHash(in *biz.EngineeringMaterialRequest) string {
	items := make([]biz.EngineeringMaterialRequestItem, len(in.Items))
	for i, item := range in.Items {
		items[i] = *item
		items[i].ID = 0
		items[i].PurchaseQuantity = nil
		items[i].UnitPrice = nil
		items[i].ExpectedArrivalDate = nil
		items[i].Note = nil
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].MaterialID != items[j].MaterialID {
			return items[i].MaterialID < items[j].MaterialID
		}
		return items[i].UnitID < items[j].UnitID
	})
	payload, _ := json.Marshal([]any{in.SalesOrderID, in.SourceOrderVersion, in.Sources, items})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func (r *salesOrderRepo) SubmitEngineeringMaterialRequest(ctx context.Context, in *biz.EngineeringMaterialSubmit) (_ *biz.EngineeringMaterialRequest, resultErr error) {
	defer func() { resultErr = mapInventoryPersistenceError(resultErr, biz.ErrMaterialRequestConflict) }()
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	order, err := r.lockEngineeringOrder(ctx, tx.Client(), in.SalesOrderID)
	if err != nil {
		return nil, err
	}
	existing, err := tx.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(in.SalesOrderID), engineeringmaterialrequest.StatusNEQ(biz.MaterialRequestRejected)).Only(ctx)
	if err == nil {
		result, err := loadEngineeringMaterialRequest(ctx, tx.Client(), existing)
		if err != nil {
			return nil, err
		}
		if result.SourceOrderVersion != in.ExpectedVersion || result.SourceHash != in.ExpectedSourceHash {
			return nil, biz.ErrMaterialRequestConflict
		}
		return result, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	if order.Version != in.ExpectedVersion {
		return nil, biz.ErrMaterialRequestConflict
	}
	preview, err := r.buildEngineeringMaterialPreview(ctx, tx.Client(), order, true)
	if err != nil {
		return nil, err
	}
	if preview.SourceHash != in.ExpectedSourceHash {
		return nil, biz.ErrMaterialRequestConflict
	}
	if len(preview.Issues) > 0 || len(preview.Items) == 0 {
		return nil, biz.ErrMaterialRequestNotReady
	}
	row, err := tx.EngineeringMaterialRequest.Create().SetSalesOrderID(order.ID).SetSourceOrderVersion(order.Version).SetOrderNoSnapshot(order.OrderNo).SetSourceSnapshot(preview.Sources).SetSubmittedBy(in.ActorID).Save(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range preview.Items {
		_, err = tx.EngineeringMaterialRequestItem.Create().SetRequestID(row.ID).SetMaterialID(item.MaterialID).SetUnitID(item.UnitID).SetSupplierID(item.SupplierID).SetMaterialCode(item.MaterialCode).SetMaterialName(item.MaterialName).SetSupplierName(item.SupplierName).SetNillableSupplierItemNo(item.SupplierItemNo).SetNillableColor(item.Color).SetNillableSpec(item.Spec).SetUnitName(item.UnitName).SetRequiredQuantity(item.RequiredQuantity).Save(ctx)
		if err != nil {
			return nil, err
		}
	}
	result, err := loadEngineeringMaterialRequest(ctx, tx.Client(), row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return result, nil
}

func (r *salesOrderRepo) ReviewEngineeringMaterialRequest(ctx context.Context, in *biz.EngineeringMaterialReview) (_ *biz.EngineeringMaterialRequest, resultErr error) {
	defer func() { resultErr = mapInventoryPersistenceError(resultErr, biz.ErrMaterialRequestConflict) }()
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	row, err := tx.EngineeringMaterialRequest.Get(ctx, in.ID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrMaterialRequestConflict
	}
	if err != nil {
		return nil, err
	}
	order, err := r.lockEngineeringOrder(ctx, tx.Client(), row.SalesOrderID)
	if err != nil {
		return nil, err
	}
	row, err = tx.EngineeringMaterialRequest.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	current, err := loadEngineeringMaterialRequest(ctx, tx.Client(), row)
	if err != nil {
		return nil, err
	}
	if in.Action == "FINANCE_APPROVE" && row.Status == biz.MaterialRequestApproved && row.FinanceReviewedBy != nil && *row.FinanceReviewedBy == in.ActorID && sameOptionalString(current.FinanceReviewNote, in.Note) && financeMaterialLinesMatch(current.Items, in.Items) {
		return current, nil
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrMaterialRequestConflict
	}
	now := time.Now()
	update := tx.EngineeringMaterialRequest.UpdateOneID(row.ID).AddVersion(1)
	if in.Note == nil {
		update.ClearReviewNote()
	} else {
		update.SetReviewNote(*in.Note)
	}
	if in.Action == "REJECT" {
		if (in.ReviewStage == "BOSS" && row.Status != biz.MaterialRequestSubmitted) || (in.ReviewStage == "FINANCE" && row.Status != biz.MaterialRequestBossApproved) || (in.ReviewStage != "BOSS" && in.ReviewStage != "FINANCE") {
			return nil, biz.ErrMaterialRequestReviewInvalid
		}
		update.SetStatus(biz.MaterialRequestRejected).SetRejectedBy(in.ActorID).SetRejectedAt(now)
	} else {
		preview, err := r.buildEngineeringMaterialPreview(ctx, tx.Client(), order, true)
		if err != nil {
			return nil, err
		}
		if preview.SourceHash != current.SourceHash {
			return nil, biz.ErrMaterialRequestConflict
		}
		if len(preview.Issues) > 0 {
			return nil, biz.ErrMaterialRequestNotReady
		}
		switch in.Action {
		case "BOSS_APPROVE":
			if row.Status != biz.MaterialRequestSubmitted {
				return nil, biz.ErrMaterialRequestReviewInvalid
			}
			update.SetStatus(biz.MaterialRequestBossApproved).SetBossReviewedBy(in.ActorID).SetBossReviewedAt(now).SetNillableBossReviewNote(in.Note)
		case "FINANCE_APPROVE":
			if row.Status != biz.MaterialRequestBossApproved || row.BossReviewedBy == nil || *row.BossReviewedBy == in.ActorID {
				return nil, biz.ErrMaterialRequestReviewInvalid
			}
			if err := r.generateMaterialPurchaseOrders(ctx, tx.Client(), current, in); err != nil {
				return nil, err
			}
			update.SetStatus(biz.MaterialRequestApproved).SetFinanceReviewedBy(in.ActorID).SetFinanceReviewedAt(now).SetNillableFinanceReviewNote(in.Note)
		default:
			return nil, biz.ErrBadParam
		}
	}
	row, err = update.Save(ctx)
	if err != nil {
		return nil, err
	}
	result, err := loadEngineeringMaterialRequest(ctx, tx.Client(), row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return result, nil
}

func financeMaterialLinesMatch(items []*biz.EngineeringMaterialRequestItem, inputs []biz.EngineeringMaterialFinanceLine) bool {
	if len(items) != len(inputs) {
		return false
	}
	byID := map[int]biz.EngineeringMaterialFinanceLine{}
	for _, v := range inputs {
		byID[v.ID] = v
	}
	for _, item := range items {
		v, ok := byID[item.ID]
		if !ok || item.PurchaseQuantity == nil || item.UnitPrice == nil || !item.PurchaseQuantity.Equal(v.PurchaseQuantity) || !item.UnitPrice.Equal(v.UnitPrice) || item.ExpectedArrivalDate == nil || !item.ExpectedArrivalDate.Equal(v.ExpectedArrivalDate) || !sameOptionalString(item.Note, v.Note) {
			return false
		}
	}
	return true
}

func (r *salesOrderRepo) generateMaterialPurchaseOrders(ctx context.Context, client *ent.Client, request *biz.EngineeringMaterialRequest, in *biz.EngineeringMaterialReview) error {
	if len(in.Items) != len(request.Items) {
		return biz.ErrMaterialRequestReviewInvalid
	}
	byID := map[int]biz.EngineeringMaterialFinanceLine{}
	for _, item := range in.Items {
		byID[item.ID] = item
	}
	groups := map[int][]*biz.EngineeringMaterialRequestItem{}
	for _, item := range request.Items {
		line, ok := byID[item.ID]
		if !ok {
			return biz.ErrMaterialRequestReviewInvalid
		}
		if !line.PurchaseQuantity.Equal(item.RequiredQuantity) && line.Note == nil {
			return biz.ErrMaterialRequestReviewInvalid
		}
		if _, err := client.EngineeringMaterialRequestItem.UpdateOneID(item.ID).SetPurchaseQuantity(line.PurchaseQuantity).SetUnitPrice(line.UnitPrice).SetExpectedArrivalDate(line.ExpectedArrivalDate).SetNillableNote(line.Note).Save(ctx); err != nil {
			return err
		}
		if line.PurchaseQuantity.IsPositive() {
			groups[item.SupplierID] = append(groups[item.SupplierID], item)
		}
	}
	supplierIDs := make([]int, 0, len(groups))
	for id := range groups {
		supplierIDs = append(supplierIDs, id)
	}
	sort.Ints(supplierIDs)
	for _, supplierID := range supplierIDs {
		s, err := client.Supplier.Query().Where(supplier.ID(supplierID), supplier.IsActive(true)).Where(func(s *sql.Selector) { applyBOMReferenceShareLock(s, r.data.sqlDialect) }).Only(ctx)
		if ent.IsNotFound(err) {
			return biz.ErrMaterialRequestNotReady
		}
		if err != nil {
			return err
		}
		lines := groups[supplierID]
		arrival := byID[lines[0].ID].ExpectedArrivalDate
		for _, line := range lines {
			if byID[line.ID].ExpectedArrivalDate.After(arrival) {
				arrival = byID[line.ID].ExpectedArrivalDate
			}
		}
		po, err := client.PurchaseOrder.Create().SetEngineeringMaterialRequestID(request.ID).SetPurchaseOrderNo(fmt.Sprintf("PO-MR-%d-%d", request.ID, supplierID)).SetSupplierID(supplierID).SetCurrency("CNY").SetPaymentTermDays(s.DefaultPaymentTermDays).SetNillablePaymentMethod(s.DefaultPaymentMethod).SetNillableInvoiceRequired(s.DefaultInvoiceRequired).SetNillableInvoiceCategory(s.DefaultInvoiceCategory).SetSupplierSnapshot(map[string]any{"name": s.Name, "code": s.Code}).SetPurchaseDate(time.Now()).SetExpectedArrivalDate(arrival).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SetNote("工程用料审批：" + request.OrderNo).Save(ctx)
		if err != nil {
			return err
		}
		for i, item := range lines {
			line := byID[item.ID]
			amount := line.PurchaseQuantity.Mul(line.UnitPrice).Round(6)
			_, err := client.PurchaseOrderItem.Create().SetPurchaseOrderID(po.ID).SetLineNo(i + 1).SetDisplayOrder(i + 1).SetMaterialID(item.MaterialID).SetUnitID(item.UnitID).SetMaterialCodeSnapshot(item.MaterialCode).SetMaterialNameSnapshot(item.MaterialName).SetNillableColorSnapshot(item.Color).SetProductOrderNoSnapshot(request.OrderNo).SetPurchasedQuantity(line.PurchaseQuantity).SetUnitPrice(line.UnitPrice).SetAmount(amount).SetExpectedArrivalDate(line.ExpectedArrivalDate).SetNillableNote(line.Note).Save(ctx)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func loadEngineeringMaterialRequest(ctx context.Context, client *ent.Client, row *ent.EngineeringMaterialRequest) (*biz.EngineeringMaterialRequest, error) {
	result := &biz.EngineeringMaterialRequest{ID: row.ID, SalesOrderID: row.SalesOrderID, OrderNo: row.OrderNoSnapshot, SourceOrderVersion: row.SourceOrderVersion, Status: row.Status, Version: row.Version, Sources: row.SourceSnapshot, Items: []*biz.EngineeringMaterialRequestItem{}, Issues: []string{}, SubmittedBy: row.SubmittedBy, SubmittedAt: &row.SubmittedAt, BossReviewedBy: row.BossReviewedBy, BossReviewedAt: row.BossReviewedAt, FinanceReviewedBy: row.FinanceReviewedBy, FinanceReviewedAt: row.FinanceReviewedAt, RejectedBy: row.RejectedBy, RejectedAt: row.RejectedAt, ReviewNote: row.ReviewNote, BossReviewNote: row.BossReviewNote, FinanceReviewNote: row.FinanceReviewNote, PurchaseOrders: []biz.EngineeringMaterialPurchaseOrder{}}
	items, err := client.EngineeringMaterialRequestItem.Query().Where(engineeringmaterialrequestitem.RequestID(row.ID)).Order(ent.Asc(engineeringmaterialrequestitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, v := range items {
		result.Items = append(result.Items, &biz.EngineeringMaterialRequestItem{ID: v.ID, MaterialID: v.MaterialID, UnitID: v.UnitID, SupplierID: v.SupplierID, MaterialCode: v.MaterialCode, MaterialName: v.MaterialName, SupplierName: v.SupplierName, SupplierItemNo: v.SupplierItemNo, Color: v.Color, Spec: v.Spec, UnitName: v.UnitName, RequiredQuantity: v.RequiredQuantity, PurchaseQuantity: v.PurchaseQuantity, UnitPrice: v.UnitPrice, ExpectedArrivalDate: v.ExpectedArrivalDate, Note: v.Note})
	}
	orders, err := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(row.ID)).Order(ent.Asc(purchaseorder.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, v := range orders {
		result.PurchaseOrders = append(result.PurchaseOrders, biz.EngineeringMaterialPurchaseOrder{ID: v.ID, PurchaseOrderNo: v.PurchaseOrderNo, SupplierID: v.SupplierID})
	}
	result.SourceHash = engineeringMaterialSourceHash(result)
	return result, nil
}
