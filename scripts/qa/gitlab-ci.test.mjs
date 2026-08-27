import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.gitlab-ci.yml", import.meta.url),
  "utf8",
);
const compose = readFileSync(
  new URL("../../server/deploy/gitlab/compose.yml", import.meta.url),
  "utf8",
);
const installer = readFileSync(
  new URL("../../server/deploy/gitlab/install-r640.sh", import.meta.url),
  "utf8",
);
const backup = readFileSync(
  new URL("../../server/deploy/gitlab/gitlab-backup.sh", import.meta.url),
  "utf8",
);
const backupVerify = readFileSync(
  new URL(
    "../../server/deploy/gitlab/gitlab-backup-verify.sh",
    import.meta.url,
  ),
  "utf8",
);
const runnerCloudInit = readFileSync(
  new URL("../../server/deploy/gitlab/runner-vm-cloud-init.yml", import.meta.url),
  "utf8",
);

test("GitLab is the canonical main and merge-request CI with one stable gate", () => {
  assert.match(workflow, /CI_PIPELINE_SOURCE == "merge_request_event"/u);
  assert.match(
    workflow,
    /CI_PIPELINE_SOURCE == "push" && \$CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/u,
  );
  assert.match(workflow, /^"CI Gate":\n  stage: gate/mu);
  assert.match(workflow, /node scripts\/qa\/ci-plan[.]mjs/u);
  assert.match(workflow, /bash scripts\/qa\/affected[.]sh --base/u);
  assert.match(workflow, /scripts\/qa\/exact-sha-gate[.]mjs/u);
  assert.match(workflow, /history_range=HEAD/u);
  assert.match(
    workflow,
    /trusted_config_sha="\$CI_MERGE_REQUEST_DIFF_BASE_SHA"/u,
  );
  assert.match(
    workflow,
    /git show "\$trusted_config_sha:[.]gitleaks[.]toml"/u,
  );
  assert.match(workflow, /output\/ci\/plan[.]json/u);
  assert.match(workflow, /output\/ci\/range[.]txt/u);
  assert.match(workflow, /output\/cache\/gitlab\/pnpm-store/u);
  assert.doesNotMatch(workflow, /output\/ci\/cache/u);
  assert.doesNotMatch(workflow, /\$CI_PROJECT_DIR\/[.]cache/u);
  assert.doesNotMatch(workflow, /[.]ci-plan[.]env/u);
  assert.doesNotMatch(workflow, /reports:\n\s+dotenv:/u);
  assert.match(workflow, /[.]flags[.]needsPostgres/u);
  assert.match(workflow, /case "\$boolean_value" in true\|false/u);
  assert.match(workflow, /playwright install chromium/u);
  assert.doesNotMatch(workflow, /playwright install --with-deps/u);
});

test("GitLab release binds protected exact-SHA strict evidence and immutable assets", () => {
  assert.match(workflow, /^strict:\n  stage: quality/mu);
  assert.match(workflow, /^publish_release:\n  stage: release/mu);
  assert.match(workflow, /resource_group: immutable-release-catalog/u);
  assert.match(workflow, /test "\$RELEASE_SHA" = "\$CI_COMMIT_SHA"/u);
  assert.match(
    workflow,
    /test "\$RELEASE_SHA" = "\$\(git rev-parse origin\/main\)"/u,
  );
  assert.match(workflow, /CI_COMMIT_REF_PROTECTED/u);
  assert.match(workflow, /GITHUB_PACKAGES_TOKEN/u);
  assert.match(workflow, /GITLAB_RELEASE_TOKEN/u);
  assert.match(workflow, /JOB-TOKEN: \$CI_JOB_TOKEN/u);
  for (const asset of [
    "checksums.sha256",
    "release-artifact.json",
    "release-manifest.json",
    "sbom.cdx.json",
    "server-image.tar",
    "web-image.tar",
  ]) {
    assert.match(workflow, new RegExp(asset.replaceAll(".", "[.]"), "u"));
  }
});

test("GitLab jobs stay on the isolated runner and never receive the R640 host socket", () => {
  assert.match(workflow, /tags:\n    - plush\n    - isolated\n    - amd64/u);
  assert.doesNotMatch(workflow, /\/var\/run\/docker[.]sock/u);
  assert.doesNotMatch(workflow, /privileged:\s*true/u);
  assert.doesNotMatch(workflow, /8[.]218[.]4[.]199|192[.]168[.]0[.]133/u);
  assert.doesNotMatch(workflow, /PRIVATE-TOKEN:\s*[A-Za-z0-9_-]{16,}/u);
});

test("R640 GitLab definitions pin identity, separate SSD data and require exact execution", () => {
  assert.match(compose, /^name: plush-gitlab-control$/mu);
  assert.match(
    compose,
    /gitlab\/gitlab-ce@sha256:f7e453ff51d1910235365085fe836e4589716d26b44d99a8aa3e2c41377f034f/u,
  );
  assert.match(compose, /127[.]0[.]0[.]1:\$\{GITLAB_HTTP_PORT:-8929\}:8929/u);
  assert.match(compose, /\/srv\/gitlab\/data/u);
  assert.match(installer, /preview_only=true/u);
  assert.match(installer, /INSTALL_GITLAB:R640:gitlab[.]saurick[.]me/u);
  assert.match(installer, /RUNTIME_ENV="\$\(mktemp\)"/u);
  assert.doesNotMatch(installer, /source "\$ENV_FILE"/u);
  assert.doesNotMatch(installer, /docker\s+(?:rm|stop|system prune)|rm\s+-rf/u);
  assert.match(backup, /\/srv\/raid5\/gitlab\/backups/u);
  assert.match(backup, /BACKUP_GITLAB:R640/u);
  assert.doesNotMatch(backup, /volume prune|image prune|rm\s+-rf/u);
  assert.match(backupVerify, /NR != 2/u);
  assert.match(backupVerify, /test ! -L "\$CHECKSUM_FILE"/u);
  assert.match(runnerCloudInit, /runner_version=19[.]3[.]0/u);
  assert.match(
    runnerCloudInit,
    /9b642c14742b5db8622352c85f809ae6a588b6885a7d1a24caf8547e73eea7c9/u,
  );
  assert.match(runnerCloudInit, /--executor shell/u);
  assert.match(runnerCloudInit, /--run-untagged=false/u);
  assert.match(runnerCloudInit, /libnss3/u);
  assert.doesNotMatch(runnerCloudInit, /NOPASSWD: \/usr\/bin\/apt-get/u);
  assert.match(runnerCloudInit, /ssh_pwauth: false/u);
  assert.match(runnerCloudInit, /disable_root: true/u);
  assert.match(runnerCloudInit, /chmod 0600 \/etc\/gitlab-runner\/config[.]toml/u);
  assert.doesNotMatch(runnerCloudInit, /curl[^\n]*[|]\s*(?:ba)?sh/u);
});
