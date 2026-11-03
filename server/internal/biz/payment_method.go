package biz

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

const PaymentMethodSuggestionLimit = 50

var (
	ErrPaymentMethodNotFound        = errors.New("payment method candidate not found")
	ErrPaymentMethodVersionConflict = errors.New("payment method recommendation version conflict")
)

// Defaults share the same recommendation policy as names saved on source records.
func DefaultPaymentMethods() []string {
	return []string{"银行转账", "现金", "银行承兑"}
}

type PaymentMethodSuggestions struct {
	Methods               []string
	HasMore               bool
	KeywordNotRecommended bool
}

type PaymentMethodRecommendation struct {
	Method        string
	IsRecommended bool
	Version       int
}

type PaymentMethodRecommendationFilter struct {
	Keyword       string
	IsRecommended bool
	Limit         int
	Offset        int
}

type PaymentMethodRecommendationChange struct {
	Method          string
	IsRecommended   bool
	ExpectedVersion int
}

// Sources are supplied by the service after checking effective read permissions.
type PaymentMethodFilter struct {
	Keyword        string
	Customers      bool
	Suppliers      bool
	SalesOrders    bool
	PurchaseOrders bool
}

func (uc *MasterDataUsecase) ListPaymentMethods(ctx context.Context, filter PaymentMethodFilter) (PaymentMethodSuggestions, error) {
	if uc == nil || uc.repo == nil {
		return PaymentMethodSuggestions{}, ErrBadParam
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if utf8.RuneCountInString(filter.Keyword) > 128 {
		return PaymentMethodSuggestions{}, ErrBadParam
	}
	if !filter.Customers && !filter.Suppliers && !filter.SalesOrders && !filter.PurchaseOrders {
		return PaymentMethodSuggestions{}, ErrDataScopeForbidden
	}
	return uc.repo.ListPaymentMethods(ctx, filter)
}

func (uc *MasterDataUsecase) ListPaymentMethodRecommendations(ctx context.Context, filter PaymentMethodRecommendationFilter) ([]PaymentMethodRecommendation, bool, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if uc == nil || uc.repo == nil || utf8.RuneCountInString(filter.Keyword) > 128 || filter.Offset < 0 {
		return nil, false, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > PaymentMethodSuggestionLimit {
		filter.Limit = PaymentMethodSuggestionLimit
	}
	return uc.repo.ListPaymentMethodRecommendations(ctx, filter)
}

func (uc *MasterDataUsecase) SetPaymentMethodRecommendation(ctx context.Context, operator *AdminUser, change PaymentMethodRecommendationChange) (*PaymentMethodRecommendation, error) {
	change.Method = strings.TrimSpace(change.Method)
	if uc == nil || uc.repo == nil || change.Method == "" || utf8.RuneCountInString(change.Method) > 128 || change.ExpectedVersion < 0 {
		return nil, ErrBadParam
	}
	before := map[string]any{"is_recommended": !change.IsRecommended, "version": change.ExpectedVersion}
	after := map[string]any{"is_recommended": change.IsRecommended, "version": change.ExpectedVersion + 1}
	audit, err := BuildAdminControlAuditEvent(operator, "payment_method.recommendation.set", "payment_method", 0, change.Method, before, after)
	if err != nil {
		return nil, err
	}
	audit.Payload["result"] = "success"
	roleKeys := make([]string, 0, len(operator.Roles))
	for _, role := range operator.Roles {
		roleKeys = append(roleKeys, role.Key)
	}
	audit.Payload["actor"].(map[string]any)["role_keys"] = roleKeys
	return uc.repo.SetPaymentMethodRecommendation(ctx, change, audit)
}
