package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func (s *masterDataRepoStub) ListPaymentMethods(context.Context, PaymentMethodFilter) (PaymentMethodSuggestions, error) {
	return PaymentMethodSuggestions{}, nil
}
func (s *masterDataRepoStub) ListPaymentMethodOptions(context.Context, PaymentMethodOptionFilter) ([]PaymentMethodOption, bool, error) {
	return nil, false, nil
}
func (s *masterDataRepoStub) CreatePaymentMethod(context.Context, string, *RuntimeAuditEventCreate) (*PaymentMethodOption, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdatePaymentMethod(context.Context, PaymentMethodOptionChange, *RuntimeAuditEventCreate) (*PaymentMethodOption, error) {
	return nil, nil
}
func (s *masterDataRepoStub) DeletePaymentMethod(context.Context, int, int, *RuntimeAuditEventCreate) error {
	return nil
}

type paymentMethodRepoStub struct {
	masterDataRepoStub
	filter           PaymentMethodFilter
	managementFilter PaymentMethodOptionFilter
	change           PaymentMethodOptionChange
	audit            *RuntimeAuditEventCreate
	calls            int
	err              error
}

func (s *paymentMethodRepoStub) ListPaymentMethods(_ context.Context, f PaymentMethodFilter) (PaymentMethodSuggestions, error) {
	s.filter = f
	s.calls++
	return PaymentMethodSuggestions{Methods: []string{"银行转账"}, HasMore: true}, s.err
}
func (s *paymentMethodRepoStub) ListPaymentMethodOptions(_ context.Context, f PaymentMethodOptionFilter) ([]PaymentMethodOption, bool, error) {
	s.managementFilter = f
	s.calls++
	return nil, false, s.err
}
func (s *paymentMethodRepoStub) CreatePaymentMethod(_ context.Context, name string, audit *RuntimeAuditEventCreate) (*PaymentMethodOption, error) {
	s.calls++
	s.audit = audit
	return &PaymentMethodOption{ID: 1, Method: name, IsActive: true, Version: 1}, s.err
}
func (s *paymentMethodRepoStub) UpdatePaymentMethod(_ context.Context, c PaymentMethodOptionChange, audit *RuntimeAuditEventCreate) (*PaymentMethodOption, error) {
	s.calls++
	s.change = c
	s.audit = audit
	return &PaymentMethodOption{ID: c.ID, Method: c.Method, IsActive: c.IsActive, Version: c.ExpectedVersion + 1}, s.err
}
func (s *paymentMethodRepoStub) DeletePaymentMethod(_ context.Context, id, version int, audit *RuntimeAuditEventCreate) error {
	s.calls++
	s.audit = audit
	return s.err
}

func TestPaymentMethodCatalogueValidatesNamesVersionsAndActor(t *testing.T) {
	ctx := context.Background()
	repo := &paymentMethodRepoStub{}
	uc := NewMasterDataUsecase(repo)
	actor := &AdminUser{ID: 12, Username: "manager"}
	got, err := uc.ListPaymentMethods(ctx, PaymentMethodFilter{Keyword: " 银行 "})
	if err != nil || !got.HasMore || repo.filter.Keyword != "银行" {
		t.Fatalf("suggestions: %+v %v", got, err)
	}
	_, _, err = uc.ListPaymentMethodOptions(ctx, PaymentMethodOptionFilter{Keyword: " aa ", Limit: 1000})
	if err != nil || repo.managementFilter.Keyword != "aa" || repo.managementFilter.Limit != 50 {
		t.Fatal("unbounded catalogue query")
	}
	item, err := uc.CreatePaymentMethod(ctx, actor, " 支票 ")
	if err != nil || item.Method != "支票" || repo.audit.EventKey != "payment_method.create" {
		t.Fatalf("create: %+v %v", item, err)
	}
	_, err = uc.UpdatePaymentMethod(ctx, actor, PaymentMethodOptionChange{ID: 1, Method: " 银行汇款 ", ExpectedVersion: 3})
	if err != nil || repo.change.Method != "银行汇款" || repo.audit.EventKey != "payment_method.update" {
		t.Fatal("update normalization or audit lost")
	}
	if err := uc.DeletePaymentMethod(ctx, actor, 1, 4); err != nil || repo.audit.EventKey != "payment_method.delete" {
		t.Fatal("delete audit lost")
	}
	calls := repo.calls
	for _, name := range []string{" ", strings.Repeat("字", 129)} {
		if _, err := uc.CreatePaymentMethod(ctx, actor, name); !errors.Is(err, ErrBadParam) {
			t.Fatal("invalid name accepted")
		}
	}
	for _, c := range []PaymentMethodOptionChange{{ID: 1, Method: "支票"}, {Method: "支票", ExpectedVersion: 1}, {ID: 1, Method: " ", ExpectedVersion: 1}} {
		if _, err := uc.UpdatePaymentMethod(ctx, actor, c); !errors.Is(err, ErrBadParam) {
			t.Fatal("invalid change accepted")
		}
	}
	if _, _, err := uc.ListPaymentMethodOptions(ctx, PaymentMethodOptionFilter{Offset: -1}); !errors.Is(err, ErrBadParam) {
		t.Fatal("negative offset accepted")
	}
	if err := uc.DeletePaymentMethod(ctx, actor, 1, 0); !errors.Is(err, ErrBadParam) {
		t.Fatal("missing delete version accepted")
	}
	if _, err := uc.CreatePaymentMethod(ctx, nil, "支票"); !errors.Is(err, ErrForbidden) {
		t.Fatal("missing actor accepted")
	}
	if repo.calls != calls {
		t.Fatal("invalid input reached repository")
	}
	repo.err = context.Canceled
	if _, err := uc.ListPaymentMethods(ctx, PaymentMethodFilter{}); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation lost")
	}
}
