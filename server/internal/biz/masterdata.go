package biz

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	ContactOwnerCustomer = "CUSTOMER"
	ContactOwnerSupplier = "SUPPLIER"
)

var (
	ErrCustomerNotFound = errors.New("customer not found")
	ErrSupplierNotFound = errors.New("supplier not found")
	ErrContactNotFound  = errors.New("contact not found")
)

var contactOwnerTypes = map[string]struct{}{
	ContactOwnerCustomer: {},
	ContactOwnerSupplier: {},
}

type Customer struct {
	ID        int
	Code      string
	Name      string
	ShortName *string
	TaxNo     *string
	IsActive  bool
	Note      *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Supplier struct {
	ID           int
	Code         string
	Name         string
	ShortName    *string
	SupplierType *string
	TaxNo        *string
	IsActive     bool
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Contact struct {
	ID        int
	OwnerType string
	OwnerID   int
	Name      string
	Phone     *string
	Mobile    *string
	Email     *string
	Title     *string
	IsPrimary bool
	IsActive  bool
	Note      *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CustomerMutation struct {
	Code      string
	Name      string
	ShortName *string
	TaxNo     *string
	Note      *string
}

type SupplierMutation struct {
	Code         string
	Name         string
	ShortName    *string
	SupplierType *string
	TaxNo        *string
	Note         *string
}

type ContactMutation struct {
	OwnerType string
	OwnerID   int
	Name      string
	Phone     *string
	Mobile    *string
	Email     *string
	Title     *string
	IsPrimary bool
	Note      *string
}

type MasterDataFilter struct {
	Keyword    string
	ActiveOnly bool
	Limit      int
	Offset     int
}

type ContactFilter struct {
	OwnerType  string
	OwnerID    int
	ActiveOnly bool
	Limit      int
	Offset     int
}

type MasterDataRepo interface {
	CreateCustomer(ctx context.Context, in *CustomerMutation) (*Customer, error)
	UpdateCustomer(ctx context.Context, id int, in *CustomerMutation) (*Customer, error)
	GetCustomer(ctx context.Context, id int) (*Customer, error)
	ListCustomers(ctx context.Context, filter MasterDataFilter) ([]*Customer, int, error)
	SetCustomerActive(ctx context.Context, id int, active bool) (*Customer, error)
	CustomerExists(ctx context.Context, id int) (bool, error)

	CreateSupplier(ctx context.Context, in *SupplierMutation) (*Supplier, error)
	UpdateSupplier(ctx context.Context, id int, in *SupplierMutation) (*Supplier, error)
	GetSupplier(ctx context.Context, id int) (*Supplier, error)
	ListSuppliers(ctx context.Context, filter MasterDataFilter) ([]*Supplier, int, error)
	SetSupplierActive(ctx context.Context, id int, active bool) (*Supplier, error)
	SupplierExists(ctx context.Context, id int) (bool, error)

	CreateContact(ctx context.Context, in *ContactMutation) (*Contact, error)
	UpdateContact(ctx context.Context, id int, in *ContactMutation) (*Contact, error)
	GetContact(ctx context.Context, id int) (*Contact, error)
	ListContactsByOwner(ctx context.Context, filter ContactFilter) ([]*Contact, int, error)
	SetPrimaryContact(ctx context.Context, id int) (*Contact, error)
	DisableContact(ctx context.Context, id int) (*Contact, error)
}

type MasterDataUsecase struct {
	repo MasterDataRepo
}

func NewMasterDataUsecase(repo MasterDataRepo) *MasterDataUsecase {
	return &MasterDataUsecase{repo: repo}
}

func (uc *MasterDataUsecase) CreateCustomer(ctx context.Context, in *CustomerMutation) (*Customer, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateCustomer(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateCustomer(ctx context.Context, id int, in *CustomerMutation) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateCustomer(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetCustomer(ctx context.Context, id int) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetCustomer(ctx, id)
}

func (uc *MasterDataUsecase) ListCustomers(ctx context.Context, filter MasterDataFilter) ([]*Customer, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListCustomers(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetCustomerActive(ctx context.Context, id int, active bool) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetCustomerActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateSupplier(ctx context.Context, in *SupplierMutation) (*Supplier, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSupplierMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateSupplier(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateSupplier(ctx context.Context, id int, in *SupplierMutation) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSupplierMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateSupplier(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetSupplier(ctx context.Context, id int) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetSupplier(ctx, id)
}

func (uc *MasterDataUsecase) ListSuppliers(ctx context.Context, filter MasterDataFilter) ([]*Supplier, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListSuppliers(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetSupplierActive(ctx context.Context, id int, active bool) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetSupplierActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateContact(ctx context.Context, in *ContactMutation) (*Contact, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeContactMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateContactOwner(ctx, normalized.OwnerType, normalized.OwnerID); err != nil {
		return nil, err
	}
	return uc.repo.CreateContact(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateContact(ctx context.Context, id int, in *ContactMutation) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeContactMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateContactOwner(ctx, normalized.OwnerType, normalized.OwnerID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateContact(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetContact(ctx, id)
}

func (uc *MasterDataUsecase) ListContactsByOwner(ctx context.Context, filter ContactFilter) ([]*Contact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeContactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListContactsByOwner(ctx, normalized)
}

func (uc *MasterDataUsecase) SetPrimaryContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetPrimaryContact(ctx, id)
}

func (uc *MasterDataUsecase) DisableContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.DisableContact(ctx, id)
}

func (uc *MasterDataUsecase) validateContactOwner(ctx context.Context, ownerType string, ownerID int) error {
	switch ownerType {
	case ContactOwnerCustomer:
		exists, err := uc.repo.CustomerExists(ctx, ownerID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrCustomerNotFound
		}
	case ContactOwnerSupplier:
		exists, err := uc.repo.SupplierExists(ctx, ownerID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrSupplierNotFound
		}
	default:
		return ErrBadParam
	}
	return nil
}

func normalizeCustomerMutation(in CustomerMutation) (CustomerMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.ShortName = normalizeOptionalString(in.ShortName)
	in.TaxNo = normalizeOptionalString(in.TaxNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.Code == "" || in.Name == "" {
		return CustomerMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeSupplierMutation(in SupplierMutation) (SupplierMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.ShortName = normalizeOptionalString(in.ShortName)
	in.SupplierType = normalizeOptionalString(in.SupplierType)
	in.TaxNo = normalizeOptionalString(in.TaxNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.Code == "" || in.Name == "" {
		return SupplierMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeContactMutation(in ContactMutation) (ContactMutation, error) {
	in.OwnerType = strings.ToUpper(strings.TrimSpace(in.OwnerType))
	in.Name = strings.TrimSpace(in.Name)
	in.Phone = normalizeOptionalString(in.Phone)
	in.Mobile = normalizeOptionalString(in.Mobile)
	in.Email = normalizeOptionalString(in.Email)
	in.Title = normalizeOptionalString(in.Title)
	in.Note = normalizeOptionalString(in.Note)
	if !IsValidContactOwnerType(in.OwnerType) || in.OwnerID <= 0 || in.Name == "" {
		return ContactMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeMasterDataFilter(in MasterDataFilter) MasterDataFilter {
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeContactFilter(in ContactFilter) (ContactFilter, error) {
	in.OwnerType = strings.ToUpper(strings.TrimSpace(in.OwnerType))
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	if !IsValidContactOwnerType(in.OwnerType) || in.OwnerID <= 0 {
		return ContactFilter{}, ErrBadParam
	}
	return in, nil
}

func IsValidContactOwnerType(value string) bool {
	_, ok := contactOwnerTypes[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}
