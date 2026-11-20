package biz

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type documentProductPreviewTestRepo struct {
	BusinessAttachmentRepo
	calls   int
	ids     []int
	err     error
	options DocumentProductPreviewOptions
}

func (r *documentProductPreviewTestRepo) ListDocumentProductPreviews(_ context.Context, _ string, ids []int, options DocumentProductPreviewOptions) ([]DocumentProductPreview, error) {
	r.calls++
	r.ids = ids
	r.options = options
	return []DocumentProductPreview{{DocumentID: ids[0], ProductCount: 2, ProductID: 7}}, r.err
}

func TestDocumentProductPreviewBoundsAndSources(t *testing.T) {
	repo := &documentProductPreviewTestRepo{}
	uc := NewBusinessAttachmentUsecase(repo)
	for _, test := range []struct {
		source string
		ids    []int
	}{
		{"unknown", []int{1}}, {DocumentProductPreviewSalesOrder, nil},
		{DocumentProductPreviewSalesOrder, []int{0}}, {DocumentProductPreviewSalesOrder, []int{1, 1}},
		{DocumentProductPreviewSalesOrder, make([]int, DocumentProductPreviewBatchLimit+1)},
	} {
		if _, err := uc.ListDocumentProductPreviews(context.Background(), test.source, test.ids, DocumentProductPreviewOptions{}); !errors.Is(err, ErrBadParam) || repo.calls != 0 {
			t.Fatalf("invalid input reached repository: %v %v", test, err)
		}
	}
	for _, source := range []string{DocumentProductPreviewSalesOrder, DocumentProductPreviewProductionOrder, DocumentProductPreviewOutsourcingOrder} {
		rows, err := uc.ListDocumentProductPreviews(context.Background(), source, []int{4, 2}, DocumentProductPreviewOptions{})
		if err != nil || len(rows) != 1 || !reflect.DeepEqual(repo.ids, []int{4, 2}) {
			t.Fatalf("read failed: %v %v", rows, err)
		}
	}
	repo.err = errors.New("read failed")
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewSalesOrder, []int{1}, DocumentProductPreviewOptions{}); !errors.Is(err, repo.err) {
		t.Fatal("read failure hidden")
	}
}

func TestDocumentProductGallerySingleOutsourcingOrder(t *testing.T) {
	repo := &documentProductPreviewTestRepo{}
	uc := NewBusinessAttachmentUsecase(repo)
	options := DocumentProductPreviewOptions{IncludeProducts: true, ExpectedVersion: 3}
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewSalesOrder, []int{1}, options); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unexpected detail source: %v", err)
	}
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewOutsourcingOrder, []int{1, 2}, options); !errors.Is(err, ErrBadParam) {
		t.Fatalf("detail must be bounded to one order: %v", err)
	}
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewOutsourcingOrder, []int{1}, DocumentProductPreviewOptions{ExpectedVersion: 3}); !errors.Is(err, ErrBadParam) || repo.calls != 0 {
		t.Fatalf("summary must not accept a detail version: %v", err)
	}
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewOutsourcingOrder, []int{1}, options); err != nil || repo.options != options || repo.calls != 1 {
		t.Fatalf("versioned detail was not forwarded: %+v %v", repo.options, err)
	}
}
