package data

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/engineeringmaterialrequest"
)

func TestSourceDocumentPostgresEngineeringMaterialAutomaticHandoff(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	f := prepareMaterialRequestFixture(t, ctx, data, fmt.Sprintf("AUTO-%d", time.Now().UnixNano()%100000000))
	line := client.SalesOrderItem.GetX(ctx, f.line.ID)
	order := client.SalesOrder.GetX(ctx, f.order.ID)
	bom := client.BOMHeader.GetX(ctx, *line.BomID)
	in := &biz.SalesOrderEngineeringMutation{SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Complete: true, Items: []biz.SalesOrderEngineeringItemMutation{{ID: line.ID, ProductID: line.ProductID, ProductSkuID: line.ProductSkuID, BOMID: line.BomID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro()}}}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; _, err := f.uc.SaveSalesOrderEngineering(ctx, in); results <- err }()
	}
	close(start)
	wg.Wait()
	close(results)
	passed, conflict := 0, 0
	for err := range results {
		if err == nil {
			passed++
		} else if errors.Is(err, biz.ErrSalesOrderConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if passed != 1 || conflict != 1 {
		t.Fatalf("concurrent saves: passed=%d conflict=%d", passed, conflict)
	}
	request, err := f.uc.GetEngineeringMaterialRequest(ctx, order.ID, false)
	if err != nil || request.Status != biz.MaterialRequestSubmitted || request.SourceOrderVersion != order.Version+1 {
		t.Fatalf("automatic handoff: %+v %v", request, err)
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "ready")
	if len(request.PurchaseOrders) != 0 {
		t.Fatal("engineering save bypassed approval")
	}
}

func saveMaterialEngineeringFixture(t *testing.T, ctx context.Context, client *ent.Client, f materialRequestFixture, _ string) (*biz.SalesOrderWithItems, error) {
	t.Helper()
	order := client.SalesOrder.GetX(ctx, f.order.ID)
	line := client.SalesOrderItem.GetX(ctx, f.line.ID)
	bom := client.BOMHeader.GetX(ctx, *line.BomID)
	return f.uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{
		SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Complete: true,
		Items: []biz.SalesOrderEngineeringItemMutation{{ID: line.ID, ProductID: line.ProductID, ProductSkuID: line.ProductSkuID, BOMID: line.BomID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro()}},
	})
}

func TestEngineeringMaterialAutoSubmitOnEngineeringCompletion(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_auto_save")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "AUTO-SAVE")
	client.SalesOrderItem.UpdateOneID(f.line.ID).ClearBomFingerprint().SaveX(ctx)
	before := client.SalesOrder.GetX(ctx, f.order.ID)
	result, err := saveMaterialEngineeringFixture(t, ctx, client, f, "样品已核对")
	if err != nil {
		t.Fatal(err)
	}
	request, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
	if err != nil || request.Status != biz.MaterialRequestSubmitted || request.SourceOrderVersion != result.Order.Version || request.SubmittedBy != 11 || len(request.Items) != 2 {
		t.Fatalf("automatic frozen request: %+v %v", request, err)
	}
	if request.Items[0].RequiredQuantity.String() != "222.64" || request.Items[1].RequiredQuantity.String() != "111.32" {
		t.Fatal("automatic handoff changed material calculation")
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "ready")
	order, err := f.uc.GetSalesOrder(ctx, f.order.ID)
	if err != nil || order.EngineeringMaterialStatus == nil || *order.EngineeringMaterialStatus != biz.MaterialRequestSubmitted {
		t.Fatal("order readback lost review status", err)
	}
	if client.PurchaseOrder.Query().CountX(ctx) != 0 {
		t.Fatal("engineering save generated purchase commitments")
	}
	if _, err := saveMaterialEngineeringFixture(t, ctx, client, f, "重复保存"); !errors.Is(err, biz.ErrSalesOrderEngineeringDependency) {
		t.Fatalf("frozen source edited: %v", err)
	}
	if client.SalesOrder.GetX(ctx, f.order.ID).Version != before.Version+1 || client.EngineeringMaterialRequest.Query().CountX(ctx) != 1 || client.WorkflowTask.Query().CountX(ctx) != 1 {
		t.Fatal("retry duplicated source or task")
	}
}

func TestEngineeringMaterialAutoSubmitWaitsForReadySources(t *testing.T) {
	for _, missing := range []string{"supplier", "archived_bom", "other_product"} {
		t.Run(missing, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_auto_missing_"+missing)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "AUTO-MISS-"+missing)
			var restore func()
			switch missing {
			case "supplier":
				part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
				material := client.Material.GetX(ctx, part.MaterialID)
				client.Supplier.UpdateOneID(*material.SupplierID).SetIsActive(false).SaveX(ctx)
				restore = func() { client.Supplier.UpdateOneID(*material.SupplierID).SetIsActive(true).SaveX(ctx) }
			case "archived_bom":
				client.BOMHeader.UpdateOneID(f.bom.ID).SetStatus(biz.BOMStatusArchived).SaveX(ctx)
				restore = func() { client.BOMHeader.UpdateOneID(f.bom.ID).SetStatus(biz.BOMStatusActive).SaveX(ctx) }
			case "other_product":
				line := client.SalesOrderItem.Create().SetSalesOrderID(f.order.ID).SetLineNo(2).SetUnitID(f.line.UnitID).SetRequestedProductName("第二件产品").SetOrderedQuantity(f.line.OrderedQuantity).SaveX(ctx)
				restore = func() {
					client.SalesOrderItem.UpdateOneID(line.ID).SetLineStatus(biz.SalesOrderItemStatusCanceled).SaveX(ctx)
				}
			}
			if _, err := saveMaterialEngineeringFixture(t, ctx, client, f, "资料已完成"); err == nil {
				t.Fatal("incomplete engineering completion was accepted")
			}
			if client.EngineeringMaterialRequest.Query().CountX(ctx) != 0 || client.WorkflowTask.Query().CountX(ctx) != 0 {
				t.Fatal("incomplete order entered approval")
			}
			restore()
			if _, err := saveMaterialEngineeringFixture(t, ctx, client, f, "来源已补齐"); err != nil {
				t.Fatal(err)
			}
			if client.EngineeringMaterialRequest.Query().CountX(ctx) != 1 {
				t.Fatal("ready source did not automatically enter approval")
			}
		})
	}
}

func TestEngineeringMaterialAutoRevisionKeepsHistoryAndOwnership(t *testing.T) {
	for _, state := range []string{"ready", "blocked", "assigned", "event_failure"} {
		t.Run(state, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_auto_revision_"+state)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "AUTO-REV-"+state)
			request := submitMaterialRequestFixture(t, ctx, f)
			reason := "请核对工艺说明"
			if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "REJECT", ReviewStage: "BOSS", Note: &reason}); err != nil {
				t.Fatal(err)
			}
			task := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialRevisionGroup, request.ID, "ready")
			if state == "blocked" {
				client.WorkflowTask.UpdateOneID(task.ID).SetTaskStatusKey("blocked").SetBlockedReason("等待确认").SaveX(ctx)
			}
			if state == "assigned" {
				client.WorkflowTask.UpdateOneID(task.ID).SetAssigneeID(99).SaveX(ctx)
			}
			if state == "event_failure" {
				client.WorkflowTaskEvent.Use(func(next ent.Mutator) ent.Mutator {
					return ent.MutateFunc(func(context.Context, ent.Mutation) (ent.Value, error) {
						return nil, errors.New("event persistence failed")
					})
				})
			}
			before := client.SalesOrder.GetX(ctx, f.order.ID)
			line := client.SalesOrderItem.GetX(ctx, f.line.ID)
			_, err := saveMaterialEngineeringFixture(t, ctx, client, f, "工艺说明已重新核对")
			if state != "ready" {
				if err == nil || client.SalesOrder.GetX(ctx, f.order.ID).Version != before.Version || !sameOptionalString(client.SalesOrderItem.GetX(ctx, f.line.ID).BomFingerprint, line.BomFingerprint) || client.EngineeringMaterialRequest.Query().CountX(ctx) != 1 {
					t.Fatalf("failed handoff did not roll back engineering source: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialRevisionGroup, request.ID, "done")
			current, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
			if err != nil || current.ID == request.ID || current.Status != biz.MaterialRequestSubmitted {
				t.Fatalf("revision not resubmitted: %+v %v", current, err)
			}
			materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, current.ID, "ready")
			old, err := f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID, request.ID)
			if err != nil || old.Status != biz.MaterialRequestRejected || *old.ReviewNote != reason {
				t.Fatal("revision overwrote history", err)
			}
		})
	}
}

func TestEngineeringCompletionSharesOneBOMAcrossOrderLines(t *testing.T) {
	_, client := openSalesOrderRepoTest(t, "engineering_complete_shared_bom")
	defer mustCloseEntClient(t, client)
	testEngineeringCompletionSharesOneBOM(t, &Data{postgres: client}, client)
}
func TestSourceDocumentPostgresEngineeringMaterialSharedBOM(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	testEngineeringCompletionSharesOneBOM(t, data, client)
}
func testEngineeringCompletionSharesOneBOM(t *testing.T, data *Data, client *ent.Client) {
	ctx := context.Background()
	f := prepareMaterialRequestFixture(t, ctx, data, "COMPLETE-MULTI")
	first := client.SalesOrderItem.GetX(ctx, f.line.ID)
	second := client.SalesOrderItem.Create().SetSalesOrderID(f.order.ID).SetLineNo(2).SetProductID(first.ProductID).SetUnitID(first.UnitID).SetRequestedProductName("同款另一行").SetOrderedQuantity(first.OrderedQuantity).SaveX(ctx)
	bom := client.BOMHeader.UpdateOneID(f.bom.ID).SetStatus(biz.BOMStatusDraft).SaveX(ctx)
	order := client.SalesOrder.GetX(ctx, f.order.ID)
	items := []biz.SalesOrderEngineeringItemMutation{}
	for _, id := range []int{first.ID, second.ID} {
		items = append(items, biz.SalesOrderEngineeringItemMutation{ID: id, ProductID: first.ProductID, BOMID: &bom.ID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro()})
	}
	if _, err := f.uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Complete: true, Items: items}); err != nil {
		t.Fatal(err)
	}
	a, b := client.SalesOrderItem.GetX(ctx, first.ID), client.SalesOrderItem.GetX(ctx, second.ID)
	if a.BomFingerprint == nil || !sameOptionalString(a.BomFingerprint, b.BomFingerprint) || client.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(f.order.ID)).CountX(ctx) != 1 {
		t.Fatal("shared BOM completion was not atomic")
	}
}
