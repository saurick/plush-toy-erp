package value

import (
	"fmt"
	"unicode/utf8"
)

// BusinessNoteMaxCharacters bounds free-form business remarks in storage and UI.
// Identifiers, names and action reasons retain their own domain constraints.
const BusinessNoteMaxCharacters = 2000

// ValidateBusinessNote counts Unicode characters, so Chinese and ASCII remarks
// share the same budget instead of inheriting a byte limit from Ent MaxLen.
func ValidateBusinessNote(text string) error {
	if !utf8.ValidString(text) || utf8.RuneCountInString(text) > BusinessNoteMaxCharacters {
		return fmt.Errorf("business note must contain valid UTF-8 and at most %d characters", BusinessNoteMaxCharacters)
	}
	return nil
}
