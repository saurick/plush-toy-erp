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
func (s *masterDataRepoStub) ListPaymentMethodRecommendations(context.Context, PaymentMethodRecommendationFilter) ([]PaymentMethodRecommendation, bool, error) {
	return nil, false, nil
}
func (s *masterDataRepoStub) SetPaymentMethodRecommendation(context.Context, PaymentMethodRecommendationChange, *RuntimeAuditEventCreate) (*PaymentMethodRecommendation, error) {
	return nil, nil
}

type paymentMethodRepoStub struct {
	masterDataRepoStub
	filter           PaymentMethodFilter
	managementFilter PaymentMethodRecommendationFilter
	change           PaymentMethodRecommendationChange
	audit            *RuntimeAuditEventCreate
	calls            int
	err              error
}

func (s *paymentMethodRepoStub) ListPaymentMethods(_ context.Context, filter PaymentMethodFilter) (PaymentMethodSuggestions, error) {
	s.filter = filter
	s.calls++
	return PaymentMethodSuggestions{Methods: []string{"银行转账"}, HasMore: true}, s.err
}
func (s *paymentMethodRepoStub) ListPaymentMethodRecommendations(_ context.Context, filter PaymentMethodRecommendationFilter) ([]PaymentMethodRecommendation, bool, error) {
	s.managementFilter = filter
	s.calls++
	return nil, false, s.err
}
func (s *paymentMethodRepoStub) SetPaymentMethodRecommendation(_ context.Context, change PaymentMethodRecommendationChange, audit *RuntimeAuditEventCreate) (*PaymentMethodRecommendation, error) {
	s.change, s.audit = change, audit
	s.calls++
	return &PaymentMethodRecommendation{Method: change.Method, IsRecommended: change.IsRecommended, Version: change.ExpectedVersion + 1}, s.err
}

func TestPaymentMethodSuggestionsValidateScopeAndKeyword(t *testing.T) {
	repo := &paymentMethodRepoStub{}
	uc := NewMasterDataUsecase(repo)
	got, err := uc.ListPaymentMethods(context.Background(), PaymentMethodFilter{Suppliers: true, Keyword: " 银行 "})
	if err != nil || !got.HasMore || len(got.Methods) != 1 || repo.filter.Keyword != "银行" || !repo.filter.Suppliers || repo.filter.Customers {
		t.Fatalf("suggestions lost scope or normalization: %+v %v %+v", got, err, repo.filter)
	}
	for _, filter := range []PaymentMethodFilter{{}, {Customers: true, Keyword: strings.Repeat("字", 129)}} {
		if _, err := uc.ListPaymentMethods(context.Background(), filter); err == nil {
			t.Fatal("invalid suggestion query accepted")
		}
	}
	if repo.calls != 1 {
		t.Fatalf("invalid query reached repository: %d", repo.calls)
	}
	repo.err = context.Canceled
	if _, err := uc.ListPaymentMethods(context.Background(), PaymentMethodFilter{SalesOrders: true}); !errors.Is(err, context.Canceled) {
		t.Fatalf("request cancellation lost: %v", err)
	}
}

func TestPaymentMethodManagementValidatesAndAuditsRecommendationOnly(t *testing.T) {
	repo := &paymentMethodRepoStub{}
	uc := NewMasterDataUsecase(repo)
	ctx := context.Background()
	_, _, err := uc.ListPaymentMethodRecommendations(ctx, PaymentMethodRecommendationFilter{Keyword: " aa ", Limit: 1000})
	if err != nil || repo.managementFilter.Keyword != "aa" || repo.managementFilter.Limit != 50 {
		t.Fatalf("management query: %+v %v", repo.managementFilter, err)
	}
	for _, filter := range []PaymentMethodRecommendationFilter{{Keyword: strings.Repeat("字", 129)}, {Offset: -1}} {
		if _, _, err := uc.ListPaymentMethodRecommendations(ctx, filter); !errors.Is(err, ErrBadParam) {
			t.Fatal("invalid management filter accepted")
		}
	}
	actor := &AdminUser{ID: 12, Username: "manager", Roles: []AdminRole{{Key: BossRoleKey}}}
	item, err := uc.SetPaymentMethodRecommendation(ctx, actor, PaymentMethodRecommendationChange{Method: " aa ", ExpectedVersion: 2})
	if err != nil || item.Method != "aa" || repo.audit.EventKey != "payment_method.recommendation.set" || repo.change.ExpectedVersion != 2 {
		t.Fatalf("mutation: %+v %v", item, err)
	}
	before := repo.audit.Payload["before"].(map[string]any)
	after := repo.audit.Payload["after"].(map[string]any)
	if before["is_recommended"] != true || after["is_recommended"] != false || after["version"] != 3 || repo.audit.Payload["result"] != "success" {
		t.Fatalf("audit: %+v", repo.audit)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, nil, PaymentMethodRecommendationChange{Method: "aa"}); !errors.Is(err, ErrForbidden) {
		t.Fatal("missing actor accepted")
	}
	calls := repo.calls
	for _, change := range []PaymentMethodRecommendationChange{{Method: " "}, {Method: strings.Repeat("字", 129)}, {Method: "aa", ExpectedVersion: -1}} {
		if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, change); !errors.Is(err, ErrBadParam) {
			t.Fatal("invalid management change accepted")
		}
	}
	if repo.calls != calls {
		t.Fatal("invalid management change reached repository")
	}
	defaults := DefaultPaymentMethods()
	defaults[0] = "changed"
	if DefaultPaymentMethods()[0] != "银行转账" {
		t.Fatal("default list shared mutable storage")
	}
}
