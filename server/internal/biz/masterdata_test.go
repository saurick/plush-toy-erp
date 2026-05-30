package biz

import (
	"context"
	"errors"
	"testing"
)

type masterDataRepoStub struct {
	customers map[int]bool
	suppliers map[int]bool
	created   *ContactMutation
	updated   *ContactMutation
}

func (s *masterDataRepoStub) CreateCustomer(context.Context, *CustomerMutation) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdateCustomer(context.Context, int, *CustomerMutation) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetCustomer(context.Context, int) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListCustomers(context.Context, MasterDataFilter) ([]*Customer, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetCustomerActive(context.Context, int, bool) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) CustomerExists(_ context.Context, id int) (bool, error) {
	return s.customers[id], nil
}
func (s *masterDataRepoStub) CreateSupplier(context.Context, *SupplierMutation) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdateSupplier(context.Context, int, *SupplierMutation) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetSupplier(context.Context, int) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListSuppliers(context.Context, MasterDataFilter) ([]*Supplier, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetSupplierActive(context.Context, int, bool) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) SupplierExists(_ context.Context, id int) (bool, error) {
	return s.suppliers[id], nil
}
func (s *masterDataRepoStub) CreateContact(_ context.Context, in *ContactMutation) (*Contact, error) {
	cp := *in
	s.created = &cp
	return &Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsPrimary: in.IsPrimary}, nil
}
func (s *masterDataRepoStub) UpdateContact(_ context.Context, _ int, in *ContactMutation) (*Contact, error) {
	cp := *in
	s.updated = &cp
	return &Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsPrimary: in.IsPrimary}, nil
}
func (s *masterDataRepoStub) GetContact(context.Context, int) (*Contact, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListContactsByOwner(context.Context, ContactFilter) ([]*Contact, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetPrimaryContact(context.Context, int) (*Contact, error) {
	return nil, nil
}
func (s *masterDataRepoStub) DisableContact(context.Context, int) (*Contact, error) {
	return nil, nil
}

func TestMasterDataUsecaseContactOwnerGuard(t *testing.T) {
	ctx := context.Background()
	repo := &masterDataRepoStub{
		customers: map[int]bool{10: true},
		suppliers: map[int]bool{20: true},
	}
	uc := NewMasterDataUsecase(repo)

	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: " customer ",
		OwnerID:   10,
		Name:      " 主联系人 ",
	}); err != nil {
		t.Fatalf("expected existing customer owner to pass, got %v", err)
	}
	if repo.created.OwnerType != ContactOwnerCustomer || repo.created.Name != "主联系人" {
		t.Fatalf("expected normalized contact mutation, got %#v", repo.created)
	}

	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: ContactOwnerCustomer,
		OwnerID:   999,
		Name:      "联系人",
	}); !errors.Is(err, ErrCustomerNotFound) {
		t.Fatalf("expected missing customer owner rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: ContactOwnerSupplier,
		OwnerID:   999,
		Name:      "联系人",
	}); !errors.Is(err, ErrSupplierNotFound) {
		t.Fatalf("expected missing supplier owner rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: "PARTNER",
		OwnerID:   10,
		Name:      "联系人",
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected illegal owner type rejected, got %v", err)
	}
}

func TestMasterDataUsecaseNormalizesCustomerSupplierAndContactInput(t *testing.T) {
	note := "  "
	if _, err := normalizeCustomerMutation(CustomerMutation{Code: " C-001 ", Name: " 客户 ", Note: &note}); err != nil {
		t.Fatalf("expected customer mutation valid, got %v", err)
	}
	if _, err := normalizeCustomerMutation(CustomerMutation{Code: " ", Name: "客户"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected empty customer code rejected, got %v", err)
	}
	supplierType := " material "
	supplierInput, err := normalizeSupplierMutation(SupplierMutation{Code: " S-001 ", Name: " 供应商 ", SupplierType: &supplierType})
	if err != nil {
		t.Fatalf("expected supplier mutation valid, got %v", err)
	}
	if supplierInput.SupplierType == nil || *supplierInput.SupplierType != "material" {
		t.Fatalf("expected supplier type trimmed, got %#v", supplierInput.SupplierType)
	}
	contactInput, err := normalizeContactMutation(ContactMutation{OwnerType: "supplier", OwnerID: 20, Name: " 联系人 "})
	if err != nil {
		t.Fatalf("expected contact mutation valid, got %v", err)
	}
	if contactInput.OwnerType != ContactOwnerSupplier || contactInput.Name != "联系人" {
		t.Fatalf("expected normalized contact, got %#v", contactInput)
	}
}
