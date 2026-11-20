package data

func optionalSQLValue[T any](value *T) any {
	if value == nil {
		return nil
	}
	return *value
}
