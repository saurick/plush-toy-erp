package data

import (
	"errors"
	"fmt"

	"server/internal/data/model/ent"
)

// Keep persistence details in the data layer; services select business messages
// from the domain conflict while diagnostics retain the original error chain.
func mapInventoryPersistenceError(err error, conflict error) error {
	if ent.IsConstraintError(err) && !errors.Is(err, conflict) {
		return fmt.Errorf("%w: %w", conflict, err)
	}
	return err
}
