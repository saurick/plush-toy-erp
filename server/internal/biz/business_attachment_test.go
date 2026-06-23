package biz

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
)

type stubBusinessAttachmentRepo struct {
	ownerExists bool
	created     *BusinessAttachmentCreate
}

func (r *stubBusinessAttachmentRepo) CreateBusinessAttachment(_ context.Context, in *BusinessAttachmentCreate) (*BusinessAttachment, error) {
	r.created = in
	return &BusinessAttachment{
		ID:             1,
		OwnerType:      in.OwnerType,
		OwnerID:        in.OwnerID,
		AttachmentType: in.AttachmentType,
		FileName:       in.FileName,
		MimeType:       in.MimeType,
		FileSize:       in.FileSize,
		SHA256:         in.SHA256,
		Content:        in.Content,
	}, nil
}

func (r *stubBusinessAttachmentRepo) ListBusinessAttachments(context.Context, string, int) ([]*BusinessAttachment, error) {
	return nil, nil
}

func (r *stubBusinessAttachmentRepo) GetBusinessAttachment(context.Context, int) (*BusinessAttachment, error) {
	return nil, ErrBusinessAttachmentNotFound
}

func (r *stubBusinessAttachmentRepo) DeleteBusinessAttachment(context.Context, int) error {
	return nil
}

func (r *stubBusinessAttachmentRepo) BusinessAttachmentOwnerExists(context.Context, string, int) (bool, error) {
	return r.ownerExists, nil
}

func TestBusinessAttachmentUploadValidatesOwnerAndContent(t *testing.T) {
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	uc := NewBusinessAttachmentUsecase(repo)

	item, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:     "sales_order",
		OwnerID:       7,
		FileName:      "customer-po.pdf",
		MimeType:      "application/pdf",
		ContentBase64: base64.StdEncoding.EncodeToString([]byte("contract")),
	})
	if err != nil {
		t.Fatalf("upload should pass: %v", err)
	}
	if item.OwnerType != BusinessAttachmentOwnerSalesOrder || item.OwnerID != 7 {
		t.Fatalf("unexpected owner: %#v", item)
	}
	if repo.created == nil || repo.created.FileSize != len("contract") || repo.created.SHA256 == "" {
		t.Fatalf("attachment content metadata not created: %#v", repo.created)
	}
}

func TestBusinessAttachmentUploadAllowsEvidenceMimeTypes(t *testing.T) {
	cases := []struct {
		name     string
		fileName string
		mimeType string
	}{
		{name: "pdf", fileName: "customer-po.pdf", mimeType: "application/pdf"},
		{name: "png", fileName: "现场照片.png", mimeType: "image/png"},
		{name: "jpeg", fileName: "现场照片.jpg", mimeType: "image/jpeg"},
		{name: "webp", fileName: "现场照片.webp", mimeType: "image/webp"},
		{name: "gif", fileName: "动图.gif", mimeType: "image/gif"},
		{name: "heic", fileName: "手机照片.heic", mimeType: "image/heic"},
		{name: "heif", fileName: "手机照片.heif", mimeType: "image/heif"},
		{name: "doc", fileName: "合同.doc", mimeType: "application/msword"},
		{
			name:     "docx",
			fileName: "合同.docx",
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		},
		{name: "xls", fileName: "报价.xls", mimeType: "application/vnd.ms-excel"},
		{
			name:     "xlsx",
			fileName: "报价.xlsx",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		},
		{name: "csv", fileName: "明细.csv", mimeType: "text/csv"},
		{name: "txt", fileName: "说明.txt", mimeType: "text/plain"},
		{name: "zip", fileName: "资料包.zip", mimeType: "application/zip"},
		{name: "zip-windows", fileName: "资料包.zip", mimeType: "application/x-zip-compressed"},
		{name: "eml", fileName: "客户确认.eml", mimeType: "message/rfc822"},
		{name: "msg", fileName: "供应商回复.msg", mimeType: "application/vnd.ms-outlook"},
		{name: "wps", fileName: "合同.wps", mimeType: "application/x-wps-writer"},
		{name: "et", fileName: "报价.et", mimeType: "application/x-wps-spreadsheet"},
		{name: "dps", fileName: "方案.dps", mimeType: "application/x-wps-presentation"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			uc := NewBusinessAttachmentUsecase(repo)

			item, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
				OwnerType:     "sales_order",
				OwnerID:       7,
				FileName:      tc.fileName,
				MimeType:      tc.mimeType,
				ContentBase64: base64.StdEncoding.EncodeToString([]byte("evidence")),
			})
			if err != nil {
				t.Fatalf("upload should pass: %v", err)
			}
			if item.MimeType != tc.mimeType {
				t.Fatalf("unexpected mime type: %s", item.MimeType)
			}
		})
	}
}

func TestBusinessAttachmentUploadRejectsMissingOwner(t *testing.T) {
	uc := NewBusinessAttachmentUsecase(&stubBusinessAttachmentRepo{})

	_, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:     "sales_order",
		OwnerID:       7,
		FileName:      "customer-po.pdf",
		MimeType:      "application/pdf",
		ContentBase64: base64.StdEncoding.EncodeToString([]byte("contract")),
	})
	if !errors.Is(err, ErrBusinessAttachmentOwnerNotFound) {
		t.Fatalf("expected missing owner, got %v", err)
	}
}

func TestBusinessAttachmentUploadRejectsUnsupportedMime(t *testing.T) {
	uc := NewBusinessAttachmentUsecase(&stubBusinessAttachmentRepo{ownerExists: true})

	_, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:     "sales_order",
		OwnerID:       7,
		FileName:      "payload.bin",
		MimeType:      "application/octet-stream",
		ContentBase64: base64.StdEncoding.EncodeToString([]byte("payload")),
	})
	if !errors.Is(err, ErrBusinessAttachmentMimeNotAllowed) {
		t.Fatalf("expected mime error, got %v", err)
	}
}

func TestBusinessAttachmentUploadRejectsMismatchedExtensionAndMime(t *testing.T) {
	uc := NewBusinessAttachmentUsecase(&stubBusinessAttachmentRepo{ownerExists: true})

	_, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:     "sales_order",
		OwnerID:       7,
		FileName:      "payload.exe",
		MimeType:      "application/pdf",
		ContentBase64: base64.StdEncoding.EncodeToString([]byte("payload")),
	})
	if !errors.Is(err, ErrBusinessAttachmentMimeNotAllowed) {
		t.Fatalf("expected mime error, got %v", err)
	}
}

func TestBusinessAttachmentContentRejectsTooLargeContent(t *testing.T) {
	_, err := decodeBusinessAttachmentContentWithMax(
		base64.StdEncoding.EncodeToString([]byte("too-large")),
		len("too"),
	)
	if !errors.Is(err, ErrBusinessAttachmentTooLarge) {
		t.Fatalf("expected size error, got %v", err)
	}
}
