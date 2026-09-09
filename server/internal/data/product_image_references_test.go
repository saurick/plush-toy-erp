package data

import (
	"context"
	"fmt"
	"testing"

	"server/internal/biz"
)

func TestProductImageReferencesPrimaryOnlyAndClear(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "product_image_references")
	defer closeRepo()
	ctx := context.Background()
	unit := repo.data.postgres.Unit.Create().SetCode("PCS").SetName("只").SaveX(ctx)
	var productIDs []int
	for _, id := range []int{7, 8} {
		row := repo.data.postgres.Product.Create().SetCode(fmt.Sprintf("IMAGE-%d", id)).SetName("图片测试产品").SetDefaultUnitID(unit.ID).SaveX(ctx)
		productIDs = append(productIDs, row.ID)
	}
	first, second := productIDs[0], productIDs[1]
	add := func(owner string, id int, kind, slot string) int {
		c := repo.data.postgres.BusinessAttachment.Create().SetOwnerType(owner).SetOwnerID(id).SetAttachmentType(kind).SetFileName("image.png").SetMimeType("image/png").SetFileSize(1).SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetContent([]byte{1})
		if slot != "" {
			c.SetSlotKey(slot)
		}
		return c.SaveX(ctx).ID
	}
	main := add("product", first, "product_image", "primary")
	add("product", first, "product_image", "secondary")
	add("product", second, "product_image", "secondary")
	add("quality_inspection", 9, "evidence", "")
	add("product", 9, "product_image", "primary") // An orphan must not disclose a media reference.
	refs, err := repo.ListProductImageReferences(ctx, []int{first, second, 9})
	if err != nil || len(refs) != 3 || refs[first] != main || refs[second] != 0 || refs[9] != 0 {
		t.Fatalf("bad refs %v %v", refs, err)
	}
	repo.data.postgres.BusinessAttachment.DeleteOneID(main).ExecX(ctx)
	refs, err = repo.ListProductImageReferences(ctx, []int{first})
	if err != nil || refs[first] != 0 {
		t.Fatalf("cleared primary borrowed secondary: %v %v", refs, err)
	}
	replacement := add(biz.BusinessAttachmentOwnerProduct, first, biz.BusinessAttachmentTypeProductImage, "primary")
	refs, err = repo.ListProductImageReferences(ctx, []int{first})
	if err != nil || refs[first] != replacement {
		t.Fatalf("replacement stale %v %v", refs, err)
	}
}
