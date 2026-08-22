package biz

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const (
	legalNoticeAuditEventType     = "legal_notice_acknowledgement"
	legalNoticeReceiptEventPrefix = "legal_notice.ack."
	legalNoticeAuditAction        = "legal_notice.acknowledged"
	legalNoticeTargetType         = "legal_notice_bundle"
)

var (
	legalNoticeVersionPattern     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	legalNoticeFingerprintPattern = regexp.MustCompile(`^[a-f0-9]{16,64}$`)
)

type LegalNoticeStatus struct {
	NoticeVersion      string
	ContentFingerprint string
	Acknowledged       bool
	AcknowledgedAt     *time.Time
}

func normalizeLegalNoticeIdentity(noticeVersion, contentFingerprint string) (string, string, error) {
	noticeVersion = strings.TrimSpace(noticeVersion)
	contentFingerprint = strings.ToLower(strings.TrimSpace(contentFingerprint))
	if !legalNoticeVersionPattern.MatchString(noticeVersion) || !legalNoticeFingerprintPattern.MatchString(contentFingerprint) {
		return "", "", ErrBadParam
	}
	return noticeVersion, contentFingerprint, nil
}

func legalNoticeReceiptEventKey(adminID int, contentFingerprint string) (string, error) {
	if adminID <= 0 || !legalNoticeFingerprintPattern.MatchString(contentFingerprint) {
		return "", ErrBadParam
	}
	eventKey := fmt.Sprintf("%s%d.%s", legalNoticeReceiptEventPrefix, adminID, contentFingerprint)
	if len(eventKey) > 128 {
		return "", ErrBadParam
	}
	return eventKey, nil
}

func BuildLegalNoticeAcknowledgementAuditEvent(
	admin *AdminUser,
	noticeVersion string,
	contentFingerprint string,
	acknowledgedAt time.Time,
) (*RuntimeAuditEventCreate, error) {
	if admin == nil || !admin.IsActive() || acknowledgedAt.IsZero() {
		return nil, ErrForbidden
	}
	noticeVersion, contentFingerprint, err := normalizeLegalNoticeIdentity(noticeVersion, contentFingerprint)
	if err != nil {
		return nil, err
	}
	eventKey, err := legalNoticeReceiptEventKey(admin.ID, contentFingerprint)
	if err != nil {
		return nil, err
	}
	return &RuntimeAuditEventCreate{
		EventType: legalNoticeAuditEventType,
		EventKey:  eventKey,
		Source:    adminControlAuditSource,
		Payload: map[string]any{
			"action": legalNoticeAuditAction,
			"actor": map[string]any{
				"id":           admin.ID,
				"username":     admin.Username,
				"display_name": admin.DisplayName,
			},
			"target": map[string]any{
				"type": legalNoticeTargetType,
				"key":  noticeVersion,
			},
			"notice": map[string]any{
				"version":             noticeVersion,
				"content_fingerprint": contentFingerprint,
				"acknowledged_at":     acknowledgedAt.UTC().Format(time.RFC3339Nano),
			},
		},
	}, nil
}

func (uc *AdminManageUsecase) GetLegalNoticeStatus(
	ctx context.Context,
	noticeVersion string,
	contentFingerprint string,
) (LegalNoticeStatus, error) {
	admin, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	noticeVersion, contentFingerprint, err = normalizeLegalNoticeIdentity(noticeVersion, contentFingerprint)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	eventKey, err := legalNoticeReceiptEventKey(admin.ID, contentFingerprint)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	result, err := uc.repo.ListRuntimeAuditEvents(ctx, RuntimeAuditEventListFilter{
		Source:    adminControlAuditSource,
		EventType: legalNoticeAuditEventType,
		EventKey:  eventKey,
		Limit:     20,
	})
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	status := LegalNoticeStatus{
		NoticeVersion:      noticeVersion,
		ContentFingerprint: contentFingerprint,
	}
	for _, event := range result.Events {
		if !legalNoticeAuditEventMatches(event, admin.ID, noticeVersion, contentFingerprint) {
			continue
		}
		acknowledgedAt := event.CreatedAt.UTC()
		status.Acknowledged = true
		status.AcknowledgedAt = &acknowledgedAt
		return status, nil
	}
	return status, nil
}

func (uc *AdminManageUsecase) AcknowledgeLegalNotice(
	ctx context.Context,
	noticeVersion string,
	contentFingerprint string,
) (LegalNoticeStatus, error) {
	admin, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	noticeVersion, contentFingerprint, err = normalizeLegalNoticeIdentity(noticeVersion, contentFingerprint)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	current, err := uc.GetLegalNoticeStatus(ctx, noticeVersion, contentFingerprint)
	if err != nil || current.Acknowledged {
		return current, err
	}
	acknowledgedAt := time.Now().UTC()
	event, err := BuildLegalNoticeAcknowledgementAuditEvent(
		admin,
		noticeVersion,
		contentFingerprint,
		acknowledgedAt,
	)
	if err != nil {
		return LegalNoticeStatus{}, err
	}
	if err := uc.repo.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return LegalNoticeStatus{}, err
	}
	return LegalNoticeStatus{
		NoticeVersion:      noticeVersion,
		ContentFingerprint: contentFingerprint,
		Acknowledged:       true,
		AcknowledgedAt:     &acknowledgedAt,
	}, nil
}

func legalNoticeAuditEventMatches(
	event RuntimeAuditEvent,
	adminID int,
	noticeVersion string,
	contentFingerprint string,
) bool {
	if event.EventType != legalNoticeAuditEventType || event.Source != adminControlAuditSource {
		return false
	}
	actor, _ := event.Payload["actor"].(map[string]any)
	notice, _ := event.Payload["notice"].(map[string]any)
	return legalNoticeAnyToInt(actor["id"]) == adminID &&
		strings.TrimSpace(anyToString(notice["version"])) == noticeVersion &&
		strings.TrimSpace(anyToString(notice["content_fingerprint"])) == contentFingerprint
}

func legalNoticeAnyToInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}
