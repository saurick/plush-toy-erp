package status

const (
	ShipmentDraft     = "DRAFT"
	ShipmentShipped   = "SHIPPED"
	ShipmentCancelled = "CANCELLED"
)

type ShipmentTransition struct {
	Target  string
	Changed bool
}

func CanAddShipmentItem(current string) bool {
	return current == ShipmentDraft
}

func ShipShipment(current string) (ShipmentTransition, bool) {
	switch current {
	case ShipmentDraft:
		return ShipmentTransition{Target: ShipmentShipped, Changed: true}, true
	case ShipmentShipped:
		return ShipmentTransition{Target: ShipmentShipped}, true
	default:
		return ShipmentTransition{}, false
	}
}

func CancelShippedShipment(current string) (ShipmentTransition, bool) {
	switch current {
	case ShipmentShipped:
		return ShipmentTransition{Target: ShipmentCancelled, Changed: true}, true
	case ShipmentCancelled:
		return ShipmentTransition{Target: ShipmentCancelled}, true
	default:
		return ShipmentTransition{}, false
	}
}
