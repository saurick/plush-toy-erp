package data

import (
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	corevalue "server/internal/core/value"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_BOMLongNotesPersistCopyRejectOverflowAndClear(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "bom_long_notes")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	note := strings.Repeat("备", corevalue.BusinessNoteMaxCharacters-2) + "\n注"
	header := biz.BOMHeaderUpdate{Note: &note}
	part := biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), Note: &note}
	created, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: part}})
	if err != nil {
		t.Fatal(err)
	}
	assertNotes := func(detail *biz.BOMVersionDetail) {
		t.Helper()
		if detail.Header.Note == nil || *detail.Header.Note != note || len(detail.Items) != 1 || detail.Items[0].Note == nil || *detail.Items[0].Note != note {
			t.Fatal("long header or line note was lost or truncated")
		}
	}
	read, err := uc.GetBOMVersion(ctx, created.Header.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertNotes(read)
	copied, err := uc.CopyBOMVersion(ctx, read.Header.ID, &biz.BOMHeaderCreate{ProductID: f.productID, Note: &note})
	if err != nil {
		t.Fatal(err)
	}
	assertNotes(copied)

	overflow := note + "溢"
	part.Note = &overflow
	header.Note = stringPtr("不应部分保存")
	_, err = uc.SaveBOMWithItems(ctx, read.Header.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: read.Header.EditVersion, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{ID: read.Items[0].ID, BOMItemUpdate: part}})
	if err == nil {
		t.Fatal("accepted an oversized line note")
	}
	unchanged, err := uc.GetBOMVersion(ctx, read.Header.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertNotes(unchanged)
	if unchanged.Header.EditVersion != read.Header.EditVersion {
		t.Fatal("rejected note changed the draft version")
	}

	part.Note = nil
	header.Note = nil
	cleared, err := uc.SaveBOMWithItems(ctx, read.Header.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: read.Header.EditVersion, BOMHeaderUpdate: header}, []*biz.BOMItemSaveMutation{{ID: read.Items[0].ID, BOMItemUpdate: part}})
	if err != nil {
		t.Fatal(err)
	}
	if cleared.Header.Note != nil || cleared.Items[0].Note != nil {
		t.Fatal("clearing long notes retained stale text")
	}
}
