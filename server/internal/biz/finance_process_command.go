package biz

import (
	"context"
	"strings"

	"github.com/shopspring/decimal"
)

const (
	FinanceProcessCommandOutcomeReceivableLeadCreated = "finance.receivable_lead.created"
	financeReceivableLeadPayloadCustomerID            = "customer_id"
	financeReceivableLeadPayloadSourceNo              = "receivable_source_no"
	financeReceivableLeadPayloadCurrency              = "currency"
	financeReceivableLeadPayloadExpectedAmount        = "expected_amount"
	financeReceivableLeadPayloadDueDate               = "due_date"
	financeReceivableLeadPayloadNote                  = "lead_note"
)

type financeReceivableLeadProcessCommandHandler struct {
	uc *OperationalFactUsecase
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

func (h *financeReceivableLeadProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandFinanceReceivableLead {
		return nil, ErrBadParam
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return nil, ErrBadParam
	}
	factNo := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadSourceNo)
	amountText := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadExpectedAmount)
	amount, err := decimal.NewFromString(amountText)
	if err != nil {
		return nil, ErrBadParam
	}
	customerID, err := processCommandOptionalPositiveIntPtrFromPayload(in.Payload, financeReceivableLeadPayloadCustomerID)
	if err != nil {
		return nil, err
	}
	if _, err := processCommandOptionalTimeFromPayload(in.Payload, financeReceivableLeadPayloadDueDate); err != nil {
		return nil, err
	}
	currency := processCommandStringFromPayload(in.Payload, financeReceivableLeadPayloadCurrency)
	sourceType := ShipmentSourceType
	sourceID := shipmentID
	collectionType := FinanceCollectionAccountsReceivable
	invoiceCategory := FinanceInvoiceCategoryNone
	fact, err := h.uc.CreateFinanceFactDraft(ctx, &FinanceFactCreate{
		FactNo:           factNo,
		FactType:         FinanceFactReceivable,
		CounterpartyType: FinanceCounterpartyCustomer,
		CounterpartyID:   customerID,
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
	}, nil
}
