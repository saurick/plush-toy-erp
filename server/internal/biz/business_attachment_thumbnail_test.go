package biz

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestProductImageThumbnailKeepsAspectAndOriginal(t *testing.T) {
	for _, size := range []image.Point{{800, 400}, {80, 200}, {40, 40}} {
		source := image.NewNRGBA(image.Rect(0, 0, size.X, size.Y))
		source.Set(0, 0, color.NRGBA{R: 255, A: 255})
		var input bytes.Buffer
		if err := png.Encode(&input, source); err != nil {
			t.Fatal(err)
		}
		original := append([]byte(nil), input.Bytes()...)
		metadata := &BusinessAttachment{OwnerType: BusinessAttachmentOwnerProduct, AttachmentType: BusinessAttachmentTypeProductImage, MimeType: "image/png"}
		thumb, err := ProductImageThumbnail(metadata, input.Bytes())
		if err != nil {
			t.Fatal(err)
		}
		result, err := png.Decode(bytes.NewReader(thumb))
		if err != nil {
			t.Fatal(err)
		}
		width, height := result.Bounds().Dx(), result.Bounds().Dy()
		if width > 160 || height > 160 || width*size.Y != height*size.X {
			t.Fatalf("unexpected size %dx%d from %v", width, height, size)
		}
		if !bytes.Equal(original, input.Bytes()) {
			t.Fatal("thumbnail mutated original")
		}
	}
}

func TestProductImageThumbnailRejectsEvidenceAndCorruption(t *testing.T) {
	for _, metadata := range []*BusinessAttachment{nil, {OwnerType: BusinessAttachmentOwnerWorkflowTask, AttachmentType: "evidence"}, {OwnerType: BusinessAttachmentOwnerProduct, AttachmentType: BusinessAttachmentTypeProductImage, MimeType: "image/png"}} {
		if _, err := ProductImageThumbnail(metadata, []byte("not an image")); err == nil {
			t.Fatal("invalid thumbnail accepted")
		}
	}
}
