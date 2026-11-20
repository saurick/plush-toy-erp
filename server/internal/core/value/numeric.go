package value

import "strings"

// Public decimal values are transported as strings. Unit precision and signs
// remain the responsibility of the owning business operation.
const (
	NumericPrecision     = 20
	NumericScale         = 6
	NumericIntegerDigits = NumericPrecision - NumericScale
	NumericMaxTextBytes  = 1 + NumericIntegerDigits + 1 + NumericScale
)

var NumericMaximum = strings.Repeat("9", NumericIntegerDigits) + "." + strings.Repeat("9", NumericScale)
