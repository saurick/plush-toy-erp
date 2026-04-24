package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/structpb"
)

type memAdminManageRepoForData struct {
	admins map[int]*biz.AdminUser
}

func newMemAdminManageRepoForData() *memAdminManageRepoForData {
	return &memAdminManageRepoForData{
		admins: map[int]*biz.AdminUser{},
	}
}

func (r *memAdminManageRepoForData) clone(admin *biz.AdminUser) *biz.AdminUser {
	if admin == nil {
		return nil
	}
	cloned := *admin
	cloned.MenuPermissions = append([]string(nil), admin.MenuPermissions...)
	cloned.ERPPreferences = biz.NormalizeAdminERPPreferences(admin.ERPPreferences)
	return &cloned
}

func (r *memAdminManageRepoForData) GetAdminByID(_ context.Context, id int) (*biz.AdminUser, error) {
	admin, ok := r.admins[id]
	if !ok {
		return nil, biz.ErrAdminNotFound
	}
	return r.clone(admin), nil
}

func (r *memAdminManageRepoForData) GetAdminByUsername(_ context.Context, username string) (*biz.AdminUser, error) {
	for _, admin := range r.admins {
		if admin.Username == username {
			return r.clone(admin), nil
		}
	}
	return nil, biz.ErrAdminNotFound
}

func (r *memAdminManageRepoForData) ListAdmins(_ context.Context) ([]*biz.AdminUser, error) {
	out := make([]*biz.AdminUser, 0, len(r.admins))
	for _, admin := range r.admins {
		out = append(out, r.clone(admin))
	}
	return out, nil
}

func (r *memAdminManageRepoForData) CreateAdmin(_ context.Context, admin *biz.AdminCreate) (*biz.AdminUser, error) {
	now := time.Now()
	created := &biz.AdminUser{
		ID:              len(r.admins) + 1,
		Username:        admin.Username,
		PasswordHash:    admin.PasswordHash,
		Level:           int8(admin.Level),
		MenuPermissions: append([]string(nil), admin.MenuPermissions...),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	r.admins[created.ID] = created
	return r.clone(created), nil
}

func (r *memAdminManageRepoForData) UpdateAdminMenuPermissions(_ context.Context, id int, menuPermissions []string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.MenuPermissions = append([]string(nil), menuPermissions...)
	return nil
}

func (r *memAdminManageRepoForData) UpdateAdminERPColumnOrder(_ context.Context, id int, moduleKey string, order []string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	preferences := biz.NormalizeAdminERPPreferences(admin.ERPPreferences)
	if preferences.ColumnOrders == nil {
		preferences.ColumnOrders = map[string][]string{}
	}
	normalizedOrder := biz.NormalizeAdminERPColumnOrder(order)
	if len(normalizedOrder) == 0 {
		delete(preferences.ColumnOrders, moduleKey)
	} else {
		preferences.ColumnOrders[moduleKey] = normalizedOrder
	}
	admin.ERPPreferences = biz.NormalizeAdminERPPreferences(preferences)
	return nil
}

func (r *memAdminManageRepoForData) SetAdminDisabled(_ context.Context, id int, disabled bool) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.Disabled = disabled
	return nil
}

func (r *memAdminManageRepoForData) UpdateAdminPasswordHash(_ context.Context, id int, passwordHash string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.PasswordHash = passwordHash
	return nil
}

func TestJsonrpcData_AdminMe_ReturnsERPPreferences(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:       1,
		Username: "admin",
		Level:    int8(biz.AdminLevelSuper),
		ERPPreferences: biz.AdminERPPreferences{
			ColumnOrders: map[string][]string{
				"project-orders": {"customer_name", "document_no"},
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})

	_, res, err := j.handleAdmin(ctx, "me", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	preferences, ok := res.Data.AsMap()["erp_preferences"].(map[string]any)
	if !ok {
		t.Fatalf("expected erp_preferences object, got %#v", res.Data.AsMap()["erp_preferences"])
	}
	columnOrders, ok := preferences["column_orders"].(map[string]any)
	if !ok {
		t.Fatalf("expected column_orders object, got %#v", preferences["column_orders"])
	}
	rawOrder, ok := columnOrders["project-orders"].([]any)
	if !ok || len(rawOrder) != 2 {
		t.Fatalf("expected project-orders order, got %#v", columnOrders["project-orders"])
	}
}

func TestJsonrpcData_AdminResetPassword(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:        1,
		Username:  "root",
		Level:     int8(biz.AdminLevelSuper),
		CreatedAt: now,
		UpdatedAt: now,
	}
	repo.admins[2] = &biz.AdminUser{
		ID:           2,
		Username:     "manager",
		PasswordHash: "old",
		Level:        int8(biz.AdminLevelStandard),
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     biz.RoleAdmin,
	})
	params, _ := structpb.NewStruct(map[string]any{
		"id":       2,
		"password": "new-secret",
	})

	_, res, err := j.handleAdmin(ctx, "reset_password", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.admins[2].PasswordHash), []byte("new-secret")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
}

func TestJsonrpcData_AdminSetERPColumnOrder(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:        1,
		Username:  "admin",
		Level:     int8(biz.AdminLevelStandard),
		CreatedAt: now,
		UpdatedAt: now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, _ := structpb.NewStruct(map[string]any{
		"module_key": "project-orders",
		"order":      []any{"customer_name", "", "document_no", "customer_name"},
	})

	_, res, err := j.handleAdmin(ctx, "set_erp_column_order", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	order := repo.admins[1].ERPPreferences.ColumnOrders["project-orders"]
	if len(order) != 2 || order[0] != "customer_name" || order[1] != "document_no" {
		t.Fatalf("unexpected stored order: %#v", repo.admins[1].ERPPreferences.ColumnOrders)
	}
}
