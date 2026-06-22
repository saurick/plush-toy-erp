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

func TestBusinessAttachmentUploadRejectsTooLargeContent(t *testing.T) {
	uc := NewBusinessAttachmentUsecase(&stubBusinessAttachmentRepo{ownerExists: true})

	_, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:     "sales_order",
		OwnerID:       7,
		FileName:      "large.txt",
		MimeType:      "text/plain",
		ContentBase64: base64.StdEncoding.EncodeToString(make([]byte, BusinessAttachmentMaxBytes+1)),
	})
	if !errors.Is(err, ErrBusinessAttachmentTooLarge) {
		t.Fatalf("expected size error, got %v", err)
	}
}
