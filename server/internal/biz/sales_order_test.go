package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type salesOrderRepoStub struct {
	orders         map[int]*SalesOrder
	items          map[int]*SalesOrderItem
	customerActive map[int]bool
	productActive  map[int]bool
	unitActive     map[int]bool
	createdOrder   *SalesOrderMutation
	createdItem    *SalesOrderItemMutation
	savedOrderID   int
	savedItems     []*SalesOrderItemSaveMutation
	nextStatus     string
}

type salesOrderAcceptanceProcessOwnerResolver struct{}

func (r *salesOrderAcceptanceProcessOwnerResolver) WorkflowCandidateOwnerRoleKeysAtRevision(ctx context.Context, customerKey, revision, ownerPoolKey string, requiredCapabilities ...string) (*WorkflowTaskCandidateExplanation, error) {
	candidateRoleKey := ""
	switch ownerPoolKey {
	case "order_approval":
		candidateRoleKey = BossRoleKey
	case "order_review":
		candidateRoleKey = PMCRoleKey
	}
	if candidateRoleKey == "" {
		return &WorkflowTaskCandidateExplanation{
			ConfigRevision:         revision,
			OwnerPoolKey:           ownerPoolKey,
			RequiredCapabilities:   requiredCapabilities,
			CandidateOwnerRoleKeys: nil,
			Source:                 "customer_config_revision",
		}, nil
	}
	return &WorkflowTaskCandidateExplanation{
		ConfigRevision:         revision,
		OwnerPoolKey:           ownerPoolKey,
		RequiredCapabilities:   requiredCapabilities,
		CandidateOwnerRoleKeys: []string{candidateRoleKey},
		Source:                 "customer_config_revision",
	}, nil
}

func (s *salesOrderRepoStub) CreateSalesOrder(_ context.Context, in *SalesOrderMutation) (*SalesOrder, error) {
	cp := *in
	s.createdOrder = &cp
	return &SalesOrder{ID: 1, OrderNo: in.OrderNo, CustomerID: in.CustomerID, LifecycleStatus: SalesOrderStatusDraft}, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrder(context.Context, int, *SalesOrderMutation) (*SalesOrder, error) {
	return nil, nil
}

func (s *salesOrderRepoStub) GetSalesOrder(_ context.Context, id int) (*SalesOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, ErrSalesOrderNotFound
	}
	return order, nil
}

func (s *salesOrderRepoStub) ListSalesOrders(context.Context, SalesOrderFilter) ([]*SalesOrder, int, error) {
	return nil, 0, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*SalesOrder, error) {
	s.nextStatus = lifecycleStatus
	return &SalesOrder{ID: id, LifecycleStatus: lifecycleStatus}, nil
}

func (s *salesOrderRepoStub) AddSalesOrderItem(_ context.Context, in *SalesOrderItemMutation) (*SalesOrderItem, error) {
	cp := *in
	s.createdItem = &cp
	return &SalesOrderItem{ID: 1, SalesOrderID: in.SalesOrderID, LineNo: in.LineNo, ProductID: in.ProductID, UnitID: in.UnitID, OrderedQuantity: in.OrderedQuantity, LineStatus: SalesOrderItemStatusOpen}, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderItem(context.Context, int, *SalesOrderItemMutation) (*SalesOrderItem, error) {
	return nil, nil
}

func (s *salesOrderRepoStub) GetSalesOrderItem(_ context.Context, id int) (*SalesOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, ErrSalesOrderItemNotFound
	}
	return item, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderItemStatus(_ context.Context, id int, lineStatus string) (*SalesOrderItem, error) {
	item := *s.items[id]
	item.LineStatus = lineStatus
	return &item, nil
}

func (s *salesOrderRepoStub) ListSalesOrderItems(context.Context, SalesOrderItemFilter) ([]*SalesOrderItem, int, error) {
	return nil, 0, nil
}

func (s *salesOrderRepoStub) SaveSalesOrderWithItems(_ context.Context, id int, order *SalesOrderMutation, items []*SalesOrderItemSaveMutation) (*SalesOrderWithItems, error) {
	s.savedOrderID = id
	cp := *order
	s.createdOrder = &cp
	s.savedItems = items
	return &SalesOrderWithItems{
		Order: &SalesOrder{ID: 1, OrderNo: order.OrderNo, CustomerID: order.CustomerID, LifecycleStatus: SalesOrderStatusDraft},
		Items: []*SalesOrderItem{{ID: 1, SalesOrderID: 1, LineNo: items[0].LineNo, ProductID: items[0].ProductID, UnitID: items[0].UnitID, OrderedQuantity: items[0].OrderedQuantity, LineStatus: SalesOrderItemStatusOpen}},
	}, nil
}

func (s *salesOrderRepoStub) CustomerIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.customerActive[id]
	if !ok {
		return false, ErrCustomerNotFound
	}
	return active, nil
}

func (s *salesOrderRepoStub) ProductIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.productActive[id]
	if !ok {
		return false, ErrProductNotFound
	}
	return active, nil
}

func (s *salesOrderRepoStub) ProductSKUIsActiveForProduct(context.Context, int, int) (bool, error) {
	return true, nil
}

func (s *salesOrderRepoStub) UnitIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.unitActive[id]
	if !ok {
		return false, ErrUnitNotFound
	}
	return active, nil
}

func TestSalesOrderUsecaseCreateGuardsCustomer(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{customerActive: map[int]bool{10: true, 11: false}}
	uc := NewSalesOrderUsecase(repo)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	customerOrderNo := "  PO-001 "
	paymentMethod := " 30天月结 "
	paymentTermDays := 30
	priceConditionNote := " 账期改短，单价已核对 "
	plannedDeliveryDate := orderDate.AddDate(0, 0, 1)

	order, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{
		OrderNo:             " SO-001 ",
		CustomerID:          10,
		CustomerOrderNo:     &customerOrderNo,
		ContactSnapshot:     map[string]any{"name": " 李四 ", "phone": " 0574-12345678 ", "email": " buyer@example.com "},
		PaymentMethod:       &paymentMethod,
		PaymentTermDays:     &paymentTermDays,
		PriceConditionNote:  &priceConditionNote,
		OrderDate:           orderDate,
		PlannedDeliveryDate: &plannedDeliveryDate,
	})
	if err != nil {
		t.Fatalf("create sales order failed: %v", err)
	}
	if order.LifecycleStatus != SalesOrderStatusDraft {
		t.Fatalf("expected draft sales order, got %#v", order)
	}
	if repo.createdOrder.OrderNo != "SO-001" || repo.createdOrder.CustomerOrderNo == nil || *repo.createdOrder.CustomerOrderNo != "PO-001" {
		t.Fatalf("expected normalized order mutation, got %#v", repo.createdOrder)
	}
	if repo.createdOrder.PaymentMethod == nil || *repo.createdOrder.PaymentMethod != "30天月结" || repo.createdOrder.PaymentTermDays == nil || *repo.createdOrder.PaymentTermDays != 30 {
		t.Fatalf("expected payment condition normalized, got %#v", repo.createdOrder)
	}
	if repo.createdOrder.ContactSnapshot["name"] != "李四" || repo.createdOrder.ContactSnapshot["email"] != "buyer@example.com" {
		t.Fatalf("expected contact snapshot normalized, got %#v", repo.createdOrder.ContactSnapshot)
	}
	negativeTermDays := -1
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-BAD-PAYMENT", CustomerID: 10, PaymentTermDays: &negativeTermDays, OrderDate: orderDate}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected negative payment term rejected, got %v", err)
	}
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-BAD-EMAIL", CustomerID: 10, ContactSnapshot: map[string]any{"email": "buyer@example"}, OrderDate: orderDate}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected invalid contact snapshot email rejected, got %v", err)
	}
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-BAD-PHONE", CustomerID: 10, ContactSnapshot: map[string]any{"phone": "12345"}, OrderDate: orderDate}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected invalid contact snapshot phone rejected, got %v", err)
	}
	beforeOrderDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-BAD-DATE", CustomerID: 10, OrderDate: orderDate, PlannedDeliveryDate: &beforeOrderDate}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected planned delivery before order date rejected, got %v", err)
	}

	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-002", CustomerID: 999, OrderDate: orderDate}); !errors.Is(err, ErrCustomerNotFound) {
		t.Fatalf("expected missing customer rejected, got %v", err)
	}
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-003", CustomerID: 11, OrderDate: orderDate}); !errors.Is(err, ErrCustomerInactive) {
		t.Fatalf("expected inactive customer rejected, got %v", err)
	}
}

func TestSalesOrderUsecaseLifecycleGuards(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1: {ID: 1, LifecycleStatus: SalesOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: SalesOrderStatusSubmitted},
			3: {ID: 3, LifecycleStatus: SalesOrderStatusActive},
			4: {ID: 4, LifecycleStatus: SalesOrderStatusClosed},
		},
	}
	uc := NewSalesOrderUsecase(repo)

	if _, err := uc.SubmitSalesOrder(ctx, 1); err != nil || repo.nextStatus != SalesOrderStatusSubmitted {
		t.Fatalf("expected draft -> submitted allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ActivateSalesOrder(ctx, 2); err != nil || repo.nextStatus != SalesOrderStatusActive {
		t.Fatalf("expected submitted -> active allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.CloseSalesOrder(ctx, 3); err != nil || repo.nextStatus != SalesOrderStatusClosed {
		t.Fatalf("expected active -> closed allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ActivateSalesOrder(ctx, 1); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected draft -> active rejected, got %v", err)
	}
	if _, err := uc.CancelSalesOrder(ctx, 1); err != nil || repo.nextStatus != SalesOrderStatusCanceled {
		t.Fatalf("expected draft -> canceled allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if IsValidSalesOrderStatus("shipped") || IsSalesOrderLifecycleTransitionAllowed(SalesOrderStatusActive, "shipped") {
		t.Fatalf("shipped must not be a sales order lifecycle status")
	}
	if _, err := uc.CancelSalesOrder(ctx, 4); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected settled order transition rejected, got %v", err)
	}
}

func TestSalesOrderProcessDomainCommandSubmitBindsUsecase(t *testing.T) {
	ctx := context.Background()
	salesOrderRepo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1001: {ID: 1001, LifecycleStatus: SalesOrderStatusDraft},
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "submit_sales_order",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandSalesOrderSubmit,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC, NewSalesOrderUsecase(salesOrderRepo)); err != nil {
		t.Fatalf("register sales order process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:        "process:10:node:20:sales-order-submit",
		Payload: map[string]any{
			"sales_order_id": float64(1001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute sales order submit domain command failed: %v", err)
	}
	if salesOrderRepo.nextStatus != SalesOrderStatusSubmitted {
		t.Fatalf("expected sales order submitted, got %s", salesOrderRepo.nextStatus)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != SalesOrderProcessCommandOutcomeSubmitted {
		t.Fatalf("expected submitted process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != SalesOrderProcessCommandOutcomeSubmitted {
		t.Fatalf("expected process node completed with sales order outcome, got %#v", processRepo.completedNode)
	}
}

func TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview(t *testing.T) {
	ctx := context.Background()
	const (
		processID    = 10
		submitNodeID = 20
		bossNodeID   = 21
		pmcNodeID    = 22
	)
	salesOrderRepo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1001: {ID: 1001, LifecycleStatus: SalesOrderStatusDraft},
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              processID,
			ProcessKey:      "sales_order_acceptance",
			ProcessVersion:  "v1",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                submitNodeID,
				ProcessInstanceID: processID,
				NodeKey:           "submit_sales_order",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandSalesOrderSubmit,
				},
			},
			{
				ID:                    bossNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "order_approval",
				NodeType:              ProcessNodeTypeApproval,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("order_approval"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskApprove),
				Version:               1,
			},
			{
				ID:                    pmcNodeID,
				ProcessInstanceID:     processID,
				NodeKey:               "order_review",
				NodeType:              ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                ProcessNodeStatusWaiting,
				OwnerPoolKey:          ptrString("order_review"),
				RequiredCapabilityKey: ptrString(PermissionWorkflowTaskComplete),
				Version:               1,
			},
		},
	}
	workflowRepo := &recordingWorkflowRepo{}
	processRuntimeUC := NewProcessRuntimeUsecase(
		processRepo,
		workflowRepo,
		&salesOrderAcceptanceProcessOwnerResolver{},
	)
	if err := RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC, NewSalesOrderUsecase(salesOrderRepo)); err != nil {
		t.Fatalf("register sales order process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     processID,
		ProcessNodeInstanceID: submitNodeID,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:        "process:10:node:20:sales-order-submit",
		Payload: map[string]any{
			"sales_order_id": float64(1001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute sales order submit domain command failed: %v", err)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != SalesOrderProcessCommandOutcomeSubmitted {
		t.Fatalf("expected submitted domain node, got %#v", node)
	}
	if salesOrderRepo.nextStatus != SalesOrderStatusSubmitted {
		t.Fatalf("expected sales order submitted, got %s", salesOrderRepo.nextStatus)
	}
	if len(workflowRepo.createTaskInputs) != 1 {
		t.Fatalf("expected boss approval task created, got %#v", workflowRepo.createTaskInputs)
	}
	bossTask := workflowRepo.createTaskInputs[0]
	if bossTask.TaskGroup != "order_approval" || bossTask.OwnerRoleKey != BossRoleKey {
		t.Fatalf("expected boss approval linked task, got %#v", bossTask)
	}
	if bossTask.ProcessNodeInstanceID == nil || *bossTask.ProcessNodeInstanceID != bossNodeID {
		t.Fatalf("expected boss task linked to approval node, got %#v", bossTask.ProcessNodeInstanceID)
	}
	if bossTask.OwnerPoolKey == nil || *bossTask.OwnerPoolKey != "order_approval" {
		t.Fatalf("expected order approval owner pool, got %#v", bossTask.OwnerPoolKey)
	}
	if bossTask.RequiredCapabilityKey == nil || *bossTask.RequiredCapabilityKey != PermissionWorkflowTaskApprove {
		t.Fatalf("expected approve capability, got %#v", bossTask.RequiredCapabilityKey)
	}

	workflowRepo.currentTask = &WorkflowTask{
		ID:                    501,
		TaskStatusKey:         "done",
		ProcessInstanceID:     processTestIntPtr(processID),
		ProcessNodeInstanceID: processTestIntPtr(bossNodeID),
		Payload: map[string]any{
			"outcome": "approved",
		},
	}
	completedBossNode, err := processRuntimeUC.CompleteLinkedWorkflowTask(ctx, &ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: 501,
	}, 8)
	if err != nil {
		t.Fatalf("complete boss approval linked task failed: %v", err)
	}
	if completedBossNode.ID != bossNodeID || completedBossNode.Outcome == nil || *completedBossNode.Outcome != "approved" {
		t.Fatalf("expected boss node approved, got %#v", completedBossNode)
	}
	if len(workflowRepo.createTaskInputs) != 2 {
		t.Fatalf("expected PMC review task created after boss approval, got %#v", workflowRepo.createTaskInputs)
	}
	pmcTask := workflowRepo.createTaskInputs[1]
	if pmcTask.TaskGroup != "order_review" || pmcTask.OwnerRoleKey != PMCRoleKey {
		t.Fatalf("expected PMC review linked task, got %#v", pmcTask)
	}
	if pmcTask.ProcessNodeInstanceID == nil || *pmcTask.ProcessNodeInstanceID != pmcNodeID {
		t.Fatalf("expected PMC task linked to review node, got %#v", pmcTask.ProcessNodeInstanceID)
	}
	if pmcTask.OwnerPoolKey == nil || *pmcTask.OwnerPoolKey != "order_review" {
		t.Fatalf("expected order review owner pool, got %#v", pmcTask.OwnerPoolKey)
	}
	if pmcTask.RequiredCapabilityKey == nil || *pmcTask.RequiredCapabilityKey != PermissionWorkflowTaskComplete {
		t.Fatalf("expected complete capability, got %#v", pmcTask.RequiredCapabilityKey)
	}
	if processRepo.completedProcess != nil {
		t.Fatalf("sales order acceptance must not complete before PMC review, got %#v", processRepo.completedProcess)
	}
}

func TestSalesOrderProcessDomainCommandSubmitRejectsMismatchedBusinessRef(t *testing.T) {
	ctx := context.Background()
	salesOrderRepo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1001: {ID: 1001, LifecycleStatus: SalesOrderStatusDraft},
		},
	}
	handler := &salesOrderSubmitProcessCommandHandler{uc: NewSalesOrderUsecase(salesOrderRepo)}
	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 1001},
		CommandKey:      ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:  "process:10:node:20:sales-order-submit",
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}
	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 1001},
		CommandKey:      ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:  "process:10:node:20:sales-order-submit",
		Payload: map[string]any{
			"sales_order_id": float64(1002),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload sales order mismatch rejected, got %v", err)
	}
	if salesOrderRepo.nextStatus != "" {
		t.Fatalf("mismatched command must not submit sales order, got %s", salesOrderRepo.nextStatus)
	}
}

func TestSalesOrderUsecaseItemGuards(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1: {ID: 1, LifecycleStatus: SalesOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: SalesOrderStatusClosed},
			3: {ID: 3, LifecycleStatus: SalesOrderStatusSubmitted},
		},
		items: map[int]*SalesOrderItem{
			10: {ID: 10, SalesOrderID: 1, LineStatus: SalesOrderItemStatusOpen},
		},
		customerActive: map[int]bool{1: true},
		productActive:  map[int]bool{100: true, 101: false},
		unitActive:     map[int]bool{200: true, 201: false},
	}
	uc := NewSalesOrderUsecase(repo)

	qty := decimal.NewFromInt(12)
	price := decimal.NewFromInt(3)
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{
		SalesOrderID:    1,
		LineNo:          1,
		ProductID:       100,
		UnitID:          200,
		OrderedQuantity: qty,
		UnitPrice:       &price,
	}); err != nil {
		t.Fatalf("add sales order item failed: %v", err)
	}
	if !repo.createdItem.OrderedQuantity.Equal(qty) {
		t.Fatalf("expected ordered quantity retained, got %s", repo.createdItem.OrderedQuantity)
	}

	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 2, LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected closed order item add rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 999, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrProductNotFound) {
		t.Fatalf("expected missing product rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 101, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 999, OrderedQuantity: qty}); !errors.Is(err, ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 201, OrderedQuantity: qty}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: decimal.Zero}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero ordered quantity rejected, got %v", err)
	}

	removed, err := uc.RemoveSalesOrderItem(ctx, 10)
	if err != nil {
		t.Fatalf("remove sales order item failed: %v", err)
	}
	if removed.LineStatus != SalesOrderItemStatusCanceled {
		t.Fatalf("expected removed item canceled, got %#v", removed)
	}
}

func TestSalesOrderUsecaseSaveWithItemsGuardsAndNormalizes(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1: {ID: 1, LifecycleStatus: SalesOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: SalesOrderStatusClosed},
			3: {ID: 3, LifecycleStatus: SalesOrderStatusSubmitted},
		},
		items: map[int]*SalesOrderItem{
			10: {ID: 10, SalesOrderID: 1, LineStatus: SalesOrderItemStatusOpen},
			20: {ID: 20, SalesOrderID: 2, LineStatus: SalesOrderItemStatusOpen},
		},
		customerActive: map[int]bool{1000: true},
		productActive:  map[int]bool{100: true},
		unitActive:     map[int]bool{200: true},
	}
	uc := NewSalesOrderUsecase(repo)
	orderDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(6)

	result, err := uc.SaveSalesOrderWithItems(ctx, 1, &SalesOrderMutation{
		OrderNo:         " SO-TX-001 ",
		CustomerID:      1000,
		OrderDate:       orderDate,
		ExpectedVersion: 1,
	}, []*SalesOrderItemSaveMutation{
		{ID: 10, SalesOrderItemMutation: SalesOrderItemMutation{LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty}},
	})
	if err != nil {
		t.Fatalf("save sales order with items failed: %v", err)
	}
	if result.Order.OrderNo != "SO-TX-001" || repo.createdOrder.OrderNo != "SO-TX-001" {
		t.Fatalf("expected normalized order, got result=%#v mutation=%#v", result.Order, repo.createdOrder)
	}
	if len(repo.savedItems) != 1 || repo.savedItems[0].SalesOrderID != 1 {
		t.Fatalf("expected item bound to order 1, got %#v", repo.savedItems)
	}

	if _, err := uc.SaveSalesOrderWithItems(ctx, 1, &SalesOrderMutation{OrderNo: "SO-NO-VERSION", CustomerID: 1000, OrderDate: orderDate}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing version rejected, got %v", err)
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 2, &SalesOrderMutation{OrderNo: "SO-CLOSED", CustomerID: 1000, OrderDate: orderDate, ExpectedVersion: 1}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected closed order save rejected, got %v", err)
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 3, &SalesOrderMutation{OrderNo: "SO-SUBMITTED", CustomerID: 1000, OrderDate: orderDate, ExpectedVersion: 1}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected submitted sales order to be frozen, got %v", err)
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 1, &SalesOrderMutation{OrderNo: "SO-WRONG-ITEM", CustomerID: 1000, OrderDate: orderDate, ExpectedVersion: 1}, []*SalesOrderItemSaveMutation{
		{ID: 20, SalesOrderItemMutation: SalesOrderItemMutation{LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected foreign order item rejected, got %v", err)
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 0, &SalesOrderMutation{OrderNo: "SO-NEW", CustomerID: 1000, OrderDate: orderDate}, []*SalesOrderItemSaveMutation{
		{ID: 10, SalesOrderItemMutation: SalesOrderItemMutation{LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected existing item on new order rejected, got %v", err)
	}
	beforeOrderDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.SaveSalesOrderWithItems(ctx, 1, &SalesOrderMutation{OrderNo: "SO-BAD-LINE-DATE", CustomerID: 1000, OrderDate: orderDate, ExpectedVersion: 1}, []*SalesOrderItemSaveMutation{
		{ID: 10, SalesOrderItemMutation: SalesOrderItemMutation{LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty, PlannedDeliveryDate: &beforeOrderDate}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected line planned delivery before order date rejected, got %v", err)
	}
}
