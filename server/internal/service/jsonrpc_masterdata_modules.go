package service

import "server/internal/biz"

const (
	masterDataModuleKeyCustomers = "customers"
	masterDataModuleKeySuppliers = "suppliers"
	masterDataModuleKeyMaterials = "materials"
	masterDataModuleKeyProducts  = "products"
	masterDataModuleKeyProcesses = "processes"
)

func masterDataContactOwnerModuleKey(ownerType string) string {
	switch ownerType {
	case biz.ContactOwnerCustomer:
		return masterDataModuleKeyCustomers
	case biz.ContactOwnerSupplier:
		return masterDataModuleKeySuppliers
	default:
		return ""
	}
}
