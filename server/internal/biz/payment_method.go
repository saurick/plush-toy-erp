package biz

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

const PaymentMethodSuggestionLimit = 50

var (
	ErrPaymentMethodUnavailable     = errors.New("payment method is not an active shared choice")
	ErrPaymentMethodNotFound        = errors.New("payment method not found")
	ErrPaymentMethodVersionConflict = errors.New("payment method version conflict")
	ErrPaymentMethodExists          = errors.New("payment method already exists")
	ErrPaymentMethodInUse           = errors.New("payment method has been used")
)

type PaymentMethodSuggestions struct {
	Methods         []string
	HasMore         bool
	KeywordExists   bool
	KeywordInactive bool
}

type PaymentMethodFilter struct{ Keyword string }

type PaymentMethodOption struct {
	ID          int
	Method      string
	IsActive    bool
	HasBeenUsed bool
	Version     int
}

type PaymentMethodOptionFilter struct {
	Keyword  string
	IsActive bool
	Limit    int
	Offset   int
}

type PaymentMethodOptionChange struct {
	ID              int
	Method          string
	IsActive        bool
	ExpectedVersion int
}

func validPaymentMethodName(method string) bool {
	return method != "" && utf8.RuneCountInString(method) <= 128
}

func (uc *MasterDataUsecase) ListPaymentMethods(ctx context.Context, filter PaymentMethodFilter) (PaymentMethodSuggestions, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if uc == nil || uc.repo == nil || utf8.RuneCountInString(filter.Keyword) > 128 {
		return PaymentMethodSuggestions{}, ErrBadParam
	}
	return uc.repo.ListPaymentMethods(ctx, filter)
}

func (uc *MasterDataUsecase) ListPaymentMethodOptions(ctx context.Context, filter PaymentMethodOptionFilter) ([]PaymentMethodOption, bool, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if uc == nil || uc.repo == nil || utf8.RuneCountInString(filter.Keyword) > 128 || filter.Offset < 0 {
		return nil, false, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > PaymentMethodSuggestionLimit {
		filter.Limit = PaymentMethodSuggestionLimit
	}
	return uc.repo.ListPaymentMethodOptions(ctx, filter)
}

func paymentMethodAudit(operator *AdminUser, action string, id int, method string) (*RuntimeAuditEventCreate, error) {
	audit, err := BuildAdminControlAuditEvent(operator, action, "payment_method", id, method, nil, nil)
	if err != nil {
		return nil, err
	}
	audit.Payload["result"] = "success"
	roleKeys := make([]string, 0, len(operator.Roles))
	for _, role := range operator.Roles {
		roleKeys = append(roleKeys, role.Key)
	}
	audit.Payload["actor"].(map[string]any)["role_keys"] = roleKeys
	return audit, nil
}

func (uc *MasterDataUsecase) CreatePaymentMethod(ctx context.Context, operator *AdminUser, method string) (*PaymentMethodOption, error) {
	method = strings.TrimSpace(method)
	if uc == nil || uc.repo == nil || !validPaymentMethodName(method) {
		return nil, ErrBadParam
	}
	audit, err := paymentMethodAudit(operator, "payment_method.create", 0, method)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreatePaymentMethod(ctx, method, audit)
}

func (uc *MasterDataUsecase) UpdatePaymentMethod(ctx context.Context, operator *AdminUser, change PaymentMethodOptionChange) (*PaymentMethodOption, error) {
	change.Method = strings.TrimSpace(change.Method)
	if uc == nil || uc.repo == nil || !validPaymentMethodName(change.Method) || change.ID <= 0 || change.ExpectedVersion <= 0 {
		return nil, ErrBadParam
	}
	audit, err := paymentMethodAudit(operator, "payment_method.update", change.ID, change.Method)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdatePaymentMethod(ctx, change, audit)
}

func (uc *MasterDataUsecase) DeletePaymentMethod(ctx context.Context, operator *AdminUser, id, version int) error {
	if uc == nil || uc.repo == nil || id <= 0 || version <= 0 {
		return ErrBadParam
	}
	audit, err := paymentMethodAudit(operator, "payment_method.delete", id, "")
	if err != nil {
		return err
	}
	return uc.repo.DeletePaymentMethod(ctx, id, version, audit)
}
