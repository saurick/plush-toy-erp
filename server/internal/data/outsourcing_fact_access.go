package data

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/predicate"
)

func outsourcingWarehousePredicate(ctx context.Context) []predicate.OutsourcingFact {
	scope, scoped := biz.WarehouseDataScopeFromContext(ctx)
	if !scoped || scope.IsAll() {
		return nil
	}
	ids := []int{}
	if scope.Mode == biz.DataScopeModeAssigned {
		ids = scope.WarehouseIDs
	}
	return []predicate.OutsourcingFact{outsourcingfact.WarehouseIDIn(ids...)}
}

func outsourcingDispositionWarehousePredicate(ctx context.Context) []predicate.OutsourcingReturnDisposition {
	predicates := outsourcingWarehousePredicate(ctx)
	if len(predicates) == 0 {
		return nil
	}
	return []predicate.OutsourcingReturnDisposition{func(selector *sql.Selector) {
		facts := sql.Table(outsourcingfact.Table)
		allowed := sql.Select(facts.C(outsourcingfact.FieldID)).From(facts)
		for _, predicate := range predicates {
			predicate(allowed)
		}
		selector.Where(sql.In(selector.C(outsourcingreturndisposition.FieldOutsourcingReturnFactID), allowed))
	}}
}

func validateOutsourcingDispositionAccess(ctx context.Context, client *ent.Client, row *ent.OutsourcingReturnDisposition) error {
	if row == nil {
		return biz.ErrOutsourcingDispositionNotFound
	}
	fact, err := client.OutsourcingFact.Get(ctx, row.OutsourcingReturnFactID)
	if err != nil {
		return err
	}
	return validateOutsourcingFactAccess(ctx, fact)
}

func validateOutsourcingFactAccess(ctx context.Context, row *ent.OutsourcingFact) error {
	if row == nil {
		return biz.ErrOutsourcingFactNotFound
	}
	return biz.ValidateContextWarehouseAccess(ctx, []int{row.WarehouseID})
}
