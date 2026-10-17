package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_BOMHeaderAndItems(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	part := biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID,
		Quantity: mustDecimal(t, "1.25"), LossRate: mustDecimal(t, "0.1"),
		Position: stringPtr("face"), PieceCount: stringPtr("2"), TotalUsageSnapshot: stringPtr("378.75"),
		ProcessBase: stringPtr("布底贴12g纸朴"), ProcessMethod: stringPtr("热裁")}
	input := &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{
		Version: "V1", SourceOrderNo: stringPtr("WL260102"), QuantityText: stringPtr("3030"),
		SpareText: stringPtr("备品 30"), Designer: stringPtr("罗伟"), Maker: stringPtr("成慧怡"),
		Auditor: stringPtr("审核人"), HairDirection: stringPtr("单方向")}}
	created, err := uc.SaveBOMWithItems(ctx, 0, input, []*biz.BOMItemSaveMutation{{BOMItemUpdate: part}})
	if err != nil {
		t.Fatal(err)
	}
	header, item := created.Header, created.Items[0]
	if header.Status != biz.BOMStatusDraft || header.ItemCount != nil {
		t.Fatalf("created BOM header: %+v", header)
	}
	if header.SourceOrderNo == nil || *header.SourceOrderNo != "WL260102" || header.Designer == nil || *header.Designer != "罗伟" {
		t.Fatalf("missing engineering header: %+v", header)
	}
	assertDecimalEqual(t, item.Quantity, "1.25")
	assertDecimalEqual(t, item.LossRate, "0.1")
	if item.PieceCount == nil || *item.PieceCount != "2" || item.ProcessMethod == nil || *item.ProcessMethod != "热裁" {
		t.Fatalf("missing engineering item: %+v", item)
	}
	if _, err := uc.SaveBOMWithItems(ctx, 0, input, nil); !errors.Is(err, biz.ErrBOMRecordConflict) {
		t.Fatalf("duplicate product/version: %v", err)
	}
	defaultDraft := saveBOMDraftFixture(t, ctx, uc, f.productID, "DEFAULT-DRAFT")
	draft := saveBOMDraftFixture(t, ctx, uc, f.productID, "V2")
	headers, total, err := uc.ListBOMHeaders(ctx, biz.BOMHeaderFilter{ProductID: f.productID, Limit: 20})
	if err != nil || total != 3 || len(headers) != 3 {
		t.Fatalf("list: %d %+v %v", total, headers, err)
	}
	counts := map[int]int{}
	for _, listed := range headers {
		if listed.ItemCount == nil {
			t.Fatalf("unknown item count: %+v", listed)
		}
		counts[listed.ID] = *listed.ItemCount
	}
	if counts[header.ID] != 1 || counts[defaultDraft.Header.ID] != 0 || counts[draft.Header.ID] != 0 {
		t.Fatalf("item counts: %+v", counts)
	}
	activated, err := uc.ActivateBOMVersion(ctx, header.ID)
	if err != nil || activated.Header.Status != biz.BOMStatusActive || len(activated.Items) != 1 {
		t.Fatalf("activation: %+v %v", activated, err)
	}
	for _, toggle := range []func(bool){
		func(active bool) { client.Product.UpdateOneID(f.productID).SetIsActive(active).ExecX(ctx) },
		func(active bool) { client.Material.UpdateOneID(f.materialID).SetIsActive(active).ExecX(ctx) },
		func(active bool) { client.Unit.UpdateOneID(f.unitID).SetIsActive(active).ExecX(ctx) },
	} {
		toggle(false)
		replay, err := uc.ActivateBOMVersion(ctx, header.ID)
		toggle(true)
		if err != nil || replay.Header.ID != header.ID || replay.Header.Status != biz.BOMStatusActive {
			t.Fatalf("activation replay with inactive reference: %+v %v", replay, err)
		}
	}
	if _, err := uc.SaveBOMWithItems(ctx, header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: activated.Header.EditVersion, ProductID: f.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "ACTIVE-EDIT"},
	}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: part}}); !errors.Is(err, biz.ErrBOMActiveImmutable) {
		t.Fatalf("active BOM edit: %v", err)
	}
	active, err := uc.GetActiveBOMByProduct(ctx, f.productID)
	if err != nil || active.ID != header.ID {
		t.Fatalf("active BOM: %+v %v", active, err)
	}
	items, err := uc.ListBOMItemsByProduct(ctx, f.productID)
	if err != nil || len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("active BOM items: %+v %v", items, err)
	}
	product := createTestProduct(t, ctx, client, f.unitID, "PRD-BOM-LIFECYCLE")
	lifecycle := saveBOMDraftFixture(t, ctx, uc, product.ID, "V1", &biz.BOMItemSaveMutation{BOMItemUpdate: part})
	for _, step := range []string{"archive", "archive", "activate", "archive"} {
		if step == "activate" {
			row, err := uc.ActivateBOMVersion(ctx, lifecycle.Header.ID)
			if err != nil || row.Header.Status != biz.BOMStatusActive {
				t.Fatalf("reactivate: %+v %v", row, err)
			}
		} else {
			row, err := uc.ArchiveBOMVersion(ctx, lifecycle.Header.ID)
			if err != nil || row.Status != biz.BOMStatusArchived {
				t.Fatalf("archive: %+v %v", row, err)
			}
		}
	}
	for _, tc := range []struct {
		name   string
		change func(*biz.BOMItemUpdate)
		want   error
	}{
		{"zero quantity", func(v *biz.BOMItemUpdate) { v.Quantity = decimal.Zero }, biz.ErrBadParam},
		{"negative loss", func(v *biz.BOMItemUpdate) { v.LossRate = decimal.NewFromInt(-1) }, biz.ErrBadParam},
		{"missing material", func(v *biz.BOMItemUpdate) { v.MaterialID = 999999 }, biz.ErrMaterialNotFound},
		{"missing unit", func(v *biz.BOMItemUpdate) { v.UnitID = 999999 }, biz.ErrUnitNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			invalid := part
			tc.change(&invalid)
			_, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: tc.name}}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: invalid}})
			if !errors.Is(err, tc.want) {
				t.Fatalf("error=%v want=%v", err, tc.want)
			}
		})
	}
	fixtures := f
	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(decimal.Zero).
		SetUnitID(fixtures.unitID).
		SetLossRate(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for quantity > 0, got %v", err)
	}
	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitID(fixtures.unitID).
		SetLossRate(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for loss_rate >= 0, got %v", err)
	}
	if _, err := client.BOMHeader.Create().
		SetProductID(fixtures.productID).
		SetVersion("UNKNOWN-STATUS").
		SetStatus("UNKNOWN").
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for known BOM status, got %v", err)
	}
	from := time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)
	to := from.Add(-24 * time.Hour)
	if _, err := client.BOMHeader.Create().
		SetProductID(fixtures.productID).
		SetVersion("INVALID-DATES").
		SetStatus(biz.BOMStatusDraft).
		SetEffectiveFrom(from).
		SetEffectiveTo(to).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for ordered BOM effective dates, got %v", err)
	}
}

func TestInventoryUsecase_BOMRejectsInactiveNewReferencesAndKeepsArchiveAllowed(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom_inactive_refs")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	part := &biz.BOMItemSaveMutation{BOMItemUpdate: biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1)}}
	created := saveBOMDraftFixture(t, ctx, uc, f.productID, "ACTIVE-V1", part)
	if _, err := uc.ActivateBOMVersion(ctx, created.Header.ID); err != nil {
		t.Fatal(err)
	}
	client.Product.UpdateOneID(f.productID).SetIsActive(false).ExecX(ctx)
	if _, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "NEW-V2"}}, nil); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("inactive product: %v", err)
	}
	if archived, err := uc.ArchiveBOMVersion(ctx, created.Header.ID); err != nil || archived.Status != biz.BOMStatusArchived {
		t.Fatalf("archive inactive reference: %+v %v", archived, err)
	}
	product := createTestProduct(t, ctx, client, f.unitID, "PRD-BOM-ACTIVE")
	client.Material.UpdateOneID(f.materialID).SetIsActive(false).ExecX(ctx)
	if _, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: product.ID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "DRAFT-V1"}}, []*biz.BOMItemSaveMutation{part}); !errors.Is(err, biz.ErrMaterialInactive) {
		t.Fatalf("inactive material: %v", err)
	}
}

func saveBOMDraftFixture(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, productID int, version string, items ...*biz.BOMItemSaveMutation) *biz.BOMVersionDetail {
	t.Helper()
	result, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: version}}, items)
	if err != nil {
		t.Fatalf("save BOM fixture: %v", err)
	}
	return result
}
