// server/internal/data/jsonrpc_auth_test.go
package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestJsonrpcData_AuthLogin_OK(t *testing.T) {
	repo := newMemAuthRepoForData()
	_ = repo.putUser("alice", "p@ss", false)

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()

	genTok := func(userID int, username string, role int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}
	authUC := biz.NewAuthUsecase(repo, genTok, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"username": "alice",
		"password": "p@ss",
	})

	_, res, err := j.handleAuth(context.Background(), "login", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != 0 {
		t.Fatalf("expected code=0, got %+v", res)
	}
	if res.Data == nil {
		t.Fatalf("expected data not nil")
	}
	m := res.Data.AsMap()
	if m["access_token"] != "tok" {
		t.Fatalf("expected access_token=tok, got %v", m["access_token"])
	}
	if m["user_id"] == nil {
		t.Fatalf("expected user_id not nil")
	}
}

func TestJsonrpcData_AuthRegister_Success(t *testing.T) {
	repo := newMemAuthRepoForData()

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok-reg", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"username": "bob",
		"password": "p@ss",
	})

	_, res, err := j.handleAuth(context.Background(), "register", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != 0 {
		t.Fatalf("expected code=0, got %+v", res)
	}
	m := res.Data.AsMap()
	if m["access_token"] != "tok-reg" {
		t.Fatalf("expected access_token=tok-reg, got %v", m["access_token"])
	}
	if m["username"] != "bob" {
		t.Fatalf("expected username=bob, got %v", m["username"])
	}
}

func TestJsonrpcData_AuthRegister_MissingArgs(t *testing.T) {
	repo := newMemAuthRepoForData()

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"username": "alice",
	})

	_, res, err := j.handleAuth(context.Background(), "register", "1", params)
	if err != nil {
		t.Fatalf("expected nil err (jsonrpc should map to result), got %v", err)
	}
	if res == nil {
		t.Fatalf("expected result not nil")
	}
	if res.Code == 0 {
		t.Fatalf("expected non-zero code for missing args, got %+v", res)
	}
}

func TestJsonrpcData_AuthLogin_UserNotFound(t *testing.T) {
	repo := newMemAuthRepoForData()

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"username": "notfound",
		"password": "p@ss",
	})

	_, res, err := j.handleAuth(context.Background(), "login", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code == 0 {
		t.Fatalf("expected non-zero code for user not found, got %+v", res)
	}
	if res.Code != errcode.AuthUserNotFound.Code {
		t.Fatalf("expected code=%d, got %d", errcode.AuthUserNotFound.Code, res.Code)
	}
}

func TestJsonrpcData_AuthLogin_InvalidPassword(t *testing.T) {
	repo := newMemAuthRepoForData()
	_ = repo.putUser("alice", "p@ss", false)

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"username": "alice",
		"password": "wrong",
	})

	_, res, err := j.handleAuth(context.Background(), "login", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code == 0 {
		t.Fatalf("expected non-zero code for invalid password, got %+v", res)
	}
	if res.Code != errcode.AuthInvalidPassword.Code {
		t.Fatalf("expected code=%d, got %d", errcode.AuthInvalidPassword.Code, res.Code)
	}
}

func TestRedactRPCParamsMasksSensitiveFields(t *testing.T) {
	got := redactRPCParams(map[string]any{
		"username": "worker",
		"password": "plain-secret",
		"code":     "123456",
		"nested": map[string]any{
			"access_token": "token-secret",
		},
	}).(map[string]any)

	if got["username"] != "worker" {
		t.Fatalf("expected username to stay visible, got %#v", got["username"])
	}
	if got["password"] != "<redacted>" {
		t.Fatalf("expected password to be redacted, got %#v", got["password"])
	}
	if got["code"] != "<redacted>" {
		t.Fatalf("expected sms code to be redacted, got %#v", got["code"])
	}
	nested, ok := got["nested"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested map, got %#v", got["nested"])
	}
	if nested["access_token"] != "<redacted>" {
		t.Fatalf("expected access_token to be redacted, got %#v", nested["access_token"])
	}
}

func TestJsonrpcData_AuthSMSLogin_OK(t *testing.T) {
	repo := newMemAuthRepoForData()
	_ = repo.putUser("13800138000", "unused", false)

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok-sms", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
		"scope": "user",
	})

	_, res, err := j.handleAuth(context.Background(), "send_sms_code", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected code=0, got %+v", res)
	}
	code, _ := res.Data.AsMap()["mock_code"].(string)
	if code == "" {
		t.Fatalf("expected mock code in response")
	}

	loginParams, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
		"code":  code,
		"scope": "user",
	})
	_, res, err = j.handleAuth(context.Background(), "sms_login", "2", loginParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected code=0, got %+v", res)
	}
	if res.Data.AsMap()["access_token"] != "tok-sms" {
		t.Fatalf("expected access_token=tok-sms, got %v", res.Data.AsMap()["access_token"])
	}
}

func TestJsonrpcData_AuthSMSLogin_InvalidCode(t *testing.T) {
	repo := newMemAuthRepoForData()
	_ = repo.putUser("13800138000", "unused", false)

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok-sms", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
	})
	_, res, err := j.handleAuth(context.Background(), "send_sms_code", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected code=0, got %+v", res)
	}
	mockCode, _ := res.Data.AsMap()["mock_code"].(string)
	wrongCode := "000000"
	if mockCode == wrongCode {
		wrongCode = "111111"
	}

	loginParams, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
		"code":  wrongCode,
	})
	_, res, err = j.handleAuth(context.Background(), "sms_login", "2", loginParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.AuthInvalidSMSCode.Code {
		t.Fatalf("expected invalid sms code=%d, got %+v", errcode.AuthInvalidSMSCode.Code, res)
	}
}

func TestJsonrpcData_AdminSMSLogin_OK(t *testing.T) {
	repo := newMemAdminAuthRepoForData()
	repo.admins["13800138000"] = &biz.AdminUser{
		ID:           1,
		Username:     "sms-admin",
		Phone:        "13800138000",
		IsSuperAdmin: true,
	}

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	adminAuthUC := biz.NewAdminAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok-admin-sms", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:         log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		adminAuthUC: adminAuthUC,
	}

	params, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
		"scope": "admin",
	})
	_, res, err := j.handleAuth(context.Background(), "send_sms_code", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected code=0, got %+v", res)
	}
	code, _ := res.Data.AsMap()["mock_code"].(string)
	if code == "" {
		t.Fatalf("expected mock code in response")
	}

	loginParams, _ := structpb.NewStruct(map[string]any{
		"phone": "13800138000",
		"code":  code,
		"scope": "admin",
	})
	_, res, err = j.handleAuth(context.Background(), "sms_login", "2", loginParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected code=0, got %+v", res)
	}
	if res.Data.AsMap()["access_token"] != "tok-admin-sms" {
		t.Fatalf("expected access_token=tok-admin-sms, got %v", res.Data.AsMap()["access_token"])
	}
	data := res.Data.AsMap()
	if data["is_super_admin"] != true {
		t.Fatalf("expected is_super_admin=true in admin sms login response, got %#v", data["is_super_admin"])
	}
	if _, ok := data["permissions"].([]any); !ok {
		t.Fatalf("expected permissions in admin sms login response, got %#v", data["permissions"])
	}
	if _, ok := data["menus"].([]any); !ok {
		t.Fatalf("expected menus in admin sms login response, got %#v", data["menus"])
	}
}

func TestJsonrpcData_AuthLogout(t *testing.T) {
	repo := newMemAuthRepoForData()

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{})

	_, res, err := j.handleAuth(context.Background(), "logout", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != 0 {
		t.Fatalf("expected code=0, got %+v", res)
	}
}

func TestJsonrpcData_AuthUnknownMethod(t *testing.T) {
	repo := newMemAuthRepoForData()

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	authUC := biz.NewAuthUsecase(repo, func(int, string, int8) (string, time.Time, error) {
		return "tok", time.Now().Add(time.Hour), nil
	}, logger, tp)

	j := &JsonrpcData{
		log:    log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
		authUC: authUC,
	}

	params, _ := structpb.NewStruct(map[string]any{})

	_, res, err := j.handleAuth(context.Background(), "unknown", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code == 0 {
		t.Fatalf("expected non-zero code for unknown method, got %+v", res)
	}
	if res.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected code=%d, got %d", errcode.UnknownMethod.Code, res.Code)
	}
}

// ====== 内部：最小 mem repo（data 包里实现 biz.AuthRepo）======

type memAuthRepoForData struct {
	mu         sync.Mutex
	users      map[string]*biz.User
	nextUserID int
}

func newMemAuthRepoForData() *memAuthRepoForData {
	return &memAuthRepoForData{
		users:      make(map[string]*biz.User),
		nextUserID: 1,
	}
}

func (r *memAuthRepoForData) putUser(username, password string, disabled bool) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.users[username] = &biz.User{
		ID:           r.nextUserID,
		Username:     username,
		PasswordHash: string(hash),
		Disabled:     disabled,
		Role:         0,
	}
	r.nextUserID++
	return nil
}

// ====== biz.AuthRepo 实现 ======
func (r *memAuthRepoForData) GetUserByUsername(ctx context.Context, username string) (*biz.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u := r.users[username]
	if u == nil {
		return nil, errors.New("not found")
	}
	cp := *u
	return &cp, nil
}

func (r *memAuthRepoForData) GetUserByID(ctx context.Context, id int) (*biz.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, u := range r.users {
		if u.ID == id {
			cp := *u
			return &cp, nil
		}
	}
	return nil, errors.New("not found")
}

func (r *memAuthRepoForData) CreateUser(ctx context.Context, u *biz.User) (*biz.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.users[u.Username]; ok {
		return nil, errors.New("duplicate username")
	}
	cp := *u
	cp.ID = r.nextUserID
	r.nextUserID++
	r.users[cp.Username] = &cp
	return &cp, nil
}

func (r *memAuthRepoForData) UpdateUserLastLogin(ctx context.Context, id int, t time.Time) error {
	// 测试中不需要实现
	return nil
}

type memAdminAuthRepoForData struct {
	mu         sync.Mutex
	admins     map[string]*biz.AdminUser
	lastLogins map[int]time.Time
}

func newMemAdminAuthRepoForData() *memAdminAuthRepoForData {
	return &memAdminAuthRepoForData{
		admins:     make(map[string]*biz.AdminUser),
		lastLogins: make(map[int]time.Time),
	}
}

func (r *memAdminAuthRepoForData) GetAdminByUsername(ctx context.Context, username string) (*biz.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	admin := r.admins[username]
	if admin == nil {
		return nil, errors.New("not found")
	}
	cp := *admin
	cp.Roles = append([]biz.AdminRole(nil), admin.Roles...)
	cp.Permissions = append([]string(nil), admin.Permissions...)
	return &cp, nil
}

func (r *memAdminAuthRepoForData) GetAdminByPhone(ctx context.Context, phone string) (*biz.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, admin := range r.admins {
		if admin.Phone == phone {
			cp := *admin
			cp.Roles = append([]biz.AdminRole(nil), admin.Roles...)
			cp.Permissions = append([]string(nil), admin.Permissions...)
			return &cp, nil
		}
	}
	return nil, errors.New("not found")
}

func (r *memAdminAuthRepoForData) UpdateAdminLastLogin(ctx context.Context, id int, t time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lastLogins[id] = t
	return nil
}
