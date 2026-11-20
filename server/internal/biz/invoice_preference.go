package biz

import "strings"

var sourceOrderInvoiceCategories = map[string]struct{}{
	FinanceInvoiceCategoryExportGeneral: {},
	FinanceInvoiceCategoryVATGeneral1:   {},
	FinanceInvoiceCategoryVATSpecial3:   {},
	FinanceInvoiceCategoryVATSpecial13:  {},
}

func normalizeInvoicePreference(required *bool, category *string) (*bool, *string, error) {
	category = normalizeOptionalString(category)
	if required == nil {
		if category != nil {
			return nil, nil, ErrBadParam
		}
		return nil, nil, nil
	}
	requiredValue := *required
	if !requiredValue {
		return &requiredValue, nil, nil
	}
	if category == nil {
		return nil, nil, ErrBadParam
	}
	normalizedCategory := strings.ToUpper(*category)
	if _, ok := sourceOrderInvoiceCategories[normalizedCategory]; !ok {
		return nil, nil, ErrBadParam
	}
	return &requiredValue, &normalizedCategory, nil
}
