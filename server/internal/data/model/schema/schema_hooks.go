package schema

import (
	"context"
	"errors"

	"entgo.io/ent"
)

func rejectMutationOps(op ent.Op, message string) ent.Hook {
	return func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			if m.Op().Is(op) {
				return nil, errors.New(message)
			}
			return next.Mutate(ctx, m)
		})
	}
}
