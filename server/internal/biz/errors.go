package biz

import "errors"

var (
	ErrForbidden                         = errors.New("forbidden")
	ErrBadParam                          = errors.New("bad param")
	ErrNoPermission                      = errors.New("no permission")
	ErrIdempotencyConflict               = errors.New("idempotency key payload conflict")
	ErrActorAwareCancellationUnavailable = errors.New("actor-aware cancellation unavailable")
	ErrActorAwareShipmentUnavailable     = errors.New("actor-aware shipment unavailable")
)
