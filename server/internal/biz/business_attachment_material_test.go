package biz

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/png"
	"testing"
)

func (r *stubBusinessAttachmentRepo) ListMaterialImageReferences(ctx context.Context, ids []int) (map[int]int, error) {
	return r.ListProductImageReferences(ctx, ids)
}

func (r *stubBusinessAttachmentRepo) ClearMaterialImage(context.Context, int, int) error {
	r.clearCalls++
	return nil
}

func TestBusinessAttachmentMaterialReferenceImageContract(t *testing.T) {
	ctx := context.Background()
	var content bytes.Buffer
	if err := png.Encode(&content, image.NewNRGBA(image.Rect(0, 0, 480, 240))); err != nil {
		t.Fatal(err)
	}
	primary, secondary := BusinessAttachmentProductImageSlotPrimary, BusinessAttachmentProductImageSlotSecondary
	base := BusinessAttachmentUploadInput{
		OwnerType: BusinessAttachmentOwnerMaterial, OwnerID: 7, AttachmentType: BusinessAttachmentTypeMaterialImage,
		SlotKey: &primary, FileName: "fabric.png", MimeType: "image/png", ContentBase64: base64.StdEncoding.EncodeToString(content.Bytes()),
	}
	for _, tt := range []struct {
		name   string
		change func(*BusinessAttachmentUploadInput)
		want   error
	}{
		{"product owner cannot receive material media", func(in *BusinessAttachmentUploadInput) { in.OwnerType = BusinessAttachmentOwnerProduct }, ErrBadParam},
		{"material has one slot", func(in *BusinessAttachmentUploadInput) { in.SlotKey = &secondary }, ErrBadParam},
		{"ordinary evidence cannot use an image slot", func(in *BusinessAttachmentUploadInput) { in.AttachmentType = "evidence" }, ErrBadParam},
		{"pdf cannot occupy the image slot", func(in *BusinessAttachmentUploadInput) { in.FileName, in.MimeType = "spec.pdf", "application/pdf" }, ErrBusinessAttachmentMimeNotAllowed},
		{"image contents must decode", func(in *BusinessAttachmentUploadInput) { in.ContentBase64 = "bm90IGFuIGltYWdl" }, ErrBusinessAttachmentContentInvalid},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := base
			tt.change(&in)
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			if _, err := NewBusinessAttachmentUsecase(repo).UploadBusinessAttachment(ctx, &in); !errors.Is(err, tt.want) || repo.created != nil {
				t.Fatalf("write was not rejected: %v", err)
			}
		})
	}
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	uc := NewBusinessAttachmentUsecase(repo)
	saved, err := uc.UploadBusinessAttachment(ctx, &base)
	if err != nil {
		t.Fatal(err)
	}
	thumbnail, err := BusinessAttachmentImageThumbnail(saved, content.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	config, err := png.DecodeConfig(bytes.NewReader(thumbnail))
	if err != nil || config.Width != 160 || config.Height != 80 {
		t.Fatalf("unexpected material thumbnail: %+v, %v", config, err)
	}
	if _, err := uc.WithdrawBusinessAttachment(ctx, &BusinessAttachmentWithdrawInput{Attachment: saved, Reason: "更新图片", WithdrawnBy: 1}); !errors.Is(err, ErrBadParam) || repo.withdrawCalls != 0 {
		t.Fatalf("reference image accepted ordinary withdrawal: %v", err)
	}
}
