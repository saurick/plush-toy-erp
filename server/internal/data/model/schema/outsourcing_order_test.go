package schema

import "testing"

func TestOutsourcingOrderSchemaHasNoSalesOrderSourceForeignKey(t *testing.T) {
	for _, item := range (OutsourcingOrder{}).Fields() {
		if item.Descriptor().Name == "source_sales_order_id" {
			t.Fatal("outsourcing order schema declared retired sales-order source id")
		}
	}
	for _, item := range (OutsourcingOrder{}).Indexes() {
		for _, fieldName := range item.Descriptor().Fields {
			if fieldName == "source_sales_order_id" {
				t.Fatal("outsourcing order schema indexed retired sales-order source id")
			}
		}
	}
}
