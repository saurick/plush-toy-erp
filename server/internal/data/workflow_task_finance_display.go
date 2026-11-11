package data

import (
	"context"
	"strings"

	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financeallocation"
	"server/internal/data/model/ent/financepayment"
)

type workflowFinanceDisplaySource struct {
	kind string
	id   int
}

func loadWorkflowFinancePaymentDisplaySources(ctx context.Context, client *ent.Client, ids []int) (map[int]workflowDisplaySource, error) {
	rows, err := client.FinancePayment.Query().Where(financepayment.IDIn(ids...)).WithRefundSource().All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int]workflowDisplaySource, len(rows))
	owners := make(map[int][]int)
	refs := make(map[int][]workflowFinanceDisplaySource)
	byKind := make(map[string][]int)
	add := func(paymentID int, typ *string, sourceID *int) {
		kind, id := strings.ToLower(displayString(typ)), displayInt(sourceID)
		if id <= 0 {
			return
		}
		switch kind {
		case "sales_order", "purchase_order", "outsourcing_order", "shipment", "purchase_receipt", "outsourcing_fact":
			refs[paymentID] = append(refs[paymentID], workflowFinanceDisplaySource{kind, id})
			byKind[kind] = append(byKind[kind], id)
		}
	}
	for _, row := range rows {
		out[row.ID] = workflowDisplaySource{no: row.PaymentNo}
		original := row
		if row.Edges.RefundSource != nil {
			original = row.Edges.RefundSource
		}
		owners[original.ID] = append(owners[original.ID], row.ID)
		add(row.ID, original.SourceType, original.SourceID)
	}
	if len(owners) == 0 {
		return out, nil
	}
	paymentIDs := make([]int, 0, len(owners))
	for id := range owners {
		paymentIDs = append(paymentIDs, id)
	}
	allocations, err := client.FinanceAllocation.Query().Where(financeallocation.PaymentIDIn(paymentIDs...), financeallocation.ReversalOfAllocationIDIsNil()).WithFinanceFact().Order(ent.Asc(financeallocation.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, allocation := range allocations {
		if fact := allocation.Edges.FinanceFact; fact != nil {
			for _, paymentID := range owners[allocation.PaymentID] {
				add(paymentID, fact.SourceType, fact.SourceID)
			}
		}
	}
	loaded := make(map[string]map[int]workflowDisplaySource, len(byKind))
	for kind, sourceIDs := range byKind {
		loaded[kind], err = loadWorkflowDisplaySources(ctx, client, kind, sourceIDs)
		if err != nil {
			return nil, err
		}
	}
	for paymentID, links := range refs {
		projection := out[paymentID]
		seen := map[workflowFinanceDisplaySource]bool{}
		for _, link := range links {
			if seen[link] {
				continue
			}
			seen[link] = true
			for _, item := range loaded[link.kind][link.id].items {
				if item.id > 0 {
					projection.items = append(projection.items, item)
				}
			}
		}
		out[paymentID] = projection
	}
	return out, nil
}
