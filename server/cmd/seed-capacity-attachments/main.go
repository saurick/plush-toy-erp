// This command fills the attachment part of the isolated capacity read-model fixture.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/attachmentstore"
	"server/internal/biz"
	"server/internal/conf"
	"server/internal/data"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "capacity attachments:", err)
		os.Exit(1)
	}
}
func run() error {
	database := flag.String("database", "", "exact isolated capacity database")
	confirm := flag.String("confirm", "", "LOAD_CAPACITY_ATTACHMENTS:<database>")
	execute := flag.Bool("execute", false, "write simulated attachments")
	flag.Parse()
	dsn := os.Getenv("POSTGRES_DSN")
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Path != "/"+*database || !regexp.MustCompile(`^plush_erp_capacity_[a-z0-9_]+$`).MatchString(*database) {
		return errors.New("an exact loopback capacity database is required")
	}
	logger := log.NewStdLogger(io.Discard)
	d, cleanup, err := data.NewData(&conf.Data{Postgres: &conf.Data_Postgres{Dsn: dsn}}, logger)
	if err != nil {
		return errors.New("capacity database unavailable")
	}
	defer cleanup()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	var actual string
	var count int
	if err := d.SQLDB().QueryRowContext(ctx, "SELECT current_database(), (SELECT count(*) FROM business_attachments)").Scan(&actual, &count); err != nil {
		return err
	}
	if actual != *database {
		return errors.New("capacity database identity mismatch")
	}
	remaining := max(0, 1000-count)
	if !*execute {
		fmt.Printf("pending=%d writes=0\n", remaining)
		return nil
	}
	if *confirm != "LOAD_CAPACITY_ATTACHMENTS:"+actual {
		return errors.New("exact fixture confirmation required")
	}
	objects, err := attachmentstore.New(attachmentstore.ConfigFromEnv())
	if err != nil {
		return err
	}
	if err := objects.Check(ctx); err != nil {
		return err
	}
	repo := data.NewBusinessAttachmentRepo(d, objects, logger)
	var taskID, version, actor int
	var role string
	err = d.SQLDB().QueryRowContext(ctx, `SELECT t.id,t.version,t.owner_role_key,u.id FROM workflow_tasks t JOIN admin_users u ON u.username='demo_pmc' AND NOT u.disabled AND u.revoked_at IS NULL WHERE t.task_code LIKE 'SIM-CAP-V1-%' AND (t.assignee_id IS NULL OR t.assignee_id=u.id) ORDER BY t.id LIMIT 1`).Scan(&taskID, &version, &role, &actor)
	if err != nil {
		return errors.New("capacity task and demo_pmc fixture required")
	}
	content := []byte("0")
	digest := sha256.Sum256(content)
	note := "simulated capacity attachment fixture"
	for i := range remaining {
		_, err = repo.CreateBusinessAttachment(ctx, &biz.BusinessAttachmentCreate{
			OwnerType: biz.BusinessAttachmentOwnerWorkflowTask, OwnerID: taskID, AttachmentType: "evidence",
			FileName: fmt.Sprintf("sim-capacity-%06d.txt", count+i+1), MimeType: "text/plain", FileSize: len(content),
			SHA256: hex.EncodeToString(digest[:]), Content: content, UploadedBy: &actor, Note: &note,
			WorkflowGuard: &biz.WorkflowAttachmentWriteGuard{ExpectedVersion: version, ActorID: actor, VisibleOwnerRoleKeys: []string{role}},
		})
		if err != nil {
			return err
		}
	}
	fmt.Printf("uploaded=%d simulated=true\n", remaining)
	return nil
}
