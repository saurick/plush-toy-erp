	purchaseorderitemDescLineNo := purchaseorderitemFields[1].Descriptor()
	// purchaseorderitem.LineNoValidator is a validator for the "line_no" field. It is called by the builders before save.
	purchaseorderitem.LineNoValidator = purchaseorderitemDescLineNo.Validators[0].(func(int) error)
	// purchaseorderitemDescDisplayOrder is the schema descriptor for display_order field.
	purchaseorderitemDescDisplayOrder := purchaseorderitemFields[2].Descriptor()
	// purchaseorderitem.DisplayOrderValidator is a validator for the "display_order" field. It is called by the builders before save.
	purchaseorderitem.DisplayOrderValidator = purchaseorderitemDescDisplayOrder.Validators[0].(func(int) error)
	// purchaseorderitemDescMaterialID is the schema descriptor for material_id field.
	purchaseorderitemDescMaterialID := purchaseorderitemFields[3].Descriptor()
	// purchaseorderitem.MaterialIDValidator is a validator for the "material_id" field. It is called by the builders before save.
	purchaseorderitem.MaterialIDValidator = purchaseorderitemDescMaterialID.Validators[0].(func(int) error)
	// purchaseorderitemDescUnitID is the schema descriptor for unit_id field.
	purchaseorderitemDescUnitID := purchaseorderitemFields[4].Descriptor()
	// purchaseorderitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	purchaseorderitem.UnitIDValidator = purchaseorderitemDescUnitID.Validators[0].(func(int) error)
	// purchaseorderitemDescMaterialCodeSnapshot is the schema descriptor for material_code_snapshot field.
	purchaseorderitemDescMaterialCodeSnapshot := purchaseorderitemFields[5].Descriptor()
	// purchaseorderitem.MaterialCodeSnapshotValidator is a validator for the "material_code_snapshot" field. It is called by the builders before save.
	purchaseorderitem.MaterialCodeSnapshotValidator = purchaseorderitemDescMaterialCodeSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescMaterialNameSnapshot is the schema descriptor for material_name_snapshot field.
	purchaseorderitemDescMaterialNameSnapshot := purchaseorderitemFields[6].Descriptor()
	// purchaseorderitem.MaterialNameSnapshotValidator is a validator for the "material_name_snapshot" field. It is called by the builders before save.
	purchaseorderitem.MaterialNameSnapshotValidator = purchaseorderitemDescMaterialNameSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescMaterialSpecSnapshot is the schema descriptor for material_spec_snapshot field.
	purchaseorderitemDescMaterialSpecSnapshot := purchaseorderitemFields[7].Descriptor()
	// purchaseorderitem.MaterialSpecSnapshotValidator is a validator for the "material_spec_snapshot" field. It is called by the builders before save.
	purchaseorderitem.MaterialSpecSnapshotValidator = purchaseorderitemDescMaterialSpecSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescSupplierItemNoSnapshot is the schema descriptor for supplier_item_no_snapshot field.
	purchaseorderitemDescSupplierItemNoSnapshot := purchaseorderitemFields[8].Descriptor()
	// purchaseorderitem.SupplierItemNoSnapshotValidator is a validator for the "supplier_item_no_snapshot" field. It is called by the builders before save.
	purchaseorderitem.SupplierItemNoSnapshotValidator = purchaseorderitemDescSupplierItemNoSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescUnitNameSnapshot is the schema descriptor for unit_name_snapshot field.
	purchaseorderitemDescUnitNameSnapshot := purchaseorderitemFields[9].Descriptor()
	// purchaseorderitem.UnitNameSnapshotValidator is a validator for the "unit_name_snapshot" field. It is called by the builders before save.
	purchaseorderitem.UnitNameSnapshotValidator = purchaseorderitemDescUnitNameSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescColorSnapshot is the schema descriptor for color_snapshot field.
	purchaseorderitemDescColorSnapshot := purchaseorderitemFields[10].Descriptor()
	// purchaseorderitem.ColorSnapshotValidator is a validator for the "color_snapshot" field. It is called by the builders before save.
	purchaseorderitem.ColorSnapshotValidator = purchaseorderitemDescColorSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescProductOrderNoSnapshot is the schema descriptor for product_order_no_snapshot field.
	purchaseorderitemDescProductOrderNoSnapshot := purchaseorderitemFields[11].Descriptor()
	// purchaseorderitem.ProductOrderNoSnapshotValidator is a validator for the "product_order_no_snapshot" field. It is called by the builders before save.
	purchaseorderitem.ProductOrderNoSnapshotValidator = purchaseorderitemDescProductOrderNoSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescProductNoSnapshot is the schema descriptor for product_no_snapshot field.
	purchaseorderitemDescProductNoSnapshot := purchaseorderitemFields[12].Descriptor()
	// purchaseorderitem.ProductNoSnapshotValidator is a validator for the "product_no_snapshot" field. It is called by the builders before save.
	purchaseorderitem.ProductNoSnapshotValidator = purchaseorderitemDescProductNoSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescProductNameSnapshot is the schema descriptor for product_name_snapshot field.
	purchaseorderitemDescProductNameSnapshot := purchaseorderitemFields[13].Descriptor()
	// purchaseorderitem.ProductNameSnapshotValidator is a validator for the "product_name_snapshot" field. It is called by the builders before save.
	purchaseorderitem.ProductNameSnapshotValidator = purchaseorderitemDescProductNameSnapshot.Validators[0].(func(string) error)
	// purchaseorderitemDescLineStatus is the schema descriptor for line_status field.
	purchaseorderitemDescLineStatus := purchaseorderitemFields[18].Descriptor()
	// purchaseorderitem.DefaultLineStatus holds the default value on creation for the line_status field.
	purchaseorderitem.DefaultLineStatus = purchaseorderitemDescLineStatus.Default.(string)
	// purchaseorderitem.LineStatusValidator is a validator for the "line_status" field. It is called by the builders before save.
	purchaseorderitem.LineStatusValidator = func() func(string) error {
		validators := purchaseorderitemDescLineStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(line_status string) error {
			for _, fn := range fns {
				if err := fn(line_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaseorderitemDescNote is the schema descriptor for note field.
	purchaseorderitemDescNote := purchaseorderitemFields[19].Descriptor()
	// purchaseorderitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchaseorderitem.NoteValidator = purchaseorderitemDescNote.Validators[0].(func(string) error)
	// purchaseorderitemDescCreatedAt is the schema descriptor for created_at field.
	purchaseorderitemDescCreatedAt := purchaseorderitemFields[20].Descriptor()
	// purchaseorderitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchaseorderitem.DefaultCreatedAt = purchaseorderitemDescCreatedAt.Default.(func() time.Time)
	// purchaseorderitemDescUpdatedAt is the schema descriptor for updated_at field.
	purchaseorderitemDescUpdatedAt := purchaseorderitemFields[21].Descriptor()
	// purchaseorderitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchaseorderitem.DefaultUpdatedAt = purchaseorderitemDescUpdatedAt.Default.(func() time.Time)
	// purchaseorderitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchaseorderitem.UpdateDefaultUpdatedAt = purchaseorderitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchasereceiptHooks := schema.PurchaseReceipt{}.Hooks()
	purchasereceipt.Hooks[0] = purchasereceiptHooks[0]
	purchasereceiptFields := schema.PurchaseReceipt{}.Fields()
	_ = purchasereceiptFields
	// purchasereceiptDescReceiptNo is the schema descriptor for receipt_no field.
	purchasereceiptDescReceiptNo := purchasereceiptFields[0].Descriptor()
	// purchasereceipt.ReceiptNoValidator is a validator for the "receipt_no" field. It is called by the builders before save.
	purchasereceipt.ReceiptNoValidator = func() func(string) error {
		validators := purchasereceiptDescReceiptNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(receipt_no string) error {
			for _, fn := range fns {
				if err := fn(receipt_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptDescSupplierID is the schema descriptor for supplier_id field.
	purchasereceiptDescSupplierID := purchasereceiptFields[1].Descriptor()
	// purchasereceipt.SupplierIDValidator is a validator for the "supplier_id" field. It is called by the builders before save.
	purchasereceipt.SupplierIDValidator = purchasereceiptDescSupplierID.Validators[0].(func(int) error)
	// purchasereceiptDescSupplierName is the schema descriptor for supplier_name field.
	purchasereceiptDescSupplierName := purchasereceiptFields[2].Descriptor()
	// purchasereceipt.SupplierNameValidator is a validator for the "supplier_name" field. It is called by the builders before save.
	purchasereceipt.SupplierNameValidator = func() func(string) error {
		validators := purchasereceiptDescSupplierName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(supplier_name string) error {
			for _, fn := range fns {
				if err := fn(supplier_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptDescStatus is the schema descriptor for status field.
	purchasereceiptDescStatus := purchasereceiptFields[3].Descriptor()
	// purchasereceipt.DefaultStatus holds the default value on creation for the status field.
	purchasereceipt.DefaultStatus = purchasereceiptDescStatus.Default.(string)
	// purchasereceipt.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	purchasereceipt.StatusValidator = func() func(string) error {
		validators := purchasereceiptDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptDescIdempotencyKey is the schema descriptor for idempotency_key field.
	purchasereceiptDescIdempotencyKey := purchasereceiptFields[6].Descriptor()
	// purchasereceipt.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	purchasereceipt.IdempotencyKeyValidator = purchasereceiptDescIdempotencyKey.Validators[0].(func(string) error)
	// purchasereceiptDescIdempotencyPayloadHash is the schema descriptor for idempotency_payload_hash field.
	purchasereceiptDescIdempotencyPayloadHash := purchasereceiptFields[7].Descriptor()
	// purchasereceipt.IdempotencyPayloadHashValidator is a validator for the "idempotency_payload_hash" field. It is called by the builders before save.
	purchasereceipt.IdempotencyPayloadHashValidator = purchasereceiptDescIdempotencyPayloadHash.Validators[0].(func(string) error)
	// purchasereceiptDescIdempotencyItemCount is the schema descriptor for idempotency_item_count field.
	purchasereceiptDescIdempotencyItemCount := purchasereceiptFields[8].Descriptor()
	// purchasereceipt.IdempotencyItemCountValidator is a validator for the "idempotency_item_count" field. It is called by the builders before save.
	purchasereceipt.IdempotencyItemCountValidator = purchasereceiptDescIdempotencyItemCount.Validators[0].(func(int) error)
	// purchasereceiptDescNote is the schema descriptor for note field.
	purchasereceiptDescNote := purchasereceiptFields[9].Descriptor()
	// purchasereceipt.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereceipt.NoteValidator = purchasereceiptDescNote.Validators[0].(func(string) error)
	// purchasereceiptDescCreatedAt is the schema descriptor for created_at field.
	purchasereceiptDescCreatedAt := purchasereceiptFields[10].Descriptor()
	// purchasereceipt.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereceipt.DefaultCreatedAt = purchasereceiptDescCreatedAt.Default.(func() time.Time)
	// purchasereceiptDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereceiptDescUpdatedAt := purchasereceiptFields[11].Descriptor()
	// purchasereceipt.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereceipt.DefaultUpdatedAt = purchasereceiptDescUpdatedAt.Default.(func() time.Time)
	// purchasereceipt.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereceipt.UpdateDefaultUpdatedAt = purchasereceiptDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchasereceiptadjustmentHooks := schema.PurchaseReceiptAdjustment{}.Hooks()
	purchasereceiptadjustment.Hooks[0] = purchasereceiptadjustmentHooks[0]
	purchasereceiptadjustmentFields := schema.PurchaseReceiptAdjustment{}.Fields()
	_ = purchasereceiptadjustmentFields
	// purchasereceiptadjustmentDescAdjustmentNo is the schema descriptor for adjustment_no field.
	purchasereceiptadjustmentDescAdjustmentNo := purchasereceiptadjustmentFields[0].Descriptor()
	// purchasereceiptadjustment.AdjustmentNoValidator is a validator for the "adjustment_no" field. It is called by the builders before save.
	purchasereceiptadjustment.AdjustmentNoValidator = func() func(string) error {
		validators := purchasereceiptadjustmentDescAdjustmentNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(adjustment_no string) error {
			for _, fn := range fns {
				if err := fn(adjustment_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptadjustmentDescPurchaseReceiptID is the schema descriptor for purchase_receipt_id field.
	purchasereceiptadjustmentDescPurchaseReceiptID := purchasereceiptadjustmentFields[1].Descriptor()
	// purchasereceiptadjustment.PurchaseReceiptIDValidator is a validator for the "purchase_receipt_id" field. It is called by the builders before save.
	purchasereceiptadjustment.PurchaseReceiptIDValidator = purchasereceiptadjustmentDescPurchaseReceiptID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentDescReason is the schema descriptor for reason field.
	purchasereceiptadjustmentDescReason := purchasereceiptadjustmentFields[2].Descriptor()
	// purchasereceiptadjustment.ReasonValidator is a validator for the "reason" field. It is called by the builders before save.
	purchasereceiptadjustment.ReasonValidator = purchasereceiptadjustmentDescReason.Validators[0].(func(string) error)
	// purchasereceiptadjustmentDescStatus is the schema descriptor for status field.
	purchasereceiptadjustmentDescStatus := purchasereceiptadjustmentFields[3].Descriptor()
	// purchasereceiptadjustment.DefaultStatus holds the default value on creation for the status field.
	purchasereceiptadjustment.DefaultStatus = purchasereceiptadjustmentDescStatus.Default.(string)
	// purchasereceiptadjustment.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	purchasereceiptadjustment.StatusValidator = func() func(string) error {
		validators := purchasereceiptadjustmentDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptadjustmentDescIdempotencyKey is the schema descriptor for idempotency_key field.
	purchasereceiptadjustmentDescIdempotencyKey := purchasereceiptadjustmentFields[6].Descriptor()
	// purchasereceiptadjustment.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	purchasereceiptadjustment.IdempotencyKeyValidator = purchasereceiptadjustmentDescIdempotencyKey.Validators[0].(func(string) error)
	// purchasereceiptadjustmentDescIdempotencyPayloadHash is the schema descriptor for idempotency_payload_hash field.
	purchasereceiptadjustmentDescIdempotencyPayloadHash := purchasereceiptadjustmentFields[7].Descriptor()
	// purchasereceiptadjustment.IdempotencyPayloadHashValidator is a validator for the "idempotency_payload_hash" field. It is called by the builders before save.
	purchasereceiptadjustment.IdempotencyPayloadHashValidator = purchasereceiptadjustmentDescIdempotencyPayloadHash.Validators[0].(func(string) error)
	// purchasereceiptadjustmentDescIdempotencyItemCount is the schema descriptor for idempotency_item_count field.
	purchasereceiptadjustmentDescIdempotencyItemCount := purchasereceiptadjustmentFields[8].Descriptor()
	// purchasereceiptadjustment.IdempotencyItemCountValidator is a validator for the "idempotency_item_count" field. It is called by the builders before save.
	purchasereceiptadjustment.IdempotencyItemCountValidator = purchasereceiptadjustmentDescIdempotencyItemCount.Validators[0].(func(int) error)
	// purchasereceiptadjustmentDescNote is the schema descriptor for note field.
	purchasereceiptadjustmentDescNote := purchasereceiptadjustmentFields[9].Descriptor()
	// purchasereceiptadjustment.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereceiptadjustment.NoteValidator = purchasereceiptadjustmentDescNote.Validators[0].(func(string) error)
	// purchasereceiptadjustmentDescCreatedAt is the schema descriptor for created_at field.
	purchasereceiptadjustmentDescCreatedAt := purchasereceiptadjustmentFields[10].Descriptor()
	// purchasereceiptadjustment.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereceiptadjustment.DefaultCreatedAt = purchasereceiptadjustmentDescCreatedAt.Default.(func() time.Time)
	// purchasereceiptadjustmentDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereceiptadjustmentDescUpdatedAt := purchasereceiptadjustmentFields[11].Descriptor()
	// purchasereceiptadjustment.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereceiptadjustment.DefaultUpdatedAt = purchasereceiptadjustmentDescUpdatedAt.Default.(func() time.Time)
	// purchasereceiptadjustment.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereceiptadjustment.UpdateDefaultUpdatedAt = purchasereceiptadjustmentDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchasereceiptadjustmentitemHooks := schema.PurchaseReceiptAdjustmentItem{}.Hooks()
	purchasereceiptadjustmentitem.Hooks[0] = purchasereceiptadjustmentitemHooks[0]
	purchasereceiptadjustmentitemFields := schema.PurchaseReceiptAdjustmentItem{}.Fields()
	_ = purchasereceiptadjustmentitemFields
	// purchasereceiptadjustmentitemDescAdjustmentID is the schema descriptor for adjustment_id field.
	purchasereceiptadjustmentitemDescAdjustmentID := purchasereceiptadjustmentitemFields[0].Descriptor()
	// purchasereceiptadjustmentitem.AdjustmentIDValidator is a validator for the "adjustment_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.AdjustmentIDValidator = purchasereceiptadjustmentitemDescAdjustmentID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescPurchaseReceiptItemID is the schema descriptor for purchase_receipt_item_id field.
	purchasereceiptadjustmentitemDescPurchaseReceiptItemID := purchasereceiptadjustmentitemFields[1].Descriptor()
	// purchasereceiptadjustmentitem.PurchaseReceiptItemIDValidator is a validator for the "purchase_receipt_item_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.PurchaseReceiptItemIDValidator = purchasereceiptadjustmentitemDescPurchaseReceiptItemID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescAdjustType is the schema descriptor for adjust_type field.
	purchasereceiptadjustmentitemDescAdjustType := purchasereceiptadjustmentitemFields[2].Descriptor()
	// purchasereceiptadjustmentitem.AdjustTypeValidator is a validator for the "adjust_type" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.AdjustTypeValidator = func() func(string) error {
		validators := purchasereceiptadjustmentitemDescAdjustType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(adjust_type string) error {
			for _, fn := range fns {
				if err := fn(adjust_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereceiptadjustmentitemDescMaterialID is the schema descriptor for material_id field.
	purchasereceiptadjustmentitemDescMaterialID := purchasereceiptadjustmentitemFields[3].Descriptor()
	// purchasereceiptadjustmentitem.MaterialIDValidator is a validator for the "material_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.MaterialIDValidator = purchasereceiptadjustmentitemDescMaterialID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescWarehouseID is the schema descriptor for warehouse_id field.
	purchasereceiptadjustmentitemDescWarehouseID := purchasereceiptadjustmentitemFields[4].Descriptor()
	// purchasereceiptadjustmentitem.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.WarehouseIDValidator = purchasereceiptadjustmentitemDescWarehouseID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescUnitID is the schema descriptor for unit_id field.
	purchasereceiptadjustmentitemDescUnitID := purchasereceiptadjustmentitemFields[5].Descriptor()
	// purchasereceiptadjustmentitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.UnitIDValidator = purchasereceiptadjustmentitemDescUnitID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescLotID is the schema descriptor for lot_id field.
	purchasereceiptadjustmentitemDescLotID := purchasereceiptadjustmentitemFields[6].Descriptor()
	// purchasereceiptadjustmentitem.LotIDValidator is a validator for the "lot_id" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.LotIDValidator = purchasereceiptadjustmentitemDescLotID.Validators[0].(func(int) error)
	// purchasereceiptadjustmentitemDescSourceLineNo is the schema descriptor for source_line_no field.
	purchasereceiptadjustmentitemDescSourceLineNo := purchasereceiptadjustmentitemFields[8].Descriptor()
	// purchasereceiptadjustmentitem.SourceLineNoValidator is a validator for the "source_line_no" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.SourceLineNoValidator = purchasereceiptadjustmentitemDescSourceLineNo.Validators[0].(func(string) error)
	// purchasereceiptadjustmentitemDescCorrectionGroup is the schema descriptor for correction_group field.
	purchasereceiptadjustmentitemDescCorrectionGroup := purchasereceiptadjustmentitemFields[9].Descriptor()
	// purchasereceiptadjustmentitem.CorrectionGroupValidator is a validator for the "correction_group" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.CorrectionGroupValidator = purchasereceiptadjustmentitemDescCorrectionGroup.Validators[0].(func(string) error)
	// purchasereceiptadjustmentitemDescNote is the schema descriptor for note field.
	purchasereceiptadjustmentitemDescNote := purchasereceiptadjustmentitemFields[10].Descriptor()
	// purchasereceiptadjustmentitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereceiptadjustmentitem.NoteValidator = purchasereceiptadjustmentitemDescNote.Validators[0].(func(string) error)
	// purchasereceiptadjustmentitemDescCreatedAt is the schema descriptor for created_at field.
	purchasereceiptadjustmentitemDescCreatedAt := purchasereceiptadjustmentitemFields[11].Descriptor()
	// purchasereceiptadjustmentitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereceiptadjustmentitem.DefaultCreatedAt = purchasereceiptadjustmentitemDescCreatedAt.Default.(func() time.Time)
	// purchasereceiptadjustmentitemDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereceiptadjustmentitemDescUpdatedAt := purchasereceiptadjustmentitemFields[12].Descriptor()
	// purchasereceiptadjustmentitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereceiptadjustmentitem.DefaultUpdatedAt = purchasereceiptadjustmentitemDescUpdatedAt.Default.(func() time.Time)
	// purchasereceiptadjustmentitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereceiptadjustmentitem.UpdateDefaultUpdatedAt = purchasereceiptadjustmentitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchasereceiptitemHooks := schema.PurchaseReceiptItem{}.Hooks()
	purchasereceiptitem.Hooks[0] = purchasereceiptitemHooks[0]
	purchasereceiptitemFields := schema.PurchaseReceiptItem{}.Fields()
	_ = purchasereceiptitemFields
	// purchasereceiptitemDescReceiptID is the schema descriptor for receipt_id field.
	purchasereceiptitemDescReceiptID := purchasereceiptitemFields[0].Descriptor()
	// purchasereceiptitem.ReceiptIDValidator is a validator for the "receipt_id" field. It is called by the builders before save.
	purchasereceiptitem.ReceiptIDValidator = purchasereceiptitemDescReceiptID.Validators[0].(func(int) error)
	// purchasereceiptitemDescMaterialID is the schema descriptor for material_id field.
	purchasereceiptitemDescMaterialID := purchasereceiptitemFields[1].Descriptor()
	// purchasereceiptitem.MaterialIDValidator is a validator for the "material_id" field. It is called by the builders before save.
	purchasereceiptitem.MaterialIDValidator = purchasereceiptitemDescMaterialID.Validators[0].(func(int) error)
	// purchasereceiptitemDescWarehouseID is the schema descriptor for warehouse_id field.
	purchasereceiptitemDescWarehouseID := purchasereceiptitemFields[2].Descriptor()
	// purchasereceiptitem.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	purchasereceiptitem.WarehouseIDValidator = purchasereceiptitemDescWarehouseID.Validators[0].(func(int) error)
	// purchasereceiptitemDescUnitID is the schema descriptor for unit_id field.
	purchasereceiptitemDescUnitID := purchasereceiptitemFields[3].Descriptor()
	// purchasereceiptitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	purchasereceiptitem.UnitIDValidator = purchasereceiptitemDescUnitID.Validators[0].(func(int) error)
	// purchasereceiptitemDescLotID is the schema descriptor for lot_id field.
	purchasereceiptitemDescLotID := purchasereceiptitemFields[4].Descriptor()
	// purchasereceiptitem.LotIDValidator is a validator for the "lot_id" field. It is called by the builders before save.
	purchasereceiptitem.LotIDValidator = purchasereceiptitemDescLotID.Validators[0].(func(int) error)
	// purchasereceiptitemDescPurchaseOrderItemID is the schema descriptor for purchase_order_item_id field.
	purchasereceiptitemDescPurchaseOrderItemID := purchasereceiptitemFields[5].Descriptor()
	// purchasereceiptitem.PurchaseOrderItemIDValidator is a validator for the "purchase_order_item_id" field. It is called by the builders before save.
	purchasereceiptitem.PurchaseOrderItemIDValidator = purchasereceiptitemDescPurchaseOrderItemID.Validators[0].(func(int) error)
	// purchasereceiptitemDescLotNo is the schema descriptor for lot_no field.
	purchasereceiptitemDescLotNo := purchasereceiptitemFields[6].Descriptor()
	// purchasereceiptitem.LotNoValidator is a validator for the "lot_no" field. It is called by the builders before save.
	purchasereceiptitem.LotNoValidator = purchasereceiptitemDescLotNo.Validators[0].(func(string) error)
	// purchasereceiptitemDescSourceLineNo is the schema descriptor for source_line_no field.
	purchasereceiptitemDescSourceLineNo := purchasereceiptitemFields[11].Descriptor()
	// purchasereceiptitem.SourceLineNoValidator is a validator for the "source_line_no" field. It is called by the builders before save.
	purchasereceiptitem.SourceLineNoValidator = purchasereceiptitemDescSourceLineNo.Validators[0].(func(string) error)
	// purchasereceiptitemDescIdempotencyKey is the schema descriptor for idempotency_key field.
	purchasereceiptitemDescIdempotencyKey := purchasereceiptitemFields[12].Descriptor()
	// purchasereceiptitem.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	purchasereceiptitem.IdempotencyKeyValidator = purchasereceiptitemDescIdempotencyKey.Validators[0].(func(string) error)
	// purchasereceiptitemDescIdempotencyPayloadHash is the schema descriptor for idempotency_payload_hash field.
	purchasereceiptitemDescIdempotencyPayloadHash := purchasereceiptitemFields[13].Descriptor()
	// purchasereceiptitem.IdempotencyPayloadHashValidator is a validator for the "idempotency_payload_hash" field. It is called by the builders before save.
	purchasereceiptitem.IdempotencyPayloadHashValidator = purchasereceiptitemDescIdempotencyPayloadHash.Validators[0].(func(string) error)
	// purchasereceiptitemDescNote is the schema descriptor for note field.
	purchasereceiptitemDescNote := purchasereceiptitemFields[14].Descriptor()
	// purchasereceiptitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereceiptitem.NoteValidator = purchasereceiptitemDescNote.Validators[0].(func(string) error)
	// purchasereceiptitemDescCreatedAt is the schema descriptor for created_at field.
	purchasereceiptitemDescCreatedAt := purchasereceiptitemFields[15].Descriptor()
	// purchasereceiptitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereceiptitem.DefaultCreatedAt = purchasereceiptitemDescCreatedAt.Default.(func() time.Time)
	// purchasereceiptitemDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereceiptitemDescUpdatedAt := purchasereceiptitemFields[16].Descriptor()
	// purchasereceiptitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereceiptitem.DefaultUpdatedAt = purchasereceiptitemDescUpdatedAt.Default.(func() time.Time)
	// purchasereceiptitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereceiptitem.UpdateDefaultUpdatedAt = purchasereceiptitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchaserejectiondispositionHooks := schema.PurchaseRejectionDisposition{}.Hooks()
	purchaserejectiondisposition.Hooks[0] = purchaserejectiondispositionHooks[0]
	purchaserejectiondispositionFields := schema.PurchaseRejectionDisposition{}.Fields()
	_ = purchaserejectiondispositionFields
	// purchaserejectiondispositionDescDispositionNo is the schema descriptor for disposition_no field.
	purchaserejectiondispositionDescDispositionNo := purchaserejectiondispositionFields[0].Descriptor()
	// purchaserejectiondisposition.DispositionNoValidator is a validator for the "disposition_no" field. It is called by the builders before save.
	purchaserejectiondisposition.DispositionNoValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescDispositionNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(disposition_no string) error {
			for _, fn := range fns {
				if err := fn(disposition_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescQualityInspectionID is the schema descriptor for quality_inspection_id field.
	purchaserejectiondispositionDescQualityInspectionID := purchaserejectiondispositionFields[1].Descriptor()
	// purchaserejectiondisposition.QualityInspectionIDValidator is a validator for the "quality_inspection_id" field. It is called by the builders before save.
	purchaserejectiondisposition.QualityInspectionIDValidator = purchaserejectiondispositionDescQualityInspectionID.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescPurchaseReceiptID is the schema descriptor for purchase_receipt_id field.
	purchaserejectiondispositionDescPurchaseReceiptID := purchaserejectiondispositionFields[2].Descriptor()
	// purchaserejectiondisposition.PurchaseReceiptIDValidator is a validator for the "purchase_receipt_id" field. It is called by the builders before save.
	purchaserejectiondisposition.PurchaseReceiptIDValidator = purchaserejectiondispositionDescPurchaseReceiptID.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescPurchaseReceiptItemID is the schema descriptor for purchase_receipt_item_id field.
	purchaserejectiondispositionDescPurchaseReceiptItemID := purchaserejectiondispositionFields[3].Descriptor()
	// purchaserejectiondisposition.PurchaseReceiptItemIDValidator is a validator for the "purchase_receipt_item_id" field. It is called by the builders before save.
	purchaserejectiondisposition.PurchaseReceiptItemIDValidator = purchaserejectiondispositionDescPurchaseReceiptItemID.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescReplacementReceiptID is the schema descriptor for replacement_receipt_id field.
	purchaserejectiondispositionDescReplacementReceiptID := purchaserejectiondispositionFields[4].Descriptor()
	// purchaserejectiondisposition.ReplacementReceiptIDValidator is a validator for the "replacement_receipt_id" field. It is called by the builders before save.
	purchaserejectiondisposition.ReplacementReceiptIDValidator = purchaserejectiondispositionDescReplacementReceiptID.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescDispositionType is the schema descriptor for disposition_type field.
	purchaserejectiondispositionDescDispositionType := purchaserejectiondispositionFields[5].Descriptor()
	// purchaserejectiondisposition.DispositionTypeValidator is a validator for the "disposition_type" field. It is called by the builders before save.
	purchaserejectiondisposition.DispositionTypeValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescDispositionType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(disposition_type string) error {
			for _, fn := range fns {
				if err := fn(disposition_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescStatus is the schema descriptor for status field.
	purchaserejectiondispositionDescStatus := purchaserejectiondispositionFields[6].Descriptor()
	// purchaserejectiondisposition.DefaultStatus holds the default value on creation for the status field.
	purchaserejectiondisposition.DefaultStatus = purchaserejectiondispositionDescStatus.Default.(string)
	// purchaserejectiondisposition.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	purchaserejectiondisposition.StatusValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescSupplierID is the schema descriptor for supplier_id field.
	purchaserejectiondispositionDescSupplierID := purchaserejectiondispositionFields[8].Descriptor()
	// purchaserejectiondisposition.SupplierIDValidator is a validator for the "supplier_id" field. It is called by the builders before save.
	purchaserejectiondisposition.SupplierIDValidator = purchaserejectiondispositionDescSupplierID.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescSupplierName is the schema descriptor for supplier_name field.
	purchaserejectiondispositionDescSupplierName := purchaserejectiondispositionFields[9].Descriptor()
	// purchaserejectiondisposition.SupplierNameValidator is a validator for the "supplier_name" field. It is called by the builders before save.
	purchaserejectiondisposition.SupplierNameValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescSupplierName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(supplier_name string) error {
			for _, fn := range fns {
				if err := fn(supplier_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescReason is the schema descriptor for reason field.
	purchaserejectiondispositionDescReason := purchaserejectiondispositionFields[10].Descriptor()
	// purchaserejectiondisposition.ReasonValidator is a validator for the "reason" field. It is called by the builders before save.
	purchaserejectiondisposition.ReasonValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescReason.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(reason string) error {
			for _, fn := range fns {
				if err := fn(reason); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescIdempotencyKey is the schema descriptor for idempotency_key field.
	purchaserejectiondispositionDescIdempotencyKey := purchaserejectiondispositionFields[11].Descriptor()
	// purchaserejectiondisposition.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	purchaserejectiondisposition.IdempotencyKeyValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescIdempotencyKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(idempotency_key string) error {
			for _, fn := range fns {
				if err := fn(idempotency_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescIdempotencyPayloadHash is the schema descriptor for idempotency_payload_hash field.
	purchaserejectiondispositionDescIdempotencyPayloadHash := purchaserejectiondispositionFields[12].Descriptor()
	// purchaserejectiondisposition.IdempotencyPayloadHashValidator is a validator for the "idempotency_payload_hash" field. It is called by the builders before save.
	purchaserejectiondisposition.IdempotencyPayloadHashValidator = func() func(string) error {
		validators := purchaserejectiondispositionDescIdempotencyPayloadHash.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
			validators[2].(func(string) error),
		}
		return func(idempotency_payload_hash string) error {
			for _, fn := range fns {
				if err := fn(idempotency_payload_hash); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchaserejectiondispositionDescVersion is the schema descriptor for version field.
	purchaserejectiondispositionDescVersion := purchaserejectiondispositionFields[13].Descriptor()
	// purchaserejectiondisposition.DefaultVersion holds the default value on creation for the version field.
	purchaserejectiondisposition.DefaultVersion = purchaserejectiondispositionDescVersion.Default.(int)
	// purchaserejectiondisposition.VersionValidator is a validator for the "version" field. It is called by the builders before save.
	purchaserejectiondisposition.VersionValidator = purchaserejectiondispositionDescVersion.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescPostedBy is the schema descriptor for posted_by field.
	purchaserejectiondispositionDescPostedBy := purchaserejectiondispositionFields[15].Descriptor()
	// purchaserejectiondisposition.PostedByValidator is a validator for the "posted_by" field. It is called by the builders before save.
	purchaserejectiondisposition.PostedByValidator = purchaserejectiondispositionDescPostedBy.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescCancelledBy is the schema descriptor for cancelled_by field.
	purchaserejectiondispositionDescCancelledBy := purchaserejectiondispositionFields[17].Descriptor()
	// purchaserejectiondisposition.CancelledByValidator is a validator for the "cancelled_by" field. It is called by the builders before save.
	purchaserejectiondisposition.CancelledByValidator = purchaserejectiondispositionDescCancelledBy.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescCancelReason is the schema descriptor for cancel_reason field.
	purchaserejectiondispositionDescCancelReason := purchaserejectiondispositionFields[18].Descriptor()
	// purchaserejectiondisposition.CancelReasonValidator is a validator for the "cancel_reason" field. It is called by the builders before save.
	purchaserejectiondisposition.CancelReasonValidator = purchaserejectiondispositionDescCancelReason.Validators[0].(func(string) error)
	// purchaserejectiondispositionDescCreatedBy is the schema descriptor for created_by field.
	purchaserejectiondispositionDescCreatedBy := purchaserejectiondispositionFields[19].Descriptor()
	// purchaserejectiondisposition.CreatedByValidator is a validator for the "created_by" field. It is called by the builders before save.
	purchaserejectiondisposition.CreatedByValidator = purchaserejectiondispositionDescCreatedBy.Validators[0].(func(int) error)
	// purchaserejectiondispositionDescCreatedAt is the schema descriptor for created_at field.
	purchaserejectiondispositionDescCreatedAt := purchaserejectiondispositionFields[20].Descriptor()
	// purchaserejectiondisposition.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchaserejectiondisposition.DefaultCreatedAt = purchaserejectiondispositionDescCreatedAt.Default.(func() time.Time)
	purchasereturnHooks := schema.PurchaseReturn{}.Hooks()
	purchasereturn.Hooks[0] = purchasereturnHooks[0]
	purchasereturnFields := schema.PurchaseReturn{}.Fields()
	_ = purchasereturnFields
	// purchasereturnDescReturnNo is the schema descriptor for return_no field.
	purchasereturnDescReturnNo := purchasereturnFields[0].Descriptor()
	// purchasereturn.ReturnNoValidator is a validator for the "return_no" field. It is called by the builders before save.
	purchasereturn.ReturnNoValidator = func() func(string) error {
		validators := purchasereturnDescReturnNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(return_no string) error {
			for _, fn := range fns {
				if err := fn(return_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereturnDescPurchaseReceiptID is the schema descriptor for purchase_receipt_id field.
	purchasereturnDescPurchaseReceiptID := purchasereturnFields[1].Descriptor()
	// purchasereturn.PurchaseReceiptIDValidator is a validator for the "purchase_receipt_id" field. It is called by the builders before save.
	purchasereturn.PurchaseReceiptIDValidator = purchasereturnDescPurchaseReceiptID.Validators[0].(func(int) error)
	// purchasereturnDescQualityInspectionID is the schema descriptor for quality_inspection_id field.
	purchasereturnDescQualityInspectionID := purchasereturnFields[2].Descriptor()
	// purchasereturn.QualityInspectionIDValidator is a validator for the "quality_inspection_id" field. It is called by the builders before save.
	purchasereturn.QualityInspectionIDValidator = purchasereturnDescQualityInspectionID.Validators[0].(func(int) error)
	// purchasereturnDescSupplierName is the schema descriptor for supplier_name field.
	purchasereturnDescSupplierName := purchasereturnFields[3].Descriptor()
	// purchasereturn.SupplierNameValidator is a validator for the "supplier_name" field. It is called by the builders before save.
	purchasereturn.SupplierNameValidator = func() func(string) error {
		validators := purchasereturnDescSupplierName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(supplier_name string) error {
			for _, fn := range fns {
				if err := fn(supplier_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereturnDescReturnReason is the schema descriptor for return_reason field.
	purchasereturnDescReturnReason := purchasereturnFields[4].Descriptor()
	// purchasereturn.ReturnReasonValidator is a validator for the "return_reason" field. It is called by the builders before save.
	purchasereturn.ReturnReasonValidator = purchasereturnDescReturnReason.Validators[0].(func(string) error)
	// purchasereturnDescStatus is the schema descriptor for status field.
	purchasereturnDescStatus := purchasereturnFields[5].Descriptor()
	// purchasereturn.DefaultStatus holds the default value on creation for the status field.
	purchasereturn.DefaultStatus = purchasereturnDescStatus.Default.(string)
	// purchasereturn.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	purchasereturn.StatusValidator = func() func(string) error {
		validators := purchasereturnDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// purchasereturnDescIdempotencyKey is the schema descriptor for idempotency_key field.
	purchasereturnDescIdempotencyKey := purchasereturnFields[8].Descriptor()
	// purchasereturn.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	purchasereturn.IdempotencyKeyValidator = purchasereturnDescIdempotencyKey.Validators[0].(func(string) error)
	// purchasereturnDescIdempotencyPayloadHash is the schema descriptor for idempotency_payload_hash field.
	purchasereturnDescIdempotencyPayloadHash := purchasereturnFields[9].Descriptor()
	// purchasereturn.IdempotencyPayloadHashValidator is a validator for the "idempotency_payload_hash" field. It is called by the builders before save.
	purchasereturn.IdempotencyPayloadHashValidator = purchasereturnDescIdempotencyPayloadHash.Validators[0].(func(string) error)
	// purchasereturnDescIdempotencyItemCount is the schema descriptor for idempotency_item_count field.
	purchasereturnDescIdempotencyItemCount := purchasereturnFields[10].Descriptor()
	// purchasereturn.IdempotencyItemCountValidator is a validator for the "idempotency_item_count" field. It is called by the builders before save.
	purchasereturn.IdempotencyItemCountValidator = purchasereturnDescIdempotencyItemCount.Validators[0].(func(int) error)
	// purchasereturnDescNote is the schema descriptor for note field.
	purchasereturnDescNote := purchasereturnFields[11].Descriptor()
	// purchasereturn.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereturn.NoteValidator = purchasereturnDescNote.Validators[0].(func(string) error)
	// purchasereturnDescCreatedAt is the schema descriptor for created_at field.
	purchasereturnDescCreatedAt := purchasereturnFields[12].Descriptor()
	// purchasereturn.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereturn.DefaultCreatedAt = purchasereturnDescCreatedAt.Default.(func() time.Time)
	// purchasereturnDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereturnDescUpdatedAt := purchasereturnFields[13].Descriptor()
	// purchasereturn.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereturn.DefaultUpdatedAt = purchasereturnDescUpdatedAt.Default.(func() time.Time)
	// purchasereturn.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereturn.UpdateDefaultUpdatedAt = purchasereturnDescUpdatedAt.UpdateDefault.(func() time.Time)
	purchasereturnitemHooks := schema.PurchaseReturnItem{}.Hooks()
	purchasereturnitem.Hooks[0] = purchasereturnitemHooks[0]
	purchasereturnitemFields := schema.PurchaseReturnItem{}.Fields()
	_ = purchasereturnitemFields
	// purchasereturnitemDescReturnID is the schema descriptor for return_id field.
	purchasereturnitemDescReturnID := purchasereturnitemFields[0].Descriptor()
	// purchasereturnitem.ReturnIDValidator is a validator for the "return_id" field. It is called by the builders before save.
	purchasereturnitem.ReturnIDValidator = purchasereturnitemDescReturnID.Validators[0].(func(int) error)
	// purchasereturnitemDescPurchaseReceiptItemID is the schema descriptor for purchase_receipt_item_id field.
	purchasereturnitemDescPurchaseReceiptItemID := purchasereturnitemFields[1].Descriptor()
	// purchasereturnitem.PurchaseReceiptItemIDValidator is a validator for the "purchase_receipt_item_id" field. It is called by the builders before save.
	purchasereturnitem.PurchaseReceiptItemIDValidator = purchasereturnitemDescPurchaseReceiptItemID.Validators[0].(func(int) error)
	// purchasereturnitemDescMaterialID is the schema descriptor for material_id field.
	purchasereturnitemDescMaterialID := purchasereturnitemFields[2].Descriptor()
	// purchasereturnitem.MaterialIDValidator is a validator for the "material_id" field. It is called by the builders before save.
	purchasereturnitem.MaterialIDValidator = purchasereturnitemDescMaterialID.Validators[0].(func(int) error)
	// purchasereturnitemDescWarehouseID is the schema descriptor for warehouse_id field.
	purchasereturnitemDescWarehouseID := purchasereturnitemFields[3].Descriptor()
	// purchasereturnitem.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	purchasereturnitem.WarehouseIDValidator = purchasereturnitemDescWarehouseID.Validators[0].(func(int) error)
	// purchasereturnitemDescUnitID is the schema descriptor for unit_id field.
	purchasereturnitemDescUnitID := purchasereturnitemFields[4].Descriptor()
	// purchasereturnitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	purchasereturnitem.UnitIDValidator = purchasereturnitemDescUnitID.Validators[0].(func(int) error)
	// purchasereturnitemDescLotID is the schema descriptor for lot_id field.
	purchasereturnitemDescLotID := purchasereturnitemFields[5].Descriptor()
	// purchasereturnitem.LotIDValidator is a validator for the "lot_id" field. It is called by the builders before save.
	purchasereturnitem.LotIDValidator = purchasereturnitemDescLotID.Validators[0].(func(int) error)
	// purchasereturnitemDescSourceLineNo is the schema descriptor for source_line_no field.
	purchasereturnitemDescSourceLineNo := purchasereturnitemFields[9].Descriptor()
	// purchasereturnitem.SourceLineNoValidator is a validator for the "source_line_no" field. It is called by the builders before save.
	purchasereturnitem.SourceLineNoValidator = purchasereturnitemDescSourceLineNo.Validators[0].(func(string) error)
	// purchasereturnitemDescNote is the schema descriptor for note field.
	purchasereturnitemDescNote := purchasereturnitemFields[10].Descriptor()
	// purchasereturnitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	purchasereturnitem.NoteValidator = purchasereturnitemDescNote.Validators[0].(func(string) error)
	// purchasereturnitemDescCreatedAt is the schema descriptor for created_at field.
	purchasereturnitemDescCreatedAt := purchasereturnitemFields[11].Descriptor()
	// purchasereturnitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	purchasereturnitem.DefaultCreatedAt = purchasereturnitemDescCreatedAt.Default.(func() time.Time)
	// purchasereturnitemDescUpdatedAt is the schema descriptor for updated_at field.
	purchasereturnitemDescUpdatedAt := purchasereturnitemFields[12].Descriptor()
	// purchasereturnitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	purchasereturnitem.DefaultUpdatedAt = purchasereturnitemDescUpdatedAt.Default.(func() time.Time)
	// purchasereturnitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	purchasereturnitem.UpdateDefaultUpdatedAt = purchasereturnitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	qualityinspectionHooks := schema.QualityInspection{}.Hooks()
	qualityinspection.Hooks[0] = qualityinspectionHooks[0]
	qualityinspectionFields := schema.QualityInspection{}.Fields()
	_ = qualityinspectionFields
	// qualityinspectionDescInspectionNo is the schema descriptor for inspection_no field.
	qualityinspectionDescInspectionNo := qualityinspectionFields[0].Descriptor()
	// qualityinspection.InspectionNoValidator is a validator for the "inspection_no" field. It is called by the builders before save.
	qualityinspection.InspectionNoValidator = func() func(string) error {
		validators := qualityinspectionDescInspectionNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(inspection_no string) error {
			for _, fn := range fns {
				if err := fn(inspection_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// qualityinspectionDescPurchaseReceiptID is the schema descriptor for purchase_receipt_id field.
	qualityinspectionDescPurchaseReceiptID := qualityinspectionFields[1].Descriptor()
	// qualityinspection.PurchaseReceiptIDValidator is a validator for the "purchase_receipt_id" field. It is called by the builders before save.
	qualityinspection.PurchaseReceiptIDValidator = qualityinspectionDescPurchaseReceiptID.Validators[0].(func(int) error)
	// qualityinspectionDescPurchaseReceiptItemID is the schema descriptor for purchase_receipt_item_id field.
	qualityinspectionDescPurchaseReceiptItemID := qualityinspectionFields[2].Descriptor()
	// qualityinspection.PurchaseReceiptItemIDValidator is a validator for the "purchase_receipt_item_id" field. It is called by the builders before save.
	qualityinspection.PurchaseReceiptItemIDValidator = qualityinspectionDescPurchaseReceiptItemID.Validators[0].(func(int) error)
	// qualityinspectionDescInventoryLotID is the schema descriptor for inventory_lot_id field.
	qualityinspectionDescInventoryLotID := qualityinspectionFields[3].Descriptor()
	// qualityinspection.InventoryLotIDValidator is a validator for the "inventory_lot_id" field. It is called by the builders before save.
	qualityinspection.InventoryLotIDValidator = qualityinspectionDescInventoryLotID.Validators[0].(func(int) error)
	// qualityinspectionDescProductionWipBatchID is the schema descriptor for production_wip_batch_id field.
	qualityinspectionDescProductionWipBatchID := qualityinspectionFields[4].Descriptor()
	// qualityinspection.ProductionWipBatchIDValidator is a validator for the "production_wip_batch_id" field. It is called by the builders before save.
	qualityinspection.ProductionWipBatchIDValidator = qualityinspectionDescProductionWipBatchID.Validators[0].(func(int) error)
	// qualityinspectionDescGateCode is the schema descriptor for gate_code field.
	qualityinspectionDescGateCode := qualityinspectionFields[5].Descriptor()
	// qualityinspection.GateCodeValidator is a validator for the "gate_code" field. It is called by the builders before save.
	qualityinspection.GateCodeValidator = qualityinspectionDescGateCode.Validators[0].(func(string) error)
	// qualityinspectionDescMaterialID is the schema descriptor for material_id field.
	qualityinspectionDescMaterialID := qualityinspectionFields[6].Descriptor()
	// qualityinspection.MaterialIDValidator is a validator for the "material_id" field. It is called by the builders before save.
	qualityinspection.MaterialIDValidator = qualityinspectionDescMaterialID.Validators[0].(func(int) error)
	// qualityinspectionDescWarehouseID is the schema descriptor for warehouse_id field.
	qualityinspectionDescWarehouseID := qualityinspectionFields[7].Descriptor()
	// qualityinspection.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	qualityinspection.WarehouseIDValidator = qualityinspectionDescWarehouseID.Validators[0].(func(int) error)
	// qualityinspectionDescSourceType is the schema descriptor for source_type field.
	qualityinspectionDescSourceType := qualityinspectionFields[8].Descriptor()
	// qualityinspection.SourceTypeValidator is a validator for the "source_type" field. It is called by the builders before save.
	qualityinspection.SourceTypeValidator = qualityinspectionDescSourceType.Validators[0].(func(string) error)
	// qualityinspectionDescSourceID is the schema descriptor for source_id field.
	qualityinspectionDescSourceID := qualityinspectionFields[9].Descriptor()
	// qualityinspection.SourceIDValidator is a validator for the "source_id" field. It is called by the builders before save.
	qualityinspection.SourceIDValidator = qualityinspectionDescSourceID.Validators[0].(func(int) error)
	// qualityinspectionDescInspectionType is the schema descriptor for inspection_type field.
	qualityinspectionDescInspectionType := qualityinspectionFields[10].Descriptor()
	// qualityinspection.InspectionTypeValidator is a validator for the "inspection_type" field. It is called by the builders before save.
	qualityinspection.InspectionTypeValidator = qualityinspectionDescInspectionType.Validators[0].(func(string) error)
	// qualityinspectionDescSubjectType is the schema descriptor for subject_type field.
	qualityinspectionDescSubjectType := qualityinspectionFields[11].Descriptor()
	// qualityinspection.SubjectTypeValidator is a validator for the "subject_type" field. It is called by the builders before save.
	qualityinspection.SubjectTypeValidator = qualityinspectionDescSubjectType.Validators[0].(func(string) error)
	// qualityinspectionDescSubjectID is the schema descriptor for subject_id field.
	qualityinspectionDescSubjectID := qualityinspectionFields[12].Descriptor()
	// qualityinspection.SubjectIDValidator is a validator for the "subject_id" field. It is called by the builders before save.
	qualityinspection.SubjectIDValidator = qualityinspectionDescSubjectID.Validators[0].(func(int) error)
	// qualityinspectionDescStatus is the schema descriptor for status field.
	qualityinspectionDescStatus := qualityinspectionFields[13].Descriptor()
	// qualityinspection.DefaultStatus holds the default value on creation for the status field.
	qualityinspection.DefaultStatus = qualityinspectionDescStatus.Default.(string)
	// qualityinspection.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	qualityinspection.StatusValidator = func() func(string) error {
		validators := qualityinspectionDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// qualityinspectionDescResult is the schema descriptor for result field.
	qualityinspectionDescResult := qualityinspectionFields[14].Descriptor()
	// qualityinspection.ResultValidator is a validator for the "result" field. It is called by the builders before save.
	qualityinspection.ResultValidator = qualityinspectionDescResult.Validators[0].(func(string) error)
	// qualityinspectionDescOriginalLotStatus is the schema descriptor for original_lot_status field.
	qualityinspectionDescOriginalLotStatus := qualityinspectionFields[15].Descriptor()
	// qualityinspection.DefaultOriginalLotStatus holds the default value on creation for the original_lot_status field.
	qualityinspection.DefaultOriginalLotStatus = qualityinspectionDescOriginalLotStatus.Default.(string)
	// qualityinspection.OriginalLotStatusValidator is a validator for the "original_lot_status" field. It is called by the builders before save.
	qualityinspection.OriginalLotStatusValidator = qualityinspectionDescOriginalLotStatus.Validators[0].(func(string) error)
	// qualityinspectionDescInspectorID is the schema descriptor for inspector_id field.
	qualityinspectionDescInspectorID := qualityinspectionFields[17].Descriptor()
	// qualityinspection.InspectorIDValidator is a validator for the "inspector_id" field. It is called by the builders before save.
	qualityinspection.InspectorIDValidator = qualityinspectionDescInspectorID.Validators[0].(func(int) error)
	// qualityinspectionDescCorrectionOfInspectionID is the schema descriptor for correction_of_inspection_id field.
	qualityinspectionDescCorrectionOfInspectionID := qualityinspectionFields[18].Descriptor()
	// qualityinspection.CorrectionOfInspectionIDValidator is a validator for the "correction_of_inspection_id" field. It is called by the builders before save.
	qualityinspection.CorrectionOfInspectionIDValidator = qualityinspectionDescCorrectionOfInspectionID.Validators[0].(func(int) error)
	// qualityinspectionDescSupersededBy is the schema descriptor for superseded_by field.
	qualityinspectionDescSupersededBy := qualityinspectionFields[20].Descriptor()
	// qualityinspection.SupersededByValidator is a validator for the "superseded_by" field. It is called by the builders before save.
	qualityinspection.SupersededByValidator = qualityinspectionDescSupersededBy.Validators[0].(func(int) error)
	// qualityinspectionDescSupersededReason is the schema descriptor for superseded_reason field.
	qualityinspectionDescSupersededReason := qualityinspectionFields[21].Descriptor()
	// qualityinspection.SupersededReasonValidator is a validator for the "superseded_reason" field. It is called by the builders before save.
	qualityinspection.SupersededReasonValidator = qualityinspectionDescSupersededReason.Validators[0].(func(string) error)
	// qualityinspectionDescDefectRateOperator is the schema descriptor for defect_rate_operator field.
	qualityinspectionDescDefectRateOperator := qualityinspectionFields[22].Descriptor()
	// qualityinspection.DefectRateOperatorValidator is a validator for the "defect_rate_operator" field. It is called by the builders before save.
	qualityinspection.DefectRateOperatorValidator = qualityinspectionDescDefectRateOperator.Validators[0].(func(string) error)
	// qualityinspectionDescDecisionNote is the schema descriptor for decision_note field.
	qualityinspectionDescDecisionNote := qualityinspectionFields[25].Descriptor()
	// qualityinspection.DecisionNoteValidator is a validator for the "decision_note" field. It is called by the builders before save.
	qualityinspection.DecisionNoteValidator = qualityinspectionDescDecisionNote.Validators[0].(func(string) error)
	// qualityinspectionDescCreatedAt is the schema descriptor for created_at field.
	qualityinspectionDescCreatedAt := qualityinspectionFields[26].Descriptor()
	// qualityinspection.DefaultCreatedAt holds the default value on creation for the created_at field.
	qualityinspection.DefaultCreatedAt = qualityinspectionDescCreatedAt.Default.(func() time.Time)
	// qualityinspectionDescUpdatedAt is the schema descriptor for updated_at field.
	qualityinspectionDescUpdatedAt := qualityinspectionFields[27].Descriptor()
	// qualityinspection.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	qualityinspection.DefaultUpdatedAt = qualityinspectionDescUpdatedAt.Default.(func() time.Time)
	// qualityinspection.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	qualityinspection.UpdateDefaultUpdatedAt = qualityinspectionDescUpdatedAt.UpdateDefault.(func() time.Time)
	roleFields := schema.Role{}.Fields()
	_ = roleFields
	// roleDescRoleKey is the schema descriptor for role_key field.
	roleDescRoleKey := roleFields[0].Descriptor()
	// role.RoleKeyValidator is a validator for the "role_key" field. It is called by the builders before save.
	role.RoleKeyValidator = func() func(string) error {
		validators := roleDescRoleKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(role_key string) error {
			for _, fn := range fns {
				if err := fn(role_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleDescName is the schema descriptor for name field.
	roleDescName := roleFields[1].Descriptor()
	// role.NameValidator is a validator for the "name" field. It is called by the builders before save.
	role.NameValidator = func() func(string) error {
		validators := roleDescName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(name string) error {
			for _, fn := range fns {
				if err := fn(name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleDescDescription is the schema descriptor for description field.
	roleDescDescription := roleFields[2].Descriptor()
	// role.DefaultDescription holds the default value on creation for the description field.
	role.DefaultDescription = roleDescDescription.Default.(string)
	// role.DescriptionValidator is a validator for the "description" field. It is called by the builders before save.
	role.DescriptionValidator = roleDescDescription.Validators[0].(func(string) error)
	// roleDescBuiltin is the schema descriptor for builtin field.
	roleDescBuiltin := roleFields[3].Descriptor()
	// role.DefaultBuiltin holds the default value on creation for the builtin field.
	role.DefaultBuiltin = roleDescBuiltin.Default.(bool)
	// roleDescDisabled is the schema descriptor for disabled field.
	roleDescDisabled := roleFields[5].Descriptor()
	// role.DefaultDisabled holds the default value on creation for the disabled field.
	role.DefaultDisabled = roleDescDisabled.Default.(bool)
	// roleDescSortOrder is the schema descriptor for sort_order field.
	roleDescSortOrder := roleFields[6].Descriptor()
	// role.DefaultSortOrder holds the default value on creation for the sort_order field.
	role.DefaultSortOrder = roleDescSortOrder.Default.(int)
	// roleDescVersion is the schema descriptor for version field.
	roleDescVersion := roleFields[7].Descriptor()
	// role.DefaultVersion holds the default value on creation for the version field.
	role.DefaultVersion = roleDescVersion.Default.(int)
	// role.VersionValidator is a validator for the "version" field. It is called by the builders before save.
	role.VersionValidator = roleDescVersion.Validators[0].(func(int) error)
	// roleDescPrimaryMenuPaths is the schema descriptor for primary_menu_paths field.
	roleDescPrimaryMenuPaths := roleFields[9].Descriptor()
	// role.DefaultPrimaryMenuPaths holds the default value on creation for the primary_menu_paths field.
	role.DefaultPrimaryMenuPaths = roleDescPrimaryMenuPaths.Default.([]string)
	// roleDescSecondaryMenuPaths is the schema descriptor for secondary_menu_paths field.
	roleDescSecondaryMenuPaths := roleFields[10].Descriptor()
	// role.DefaultSecondaryMenuPaths holds the default value on creation for the secondary_menu_paths field.
	role.DefaultSecondaryMenuPaths = roleDescSecondaryMenuPaths.Default.([]string)
	// roleDescCreatedAt is the schema descriptor for created_at field.
	roleDescCreatedAt := roleFields[11].Descriptor()
	// role.DefaultCreatedAt holds the default value on creation for the created_at field.
	role.DefaultCreatedAt = roleDescCreatedAt.Default.(func() time.Time)
	// roleDescUpdatedAt is the schema descriptor for updated_at field.
	roleDescUpdatedAt := roleFields[12].Descriptor()
	// role.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	role.DefaultUpdatedAt = roleDescUpdatedAt.Default.(func() time.Time)
	// role.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	role.UpdateDefaultUpdatedAt = roleDescUpdatedAt.UpdateDefault.(func() time.Time)
	roledatascopeFields := schema.RoleDataScope{}.Fields()
	_ = roledatascopeFields
	// roledatascopeDescRoleID is the schema descriptor for role_id field.
	roledatascopeDescRoleID := roledatascopeFields[0].Descriptor()
	// roledatascope.RoleIDValidator is a validator for the "role_id" field. It is called by the builders before save.
	roledatascope.RoleIDValidator = roledatascopeDescRoleID.Validators[0].(func(int) error)
	// roledatascopeDescResourceType is the schema descriptor for resource_type field.
	roledatascopeDescResourceType := roledatascopeFields[1].Descriptor()
	// roledatascope.ResourceTypeValidator is a validator for the "resource_type" field. It is called by the builders before save.
	roledatascope.ResourceTypeValidator = func() func(string) error {
		validators := roledatascopeDescResourceType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(resource_type string) error {
			for _, fn := range fns {
				if err := fn(resource_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roledatascopeDescMode is the schema descriptor for mode field.
	roledatascopeDescMode := roledatascopeFields[2].Descriptor()
	// roledatascope.ModeValidator is a validator for the "mode" field. It is called by the builders before save.
	roledatascope.ModeValidator = func() func(string) error {
		validators := roledatascopeDescMode.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(mode string) error {
			for _, fn := range fns {
				if err := fn(mode); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roledatascopeDescResourceIds is the schema descriptor for resource_ids field.
	roledatascopeDescResourceIds := roledatascopeFields[3].Descriptor()
	// roledatascope.DefaultResourceIds holds the default value on creation for the resource_ids field.
	roledatascope.DefaultResourceIds = roledatascopeDescResourceIds.Default.([]int)
	// roledatascopeDescCreatedAt is the schema descriptor for created_at field.
	roledatascopeDescCreatedAt := roledatascopeFields[4].Descriptor()
	// roledatascope.DefaultCreatedAt holds the default value on creation for the created_at field.
	roledatascope.DefaultCreatedAt = roledatascopeDescCreatedAt.Default.(func() time.Time)
	// roledatascopeDescUpdatedAt is the schema descriptor for updated_at field.
	roledatascopeDescUpdatedAt := roledatascopeFields[5].Descriptor()
	// roledatascope.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	roledatascope.DefaultUpdatedAt = roledatascopeDescUpdatedAt.Default.(func() time.Time)
	// roledatascope.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	roledatascope.UpdateDefaultUpdatedAt = roledatascopeDescUpdatedAt.UpdateDefault.(func() time.Time)
	rolepermissionFields := schema.RolePermission{}.Fields()
	_ = rolepermissionFields
	// rolepermissionDescRoleID is the schema descriptor for role_id field.
	rolepermissionDescRoleID := rolepermissionFields[0].Descriptor()
	// rolepermission.RoleIDValidator is a validator for the "role_id" field. It is called by the builders before save.
	rolepermission.RoleIDValidator = rolepermissionDescRoleID.Validators[0].(func(int) error)
	// rolepermissionDescPermissionID is the schema descriptor for permission_id field.
	rolepermissionDescPermissionID := rolepermissionFields[1].Descriptor()
	// rolepermission.PermissionIDValidator is a validator for the "permission_id" field. It is called by the builders before save.
	rolepermission.PermissionIDValidator = rolepermissionDescPermissionID.Validators[0].(func(int) error)
	// rolepermissionDescCreatedAt is the schema descriptor for created_at field.
	rolepermissionDescCreatedAt := rolepermissionFields[2].Descriptor()
	// rolepermission.DefaultCreatedAt holds the default value on creation for the created_at field.
	rolepermission.DefaultCreatedAt = rolepermissionDescCreatedAt.Default.(func() time.Time)
	roleprofileFields := schema.RoleProfile{}.Fields()
	_ = roleprofileFields
	// roleprofileDescCustomerKey is the schema descriptor for customer_key field.
	roleprofileDescCustomerKey := roleprofileFields[0].Descriptor()
	// roleprofile.CustomerKeyValidator is a validator for the "customer_key" field. It is called by the builders before save.
	roleprofile.CustomerKeyValidator = func() func(string) error {
		validators := roleprofileDescCustomerKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(customer_key string) error {
			for _, fn := range fns {
				if err := fn(customer_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleprofileDescConfigRevision is the schema descriptor for config_revision field.
	roleprofileDescConfigRevision := roleprofileFields[1].Descriptor()
	// roleprofile.ConfigRevisionValidator is a validator for the "config_revision" field. It is called by the builders before save.
	roleprofile.ConfigRevisionValidator = func() func(string) error {
		validators := roleprofileDescConfigRevision.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(config_revision string) error {
			for _, fn := range fns {
				if err := fn(config_revision); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleprofileDescRoleKey is the schema descriptor for role_key field.
	roleprofileDescRoleKey := roleprofileFields[2].Descriptor()
	// roleprofile.RoleKeyValidator is a validator for the "role_key" field. It is called by the builders before save.
	roleprofile.RoleKeyValidator = func() func(string) error {
		validators := roleprofileDescRoleKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(role_key string) error {
			for _, fn := range fns {
				if err := fn(role_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleprofileDescDisplayName is the schema descriptor for display_name field.
	roleprofileDescDisplayName := roleprofileFields[3].Descriptor()
	// roleprofile.DisplayNameValidator is a validator for the "display_name" field. It is called by the builders before save.
	roleprofile.DisplayNameValidator = func() func(string) error {
		validators := roleprofileDescDisplayName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(display_name string) error {
			for _, fn := range fns {
				if err := fn(display_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// roleprofileDescDisabled is the schema descriptor for disabled field.
	roleprofileDescDisabled := roleprofileFields[4].Descriptor()
	// roleprofile.DefaultDisabled holds the default value on creation for the disabled field.
	roleprofile.DefaultDisabled = roleprofileDescDisabled.Default.(bool)
	// roleprofileDescCreatedAt is the schema descriptor for created_at field.
	roleprofileDescCreatedAt := roleprofileFields[7].Descriptor()
	// roleprofile.DefaultCreatedAt holds the default value on creation for the created_at field.
	roleprofile.DefaultCreatedAt = roleprofileDescCreatedAt.Default.(func() time.Time)
	// roleprofileDescUpdatedAt is the schema descriptor for updated_at field.
	roleprofileDescUpdatedAt := roleprofileFields[8].Descriptor()
	// roleprofile.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	roleprofile.DefaultUpdatedAt = roleprofileDescUpdatedAt.Default.(func() time.Time)
	// roleprofile.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	roleprofile.UpdateDefaultUpdatedAt = roleprofileDescUpdatedAt.UpdateDefault.(func() time.Time)
	runtimeauditeventHooks := schema.RuntimeAuditEvent{}.Hooks()
	runtimeauditevent.Hooks[0] = runtimeauditeventHooks[0]
	runtimeauditeventFields := schema.RuntimeAuditEvent{}.Fields()
	_ = runtimeauditeventFields
	// runtimeauditeventDescEventType is the schema descriptor for event_type field.
	runtimeauditeventDescEventType := runtimeauditeventFields[0].Descriptor()
	// runtimeauditevent.EventTypeValidator is a validator for the "event_type" field. It is called by the builders before save.
	runtimeauditevent.EventTypeValidator = func() func(string) error {
		validators := runtimeauditeventDescEventType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(event_type string) error {
			for _, fn := range fns {
				if err := fn(event_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// runtimeauditeventDescEventKey is the schema descriptor for event_key field.
	runtimeauditeventDescEventKey := runtimeauditeventFields[1].Descriptor()
	// runtimeauditevent.DefaultEventKey holds the default value on creation for the event_key field.
	runtimeauditevent.DefaultEventKey = runtimeauditeventDescEventKey.Default.(string)
	// runtimeauditevent.EventKeyValidator is a validator for the "event_key" field. It is called by the builders before save.
	runtimeauditevent.EventKeyValidator = runtimeauditeventDescEventKey.Validators[0].(func(string) error)
	// runtimeauditeventDescSource is the schema descriptor for source field.
	runtimeauditeventDescSource := runtimeauditeventFields[2].Descriptor()
	// runtimeauditevent.DefaultSource holds the default value on creation for the source field.
	runtimeauditevent.DefaultSource = runtimeauditeventDescSource.Default.(string)
	// runtimeauditevent.SourceValidator is a validator for the "source" field. It is called by the builders before save.
	runtimeauditevent.SourceValidator = runtimeauditeventDescSource.Validators[0].(func(string) error)
	// runtimeauditeventDescPayload is the schema descriptor for payload field.
	runtimeauditeventDescPayload := runtimeauditeventFields[3].Descriptor()
	// runtimeauditevent.DefaultPayload holds the default value on creation for the payload field.
	runtimeauditevent.DefaultPayload = runtimeauditeventDescPayload.Default.(string)
	// runtimeauditevent.PayloadValidator is a validator for the "payload" field. It is called by the builders before save.
	runtimeauditevent.PayloadValidator = runtimeauditeventDescPayload.Validators[0].(func(string) error)
	// runtimeauditeventDescCreatedAt is the schema descriptor for created_at field.
	runtimeauditeventDescCreatedAt := runtimeauditeventFields[4].Descriptor()
	// runtimeauditevent.DefaultCreatedAt holds the default value on creation for the created_at field.
	runtimeauditevent.DefaultCreatedAt = runtimeauditeventDescCreatedAt.Default.(func() time.Time)
	runtimemarkerHooks := schema.RuntimeMarker{}.Hooks()
	runtimemarker.Hooks[0] = runtimemarkerHooks[0]
	runtimemarkerFields := schema.RuntimeMarker{}.Fields()
	_ = runtimemarkerFields
	// runtimemarkerDescMarkerKey is the schema descriptor for marker_key field.
	runtimemarkerDescMarkerKey := runtimemarkerFields[0].Descriptor()
	// runtimemarker.MarkerKeyValidator is a validator for the "marker_key" field. It is called by the builders before save.
	runtimemarker.MarkerKeyValidator = func() func(string) error {
		validators := runtimemarkerDescMarkerKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(marker_key string) error {
			for _, fn := range fns {
				if err := fn(marker_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// runtimemarkerDescMarkerValue is the schema descriptor for marker_value field.
	runtimemarkerDescMarkerValue := runtimemarkerFields[1].Descriptor()
	// runtimemarker.DefaultMarkerValue holds the default value on creation for the marker_value field.
	runtimemarker.DefaultMarkerValue = runtimemarkerDescMarkerValue.Default.(string)
	// runtimemarker.MarkerValueValidator is a validator for the "marker_value" field. It is called by the builders before save.
	runtimemarker.MarkerValueValidator = runtimemarkerDescMarkerValue.Validators[0].(func(string) error)
	// runtimemarkerDescCreatedAt is the schema descriptor for created_at field.
	runtimemarkerDescCreatedAt := runtimemarkerFields[2].Descriptor()
	// runtimemarker.DefaultCreatedAt holds the default value on creation for the created_at field.
	runtimemarker.DefaultCreatedAt = runtimemarkerDescCreatedAt.Default.(func() time.Time)
	// runtimemarkerDescUpdatedAt is the schema descriptor for updated_at field.
	runtimemarkerDescUpdatedAt := runtimemarkerFields[3].Descriptor()
	// runtimemarker.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	runtimemarker.DefaultUpdatedAt = runtimemarkerDescUpdatedAt.Default.(func() time.Time)
	// runtimemarker.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	runtimemarker.UpdateDefaultUpdatedAt = runtimemarkerDescUpdatedAt.UpdateDefault.(func() time.Time)
	salesorderFields := schema.SalesOrder{}.Fields()
	_ = salesorderFields
	// salesorderDescCreateIdempotencyKey is the schema descriptor for create_idempotency_key field.
	salesorderDescCreateIdempotencyKey := salesorderFields[0].Descriptor()
	// salesorder.CreateIdempotencyKeyValidator is a validator for the "create_idempotency_key" field. It is called by the builders before save.
	salesorder.CreateIdempotencyKeyValidator = func() func(string) error {
		validators := salesorderDescCreateIdempotencyKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(create_idempotency_key string) error {
			for _, fn := range fns {
				if err := fn(create_idempotency_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderDescCreateIntentHash is the schema descriptor for create_intent_hash field.
	salesorderDescCreateIntentHash := salesorderFields[1].Descriptor()
	// salesorder.CreateIntentHashValidator is a validator for the "create_intent_hash" field. It is called by the builders before save.
	salesorder.CreateIntentHashValidator = func() func(string) error {
		validators := salesorderDescCreateIntentHash.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(create_intent_hash string) error {
			for _, fn := range fns {
				if err := fn(create_intent_hash); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderDescCreateActorID is the schema descriptor for create_actor_id field.
	salesorderDescCreateActorID := salesorderFields[2].Descriptor()
	// salesorder.CreateActorIDValidator is a validator for the "create_actor_id" field. It is called by the builders before save.
	salesorder.CreateActorIDValidator = salesorderDescCreateActorID.Validators[0].(func(int) error)
	// salesorderDescOrderNo is the schema descriptor for order_no field.
	salesorderDescOrderNo := salesorderFields[3].Descriptor()
	// salesorder.OrderNoValidator is a validator for the "order_no" field. It is called by the builders before save.
	salesorder.OrderNoValidator = func() func(string) error {
		validators := salesorderDescOrderNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(order_no string) error {
			for _, fn := range fns {
				if err := fn(order_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderDescCustomerID is the schema descriptor for customer_id field.
	salesorderDescCustomerID := salesorderFields[4].Descriptor()
	// salesorder.CustomerIDValidator is a validator for the "customer_id" field. It is called by the builders before save.
	salesorder.CustomerIDValidator = salesorderDescCustomerID.Validators[0].(func(int) error)
	// salesorderDescCurrency is the schema descriptor for currency field.
	salesorderDescCurrency := salesorderFields[5].Descriptor()
	// salesorder.DefaultCurrency holds the default value on creation for the currency field.
	salesorder.DefaultCurrency = salesorderDescCurrency.Default.(string)
	// salesorder.CurrencyValidator is a validator for the "currency" field. It is called by the builders before save.
	salesorder.CurrencyValidator = func() func(string) error {
		validators := salesorderDescCurrency.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(currency string) error {
			for _, fn := range fns {
				if err := fn(currency); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderDescCustomerOrderNo is the schema descriptor for customer_order_no field.
	salesorderDescCustomerOrderNo := salesorderFields[6].Descriptor()
	// salesorder.CustomerOrderNoValidator is a validator for the "customer_order_no" field. It is called by the builders before save.
	salesorder.CustomerOrderNoValidator = salesorderDescCustomerOrderNo.Validators[0].(func(string) error)
	// salesorderDescSalesOwner is the schema descriptor for sales_owner field.
	salesorderDescSalesOwner := salesorderFields[8].Descriptor()
	// salesorder.SalesOwnerValidator is a validator for the "sales_owner" field. It is called by the builders before save.
	salesorder.SalesOwnerValidator = salesorderDescSalesOwner.Validators[0].(func(string) error)
	// salesorderDescPaymentMethod is the schema descriptor for payment_method field.
	salesorderDescPaymentMethod := salesorderFields[11].Descriptor()
	// salesorder.PaymentMethodValidator is a validator for the "payment_method" field. It is called by the builders before save.
	salesorder.PaymentMethodValidator = salesorderDescPaymentMethod.Validators[0].(func(string) error)
	// salesorderDescPaymentTermDays is the schema descriptor for payment_term_days field.
	salesorderDescPaymentTermDays := salesorderFields[12].Descriptor()
	// salesorder.PaymentTermDaysValidator is a validator for the "payment_term_days" field. It is called by the builders before save.
	salesorder.PaymentTermDaysValidator = salesorderDescPaymentTermDays.Validators[0].(func(int) error)
	// salesorderDescPriceConditionNote is the schema descriptor for price_condition_note field.
	salesorderDescPriceConditionNote := salesorderFields[13].Descriptor()
	// salesorder.PriceConditionNoteValidator is a validator for the "price_condition_note" field. It is called by the builders before save.
	salesorder.PriceConditionNoteValidator = salesorderDescPriceConditionNote.Validators[0].(func(string) error)
	// salesorderDescTaxMode is the schema descriptor for tax_mode field.
	salesorderDescTaxMode := salesorderFields[14].Descriptor()
	// salesorder.TaxModeValidator is a validator for the "tax_mode" field. It is called by the builders before save.
	salesorder.TaxModeValidator = salesorderDescTaxMode.Validators[0].(func(string) error)
	// salesorderDescFreightTerms is the schema descriptor for freight_terms field.
	salesorderDescFreightTerms := salesorderFields[16].Descriptor()
	// salesorder.FreightTermsValidator is a validator for the "freight_terms" field. It is called by the builders before save.
	salesorder.FreightTermsValidator = salesorderDescFreightTerms.Validators[0].(func(string) error)
	// salesorderDescLifecycleStatus is the schema descriptor for lifecycle_status field.
	salesorderDescLifecycleStatus := salesorderFields[23].Descriptor()
	// salesorder.DefaultLifecycleStatus holds the default value on creation for the lifecycle_status field.
	salesorder.DefaultLifecycleStatus = salesorderDescLifecycleStatus.Default.(string)
	// salesorder.LifecycleStatusValidator is a validator for the "lifecycle_status" field. It is called by the builders before save.
	salesorder.LifecycleStatusValidator = func() func(string) error {
		validators := salesorderDescLifecycleStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(lifecycle_status string) error {
			for _, fn := range fns {
				if err := fn(lifecycle_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderDescVersion is the schema descriptor for version field.
	salesorderDescVersion := salesorderFields[24].Descriptor()
	// salesorder.DefaultVersion holds the default value on creation for the version field.
	salesorder.DefaultVersion = salesorderDescVersion.Default.(int)
	// salesorder.VersionValidator is a validator for the "version" field. It is called by the builders before save.
	salesorder.VersionValidator = salesorderDescVersion.Validators[0].(func(int) error)
	// salesorderDescSettlementAction is the schema descriptor for settlement_action field.
	salesorderDescSettlementAction := salesorderFields[25].Descriptor()
	// salesorder.SettlementActionValidator is a validator for the "settlement_action" field. It is called by the builders before save.
	salesorder.SettlementActionValidator = salesorderDescSettlementAction.Validators[0].(func(string) error)
	// salesorderDescSettlementMode is the schema descriptor for settlement_mode field.
	salesorderDescSettlementMode := salesorderFields[26].Descriptor()
	// salesorder.SettlementModeValidator is a validator for the "settlement_mode" field. It is called by the builders before save.
	salesorder.SettlementModeValidator = salesorderDescSettlementMode.Validators[0].(func(string) error)
	// salesorderDescSettlementReason is the schema descriptor for settlement_reason field.
	salesorderDescSettlementReason := salesorderFields[27].Descriptor()
	// salesorder.SettlementReasonValidator is a validator for the "settlement_reason" field. It is called by the builders before save.
	salesorder.SettlementReasonValidator = salesorderDescSettlementReason.Validators[0].(func(string) error)
	// salesorderDescSettledBy is the schema descriptor for settled_by field.
	salesorderDescSettledBy := salesorderFields[29].Descriptor()
	// salesorder.SettledByValidator is a validator for the "settled_by" field. It is called by the builders before save.
	salesorder.SettledByValidator = salesorderDescSettledBy.Validators[0].(func(int) error)
	// salesorderDescNote is the schema descriptor for note field.
	salesorderDescNote := salesorderFields[30].Descriptor()
	// salesorder.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	salesorder.NoteValidator = salesorderDescNote.Validators[0].(func(string) error)
	// salesorderDescCreatedAt is the schema descriptor for created_at field.
	salesorderDescCreatedAt := salesorderFields[31].Descriptor()
	// salesorder.DefaultCreatedAt holds the default value on creation for the created_at field.
	salesorder.DefaultCreatedAt = salesorderDescCreatedAt.Default.(func() time.Time)
	// salesorderDescUpdatedAt is the schema descriptor for updated_at field.
	salesorderDescUpdatedAt := salesorderFields[32].Descriptor()
	// salesorder.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	salesorder.DefaultUpdatedAt = salesorderDescUpdatedAt.Default.(func() time.Time)
	// salesorder.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	salesorder.UpdateDefaultUpdatedAt = salesorderDescUpdatedAt.UpdateDefault.(func() time.Time)
	salesorderitemFields := schema.SalesOrderItem{}.Fields()
	_ = salesorderitemFields
	// salesorderitemDescSalesOrderID is the schema descriptor for sales_order_id field.
	salesorderitemDescSalesOrderID := salesorderitemFields[0].Descriptor()
	// salesorderitem.SalesOrderIDValidator is a validator for the "sales_order_id" field. It is called by the builders before save.
	salesorderitem.SalesOrderIDValidator = salesorderitemDescSalesOrderID.Validators[0].(func(int) error)
	// salesorderitemDescLineNo is the schema descriptor for line_no field.
	salesorderitemDescLineNo := salesorderitemFields[1].Descriptor()
	// salesorderitem.LineNoValidator is a validator for the "line_no" field. It is called by the builders before save.
	salesorderitem.LineNoValidator = salesorderitemDescLineNo.Validators[0].(func(int) error)
	// salesorderitemDescDisplayOrder is the schema descriptor for display_order field.
	salesorderitemDescDisplayOrder := salesorderitemFields[2].Descriptor()
	// salesorderitem.DisplayOrderValidator is a validator for the "display_order" field. It is called by the builders before save.
	salesorderitem.DisplayOrderValidator = salesorderitemDescDisplayOrder.Validators[0].(func(int) error)
	// salesorderitemDescProductID is the schema descriptor for product_id field.
	salesorderitemDescProductID := salesorderitemFields[3].Descriptor()
	// salesorderitem.ProductIDValidator is a validator for the "product_id" field. It is called by the builders before save.
	salesorderitem.ProductIDValidator = salesorderitemDescProductID.Validators[0].(func(int) error)
	// salesorderitemDescRequestedProductName is the schema descriptor for requested_product_name field.
	salesorderitemDescRequestedProductName := salesorderitemFields[4].Descriptor()
	// salesorderitem.RequestedProductNameValidator is a validator for the "requested_product_name" field. It is called by the builders before save.
	salesorderitem.RequestedProductNameValidator = salesorderitemDescRequestedProductName.Validators[0].(func(string) error)
	// salesorderitemDescCustomerProductNo is the schema descriptor for customer_product_no field.
	salesorderitemDescCustomerProductNo := salesorderitemFields[5].Descriptor()
	// salesorderitem.CustomerProductNoValidator is a validator for the "customer_product_no" field. It is called by the builders before save.
	salesorderitem.CustomerProductNoValidator = salesorderitemDescCustomerProductNo.Validators[0].(func(string) error)
	// salesorderitemDescOrderCategory is the schema descriptor for order_category field.
	salesorderitemDescOrderCategory := salesorderitemFields[6].Descriptor()
	// salesorderitem.DefaultOrderCategory holds the default value on creation for the order_category field.
	salesorderitem.DefaultOrderCategory = salesorderitemDescOrderCategory.Default.(string)
	// salesorderitem.OrderCategoryValidator is a validator for the "order_category" field. It is called by the builders before save.
	salesorderitem.OrderCategoryValidator = salesorderitemDescOrderCategory.Validators[0].(func(string) error)
	// salesorderitemDescPreShipmentSampleQuantity is the schema descriptor for pre_shipment_sample_quantity field.
	salesorderitemDescPreShipmentSampleQuantity := salesorderitemFields[7].Descriptor()
	// salesorderitem.DefaultPreShipmentSampleQuantity holds the default value on creation for the pre_shipment_sample_quantity field.
	salesorderitem.DefaultPreShipmentSampleQuantity = salesorderitemDescPreShipmentSampleQuantity.Default.(decimal.Decimal)
	// salesorderitemDescProcessRequirement is the schema descriptor for process_requirement field.
	salesorderitemDescProcessRequirement := salesorderitemFields[8].Descriptor()
	// salesorderitem.ProcessRequirementValidator is a validator for the "process_requirement" field. It is called by the builders before save.
	salesorderitem.ProcessRequirementValidator = salesorderitemDescProcessRequirement.Validators[0].(func(string) error)
	// salesorderitemDescBomID is the schema descriptor for bom_id field.
	salesorderitemDescBomID := salesorderitemFields[10].Descriptor()
	// salesorderitem.BomIDValidator is a validator for the "bom_id" field. It is called by the builders before save.
	salesorderitem.BomIDValidator = salesorderitemDescBomID.Validators[0].(func(int) error)
	// salesorderitemDescBomFingerprint is the schema descriptor for bom_fingerprint field.
	salesorderitemDescBomFingerprint := salesorderitemFields[11].Descriptor()
	// salesorderitem.BomFingerprintValidator is a validator for the "bom_fingerprint" field. It is called by the builders before save.
	salesorderitem.BomFingerprintValidator = salesorderitemDescBomFingerprint.Validators[0].(func(string) error)
	// salesorderitemDescProductSkuID is the schema descriptor for product_sku_id field.
	salesorderitemDescProductSkuID := salesorderitemFields[12].Descriptor()
	// salesorderitem.ProductSkuIDValidator is a validator for the "product_sku_id" field. It is called by the builders before save.
	salesorderitem.ProductSkuIDValidator = salesorderitemDescProductSkuID.Validators[0].(func(int) error)
	// salesorderitemDescUnitID is the schema descriptor for unit_id field.
	salesorderitemDescUnitID := salesorderitemFields[13].Descriptor()
	// salesorderitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	salesorderitem.UnitIDValidator = salesorderitemDescUnitID.Validators[0].(func(int) error)
	// salesorderitemDescProductCodeSnapshot is the schema descriptor for product_code_snapshot field.
	salesorderitemDescProductCodeSnapshot := salesorderitemFields[14].Descriptor()
	// salesorderitem.ProductCodeSnapshotValidator is a validator for the "product_code_snapshot" field. It is called by the builders before save.
	salesorderitem.ProductCodeSnapshotValidator = salesorderitemDescProductCodeSnapshot.Validators[0].(func(string) error)
	// salesorderitemDescProductNameSnapshot is the schema descriptor for product_name_snapshot field.
	salesorderitemDescProductNameSnapshot := salesorderitemFields[15].Descriptor()
	// salesorderitem.ProductNameSnapshotValidator is a validator for the "product_name_snapshot" field. It is called by the builders before save.
	salesorderitem.ProductNameSnapshotValidator = salesorderitemDescProductNameSnapshot.Validators[0].(func(string) error)
	// salesorderitemDescColorSnapshot is the schema descriptor for color_snapshot field.
	salesorderitemDescColorSnapshot := salesorderitemFields[16].Descriptor()
	// salesorderitem.ColorSnapshotValidator is a validator for the "color_snapshot" field. It is called by the builders before save.
	salesorderitem.ColorSnapshotValidator = salesorderitemDescColorSnapshot.Validators[0].(func(string) error)
	// salesorderitemDescLineStatus is the schema descriptor for line_status field.
	salesorderitemDescLineStatus := salesorderitemFields[21].Descriptor()
	// salesorderitem.DefaultLineStatus holds the default value on creation for the line_status field.
	salesorderitem.DefaultLineStatus = salesorderitemDescLineStatus.Default.(string)
	// salesorderitem.LineStatusValidator is a validator for the "line_status" field. It is called by the builders before save.
	salesorderitem.LineStatusValidator = func() func(string) error {
		validators := salesorderitemDescLineStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(line_status string) error {
			for _, fn := range fns {
				if err := fn(line_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// salesorderitemDescNote is the schema descriptor for note field.
	salesorderitemDescNote := salesorderitemFields[22].Descriptor()
	// salesorderitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	salesorderitem.NoteValidator = salesorderitemDescNote.Validators[0].(func(string) error)
	// salesorderitemDescCreatedAt is the schema descriptor for created_at field.
	salesorderitemDescCreatedAt := salesorderitemFields[23].Descriptor()
	// salesorderitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	salesorderitem.DefaultCreatedAt = salesorderitemDescCreatedAt.Default.(func() time.Time)
	// salesorderitemDescUpdatedAt is the schema descriptor for updated_at field.
	salesorderitemDescUpdatedAt := salesorderitemFields[24].Descriptor()
	// salesorderitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	salesorderitem.DefaultUpdatedAt = salesorderitemDescUpdatedAt.Default.(func() time.Time)
	// salesorderitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	salesorderitem.UpdateDefaultUpdatedAt = salesorderitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	shipmentHooks := schema.Shipment{}.Hooks()
	shipment.Hooks[0] = shipmentHooks[0]
	shipmentFields := schema.Shipment{}.Fields()
	_ = shipmentFields
	// shipmentDescShipmentNo is the schema descriptor for shipment_no field.
	shipmentDescShipmentNo := shipmentFields[0].Descriptor()
	// shipment.ShipmentNoValidator is a validator for the "shipment_no" field. It is called by the builders before save.
	shipment.ShipmentNoValidator = func() func(string) error {
		validators := shipmentDescShipmentNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(shipment_no string) error {
			for _, fn := range fns {
				if err := fn(shipment_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// shipmentDescSalesOrderID is the schema descriptor for sales_order_id field.
	shipmentDescSalesOrderID := shipmentFields[1].Descriptor()
	// shipment.SalesOrderIDValidator is a validator for the "sales_order_id" field. It is called by the builders before save.
	shipment.SalesOrderIDValidator = shipmentDescSalesOrderID.Validators[0].(func(int) error)
	// shipmentDescCustomerID is the schema descriptor for customer_id field.
	shipmentDescCustomerID := shipmentFields[2].Descriptor()
	// shipment.CustomerIDValidator is a validator for the "customer_id" field. It is called by the builders before save.
	shipment.CustomerIDValidator = shipmentDescCustomerID.Validators[0].(func(int) error)
	// shipmentDescCustomerSnapshot is the schema descriptor for customer_snapshot field.
	shipmentDescCustomerSnapshot := shipmentFields[3].Descriptor()
	// shipment.CustomerSnapshotValidator is a validator for the "customer_snapshot" field. It is called by the builders before save.
	shipment.CustomerSnapshotValidator = shipmentDescCustomerSnapshot.Validators[0].(func(string) error)
	// shipmentDescStatus is the schema descriptor for status field.
	shipmentDescStatus := shipmentFields[5].Descriptor()
	// shipment.DefaultStatus holds the default value on creation for the status field.
	shipment.DefaultStatus = shipmentDescStatus.Default.(string)
	// shipment.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	shipment.StatusValidator = func() func(string) error {
		validators := shipmentDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// shipmentDescVersion is the schema descriptor for version field.
	shipmentDescVersion := shipmentFields[6].Descriptor()
	// shipment.DefaultVersion holds the default value on creation for the version field.
	shipment.DefaultVersion = shipmentDescVersion.Default.(int)
	// shipment.VersionValidator is a validator for the "version" field. It is called by the builders before save.
	shipment.VersionValidator = shipmentDescVersion.Validators[0].(func(int) error)
	// shipmentDescFinanceReleaseStatus is the schema descriptor for finance_release_status field.
	shipmentDescFinanceReleaseStatus := shipmentFields[7].Descriptor()
	// shipment.DefaultFinanceReleaseStatus holds the default value on creation for the finance_release_status field.
	shipment.DefaultFinanceReleaseStatus = shipmentDescFinanceReleaseStatus.Default.(string)
	// shipment.FinanceReleaseStatusValidator is a validator for the "finance_release_status" field. It is called by the builders before save.
	shipment.FinanceReleaseStatusValidator = func() func(string) error {
		validators := shipmentDescFinanceReleaseStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(finance_release_status string) error {
			for _, fn := range fns {
				if err := fn(finance_release_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// shipmentDescFinanceReleaseVersion is the schema descriptor for finance_release_version field.
	shipmentDescFinanceReleaseVersion := shipmentFields[8].Descriptor()
	// shipment.DefaultFinanceReleaseVersion holds the default value on creation for the finance_release_version field.
	shipment.DefaultFinanceReleaseVersion = shipmentDescFinanceReleaseVersion.Default.(int)
	// shipment.FinanceReleaseVersionValidator is a validator for the "finance_release_version" field. It is called by the builders before save.
	shipment.FinanceReleaseVersionValidator = shipmentDescFinanceReleaseVersion.Validators[0].(func(int) error)
	// shipmentDescFinanceReleasedBy is the schema descriptor for finance_released_by field.
	shipmentDescFinanceReleasedBy := shipmentFields[10].Descriptor()
	// shipment.FinanceReleasedByValidator is a validator for the "finance_released_by" field. It is called by the builders before save.
	shipment.FinanceReleasedByValidator = shipmentDescFinanceReleasedBy.Validators[0].(func(int) error)
	// shipmentDescFinanceReleaseProcessInstanceID is the schema descriptor for finance_release_process_instance_id field.
	shipmentDescFinanceReleaseProcessInstanceID := shipmentFields[11].Descriptor()
	// shipment.FinanceReleaseProcessInstanceIDValidator is a validator for the "finance_release_process_instance_id" field. It is called by the builders before save.
	shipment.FinanceReleaseProcessInstanceIDValidator = shipmentDescFinanceReleaseProcessInstanceID.Validators[0].(func(int) error)
	// shipmentDescFinanceReleaseProcessNodeID is the schema descriptor for finance_release_process_node_id field.
	shipmentDescFinanceReleaseProcessNodeID := shipmentFields[12].Descriptor()
	// shipment.FinanceReleaseProcessNodeIDValidator is a validator for the "finance_release_process_node_id" field. It is called by the builders before save.
	shipment.FinanceReleaseProcessNodeIDValidator = shipmentDescFinanceReleaseProcessNodeID.Validators[0].(func(int) error)
	// shipmentDescFinanceReleaseNote is the schema descriptor for finance_release_note field.
	shipmentDescFinanceReleaseNote := shipmentFields[13].Descriptor()
	// shipment.FinanceReleaseNoteValidator is a validator for the "finance_release_note" field. It is called by the builders before save.
	shipment.FinanceReleaseNoteValidator = shipmentDescFinanceReleaseNote.Validators[0].(func(string) error)
	// shipmentDescIdempotencyKey is the schema descriptor for idempotency_key field.
	shipmentDescIdempotencyKey := shipmentFields[14].Descriptor()
	// shipment.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	shipment.IdempotencyKeyValidator = func() func(string) error {
		validators := shipmentDescIdempotencyKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(idempotency_key string) error {
			for _, fn := range fns {
				if err := fn(idempotency_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// shipmentDescTransportMethod is the schema descriptor for transport_method field.
	shipmentDescTransportMethod := shipmentFields[17].Descriptor()
	// shipment.TransportMethodValidator is a validator for the "transport_method" field. It is called by the builders before save.
	shipment.TransportMethodValidator = shipmentDescTransportMethod.Validators[0].(func(string) error)
	// shipmentDescCarrierName is the schema descriptor for carrier_name field.
	shipmentDescCarrierName := shipmentFields[18].Descriptor()
	// shipment.CarrierNameValidator is a validator for the "carrier_name" field. It is called by the builders before save.
	shipment.CarrierNameValidator = shipmentDescCarrierName.Validators[0].(func(string) error)
	// shipmentDescTrackingNo is the schema descriptor for tracking_no field.
	shipmentDescTrackingNo := shipmentFields[19].Descriptor()
	// shipment.TrackingNoValidator is a validator for the "tracking_no" field. It is called by the builders before save.
	shipment.TrackingNoValidator = shipmentDescTrackingNo.Validators[0].(func(string) error)
	// shipmentDescPackageCount is the schema descriptor for package_count field.
	shipmentDescPackageCount := shipmentFields[20].Descriptor()
	// shipment.PackageCountValidator is a validator for the "package_count" field. It is called by the builders before save.
	shipment.PackageCountValidator = shipmentDescPackageCount.Validators[0].(func(int) error)
	// shipmentDescShippingMark is the schema descriptor for shipping_mark field.
	shipmentDescShippingMark := shipmentFields[23].Descriptor()
	// shipment.ShippingMarkValidator is a validator for the "shipping_mark" field. It is called by the builders before save.
	shipment.ShippingMarkValidator = shipmentDescShippingMark.Validators[0].(func(string) error)
	// shipmentDescTaxModeSnapshot is the schema descriptor for tax_mode_snapshot field.
	shipmentDescTaxModeSnapshot := shipmentFields[27].Descriptor()
	// shipment.TaxModeSnapshotValidator is a validator for the "tax_mode_snapshot" field. It is called by the builders before save.
	shipment.TaxModeSnapshotValidator = shipmentDescTaxModeSnapshot.Validators[0].(func(string) error)
	// shipmentDescFreightCurrency is the schema descriptor for freight_currency field.
	shipmentDescFreightCurrency := shipmentFields[29].Descriptor()
	// shipment.FreightCurrencyValidator is a validator for the "freight_currency" field. It is called by the builders before save.
	shipment.FreightCurrencyValidator = shipmentDescFreightCurrency.Validators[0].(func(string) error)
	// shipmentDescNote is the schema descriptor for note field.
	shipmentDescNote := shipmentFields[32].Descriptor()
	// shipment.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	shipment.NoteValidator = shipmentDescNote.Validators[0].(func(string) error)
	// shipmentDescCreatedAt is the schema descriptor for created_at field.
	shipmentDescCreatedAt := shipmentFields[33].Descriptor()
	// shipment.DefaultCreatedAt holds the default value on creation for the created_at field.
	shipment.DefaultCreatedAt = shipmentDescCreatedAt.Default.(func() time.Time)
	// shipmentDescUpdatedAt is the schema descriptor for updated_at field.
	shipmentDescUpdatedAt := shipmentFields[34].Descriptor()
	// shipment.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	shipment.DefaultUpdatedAt = shipmentDescUpdatedAt.Default.(func() time.Time)
	// shipment.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	shipment.UpdateDefaultUpdatedAt = shipmentDescUpdatedAt.UpdateDefault.(func() time.Time)
	shipmentitemHooks := schema.ShipmentItem{}.Hooks()
	shipmentitem.Hooks[0] = shipmentitemHooks[0]
	shipmentitemFields := schema.ShipmentItem{}.Fields()
	_ = shipmentitemFields
	// shipmentitemDescShipmentID is the schema descriptor for shipment_id field.
	shipmentitemDescShipmentID := shipmentitemFields[0].Descriptor()
	// shipmentitem.ShipmentIDValidator is a validator for the "shipment_id" field. It is called by the builders before save.
	shipmentitem.ShipmentIDValidator = shipmentitemDescShipmentID.Validators[0].(func(int) error)
	// shipmentitemDescSalesOrderItemID is the schema descriptor for sales_order_item_id field.
	shipmentitemDescSalesOrderItemID := shipmentitemFields[1].Descriptor()
	// shipmentitem.SalesOrderItemIDValidator is a validator for the "sales_order_item_id" field. It is called by the builders before save.
	shipmentitem.SalesOrderItemIDValidator = shipmentitemDescSalesOrderItemID.Validators[0].(func(int) error)
	// shipmentitemDescProductID is the schema descriptor for product_id field.
	shipmentitemDescProductID := shipmentitemFields[2].Descriptor()
	// shipmentitem.ProductIDValidator is a validator for the "product_id" field. It is called by the builders before save.
	shipmentitem.ProductIDValidator = shipmentitemDescProductID.Validators[0].(func(int) error)
	// shipmentitemDescProductSkuID is the schema descriptor for product_sku_id field.
	shipmentitemDescProductSkuID := shipmentitemFields[3].Descriptor()
	// shipmentitem.ProductSkuIDValidator is a validator for the "product_sku_id" field. It is called by the builders before save.
	shipmentitem.ProductSkuIDValidator = shipmentitemDescProductSkuID.Validators[0].(func(int) error)
	// shipmentitemDescWarehouseID is the schema descriptor for warehouse_id field.
	shipmentitemDescWarehouseID := shipmentitemFields[4].Descriptor()
	// shipmentitem.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	shipmentitem.WarehouseIDValidator = shipmentitemDescWarehouseID.Validators[0].(func(int) error)
	// shipmentitemDescUnitID is the schema descriptor for unit_id field.
	shipmentitemDescUnitID := shipmentitemFields[5].Descriptor()
	// shipmentitem.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	shipmentitem.UnitIDValidator = shipmentitemDescUnitID.Validators[0].(func(int) error)
	// shipmentitemDescLotID is the schema descriptor for lot_id field.
	shipmentitemDescLotID := shipmentitemFields[6].Descriptor()
	// shipmentitem.LotIDValidator is a validator for the "lot_id" field. It is called by the builders before save.
	shipmentitem.LotIDValidator = shipmentitemDescLotID.Validators[0].(func(int) error)
	// shipmentitemDescCurrencySnapshot is the schema descriptor for currency_snapshot field.
	shipmentitemDescCurrencySnapshot := shipmentitemFields[11].Descriptor()
	// shipmentitem.DefaultCurrencySnapshot holds the default value on creation for the currency_snapshot field.
	shipmentitem.DefaultCurrencySnapshot = shipmentitemDescCurrencySnapshot.Default.(string)
	// shipmentitem.CurrencySnapshotValidator is a validator for the "currency_snapshot" field. It is called by the builders before save.
	shipmentitem.CurrencySnapshotValidator = func() func(string) error {
		validators := shipmentitemDescCurrencySnapshot.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(currency_snapshot string) error {
			for _, fn := range fns {
				if err := fn(currency_snapshot); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// shipmentitemDescPackageDescription is the schema descriptor for package_description field.
	shipmentitemDescPackageDescription := shipmentitemFields[12].Descriptor()
	// shipmentitem.PackageDescriptionValidator is a validator for the "package_description" field. It is called by the builders before save.
	shipmentitem.PackageDescriptionValidator = shipmentitemDescPackageDescription.Validators[0].(func(string) error)
	// shipmentitemDescCaseNo is the schema descriptor for case_no field.
	shipmentitemDescCaseNo := shipmentitemFields[13].Descriptor()
	// shipmentitem.CaseNoValidator is a validator for the "case_no" field. It is called by the builders before save.
	shipmentitem.CaseNoValidator = shipmentitemDescCaseNo.Validators[0].(func(string) error)
	// shipmentitemDescNote is the schema descriptor for note field.
	shipmentitemDescNote := shipmentitemFields[14].Descriptor()
	// shipmentitem.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	shipmentitem.NoteValidator = shipmentitemDescNote.Validators[0].(func(string) error)
	// shipmentitemDescCreatedAt is the schema descriptor for created_at field.
	shipmentitemDescCreatedAt := shipmentitemFields[15].Descriptor()
	// shipmentitem.DefaultCreatedAt holds the default value on creation for the created_at field.
	shipmentitem.DefaultCreatedAt = shipmentitemDescCreatedAt.Default.(func() time.Time)
	// shipmentitemDescUpdatedAt is the schema descriptor for updated_at field.
	shipmentitemDescUpdatedAt := shipmentitemFields[16].Descriptor()
	// shipmentitem.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	shipmentitem.DefaultUpdatedAt = shipmentitemDescUpdatedAt.Default.(func() time.Time)
	// shipmentitem.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	shipmentitem.UpdateDefaultUpdatedAt = shipmentitemDescUpdatedAt.UpdateDefault.(func() time.Time)
	sourceorderlifecycleeventFields := schema.SourceOrderLifecycleEvent{}.Fields()
	_ = sourceorderlifecycleeventFields
	// sourceorderlifecycleeventDescSourceType is the schema descriptor for source_type field.
	sourceorderlifecycleeventDescSourceType := sourceorderlifecycleeventFields[0].Descriptor()
	// sourceorderlifecycleevent.SourceTypeValidator is a validator for the "source_type" field. It is called by the builders before save.
	sourceorderlifecycleevent.SourceTypeValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescSourceType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(source_type string) error {
			for _, fn := range fns {
				if err := fn(source_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescSourceID is the schema descriptor for source_id field.
	sourceorderlifecycleeventDescSourceID := sourceorderlifecycleeventFields[1].Descriptor()
	// sourceorderlifecycleevent.SourceIDValidator is a validator for the "source_id" field. It is called by the builders before save.
	sourceorderlifecycleevent.SourceIDValidator = sourceorderlifecycleeventDescSourceID.Validators[0].(func(int) error)
	// sourceorderlifecycleeventDescSourceVersion is the schema descriptor for source_version field.
	sourceorderlifecycleeventDescSourceVersion := sourceorderlifecycleeventFields[2].Descriptor()
	// sourceorderlifecycleevent.SourceVersionValidator is a validator for the "source_version" field. It is called by the builders before save.
	sourceorderlifecycleevent.SourceVersionValidator = sourceorderlifecycleeventDescSourceVersion.Validators[0].(func(int) error)
	// sourceorderlifecycleeventDescActionKey is the schema descriptor for action_key field.
	sourceorderlifecycleeventDescActionKey := sourceorderlifecycleeventFields[3].Descriptor()
	// sourceorderlifecycleevent.ActionKeyValidator is a validator for the "action_key" field. It is called by the builders before save.
	sourceorderlifecycleevent.ActionKeyValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescActionKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(action_key string) error {
			for _, fn := range fns {
				if err := fn(action_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescFromStatus is the schema descriptor for from_status field.
	sourceorderlifecycleeventDescFromStatus := sourceorderlifecycleeventFields[4].Descriptor()
	// sourceorderlifecycleevent.FromStatusValidator is a validator for the "from_status" field. It is called by the builders before save.
	sourceorderlifecycleevent.FromStatusValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescFromStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(from_status string) error {
			for _, fn := range fns {
				if err := fn(from_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescToStatus is the schema descriptor for to_status field.
	sourceorderlifecycleeventDescToStatus := sourceorderlifecycleeventFields[5].Descriptor()
	// sourceorderlifecycleevent.ToStatusValidator is a validator for the "to_status" field. It is called by the builders before save.
	sourceorderlifecycleevent.ToStatusValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescToStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(to_status string) error {
			for _, fn := range fns {
				if err := fn(to_status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescIdempotencyKey is the schema descriptor for idempotency_key field.
	sourceorderlifecycleeventDescIdempotencyKey := sourceorderlifecycleeventFields[6].Descriptor()
	// sourceorderlifecycleevent.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	sourceorderlifecycleevent.IdempotencyKeyValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescIdempotencyKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(idempotency_key string) error {
			for _, fn := range fns {
				if err := fn(idempotency_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescIntentHash is the schema descriptor for intent_hash field.
	sourceorderlifecycleeventDescIntentHash := sourceorderlifecycleeventFields[7].Descriptor()
	// sourceorderlifecycleevent.IntentHashValidator is a validator for the "intent_hash" field. It is called by the builders before save.
	sourceorderlifecycleevent.IntentHashValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescIntentHash.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
			validators[2].(func(string) error),
		}
		return func(intent_hash string) error {
			for _, fn := range fns {
				if err := fn(intent_hash); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescReason is the schema descriptor for reason field.
	sourceorderlifecycleeventDescReason := sourceorderlifecycleeventFields[8].Descriptor()
	// sourceorderlifecycleevent.ReasonValidator is a validator for the "reason" field. It is called by the builders before save.
	sourceorderlifecycleevent.ReasonValidator = sourceorderlifecycleeventDescReason.Validators[0].(func(string) error)
	// sourceorderlifecycleeventDescCloseMode is the schema descriptor for close_mode field.
	sourceorderlifecycleeventDescCloseMode := sourceorderlifecycleeventFields[9].Descriptor()
	// sourceorderlifecycleevent.CloseModeValidator is a validator for the "close_mode" field. It is called by the builders before save.
	sourceorderlifecycleevent.CloseModeValidator = sourceorderlifecycleeventDescCloseMode.Validators[0].(func(string) error)
	// sourceorderlifecycleeventDescResultContract is the schema descriptor for result_contract field.
	sourceorderlifecycleeventDescResultContract := sourceorderlifecycleeventFields[10].Descriptor()
	// sourceorderlifecycleevent.ResultContractValidator is a validator for the "result_contract" field. It is called by the builders before save.
	sourceorderlifecycleevent.ResultContractValidator = func() func(string) error {
		validators := sourceorderlifecycleeventDescResultContract.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(result_contract string) error {
			for _, fn := range fns {
				if err := fn(result_contract); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// sourceorderlifecycleeventDescActorID is the schema descriptor for actor_id field.
	sourceorderlifecycleeventDescActorID := sourceorderlifecycleeventFields[12].Descriptor()
	// sourceorderlifecycleevent.ActorIDValidator is a validator for the "actor_id" field. It is called by the builders before save.
	sourceorderlifecycleevent.ActorIDValidator = sourceorderlifecycleeventDescActorID.Validators[0].(func(int) error)
	// sourceorderlifecycleeventDescCreatedAt is the schema descriptor for created_at field.
	sourceorderlifecycleeventDescCreatedAt := sourceorderlifecycleeventFields[13].Descriptor()
	// sourceorderlifecycleevent.DefaultCreatedAt holds the default value on creation for the created_at field.
	sourceorderlifecycleevent.DefaultCreatedAt = sourceorderlifecycleeventDescCreatedAt.Default.(func() time.Time)
	stockreservationHooks := schema.StockReservation{}.Hooks()
	stockreservation.Hooks[0] = stockreservationHooks[0]
	stockreservationFields := schema.StockReservation{}.Fields()
	_ = stockreservationFields
	// stockreservationDescReservationNo is the schema descriptor for reservation_no field.
	stockreservationDescReservationNo := stockreservationFields[0].Descriptor()
	// stockreservation.ReservationNoValidator is a validator for the "reservation_no" field. It is called by the builders before save.
	stockreservation.ReservationNoValidator = func() func(string) error {
		validators := stockreservationDescReservationNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(reservation_no string) error {
			for _, fn := range fns {
				if err := fn(reservation_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// stockreservationDescStatus is the schema descriptor for status field.
	stockreservationDescStatus := stockreservationFields[1].Descriptor()
	// stockreservation.DefaultStatus holds the default value on creation for the status field.
	stockreservation.DefaultStatus = stockreservationDescStatus.Default.(string)
	// stockreservation.StatusValidator is a validator for the "status" field. It is called by the builders before save.
	stockreservation.StatusValidator = func() func(string) error {
		validators := stockreservationDescStatus.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(status string) error {
			for _, fn := range fns {
				if err := fn(status); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// stockreservationDescSalesOrderID is the schema descriptor for sales_order_id field.
	stockreservationDescSalesOrderID := stockreservationFields[2].Descriptor()
	// stockreservation.SalesOrderIDValidator is a validator for the "sales_order_id" field. It is called by the builders before save.
	stockreservation.SalesOrderIDValidator = stockreservationDescSalesOrderID.Validators[0].(func(int) error)
	// stockreservationDescSalesOrderItemID is the schema descriptor for sales_order_item_id field.
	stockreservationDescSalesOrderItemID := stockreservationFields[3].Descriptor()
	// stockreservation.SalesOrderItemIDValidator is a validator for the "sales_order_item_id" field. It is called by the builders before save.
	stockreservation.SalesOrderItemIDValidator = stockreservationDescSalesOrderItemID.Validators[0].(func(int) error)
	// stockreservationDescProductID is the schema descriptor for product_id field.
	stockreservationDescProductID := stockreservationFields[4].Descriptor()
	// stockreservation.ProductIDValidator is a validator for the "product_id" field. It is called by the builders before save.
	stockreservation.ProductIDValidator = stockreservationDescProductID.Validators[0].(func(int) error)
	// stockreservationDescProductSkuID is the schema descriptor for product_sku_id field.
	stockreservationDescProductSkuID := stockreservationFields[5].Descriptor()
	// stockreservation.ProductSkuIDValidator is a validator for the "product_sku_id" field. It is called by the builders before save.
	stockreservation.ProductSkuIDValidator = stockreservationDescProductSkuID.Validators[0].(func(int) error)
	// stockreservationDescWarehouseID is the schema descriptor for warehouse_id field.
	stockreservationDescWarehouseID := stockreservationFields[6].Descriptor()
	// stockreservation.WarehouseIDValidator is a validator for the "warehouse_id" field. It is called by the builders before save.
	stockreservation.WarehouseIDValidator = stockreservationDescWarehouseID.Validators[0].(func(int) error)
	// stockreservationDescUnitID is the schema descriptor for unit_id field.
	stockreservationDescUnitID := stockreservationFields[7].Descriptor()
	// stockreservation.UnitIDValidator is a validator for the "unit_id" field. It is called by the builders before save.
	stockreservation.UnitIDValidator = stockreservationDescUnitID.Validators[0].(func(int) error)
	// stockreservationDescLotID is the schema descriptor for lot_id field.
	stockreservationDescLotID := stockreservationFields[8].Descriptor()
	// stockreservation.LotIDValidator is a validator for the "lot_id" field. It is called by the builders before save.
	stockreservation.LotIDValidator = stockreservationDescLotID.Validators[0].(func(int) error)
	// stockreservationDescIdempotencyKey is the schema descriptor for idempotency_key field.
	stockreservationDescIdempotencyKey := stockreservationFields[10].Descriptor()
	// stockreservation.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	stockreservation.IdempotencyKeyValidator = func() func(string) error {
		validators := stockreservationDescIdempotencyKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(idempotency_key string) error {
			for _, fn := range fns {
				if err := fn(idempotency_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// stockreservationDescReservedAt is the schema descriptor for reserved_at field.
	stockreservationDescReservedAt := stockreservationFields[11].Descriptor()
	// stockreservation.DefaultReservedAt holds the default value on creation for the reserved_at field.
	stockreservation.DefaultReservedAt = stockreservationDescReservedAt.Default.(func() time.Time)
	// stockreservationDescReservedAtSpecified is the schema descriptor for reserved_at_specified field.
	stockreservationDescReservedAtSpecified := stockreservationFields[12].Descriptor()
	// stockreservation.DefaultReservedAtSpecified holds the default value on creation for the reserved_at_specified field.
	stockreservation.DefaultReservedAtSpecified = stockreservationDescReservedAtSpecified.Default.(bool)
	// stockreservationDescNote is the schema descriptor for note field.
	stockreservationDescNote := stockreservationFields[15].Descriptor()
	// stockreservation.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	stockreservation.NoteValidator = stockreservationDescNote.Validators[0].(func(string) error)
	// stockreservationDescCreatedAt is the schema descriptor for created_at field.
	stockreservationDescCreatedAt := stockreservationFields[16].Descriptor()
	// stockreservation.DefaultCreatedAt holds the default value on creation for the created_at field.
	stockreservation.DefaultCreatedAt = stockreservationDescCreatedAt.Default.(func() time.Time)
	// stockreservationDescUpdatedAt is the schema descriptor for updated_at field.
	stockreservationDescUpdatedAt := stockreservationFields[17].Descriptor()
	// stockreservation.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	stockreservation.DefaultUpdatedAt = stockreservationDescUpdatedAt.Default.(func() time.Time)
	// stockreservation.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	stockreservation.UpdateDefaultUpdatedAt = stockreservationDescUpdatedAt.UpdateDefault.(func() time.Time)
	supplierFields := schema.Supplier{}.Fields()
	_ = supplierFields
	// supplierDescCode is the schema descriptor for code field.
	supplierDescCode := supplierFields[0].Descriptor()
	// supplier.CodeValidator is a validator for the "code" field. It is called by the builders before save.
	supplier.CodeValidator = func() func(string) error {
		validators := supplierDescCode.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(code string) error {
			for _, fn := range fns {
				if err := fn(code); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// supplierDescName is the schema descriptor for name field.
	supplierDescName := supplierFields[1].Descriptor()
	// supplier.NameValidator is a validator for the "name" field. It is called by the builders before save.
	supplier.NameValidator = func() func(string) error {
		validators := supplierDescName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(name string) error {
			for _, fn := range fns {
				if err := fn(name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// supplierDescShortName is the schema descriptor for short_name field.
	supplierDescShortName := supplierFields[2].Descriptor()
	// supplier.ShortNameValidator is a validator for the "short_name" field. It is called by the builders before save.
	supplier.ShortNameValidator = supplierDescShortName.Validators[0].(func(string) error)
	// supplierDescSupplierType is the schema descriptor for supplier_type field.
	supplierDescSupplierType := supplierFields[3].Descriptor()
	// supplier.SupplierTypeValidator is a validator for the "supplier_type" field. It is called by the builders before save.
	supplier.SupplierTypeValidator = supplierDescSupplierType.Validators[0].(func(string) error)
	// supplierDescAddress is the schema descriptor for address field.
	supplierDescAddress := supplierFields[4].Descriptor()
	// supplier.AddressValidator is a validator for the "address" field. It is called by the builders before save.
	supplier.AddressValidator = supplierDescAddress.Validators[0].(func(string) error)
	// supplierDescTaxNo is the schema descriptor for tax_no field.
	supplierDescTaxNo := supplierFields[5].Descriptor()
	// supplier.TaxNoValidator is a validator for the "tax_no" field. It is called by the builders before save.
	supplier.TaxNoValidator = supplierDescTaxNo.Validators[0].(func(string) error)
	// supplierDescDefaultPaymentTermDays is the schema descriptor for default_payment_term_days field.
	supplierDescDefaultPaymentTermDays := supplierFields[6].Descriptor()
	// supplier.DefaultDefaultPaymentTermDays holds the default value on creation for the default_payment_term_days field.
	supplier.DefaultDefaultPaymentTermDays = supplierDescDefaultPaymentTermDays.Default.(int)
	// supplier.DefaultPaymentTermDaysValidator is a validator for the "default_payment_term_days" field. It is called by the builders before save.
	supplier.DefaultPaymentTermDaysValidator = supplierDescDefaultPaymentTermDays.Validators[0].(func(int) error)
	// supplierDescDefaultPaymentMethod is the schema descriptor for default_payment_method field.
	supplierDescDefaultPaymentMethod := supplierFields[7].Descriptor()
	// supplier.DefaultPaymentMethodValidator is a validator for the "default_payment_method" field. It is called by the builders before save.
	supplier.DefaultPaymentMethodValidator = supplierDescDefaultPaymentMethod.Validators[0].(func(string) error)
	// supplierDescDefaultInvoiceCategory is the schema descriptor for default_invoice_category field.
	supplierDescDefaultInvoiceCategory := supplierFields[9].Descriptor()
	// supplier.DefaultInvoiceCategoryValidator is a validator for the "default_invoice_category" field. It is called by the builders before save.
	supplier.DefaultInvoiceCategoryValidator = supplierDescDefaultInvoiceCategory.Validators[0].(func(string) error)
	// supplierDescIsActive is the schema descriptor for is_active field.
	supplierDescIsActive := supplierFields[10].Descriptor()
	// supplier.DefaultIsActive holds the default value on creation for the is_active field.
	supplier.DefaultIsActive = supplierDescIsActive.Default.(bool)
	// supplierDescNote is the schema descriptor for note field.
	supplierDescNote := supplierFields[11].Descriptor()
	// supplier.NoteValidator is a validator for the "note" field. It is called by the builders before save.
	supplier.NoteValidator = supplierDescNote.Validators[0].(func(string) error)
	// supplierDescCreatedAt is the schema descriptor for created_at field.
	supplierDescCreatedAt := supplierFields[12].Descriptor()
	// supplier.DefaultCreatedAt holds the default value on creation for the created_at field.
	supplier.DefaultCreatedAt = supplierDescCreatedAt.Default.(func() time.Time)
	// supplierDescUpdatedAt is the schema descriptor for updated_at field.
	supplierDescUpdatedAt := supplierFields[13].Descriptor()
	// supplier.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	supplier.DefaultUpdatedAt = supplierDescUpdatedAt.Default.(func() time.Time)
	// supplier.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	supplier.UpdateDefaultUpdatedAt = supplierDescUpdatedAt.UpdateDefault.(func() time.Time)
	unitFields := schema.Unit{}.Fields()
	_ = unitFields
	// unitDescCode is the schema descriptor for code field.
	unitDescCode := unitFields[0].Descriptor()
	// unit.CodeValidator is a validator for the "code" field. It is called by the builders before save.
	unit.CodeValidator = func() func(string) error {
		validators := unitDescCode.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(code string) error {
			for _, fn := range fns {
				if err := fn(code); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// unitDescName is the schema descriptor for name field.
	unitDescName := unitFields[1].Descriptor()
	// unit.NameValidator is a validator for the "name" field. It is called by the builders before save.
	unit.NameValidator = func() func(string) error {
		validators := unitDescName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(name string) error {
			for _, fn := range fns {
				if err := fn(name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// unitDescPrecision is the schema descriptor for precision field.
	unitDescPrecision := unitFields[2].Descriptor()
	// unit.DefaultPrecision holds the default value on creation for the precision field.
	unit.DefaultPrecision = unitDescPrecision.Default.(int)
	// unit.PrecisionValidator is a validator for the "precision" field. It is called by the builders before save.
	unit.PrecisionValidator = unitDescPrecision.Validators[0].(func(int) error)
	// unitDescIsActive is the schema descriptor for is_active field.
	unitDescIsActive := unitFields[3].Descriptor()
	// unit.DefaultIsActive holds the default value on creation for the is_active field.
	unit.DefaultIsActive = unitDescIsActive.Default.(bool)
	// unitDescCreatedAt is the schema descriptor for created_at field.
	unitDescCreatedAt := unitFields[4].Descriptor()
	// unit.DefaultCreatedAt holds the default value on creation for the created_at field.
	unit.DefaultCreatedAt = unitDescCreatedAt.Default.(func() time.Time)
	// unitDescUpdatedAt is the schema descriptor for updated_at field.
	unitDescUpdatedAt := unitFields[5].Descriptor()
	// unit.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	unit.DefaultUpdatedAt = unitDescUpdatedAt.Default.(func() time.Time)
	// unit.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	unit.UpdateDefaultUpdatedAt = unitDescUpdatedAt.UpdateDefault.(func() time.Time)
	warehouseFields := schema.Warehouse{}.Fields()
	_ = warehouseFields
	// warehouseDescCode is the schema descriptor for code field.
	warehouseDescCode := warehouseFields[0].Descriptor()
	// warehouse.CodeValidator is a validator for the "code" field. It is called by the builders before save.
	warehouse.CodeValidator = func() func(string) error {
		validators := warehouseDescCode.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(code string) error {
			for _, fn := range fns {
				if err := fn(code); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// warehouseDescName is the schema descriptor for name field.
	warehouseDescName := warehouseFields[1].Descriptor()
	// warehouse.NameValidator is a validator for the "name" field. It is called by the builders before save.
	warehouse.NameValidator = func() func(string) error {
		validators := warehouseDescName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(name string) error {
			for _, fn := range fns {
				if err := fn(name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// warehouseDescType is the schema descriptor for type field.
	warehouseDescType := warehouseFields[2].Descriptor()
	// warehouse.TypeValidator is a validator for the "type" field. It is called by the builders before save.
	warehouse.TypeValidator = func() func(string) error {
		validators := warehouseDescType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(_type string) error {
			for _, fn := range fns {
				if err := fn(_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// warehouseDescIsActive is the schema descriptor for is_active field.
	warehouseDescIsActive := warehouseFields[3].Descriptor()
	// warehouse.DefaultIsActive holds the default value on creation for the is_active field.
	warehouse.DefaultIsActive = warehouseDescIsActive.Default.(bool)
	// warehouseDescCreatedAt is the schema descriptor for created_at field.
	warehouseDescCreatedAt := warehouseFields[4].Descriptor()
	// warehouse.DefaultCreatedAt holds the default value on creation for the created_at field.
	warehouse.DefaultCreatedAt = warehouseDescCreatedAt.Default.(func() time.Time)
	// warehouseDescUpdatedAt is the schema descriptor for updated_at field.
	warehouseDescUpdatedAt := warehouseFields[5].Descriptor()
	// warehouse.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	warehouse.DefaultUpdatedAt = warehouseDescUpdatedAt.Default.(func() time.Time)
	// warehouse.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	warehouse.UpdateDefaultUpdatedAt = warehouseDescUpdatedAt.UpdateDefault.(func() time.Time)
	workpoolFields := schema.WorkPool{}.Fields()
	_ = workpoolFields
	// workpoolDescCustomerKey is the schema descriptor for customer_key field.
	workpoolDescCustomerKey := workpoolFields[0].Descriptor()
	// workpool.CustomerKeyValidator is a validator for the "customer_key" field. It is called by the builders before save.
	workpool.CustomerKeyValidator = func() func(string) error {
		validators := workpoolDescCustomerKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(customer_key string) error {
			for _, fn := range fns {
				if err := fn(customer_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolDescConfigRevision is the schema descriptor for config_revision field.
	workpoolDescConfigRevision := workpoolFields[1].Descriptor()
	// workpool.ConfigRevisionValidator is a validator for the "config_revision" field. It is called by the builders before save.
	workpool.ConfigRevisionValidator = func() func(string) error {
		validators := workpoolDescConfigRevision.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(config_revision string) error {
			for _, fn := range fns {
				if err := fn(config_revision); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolDescPoolKey is the schema descriptor for pool_key field.
	workpoolDescPoolKey := workpoolFields[2].Descriptor()
	// workpool.PoolKeyValidator is a validator for the "pool_key" field. It is called by the builders before save.
	workpool.PoolKeyValidator = func() func(string) error {
		validators := workpoolDescPoolKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(pool_key string) error {
			for _, fn := range fns {
				if err := fn(pool_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolDescModuleKey is the schema descriptor for module_key field.
	workpoolDescModuleKey := workpoolFields[3].Descriptor()
	// workpool.ModuleKeyValidator is a validator for the "module_key" field. It is called by the builders before save.
	workpool.ModuleKeyValidator = func() func(string) error {
		validators := workpoolDescModuleKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(module_key string) error {
			for _, fn := range fns {
				if err := fn(module_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolDescDisplayName is the schema descriptor for display_name field.
	workpoolDescDisplayName := workpoolFields[4].Descriptor()
	// workpool.DisplayNameValidator is a validator for the "display_name" field. It is called by the builders before save.
	workpool.DisplayNameValidator = func() func(string) error {
		validators := workpoolDescDisplayName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(display_name string) error {
			for _, fn := range fns {
				if err := fn(display_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolDescDescription is the schema descriptor for description field.
	workpoolDescDescription := workpoolFields[5].Descriptor()
	// workpool.DefaultDescription holds the default value on creation for the description field.
	workpool.DefaultDescription = workpoolDescDescription.Default.(string)
	// workpool.DescriptionValidator is a validator for the "description" field. It is called by the builders before save.
	workpool.DescriptionValidator = workpoolDescDescription.Validators[0].(func(string) error)
	// workpoolDescCreatedAt is the schema descriptor for created_at field.
	workpoolDescCreatedAt := workpoolFields[6].Descriptor()
	// workpool.DefaultCreatedAt holds the default value on creation for the created_at field.
	workpool.DefaultCreatedAt = workpoolDescCreatedAt.Default.(func() time.Time)
	// workpoolDescUpdatedAt is the schema descriptor for updated_at field.
	workpoolDescUpdatedAt := workpoolFields[7].Descriptor()
	// workpool.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	workpool.DefaultUpdatedAt = workpoolDescUpdatedAt.Default.(func() time.Time)
	// workpool.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	workpool.UpdateDefaultUpdatedAt = workpoolDescUpdatedAt.UpdateDefault.(func() time.Time)
	workpoolmembershipFields := schema.WorkPoolMembership{}.Fields()
	_ = workpoolmembershipFields
	// workpoolmembershipDescCustomerKey is the schema descriptor for customer_key field.
	workpoolmembershipDescCustomerKey := workpoolmembershipFields[0].Descriptor()
	// workpoolmembership.CustomerKeyValidator is a validator for the "customer_key" field. It is called by the builders before save.
	workpoolmembership.CustomerKeyValidator = func() func(string) error {
		validators := workpoolmembershipDescCustomerKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(customer_key string) error {
			for _, fn := range fns {
				if err := fn(customer_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolmembershipDescConfigRevision is the schema descriptor for config_revision field.
	workpoolmembershipDescConfigRevision := workpoolmembershipFields[1].Descriptor()
	// workpoolmembership.ConfigRevisionValidator is a validator for the "config_revision" field. It is called by the builders before save.
	workpoolmembership.ConfigRevisionValidator = func() func(string) error {
		validators := workpoolmembershipDescConfigRevision.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(config_revision string) error {
			for _, fn := range fns {
				if err := fn(config_revision); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolmembershipDescPoolKey is the schema descriptor for pool_key field.
	workpoolmembershipDescPoolKey := workpoolmembershipFields[2].Descriptor()
	// workpoolmembership.PoolKeyValidator is a validator for the "pool_key" field. It is called by the builders before save.
	workpoolmembership.PoolKeyValidator = func() func(string) error {
		validators := workpoolmembershipDescPoolKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(pool_key string) error {
			for _, fn := range fns {
				if err := fn(pool_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolmembershipDescRoleKey is the schema descriptor for role_key field.
	workpoolmembershipDescRoleKey := workpoolmembershipFields[3].Descriptor()
	// workpoolmembership.DefaultRoleKey holds the default value on creation for the role_key field.
	workpoolmembership.DefaultRoleKey = workpoolmembershipDescRoleKey.Default.(string)
	// workpoolmembership.RoleKeyValidator is a validator for the "role_key" field. It is called by the builders before save.
	workpoolmembership.RoleKeyValidator = workpoolmembershipDescRoleKey.Validators[0].(func(string) error)
	// workpoolmembershipDescUserID is the schema descriptor for user_id field.
	workpoolmembershipDescUserID := workpoolmembershipFields[4].Descriptor()
	// workpoolmembership.DefaultUserID holds the default value on creation for the user_id field.
	workpoolmembership.DefaultUserID = workpoolmembershipDescUserID.Default.(int)
	// workpoolmembership.UserIDValidator is a validator for the "user_id" field. It is called by the builders before save.
	workpoolmembership.UserIDValidator = workpoolmembershipDescUserID.Validators[0].(func(int) error)
	// workpoolmembershipDescStrategy is the schema descriptor for strategy field.
	workpoolmembershipDescStrategy := workpoolmembershipFields[5].Descriptor()
	// workpoolmembership.DefaultStrategy holds the default value on creation for the strategy field.
	workpoolmembership.DefaultStrategy = workpoolmembershipDescStrategy.Default.(string)
	// workpoolmembership.StrategyValidator is a validator for the "strategy" field. It is called by the builders before save.
	workpoolmembership.StrategyValidator = func() func(string) error {
		validators := workpoolmembershipDescStrategy.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(strategy string) error {
			for _, fn := range fns {
				if err := fn(strategy); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workpoolmembershipDescPriority is the schema descriptor for priority field.
	workpoolmembershipDescPriority := workpoolmembershipFields[6].Descriptor()
	// workpoolmembership.DefaultPriority holds the default value on creation for the priority field.
	workpoolmembership.DefaultPriority = workpoolmembershipDescPriority.Default.(int)
	// workpoolmembershipDescEnabled is the schema descriptor for enabled field.
	workpoolmembershipDescEnabled := workpoolmembershipFields[7].Descriptor()
	// workpoolmembership.DefaultEnabled holds the default value on creation for the enabled field.
	workpoolmembership.DefaultEnabled = workpoolmembershipDescEnabled.Default.(bool)
	// workpoolmembershipDescCreatedAt is the schema descriptor for created_at field.
	workpoolmembershipDescCreatedAt := workpoolmembershipFields[8].Descriptor()
	// workpoolmembership.DefaultCreatedAt holds the default value on creation for the created_at field.
	workpoolmembership.DefaultCreatedAt = workpoolmembershipDescCreatedAt.Default.(func() time.Time)
	// workpoolmembershipDescUpdatedAt is the schema descriptor for updated_at field.
	workpoolmembershipDescUpdatedAt := workpoolmembershipFields[9].Descriptor()
	// workpoolmembership.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	workpoolmembership.DefaultUpdatedAt = workpoolmembershipDescUpdatedAt.Default.(func() time.Time)
	// workpoolmembership.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	workpoolmembership.UpdateDefaultUpdatedAt = workpoolmembershipDescUpdatedAt.UpdateDefault.(func() time.Time)
	workflowbusinessstateFields := schema.WorkflowBusinessState{}.Fields()
	_ = workflowbusinessstateFields
	// workflowbusinessstateDescSourceType is the schema descriptor for source_type field.
	workflowbusinessstateDescSourceType := workflowbusinessstateFields[0].Descriptor()
	// workflowbusinessstate.SourceTypeValidator is a validator for the "source_type" field. It is called by the builders before save.
	workflowbusinessstate.SourceTypeValidator = func() func(string) error {
		validators := workflowbusinessstateDescSourceType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(source_type string) error {
			for _, fn := range fns {
				if err := fn(source_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowbusinessstateDescSourceID is the schema descriptor for source_id field.
	workflowbusinessstateDescSourceID := workflowbusinessstateFields[1].Descriptor()
	// workflowbusinessstate.SourceIDValidator is a validator for the "source_id" field. It is called by the builders before save.
	workflowbusinessstate.SourceIDValidator = workflowbusinessstateDescSourceID.Validators[0].(func(int) error)
	// workflowbusinessstateDescSourceNo is the schema descriptor for source_no field.
	workflowbusinessstateDescSourceNo := workflowbusinessstateFields[2].Descriptor()
	// workflowbusinessstate.SourceNoValidator is a validator for the "source_no" field. It is called by the builders before save.
	workflowbusinessstate.SourceNoValidator = workflowbusinessstateDescSourceNo.Validators[0].(func(string) error)
	// workflowbusinessstateDescOrderID is the schema descriptor for order_id field.
	workflowbusinessstateDescOrderID := workflowbusinessstateFields[3].Descriptor()
	// workflowbusinessstate.OrderIDValidator is a validator for the "order_id" field. It is called by the builders before save.
	workflowbusinessstate.OrderIDValidator = workflowbusinessstateDescOrderID.Validators[0].(func(int) error)
	// workflowbusinessstateDescBatchID is the schema descriptor for batch_id field.
	workflowbusinessstateDescBatchID := workflowbusinessstateFields[4].Descriptor()
	// workflowbusinessstate.BatchIDValidator is a validator for the "batch_id" field. It is called by the builders before save.
	workflowbusinessstate.BatchIDValidator = workflowbusinessstateDescBatchID.Validators[0].(func(int) error)
	// workflowbusinessstateDescBusinessStatusKey is the schema descriptor for business_status_key field.
	workflowbusinessstateDescBusinessStatusKey := workflowbusinessstateFields[5].Descriptor()
	// workflowbusinessstate.BusinessStatusKeyValidator is a validator for the "business_status_key" field. It is called by the builders before save.
	workflowbusinessstate.BusinessStatusKeyValidator = func() func(string) error {
		validators := workflowbusinessstateDescBusinessStatusKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(business_status_key string) error {
			for _, fn := range fns {
				if err := fn(business_status_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowbusinessstateDescOwnerRoleKey is the schema descriptor for owner_role_key field.
	workflowbusinessstateDescOwnerRoleKey := workflowbusinessstateFields[6].Descriptor()
	// workflowbusinessstate.OwnerRoleKeyValidator is a validator for the "owner_role_key" field. It is called by the builders before save.
	workflowbusinessstate.OwnerRoleKeyValidator = workflowbusinessstateDescOwnerRoleKey.Validators[0].(func(string) error)
	// workflowbusinessstateDescBlockedReason is the schema descriptor for blocked_reason field.
	workflowbusinessstateDescBlockedReason := workflowbusinessstateFields[7].Descriptor()
	// workflowbusinessstate.BlockedReasonValidator is a validator for the "blocked_reason" field. It is called by the builders before save.
	workflowbusinessstate.BlockedReasonValidator = workflowbusinessstateDescBlockedReason.Validators[0].(func(string) error)
	// workflowbusinessstateDescStatusChangedAt is the schema descriptor for status_changed_at field.
	workflowbusinessstateDescStatusChangedAt := workflowbusinessstateFields[8].Descriptor()
	// workflowbusinessstate.DefaultStatusChangedAt holds the default value on creation for the status_changed_at field.
	workflowbusinessstate.DefaultStatusChangedAt = workflowbusinessstateDescStatusChangedAt.Default.(func() time.Time)
	// workflowbusinessstateDescCreatedAt is the schema descriptor for created_at field.
	workflowbusinessstateDescCreatedAt := workflowbusinessstateFields[10].Descriptor()
	// workflowbusinessstate.DefaultCreatedAt holds the default value on creation for the created_at field.
	workflowbusinessstate.DefaultCreatedAt = workflowbusinessstateDescCreatedAt.Default.(func() time.Time)
	// workflowbusinessstateDescUpdatedAt is the schema descriptor for updated_at field.
	workflowbusinessstateDescUpdatedAt := workflowbusinessstateFields[11].Descriptor()
	// workflowbusinessstate.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	workflowbusinessstate.DefaultUpdatedAt = workflowbusinessstateDescUpdatedAt.Default.(func() time.Time)
	// workflowbusinessstate.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	workflowbusinessstate.UpdateDefaultUpdatedAt = workflowbusinessstateDescUpdatedAt.UpdateDefault.(func() time.Time)
	workflowtaskHooks := schema.WorkflowTask{}.Hooks()
	workflowtask.Hooks[0] = workflowtaskHooks[0]
	workflowtaskFields := schema.WorkflowTask{}.Fields()
	_ = workflowtaskFields
	// workflowtaskDescTaskNo is the schema descriptor for task_no field.
	workflowtaskDescTaskNo := workflowtaskFields[0].Descriptor()
	// workflowtask.TaskNoValidator is a validator for the "task_no" field. It is called by the builders before save.
	workflowtask.TaskNoValidator = func() func(string) error {
		validators := workflowtaskDescTaskNo.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
			validators[2].(func(string) error),
		}
		return func(task_no string) error {
			for _, fn := range fns {
				if err := fn(task_no); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescTaskCode is the schema descriptor for task_code field.
	workflowtaskDescTaskCode := workflowtaskFields[1].Descriptor()
	// workflowtask.TaskCodeValidator is a validator for the "task_code" field. It is called by the builders before save.
	workflowtask.TaskCodeValidator = func() func(string) error {
		validators := workflowtaskDescTaskCode.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(task_code string) error {
			for _, fn := range fns {
				if err := fn(task_code); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescTaskGroup is the schema descriptor for task_group field.
	workflowtaskDescTaskGroup := workflowtaskFields[2].Descriptor()
	// workflowtask.TaskGroupValidator is a validator for the "task_group" field. It is called by the builders before save.
	workflowtask.TaskGroupValidator = func() func(string) error {
		validators := workflowtaskDescTaskGroup.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(task_group string) error {
			for _, fn := range fns {
				if err := fn(task_group); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescTaskName is the schema descriptor for task_name field.
	workflowtaskDescTaskName := workflowtaskFields[3].Descriptor()
	// workflowtask.TaskNameValidator is a validator for the "task_name" field. It is called by the builders before save.
	workflowtask.TaskNameValidator = func() func(string) error {
		validators := workflowtaskDescTaskName.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(task_name string) error {
			for _, fn := range fns {
				if err := fn(task_name); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescSourceType is the schema descriptor for source_type field.
	workflowtaskDescSourceType := workflowtaskFields[4].Descriptor()
	// workflowtask.SourceTypeValidator is a validator for the "source_type" field. It is called by the builders before save.
	workflowtask.SourceTypeValidator = func() func(string) error {
		validators := workflowtaskDescSourceType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(source_type string) error {
			for _, fn := range fns {
				if err := fn(source_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescSourceID is the schema descriptor for source_id field.
	workflowtaskDescSourceID := workflowtaskFields[5].Descriptor()
	// workflowtask.SourceIDValidator is a validator for the "source_id" field. It is called by the builders before save.
	workflowtask.SourceIDValidator = workflowtaskDescSourceID.Validators[0].(func(int) error)
	// workflowtaskDescSourceNo is the schema descriptor for source_no field.
	workflowtaskDescSourceNo := workflowtaskFields[6].Descriptor()
	// workflowtask.SourceNoValidator is a validator for the "source_no" field. It is called by the builders before save.
	workflowtask.SourceNoValidator = workflowtaskDescSourceNo.Validators[0].(func(string) error)
	// workflowtaskDescBusinessStatusKey is the schema descriptor for business_status_key field.
	workflowtaskDescBusinessStatusKey := workflowtaskFields[7].Descriptor()
	// workflowtask.BusinessStatusKeyValidator is a validator for the "business_status_key" field. It is called by the builders before save.
	workflowtask.BusinessStatusKeyValidator = workflowtaskDescBusinessStatusKey.Validators[0].(func(string) error)
	// workflowtaskDescTaskStatusKey is the schema descriptor for task_status_key field.
	workflowtaskDescTaskStatusKey := workflowtaskFields[8].Descriptor()
	// workflowtask.TaskStatusKeyValidator is a validator for the "task_status_key" field. It is called by the builders before save.
	workflowtask.TaskStatusKeyValidator = func() func(string) error {
		validators := workflowtaskDescTaskStatusKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(task_status_key string) error {
			for _, fn := range fns {
				if err := fn(task_status_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescOwnerRoleKey is the schema descriptor for owner_role_key field.
	workflowtaskDescOwnerRoleKey := workflowtaskFields[9].Descriptor()
	// workflowtask.OwnerRoleKeyValidator is a validator for the "owner_role_key" field. It is called by the builders before save.
	workflowtask.OwnerRoleKeyValidator = func() func(string) error {
		validators := workflowtaskDescOwnerRoleKey.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(owner_role_key string) error {
			for _, fn := range fns {
				if err := fn(owner_role_key); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescOwnerPoolKey is the schema descriptor for owner_pool_key field.
	workflowtaskDescOwnerPoolKey := workflowtaskFields[10].Descriptor()
	// workflowtask.OwnerPoolKeyValidator is a validator for the "owner_pool_key" field. It is called by the builders before save.
	workflowtask.OwnerPoolKeyValidator = workflowtaskDescOwnerPoolKey.Validators[0].(func(string) error)
	// workflowtaskDescRequiredCapabilityKey is the schema descriptor for required_capability_key field.
	workflowtaskDescRequiredCapabilityKey := workflowtaskFields[11].Descriptor()
	// workflowtask.RequiredCapabilityKeyValidator is a validator for the "required_capability_key" field. It is called by the builders before save.
	workflowtask.RequiredCapabilityKeyValidator = workflowtaskDescRequiredCapabilityKey.Validators[0].(func(string) error)
	// workflowtaskDescConfigRevision is the schema descriptor for config_revision field.
	workflowtaskDescConfigRevision := workflowtaskFields[12].Descriptor()
	// workflowtask.ConfigRevisionValidator is a validator for the "config_revision" field. It is called by the builders before save.
	workflowtask.ConfigRevisionValidator = workflowtaskDescConfigRevision.Validators[0].(func(string) error)
	// workflowtaskDescProcessInstanceID is the schema descriptor for process_instance_id field.
	workflowtaskDescProcessInstanceID := workflowtaskFields[13].Descriptor()
	// workflowtask.ProcessInstanceIDValidator is a validator for the "process_instance_id" field. It is called by the builders before save.
	workflowtask.ProcessInstanceIDValidator = workflowtaskDescProcessInstanceID.Validators[0].(func(int) error)
	// workflowtaskDescProcessNodeInstanceID is the schema descriptor for process_node_instance_id field.
	workflowtaskDescProcessNodeInstanceID := workflowtaskFields[14].Descriptor()
	// workflowtask.ProcessNodeInstanceIDValidator is a validator for the "process_node_instance_id" field. It is called by the builders before save.
	workflowtask.ProcessNodeInstanceIDValidator = workflowtaskDescProcessNodeInstanceID.Validators[0].(func(int) error)
	// workflowtaskDescAssigneeID is the schema descriptor for assignee_id field.
	workflowtaskDescAssigneeID := workflowtaskFields[15].Descriptor()
	// workflowtask.AssigneeIDValidator is a validator for the "assignee_id" field. It is called by the builders before save.
	workflowtask.AssigneeIDValidator = workflowtaskDescAssigneeID.Validators[0].(func(int) error)
	// workflowtaskDescPriority is the schema descriptor for priority field.
	workflowtaskDescPriority := workflowtaskFields[16].Descriptor()
	// workflowtask.DefaultPriority holds the default value on creation for the priority field.
	workflowtask.DefaultPriority = workflowtaskDescPriority.Default.(int16)
	// workflowtaskDescBlockedReason is the schema descriptor for blocked_reason field.
	workflowtaskDescBlockedReason := workflowtaskFields[17].Descriptor()
	// workflowtask.BlockedReasonValidator is a validator for the "blocked_reason" field. It is called by the builders before save.
	workflowtask.BlockedReasonValidator = workflowtaskDescBlockedReason.Validators[0].(func(string) error)
	// workflowtaskDescCriticalPath is the schema descriptor for critical_path field.
	workflowtaskDescCriticalPath := workflowtaskFields[20].Descriptor()
	// workflowtask.DefaultCriticalPath holds the default value on creation for the critical_path field.
	workflowtask.DefaultCriticalPath = workflowtaskDescCriticalPath.Default.(bool)
	// workflowtaskDescUrgeCount is the schema descriptor for urge_count field.
	workflowtaskDescUrgeCount := workflowtaskFields[21].Descriptor()
	// workflowtask.DefaultUrgeCount holds the default value on creation for the urge_count field.
	workflowtask.DefaultUrgeCount = workflowtaskDescUrgeCount.Default.(int)
	// workflowtask.UrgeCountValidator is a validator for the "urge_count" field. It is called by the builders before save.
	workflowtask.UrgeCountValidator = workflowtaskDescUrgeCount.Validators[0].(func(int) error)
	// workflowtaskDescLastUrgedBy is the schema descriptor for last_urged_by field.
	workflowtaskDescLastUrgedBy := workflowtaskFields[23].Descriptor()
	// workflowtask.LastUrgedByValidator is a validator for the "last_urged_by" field. It is called by the builders before save.
	workflowtask.LastUrgedByValidator = workflowtaskDescLastUrgedBy.Validators[0].(func(int) error)
	// workflowtaskDescLastUrgedByRoleKey is the schema descriptor for last_urged_by_role_key field.
	workflowtaskDescLastUrgedByRoleKey := workflowtaskFields[24].Descriptor()
	// workflowtask.LastUrgedByRoleKeyValidator is a validator for the "last_urged_by_role_key" field. It is called by the builders before save.
	workflowtask.LastUrgedByRoleKeyValidator = workflowtaskDescLastUrgedByRoleKey.Validators[0].(func(string) error)
	// workflowtaskDescEscalateTargetRoleKey is the schema descriptor for escalate_target_role_key field.
	workflowtaskDescEscalateTargetRoleKey := workflowtaskFields[26].Descriptor()
	// workflowtask.EscalateTargetRoleKeyValidator is a validator for the "escalate_target_role_key" field. It is called by the builders before save.
	workflowtask.EscalateTargetRoleKeyValidator = workflowtaskDescEscalateTargetRoleKey.Validators[0].(func(string) error)
	// workflowtaskDescVersion is the schema descriptor for version field.
	workflowtaskDescVersion := workflowtaskFields[28].Descriptor()
	// workflowtask.DefaultVersion holds the default value on creation for the version field.
	workflowtask.DefaultVersion = workflowtaskDescVersion.Default.(int)
	// workflowtask.VersionValidator is a validator for the "version" field. It is called by the builders before save.
	workflowtask.VersionValidator = workflowtaskDescVersion.Validators[0].(func(int) error)
	// workflowtaskDescCreatedBy is the schema descriptor for created_by field.
	workflowtaskDescCreatedBy := workflowtaskFields[29].Descriptor()
	// workflowtask.CreatedByValidator is a validator for the "created_by" field. It is called by the builders before save.
	workflowtask.CreatedByValidator = workflowtaskDescCreatedBy.Validators[0].(func(int) error)
	// workflowtaskDescCreateIdempotencyKey is the schema descriptor for create_idempotency_key field.
	workflowtaskDescCreateIdempotencyKey := workflowtaskFields[30].Descriptor()
	// workflowtask.CreateIdempotencyKeyValidator is a validator for the "create_idempotency_key" field. It is called by the builders before save.
	workflowtask.CreateIdempotencyKeyValidator = workflowtaskDescCreateIdempotencyKey.Validators[0].(func(string) error)
	// workflowtaskDescCreateIntentHash is the schema descriptor for create_intent_hash field.
	workflowtaskDescCreateIntentHash := workflowtaskFields[31].Descriptor()
	// workflowtask.CreateIntentHashValidator is a validator for the "create_intent_hash" field. It is called by the builders before save.
	workflowtask.CreateIntentHashValidator = func() func(string) error {
		validators := workflowtaskDescCreateIntentHash.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(create_intent_hash string) error {
			for _, fn := range fns {
				if err := fn(create_intent_hash); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskDescUpdatedBy is the schema descriptor for updated_by field.
	workflowtaskDescUpdatedBy := workflowtaskFields[32].Descriptor()
	// workflowtask.UpdatedByValidator is a validator for the "updated_by" field. It is called by the builders before save.
	workflowtask.UpdatedByValidator = workflowtaskDescUpdatedBy.Validators[0].(func(int) error)
	// workflowtaskDescCreatedAt is the schema descriptor for created_at field.
	workflowtaskDescCreatedAt := workflowtaskFields[33].Descriptor()
	// workflowtask.DefaultCreatedAt holds the default value on creation for the created_at field.
	workflowtask.DefaultCreatedAt = workflowtaskDescCreatedAt.Default.(func() time.Time)
	// workflowtaskDescUpdatedAt is the schema descriptor for updated_at field.
	workflowtaskDescUpdatedAt := workflowtaskFields[34].Descriptor()
	// workflowtask.DefaultUpdatedAt holds the default value on creation for the updated_at field.
	workflowtask.DefaultUpdatedAt = workflowtaskDescUpdatedAt.Default.(func() time.Time)
	// workflowtask.UpdateDefaultUpdatedAt holds the default value on update for the updated_at field.
	workflowtask.UpdateDefaultUpdatedAt = workflowtaskDescUpdatedAt.UpdateDefault.(func() time.Time)
	workflowtaskeventHooks := schema.WorkflowTaskEvent{}.Hooks()
	workflowtaskevent.Hooks[0] = workflowtaskeventHooks[0]
	workflowtaskeventFields := schema.WorkflowTaskEvent{}.Fields()
	_ = workflowtaskeventFields
	// workflowtaskeventDescTaskID is the schema descriptor for task_id field.
	workflowtaskeventDescTaskID := workflowtaskeventFields[0].Descriptor()
	// workflowtaskevent.TaskIDValidator is a validator for the "task_id" field. It is called by the builders before save.
	workflowtaskevent.TaskIDValidator = workflowtaskeventDescTaskID.Validators[0].(func(int) error)
	// workflowtaskeventDescTaskVersion is the schema descriptor for task_version field.
	workflowtaskeventDescTaskVersion := workflowtaskeventFields[1].Descriptor()
	// workflowtaskevent.TaskVersionValidator is a validator for the "task_version" field. It is called by the builders before save.
	workflowtaskevent.TaskVersionValidator = workflowtaskeventDescTaskVersion.Validators[0].(func(int) error)
	// workflowtaskeventDescIdempotencyKey is the schema descriptor for idempotency_key field.
	workflowtaskeventDescIdempotencyKey := workflowtaskeventFields[2].Descriptor()
	// workflowtaskevent.IdempotencyKeyValidator is a validator for the "idempotency_key" field. It is called by the builders before save.
	workflowtaskevent.IdempotencyKeyValidator = workflowtaskeventDescIdempotencyKey.Validators[0].(func(string) error)
	// workflowtaskeventDescIntentHash is the schema descriptor for intent_hash field.
	workflowtaskeventDescIntentHash := workflowtaskeventFields[3].Descriptor()
	// workflowtaskevent.IntentHashValidator is a validator for the "intent_hash" field. It is called by the builders before save.
	workflowtaskevent.IntentHashValidator = func() func(string) error {
		validators := workflowtaskeventDescIntentHash.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(intent_hash string) error {
			for _, fn := range fns {
				if err := fn(intent_hash); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskeventDescCommandKey is the schema descriptor for command_key field.
	workflowtaskeventDescCommandKey := workflowtaskeventFields[4].Descriptor()
	// workflowtaskevent.CommandKeyValidator is a validator for the "command_key" field. It is called by the builders before save.
	workflowtaskevent.CommandKeyValidator = workflowtaskeventDescCommandKey.Validators[0].(func(string) error)
	// workflowtaskeventDescEventType is the schema descriptor for event_type field.
	workflowtaskeventDescEventType := workflowtaskeventFields[6].Descriptor()
	// workflowtaskevent.EventTypeValidator is a validator for the "event_type" field. It is called by the builders before save.
	workflowtaskevent.EventTypeValidator = func() func(string) error {
		validators := workflowtaskeventDescEventType.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(event_type string) error {
			for _, fn := range fns {
				if err := fn(event_type); err != nil {
					return err
				}
			}
			return nil
		}
	}()
	// workflowtaskeventDescFromStatusKey is the schema descriptor for from_status_key field.
	workflowtaskeventDescFromStatusKey := workflowtaskeventFields[7].Descriptor()
	// workflowtaskevent.FromStatusKeyValidator is a validator for the "from_status_key" field. It is called by the builders before save.
	workflowtaskevent.FromStatusKeyValidator = workflowtaskeventDescFromStatusKey.Validators[0].(func(string) error)
	// workflowtaskeventDescToStatusKey is the schema descriptor for to_status_key field.
	workflowtaskeventDescToStatusKey := workflowtaskeventFields[8].Descriptor()
	// workflowtaskevent.ToStatusKeyValidator is a validator for the "to_status_key" field. It is called by the builders before save.
	workflowtaskevent.ToStatusKeyValidator = workflowtaskeventDescToStatusKey.Validators[0].(func(string) error)
	// workflowtaskeventDescActorRoleKey is the schema descriptor for actor_role_key field.
	workflowtaskeventDescActorRoleKey := workflowtaskeventFields[9].Descriptor()
	// workflowtaskevent.ActorRoleKeyValidator is a validator for the "actor_role_key" field. It is called by the builders before save.
	workflowtaskevent.ActorRoleKeyValidator = workflowtaskeventDescActorRoleKey.Validators[0].(func(string) error)
	// workflowtaskeventDescActorID is the schema descriptor for actor_id field.
	workflowtaskeventDescActorID := workflowtaskeventFields[10].Descriptor()
	// workflowtaskevent.ActorIDValidator is a validator for the "actor_id" field. It is called by the builders before save.
	workflowtaskevent.ActorIDValidator = workflowtaskeventDescActorID.Validators[0].(func(int) error)
	// workflowtaskeventDescReason is the schema descriptor for reason field.
	workflowtaskeventDescReason := workflowtaskeventFields[11].Descriptor()
	// workflowtaskevent.ReasonValidator is a validator for the "reason" field. It is called by the builders before save.
	workflowtaskevent.ReasonValidator = workflowtaskeventDescReason.Validators[0].(func(string) error)
	// workflowtaskeventDescCreatedAt is the schema descriptor for created_at field.
	workflowtaskeventDescCreatedAt := workflowtaskeventFields[13].Descriptor()
	// workflowtaskevent.DefaultCreatedAt holds the default value on creation for the created_at field.
	workflowtaskevent.DefaultCreatedAt = workflowtaskeventDescCreatedAt.Default.(func() time.Time)
	workflowtasknumbercounterFields := schema.WorkflowTaskNumberCounter{}.Fields()
	_ = workflowtasknumbercounterFields
	// workflowtasknumbercounterDescLastValue is the schema descriptor for last_value field.
	workflowtasknumbercounterDescLastValue := workflowtasknumbercounterFields[1].Descriptor()
	// workflowtasknumbercounter.LastValueValidator is a validator for the "last_value" field. It is called by the builders before save.
	workflowtasknumbercounter.LastValueValidator = workflowtasknumbercounterDescLastValue.Validators[0].(func(int64) error)
	// workflowtasknumbercounterDescID is the schema descriptor for id field.
	workflowtasknumbercounterDescID := workflowtasknumbercounterFields[0].Descriptor()
	// workflowtasknumbercounter.IDValidator is a validator for the "id" field. It is called by the builders before save.
	workflowtasknumbercounter.IDValidator = func() func(string) error {
		validators := workflowtasknumbercounterDescID.Validators
		fns := [...]func(string) error{
			validators[0].(func(string) error),
			validators[1].(func(string) error),
		}
		return func(id string) error {
			for _, fn := range fns {
				if err := fn(id); err != nil {
					return err
				}
			}
			return nil
		}
	}()
}

const (
	Version = "v0.14.6"                                         // Version of ent codegen.
	Sum     = "h1:/f2696BpwuWAEEG6PVGWflg6+Inrpq4pRWuNlWz/Skk=" // Sum of ent codegen.
)
