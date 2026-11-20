package data

import (
	"context"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/qualityinspection"
)

// Resolve display names and correction links in batches. Historical decisions
// keep their recorded actor ID; missing actors are never inferred from viewers.
func enrichQualityInspectionHistory(ctx context.Context, client *ent.Client, items []*biz.QualityInspection) error {
	if len(items) == 0 {
		return nil
	}
	ids, originalIDs, actorIDs := make([]int, 0, len(items)), []int{}, []int{}
	for _, item := range items {
		ids = append(ids, item.ID)
		if item.CorrectionOfInspectionID != nil {
			originalIDs = append(originalIDs, *item.CorrectionOfInspectionID)
		}
		if item.InspectorID != nil {
			actorIDs = append(actorIDs, *item.InspectorID)
		}
	}
	actors := map[int]string{}
	if len(actorIDs) > 0 {
		rows, err := client.AdminUser.Query().Where(adminuser.IDIn(actorIDs...)).
			Select(adminuser.FieldID, adminuser.FieldUsername, adminuser.FieldDisplayName).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			name := strings.TrimSpace(optionalStringValueOrEmpty(row.DisplayName))
			if name == "" {
				name = row.Username
			}
			actors[row.ID] = name
		}
	}
	links, err := client.QualityInspection.Query().Where(qualityinspection.Or(
		qualityinspection.IDIn(originalIDs...), qualityinspection.CorrectionOfInspectionIDIn(ids...),
	)).Select(qualityinspection.FieldID, qualityinspection.FieldInspectionNo, qualityinspection.FieldCorrectionOfInspectionID).All(ctx)
	if err != nil {
		return err
	}
	byID, successor := map[int]*ent.QualityInspection{}, map[int]*ent.QualityInspection{}
	for _, row := range links {
		byID[row.ID] = row
		if row.CorrectionOfInspectionID != nil {
			successor[*row.CorrectionOfInspectionID] = row
		}
	}
	for _, item := range items {
		if name, ok := actors[optionalIntValueOrZero(item.InspectorID)]; ok {
			item.InspectorName = &name
		}
		if original := byID[optionalIntValueOrZero(item.CorrectionOfInspectionID)]; original != nil {
			item.CorrectionOfInspectionNo = &original.InspectionNo
		}
		if corrected := successor[item.ID]; corrected != nil {
			item.CorrectedInspectionID, item.CorrectedInspectionNo = &corrected.ID, &corrected.InspectionNo
		}
	}
	return nil
}

func qualityInspectionWithHistory(ctx context.Context, client *ent.Client, row *ent.QualityInspection) (*biz.QualityInspection, error) {
	item := entQualityInspectionToBiz(row)
	if err := enrichQualityInspectionHistory(ctx, client, []*biz.QualityInspection{item}); err != nil {
		return nil, err
	}
	return item, nil
}
