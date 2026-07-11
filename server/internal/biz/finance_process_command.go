package biz

import (
	"context"
	"strings"

	"github.com/shopspring/decimal"
)

const (
	FinanceProcessCommandOutcomeReceivableLeadCreated = "finance.receivable_lead.created"
	financeReceivableLeadPayloadSourceNo              = "receivable_source_no"
	financeReceivableLeadPayloadCurrency              = "currency"
	financeReceivableLeadPayloadExpectedAmount        = "expected_amount"
	financeReceivableLeadPayloadNote                  = "lead_note"
)

type financeReceivableLeadProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

type FinanceReceivableLeadProcessCommandRepo interface {
	CreateFinanceFactDraftForProcessCommand(ctx context.Context, in *FinanceFactCreate, command *ProcessDomainCommandInput, actorID int) (*FinanceFact, error)
}

type financeFactProcessPreflight interface {
	ValidateFinanceFactCreateReplay(ctx context.Context, in *FinanceFactCreate) error
}

func RegisterFinanceProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, operationalFactUC *OperationalFactUsecase) error {
	if processRuntimeUC == nil || operationalFactUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandFinanceReceivableLead,
		&financeReceivableLeadProcessCommandHandler{uc: operationalFactUC},
	)
}

func (h *financeReceivableLeadProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandFinanceReceivableLead {
		return ErrBadParam
	}
	fact, err := financeReceivableLeadCreateFromProcessCommand(ctx, h.uc, in)
	if err != nil {
		return err
	}
	if preflight, ok := h.uc.repo.(financeFactProcessPreflight); ok {
		return preflight.ValidateFinanceFactCreateReplay(ctx, fact)
	}
	return nil
}

func (h *financeReceivableLeadProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	factCreate, err := financeReceivableLeadCreateFromProcessCommand(ctx, h.uc, in)
	if err != nil {
		return nil, err
	}
	var fact *FinanceFact
	if repo, ok := h.uc.repo.(FinanceReceivableLeadProcessCommandRepo); ok {
		fact, err = repo.CreateFinanceFactDraftForProcessCommand(ctx, factCreate, in, actorID)
	} else {
		fact, err = h.uc.CreateFinanceFactDraft(ctx, factCreate)
	}
	if err != nil {
		return nil, err
	}
	return FinanceReceivableLeadProcessCommandResult(fact)
}

func FinanceReceivableLeadProcessCommandResult(fact *FinanceFact) (*ProcessDomainCommandResult, error) {
	if fact == nil || fact.ID <= 0 {
		return nil, ErrBadParam
	}
	refNo := strings.TrimSpace(fact.FactNo)
	var refNoPtr *string
	if refNo != "" {
		refNoPtr = &refNo
	}
	return &ProcessDomainCommandResult{
		Outcome: FinanceProcessCommandOutcomeReceivableLeadCreated,
		LinkedBusinessRefs: []ProcessBusinessRef{
			{RefType: "finance_fact", RefID: fact.ID, RefNo: refNoPtr},
		},
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: "finance_fact", RefID: fact.ID, RefNo: refNoPtr},
	}, nil
}

func financeReceivableLeadCreateFromProcessCommand(ctx context.Context, uc *OperationalFactUsecase, in *ProcessDomainCommandInput) (*FinanceFactCreate, error) {
	if uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload,
		shipmentProcessCommandPayloadShipmentID,
		financeReceivableLeadPayloadSourceNo,
		financeReceivableLeadPayloadCurrency,
		financeReceivableLeadPayloadExpectedAmount,
		financeReceivableLeadPayloadNote,
	); err != nil {
		return nil, err
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return nil, ErrBadParam
	}
	shipment, err := uc.GetShipment(ctx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil || shipment.Status != ShipmentStatusShipped || shipment.CustomerID == nil || *shipment.CustomerID <= 0 {
		return nil, ErrBadParam
	}
	factNo := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadSourceNo)
	amountText := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadExpectedAmount)
	amount, err := decimal.NewFromString(amountText)
	if err != nil {
		return nil, ErrBadParam
	}
	currency := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadCurrency)
	sourceType := ShipmentSourceType
	sourceID := shipmentID
	collectionType := FinanceCollectionAccountsReceivable
	invoiceCategory := FinanceInvoiceCategoryNone
	normalized, err := normalizeFinanceFactCreate(&FinanceFactCreate{
		FactNo:           factNo,
		FactType:         FinanceFactReceivable,
		CounterpartyType: FinanceCounterpartyCustomer,
		CounterpartyID:   shipment.CustomerID,
		Amount:           amount,
		Currency:         currency,
		CollectionType:   &collectionType,
		InvoiceCategory:  &invoiceCategory,
		SourceType:       &sourceType,
		SourceID:         &sourceID,
		IdempotencyKey:   in.IdempotencyKey,
		Note:             processCommandOptionalStringPtrFromPayload(in.Payload, financeReceivableLeadPayloadNote),
	})
	if err != nil {
		return nil, err
	}
	if err := uc.validateFinanceFactSource(ctx, normalized); err != nil {
		return nil, err
	}
	if err := uc.validateFinanceCounterpartyActiveReferences(ctx, normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}
