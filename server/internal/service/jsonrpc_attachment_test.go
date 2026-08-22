package service

import (
	"context"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

const testAttachmentProofSHA256 = "c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7"

type stubAttachmentJSONRPCRepo struct {
	created       *biz.BusinessAttachmentCreate
	current       *biz.BusinessAttachment
	ownerExists   bool
	createCalls   int
	listCalls     int
	getCalls      int
	contentCalls  int
	withdrawCalls int
	withdrawn     *biz.BusinessAttachmentWithdraw
	withdrawErr   error
	clearCalls    int
	clearProduct  int
	clearSlot     string
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

func newWorkflowAttachmentJSONRPCTestDispatcher(
	t *testing.T,
	repo *stubAttachmentJSONRPCRepo,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
) *jsonrpcDispatcher {
	t.Helper()
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
	dispatcher.workflowUC = biz.NewWorkflowUsecase(&stubWorkflowJSONRPCRepo{currentTask: task})
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
	uploaderID := 7
	uploaderUsername := "demo_boss"
	uploaderDisplayName := "王总"
	return []*biz.BusinessAttachment{
		{
			ID:                    102,
			OwnerType:             ownerType,
			OwnerID:               ownerID,
			AttachmentType:        "evidence",
			FileName:              "proof.pdf",
			MimeType:              "application/pdf",
			FileSize:              5,
			SHA256:                testAttachmentProofSHA256,
			UploadedBy:            &uploaderID,
			UploadedByUsername:    &uploaderUsername,
			UploadedByDisplayName: &uploaderDisplayName,
			CreatedAt:             time.Unix(2, 0),
		},
	}, nil
}

func (r *stubAttachmentJSONRPCRepo) ClearProductImage(_ context.Context, productID int, slotKey string) error {
	r.clearCalls++
	r.clearProduct = productID
	r.clearSlot = slotKey
	return nil
}

func (r *stubAttachmentJSONRPCRepo) GetBusinessAttachmentMetadata(_ context.Context, id int) (*biz.BusinessAttachment, error) {
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
		SHA256:         testAttachmentProofSHA256,
		CreatedAt:      time.Unix(3, 0),
	}, nil
}

func (r *stubAttachmentJSONRPCRepo) GetBusinessAttachmentContent(_ context.Context, _ int, _ string, _ int) ([]byte, error) {
	r.contentCalls++
	if r.current != nil && r.current.Content != nil {
		return append([]byte(nil), r.current.Content...), nil
	}
	return []byte("proof"), nil
}

func (r *stubAttachmentJSONRPCRepo) WithdrawBusinessAttachment(
	_ context.Context,
	in *biz.BusinessAttachmentWithdraw,
) (time.Time, error) {
	r.withdrawCalls++
	r.withdrawn = in
	if r.withdrawErr != nil {
		return time.Time{}, r.withdrawErr
	}
	return time.Unix(4, 0), nil
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
		{biz.BusinessAttachmentOwnerProduct, []string{"products"}},
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

func TestBusinessAttachmentProductOwnerPermissions(t *testing.T) {
	if got := businessAttachmentReadPermissions(biz.BusinessAttachmentOwnerProduct); !reflect.DeepEqual(got, []string{biz.PermissionProductRead}) {
		t.Fatalf("product attachment read permissions = %#v", got)
	}
	if got := businessAttachmentWritePermissions(biz.BusinessAttachmentOwnerProduct); !reflect.DeepEqual(got, []string{biz.PermissionProductUpdate}) {
		t.Fatalf("product attachment write permissions = %#v", got)
	}
	if got := businessAttachmentWritePermissions(biz.BusinessAttachmentOwnerProductSKU); !reflect.DeepEqual(got, []string{biz.PermissionProductSKUCreate, biz.PermissionProductSKUUpdate}) {
		t.Fatalf("product SKU attachment write permissions must remain unchanged: %#v", got)
	}
}

func TestBusinessAttachmentShipmentWritePermissionsIncludeDraftUpdate(t *testing.T) {
	want := []string{
		biz.PermissionShipmentCreate,
		biz.PermissionShipmentUpdate,
		biz.PermissionShipmentShip,
	}
	if got := businessAttachmentWritePermissions(biz.BusinessAttachmentOwnerShipment); !reflect.DeepEqual(got, want) {
		t.Fatalf("shipment attachment write permissions = %#v, want %#v", got, want)
	}
}

func TestBusinessAttachmentToAnyIncludesReadableUploaderAuditMetadata(t *testing.T) {
	uploaderID := 7
	uploaderUsername := "demo_boss"
	uploaderDisplayName := "王总"
	withdrawnAt := time.Unix(4, 0)
	withdrawnBy := 8
	withdrawnByUsername := "demo_admin"
	withdrawnByDisplayName := "系统管理员"
	withdrawalReason := "上传了错误版本"
	out := businessAttachmentToAny(&biz.BusinessAttachment{
		ID:                     101,
		OwnerType:              biz.BusinessAttachmentOwnerWorkflowTask,
		OwnerID:                42,
		AttachmentType:         "evidence",
		FileName:               "proof.pdf",
		MimeType:               "application/pdf",
		FileSize:               5,
		SHA256:                 "sha",
		UploadedBy:             &uploaderID,
		UploadedByUsername:     &uploaderUsername,
		UploadedByDisplayName:  &uploaderDisplayName,
		WithdrawnAt:            &withdrawnAt,
		WithdrawnBy:            &withdrawnBy,
		WithdrawnByUsername:    &withdrawnByUsername,
		WithdrawnByDisplayName: &withdrawnByDisplayName,
		WithdrawalReason:       &withdrawalReason,
		CreatedAt:              time.Unix(2, 0),
	}, false)
	if out["uploaded_by"] != uploaderID ||
		out["uploaded_by_username"] != uploaderUsername ||
		out["uploaded_by_display_name"] != uploaderDisplayName ||
		out["withdrawn_at"] != int64(4) ||
		out["withdrawn_by"] != withdrawnBy ||
		out["withdrawn_by_username"] != withdrawnByUsername ||
		out["withdrawn_by_display_name"] != withdrawnByDisplayName ||
		out["withdrawal_reason"] != withdrawalReason ||
		out["created_at"] != int64(2) {
		t.Fatalf("attachment audit metadata = %#v", out)
	}

	legacy := businessAttachmentToAny(&biz.BusinessAttachment{
		ID:             102,
		OwnerType:      biz.BusinessAttachmentOwnerWorkflowTask,
		OwnerID:        42,
		AttachmentType: "evidence",
		FileName:       "legacy.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         "sha",
		CreatedAt:      time.Unix(3, 0),
	}, false)
	if legacy["uploaded_by"] != nil || legacy["uploaded_by_username"] != nil || legacy["uploaded_by_display_name"] != nil ||
		legacy["withdrawn_at"] != nil || legacy["withdrawn_by"] != nil ||
		legacy["withdrawn_by_username"] != nil || legacy["withdrawn_by_display_name"] != nil || legacy["withdrawal_reason"] != nil {
		t.Fatalf("legacy attachment uploader metadata must remain missing: %#v", legacy)
	}
}

func TestJsonrpcDispatcher_ProductImageValidationReturnsActionableMessages(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	for _, tc := range []struct {
		name          string
		fileName      string
		mimeType      string
		contentBase64 string
		wantMessage   string
	}{
		{
			name:          "unsupported product image format",
			fileName:      "product.gif",
			mimeType:      "image/gif",
			contentBase64: "R0lGODlhAQABAAAAACw=",
			wantMessage:   "产品图片仅支持 PNG、JPG/JPEG 或 WebP 格式，请重新选择图片",
		},
		{
			name:          "unrecognizable product image content",
			fileName:      "product.png",
			mimeType:      "image/png",
			contentBase64: "bm90LWEtcG5n",
			wantMessage:   "无法识别产品图片内容，请确认文件未损坏，且实际格式与文件扩展名一致",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubAttachmentJSONRPCRepo{}
			dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
				[]string{biz.EngineeringRoleKey},
				biz.PermissionProductUpdate,
			))
			_, res, err := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", tc.name, mustJSONRPCStruct(t, map[string]any{
				"owner_type":      biz.BusinessAttachmentOwnerProduct,
				"owner_id":        7,
				"attachment_type": biz.BusinessAttachmentTypeProductImage,
				"slot_key":        biz.BusinessAttachmentProductImageSlotPrimary,
				"file_name":       tc.fileName,
				"mime_type":       tc.mimeType,
				"content_base64":  tc.contentBase64,
			}))
			if err != nil || res == nil || res.Code != errcode.InvalidParam.Code || res.Message != tc.wantMessage {
				t.Fatalf("product image validation response = %#v, err=%v, want message %q", res, err, tc.wantMessage)
			}
			if repo.createCalls != 0 {
				t.Fatalf("invalid product image must not reach repo, got %d calls", repo.createCalls)
			}
		})
	}
}

func TestJsonrpcDispatcher_ProductImageMessagesDoNotChangeOrdinaryAttachmentErrors(t *testing.T) {
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, nil, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderUpdate,
	))
	ctx := workflowJSONRPCAdminContext()
	for _, ordinaryErr := range []error{
		biz.ErrBusinessAttachmentMimeNotAllowed,
		biz.ErrBusinessAttachmentContentInvalid,
	} {
		res := dispatcher.mapBusinessAttachmentError(ctx, ordinaryErr)
		if res.Code != errcode.InvalidParam.Code || res.Message != errcode.InvalidParam.Message {
			t.Fatalf("ordinary attachment error %v mapped to %#v", ordinaryErr, res)
		}
	}

	dimensionRes := dispatcher.mapBusinessAttachmentError(ctx, biz.ErrBusinessAttachmentProductImageDimensionsInvalid)
	wantDimensionMessage := "产品图片尺寸过大，请将宽高压缩至 8192 像素以内且总像素不超过 2000 万"
	if dimensionRes.Code != errcode.InvalidParam.Code || dimensionRes.Message != wantDimensionMessage {
		t.Fatalf("product image dimension error mapped to %#v", dimensionRes)
	}

	integrityRes := dispatcher.mapBusinessAttachmentError(ctx, biz.ErrBusinessAttachmentIntegrity)
	if integrityRes.Code != errcode.Internal.Code || integrityRes.Message != "附件内容校验失败，请联系管理员" {
		t.Fatalf("stored attachment integrity error mapped to %#v", integrityRes)
	}
}

func TestJsonrpcDispatcher_ProductCreatePermissionCannotMutateSavedProductImages(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &stubAttachmentJSONRPCRepo{}
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionProductCreate,
	))
	primary := biz.BusinessAttachmentProductImageSlotPrimary
	uploadParams := mustJSONRPCStruct(t, map[string]any{
		"owner_type":      biz.BusinessAttachmentOwnerProduct,
		"owner_id":        7,
		"attachment_type": biz.BusinessAttachmentTypeProductImage,
		"slot_key":        primary,
		"file_name":       "product.png",
		"mime_type":       "image/png",
		"content_base64":  "aW1hZ2U=",
	})
	_, uploadRes, err := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "create-only-upload", uploadParams)
	if err != nil || uploadRes == nil || uploadRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("product.create must not upload to saved product: res=%#v err=%v", uploadRes, err)
	}
	if repo.createCalls != 0 {
		t.Fatalf("create-only upload must not reach repo, got %d calls", repo.createCalls)
	}

	_, clearRes, err := dispatcher.handleBusinessAttachment(ctx, "clear_product_image", "create-only-clear", mustJSONRPCStruct(t, map[string]any{
		"owner_id": 7,
		"slot_key": primary,
	}))
	if err != nil || clearRes == nil || clearRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("product.create must not clear saved product image: res=%#v err=%v", clearRes, err)
	}
	if repo.clearCalls != 0 {
		t.Fatalf("create-only clear must not reach repo, got %d calls", repo.clearCalls)
	}
}

func TestJsonrpcDispatcher_ClearProductImageUsesControlledProductBoundary(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &stubAttachmentJSONRPCRepo{}
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionProductUpdate,
	))

	_, res, err := dispatcher.handleBusinessAttachment(ctx, "clear_product_image", "clear-product-image", mustJSONRPCStruct(t, map[string]any{
		"owner_id": 7,
		"slot_key": " PRIMARY ",
	}))
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("clear product image failed: res=%#v err=%v", res, err)
	}
	if res.Data == nil || res.Data.AsMap()["cleared"] != true {
		t.Fatalf("clear product image response = %#v", res.Data)
	}
	if repo.clearCalls != 1 || repo.clearProduct != 7 || repo.clearSlot != biz.BusinessAttachmentProductImageSlotPrimary {
		t.Fatalf("unexpected clear call: calls=%d product=%d slot=%q", repo.clearCalls, repo.clearProduct, repo.clearSlot)
	}

	_, invalidRes, err := dispatcher.handleBusinessAttachment(ctx, "clear_product_image", "invalid-slot", mustJSONRPCStruct(t, map[string]any{
		"owner_id": 7,
		"slot_key": "gallery",
	}))
	if err != nil || invalidRes == nil || invalidRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("invalid product image slot must fail closed: res=%#v err=%v", invalidRes, err)
	}
	if repo.clearCalls != 1 {
		t.Fatalf("invalid slot must not reach repo, got %d calls", repo.clearCalls)
	}

	readOnlyRepo := &stubAttachmentJSONRPCRepo{}
	readOnlyDispatcher := newAttachmentJSONRPCTestDispatcher(t, readOnlyRepo, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionProductRead,
	))
	_, deniedRes, err := readOnlyDispatcher.handleBusinessAttachment(ctx, "clear_product_image", "read-only", mustJSONRPCStruct(t, map[string]any{
		"owner_id": 7,
		"slot_key": biz.BusinessAttachmentProductImageSlotSecondary,
	}))
	if err != nil || deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("product read permission must not clear image: res=%#v err=%v", deniedRes, err)
	}
	if readOnlyRepo.clearCalls != 0 {
		t.Fatalf("unauthorized clear must not reach repo, got %d calls", readOnlyRepo.clearCalls)
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
	repo.current = &biz.BusinessAttachment{
		ID:             101,
		OwnerType:      biz.BusinessAttachmentOwnerSalesOrder,
		OwnerID:        7,
		AttachmentType: "evidence",
		FileName:       "proof.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         testAttachmentProofSHA256,
		CreatedAt:      time.Unix(3, 0),
	}
	_, withdrawRes, err := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "disabled-withdraw", mustJSONRPCStruct(t, map[string]any{
		"id":     101,
		"reason": "上传错误",
	}))
	if err != nil || withdrawRes == nil || withdrawRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("disabled owner module must reject attachment withdrawal: res=%#v err=%v", withdrawRes, err)
	}
	if repo.withdrawCalls != 0 {
		t.Fatalf("disabled owner module must not withdraw attachment, got %d calls", repo.withdrawCalls)
	}
	_, deleteRes, err := dispatcher.handleBusinessAttachment(ctx, "delete_attachment", "disabled-delete", mustJSONRPCStruct(t, map[string]any{"id": 101}))
	if err != nil {
		t.Fatalf("expected nil err deleting with disabled owner module, got %v", err)
	}
	if deleteRes == nil || deleteRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("ordinary attachment delete must remain unavailable, got %#v", deleteRes)
	}
	if repo.withdrawCalls != 0 {
		t.Fatalf("unknown delete method must not withdraw attachment, got %d calls", repo.withdrawCalls)
	}
}

func TestJsonrpcDispatcher_WithdrawAttachmentUsesSessionActorAndReturnsAuditReceipt(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
		ID:             101,
		OwnerType:      biz.BusinessAttachmentOwnerSalesOrder,
		OwnerID:        7,
		AttachmentType: "evidence",
		FileName:       "wrong.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         testAttachmentProofSHA256,
		CreatedAt:      time.Unix(3, 0),
	}}
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderUpdate,
	)
	admin.DisplayName = "系统管理员"
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, admin)

	_, res, err := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "withdraw", mustJSONRPCStruct(t, map[string]any{
		"id":           101,
		"reason":       "  上传了错误版本  ",
		"withdrawn_by": 999,
		"owner_type":   biz.BusinessAttachmentOwnerProduct,
		"owner_id":     999,
	}))
	if err != nil || res == nil || res.Code != errcode.OK.Code || res.Data == nil {
		t.Fatalf("withdraw attachment failed: res=%#v err=%v", res, err)
	}
	if repo.withdrawCalls != 1 || repo.withdrawn == nil || repo.withdrawn.WithdrawnBy != 7 ||
		repo.withdrawn.Reason != "上传了错误版本" {
		t.Fatalf("withdrawal must use session actor and normalized reason: calls=%d input=%#v", repo.withdrawCalls, repo.withdrawn)
	}
	out := res.Data.AsMap()["attachment"].(map[string]any)
	if out["withdrawn_by"] != float64(7) || out["withdrawn_by_username"] != "admin" ||
		out["withdrawn_by_display_name"] != "系统管理员" ||
		out["withdrawal_reason"] != "上传了错误版本" || out["withdrawn_at"] != float64(4) {
		t.Fatalf("withdrawal receipt = %#v", out)
	}
	withdrawnAt := time.Unix(4, 0)
	withdrawnBy := 7
	reason := "上传了错误版本"
	repo.current.WithdrawnAt = &withdrawnAt
	repo.current.WithdrawnBy = &withdrawnBy
	repo.current.WithdrawalReason = &reason
	_, replayRes, _ := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "withdraw-replay", mustJSONRPCStruct(t, map[string]any{
		"id": 101, "reason": " 上传了错误版本 ",
	}))
	if replayRes.Code != errcode.OK.Code || repo.withdrawCalls != 1 {
		t.Fatalf("exact retry must replay stored receipt: res=%#v calls=%d", replayRes, repo.withdrawCalls)
	}
	_, changedRes, _ := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "withdraw-changed", mustJSONRPCStruct(t, map[string]any{
		"id": 101, "reason": "另一个原因",
	}))
	if changedRes.Code != errcode.ResourceVersionConflict.Code || repo.withdrawCalls != 1 {
		t.Fatalf("changed retry must conflict without writing: res=%#v calls=%d", changedRes, repo.withdrawCalls)
	}
}

func TestJsonrpcDispatcher_WithdrawAttachmentFailsClosedAtBusinessBoundaries(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	base := &biz.BusinessAttachment{
		ID:             101,
		OwnerType:      biz.BusinessAttachmentOwnerSalesOrder,
		OwnerID:        7,
		AttachmentType: "evidence",
		FileName:       "wrong.pdf",
		MimeType:       "application/pdf",
		FileSize:       5,
		SHA256:         testAttachmentProofSHA256,
		CreatedAt:      time.Unix(3, 0),
	}

	t.Run("read permission cannot withdraw", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{current: base}
		dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
			[]string{biz.SalesRoleKey},
			biz.PermissionSalesOrderRead,
		))
		_, res, _ := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "read-only", mustJSONRPCStruct(t, map[string]any{
			"id": 101, "reason": "上传错误",
		}))
		if res.Code != errcode.PermissionDenied.Code || repo.withdrawCalls != 0 {
			t.Fatalf("read-only withdrawal must fail before write: res=%#v calls=%d", res, repo.withdrawCalls)
		}
	})

	for _, reason := range []any{
		"   ",
		strings.Repeat("错", 256),
		123.0,
		true,
		map[string]any{"text": "上传错误"},
		[]any{"上传错误"},
	} {
		t.Run("invalid reason", func(t *testing.T) {
			repo := &stubAttachmentJSONRPCRepo{current: base}
			dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
				[]string{biz.SalesRoleKey},
				biz.PermissionSalesOrderUpdate,
			))
			_, res, _ := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "invalid-reason", mustJSONRPCStruct(t, map[string]any{
				"id": 101, "reason": reason,
			}))
			if res.Code != errcode.InvalidParam.Code || res.Message != "请填写撤销原因，最多 255 个字" || repo.withdrawCalls != 0 {
				t.Fatalf("invalid reason must fail closed: res=%#v calls=%d", res, repo.withdrawCalls)
			}
		})
	}

	t.Run("product images use replace or clear", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
			ID: 201, OwnerType: biz.BusinessAttachmentOwnerProduct, OwnerID: 7,
			AttachmentType: biz.BusinessAttachmentTypeProductImage,
		}}
		dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
			[]string{biz.EngineeringRoleKey},
			biz.PermissionProductUpdate,
		))
		_, res, _ := dispatcher.handleBusinessAttachment(ctx, "withdraw_attachment", "product-image", mustJSONRPCStruct(t, map[string]any{
			"id": 201, "reason": "不再使用",
		}))
		if res.Code != errcode.InvalidParam.Code || res.Message != "产品图片请使用替换或清空，不支持撤销" || repo.withdrawCalls != 0 {
			t.Fatalf("product image withdrawal must fail closed: res=%#v calls=%d", res, repo.withdrawCalls)
		}
	})
}

func TestJsonrpcDispatcher_WorkflowAttachmentEnforcesTaskRowScope(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	baseTask := &biz.WorkflowTask{
		ID:            42,
		TaskGroup:     "generic",
		SourceType:    "generic-source",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.WarehouseRoleKey,
		Version:       1,
		Payload:       map[string]any{},
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"owner_type":       biz.BusinessAttachmentOwnerWorkflowTask,
		"owner_id":         42,
		"expected_version": 1,
		"attachment_type":  "evidence",
		"file_name":        "proof.pdf",
		"mime_type":        "application/pdf",
		"content_base64":   "cHJvb2Y=",
	})

	t.Run("ready owner may upload", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.OK.Code || repo.createCalls != 1 {
			t.Fatalf("ready owner upload must succeed, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
		if repo.created == nil || repo.created.WorkflowGuard == nil ||
			repo.created.WorkflowGuard.ExpectedVersion != 1 ||
			repo.created.WorkflowGuard.ActorID != admin.ID ||
			repo.created.WorkflowGuard.ActorUsername != admin.Username {
			t.Fatalf("ready owner upload must preserve the row guard, created=%#v", repo.created)
		}
	})

	t.Run("owner missing backend update permission cannot upload", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("owner without backend update permission must be denied, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("blocked boss owner may upload", func(t *testing.T) {
		task := *baseTask
		task.TaskStatusKey = "blocked"
		task.OwnerRoleKey = biz.BossRoleKey
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.BossRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &task)
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.OK.Code || repo.createCalls != 1 {
			t.Fatalf("blocked boss owner upload must succeed, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("blocked exact assignee may upload", func(t *testing.T) {
		task := *baseTask
		task.TaskStatusKey = "blocked"
		admin := workflowJSONRPCAdmin(
			[]string{biz.FinanceRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		assigneeID := admin.ID
		task.AssigneeID = &assigneeID
		repo := &stubAttachmentJSONRPCRepo{}
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &task)
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.OK.Code || repo.createCalls != 1 {
			t.Fatalf("blocked exact assignee upload must succeed, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("wrong owner cannot list or upload", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.SalesRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, listRes, _ := dispatcher.handleBusinessAttachment(ctx, "list_attachments", "list", mustJSONRPCStruct(t, map[string]any{
			"owner_type": biz.BusinessAttachmentOwnerWorkflowTask,
			"owner_id":   42,
		}))
		if listRes.Code != errcode.PermissionDenied.Code || repo.listCalls != 0 {
			t.Fatalf("wrong owner list must be denied before repo access, res=%#v calls=%d", listRes, repo.listCalls)
		}
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("wrong owner upload must be denied before create, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("boss supervisor may read another owner task but cannot upload", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.BossRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, listRes, _ := dispatcher.handleBusinessAttachment(ctx, "list_attachments", "list", mustJSONRPCStruct(t, map[string]any{
			"owner_type": biz.BusinessAttachmentOwnerWorkflowTask,
			"owner_id":   42,
		}))
		if listRes.Code != errcode.OK.Code || repo.listCalls != 1 {
			t.Fatalf("boss supervisor should retain read visibility, res=%#v calls=%d", listRes, repo.listCalls)
		}
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("boss supervisor without row ownership must not upload, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("owner may read assigned-other but cannot write", func(t *testing.T) {
		task := *baseTask
		otherID := 99
		task.AssigneeID = &otherID
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &task)
		_, listRes, _ := dispatcher.handleBusinessAttachment(ctx, "list_attachments", "list", mustJSONRPCStruct(t, map[string]any{
			"owner_type": biz.BusinessAttachmentOwnerWorkflowTask,
			"owner_id":   42,
		}))
		if listRes.Code != errcode.OK.Code {
			t.Fatalf("effective owner role should retain read visibility, got %#v", listRes)
		}
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("assigned-other upload must be denied, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	for _, statusKey := range []string{"done", "rejected", "unknown"} {
		t.Run(statusKey+" task rejects attachment upload", func(t *testing.T) {
			task := *baseTask
			task.TaskStatusKey = statusKey
			repo := &stubAttachmentJSONRPCRepo{}
			admin := workflowJSONRPCAdmin(
				[]string{biz.WarehouseRoleKey},
				biz.PermissionWorkflowTaskRead,
				biz.PermissionWorkflowTaskUpdate,
			)
			dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &task)
			_, uploadRes, _ := dispatcher.handleBusinessAttachment(ctx, "upload_attachment", "upload", params)
			if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
				t.Fatalf("%s task upload must be denied, res=%#v calls=%d", statusKey, uploadRes, repo.createCalls)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowAttachmentUsesTaskConfigRevisionWithoutSuperAdminWriteBypass(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	processID := 11
	nodeID := 12
	ownerPool := "warehouse"
	revision := "rev-a"
	baseTask := &biz.WorkflowTask{
		ID:                    42,
		TaskGroup:             "generic",
		SourceType:            "generic-source",
		SourceID:              1,
		TaskStatusKey:         "blocked",
		OwnerRoleKey:          biz.WarehouseRoleKey,
		OwnerPoolKey:          &ownerPool,
		ConfigRevision:        &revision,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
		Version:               1,
		Payload:               map[string]any{},
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"owner_type":       biz.BusinessAttachmentOwnerWorkflowTask,
		"owner_id":         42,
		"expected_version": 1,
		"attachment_type":  "evidence",
		"file_name":        "proof.pdf",
		"mime_type":        "application/pdf",
		"content_base64":   "cHJvb2Y=",
	})

	t.Run("superseded task revision remains authoritative", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		dispatcher.customerConfigUC = workflowTaskRevisionCustomerConfigUC()

		_, uploadRes, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(), "upload_attachment", "rev-a-upload", params,
		)
		if uploadRes.Code != errcode.OK.Code || repo.createCalls != 1 {
			t.Fatalf("rev-a task upload must not be stranded by active rev-b, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
		if repo.created == nil || repo.created.WorkflowGuard == nil ||
			!reflect.DeepEqual(repo.created.WorkflowGuard.VisibleOwnerRoleKeys, []string{biz.WarehouseRoleKey}) {
			t.Fatalf("repo guard must reuse rev-a owner scope, created=%#v", repo.created)
		}
	})

	t.Run("incomplete runtime anchor fails closed", func(t *testing.T) {
		task := *baseTask
		task.ProcessNodeInstanceID = nil
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &task)
		dispatcher.customerConfigUC = workflowTaskRevisionCustomerConfigUC()

		_, uploadRes, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(), "upload_attachment", "incomplete-anchor-upload", params,
		)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("incomplete runtime anchor must deny upload, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})

	t.Run("super admin keeps read visibility without synthetic owner write", func(t *testing.T) {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.AdminRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		admin.IsSuperAdmin = true
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		dispatcher.customerConfigUC = workflowTaskRevisionCustomerConfigUC()

		_, listRes, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(),
			"list_attachments",
			"super-admin-list",
			mustJSONRPCStruct(t, map[string]any{
				"owner_type": biz.BusinessAttachmentOwnerWorkflowTask,
				"owner_id":   42,
			}),
		)
		if listRes.Code != errcode.OK.Code || repo.listCalls != 1 {
			t.Fatalf("super admin should retain read visibility, res=%#v calls=%d", listRes, repo.listCalls)
		}
		_, uploadRes, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(), "upload_attachment", "super-admin-upload", params,
		)
		if uploadRes.Code != errcode.PermissionDenied.Code || repo.createCalls != 0 {
			t.Fatalf("synthetic super-admin owner role must not authorize upload, res=%#v calls=%d", uploadRes, repo.createCalls)
		}
	})
}

func TestJsonrpcDispatcher_WorkflowAttachmentRequiresExactPositiveVersion(t *testing.T) {
	for _, version := range []any{nil, 0, -1, 1.5, "1"} {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
		)
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, &biz.WorkflowTask{
			ID: 42, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Version: 1,
		})
		params := map[string]any{
			"owner_type": biz.BusinessAttachmentOwnerWorkflowTask,
			"owner_id":   42, "file_name": "proof.pdf", "mime_type": "application/pdf", "content_base64": "cHJvb2Y=",
		}
		if version != nil {
			params["expected_version"] = version
		}
		_, res, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(), "upload_attachment", "strict-version", mustJSONRPCStruct(t, params),
		)
		if res.Code != errcode.InvalidParam.Code || repo.createCalls != 0 {
			t.Fatalf("expected_version=%v must fail before create: res=%#v calls=%d", version, res, repo.createCalls)
		}
	}
}

func TestJsonrpcDispatcher_WorkflowAttachmentWithdrawalReusesTaskWriteGuard(t *testing.T) {
	baseTask := &biz.WorkflowTask{
		ID:            42,
		TaskGroup:     "generic",
		SourceType:    "generic-source",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.WarehouseRoleKey,
		Version:       3,
		Payload:       map[string]any{},
	}
	newRepo := func() *stubAttachmentJSONRPCRepo {
		return &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
			ID:             71,
			OwnerType:      biz.BusinessAttachmentOwnerWorkflowTask,
			OwnerID:        42,
			AttachmentType: "evidence",
			FileName:       "wrong.pdf",
			MimeType:       "application/pdf",
			FileSize:       5,
			SHA256:         testAttachmentProofSHA256,
			CreatedAt:      time.Unix(3, 0),
		}}
	}
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
	)

	t.Run("ready owner withdraws with exact version", func(t *testing.T) {
		repo := newRepo()
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, res, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(),
			"withdraw_attachment",
			"workflow-withdraw",
			mustJSONRPCStruct(t, map[string]any{"id": 71, "reason": "附件传错", "expected_version": 3}),
		)
		if res.Code != errcode.OK.Code || repo.withdrawCalls != 1 || repo.withdrawn == nil ||
			repo.withdrawn.WorkflowGuard == nil || repo.withdrawn.WorkflowGuard.ExpectedVersion != 3 ||
			repo.withdrawn.WorkflowGuard.ActorID != admin.ID {
			t.Fatalf("workflow withdrawal guard = %#v, res=%#v calls=%d", repo.withdrawn, res, repo.withdrawCalls)
		}
	})

	t.Run("missing version fails before write", func(t *testing.T) {
		repo := newRepo()
		dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, admin, baseTask)
		_, res, _ := dispatcher.handleBusinessAttachment(
			workflowJSONRPCAdminContext(),
			"withdraw_attachment",
			"missing-version",
			mustJSONRPCStruct(t, map[string]any{"id": 71, "reason": "附件传错"}),
		)
		if res.Code != errcode.InvalidParam.Code || repo.withdrawCalls != 0 {
			t.Fatalf("missing workflow version must fail closed: res=%#v calls=%d", res, repo.withdrawCalls)
		}
	})

	for _, tc := range []struct {
		name  string
		task  *biz.WorkflowTask
		admin *biz.AdminUser
	}{
		{name: "terminal task", task: func() *biz.WorkflowTask { task := *baseTask; task.TaskStatusKey = "done"; return &task }(), admin: admin},
		{name: "wrong owner", task: baseTask, admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := newRepo()
			dispatcher := newWorkflowAttachmentJSONRPCTestDispatcher(t, repo, tc.admin, tc.task)
			_, res, _ := dispatcher.handleBusinessAttachment(
				workflowJSONRPCAdminContext(),
				"withdraw_attachment",
				tc.name,
				mustJSONRPCStruct(t, map[string]any{"id": 71, "reason": "附件传错", "expected_version": 3}),
			)
			if res.Code != errcode.PermissionDenied.Code || repo.withdrawCalls != 0 {
				t.Fatalf("%s must fail before write: res=%#v calls=%d", tc.name, res, repo.withdrawCalls)
			}
		})
	}
}

func TestJsonrpcDispatcher_DownloadAuthorizesBeforeLoadingContent(t *testing.T) {
	repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
		ID: 71, OwnerType: biz.BusinessAttachmentOwnerSalesOrder, OwnerID: 7,
		FileName: "proof.pdf", MimeType: "application/pdf", FileSize: 5,
	}}
	admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey})
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
	_, res, err := dispatcher.handleBusinessAttachment(
		workflowJSONRPCAdminContext(),
		"download_attachment",
		"unauthorized-download",
		mustJSONRPCStruct(t, map[string]any{"id": 71}),
	)
	if err != nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("download without owner read permission must be denied: res=%#v err=%v", res, err)
	}
	if repo.getCalls != 1 || repo.contentCalls != 0 {
		t.Fatalf("authorization may read metadata but must not load content: metadata=%d content=%d", repo.getCalls, repo.contentCalls)
	}
}

func TestJsonrpcDispatcher_DownloadRejectsWithdrawnAttachmentBeforeLoadingContent(t *testing.T) {
	withdrawnAt := time.Unix(4, 0)
	withdrawnBy := 7
	reason := "上传错误"
	repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
		ID: 71, OwnerType: biz.BusinessAttachmentOwnerSalesOrder, OwnerID: 7,
		FileName: "wrong.pdf", MimeType: "application/pdf", FileSize: 5,
		WithdrawnAt: &withdrawnAt, WithdrawnBy: &withdrawnBy, WithdrawalReason: &reason,
	}}
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
	))
	_, res, err := dispatcher.handleBusinessAttachment(
		workflowJSONRPCAdminContext(),
		"download_attachment",
		"withdrawn-download",
		mustJSONRPCStruct(t, map[string]any{"id": 71}),
	)
	if err != nil || res.Code != errcode.InvalidParam.Code ||
		res.Message != "附件已撤销，不能预览或下载" {
		t.Fatalf("withdrawn attachment download must fail clearly: res=%#v err=%v", res, err)
	}
	if repo.getCalls != 1 || repo.contentCalls != 0 {
		t.Fatalf("withdrawn download must stop before content read: metadata=%d content=%d", repo.getCalls, repo.contentCalls)
	}
}

func TestJsonrpcDispatcher_DownloadFailsClosedOnStoredContentMismatch(t *testing.T) {
	repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{
		ID: 71, OwnerType: biz.BusinessAttachmentOwnerSalesOrder, OwnerID: 7,
		FileName: "proof.pdf", MimeType: "application/pdf", FileSize: 5,
		SHA256: strings.Repeat("0", 64), Content: []byte("proof"),
	}}
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
	)
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
	_, res, err := dispatcher.handleBusinessAttachment(
		workflowJSONRPCAdminContext(),
		"download_attachment",
		"corrupt-download",
		mustJSONRPCStruct(t, map[string]any{"id": 71}),
	)
	if err != nil || res.Code != errcode.Internal.Code || res.Message != "附件内容校验失败，请联系管理员" {
		t.Fatalf("corrupt stored attachment must fail closed: res=%#v err=%v", res, err)
	}
	if repo.getCalls != 1 || repo.contentCalls != 1 {
		t.Fatalf("authorized integrity check must load metadata and content once: metadata=%d content=%d", repo.getCalls, repo.contentCalls)
	}
}

func TestJsonrpcDispatcher_AttachmentMethodsAreCanonicalAndDeleteIsUnavailable(t *testing.T) {
	dispatcher := newAttachmentJSONRPCTestDispatcher(t, &stubAttachmentJSONRPCRepo{}, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderUpdate,
	))
	for _, method := range []string{
		"listAttachments",
		"uploadAttachment",
		"downloadAttachment",
		"get_attachment_content",
		"getAttachmentContent",
		"delete_attachment",
		"deleteAttachment",
		"withdrawAttachment",
		"clearProductImage",
	} {
		_, res, err := dispatcher.handleBusinessAttachment(workflowJSONRPCAdminContext(), method, method, mustJSONRPCStruct(t, map[string]any{}))
		if err != nil || res == nil || res.Code != errcode.UnknownMethod.Code {
			t.Fatalf("method %s must fail closed as unknown, res=%#v err=%v", method, res, err)
		}
	}
}
