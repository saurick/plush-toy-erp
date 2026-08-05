package biz

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
	"time"
)

type stubBusinessAttachmentRepo struct {
	ownerExists   bool
	created       *BusinessAttachmentCreate
	current       *BusinessAttachment
	contentCalls  int
	withdrawCalls int
	withdrawn     *BusinessAttachmentWithdraw
	withdrawErr   error
	withdrawnAt   time.Time
	clearCalls    int
	clearProduct  int
	clearSlot     string
	content       []byte
}

func (r *stubBusinessAttachmentRepo) CreateBusinessAttachment(_ context.Context, in *BusinessAttachmentCreate) (*BusinessAttachment, error) {
	r.created = in
	return &BusinessAttachment{
		ID:             1,
		OwnerType:      in.OwnerType,
		OwnerID:        in.OwnerID,
		AttachmentType: in.AttachmentType,
		SlotKey:        in.SlotKey,
		FileName:       in.FileName,
		MimeType:       in.MimeType,
		FileSize:       in.FileSize,
		SHA256:         in.SHA256,
		Content:        in.Content,
	}, nil
}

func (r *stubBusinessAttachmentRepo) ClearProductImage(_ context.Context, productID int, slotKey string) error {
	r.clearCalls++
	r.clearProduct = productID
	r.clearSlot = slotKey
	return nil
}

func (r *stubBusinessAttachmentRepo) ListBusinessAttachments(context.Context, string, int) ([]*BusinessAttachment, error) {
	return nil, nil
}

func (r *stubBusinessAttachmentRepo) GetBusinessAttachmentMetadata(context.Context, int) (*BusinessAttachment, error) {
	if r.current != nil {
		return r.current, nil
	}
	return nil, ErrBusinessAttachmentNotFound
}

func (r *stubBusinessAttachmentRepo) GetBusinessAttachmentContent(context.Context, int, string, int) ([]byte, error) {
	r.contentCalls++
	if r.content != nil {
		return append([]byte(nil), r.content...), nil
	}
	return []byte("proof"), nil
}

func (r *stubBusinessAttachmentRepo) WithdrawBusinessAttachment(
	_ context.Context,
	in *BusinessAttachmentWithdraw,
) (time.Time, error) {
	r.withdrawCalls++
	r.withdrawn = in
	if r.withdrawErr != nil {
		return time.Time{}, r.withdrawErr
	}
	if r.withdrawnAt.IsZero() {
		r.withdrawnAt = time.Unix(1_750_000_000, 0)
	}
	return r.withdrawnAt, nil
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

func TestBusinessAttachmentUploadAcceptsOnlyControlledProductImageSlotsAndFormats(t *testing.T) {
	cases := []struct {
		name     string
		slotKey  string
		fileName string
		mimeType string
	}{
		{name: "primary png", slotKey: " PRIMARY ", fileName: "正面.png", mimeType: "image/png"},
		{name: "secondary jpeg", slotKey: "secondary", fileName: "侧面.jpeg", mimeType: "image/jpeg"},
		{name: "primary webp", slotKey: "primary", fileName: "背面.webp", mimeType: "image/webp"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			uc := NewBusinessAttachmentUsecase(repo)
			item, err := uc.UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
				OwnerType:      BusinessAttachmentOwnerProduct,
				OwnerID:        7,
				AttachmentType: BusinessAttachmentTypeProductImage,
				SlotKey:        &tc.slotKey,
				FileName:       tc.fileName,
				MimeType:       tc.mimeType,
				ContentBase64:  base64.StdEncoding.EncodeToString(productImageTestContent(t, tc.mimeType, 1, 1)),
			})
			if err != nil {
				t.Fatalf("product image upload should pass: %v", err)
			}
			if item.SlotKey == nil || !IsBusinessAttachmentProductImageSlotAllowed(*item.SlotKey) {
				t.Fatalf("unexpected normalized product image slot: %#v", item)
			}
		})
	}
}

func productImageTestContent(t *testing.T, mimeType string, width, height int) []byte {
	t.Helper()
	var buffer bytes.Buffer
	switch mimeType {
	case "image/png":
		if err := png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height))); err != nil {
			t.Fatalf("encode PNG fixture: %v", err)
		}
	case "image/jpeg":
		if err := jpeg.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height)), nil); err != nil {
			t.Fatalf("encode JPEG fixture: %v", err)
		}
	case "image/webp":
		if width != 1 || height != 1 {
			t.Fatalf("WebP fixture is fixed at 1x1, got %dx%d", width, height)
		}
		content, err := base64.StdEncoding.DecodeString("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=")
		if err != nil {
			t.Fatalf("decode WebP fixture: %v", err)
		}
		return content
	default:
		t.Fatalf("unsupported fixture mime type %q", mimeType)
	}
	return buffer.Bytes()
}

func truncatedProductImagePNGWithReadableConfig(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	value := uint32(1)
	for i := range img.Pix {
		value = value*1_664_525 + 1_013_904_223
		img.Pix[i] = byte(value >> 24)
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("encode PNG fixture: %v", err)
	}
	content := buffer.Bytes()
	truncated := append([]byte(nil), content[:len(content)/2]...)
	if _, err := png.DecodeConfig(bytes.NewReader(truncated)); err != nil {
		t.Fatalf("truncated PNG must retain a readable config: %v", err)
	}
	if _, err := png.Decode(bytes.NewReader(truncated)); err == nil {
		t.Fatal("truncated PNG must fail full decode")
	}
	return truncated
}

func TestBusinessAttachmentUploadRejectsProductImageContentThatDoesNotMatchDeclaredFormat(t *testing.T) {
	primary := BusinessAttachmentProductImageSlotPrimary
	for _, tc := range []struct {
		name     string
		fileName string
		mimeType string
		content  []byte
	}{
		{name: "html renamed to png", fileName: "product.png", mimeType: "image/png", content: []byte("<html>not an image</html>")},
		{name: "forged png signature", fileName: "product.png", mimeType: "image/png", content: append([]byte("\x89PNG\r\n\x1a\n"), []byte("not-a-png")...)},
		{name: "readable config with truncated png pixels", fileName: "product.png", mimeType: "image/png", content: truncatedProductImagePNGWithReadableConfig(t)},
		{name: "truncated jpeg", fileName: "product.jpg", mimeType: "image/jpeg", content: []byte{0xff, 0xd8, 0xff, 0xdb}},
		{name: "forged webp container", fileName: "product.webp", mimeType: "image/webp", content: []byte{'R', 'I', 'F', 'F', 0x04, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P'}},
		{name: "jpeg declared as png", fileName: "product.png", mimeType: "image/png", content: productImageTestContent(t, "image/jpeg", 2, 2)},
		{name: "png declared as webp", fileName: "product.webp", mimeType: "image/webp", content: productImageTestContent(t, "image/png", 2, 2)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			_, err := NewBusinessAttachmentUsecase(repo).UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
				OwnerType:      BusinessAttachmentOwnerProduct,
				OwnerID:        7,
				AttachmentType: BusinessAttachmentTypeProductImage,
				SlotKey:        &primary,
				FileName:       tc.fileName,
				MimeType:       tc.mimeType,
				ContentBase64:  base64.StdEncoding.EncodeToString(tc.content),
			})
			if !errors.Is(err, ErrBusinessAttachmentProductImageContentInvalid) ||
				!errors.Is(err, ErrBusinessAttachmentContentInvalid) {
				t.Fatalf("error = %v, want invalid content", err)
			}
			if repo.created != nil {
				t.Fatalf("mismatched product image must not reach repo: %#v", repo.created)
			}
		})
	}
}

func TestBusinessAttachmentUploadRejectsMalformedProductImageBase64AsInvalidImageContent(t *testing.T) {
	primary := BusinessAttachmentProductImageSlotPrimary
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	_, err := NewBusinessAttachmentUsecase(repo).UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:      BusinessAttachmentOwnerProduct,
		OwnerID:        7,
		AttachmentType: BusinessAttachmentTypeProductImage,
		SlotKey:        &primary,
		FileName:       "product.png",
		MimeType:       "image/png",
		ContentBase64:  "%%%",
	})
	if !errors.Is(err, ErrBusinessAttachmentProductImageContentInvalid) {
		t.Fatalf("error = %v, want product image content error", err)
	}
	if repo.created != nil {
		t.Fatalf("malformed product image must not reach repo: %#v", repo.created)
	}
}

func TestBusinessAttachmentUploadRejectsProductImageOutsideDimensionBudget(t *testing.T) {
	primary := BusinessAttachmentProductImageSlotPrimary
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	content := productImageTestContent(t, "image/png", BusinessAttachmentProductImageMaxWidth+1, 1)
	_, err := NewBusinessAttachmentUsecase(repo).UploadBusinessAttachment(context.Background(), &BusinessAttachmentUploadInput{
		OwnerType:      BusinessAttachmentOwnerProduct,
		OwnerID:        7,
		AttachmentType: BusinessAttachmentTypeProductImage,
		SlotKey:        &primary,
		FileName:       "product.png",
		MimeType:       "image/png",
		ContentBase64:  base64.StdEncoding.EncodeToString(content),
	})
	if !errors.Is(err, ErrBusinessAttachmentProductImageDimensionsInvalid) {
		t.Fatalf("error = %v, want product image dimension error", err)
	}
	if repo.created != nil {
		t.Fatalf("oversized product image must not reach repo: %#v", repo.created)
	}
}

func TestBusinessAttachmentProductImageDimensionBudgetIsOverflowSafe(t *testing.T) {
	maxInt := int(^uint(0) >> 1)
	for _, tc := range []struct {
		name          string
		width, height int
		want          bool
	}{
		{name: "normal", width: 2000, height: 2000, want: true},
		{name: "exact pixel budget", width: 5000, height: 4000, want: true},
		{name: "over pixel budget", width: 5001, height: 4000, want: false},
		{name: "over width", width: BusinessAttachmentProductImageMaxWidth + 1, height: 1, want: false},
		{name: "over height", width: 1, height: BusinessAttachmentProductImageMaxHeight + 1, want: false},
		{name: "zero", width: 0, height: 1, want: false},
		{name: "negative", width: 1, height: -1, want: false},
		{name: "machine int maximum", width: maxInt, height: maxInt, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isBusinessAttachmentProductImageDimensionsAllowed(tc.width, tc.height); got != tc.want {
				t.Fatalf("dimension %dx%d allowed = %v, want %v", tc.width, tc.height, got, tc.want)
			}
		})
	}
}

func TestBusinessAttachmentUploadRejectsInvalidProductImageContracts(t *testing.T) {
	primary := BusinessAttachmentProductImageSlotPrimary
	invalid := "gallery"
	cases := []struct {
		name    string
		input   BusinessAttachmentUploadInput
		wantErr error
	}{
		{
			name: "product owner requires product image type",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 7, AttachmentType: "evidence", SlotKey: &primary,
				FileName: "正面.png", MimeType: "image/png"},
			wantErr: ErrBadParam,
		},
		{
			name: "product image type requires product owner",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerSalesOrder, OwnerID: 7, AttachmentType: BusinessAttachmentTypeProductImage, SlotKey: &primary,
				FileName: "正面.png", MimeType: "image/png"},
			wantErr: ErrBadParam,
		},
		{
			name: "slot is required",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 7, AttachmentType: BusinessAttachmentTypeProductImage,
				FileName: "正面.png", MimeType: "image/png"},
			wantErr: ErrBadParam,
		},
		{
			name: "slot is fixed",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 7, AttachmentType: BusinessAttachmentTypeProductImage, SlotKey: &invalid,
				FileName: "正面.png", MimeType: "image/png"},
			wantErr: ErrBadParam,
		},
		{
			name: "gif is not a product image",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 7, AttachmentType: BusinessAttachmentTypeProductImage, SlotKey: &primary,
				FileName: "动图.gif", MimeType: "image/gif"},
			wantErr: ErrBusinessAttachmentMimeNotAllowed,
		},
		{
			name: "pdf is not a product image",
			input: BusinessAttachmentUploadInput{OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 7, AttachmentType: BusinessAttachmentTypeProductImage, SlotKey: &primary,
				FileName: "资料.pdf", MimeType: "application/pdf"},
			wantErr: ErrBusinessAttachmentMimeNotAllowed,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tc.input.ContentBase64 = base64.StdEncoding.EncodeToString([]byte("product-image"))
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			_, err := NewBusinessAttachmentUsecase(repo).UploadBusinessAttachment(context.Background(), &tc.input)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if repo.created != nil {
				t.Fatalf("invalid product image must not reach repo: %#v", repo.created)
			}
		})
	}
}

func TestBusinessAttachmentClearProductImageNormalizesAndRestrictsSlot(t *testing.T) {
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	uc := NewBusinessAttachmentUsecase(repo)
	if err := uc.ClearProductImage(context.Background(), 7, " SECONDARY "); err != nil {
		t.Fatalf("clear product image: %v", err)
	}
	if repo.clearCalls != 1 || repo.clearProduct != 7 || repo.clearSlot != BusinessAttachmentProductImageSlotSecondary {
		t.Fatalf("unexpected clear call: calls=%d product=%d slot=%q", repo.clearCalls, repo.clearProduct, repo.clearSlot)
	}
	if err := uc.ClearProductImage(context.Background(), 7, "gallery"); !errors.Is(err, ErrBadParam) {
		t.Fatalf("invalid clear slot error = %v, want bad param", err)
	}
	if repo.clearCalls != 1 {
		t.Fatalf("invalid clear slot must not reach repo, got %d calls", repo.clearCalls)
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

func TestBusinessAttachmentContentChecksEncodedBoundaryBeforeDecode(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("12345"))
	content, err := decodeBusinessAttachmentContentWithMax(encoded, 5)
	if err != nil || string(content) != "12345" {
		t.Fatalf("exact boundary should pass, content=%q err=%v", content, err)
	}
	_, err = decodeBusinessAttachmentContentWithMax(encoded+"AAAA", 5)
	if !errors.Is(err, ErrBusinessAttachmentTooLarge) {
		t.Fatalf("encoded over-limit input should fail before decode, got %v", err)
	}
}

func TestBusinessAttachmentContentAcceptsDataURLAndRejectsMalformedBase64(t *testing.T) {
	content, err := decodeBusinessAttachmentContentWithMax("data:text/plain;base64,cHJvb2Y=", 5)
	if err != nil || string(content) != "proof" {
		t.Fatalf("data URL should decode, content=%q err=%v", content, err)
	}
	_, err = decodeBusinessAttachmentContentWithMax("%%%", 5)
	if !errors.Is(err, ErrBusinessAttachmentContentInvalid) {
		t.Fatalf("malformed base64 should fail, got %v", err)
	}
}

func TestBusinessAttachmentGetRejectsOrphanedAttachment(t *testing.T) {
	repo := &stubBusinessAttachmentRepo{
		ownerExists: false,
		current: &BusinessAttachment{
			ID:        9,
			OwnerType: BusinessAttachmentOwnerWorkflowTask,
			OwnerID:   42,
		},
	}
	_, err := NewBusinessAttachmentUsecase(repo).GetBusinessAttachmentMetadata(context.Background(), 9)
	if !errors.Is(err, ErrBusinessAttachmentOwnerNotFound) {
		t.Fatalf("orphaned attachment must not be returned, got %v", err)
	}
}

func TestBusinessAttachmentWithdrawPersistsNormalizedAuditMetadata(t *testing.T) {
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	uc := NewBusinessAttachmentUsecase(repo)
	item, err := uc.WithdrawBusinessAttachment(context.Background(), &BusinessAttachmentWithdrawInput{
		Attachment: &BusinessAttachment{
			ID:             9,
			OwnerType:      BusinessAttachmentOwnerSalesOrder,
			OwnerID:        42,
			AttachmentType: "evidence",
			FileName:       "wrong.pdf",
			Content:        []byte("proof"),
		},
		Reason:      "  上传了错误版本，改传已签字文件  ",
		WithdrawnBy: 7,
	})
	if err != nil {
		t.Fatalf("withdraw attachment: %v", err)
	}
	if repo.withdrawCalls != 1 || repo.withdrawn == nil ||
		repo.withdrawn.Reason != "上传了错误版本，改传已签字文件" ||
		repo.withdrawn.WithdrawnBy != 7 {
		t.Fatalf("withdrawal audit input = %#v, calls=%d", repo.withdrawn, repo.withdrawCalls)
	}
	if item.WithdrawnAt == nil || !item.WithdrawnAt.Equal(repo.withdrawnAt) ||
		item.WithdrawnBy == nil || *item.WithdrawnBy != 7 ||
		item.WithdrawalReason == nil || *item.WithdrawalReason != "上传了错误版本，改传已签字文件" ||
		item.Content != nil {
		t.Fatalf("withdrawn attachment metadata = %#v", item)
	}
}

func TestBusinessAttachmentWithdrawExactReplayReturnsStoredReceipt(t *testing.T) {
	withdrawnAt := time.Unix(1_750_000_000, 0)
	withdrawnBy := 7
	reason := "上传了错误版本"
	repo := &stubBusinessAttachmentRepo{ownerExists: true}
	item, err := NewBusinessAttachmentUsecase(repo).WithdrawBusinessAttachment(
		context.Background(),
		&BusinessAttachmentWithdrawInput{
			Attachment: &BusinessAttachment{
				ID:               9,
				OwnerType:        BusinessAttachmentOwnerSalesOrder,
				OwnerID:          42,
				AttachmentType:   "evidence",
				Content:          []byte("proof"),
				WithdrawnAt:      &withdrawnAt,
				WithdrawnBy:      &withdrawnBy,
				WithdrawalReason: &reason,
			},
			Reason:      "  上传了错误版本  ",
			WithdrawnBy: withdrawnBy,
		},
	)
	if err != nil || item == nil || item.WithdrawnAt == nil || !item.WithdrawnAt.Equal(withdrawnAt) {
		t.Fatalf("exact withdrawal replay = %#v, err=%v", item, err)
	}
	if item.Content != nil || repo.withdrawCalls != 0 {
		t.Fatalf("exact replay must return stored metadata without writing: item=%#v calls=%d", item, repo.withdrawCalls)
	}
}

func TestBusinessAttachmentWithdrawRejectsInvalidOrUnsupportedTransitions(t *testing.T) {
	withdrawnAt := time.Unix(1_749_000_000, 0)
	base := BusinessAttachment{
		ID:             9,
		OwnerType:      BusinessAttachmentOwnerSalesOrder,
		OwnerID:        42,
		AttachmentType: "evidence",
	}
	for _, tc := range []struct {
		name       string
		attachment BusinessAttachment
		reason     string
		actorID    int
		guard      *WorkflowAttachmentWriteGuard
		wantErr    error
	}{
		{name: "blank reason", attachment: base, reason: "  ", actorID: 7, wantErr: ErrBusinessAttachmentWithdrawalReasonInvalid},
		{name: "reason too long", attachment: base, reason: strings.Repeat("错", 256), actorID: 7, wantErr: ErrBusinessAttachmentWithdrawalReasonInvalid},
		{name: "invalid actor", attachment: base, reason: "上传错误", actorID: 0, wantErr: ErrBadParam},
		{name: "already withdrawn", attachment: func() BusinessAttachment { item := base; item.WithdrawnAt = &withdrawnAt; return item }(), reason: "重复", actorID: 7, wantErr: ErrBusinessAttachmentWithdrawn},
		{name: "product media", attachment: BusinessAttachment{ID: 9, OwnerType: BusinessAttachmentOwnerProduct, OwnerID: 42, AttachmentType: BusinessAttachmentTypeProductImage}, reason: "不适用", actorID: 7, wantErr: ErrBusinessAttachmentProductImageWithdrawalUnsupported},
		{name: "workflow guard missing", attachment: BusinessAttachment{ID: 9, OwnerType: BusinessAttachmentOwnerWorkflowTask, OwnerID: 42, AttachmentType: "evidence"}, reason: "上传错误", actorID: 7, wantErr: ErrBadParam},
		{name: "workflow actor mismatch", attachment: BusinessAttachment{ID: 9, OwnerType: BusinessAttachmentOwnerWorkflowTask, OwnerID: 42, AttachmentType: "evidence"}, reason: "上传错误", actorID: 7, guard: &WorkflowAttachmentWriteGuard{ExpectedVersion: 1, ActorID: 8}, wantErr: ErrBadParam},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubBusinessAttachmentRepo{ownerExists: true}
			_, err := NewBusinessAttachmentUsecase(repo).WithdrawBusinessAttachment(
				context.Background(),
				&BusinessAttachmentWithdrawInput{
					Attachment:    &tc.attachment,
					Reason:        tc.reason,
					WithdrawnBy:   tc.actorID,
					WorkflowGuard: tc.guard,
				},
			)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("withdraw error = %v, want %v", err, tc.wantErr)
			}
			if repo.withdrawCalls != 0 {
				t.Fatalf("invalid withdrawal must not reach repo, calls=%d", repo.withdrawCalls)
			}
		})
	}
}

func TestBusinessAttachmentGetContentRejectsWithdrawnMetadataBeforeRepoRead(t *testing.T) {
	withdrawnAt := time.Unix(1_750_000_000, 0)
	repo := &stubBusinessAttachmentRepo{content: []byte("proof")}
	content, err := NewBusinessAttachmentUsecase(repo).GetBusinessAttachmentContent(
		context.Background(),
		&BusinessAttachment{
			ID:          9,
			OwnerType:   BusinessAttachmentOwnerSalesOrder,
			OwnerID:     42,
			WithdrawnAt: &withdrawnAt,
		},
	)
	if content != nil || !errors.Is(err, ErrBusinessAttachmentWithdrawnContentUnavailable) {
		t.Fatalf("withdrawn content must fail closed: content=%q err=%v", content, err)
	}
	if repo.contentCalls != 0 {
		t.Fatalf("withdrawn content must not reach repo, calls=%d", repo.contentCalls)
	}
}

func TestBusinessAttachmentGetContentVerifiesPersistedIntegrity(t *testing.T) {
	content := []byte("proof")
	sum := sha256.Sum256(content)
	validMetadata := BusinessAttachment{
		ID:        9,
		OwnerType: BusinessAttachmentOwnerSalesOrder,
		OwnerID:   42,
		FileSize:  len(content),
		SHA256:    hex.EncodeToString(sum[:]),
	}

	t.Run("matching metadata", func(t *testing.T) {
		repo := &stubBusinessAttachmentRepo{content: content}
		got, err := NewBusinessAttachmentUsecase(repo).GetBusinessAttachmentContent(
			context.Background(),
			&validMetadata,
		)
		if err != nil || !bytes.Equal(got, content) {
			t.Fatalf("matching content must be returned, got=%q err=%v", got, err)
		}
	})

	tests := []struct {
		name   string
		mutate func(*BusinessAttachment)
	}{
		{
			name: "size mismatch",
			mutate: func(metadata *BusinessAttachment) {
				metadata.FileSize++
			},
		},
		{
			name: "hash mismatch",
			mutate: func(metadata *BusinessAttachment) {
				metadata.SHA256 = strings.Repeat("0", sha256.Size*2)
			},
		},
		{
			name: "malformed stored hash",
			mutate: func(metadata *BusinessAttachment) {
				metadata.SHA256 = "sha"
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			metadata := validMetadata
			tt.mutate(&metadata)
			repo := &stubBusinessAttachmentRepo{content: content}
			got, err := NewBusinessAttachmentUsecase(repo).GetBusinessAttachmentContent(
				context.Background(),
				&metadata,
			)
			if got != nil || !errors.Is(err, ErrBusinessAttachmentIntegrity) {
				t.Fatalf("mismatched content must fail closed, got=%q err=%v", got, err)
			}
		})
	}
}
