package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

func TestFinanceBusinessSourceParamsRejectDerivedFields(t *testing.T) {
	tests := []struct {
		name  string
		base  map[string]any
		parse func(map[string]any) bool
	}{
		{
			name: "purchase payable",
			base: map[string]any{"customer_key": biz.DefaultCustomerKey, "fact_no": "AP-PR", "purchase_receipt_id": float64(10), "idempotency_key": "AP-PR"},
			parse: func(params map[string]any) bool {
				_, ok := financeFactFromPurchaseReceiptCreateFromParams(params)
				return ok
			},
		},
		{
			name: "outsourcing payable",
			base: map[string]any{"customer_key": biz.DefaultCustomerKey, "fact_no": "AP-OUT", "outsourcing_fact_id": float64(11), "idempotency_key": "AP-OUT"},
			parse: func(params map[string]any) bool {
				_, ok := financeFactFromOutsourcingReturnCreateFromParams(params)
				return ok
			},
		},
		{
			name: "single reconciliation",
			base: map[string]any{"customer_key": biz.DefaultCustomerKey, "fact_no": "REC-ONE", "finance_fact_id": float64(12), "idempotency_key": "REC-ONE"},
			parse: func(params map[string]any) bool {
				_, ok := financeReconciliationFromFactCreateFromParams(params)
				return ok
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !tt.parse(tt.base) {
				t.Fatalf("valid source command rejected: %#v", tt.base)
			}
			for _, derived := range []string{
				"fact_type", "counterparty_type", "counterparty_id", "amount", "fee_amount", "currency",
				"source_type", "source_id", "source_line_id", "supplier_id",
			} {
				params := make(map[string]any, len(tt.base)+1)
				for key, value := range tt.base {
					params[key] = value
				}
				params[derived] = "forged"
				if tt.parse(params) {
					t.Fatalf("derived field %s reached source command", derived)
				}
			}
		})
	}
}

func TestFinanceBusinessSourceRPCUsesExactPermissions(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	config := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.14.finance-business-sources",
		"outsourcing_orders",
		"enabled",
	)

	payableRepo := &financeModuleGateOperationalFactRepo{}
	payable := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin(
		[]string{biz.FinanceRoleKey},
		biz.PermissionFinancePayableConfirm,
	), payableRepo)
	activateOperationalFactTestCustomerConfig(t, payable, config)
	for _, tc := range []struct {
		method string
		params map[string]any
	}{
		{method: "create_payable_from_purchase_receipt", params: map[string]any{"customer_key": biz.DefaultCustomerKey, "fact_no": "AP-PR", "purchase_receipt_id": float64(10), "idempotency_key": "AP-PR"}},
		{method: "create_payable_from_outsourcing_return", params: map[string]any{"customer_key": biz.DefaultCustomerKey, "fact_no": "AP-OUT", "outsourcing_fact_id": float64(11), "idempotency_key": "AP-OUT"}},
	} {
		_, res, err := payable.handleOperationalFact(ctx, tc.method, tc.method, mustJSONRPCStruct(t, tc.params))
		if err != nil || res == nil || res.Code != errcode.OK.Code {
			t.Fatalf("%s result=%#v err=%v", tc.method, res, err)
		}
	}
	if payableRepo.createFinanceFactCalls != 2 {
		t.Fatalf("payable source calls=%d want=2", payableRepo.createFinanceFactCalls)
	}

	_, denied, err := payable.handleOperationalFact(ctx, "create_reconciliation_from_finance_fact", "denied-reconciliation", mustJSONRPCStruct(t, map[string]any{
		"customer_key": biz.DefaultCustomerKey, "fact_no": "REC-DENIED", "finance_fact_id": float64(300), "idempotency_key": "REC-DENIED",
	}))
	if err != nil || denied == nil || denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("payable permission created reconciliation: result=%#v err=%v", denied, err)
	}

	reconciliationRepo := &financeModuleGateOperationalFactRepo{}
	reconciliation := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin(
		[]string{biz.FinanceRoleKey},
		biz.PermissionFinanceReconciliationConfirm,
	), reconciliationRepo)
	activateOperationalFactTestCustomerConfig(t, reconciliation, customerConfigPublishParamsForRevision(t, "2026.07.14.finance-single-reconciliation"))
	_, res, err := reconciliation.handleOperationalFact(ctx, "create_reconciliation_from_finance_fact", "reconciliation", mustJSONRPCStruct(t, map[string]any{
		"customer_key": biz.DefaultCustomerKey, "fact_no": "REC-ONE", "finance_fact_id": float64(300), "idempotency_key": "REC-ONE",
	}))
	if err != nil || res == nil || res.Code != errcode.OK.Code || reconciliationRepo.createFinanceFactCalls != 1 {
		t.Fatalf("single reconciliation result=%#v calls=%d err=%v", res, reconciliationRepo.createFinanceFactCalls, err)
	}
}

func (r *financeModuleGateOperationalFactRepo) CreatePayableFromPurchaseReceipt(_ context.Context, in *biz.FinanceFactFromPurchaseReceiptCreate) (*biz.FinanceFact, error) {
	supplierID := 702
	sourceType := biz.PurchaseReceiptSourceType
	sourceID := in.PurchaseReceiptID
	return r.CreateFinanceFactDraft(context.Background(), &biz.FinanceFactCreate{
		FactNo: in.FactNo, FactType: biz.FinanceFactPayable, CounterpartyType: biz.FinanceCounterpartySupplier,
		CounterpartyID: &supplierID, Amount: decimal.NewFromInt(50), Currency: biz.FinanceCurrencyCNY,
		SourceType: &sourceType, SourceID: &sourceID, IdempotencyKey: in.IdempotencyKey,
	})
}

func (r *financeModuleGateOperationalFactRepo) CreatePayableFromOutsourcingReturn(_ context.Context, in *biz.FinanceFactFromOutsourcingReturnCreate) (*biz.FinanceFact, error) {
	supplierID := 703
	sourceType := biz.OutsourcingFactSourceType
	sourceID := in.OutsourcingFactID
	return r.CreateFinanceFactDraft(context.Background(), &biz.FinanceFactCreate{
		FactNo: in.FactNo, FactType: biz.FinanceFactPayable, CounterpartyType: biz.FinanceCounterpartySupplier,
		CounterpartyID: &supplierID, Amount: decimal.NewFromInt(24), Currency: biz.FinanceCurrencyCNY,
		SourceType: &sourceType, SourceID: &sourceID, IdempotencyKey: in.IdempotencyKey,
	})
}

func (r *financeModuleGateOperationalFactRepo) CreateReconciliationFromFinanceFact(_ context.Context, in *biz.FinanceReconciliationFromFactCreate) (*biz.FinanceFact, error) {
	customerID := 501
	sourceType := biz.FinanceFactSourceType
	sourceID := in.FinanceFactID
	return r.CreateFinanceFactDraft(context.Background(), &biz.FinanceFactCreate{
		FactNo: in.FactNo, FactType: biz.FinanceFactReconciliation, CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID: &customerID, Amount: decimal.RequireFromString("128.50"), Currency: biz.FinanceCurrencyCNY,
		SourceType: &sourceType, SourceID: &sourceID, IdempotencyKey: in.IdempotencyKey,
	})
}
