package tasknumber

import (
	"context"
	"time"

	"entgo.io/ent"
	modelent "server/internal/data/model/ent"
)

func Hook() ent.Hook {
	return func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
			if !mutation.Op().Is(ent.OpCreate) {
				return next.Mutate(ctx, mutation)
			}
			if _, supplied := mutation.Field("task_no"); !supplied {
				createdAt, _ := mutation.Field("created_at")
				client := mutation.(interface{ Client() *modelent.Client }).Client()
				number, err := Allocate(ctx, client, createdAt.(time.Time))
				if err != nil {
					return nil, err
				}
				if err := mutation.SetField("task_no", number); err != nil {
					return nil, err
				}
			}
			return next.Mutate(ctx, mutation)
		})
	}
}
