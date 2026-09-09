package biz

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func (r *stubBusinessAttachmentRepo) ListProductImageReferences(_ context.Context, ids []int) (map[int]int, error) {
	out := make(map[int]int)
	for _, id := range ids {
		out[id] = 0
	}
	return out, nil
}

type productImageReferenceRepo struct {
	BusinessAttachmentRepo
	ids []int
	err error
}

func (r *productImageReferenceRepo) ListProductImageReferences(_ context.Context, ids []int) (map[int]int, error) {
	r.ids = ids
	return map[int]int{7: 70, 8: 0}, r.err
}

func TestProductImageReferencesValidationAndDeduplication(t *testing.T) {
	repo := &productImageReferenceRepo{}
	uc := NewBusinessAttachmentUsecase(repo)
	for _, ids := range [][]int{nil, {}, {0}, {-1}, make([]int, 81)} {
		if _, err := uc.ListProductImageReferences(context.Background(), ids); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid IDs accepted: %v", ids)
		}
		if repo.ids != nil {
			t.Fatal("invalid input reached repo")
		}
	}
	refs, err := uc.ListProductImageReferences(context.Background(), []int{7, 8, 7})
	if err != nil || !reflect.DeepEqual(repo.ids, []int{7, 8}) || refs[7] != 70 || refs[8] != 0 {
		t.Fatalf("refs=%v ids=%v err=%v", refs, repo.ids, err)
	}
	repo.err = errors.New("database unavailable")
	if _, err = uc.ListProductImageReferences(context.Background(), []int{7}); !errors.Is(err, repo.err) {
		t.Fatal("repo error hidden")
	}
}
