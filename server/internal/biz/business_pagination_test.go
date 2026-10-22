package biz

import (
	"errors"
	"fmt"
	"testing"
)

func TestBusinessListPaginationSupportsLargePages(t *testing.T) {
	filters := map[string]func(int) (int, error){
		"masterdata": func(limit int) (int, error) {
			f, err := normalizeMasterDataFilter(MasterDataFilter{Limit: limit})
			return f.Limit, err
		},
		"product sku": func(limit int) (int, error) {
			f, err := normalizeProductSKUFilter(ProductSKUFilter{Limit: limit})
			return f.Limit, err
		},
		"sales": func(limit int) (int, error) {
			f, err := normalizeSalesOrderFilter(SalesOrderFilter{Limit: limit})
			return f.Limit, err
		},
		"purchase": func(limit int) (int, error) {
			f, err := normalizePurchaseOrderFilter(PurchaseOrderFilter{Limit: limit})
			return f.Limit, err
		},
		"outsourcing": func(limit int) (int, error) {
			f, err := normalizeOutsourcingOrderFilter(OutsourcingOrderFilter{Limit: limit})
			return f.Limit, err
		},
		"receipt": func(limit int) (int, error) {
			f, err := normalizePurchaseReceiptFilter(PurchaseReceiptFilter{Limit: limit})
			return f.Limit, err
		},
		"incoming quality": func(limit int) (int, error) {
			f, err := normalizeQualityInspectionFilter(QualityInspectionFilter{Limit: limit})
			return f.Limit, err
		},
		"finished quality": func(limit int) (int, error) {
			f, err := normalizeFinishedGoodsQualityInspectionFilter(QualityInspectionFilter{Limit: limit})
			return f.Limit, err
		},
		"outsourcing quality": func(limit int) (int, error) {
			f, err := normalizeOutsourcingReturnQualityInspectionFilter(QualityInspectionFilter{Limit: limit})
			return f.Limit, err
		},
		"production quality": func(limit int) (int, error) {
			f, err := normalizeProductionStageQualityInspectionFilter(QualityInspectionFilter{Limit: limit})
			return f.Limit, err
		},
		"operational fact": func(limit int) (int, error) {
			return normalizeOperationalFactFilter(OperationalFactFilter{Limit: limit}).Limit, nil
		},
		"finance payment": func(limit int) (int, error) {
			f, err := normalizeFinancePaymentListFilter(FinancePaymentFilter{Limit: limit})
			return f.Limit, err
		},
		"credit note": func(limit int) (int, error) {
			f, err := normalizeFinanceCreditNoteListFilter(FinanceCreditNoteFilter{Limit: limit})
			return f.Limit, err
		},
		"inventory": func(limit int) (int, error) {
			offset := 0
			normalizeInventoryListPagination(&limit, &offset)
			return limit, nil
		},
	}
	for name, normalize := range filters {
		t.Run(name, func(t *testing.T) {
			for _, limit := range []int{50, 100, 200, 300, 500} {
				if got, err := normalize(limit); err != nil || got != limit {
					t.Fatalf("limit %d became %d: %v", limit, got, err)
				}
			}
			for _, limit := range []int{-1, 0, 501} {
				if got, err := normalize(limit); err != nil || got != 50 {
					t.Fatalf("invalid limit %d became %d: %v", limit, got, err)
				}
			}
		})
	}
}

func TestBusinessListPaginationPreservesStrictAndClampedBoundaries(t *testing.T) {
	for _, limit := range []int{200, 300, 500} {
		t.Run(fmt.Sprint(limit), func(t *testing.T) {
			production, err := normalizeProductionOrderListFilter(ProductionOrderFilter{Limit: limit, Offset: 500})
			if err != nil || production.Limit != limit || production.Offset != 500 {
				t.Fatalf("production pagination = %#v, %v", production, err)
			}
			workflow := normalizeWorkflowTaskFilter(WorkflowTaskFilter{Limit: limit, Offset: 500})
			if workflow.Limit != limit || workflow.Offset != 500 {
				t.Fatalf("workflow pagination = %#v", workflow)
			}
		})
	}
	if _, err := normalizeProductionOrderListFilter(ProductionOrderFilter{Limit: 501}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("oversized production limit accepted: %v", err)
	}
	if got := normalizeWorkflowTaskFilter(WorkflowTaskFilter{Limit: 501}).Limit; got != 500 {
		t.Fatalf("workflow limit = %d, want clamped 500", got)
	}
	if got := normalizeWorkflowBusinessStateFilter(WorkflowBusinessStateFilter{Limit: 500}).Limit; got != 200 {
		t.Fatalf("business state limit changed: %d", got)
	}
}
