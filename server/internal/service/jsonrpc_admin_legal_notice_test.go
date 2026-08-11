package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"google.golang.org/protobuf/types/known/structpb"
)

func newLegalNoticeDispatcher(t *testing.T) (*jsonrpcDispatcher, *memAdminManageRepoForData, context.Context) {
	t.Helper()
	repo := newMemAdminManageRepoForData()
	repo.admins[1] = &biz.AdminUser{ID: 1, Username: "worker"}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.legal_notice.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "worker",
		Role:     biz.RoleAdmin,
	})
	return dispatcher, repo, ctx
}

func legalNoticeParams(t *testing.T, fingerprint string) *structpb.Struct {
	t.Helper()
	params, err := structpb.NewStruct(map[string]any{
		"notice_version":      "2026-08-11.1",
		"content_fingerprint": fingerprint,
	})
	if err != nil {
		t.Fatalf("structpb.NewStruct() error = %v", err)
	}
	return params
}

func TestJsonrpcDispatcher_LegalNoticeStatusAndAcknowledgement(t *testing.T) {
	dispatcher, repo, ctx := newLegalNoticeDispatcher(t)
	params := legalNoticeParams(t, "0123456789abcdef")

	_, before, err := dispatcher.handleAdmin(ctx, "legal_notice_status", "1", params)
	if err != nil || before.Code != errcode.OK.Code {
		t.Fatalf("status before = %#v, err = %v", before, err)
	}
	if before.Data.AsMap()["acknowledged"] != false {
		t.Fatalf("unexpected status before = %#v", before.Data.AsMap())
	}

	_, saved, err := dispatcher.handleAdmin(ctx, "acknowledge_legal_notice", "2", params)
	if err != nil || saved.Code != errcode.OK.Code {
		t.Fatalf("acknowledgement = %#v, err = %v", saved, err)
	}
	if saved.Data.AsMap()["acknowledged"] != true || len(repo.auditLogs) != 1 {
		t.Fatalf("unexpected saved data = %#v, events = %d", saved.Data.AsMap(), len(repo.auditLogs))
	}

	_, after, err := dispatcher.handleAdmin(ctx, "legal_notice_status", "3", params)
	if err != nil || after.Data.AsMap()["acknowledged"] != true {
		t.Fatalf("status after = %#v, err = %v", after, err)
	}
}

func TestJsonrpcDispatcher_LegalNoticeRejectsInvalidOrExtraParams(t *testing.T) {
	dispatcher, _, ctx := newLegalNoticeDispatcher(t)
	invalid := legalNoticeParams(t, "bad")
	_, result, err := dispatcher.handleAdmin(ctx, "legal_notice_status", "1", invalid)
	if err != nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("invalid identity result = %#v, err = %v", result, err)
	}

	extra, err := structpb.NewStruct(map[string]any{
		"notice_version":      "2026-08-11.1",
		"content_fingerprint": "0123456789abcdef",
		"phone":               "13800138000",
	})
	if err != nil {
		t.Fatalf("structpb.NewStruct() error = %v", err)
	}
	_, result, err = dispatcher.handleAdmin(ctx, "acknowledge_legal_notice", "2", extra)
	if err != nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("extra param result = %#v, err = %v", result, err)
	}
}
