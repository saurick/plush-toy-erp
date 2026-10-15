package biz

import (
	"context"
	"strings"
)

type QualityInspectionCorrectionCreate struct {
	InspectionID           int
	CorrectionInspectionNo string
	Reason                 string
}

type QualityInspectionCorrectionRepo interface {
	CreateQualityInspectionCorrection(ctx context.Context, in *QualityInspectionCorrectionCreate, actorID int) (*QualityInspection, error)
}

func (uc *InventoryUsecase) CorrectQualityInspectionResult(ctx context.Context, in *QualityInspectionCorrectionCreate, actorID int) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil || in.InspectionID <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	in.CorrectionInspectionNo = strings.TrimSpace(in.CorrectionInspectionNo)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.CorrectionInspectionNo == "" || in.Reason == "" {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionCorrectionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateQualityInspectionCorrection(ctx, in, actorID)
}
