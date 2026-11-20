package biz

import "context"

// AccountKindEmployee is the zero value for existing employee accounts.
type AccountKind int

const (
	AccountKindEmployee AccountKind = iota
	AccountKindSupplier
	AccountKindCustomer
)

func (k AccountKind) String() string {
	switch k {
	case AccountKindEmployee:
		return "employee"
	case AccountKindSupplier:
		return "supplier"
	case AccountKindCustomer:
		return "customer"
	default:
		return ""
	}
}

type PartnerBinding struct {
	Kind       AccountKind
	SupplierID *int
	CustomerID *int
}

func (b PartnerBinding) Valid() bool {
	switch b.Kind {
	case AccountKindEmployee:
		return b.SupplierID == nil && b.CustomerID == nil
	case AccountKindSupplier:
		return b.SupplierID != nil && *b.SupplierID > 0 && b.CustomerID == nil
	case AccountKindCustomer:
		return b.CustomerID != nil && *b.CustomerID > 0 && b.SupplierID == nil
	default:
		return false
	}
}

func (a *AdminUser) IsEmployee() bool { return a != nil && a.AccountKind == AccountKindEmployee }

func (a *AdminUser) PartnerBinding() PartnerBinding {
	if a == nil {
		return PartnerBinding{Kind: -1}
	}
	return PartnerBinding{Kind: a.AccountKind, SupplierID: a.SupplierID, CustomerID: a.CustomerID}
}

type PartnerOrderFilter struct {
	Keyword       string
	Limit, Offset int
}

type PartnerReadRepo interface {
	ListPurchaseOrders(context.Context, int, PartnerOrderFilter) ([]*PurchaseOrder, int, error)
	GetPurchaseOrder(context.Context, int, int) (*PurchaseOrderWithItems, error)
	ListSalesOrders(context.Context, int, PartnerOrderFilter) ([]*SalesOrder, int, error)
	GetSalesOrder(context.Context, int, int) (*SalesOrderWithItems, error)
	ListAccounts(context.Context) ([]*AdminUser, error)
}

type PartnerReadUsecase struct{ repo PartnerReadRepo }

func NewPartnerReadUsecase(repo PartnerReadRepo) *PartnerReadUsecase {
	return &PartnerReadUsecase{repo: repo}
}

// CurrentPartner consumes the identity already checked against the revocable
// session and current account; request fields never select its organization.
func CurrentPartner(ctx context.Context) (*AdminUser, error) {
	claims, ok := GetClaimsFromContext(ctx)
	account, verified := GetCurrentAdminFromContext(ctx)
	if !ok || claims == nil || claims.Role != RolePartner || !verified || account.ID != claims.UserID || !account.IsActive() || account.IsEmployee() || !account.PartnerBinding().Valid() || !account.PartnerActive || account.IsSuperAdmin {
		return nil, ErrNoPermission
	}
	return account, nil
}

func (uc *PartnerReadUsecase) ListPurchaseOrders(ctx context.Context, f PartnerOrderFilter) ([]*PurchaseOrder, int, error) {
	a, err := CurrentPartner(ctx)
	if err != nil || a.AccountKind != AccountKindSupplier {
		return nil, 0, ErrNoPermission
	}
	return uc.repo.ListPurchaseOrders(ctx, *a.SupplierID, f)
}
func (uc *PartnerReadUsecase) GetPurchaseOrder(ctx context.Context, id int) (*PurchaseOrderWithItems, error) {
	a, err := CurrentPartner(ctx)
	if err != nil || a.AccountKind != AccountKindSupplier {
		return nil, ErrNoPermission
	}
	return uc.repo.GetPurchaseOrder(ctx, *a.SupplierID, id)
}
func (uc *PartnerReadUsecase) ListSalesOrders(ctx context.Context, f PartnerOrderFilter) ([]*SalesOrder, int, error) {
	a, err := CurrentPartner(ctx)
	if err != nil || a.AccountKind != AccountKindCustomer {
		return nil, 0, ErrNoPermission
	}
	return uc.repo.ListSalesOrders(ctx, *a.CustomerID, f)
}
func (uc *PartnerReadUsecase) GetSalesOrder(ctx context.Context, id int) (*SalesOrderWithItems, error) {
	a, err := CurrentPartner(ctx)
	if err != nil || a.AccountKind != AccountKindCustomer {
		return nil, ErrNoPermission
	}
	return uc.repo.GetSalesOrder(ctx, *a.CustomerID, id)
}
func (uc *PartnerReadUsecase) ListAccounts(ctx context.Context) ([]*AdminUser, error) {
	c, ok := GetClaimsFromContext(ctx)
	account, verified := GetCurrentAdminFromContext(ctx)
	if !ok || !c.IsAdmin() || !verified || !account.IsEmployee() || !account.IsActive() || account.ID != c.UserID {
		return nil, ErrNoPermission
	}
	return uc.repo.ListAccounts(ctx)
}
