package service

import (
	"context"
	"io"
	"reflect"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type stubAttachmentJSONRPCRepo struct {
	created     *biz.BusinessAttachmentCreate
	current     *biz.BusinessAttachment
	ownerExists bool
	createCalls int
	listCalls   int
	getCalls    int
	deleteCalls int
}

func newAttachmentJSONRPCTestDispatcher(t *testing.T, repo *stubAttachmentJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	if repo == nil {
		repo = &stubAttachmentJSONRPCRepo{}
	}
	repo.ownerExists = true
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.attachment.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		attachmentUC:     biz.NewBusinessAttachmentUsecase(repo),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func (r *stubAttachmentJSONRPCRepo) CreateBusinessAttachment(_ context.Context, in *biz.BusinessAttachmentCreate) (*biz.BusinessAttachment, error) {
	r.createCalls++
	r.created = in
	now := time.Unix(1, 0)
	return &biz.BusinessAttachment{
		ID:             101,
		OwnerType:      in.OwnerType,
		OwnerID:        in.OwnerID,
		AttachmentType: in.AttachmentType,
		SlotKey:        in.SlotKey,
		FileName:       in.FileName,
		MimeType:       in.MimeType,
		FileSize:       in.FileSize,
		SHA256:         in.SHA256,
		Content:        in.Content,
		UploadedBy:     in.UploadedBy,
		Note:           in.Note,
		CreatedAt:      now,
	}, nil
}

func (r *stubAttachmentJSONRPCRepo) ListBusinessAttachments(_ context.Context, ownerType string, ownerID int) ([]*biz.BusinessAttachment, error) {
	r.listCalls++
	return []*biz.BusinessAttachment{
		{
			ID:             102,
			OwnerType:      ownerType,
			OwnerID:        ownerID,
			AttachmentType: "evidence",
			FileName:       "proof.pdf",
			MimeType:       "application/pdf",
			FileSize:       5,
			SHA256:         "sha",
			CreatedAt:      time.Unix(2, 0),
		},
	}, nil
}

func (r *stubAttachmentJSONRPCRepo) GetBusinessAttachment(_ context.Context, id int) (*biz.BusinessAttachment, error) {
	r.getCalls++
	if r.current != nil {
		return r.current, nil
	}
	return &biz.BusinessAttachment{
		ID:             id,
		OwnerType:      biz.BusinessAttachmentOwnerSalesOrder,
		OwnerID:        7,
		AttachmentType: "evidence",
		FileName:       "proof.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         "sha",
		Content:        []byte("proof"),
		CreatedAt:      time.Unix(3, 0),
	}, nil
}

func (r *stubAttachmentJSONRPCRepo) DeleteBusinessAttachment(context.Context, int) error {
	r.deleteCalls++
	return nil
}

func (r *stubAttachmentJSONRPCRepo) BusinessAttachmentOwnerExists(context.Context, string, int) (bool, error) {
	return r.ownerExists, nil
}

func TestBusinessAttachmentOwnerModuleKeys(t *testing.T) {
	cases := []struct {
		ownerType string
		want      []string
	}{
		{biz.BusinessAttachmentOwnerSalesOrder, []string{"sales_orders"}},
		{biz.BusinessAttachmentOwnerPurchaseOrder, []string{"purchase_orders"}},
		{biz.BusinessAttachmentOwnerOutsourcingOrder, []string{"outsourcing_orders"}},
		{biz.BusinessAttachmentOwnerPurchaseReceipt, []string{"purchase_receipts"}},
		{biz.BusinessAttachmentOwnerQualityInspection, []string{"quality_inspections"}},
		{biz.BusinessAttachmentOwnerShipment, []string{"shipments"}},
		{biz.BusinessAttachmentOwnerFinanceFact, []string{"finance"}},
		{biz.BusinessAttachmentOwnerProductionFact, []string{"production"}},
		{biz.BusinessAttachmentOwnerOutsourcingFact, []string{"outsourcing_orders"}},
		{biz.BusinessAttachmentOwnerProductSKU, []string{"products"}},
		{biz.BusinessAttachmentOwnerBOMHeader, []string{"material_bom"}},
		{biz.BusinessAttachmentOwnerWorkflowTask, []string{"workflow_tasks"}},
	}
	for _, tc := range cases {
		if got := businessAttachmentOwnerModuleKeys(tc.ownerType); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("owner %s module keys = %#v, want %#v", tc.ownerType, got, tc.want)
		}
	}
	if got := businessAttachmentOwnerModuleKeys("unknown"); got != nil {
		t.Fatalf("unknown owner module keys = %#v, want nil", got)
	}
}

func TestJsonrpcDispatcher_AttachmentWriteAPIRequiresOwnerModuleEnabled(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderCreate,
		biz.PermissionSalesOrderUpdate,
	)
	repo := &stubAttachmentJSONRPCRepo{}
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, admin)

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.attachment-sales-read-only",
		"sales_orders",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, dispatcher, readOnlyConfig)

	uploadParams := mustJSONRPCStruct(t, map[string]any{
		"owner_type":      biz.BusinessAttachmentOwnerSalesOrder,
		"owner_id":        7,
		"attachment_type": "evidence",
		"file_name":       "proof.pdf",
		"mime_type":       "application/pdf",
		"content_base64":  "cHJvb2Y=",
	})
	_, uploadRes, err := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "read-only-upload", uploadParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if uploadRes == nil || uploadRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only owner module to reject upload, got %#v", uploadRes)
	}
	if repo.createCalls != 0 {
		t.Fatalf("read_only owner module must not create attachment, got %d calls", repo.createCalls)
	}

	_, listRes, err := dispatcher.handleBusinessAttachment(ctx, "list_attachments", "read-only-list", mustJSONRPCStruct(t, map[string]any{
		"owner_type": biz.BusinessAttachmentOwnerSalesOrder,
		"owner_id":   7,
	}))
	if err != nil {
		t.Fatalf("expected nil err listing historical attachments, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_attachments to remain available for historical read, got %#v", listRes)
	}
	if repo.listCalls != 1 {
		t.Fatalf("expected list repo call, got %d", repo.listCalls)
	}

	_, downloadRes, err := dispatcher.handleBusinessAttachment(ctx, "download_attachment", "read-only-download", mustJSONRPCStruct(t, map[string]any{"id": 102}))
	if err != nil {
		t.Fatalf("expected nil err downloading historical attachment, got %v", err)
	}
	if downloadRes == nil || downloadRes.Code != errcode.OK.Code {
		t.Fatalf("expected download_attachment to remain available for historical read, got %#v", downloadRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.attachment-sales-enabled",
		"sales_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, dispatcher, enabledConfig)
	_, uploadRes, err = dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "enabled-upload", uploadParams)
	if err != nil {
		t.Fatalf("expected nil err uploading with enabled owner module, got %v", err)
	}
	if uploadRes == nil || uploadRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled owner module upload OK, got %#v", uploadRes)
	}
	if repo.createCalls != 1 {
		t.Fatalf("expected one upload create call, got %d", repo.createCalls)
	}

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.attachment-sales-disabled",
		"sales_orders",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, dispatcher, disabledConfig)
	_, deleteRes, err := dispatcher.handleBusinessAttachment(ctx, "delete_attachment", "disabled-delete", mustJSONRPCStruct(t, map[string]any{"id": 101}))
	if err != nil {
		t.Fatalf("expected nil err deleting with disabled owner module, got %v", err)
	}
	if deleteRes == nil || deleteRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled owner module to reject delete, got %#v", deleteRes)
	}
	if repo.deleteCalls != 0 {
		t.Fatalf("disabled owner module must not delete attachment, got %d calls", repo.deleteCalls)
	}
}
