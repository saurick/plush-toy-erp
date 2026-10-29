package data

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_BOMEditorFieldsPersistAndClear(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom_editor_fields")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	printed := start.AddDate(0, 0, 26)
	in := &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{
		Version: "编辑器完整字段", EffectiveFrom: &start, EffectiveTo: &end, PrintDate: &printed,
		SourceOrderNo: stringPtr("SO-EDITOR-1"), QuantityText: stringPtr("100"), SpareText: stringPtr("5"),
		Designer: stringPtr("工程设计员"), Maker: stringPtr("工程制表员"), Auditor: stringPtr("工程审核员"),
		HairDirection: stringPtr("单方向"), Note: stringPtr("待清空表头"),
	}}
	part := biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.RequireFromString("1.25"), LossRate: decimal.RequireFromString("0.1"),
		Position: stringPtr("身体"), PieceCount: stringPtr("2"), TotalUsageSnapshot: stringPtr("137.5"), ProcessBase: stringPtr("贴衬"), ProcessMethod: stringPtr("车缝"), Note: stringPtr("待清空明细"),
	}
	created, err := uc.SaveBOMWithItems(ctx, 0, in, []*biz.BOMItemSaveMutation{{BOMItemUpdate: part}})
	if err != nil {
		t.Fatal(err)
	}
	read, err := uc.GetBOMVersion(ctx, created.Header.ID)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"source": "SO-EDITOR-1", "quantity": "100", "spare": "5", "designer": "工程设计员", "maker": "工程制表员", "auditor": "工程审核员", "hair": "单方向", "note": "待清空表头"}
	actual := map[string]*string{"source": read.Header.SourceOrderNo, "quantity": read.Header.QuantityText, "spare": read.Header.SpareText, "designer": read.Header.Designer, "maker": read.Header.Maker, "auditor": read.Header.Auditor, "hair": read.Header.HairDirection, "note": read.Header.Note}
	for key, value := range actual {
		if value == nil || *value != want[key] {
			t.Fatalf("header field %s did not persist", key)
		}
	}
	if read.Header.EffectiveFrom == nil || !read.Header.EffectiveFrom.Equal(start) || read.Header.EffectiveTo == nil || !read.Header.EffectiveTo.Equal(end) || read.Header.PrintDate == nil || !read.Header.PrintDate.Equal(printed) {
		t.Fatal("BOM date fields did not persist")
	}
	if len(read.Items) != 1 || read.Items[0].ProcessBase == nil || *read.Items[0].ProcessBase != "贴衬" || read.Items[0].ProcessMethod == nil || *read.Items[0].ProcessMethod != "车缝" || read.Items[0].TotalUsageSnapshot == nil || *read.Items[0].TotalUsageSnapshot != "137.5" {
		t.Fatal("BOM part fields did not persist")
	}
	assertDecimalEqual(t, read.Items[0].Quantity, "1.25")
	assertDecimalEqual(t, read.Items[0].LossRate, "0.1")
	_, err = uc.SaveBOMWithItems(ctx, read.Header.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: read.Header.EditVersion, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: in.Version}}, []*biz.BOMItemSaveMutation{{ID: read.Items[0].ID, BOMItemUpdate: biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.NewFromInt(2)}}})
	if err != nil {
		t.Fatal(err)
	}
	cleared, err := uc.GetBOMVersion(ctx, read.Header.ID)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]*string{"source": cleared.Header.SourceOrderNo, "quantity": cleared.Header.QuantityText, "spare": cleared.Header.SpareText, "designer": cleared.Header.Designer, "maker": cleared.Header.Maker, "auditor": cleared.Header.Auditor, "hair": cleared.Header.HairDirection, "note": cleared.Header.Note, "position": cleared.Items[0].Position, "pieces": cleared.Items[0].PieceCount, "total": cleared.Items[0].TotalUsageSnapshot, "base": cleared.Items[0].ProcessBase, "method": cleared.Items[0].ProcessMethod, "part_note": cleared.Items[0].Note} {
		if value != nil {
			t.Fatalf("cleared field %s retained a stale value", key)
		}
	}
	if cleared.Header.EffectiveFrom != nil || cleared.Header.EffectiveTo != nil || cleared.Header.PrintDate != nil || cleared.Items[0].ID != read.Items[0].ID || cleared.Header.Status != biz.BOMStatusDraft {
		t.Fatal("clearing fields changed identity/state or retained dates")
	}
}

func TestInventoryRepo_BOMSourceValuesPersistCopyAndClear(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "bom_source_values")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	assertBOMSourceValuesRoundTrip(t, uc, f.productID, f.materialID, f.unitID)
}

func assertBOMSourceValuesRoundTrip(t *testing.T, uc *biz.InventoryUsecase, productID, materialID, unitID int) {
	t.Helper()
	ctx := t.Context()
	source := map[string]any{"file_name": "教学材料.xlsx", "sheet_name": "材料分析明细表", "row_number": 6,
		"quantity_value": "0.0123456789012345", "quantity_label": "单位用量", "quantity_format": "0.000",
		"total_value": "1.358024679135795", "total_label": "总用量 含损耗10%", "total_format": "0.00",
		"loss_source": biz.BOMLossSourceHeader, "loss_rate": "0.1", "order_quantity": "100"}
	part := biz.BOMItemUpdate{MaterialID: materialID, UnitID: unitID, Quantity: decimal.RequireFromString("0.0123456789012345"), LossRate: decimal.RequireFromString("0.1"), TotalUsageSnapshot: stringPtr("1.358024679135795"), SourceSnapshot: source}
	header := biz.BOMHeaderUpdate{Version: "来源精度", QuantityText: stringPtr("100")}
	created, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: productID, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: part}})
	if err != nil {
		t.Fatal(err)
	}
	read, err := uc.GetBOMVersion(ctx, created.Header.ID)
	if err != nil || len(read.Items) != 1 || read.Items[0].SourceSnapshot["quantity_value"] != source["quantity_value"] || read.Items[0].SourceSnapshot["quantity_format"] != "0.000" || read.Items[0].TotalUsageSnapshot == nil || *read.Items[0].TotalUsageSnapshot != "1.358024679135795" {
		t.Fatalf("source values did not persist: %v", err)
	}
	assertDecimalEqual(t, read.Items[0].Quantity, "0.0123456789012345")
	copied, err := uc.CopyBOMVersion(ctx, created.Header.ID, &biz.BOMHeaderCreate{ProductID: productID, Version: "来源复制"})
	if err != nil || len(copied.Items) != 1 || copied.Items[0].SourceSnapshot["total_value"] != source["total_value"] {
		t.Fatalf("source values were not copied: %v", err)
	}
	header.QuantityText = stringPtr("200")
	updated, err := uc.SaveBOMWithItems(ctx, read.Header.ID, &biz.BOMVersionMutation{ProductID: productID, ExpectedVersion: read.Header.EditVersion, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{ID: read.Items[0].ID, BOMItemUpdate: part}})
	if err != nil || updated.Items[0].TotalUsageSnapshot != nil || updated.Items[0].SourceSnapshot["total_value"] != source["total_value"] {
		t.Fatalf("changed order retained stale total or lost source: %v", err)
	}
	part.SourceSnapshot, part.TotalUsageSnapshot = nil, nil
	cleared, err := uc.SaveBOMWithItems(ctx, updated.Header.ID, &biz.BOMVersionMutation{ProductID: productID, ExpectedVersion: updated.Header.EditVersion, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{ID: updated.Items[0].ID, BOMItemUpdate: part}})
	if err != nil || len(cleared.Items[0].SourceSnapshot) != 0 {
		t.Fatalf("source snapshot did not clear: %v", err)
	}
}

func TestInventoryRepo_SaveBOMWithItemsAtomicCAS(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom_atomic_save")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)

	created, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{
		ProductID: fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{
			Version: "V1",
			Note:    stringPtr("initial"),
		},
	}, []*biz.BOMItemSaveMutation{{
		BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			Quantity:   decimal.NewFromInt(1),
			UnitID:     fixtures.unitID,
			LossRate:   decimal.Zero,
		},
	}})
	if err != nil {
		t.Fatalf("create aggregate BOM: %v", err)
	}
	if created.Header.EditVersion <= 0 || len(created.Items) != 1 {
		t.Fatalf("create response missing edit version or item: %#v", created)
	}

	legacyUpdatedAt := time.Date(2026, 7, 17, 8, 30, 0, 0, time.UTC)
	if _, err := client.BOMHeader.UpdateOneID(created.Header.ID).
		SetUpdatedAt(legacyUpdatedAt).
		Save(ctx); err != nil {
		t.Fatalf("force legacy second-precision updated_at: %v", err)
	}
	legacy, err := uc.GetBOMVersion(ctx, created.Header.ID)
	if err != nil {
		t.Fatalf("read legacy BOM: %v", err)
	}
	if legacy.Header.EditVersion != legacyUpdatedAt.UnixMicro() {
		t.Fatalf("legacy edit version = %d, want %d", legacy.Header.EditVersion, legacyUpdatedAt.UnixMicro())
	}

	updated, err := uc.SaveBOMWithItems(ctx, created.Header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: legacy.Header.EditVersion,
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "V2"},
	}, []*biz.BOMItemSaveMutation{
		{
			ID: created.Items[0].ID,
			BOMItemUpdate: biz.BOMItemUpdate{
				MaterialID: fixtures.materialID,
				Quantity:   decimal.NewFromInt(2),
				UnitID:     fixtures.unitID,
				LossRate:   decimal.Zero,
			},
		},
		{BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			Quantity:   decimal.NewFromInt(3),
			UnitID:     fixtures.unitID,
			LossRate:   decimal.NewFromFloat(0.05),
		}},
	})
	if err != nil {
		t.Fatalf("update aggregate BOM: %v", err)
	}
	if updated.Header.EditVersion <= legacy.Header.EditVersion || len(updated.Items) != 2 || updated.Items[0].ID != created.Items[0].ID {
		t.Fatalf("aggregate update did not advance CAS or preserve existing row: %#v", updated)
	}

	_, err = uc.SaveBOMWithItems(ctx, created.Header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: legacy.Header.EditVersion,
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "STALE"},
	}, []*biz.BOMItemSaveMutation{{
		ID: updated.Items[0].ID,
		BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			Quantity:   decimal.NewFromInt(99),
			UnitID:     fixtures.unitID,
			LossRate:   decimal.Zero,
		},
	}})
	if !errors.Is(err, biz.ErrBOMVersionConflict) {
		t.Fatalf("stale aggregate save error = %v, want version conflict", err)
	}
	assertStoredBOMSaveState(t, ctx, client, created.Header.ID, "V2", updated.Header.EditVersion, 2)

	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable referenced material: %v", err)
	}
	_, err = repo.SaveBOMWithItems(ctx, created.Header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: updated.Header.EditVersion,
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "INACTIVE-REF"},
	}, []*biz.BOMItemSaveMutation{{
		ID: updated.Items[0].ID,
		BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			Quantity:   decimal.NewFromInt(4),
			UnitID:     fixtures.unitID,
			LossRate:   decimal.Zero,
		},
	}})
	if !errors.Is(err, biz.ErrMaterialInactive) {
		t.Fatalf("inactive reference save error = %v, want material inactive", err)
	}
	assertStoredBOMSaveState(t, ctx, client, created.Header.ID, "V2", updated.Header.EditVersion, 2)
	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(true).Save(ctx); err != nil {
		t.Fatalf("restore referenced material: %v", err)
	}

	_, err = repo.SaveBOMWithItems(ctx, created.Header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: updated.Header.EditVersion,
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "ROLLBACK"},
	}, []*biz.BOMItemSaveMutation{{
		ID: updated.Items[0].ID,
		BOMItemUpdate: biz.BOMItemUpdate{
			MaterialID: fixtures.materialID,
			Quantity:   decimal.NewFromInt(-1),
			UnitID:     fixtures.unitID,
			LossRate:   decimal.Zero,
		},
	}})
	if err == nil {
		t.Fatal("expected item constraint failure after header CAS")
	}
	assertStoredBOMSaveState(t, ctx, client, created.Header.ID, "V2", updated.Header.EditVersion, 2)

	activated, err := uc.ActivateBOMVersion(ctx, created.Header.ID)
	if err != nil {
		t.Fatalf("activate BOM: %v", err)
	}
	_, err = uc.SaveBOMWithItems(ctx, created.Header.ID, &biz.BOMVersionMutation{
		ExpectedVersion: activated.Header.EditVersion,
		ProductID:       fixtures.productID,
		BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "ACTIVE-EDIT"},
	}, []*biz.BOMItemSaveMutation{})
	if !errors.Is(err, biz.ErrBOMActiveImmutable) {
		t.Fatalf("active aggregate save error = %v, want immutable", err)
	}
}

func TestNextBOMEditTimeAdvancesPastSameMicrosecond(t *testing.T) {
	expected := time.Now().UTC().Add(time.Second).UnixMicro()
	if got := nextBOMEditTime(expected).UnixMicro(); got != expected+1 {
		t.Fatalf("next edit version = %d, want %d", got, expected+1)
	}
}

func TestApplyBOMReferenceShareLockUsesPostgresForShareOnly(t *testing.T) {
	postgresSelector := entsql.Dialect(dialect.Postgres).Select().From(entsql.Table("materials"))
	applyBOMReferenceShareLock(postgresSelector, dialect.Postgres)
	query, _ := postgresSelector.Query()
	if !strings.Contains(query, " FOR SHARE") {
		t.Fatalf("postgres reference query must use FOR SHARE: %s", query)
	}

	sqliteSelector := entsql.Dialect(dialect.SQLite).Select().From(entsql.Table("materials"))
	applyBOMReferenceShareLock(sqliteSelector, dialect.SQLite)
	query, _ = sqliteSelector.Query()
	if strings.Contains(query, "FOR SHARE") || sqliteSelector.Err() != nil {
		t.Fatalf("sqlite reference query must stay lock-clause free: query=%s err=%v", query, sqliteSelector.Err())
	}
}

func assertStoredBOMSaveState(t *testing.T, ctx context.Context, client *ent.Client, headerID int, version string, editVersion int64, itemCount int) {
	t.Helper()
	header, err := client.BOMHeader.Get(ctx, headerID)
	if err != nil {
		t.Fatalf("reload BOM header: %v", err)
	}
	count, err := client.BOMItem.Query().Where(bomitem.BomHeaderID(headerID)).Count(ctx)
	if err != nil {
		t.Fatalf("count BOM items: %v", err)
	}
	if header.Version != version || bomEditVersion(header.UpdatedAt) != editVersion || count != itemCount {
		t.Fatalf("stored BOM state = version %s edit %d items %d, want %s/%d/%d", header.Version, bomEditVersion(header.UpdatedAt), count, version, editVersion, itemCount)
	}
}
