package biz

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type documentProductPreviewTestRepo struct {
	BusinessAttachmentRepo
	calls int
	ids   []int
	err   error
}

func (r *documentProductPreviewTestRepo) ListDocumentProductPreviews(_ context.Context, _ string, ids []int) ([]DocumentProductPreview, error) {
	r.calls++
	r.ids = ids
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
		if _, err := uc.ListDocumentProductPreviews(context.Background(), test.source, test.ids); !errors.Is(err, ErrBadParam) || repo.calls != 0 {
			t.Fatalf("invalid input reached repository: %v %v", test, err)
		}
	}
	for _, source := range []string{DocumentProductPreviewSalesOrder, DocumentProductPreviewProductionOrder, DocumentProductPreviewOutsourcingOrder} {
		rows, err := uc.ListDocumentProductPreviews(context.Background(), source, []int{4, 2})
		if err != nil || len(rows) != 1 || !reflect.DeepEqual(repo.ids, []int{4, 2}) {
			t.Fatalf("read failed: %v %v", rows, err)
		}
	}
	repo.err = errors.New("read failed")
	if _, err := uc.ListDocumentProductPreviews(context.Background(), DocumentProductPreviewSalesOrder, []int{1}); !errors.Is(err, repo.err) {
		t.Fatal("read failure hidden")
	}
}
