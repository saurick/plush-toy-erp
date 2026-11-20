package biz

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

// Business spans expose operation boundaries, never the mutation payload or
// raw error text. Named return errors keep early exits and repository failures visible.
func startBusinessTrace(ctx context.Context, operation string) (context.Context, func(error)) {
	ctx, span := otel.Tracer("biz.operations").Start(ctx, operation)
	return ctx, func(err error) {
		if err != nil {
			span.SetAttributes(attribute.Bool("business.success", false))
			span.SetStatus(codes.Error, "business operation failed")
		} else {
			span.SetAttributes(attribute.Bool("business.success", true))
			span.SetStatus(codes.Ok, "")
		}
		span.End()
	}
}
