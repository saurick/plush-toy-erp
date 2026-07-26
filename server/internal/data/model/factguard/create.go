package factguard

import (
	"fmt"

	"entgo.io/ent"
)

// RejectCreateBypass keeps operational facts in DRAFT until the domain
// lifecycle action posts, settles, or cancels them.
func RejectCreateBypass(
	m ent.Mutation,
	entity string,
	additionalLifecycleFields ...string,
) error {
	if !m.Op().Is(ent.OpCreate) {
		return nil
	}
	value, exists := m.Field("status")
	status, valid := value.(string)
	if !exists || !valid || status != "DRAFT" {
		return fmt.Errorf("%s must be created as DRAFT; use the domain post or cancel action for lifecycle changes", entity)
	}
	if _, exists := m.Field("posted_at"); exists {
		return fmt.Errorf("%s must be created without posted_at; use the domain post action", entity)
	}
	for _, fieldName := range additionalLifecycleFields {
		if _, exists := m.Field(fieldName); exists {
			return fmt.Errorf("%s must be created without %s; use the domain lifecycle action", entity, fieldName)
		}
	}
	return nil
}
