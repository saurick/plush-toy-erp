package data

import (
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func applyBOMHeaderOptionalFields(update *ent.BOMHeaderMutation, in *biz.BOMHeaderUpdate) {
	if in.EffectiveFrom == nil {
		update.ClearEffectiveFrom()
	} else {
		update.SetEffectiveFrom(*in.EffectiveFrom)
	}
	if in.EffectiveTo == nil {
		update.ClearEffectiveTo()
	} else {
		update.SetEffectiveTo(*in.EffectiveTo)
	}
	if in.SourceOrderNo == nil {
		update.ClearSourceOrderNo()
	} else {
		update.SetSourceOrderNo(*in.SourceOrderNo)
	}
	if in.QuantityText == nil {
		update.ClearQuantityText()
	} else {
		update.SetQuantityText(*in.QuantityText)
	}
	if in.SpareText == nil {
		update.ClearSpareText()
	} else {
		update.SetSpareText(*in.SpareText)
	}
	if in.PrintDate == nil {
		update.ClearPrintDate()
	} else {
		update.SetPrintDate(*in.PrintDate)
	}
	if in.Designer == nil {
		update.ClearDesigner()
	} else {
		update.SetDesigner(*in.Designer)
	}
	if in.Maker == nil {
		update.ClearMaker()
	} else {
		update.SetMaker(*in.Maker)
	}
	if in.Auditor == nil {
		update.ClearAuditor()
	} else {
		update.SetAuditor(*in.Auditor)
	}
	if in.HairDirection == nil {
		update.ClearHairDirection()
	} else {
		update.SetHairDirection(*in.HairDirection)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
}
