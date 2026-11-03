package data

import (
	"context"
	"strings"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/paymentmethodpreference"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/supplier"
)

func paymentMethodRow(row *ent.PaymentMethodPreference) biz.PaymentMethodOption {
	return biz.PaymentMethodOption{ID: row.ID, Method: row.Method, IsActive: row.IsRecommended, HasBeenUsed: row.HasBeenUsed, Version: row.Version}
}

func (r *masterDataRepo) ListPaymentMethods(ctx context.Context, filter biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	out := biz.PaymentMethodSuggestions{Methods: []string{}}
	rows, err := r.data.postgres.PaymentMethodPreference.Query().Where(paymentmethodpreference.IsRecommended(true), paymentmethodpreference.MethodContainsFold(filter.Keyword)).Order(paymentmethodpreference.ByMethod()).Limit(biz.PaymentMethodSuggestionLimit + 1).All(ctx)
	if err != nil {
		return out, err
	}
	out.HasMore = len(rows) > biz.PaymentMethodSuggestionLimit
	if out.HasMore {
		rows = rows[:biz.PaymentMethodSuggestionLimit]
	}
	for _, row := range rows {
		out.Methods = append(out.Methods, row.Method)
	}
	if filter.Keyword != "" {
		row, err := r.data.postgres.PaymentMethodPreference.Query().Where(paymentmethodpreference.MethodEqualFold(filter.Keyword)).First(ctx)
		if err != nil && !ent.IsNotFound(err) {
			return out, err
		}
		if row != nil {
			out.KeywordExists = true
			out.KeywordInactive = !row.IsRecommended
		}
	}
	return out, nil
}

func (r *masterDataRepo) ListPaymentMethodOptions(ctx context.Context, filter biz.PaymentMethodOptionFilter) ([]biz.PaymentMethodOption, bool, error) {
	rows, err := r.data.postgres.PaymentMethodPreference.Query().Where(paymentmethodpreference.IsRecommended(filter.IsActive), paymentmethodpreference.MethodContainsFold(filter.Keyword)).Order(paymentmethodpreference.ByMethod(), paymentmethodpreference.ByID()).Limit(filter.Limit + 1).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, false, err
	}
	more := len(rows) > filter.Limit
	if more {
		rows = rows[:filter.Limit]
	}
	out := make([]biz.PaymentMethodOption, 0, len(rows))
	for _, row := range rows {
		out = append(out, paymentMethodRow(row))
	}
	return out, more, nil
}

// Catalogue lifecycle and business saves share one short transaction lock. This
// orders create/rename/delete against first use, including names not yet present.
func lockPaymentMethodCatalogue(ctx context.Context, client *ent.Client, sqlDialect string) error {
	if sqlDialect != dialect.Postgres {
		return nil
	}
	_, err := client.ExecContext(ctx, "SELECT pg_advisory_xact_lock(729410320601)")
	return err
}

func paymentMethodInUse(ctx context.Context, client *ent.Client, method string) (bool, error) {
	matches := func(field string) func(*sql.Selector) {
		return func(s *sql.Selector) {
			s.Where(sql.P(func(b *sql.Builder) {
				b.WriteString("LOWER(TRIM(").Ident(s.C(field)).WriteString(")) = LOWER(").Arg(method).WriteString(")")
			}))
		}
	}
	for _, exists := range []func(context.Context) (bool, error){
		client.Customer.Query().Where(matches(customer.FieldDefaultPaymentMethod)).Exist,
		client.Supplier.Query().Where(matches(supplier.FieldDefaultPaymentMethod)).Exist,
		client.SalesOrder.Query().Where(matches(salesorder.FieldPaymentMethod)).Exist,
		client.PurchaseOrder.Query().Where(matches(purchaseorder.FieldPaymentMethod)).Exist,
	} {
		found, err := exists(ctx)
		if err != nil || found {
			return found, err
		}
	}
	return false, nil
}

// Called inside the owning business transaction. It never publishes free text
// as a common option and never resets the lifetime guard when a source changes.
func recordPaymentMethodUse(ctx context.Context, client *ent.Client, sqlDialect string, method *string) error {
	if method == nil || strings.TrimSpace(*method) == "" {
		return nil
	}
	if err := lockPaymentMethodCatalogue(ctx, client, sqlDialect); err != nil {
		return err
	}
	return client.PaymentMethodPreference.Update().Where(paymentmethodpreference.MethodEqualFold(strings.TrimSpace(*method)), paymentmethodpreference.HasBeenUsed(false)).SetHasBeenUsed(true).Exec(ctx)
}

func paymentMethodAuditSnapshot(row *ent.PaymentMethodPreference) map[string]any {
	if row == nil {
		return nil
	}
	return map[string]any{"id": row.ID, "method": row.Method, "is_active": row.IsRecommended, "has_been_used": row.HasBeenUsed, "version": row.Version}
}

func savePaymentMethodAudit(ctx context.Context, tx *ent.Tx, audit *biz.RuntimeAuditEventCreate, before, after *ent.PaymentMethodPreference) error {
	if audit == nil || audit.Payload == nil {
		return biz.ErrBadParam
	}
	row := after
	if row == nil {
		row = before
	}
	audit.Payload["before"] = paymentMethodAuditSnapshot(before)
	audit.Payload["after"] = paymentMethodAuditSnapshot(after)
	audit.Payload["target"] = map[string]any{"type": "payment_method", "id": row.ID, "key": row.Method}
	return createRuntimeAuditEventInTx(ctx, tx, audit)
}

func (r *masterDataRepo) CreatePaymentMethod(ctx context.Context, method string, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackMasterDataEntTx(ctx, tx, r.log) }()
	if err := lockPaymentMethodCatalogue(ctx, tx.Client(), r.data.sqlDialect); err != nil {
		return nil, err
	}
	exists, err := tx.PaymentMethodPreference.Query().Where(paymentmethodpreference.MethodEqualFold(method)).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, biz.ErrPaymentMethodExists
	}
	used, err := paymentMethodInUse(ctx, tx.Client(), method)
	if err != nil {
		return nil, err
	}
	row, err := tx.PaymentMethodPreference.Create().SetMethod(method).SetHasBeenUsed(used).Save(ctx)
	if ent.IsConstraintError(err) {
		return nil, biz.ErrPaymentMethodExists
	}
	if err != nil {
		return nil, err
	}
	if err := savePaymentMethodAudit(ctx, tx, audit, nil, row); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	out := paymentMethodRow(row)
	return &out, nil
}

func (r *masterDataRepo) UpdatePaymentMethod(ctx context.Context, change biz.PaymentMethodOptionChange, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackMasterDataEntTx(ctx, tx, r.log) }()
	if err := lockPaymentMethodCatalogue(ctx, tx.Client(), r.data.sqlDialect); err != nil {
		return nil, err
	}
	row, err := tx.PaymentMethodPreference.Get(ctx, change.ID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrPaymentMethodNotFound
	}
	if err != nil {
		return nil, err
	}
	if row.Version != change.ExpectedVersion {
		return nil, biz.ErrPaymentMethodVersionConflict
	}
	duplicate, err := tx.PaymentMethodPreference.Query().Where(paymentmethodpreference.IDNEQ(row.ID), paymentmethodpreference.MethodEqualFold(change.Method)).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if duplicate {
		return nil, biz.ErrPaymentMethodExists
	}
	if row.Method == change.Method && row.IsRecommended == change.IsActive {
		out := paymentMethodRow(row)
		return &out, nil
	}
	used, err := paymentMethodInUse(ctx, tx.Client(), row.Method)
	if err != nil {
		return nil, err
	}
	count, err := tx.PaymentMethodPreference.Update().Where(paymentmethodpreference.ID(row.ID), paymentmethodpreference.Version(change.ExpectedVersion)).SetMethod(change.Method).SetIsRecommended(change.IsActive).SetHasBeenUsed(row.HasBeenUsed || used).AddVersion(1).Save(ctx)
	if ent.IsConstraintError(err) {
		return nil, biz.ErrPaymentMethodExists
	}
	if err != nil {
		return nil, err
	}
	if count != 1 {
		return nil, biz.ErrPaymentMethodVersionConflict
	}
	changed, err := tx.PaymentMethodPreference.Get(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	if err := savePaymentMethodAudit(ctx, tx, audit, row, changed); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	out := paymentMethodRow(changed)
	return &out, nil
}

func (r *masterDataRepo) DeletePaymentMethod(ctx context.Context, id, version int, audit *biz.RuntimeAuditEventCreate) error {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() { rollbackMasterDataEntTx(ctx, tx, r.log) }()
	if err := lockPaymentMethodCatalogue(ctx, tx.Client(), r.data.sqlDialect); err != nil {
		return err
	}
	row, err := tx.PaymentMethodPreference.Get(ctx, id)
	if ent.IsNotFound(err) {
		return biz.ErrPaymentMethodNotFound
	}
	if err != nil {
		return err
	}
	if row.Version != version {
		return biz.ErrPaymentMethodVersionConflict
	}
	used, err := paymentMethodInUse(ctx, tx.Client(), row.Method)
	if err != nil {
		return err
	}
	if row.HasBeenUsed || used {
		return biz.ErrPaymentMethodInUse
	}
	count, err := tx.PaymentMethodPreference.Delete().Where(paymentmethodpreference.ID(id), paymentmethodpreference.Version(version), paymentmethodpreference.HasBeenUsed(false)).Exec(ctx)
	if err != nil {
		return err
	}
	if count != 1 {
		return biz.ErrPaymentMethodVersionConflict
	}
	if err := savePaymentMethodAudit(ctx, tx, audit, row, nil); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}
