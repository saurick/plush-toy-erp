package biz

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestFinanceProcessDomainCommandReceivableLeadBindsUsecase(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &financeProcessOperationalFactRepoStub{
		paymentTermDays: processTestIntPtr(60),
		shipment: &Shipment{
			ID:         9001,
			CustomerID: processTestIntPtr(501),
			Status:     ShipmentStatusShipped,
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			BusinessRefType: "shipment",
			BusinessRefID:   9001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "receivable_lead",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandFinanceReceivableLead,
				},
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "end",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterFinanceProcessDomainCommandHandlers(processRuntimeUC, NewOperationalFactUsecase(operationalFactRepo)); err != nil {
		t.Fatalf("register finance process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:        "process:10:node:20:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9001),
			"receivable_source_no": "AR-LEAD-9001",
			"currency":             "CNY",
			"expected_amount":      "12888.00",
			"lead_note":            "流程显式应收线索",
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute receivable lead domain command failed: %v", err)
	}
	if operationalFactRepo.createdFinanceFact == nil {
		t.Fatalf("expected finance fact draft to be created")
	}
	if operationalFactRepo.createdFinanceFact.FactType != FinanceFactReceivable ||
		operationalFactRepo.createdFinanceFact.SourceType == nil ||
		*operationalFactRepo.createdFinanceFact.SourceType != ShipmentSourceType ||
		operationalFactRepo.createdFinanceFact.SourceID == nil ||
		*operationalFactRepo.createdFinanceFact.SourceID != 9001 ||
		operationalFactRepo.createdFinanceFact.CounterpartyID == nil ||
		*operationalFactRepo.createdFinanceFact.CounterpartyID != 501 ||
		!operationalFactRepo.createdFinanceFact.Amount.Equal(decimal.RequireFromString("12888.00")) ||
		operationalFactRepo.createdFinanceFact.IdempotencyKey != "process:10:node:20:receivable-lead" ||
		operationalFactRepo.createdFinanceFact.CollectionType == nil ||
		*operationalFactRepo.createdFinanceFact.CollectionType != FinanceCollectionAccountsReceivable ||
		operationalFactRepo.createdFinanceFact.PaymentTerm != nil ||
		operationalFactRepo.createdFinanceFact.PaymentTermDays == nil ||
		*operationalFactRepo.createdFinanceFact.PaymentTermDays != 60 ||
		operationalFactRepo.createdFinanceFact.InvoiceCategory != nil {
		t.Fatalf("unexpected finance fact create input %#v", operationalFactRepo.createdFinanceFact)
	}
	if operationalFactRepo.postedFinanceFactID != 0 || operationalFactRepo.settledFinanceFactID != 0 || operationalFactRepo.cancelledFinanceFactID != 0 {
		t.Fatalf("receivable lead must only create a draft, got post=%d settle=%d cancel=%d", operationalFactRepo.postedFinanceFactID, operationalFactRepo.settledFinanceFactID, operationalFactRepo.cancelledFinanceFactID)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != FinanceProcessCommandOutcomeReceivableLeadCreated {
		t.Fatalf("expected receivable lead outcome, got %#v", node)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 21 {
		t.Fatalf("expected end node to activate after receivable lead, got %#v", processRepo.activatedNode)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.ID != 21 || processRepo.completedNode.Outcome != "completed" {
		t.Fatalf("expected end node completed after receivable lead, got %#v", processRepo.completedNode)
	}
	if processRepo.process == nil || processRepo.process.Status != ProcessStatusCompleted {
		t.Fatalf("expected process instance completed after end node, got %#v", processRepo.process)
	}
	if processRepo.linkedRef == nil || processRepo.linkedRef.RefType != "finance_fact" || processRepo.linkedRef.RefID != 3001 {
		t.Fatalf("expected finance fact linked ref recorded, got %#v", processRepo.linkedRef)
	}
}

func TestFinanceProcessDomainCommandReceivableLeadRejectsMismatchedBusinessRef(t *testing.T) {
	ctx := context.Background()
	handler := &financeReceivableLeadProcessCommandHandler{uc: NewOperationalFactUsecase(&financeProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, CustomerID: processTestIntPtr(501), Status: ShipmentStatusShipped},
	})}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:  "process:10:node:20:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9001),
			"receivable_source_no": "AR-LEAD-9001",
			"expected_amount":      "12888.00",
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:  "process:10:node:20:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9002),
			"receivable_source_no": "AR-LEAD-9001",
			"expected_amount":      "12888.00",
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload shipment mismatch rejected, got %v", err)
	}
}

func TestFinanceProcessDomainCommandReceivableLeadRequiresShippedShipment(t *testing.T) {
	ctx := context.Background()
	repo := &financeProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, CustomerID: processTestIntPtr(501), Status: ShipmentStatusDraft},
	}
	handler := &financeReceivableLeadProcessCommandHandler{uc: NewOperationalFactUsecase(repo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:  "process:10:node:20:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9001),
			"receivable_source_no": "AR-LEAD-9001",
			"expected_amount":      "12888.00",
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected draft shipment rejected, got %v", err)
	}
	if repo.createdFinanceFact != nil {
		t.Fatalf("draft shipment must not create finance fact, got %#v", repo.createdFinanceFact)
	}
}

func TestFinanceProcessDomainCommandReceivableLeadRequiresSourceAndAmount(t *testing.T) {
	ctx := context.Background()
	handler := &financeReceivableLeadProcessCommandHandler{uc: NewOperationalFactUsecase(&financeProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, CustomerID: processTestIntPtr(501), Status: ShipmentStatusShipped},
	})}

	for _, payload := range []map[string]any{
		{"shipment_id": float64(9001), "expected_amount": "12888.00"},
		{"shipment_id": float64(9001), "receivable_source_no": "AR-LEAD-9001"},
		{"shipment_id": float64(9001), "receivable_source_no": "AR-LEAD-9001", "expected_amount": "-1"},
		{"shipment_id": float64(9001), "receivable_source_no": "AR-LEAD-9001", "expected_amount": "abc"},
		{"shipment_id": float64(9001), "receivable_source_no": "AR-LEAD-9001", "expected_amount": "12888.00", "due_date": "bad-date"},
	} {
		if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
			ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
			CommandKey:      ProcessDomainCommandFinanceReceivableLead,
			IdempotencyKey:  "process:10:node:20:receivable-lead",
			Payload:         payload,
		}, 7); !errors.Is(err, ErrBadParam) {
			t.Fatalf("expected bad payload rejected, payload=%#v err=%v", payload, err)
		}
	}
}

func TestFinanceProcessDomainCommandReceivableLeadRequiresShipmentCustomerTruth(t *testing.T) {
	handler := &financeReceivableLeadProcessCommandHandler{uc: NewOperationalFactUsecase(&financeProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, Status: ShipmentStatusShipped},
	})}
	base := &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:  "process:10:node:20:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9001),
			"receivable_source_no": "AR-LEAD-9001",
			"expected_amount":      "12888.00",
		},
	}
	if _, err := handler.ExecuteProcessDomainCommand(context.Background(), base, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("shipment without customer truth must not create receivable, got %v", err)
	}
	base.Payload["customer_id"] = float64(501)
	if _, err := handler.ExecuteProcessDomainCommand(context.Background(), base, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("caller-controlled customer must not be accepted, got %v", err)
	}
}

func TestOperationalFactUsecaseCancelFinanceRequiresActorAndTrimmedReason(t *testing.T) {
	repo := &financeProcessOperationalFactRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	for _, tc := range []struct {
		name    string
		id      int
		actorID int
		reason  string
	}{
		{name: "missing id", actorID: 7, reason: "客户撤销"},
		{name: "missing actor", id: 9, reason: "客户撤销"},
		{name: "empty reason", id: 9, actorID: 7},
		{name: "blank reason", id: 9, actorID: 7, reason: "  \t "},
		{name: "too long reason", id: 9, actorID: 7, reason: strings.Repeat("理", 256)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := uc.CancelPostedFinanceFact(context.Background(), tc.id, tc.actorID, tc.reason); !errors.Is(err, ErrBadParam) {
				t.Fatalf("error=%v, want ErrBadParam", err)
			}
		})
	}
	if _, err := uc.CancelPostedFinanceFact(context.Background(), 9, 7, "  客户撤销账款  "); !errors.Is(err, ErrBadParam) {
		t.Fatalf("stub error=%v, want forwarded ErrBadParam", err)
	}
	if repo.cancelledFinanceFactID != 9 || repo.cancelledFinanceFactActorID != 7 || repo.cancelledFinanceFactReason != "客户撤销账款" {
		t.Fatalf("unexpected normalized cancellation input: id=%d actor=%d reason=%q", repo.cancelledFinanceFactID, repo.cancelledFinanceFactActorID, repo.cancelledFinanceFactReason)
	}
}

type financeProcessOperationalFactRepoStub struct {
	OperationalFactRepo
	shipment                    *Shipment
	paymentTermDays             *int
	createdFinanceFact          *FinanceFactCreate
	postedFinanceFactID         int
	settledFinanceFactID        int
	cancelledFinanceFactID      int
	cancelledFinanceFactActorID int
	cancelledFinanceFactReason  string
}

func (r *financeProcessOperationalFactRepoStub) GetShipmentPaymentTermDays(_ context.Context, shipmentID int) (*int, error) {
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	if r.paymentTermDays == nil {
		days := 30
		return &days, nil
	}
	days := *r.paymentTermDays
	return &days, nil
}

func (r *financeProcessOperationalFactRepoStub) GetShipment(_ context.Context, shipmentID int) (*Shipment, error) {
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *financeProcessOperationalFactRepoStub) CreateFinanceFactDraft(_ context.Context, in *FinanceFactCreate) (*FinanceFact, error) {
	copied := *in
	r.createdFinanceFact = &copied
	return &FinanceFact{
		ID:               3001,
		FactNo:           copied.FactNo,
		FactType:         copied.FactType,
		Status:           OperationalFactStatusDraft,
		CounterpartyType: copied.CounterpartyType,
		CounterpartyID:   copied.CounterpartyID,
		Amount:           copied.Amount,
		FeeAmount:        copied.FeeAmount,
		Currency:         copied.Currency,
		CollectionType:   copied.CollectionType,
		PaymentTerm:      copied.PaymentTerm,
		PaymentTermDays:  copied.PaymentTermDays,
		InvoiceCategory:  copied.InvoiceCategory,
		SourceType:       copied.SourceType,
		SourceID:         copied.SourceID,
		SourceLineID:     copied.SourceLineID,
		IdempotencyKey:   copied.IdempotencyKey,
		OccurredAt:       copied.OccurredAt,
		Note:             copied.Note,
	}, nil
}

func (r *financeProcessOperationalFactRepoStub) PostFinanceFact(_ context.Context, id int) (*FinanceFact, error) {
	r.postedFinanceFactID = id
	return nil, ErrBadParam
}

func (r *financeProcessOperationalFactRepoStub) SettleFinanceFact(_ context.Context, id int) (*FinanceFact, error) {
	r.settledFinanceFactID = id
	return nil, ErrBadParam
}

func (r *financeProcessOperationalFactRepoStub) CancelPostedFinanceFact(_ context.Context, id int, actorID int, reason string) (*FinanceFact, error) {
	r.cancelledFinanceFactID = id
	r.cancelledFinanceFactActorID = actorID
	r.cancelledFinanceFactReason = reason
	return nil, ErrBadParam
}
