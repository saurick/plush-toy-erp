package data

import (
	"context"
	"fmt"
	"github.com/go-kratos/kratos/v2/log"
	"io"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"strings"
	"testing"
	"time"
)

func TestWorkflowExceptionsDeduplicateFactsAndRespectVisibility(t *testing.T) {
	f := openProductionOrderRepoTest(t, "exception_projection")
	createProductionWIPRouteProcesses(t, context.Background(), f.client)
	testWorkflowExceptionProjection(t, f)
}

func TestProductionOrderPostgresExceptionProjection(t *testing.T) {
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, context.Background(), pg.client, pg.suffix)
	testWorkflowExceptionProjection(t, productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID})
}

func testWorkflowExceptionProjection(t *testing.T, f productionOrderTestFixture) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	flow := releaseProductionWIPRoute(t, ctx, f, "EX-PROJECTION-"+suffix, 10, false)
	batch := flow.Batches[0]
	iqc := f.client.QualityInspection.Create().SetInspectionNo("IQC-EX-" + suffix).SetProductionWipBatchID(batch.ID).SetGateCode(biz.ProductionWIPQualityGateCutPiece).SetSourceType("PRODUCTION_WIP").SetSourceID(batch.ID).SetInspectionType("PRODUCTION_STAGE").SetSubjectType("WIP").SetSubjectID(batch.ID).SetStatus("REJECTED").SetResult("REJECT").SetInspectedAt(time.Now()).SetDecisionNote("颜色与尺寸异常").SaveX(ctx)
	for _, role := range []string{"quality", "sales", "production", "warehouse"} {
		f.client.WorkflowTask.Create().SetTaskCode("EX-" + suffix + role).SetTaskGroup("handoff_production_exception").SetTaskName("处理裁片异常").SetSourceType("quality_inspection").SetSourceID(iqc.ID).SetOwnerRoleKey(role).SetTaskStatusKey("ready").SaveX(ctx)
	}
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	// PostgreSQL families share a database; count only this fixture's incidents.
	query := biz.WorkflowExceptionQuery{Limit: 1, Keyword: suffix, Visibility: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}}
	board, err := repo.ListWorkflowExceptions(ctx, query)
	if err != nil {
		t.Fatal(err)
	}
	if board.Total != 1 || len(board.Items) != 1 || board.Open != 1 || board.Closed != 0 || board.PendingTasks != 4 || board.AffectedOrders != 1 || len(board.Items[0].TaskIDs) != 4 {
		t.Fatalf("event/task/order dedupe=%+v", board)
	}
	query.Offset = 1
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 || len(board.Items) != 0 || board.PendingTasks != 4 {
		t.Fatalf("counts must precede pagination: %+v %v", board, err)
	}
	query.View = "tasks"
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.ViewTotal != 4 || len(board.Tasks) != 1 || board.PendingTasks != 4 {
		t.Fatalf("task drilldown must page all distinct tasks: %+v %v", board, err)
	}
	query.View = "orders"
	query.Offset = 0
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.ViewTotal != 1 || len(board.Orders) != 1 || board.Orders[0].Number == "" {
		t.Fatalf("order drilldown must dedupe orders: %+v %v", board, err)
	}
	query.View = ""
	query.Offset = 0
	query.Visibility = &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"sales"}}
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.PendingTasks != 1 || len(board.Items[0].Tasks) != 1 {
		t.Fatalf("role leaked related tasks: %+v %v", board, err)
	}
	query.StageKey = "cutting_quality"
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 {
		t.Fatalf("fact-derived stage filter: %+v %v", board, err)
	}
	query.StageKey = "shell_quality"
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 0 {
		t.Fatalf("wrong stage leaked events: %+v %v", board, err)
	}
	query.StageKey = ""
	query.Visibility = &biz.WorkflowTaskVisibilityScope{}
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 0 || board.PendingTasks != 0 || board.AffectedOrders != 0 {
		t.Fatalf("hidden event leaked through counts: %+v %v", board, err)
	}
	for _, view := range []string{"tasks", "orders"} {
		query.View = view
		board, err = repo.ListWorkflowExceptions(ctx, query)
		if err != nil || board.ViewTotal != 0 || len(board.Tasks) != 0 || len(board.Orders) != 0 {
			t.Fatalf("drilldown leaked hidden facts: %+v %v", board, err)
		}
	}
	query.View = ""
	// Approval alone does not close an incident. Execution closes scrap, and a
	// reversal reopens it without losing the original quality identity.
	f.client.ProductionWIPBatch.UpdateOneID(batch.ID).SetStatus(biz.ProductionWIPStatusRejected).SaveX(ctx)
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	factUC := biz.NewOperationalFactUsecase(factRepo)
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-DEC-" + suffix, DecisionType: biz.ProductionExceptionScrap, ProductionWIPBatchID: &batch.ID, QualityInspectionID: &iqc.ID, RequestedQuantity: batch.Quantity, Reason: "检验不合格", IdempotencyKey: "exception-projection-" + suffix, RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("ex-project-approver-" + suffix).SetPasswordHash("test-only-password-hash").SaveX(ctx)
	approved, err := factRepo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准报废"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	query.Visibility = &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 || board.Closed != 0 || board.Items[0].State != "executing" {
		t.Fatalf("approval incorrectly closed incident: %+v %v", board, err)
	}
	applied, err := factRepo.executeProductionException(ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "实际执行报废"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 || board.Closed != 1 {
		t.Fatalf("posted scrap did not close original incident: %+v %v", board, err)
	}
	if _, err = factUC.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "冲正处置"}); err != nil {
		t.Fatal(err)
	}
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 || board.Open != 1 || board.Closed != 0 {
		t.Fatalf("reversal failed to reopen original incident: %+v %v", board, err)
	}
	// Projection fixtures retain the original rejected inspection while a real
	// lineage of rework batches returns to the same quality gate.
	original := f.client.ProductionWIPBatch.GetX(ctx, batch.ID)
	reworkDecision := f.client.ProductionExceptionDecision.Create().SetDecisionNo("EX-RW-" + suffix).SetDecisionType(biz.ProductionExceptionReworkOriginal).SetProductionOrderID(original.ProductionOrderID).SetProductionOrderItemID(original.ProductionOrderItemID).SetProductionWipBatchID(original.ID).SetQualityInspectionID(iqc.ID).SetTargetOperationID(original.ProductionOrderOperationID).SetRequestedQuantity(original.Quantity).SetApprovedQuantity(original.Quantity).SetReason("原工序返工复检").SetIdempotencyKey("ex-rw-" + suffix).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetRequestedBy(f.actorID).SetStatus(biz.ProductionExceptionApproved).SetDecidedBy(approver.ID).SetDecidedAt(time.Now()).SetDecisionReason("同意返工").SetExecutionStatus(biz.ProductionExceptionExecutionApplied).SetExecutedBy(f.actorID).SetExecutedAt(time.Now()).SetExecutionReason("已派返工").SaveX(ctx)
	branch := f.client.ProductionWIPBatch.Create().SetBatchNo("EX-RETURN-" + suffix).SetProductionOrderID(original.ProductionOrderID).SetProductionOrderItemID(original.ProductionOrderItemID).SetProductionOrderOperationID(original.ProductionOrderOperationID).SetSourceBatchID(original.ID).SetOriginExceptionDecisionID(reworkDecision.ID).SetFlowType("REWORK").SetReworkReason("复检").SetQuantity(original.Quantity).SetCreatedBy(f.actorID).SetStatus(biz.ProductionWIPStatusWaitingQuality).SaveX(ctx)
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Closed != 0 {
		t.Fatalf("waiting reinspection incorrectly closed incident: %+v %v", board, err)
	}
	f.client.ProductionWIPBatch.UpdateOneID(branch.ID).SetStatus(biz.ProductionWIPStatusAccepted).SaveX(ctx)
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 1 || board.Closed != 1 {
		t.Fatalf("accepted rework did not close the original incident: %+v %v", board, err)
	}
	f.client.ProductionWIPBatch.UpdateOneID(branch.ID).SetStatus(biz.ProductionWIPStatusRejected).SaveX(ctx)
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Closed != 0 {
		t.Fatalf("rejected rework remained closed: %+v %v", board, err)
	}
	warehouse := createTestWarehouse(t, ctx, f.client, "EX-CORR-"+suffix)
	lot := f.client.InventoryLot.Create().SetLotNo("EX-CORR-" + suffix).SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SaveX(ctx)
	root := f.client.QualityInspection.Create().SetInspectionNo("IQC-ROOT-" + suffix).SetInventoryLotID(lot.ID).SetWarehouseID(warehouse.ID).SetStatus("REJECTED").SetResult("REJECT").SetInspectedAt(time.Now()).SaveX(ctx)
	f.client.WorkflowTask.Create().SetTaskCode("EX-CORR-" + suffix).SetTaskGroup("handoff_receipt_quality").SetTaskName("复核来料检验").SetSourceType("quality_inspection").SetSourceID(root.ID).SetOwnerRoleKey("quality").SetTaskStatusKey("done").SaveX(ctx)
	f.client.QualityInspection.Create().SetInspectionNo("IQC-CORRECT-" + suffix).SetCorrectionOfInspectionID(root.ID).SetInventoryLotID(lot.ID).SetWarehouseID(warehouse.ID).SetStatus("PASSED").SetResult("PASS").SetInspectedAt(time.Now()).SaveX(ctx)
	board, err = repo.ListWorkflowExceptions(ctx, query)
	if err != nil || board.Total != 2 || board.Closed != 1 || board.Items[0].State != "corrected" {
		t.Fatalf("inspection correction lost event identity or closure: %+v %v", board, err)
	}
}

func TestWorkflowExceptionsTrackingScope(t *testing.T) {
	f := openProductionOrderRepoTest(t, "exception_tracking")
	createProductionWIPRouteProcesses(t, context.Background(), f.client)
	testWorkflowExceptionTrackingScope(t, f)
}

func TestProductionOrderPostgresExceptionTrackingScope(t *testing.T) {
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, context.Background(), pg.client, pg.suffix)
	testWorkflowExceptionTrackingScope(t, productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID})
}

func testWorkflowExceptionTrackingScope(t *testing.T, f productionOrderTestFixture) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	inspections := []*ent.QualityInspection{}
	tasks := []*ent.WorkflowTask{}
	processes := []*ent.ProcessInstance{}
	for index := 0; index < 2; index++ {
		key := fmt.Sprintf("EX-SCOPE-%s-%d", suffix, index)
		flow := releaseProductionWIPRoute(t, ctx, f, key, 10, false)
		batch := flow.Batches[0]
		inspection := f.client.QualityInspection.Create().SetInspectionNo(key).SetProductionWipBatchID(batch.ID).SetGateCode(biz.ProductionWIPQualityGateCutPiece).SetSourceType("PRODUCTION_WIP").SetSourceID(batch.ID).SetInspectionType("PRODUCTION_STAGE").SetSubjectType("WIP").SetSubjectID(batch.ID).SetStatus("REJECTED").SetResult("REJECT").SetInspectedAt(time.Now()).SaveX(ctx)
		task := f.client.WorkflowTask.Create().SetTaskCode(key).SetTaskGroup("handoff_production_exception").SetTaskName("处理品质异常").SetSourceType("quality_inspection").SetSourceID(inspection.ID).SetSourceNo(key).SetOwnerRoleKey("quality").SetTaskStatusKey("ready").SaveX(ctx)
		process := f.client.ProcessInstance.Create().SetProcessKey(biz.ProcessKeyProductionExceptionApproval).SetProcessVersion("v1").SetConfigRevision("exception-scope").SetDefinitionHash("hash").SetBusinessRefType("quality_inspection").SetBusinessRefID(inspection.ID).SetBusinessRefNo(key).SetIdempotencyKey(key).SetCreatedBy(f.actorID).SaveX(ctx)
		node := f.client.ProcessNodeInstance.Create().SetProcessInstanceID(process.ID).SetNodeKey("approval").SetNodeType(biz.ProcessNodeTypeApproval).SetStatus(biz.ProcessNodeStatusActive).SetStartedAt(time.Now()).SaveX(ctx)
		f.client.WorkflowTask.Create().SetTaskCode(key + "-approval").SetTaskGroup("production_exception_approval").SetTaskName("审批品质异常").SetSourceType("quality_inspection").SetSourceID(inspection.ID).SetConfigRevision("exception-scope").SetProcessInstanceID(process.ID).SetProcessNodeInstanceID(node.ID).SetOwnerRoleKey("boss").SetTaskStatusKey("ready").SaveX(ctx)
		inspections = append(inspections, inspection)
		tasks = append(tasks, task)
		processes = append(processes, process)
	}
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true, RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{{ConfigRevision: "exception-scope", Status: "active", AllowAllOwnerRoles: true}}}
	query := biz.WorkflowExceptionQuery{Limit: 20, Visibility: scope, Keyword: "EX-SCOPE-" + suffix}
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	assertIncident := func(want int) {
		t.Helper()
		board, err := repo.ListWorkflowExceptions(ctx, query)
		if err != nil || board.Total != want || board.ViewTotal != want || len(board.Items) != want {
			t.Fatalf("scope=%+v board=%+v error=%v", query.TrackingRef, board, err)
		}
		if want == 1 && (board.Items[0].Key != fmt.Sprintf("quality:%d", inspections[0].ID) || len(board.Items[0].TaskIDs) != 2 || board.PendingTasks != 2 || board.AffectedOrders != 1) {
			t.Fatalf("scope must retain the full visible incident and exclude the other incident on the same order: %+v", board)
		}
		if want == 0 && (board.Open != 0 || board.PendingTasks != 0 || board.AffectedOrders != 0) {
			t.Fatalf("hidden scope leaked counts: %+v", board)
		}
	}
	assertIncident(2)
	query.TrackingRef = &biz.WorkflowTrackingRef{Kind: "task", ID: tasks[0].ID}
	query.Keyword = ""
	assertIncident(1)
	query.Keyword = inspections[1].InspectionNo
	assertIncident(0)
	query.Keyword = ""
	query.TrackingRef = &biz.WorkflowTrackingRef{Kind: "process", ID: processes[0].ID}
	assertIncident(1)
	for _, view := range []string{"tasks", "orders"} {
		query.View = view
		board, err := repo.ListWorkflowExceptions(ctx, query)
		if err != nil || (view == "tasks" && (len(board.Tasks) != 2 || board.ViewTotal != 2)) || (view == "orders" && (len(board.Orders) != 1 || board.ViewTotal != 1)) {
			t.Fatalf("scoped drilldown=%s %+v %v", view, board, err)
		}
	}
	query.View = ""
	query.Visibility = &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}
	assertIncident(0) // Visibility of another task in the incident cannot grant access to this process.
	query.Visibility = &biz.WorkflowTaskVisibilityScope{}
	query.TrackingRef = &biz.WorkflowTrackingRef{Kind: "task", ID: tasks[0].ID}
	assertIncident(0)
	query.Visibility = scope
	query.TrackingRef = &biz.WorkflowTrackingRef{Kind: "process", ID: processes[1].ID + 100000}
	assertIncident(0)
}
