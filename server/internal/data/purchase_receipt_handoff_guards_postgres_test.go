package data

import "testing"

func TestPurchaseReceiptPostgresMixedQualityPreservesAggregateOutcome(t *testing.T) {
	for _, remaining := range []string{"pending", "rejected", "passed"} {
		t.Run(remaining, func(t *testing.T) {
			f := newPurchaseHandoffPostgresFixture(t, "aggregate_"+remaining)
			testPurchaseReceiptMixedQualityAggregate(t, f, remaining)
		})
	}
}

func TestPurchaseReceiptPostgresCancellationRejectsClosedOrder(t *testing.T) {
	f := newPurchaseHandoffPostgresFixture(t, "closed_order")
	testPurchaseRejectionCancellationRejectsClosedOrder(t, f)
}

func TestPurchaseReceiptPostgresInboundCommandCompletesWithDisposedRejection(t *testing.T) {
	f := newPurchaseHandoffPostgresFixture(t, "command_disposed_rejection")
	testPurchaseReceiptInboundCommandCompletesWithDisposedRejection(t, f)
}

func TestPurchaseReceiptPostgresCancellationKeepsOpenOrderRecoveryAndClosedReplay(t *testing.T) {
	f := newPurchaseHandoffPostgresFixture(t, "open_order")
	testPurchaseRejectionCancellationKeepsOpenOrderRecoveryAndClosedReplay(t, f)
}

func TestPurchaseReceiptPostgresCancellationSerializesOrderClose(t *testing.T) {
	for index := range 5 {
		t.Run(string(rune('A'+index)), func(t *testing.T) {
			f := newPurchaseHandoffPostgresFixture(t, "close_cancel_race")
			testPurchaseRejectionCancellationRacesOrderClose(t, f)
		})
	}
}

func newPurchaseHandoffPostgresFixture(t *testing.T, key string) partialInboundFixture {
	t.Helper()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, t.Context(), client)
	return partialInboundFixtureWithData(t, data, client, inventoryTestFixtures{unitID: fixtures.unitID, materialID: fixtures.materialID, warehouseID: fixtures.warehouseID}, "guard_"+key+"_"+postgresTestSuffix())
}
