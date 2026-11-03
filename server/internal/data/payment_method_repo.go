package data

import (
	"context"
	"fmt"
	"strings"

	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/paymentmethodpreference"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/supplier"
)

func paymentMethodCandidates(filter biz.PaymentMethodFilter, includePreferences bool) (string, []any) {
	selections := make([]string, 0, 8)
	args := make([]any, 0, 3)
	for _, method := range biz.DefaultPaymentMethods() {
		args = append(args, method)
		selections = append(selections, fmt.Sprintf("SELECT CAST($%d AS TEXT) AS method", len(args)))
	}
	for _, source := range []struct {
		allowed      bool
		table, field string
	}{
		{filter.Customers, customer.Table, customer.FieldDefaultPaymentMethod},
		{filter.Suppliers, supplier.Table, supplier.FieldDefaultPaymentMethod},
		{filter.SalesOrders, salesorder.Table, salesorder.FieldPaymentMethod},
		{filter.PurchaseOrders, purchaseorder.Table, purchaseorder.FieldPaymentMethod},
	} {
		if source.allowed {
			selections = append(selections, fmt.Sprintf("SELECT TRIM(%s) AS method FROM %s WHERE %s IS NOT NULL", source.field, source.table, source.field))
		}
	}
	if includePreferences {
		selections = append(selections, "SELECT method FROM "+paymentmethodpreference.Table)
	}
	return "SELECT DISTINCT method FROM (" + strings.Join(selections, " UNION ALL ") + ") names WHERE method <> ''", args
}

func paymentMethodSearch(keyword string) string {
	return "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(keyword) + "%"
}

func (r *masterDataRepo) ListPaymentMethods(ctx context.Context, filter biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	out := biz.PaymentMethodSuggestions{Methods: []string{}}
	if !filter.Customers && !filter.Suppliers && !filter.SalesOrders && !filter.PurchaseOrders {
		return out, biz.ErrDataScopeForbidden
	}
	// A maintainer's explicit restoration publishes the name as a shared candidate,
	// even if the original draft/default has since changed. Unmaintained history
	// remains limited to the caller's authorized source types.
	names, args := paymentMethodCandidates(filter, true)
	// Filtering precedes LIMIT so hidden names cannot crowd out valid candidates.
	query := fmt.Sprintf("SELECT names.method FROM (%s) names LEFT JOIN %s preference ON preference.method = names.method WHERE COALESCE(preference.is_recommended, TRUE) = TRUE AND LOWER(names.method) LIKE LOWER($%d) ESCAPE '\\' ORDER BY names.method LIMIT $%d", names, paymentmethodpreference.Table, len(args)+1, len(args)+2)
	args = append(args, paymentMethodSearch(filter.Keyword), biz.PaymentMethodSuggestionLimit+1)
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var method string
		if err := rows.Scan(&method); err != nil {
			_ = rows.Close()
			return out, err
		}
		out.Methods = append(out.Methods, method)
	}
	err = rows.Err()
	_ = rows.Close()
	if err != nil {
		return out, err
	}
	out.HasMore = len(out.Methods) > biz.PaymentMethodSuggestionLimit
	if out.HasMore {
		out.Methods = out.Methods[:biz.PaymentMethodSuggestionLimit]
	}
	if filter.Keyword != "" {
		out.KeywordNotRecommended, err = r.data.postgres.PaymentMethodPreference.Query().Where(paymentmethodpreference.Method(filter.Keyword), paymentmethodpreference.IsRecommended(false)).Exist(ctx)
	}
	return out, err
}

func (r *masterDataRepo) ListPaymentMethodRecommendations(ctx context.Context, filter biz.PaymentMethodRecommendationFilter) ([]biz.PaymentMethodRecommendation, bool, error) {
	// The maintenance permission grants company-wide names, without document data.
	names, args := paymentMethodCandidates(biz.PaymentMethodFilter{Customers: true, Suppliers: true, SalesOrders: true, PurchaseOrders: true}, true)
	query := fmt.Sprintf("SELECT names.method, COALESCE(preference.is_recommended, TRUE), COALESCE(preference.version, 0) FROM (%s) names LEFT JOIN %s preference ON preference.method = names.method WHERE COALESCE(preference.is_recommended, TRUE) = $%d AND LOWER(names.method) LIKE LOWER($%d) ESCAPE '\\' ORDER BY names.method LIMIT $%d OFFSET $%d", names, paymentmethodpreference.Table, len(args)+1, len(args)+2, len(args)+3, len(args)+4)
	args = append(args, filter.IsRecommended, paymentMethodSearch(filter.Keyword), filter.Limit+1, filter.Offset)
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]biz.PaymentMethodRecommendation, 0, filter.Limit+1)
	for rows.Next() {
		var item biz.PaymentMethodRecommendation
		if err := rows.Scan(&item.Method, &item.IsRecommended, &item.Version); err != nil {
			return nil, false, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	more := len(items) > filter.Limit
	if more {
		items = items[:filter.Limit]
	}
	return items, more, nil
}

func paymentMethodCandidateExists(ctx context.Context, client *ent.Client, method string) (bool, error) {
	for _, value := range biz.DefaultPaymentMethods() {
		if value == method {
			return true, nil
		}
	}
	matches := func(field string) func(*sql.Selector) {
		return func(s *sql.Selector) {
			s.Where(sql.P(func(b *sql.Builder) {
				b.WriteString("TRIM(").Ident(s.C(field)).WriteString(") = ").Arg(method)
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

func (r *masterDataRepo) SetPaymentMethodRecommendation(ctx context.Context, change biz.PaymentMethodRecommendationChange, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodRecommendation, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackMasterDataEntTx(ctx, tx, r.log) }()
	row, err := tx.PaymentMethodPreference.Query().Where(paymentmethodpreference.Method(change.Method)).Only(ctx)
	switch {
	case ent.IsNotFound(err):
		if change.ExpectedVersion != 0 {
			return nil, biz.ErrPaymentMethodVersionConflict
		}
		found, err := paymentMethodCandidateExists(ctx, tx.Client(), change.Method)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, biz.ErrPaymentMethodNotFound
		}
		if change.IsRecommended {
			return &biz.PaymentMethodRecommendation{Method: change.Method, IsRecommended: true}, nil
		}
		row, err = tx.PaymentMethodPreference.Create().SetMethod(change.Method).SetIsRecommended(false).Save(ctx)
		if ent.IsConstraintError(err) {
			return nil, biz.ErrPaymentMethodVersionConflict
		}
		if err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if row.Version != change.ExpectedVersion {
			return nil, biz.ErrPaymentMethodVersionConflict
		}
		if row.IsRecommended == change.IsRecommended {
			return &biz.PaymentMethodRecommendation{Method: row.Method, IsRecommended: row.IsRecommended, Version: row.Version}, nil
		}
		count, err := tx.PaymentMethodPreference.Update().Where(paymentmethodpreference.ID(row.ID), paymentmethodpreference.Version(change.ExpectedVersion)).SetIsRecommended(change.IsRecommended).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if count != 1 {
			return nil, biz.ErrPaymentMethodVersionConflict
		}
		row.Version++
		row.IsRecommended = change.IsRecommended
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, audit); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.PaymentMethodRecommendation{Method: row.Method, IsRecommended: row.IsRecommended, Version: row.Version}, nil
}
