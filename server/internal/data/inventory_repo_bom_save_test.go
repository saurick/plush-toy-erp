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
