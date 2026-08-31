import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.gitlab-ci.yml", import.meta.url),
  "utf8",
);
const nodeVersion = readFileSync(
  new URL("../../.n-node-version", import.meta.url),
  "utf8",
).trim();
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

test("GitLab is the canonical CI with one fixed exact-SHA DAG and stable gate", () => {
  assert.match(workflow, /CI_PIPELINE_SOURCE == "merge_request_event"/u);
  assert.match(
    workflow,
    /CI_PIPELINE_SOURCE == "push" && \$CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/u,
  );
  assert.match(workflow, /^"CI Gate":\n  stage: gate/mu);
  assert.match(workflow, /node scripts\/qa\/ci-plan[.]mjs/u);
  assert.match(workflow, /bash scripts\/qa\/affected[.]sh --base/u);
  assert.match(workflow, /^prepare:\n  stage: prepare\n  timeout: 1h/mu);
  for (const shard of [
    "static",
    "node",
    "web",
    "server",
    "resource",
    "browser",
    "security",
  ]) {
    assert.match(workflow, new RegExp(`^quality_${shard}:`, "mu"));
    assert.match(
      workflow,
      new RegExp(`ci-quality-shard[.]mjs --shard ${shard}`, "u"),
    );
  }
  assert.equal(
    workflow.match(/ci-quality-shard[.]mjs --shard /gu)?.length ?? 0,
    7,
  );
  for (const lane of ["release", "core"]) {
    assert.match(workflow, new RegExp(`^quality_node_${lane}:`, "mu"));
    assert.match(
      workflow,
      new RegExp(`ci-node-test-lane[.]mjs --lane ${lane}`, "u"),
    );
    assert.match(
      workflow,
      new RegExp(`output/ci/node-lanes/${lane}[.]json`, "u"),
    );
  }
  for (const lane of ["contract", "runtime"]) {
    assert.match(workflow, new RegExp(`^quality_resource_${lane}:`, "mu"));
    assert.match(
      workflow,
      new RegExp(`ci-resource-test-lane[.]mjs --lane ${lane}`, "u"),
    );
    assert.match(
      workflow,
      new RegExp(`output/ci/resource-lanes/${lane}[.]json`, "u"),
    );
  }
  for (const [shard, lanes] of Object.entries({
    web: ["checks", "build"],
    server: ["core", "critical_postgres"],
  })) {
    for (const lane of lanes) {
      assert.match(
        workflow,
        new RegExp(`^quality_${shard}_${lane}:`, "mu"),
      );
      assert.match(
        workflow,
        new RegExp(
          `ci-quality-stage-lane[.]mjs --shard ${shard} --lane ${lane}`,
          "u",
        ),
      );
      assert.match(
        workflow,
        new RegExp(`output/ci/${shard}-lanes/${lane}[.]json`, "u"),
      );
    }
  }
  assert.doesNotMatch(workflow, /^quality_node_runtime:/mu);
  assert.match(
    workflow,
    /quality_node:[\s\S]+?job: quality_node_release\n      artifacts: true[\s\S]+?job: quality_node_core\n      artifacts: true[\s\S]+?ci-quality-shard[.]mjs --shard node/u,
  );
  assert.match(
    workflow,
    /quality_resource:[\s\S]+?job: quality_resource_contract\n      artifacts: true[\s\S]+?job: quality_resource_runtime\n      artifacts: true[\s\S]+?ci-quality-shard[.]mjs --shard resource/u,
  );
  assert.match(
    workflow,
    /quality_web:[\s\S]+?job: quality_web_checks\n      artifacts: true[\s\S]+?job: quality_web_build\n      artifacts: true[\s\S]+?ci-quality-shard[.]mjs --shard web/u,
  );
  assert.match(
    workflow,
    /quality_server:[\s\S]+?job: quality_server_core\n      artifacts: true[\s\S]+?job: quality_server_critical_postgres\n      artifacts: true[\s\S]+?ci-quality-shard[.]mjs --shard server/u,
  );
  assert.ok(
    workflow.indexOf("quality_node_release:") <
      workflow.indexOf("quality_web:"),
  );
  assert.ok(
    workflow.indexOf("quality_node_core:") <
      workflow.indexOf("quality_web:"),
  );
  const aggregateBlock = workflow.match(
    /^quality_aggregate:[\s\S]+?^quality_affected:/mu,
  )?.[0];
  assert.ok(aggregateBlock);
  assert.match(
    aggregateBlock,
    /job: quality_node\n      artifacts: true/u,
  );
  assert.doesNotMatch(aggregateBlock, /quality_node_(?:core|release)/u);
  assert.doesNotMatch(
    aggregateBlock,
    /quality_resource_(?:contract|runtime)/u,
  );
  assert.doesNotMatch(
    aggregateBlock,
    /quality_(?:web_(?:checks|build)|server_(?:core|critical_postgres))/u,
  );
  assert.match(workflow, /^quality_aggregate:\n  stage: aggregate/mu);
  assert.match(workflow, /ci-quality-aggregate[.]mjs/u);
  assert.match(workflow, /plush-ci-evidence/u);
  assert.match(workflow, /quality_browser:[\s\S]+?job: quality_web_build\n      artifacts: true/u);
  assert.doesNotMatch(
    workflow.match(/^quality_browser:[\s\S]+?^quality_security:/mu)?.[0] || "",
    /job: quality_web\n/u,
  );
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
  assert.match(workflow, /export npm_config_store_dir="\$PNPM_STORE_PATH"/u);
  assert.match(
    workflow,
    /export PLAYWRIGHT_RUNTIME_ARCHIVE_DIR="\$CI_PROJECT_DIR\/output\/cache\/gitlab\/playwright-runtime"/u,
  );
  assert.match(
    workflow,
    /export PLAYWRIGHT_BROWSERS_PATH="\$CI_PROJECT_DIR\/output\/runtime\/gitlab\/playwright-\$CI_JOB_ID"/u,
  );
  assert.match(workflow, /scripts\/qa\/ci-playwright-runtime[.]mjs/u);
  assert.match(workflow, /ci-playwright-runtime[.]mjs seed/u);
  assert.match(workflow, /ci-playwright-runtime[.]mjs materialize/u);
  assert.match(workflow, /ci-playwright-runtime[.]mjs cleanup/u);
  assert.match(
    workflow,
    /test "\$\(stat -c '%U:%G:%a' \/usr\/local\/sbin\/plush-remove-chromium-sandbox\)" = root:root:755\n {6}sudo -n -l \/usr\/local\/sbin\/plush-remove-chromium-sandbox "\$CI_JOB_ID" >\/dev\/null/u,
  );
  assert.match(
    workflow,
    new RegExp(
      `^[.]pnpm_cache_pull: &pnpm_cache_pull\\n  cache:\\n    - &pnpm_cache_entry\\n      key:\\n        prefix: r640-node-${nodeVersion}-pnpm-v1\\n        files:\\n          - web/pnpm-lock[.]yaml\\n      paths:\\n        - output/cache/gitlab/pnpm-store/\\n      policy: pull`,
      "mu",
    ),
  );
  assert.match(
    workflow,
    new RegExp(
      `^[.]browser_cache_pull: &browser_cache_pull\\n  cache:\\n    - \\*pnpm_cache_entry\\n    - &playwright_cache_entry\\n      key:\\n        prefix: r640-node-${nodeVersion}-playwright-v3\\n        files:\\n          - scripts/qa/ci-playwright-runtime[.]mjs\\n          - web/pnpm-lock[.]yaml\\n      paths:\\n        - output/cache/gitlab/playwright-runtime/\\n      policy: pull`,
      "mu",
    ),
  );
  assert.match(
    workflow,
    /prepare:[\s\S]+?cache:\n    - <<: \*pnpm_cache_entry\n      policy: pull-push\n    - <<: \*playwright_cache_entry\n      policy: pull-push/u,
  );
  assert.match(workflow, /policy: pull-push/u);
  assert.match(workflow, /policy: pull/u);
  for (const shard of [
    "node_release",
    "node_core",
    "node",
    "web_checks",
    "web_build",
  ]) {
    assert.match(
      workflow,
      new RegExp(
        `^quality_${shard}:\\n  <<: \\[\\*quality_shard, \\*pnpm_cache_pull\\]`,
        "mu",
      ),
    );
  }
  for (const shard of ["server_core", "browser"]) {
    assert.match(
      workflow,
      new RegExp(
        `^quality_${shard}:\\n  <<: \\[\\*quality_shard, \\*browser_cache_pull\\]`,
        "mu",
      ),
    );
  }
  assert.match(
    workflow,
    /^quality_affected:\n  stage: quality\n  <<: \*browser_cache_pull/mu,
  );
  for (const shard of [
    "static",
    "resource_contract",
    "resource_runtime",
    "resource",
    "web",
    "server_critical_postgres",
    "server",
    "security",
  ]) {
    assert.match(
      workflow,
      new RegExp(`^quality_${shard}:\\n  <<: \\*quality_shard`, "mu"),
    );
  }
  assert.match(
    workflow,
    /^quality_aggregate:\n  stage: aggregate\n  <<: \*main_quality_rules/mu,
  );
  assert.doesNotMatch(workflow, /output\/ci\/cache/u);
  assert.doesNotMatch(workflow, /\$CI_PROJECT_DIR\/[.]cache/u);
  assert.doesNotMatch(workflow, /output\/cache\/gitlab\/ms-playwright/u);
  assert.doesNotMatch(workflow, /[.]ci-plan[.]env/u);
  assert.doesNotMatch(workflow, /reports:\n\s+dotenv:/u);
  assert.match(workflow, /[.]flags[.]needsPostgres/u);
  assert.match(workflow, /case "\$boolean_value" in true\|false/u);
  assert.doesNotMatch(workflow, /playwright install chromium/u);
  assert.doesNotMatch(workflow, /playwright install --with-deps/u);
});

test("GitLab release reuses push CI, builds one candidate and freezes rehearsal evidence", () => {
  const publish = workflow.match(
    /^publish_release:[\s\S]+?(?=^backfill_release_source:)/mu,
  )?.[0];
  assert.ok(publish);
  assert.doesNotMatch(workflow, /\$RELEASE_SHA != ""/u);
  assert.match(
    workflow,
    /CI_PIPELINE_SOURCE =~ \/\^\(api\|trigger\|web\)\$\/ && \$RELEASE_SHA && \$RELEASE_VERSION && \$RELEASE_VERSION_REFERENCE/u,
  );
  assert.doesNotMatch(workflow, /^strict:/mu);
  assert.match(workflow, /^publish_release:\n  stage: release/mu);
  assert.match(workflow, /resource_group: immutable-release-catalog/u);
  assert.match(workflow, /test "\$RELEASE_SHA" = "\$CI_COMMIT_SHA"/u);
  assert.match(
    workflow,
    /test "\$RELEASE_SHA" = "\$\(git rev-parse origin\/main\)"/u,
  );
  assert.match(workflow, /CI_COMMIT_REF_PROTECTED/u);
  assert.match(workflow, /gitlab-strict-terminal-reuse[.]mjs/u);
  assert.match(workflow, /gitlab-release-candidate[.]mjs recover/u);
  assert.match(workflow, /gitlab-release-candidate[.]mjs prepare/u);
  assert.match(workflow, /release-version-catalog[.]mjs verify/u);
  assert.match(workflow, /test -n "\$RELEASE_VERSION_REFERENCE"/u);
  assert.match(workflow, /--reference "\$RELEASE_VERSION_REFERENCE"/u);
  assert.match(workflow, /--observed-at "\$CI_PIPELINE_CREATED_AT"/u);
  assert.match(workflow, /local-release-rehearsal[.]mjs/u);
  assert.match(workflow, /--rehearsal-receipt/u);
  assert.match(workflow, /plush-release-candidate/u);
  assert.match(workflow, /plush-release-rehearsal/u);
  assert.equal(
    workflow.match(/release-artifact-bundle[.]mjs/gu)?.length ?? 0,
    1,
  );
  assert.match(workflow, /GITHUB_PACKAGES_TOKEN/u);
  assert.match(workflow, /GITLAB_RELEASE_TOKEN/u);
  assert.match(publish, /printf 'header = "JOB-TOKEN: %s"/u);
  assert.match(publish, /--config "\$job_token_config"/u);
  assert.match(publish, /--config "\$private_token_config"/u);
  assert.match(
    publish,
    /chmod 0600 "\$job_token_config" "\$private_token_config"/u,
  );
  assert.match(publish, /cleanup_publish_credentials/u);
  assert.doesNotMatch(
    publish,
    /--header\s+"(?:PRIVATE|JOB)-TOKEN:/u,
  );
  assert.match(workflow, /github-release-asset-set[.]mjs finalize/u);
  assert.match(workflow, /output\/ci\/release-assets[.]json/u);
  assert.match(
    workflow,
    /gitlab-release-publication[.]mjs plan/u,
  );
  assert.match(workflow, /--missing-out "\$missing_assets"/u);
  assert.match(workflow, /done < "\$missing_assets"/u);
  assert.match(workflow, /gitlab-release-publication[.]mjs verify/u);
  assert.match(
    workflow,
    /git archive --format=tar --output="\$source_archive" "\$RELEASE_SHA"/u,
  );
  assert.match(
    workflow,
    /[.]sourceArchive[.]sha256[\s\S]+?sha256sum "\$source_archive"/u,
  );
  assert.match(workflow, /gitlab-release-publication[.]mjs plan-source/u);
  assert.match(workflow, /gitlab-release-publication[.]mjs verify-source/u);
  assert.match(
    workflow,
    /packages\/generic\/plush-release-source\/\$package_version\/source[.]tar/u,
  );
  assert.ok(
    workflow.indexOf("gitlab-release-publication.mjs verify-source") <
      workflow.indexOf('release_api="$CI_API_V4_URL'),
    "the exact source package must be verified before the GitLab Release is created",
  );
  assert.doesNotMatch(workflow, /refusing supplementation/u);
});

test("GitLab CI gate keeps its evidence token out of curl argv", () => {
  const gate = workflow.match(
    /^"CI Gate":[\s\S]+?(?=^publish_release:)/mu,
  )?.[0];
  assert.ok(gate);
  assert.match(gate, /job_token_config=output\/ci\/ci-gate-job-token[.]curl/u);
  assert.match(gate, /chmod 0600 "\$job_token_config"/u);
  assert.match(gate, /curl --config "\$job_token_config"/u);
  assert.match(gate, /cleanup_evidence_credentials/u);
  assert.match(gate, /test ! -e "\$job_token_config"/u);
  assert.equal(
    gate.includes(
      '[[ "$CI_JOB_TOKEN" =~ ^[A-Za-z0-9_.-]{20,4096}$ ]]',
    ),
    true,
  );
  assert.doesNotMatch(gate, /--header\s+"JOB-TOKEN:/u);
});

test("every job-token consumer accepts GitLab 19 JWT-sized credentials", () => {
  assert.equal(
    workflow.split('[[ "$CI_JOB_TOKEN" =~ ^[A-Za-z0-9_.-]{20,4096}$ ]]')
      .length - 1,
    3,
  );
  assert.equal(
    workflow.includes(
      '[[ "$GITLAB_RELEASE_TOKEN" =~ ^[A-Za-z0-9_.-]{20,512}$ ]]',
    ),
    true,
  );
  assert.equal(
    workflow.includes('CI_JOB_TOKEN" =~ ^[A-Za-z0-9_.-]{20,512}'),
    false,
  );
});

test("historical source backfill is one protected internal job and cannot rewrite formal assets", () => {
  assert.match(
    workflow,
    /CI_PIPELINE_SOURCE =~ \/\^\(api\|web\)\$\/ && \$BACKFILL_RELEASE_SOURCE_SHA/u,
  );
  const backfill = workflow.match(/^backfill_release_source:[\s\S]+$/mu)?.[0];
  assert.ok(backfill);
  assert.match(backfill, /resource_group: immutable-release-catalog/u);
  assert.match(backfill, /CI_COMMIT_REF_PROTECTED/u);
  assert.match(backfill, /git merge-base --is-ancestor/u);
  assert.match(
    backfill,
    /git archive --format=tar --output="\$source_archive" "\$BACKFILL_RELEASE_SOURCE_SHA"/u,
  );
  assert.match(backfill, /validate-source-backfill/u);
  assert.match(backfill, /gitlab-release-publication[.]mjs plan-source/u);
  assert.match(backfill, /gitlab-release-publication[.]mjs verify-source/u);
  assert.match(
    backfill,
    /packages\/generic\/plush-release-source\/\$package_version\/source[.]tar/u,
  );
  assert.equal(backfill.match(/--upload-file/gu)?.length ?? 0, 1);
  assert.doesNotMatch(
    backfill,
    /packages\/generic\/plush-release\/\$package_version\/[^$]/u,
  );
  assert.doesNotMatch(backfill, /release-artifact-bundle|releases\?/u);
  assert.ok(
    backfill.indexOf("validate-source-backfill") <
      backfill.indexOf('--upload-file "$source_archive"'),
    "the historical formal release must be validated before source upload",
  );
  assert.match(
    backfill,
    /rm -f -- "\$job_token_config" "\$private_token_config"/u,
  );
  assert.match(
    backfill,
    /chmod 0600 "\$job_token_config" "\$private_token_config"/u,
  );
  assert.match(backfill, /test ! -e "\$job_token_config"/u);
  assert.match(backfill, /test ! -e "\$private_token_config"/u);
  assert.match(
    backfill,
    /printf 'header = "PRIVATE-TOKEN: %s"\\n' "\$GITLAB_RELEASE_TOKEN" > "\$private_token_config"/u,
  );
  assert.doesNotMatch(
    backfill,
    /curl[^\n]*(?:PRIVATE-TOKEN|GITLAB_RELEASE_TOKEN)/u,
  );
  assert.doesNotMatch(
    backfill,
    /--header\s+"(?:PRIVATE|DEPLOY)-TOKEN:/u,
  );
});

test("GitLab jobs stay on the isolated runner and never receive the R640 host socket", () => {
  assert.match(workflow, /tags:\n    - plush\n    - isolated\n    - amd64/u);
  assert.doesNotMatch(workflow, /\/var\/run\/docker[.]sock/u);
  assert.doesNotMatch(workflow, /privileged:\s*true/u);
  assert.doesNotMatch(workflow, /8[.]218[.]4[.]199|192[.]168[.]0[.]133/u);
  assert.doesNotMatch(workflow, /PRIVATE-TOKEN:\s*[A-Za-z0-9_-]{16,}/u);
});

test("R640 GitLab definitions pin identity, separate SSD data and require exact execution", () => {
  const runnerRegistration = runnerCloudInit.match(
    /path: \/usr\/local\/sbin\/plush-register-gitlab-runner[\s\S]+?\n\nruncmd:/u,
  )?.[0];

  assert.ok(runnerRegistration);
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
  assert.match(runnerRegistration, /gitlab-runner register --non-interactive/u);
  assert.match(runnerRegistration, /--url https:\/\/gitlab[.]saurick[.]me/u);
  assert.match(runnerRegistration, /--token "\$GITLAB_RUNNER_TOKEN"/u);
  assert.match(runnerRegistration, /--name r640-kvm-isolated-shell/u);
  assert.match(runnerRegistration, /--executor shell/u);
  assert.match(runnerRegistration, /concurrent = 4/u);
  assert.match(runnerRegistration, /limit = 4/u);
  assert.doesNotMatch(
    runnerRegistration,
    /--(?:access-level|locked|maintenance-note|maximum-timeout|paused|run-untagged|tag-list)(?:[=\s]|$)/u,
  );
  assert.match(runnerCloudInit, /libnss3/u);
  assert.equal(runnerCloudInit.match(/^  - curl$/gmu)?.length ?? 0, 1);
  assert.match(runnerCloudInit, /plush-remove-chromium-sandbox/u);
  assert.match(runnerCloudInit, /chrome-devel-sandbox-\$1/u);
  assert.doesNotMatch(runnerCloudInit, /NOPASSWD: \/usr\/bin\/apt-get/u);
  assert.match(runnerCloudInit, /ssh_pwauth: false/u);
  assert.match(runnerCloudInit, /disable_root: true/u);
  assert.match(runnerCloudInit, /chmod 0600 \/etc\/gitlab-runner\/config[.]toml/u);
  assert.doesNotMatch(runnerCloudInit, /curl[^\n]*[|]\s*(?:ba)?sh/u);
});

test("Runner verifier enters a neutral cwd before cross-user checks", () => {
  assert.match(
    runnerCloudInit,
    /path: \/usr\/local\/sbin\/plush-verify-runner-bootstrap[\s\S]+?set -euo pipefail\n\n      cd \/tmp[\s\S]+?runuser -u gitlab-runner -- \/usr\/local\/bin\/pnpm --version/u,
  );
  assert.doesNotMatch(runnerCloudInit, /chmod[^\n]*\/home\/ubuntu/u);
});

test("Runner VM rebuild preserves QGA and the internal canonical GitLab route", () => {
  const routeConfigurator = runnerCloudInit.match(
    /path: \/usr\/local\/sbin\/plush-configure-gitlab-route[\s\S]+?\n  - path: \/usr\/local\/sbin\/plush-runner-toolchain/u,
  )?.[0];
  const runnerRegistration = runnerCloudInit.match(
    /path: \/usr\/local\/sbin\/plush-register-gitlab-runner[\s\S]+?\n\nruncmd:/u,
  )?.[0];

  assert.ok(routeConfigurator);
  assert.ok(runnerRegistration);
  assert.equal(
    runnerCloudInit.match(/^  - qemu-guest-agent$/gmu)?.length ?? 0,
    1,
  );
  assert.match(
    runnerCloudInit,
    /name: gitlab-runner[\s\S]+?shell: \/usr\/sbin\/nologin/u,
  );
  assert.match(
    runnerCloudInit,
    /path: \/etc\/profile[.]d\/plush-gitlab-canonical-route[.]sh[\s\S]+?NO_PROXY=.*gitlab[.]saurick[.]me[\s\S]+?no_proxy=.*gitlab[.]saurick[.]me/u,
  );
  assert.match(
    runnerCloudInit,
    /path: \/etc\/systemd\/system\/gitlab-runner[.]service[.]d\/20-plush-canonical-gitlab-route[.]conf[\s\S]+?Environment="NO_PROXY=gitlab[.]saurick[.]me"[\s\S]+?Environment="no_proxy=gitlab[.]saurick[.]me"/u,
  );
  assert.match(routeConfigurator, /canonical_ip=192[.]168[.]124[.]1/u);
  assert.match(routeConfigurator, /test "\$host_count" = "\$exact_count"/u);
  assert.match(routeConfigurator, /case "\$exact_count" in/u);
  assert.match(routeConfigurator, /systemctl daemon-reload/u);
  assert.match(runnerCloudInit, /systemctl start qemu-guest-agent/u);
  assert.match(
    runnerCloudInit,
    /test -c \/dev\/virtio-ports\/org[.]qemu[.]guest_agent[.]0/u,
  );
  assert.match(
    runnerCloudInit,
    /runuser -l "\$user" -s \/bin\/bash -c/u,
  );
  assert.match(runnerRegistration, /verify_canonical_gitlab/u);
  assert.match(
    runnerRegistration,
    /NO_PROXY=gitlab[.]saurick[.]me no_proxy=gitlab[.]saurick[.]me[\s\S]+?curl[\s\S]+?https:\/\/gitlab[.]saurick[.]me\//u,
  );
  assert.match(
    runnerRegistration,
    /node --input-type=module -e '[\s\S]+?fetch\("https:\/\/gitlab[.]saurick[.]me\/"\)/u,
  );
  assert.match(
    runnerRegistration,
    /systemctl show --property=MainPID --value gitlab-runner[.]service/u,
  );
  assert.match(runnerRegistration, /<"\/proc\/\$runner_pid\/environ"/u);
});

test("Runner VM bootstrap installs and verifies the pinned GNU Make toolchain", () => {
  assert.equal(runnerCloudInit.match(/^  - make$/gmu)?.length ?? 0, 1);
  assert.match(
    runnerCloudInit,
    /test "\$\(stat -c '%U:%G:%a' \/usr\/bin\/make\)" = root:root:755/u,
  );
  assert.match(
    runnerCloudInit,
    /test "\$\(\/usr\/bin\/make --version \| head -n 1\)" = 'GNU Make 4[.]3'/u,
  );
});

test("Runner VM and CI pin the Docker release plugins", () => {
  const defaultBeforeScript = workflow.match(
    /^default:\n[\s\S]+?\n\nvariables:/mu,
  )?.[0];

  assert.ok(defaultBeforeScript);
  assert.equal(runnerCloudInit.match(/^  - docker-buildx$/gmu)?.length ?? 0, 1);
  assert.equal(
    runnerCloudInit.match(/^  - docker-compose-v2$/gmu)?.length ?? 0,
    1,
  );
  assert.match(
    runnerCloudInit,
    /dpkg-query -W -f='\$\{Status\} \$\{Version\} \$\{Architecture\}' docker-buildx\)" = 'install ok installed 0[.]30[.]1-0ubuntu1~24[.]04[.]1 amd64'/u,
  );
  assert.match(
    runnerCloudInit,
    /dpkg-query -W -f='\$\{Status\} \$\{Version\} \$\{Architecture\}' docker-compose-v2\)" = 'install ok installed 2[.]40[.]3\+ds1-0ubuntu1~24[.]04[.]1 amd64'/u,
  );
  for (const plugin of ["docker-buildx", "docker-compose"]) {
    assert.match(
      runnerCloudInit,
      new RegExp(
        `test "\\$\\(stat -Lc '%U:%G:%a' /usr/libexec/docker/cli-plugins/${plugin.replaceAll("-", "[-]")}\\)" = root:root:755`,
        "u",
      ),
    );
  }
  assert.match(
    runnerCloudInit,
    /test "\$\(docker buildx version \| awk '\{print \$2; exit\}'\)" = 0[.]30[.]1/u,
  );
  assert.match(
    runnerCloudInit,
    /test "\$\(docker compose version --short\)" = 2[.]40[.]3[+]ds1-0ubuntu1~24[.]04[.]1/u,
  );
  assert.match(
    defaultBeforeScript,
    /test "\$\(docker buildx version \| awk '\{print \$2; exit\}'\)" = "0[.]30[.]1"/u,
  );
  assert.match(
    defaultBeforeScript,
    /test "\$\(docker compose version --short\)" = "2[.]40[.]3[+]ds1-0ubuntu1~24[.]04[.]1"/u,
  );
});

test("Runner VM bootstrap installs a native compiler and fails closed without CGO", () => {
  assert.equal(runnerCloudInit.match(/^  - gcc$/gmu)?.length ?? 0, 1);
  assert.match(
    runnerCloudInit,
    /test "\$\(stat -Lc '%U:%G:%a' \/usr\/bin\/gcc\)" = root:root:755/u,
  );
  assert.match(runnerCloudInit, /verify_go_cgo_enabled\(\) \{/u);
  for (const user of ["ubuntu", "root", "gitlab-runner"]) {
    assert.match(
      runnerCloudInit,
      new RegExp(`verify_go_cgo_enabled ${user.replaceAll("-", "[-]")}`, "u"),
    );
  }
  assert.doesNotMatch(runnerCloudInit, /(?:export\s+)?CGO_ENABLED=/u);
  assert.match(workflow, /test "\$\(go env CGO_ENABLED\)" = "1"/u);
  assert.doesNotMatch(workflow, /(?:export\s+)?CGO_ENABLED=/u);
});

test("Runner VM bootstrap retries pinned downloads and fails closed", () => {
  const downloadCalls = runnerCloudInit.match(/^\s+download_file\s/gmu) ?? [];
  const rawCurlCalls = runnerCloudInit
    .split("\n")
    .filter((line) => /^(?:if )?curl \\$/u.test(line.trim()));
  const resumableDownload = runnerCloudInit.match(
    /download_resumable_file\(\) \{[\s\S]+?\n      \}/u,
  )?.[0];
  const runcmdEntries = runnerCloudInit.match(/^  - \[bash, -lc, .+\]$/gmu) ?? [];

  assert.equal(downloadCalls.length, 5);
  assert.equal(rawCurlCalls.length, 2);
  assert.ok(resumableDownload);
  assert.match(resumableDownload, /--continue-at -/u);
  assert.match(resumableDownload, /for attempt in 1 2 3 4 5 6 7 8 9 10 11 12/u);
  assert.match(resumableDownload, /stat -c %s/u);
  assert.doesNotMatch(resumableDownload, /--remove-on-error|--retry(?:-|\s)/u);
  assert.match(runnerCloudInit, /--connect-timeout 20/u);
  assert.match(runnerCloudInit, /--max-time 300/u);
  assert.match(runnerCloudInit, /--retry 5/u);
  assert.match(runnerCloudInit, /--retry-delay 5/u);
  assert.match(runnerCloudInit, /--retry-max-time 900/u);
  assert.match(runnerCloudInit, /--retry-all-errors/u);
  assert.match(runnerCloudInit, /--remove-on-error/u);
  assert.match(
    runnerCloudInit,
    /retry_command env GOPROXY=https:\/\/goproxy[.]cn,direct GOSUMDB=sum[.]golang[.]google[.]cn GOBIN=\/usr\/local\/bin go install golang[.]org\/x\/vuln\/cmd\/govulncheck@v1[.]6[.]0/u,
  );
  assert.match(
    runnerCloudInit,
    /retry_command env GOPROXY=https:\/\/goproxy[.]cn,direct GOSUMDB=sum[.]golang[.]google[.]cn GOBIN=\/usr\/local\/bin go install mvdan[.]cc\/sh\/v3\/cmd\/shfmt@v3[.]13[.]1/u,
  );
  assert.match(
    runnerCloudInit,
    /retry_command env ATLAS_VERSION=v1[.]2[.]0 bash/u,
  );
  assert.match(
    runnerCloudInit,
    /37ebf1a5c7a30d5fabe0c5df44ee8da4c965ca0c5af3dbab28c3a1681b70a256218d05c81c9c0dcf767ef6b8551eb5b960042b9ed4300c59242336377e01cfad/u,
  );
  assert.match(runnerCloudInit, /sha512sum --check --strict/u);
  assert.match(
    runnerCloudInit,
    /ln -sfn \/opt\/pnpm\/bin\/pnpm[.]cjs \/usr\/local\/bin\/pnpm/u,
  );
  assert.doesNotMatch(runnerCloudInit, /corepack prepare|COREPACK_HOME/u);
  assert.match(
    runnerCloudInit,
    /runuser -u gitlab-runner -- \/usr\/local\/bin\/pnpm --version/u,
  );
  assert.match(
    runnerCloudInit,
    /path: \/etc\/profile[.]d\/plush-go-module-network[.]sh/u,
  );
  assert.match(
    runnerCloudInit,
    /export GOPROXY=https:\/\/goproxy[.]cn,direct/u,
  );
  assert.match(runnerCloudInit, /export GOSUMDB=sum[.]golang[.]google[.]cn/u);
  for (const user of ["ubuntu", "root", "gitlab-runner"]) {
    assert.match(
      runnerCloudInit,
      new RegExp(`verify_go_module_env ${user.replaceAll("-", "[-]")}`, "u"),
    );
  }
  assert.match(
    runnerCloudInit,
    /test "\$\(gitlab-runner --version [^\n]+\)" = 19[.]3[.]0/u,
  );
  assert.match(runnerCloudInit, /systemctl cat gitlab-runner[.]service/u);
  assert.match(
    runnerCloudInit,
    /\/usr\/local\/sbin\/plush-verify-runner-bootstrap/u,
  );
  assert.deepEqual(runcmdEntries, [
    "  - [bash, -lc, '/usr/local/sbin/plush-bootstrap-gitlab-runner']",
  ]);
});

test("Runner VM bootstrap skips only exact base toolchain state", () => {
  assert.match(runnerCloudInit, /symlink_target_is\(\) \{/u);
  assert.match(runnerCloudInit, /\[\[ -x \/opt\/node\/bin\/node \]\]/u);
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/node \/opt\/node\/bin\/node/u,
  );
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/npm \/opt\/node\/bin\/npm/u,
  );
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/npx \/opt\/node\/bin\/npx/u,
  );
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/corepack \/opt\/node\/bin\/corepack/u,
  );
  assert.match(
    runnerCloudInit,
    /\[\[ "\$\(\/usr\/local\/bin\/node --version\)" == "v\$\{node_version\}" \]\]/u,
  );
  assert.match(runnerCloudInit, /\[\[ -x \/opt\/pnpm\/bin\/pnpm[.]cjs \]\]/u);
  assert.match(runnerCloudInit, /\[\[ -x \/opt\/pnpm\/bin\/pnpx[.]cjs \]\]/u);
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/pnpm \/opt\/pnpm\/bin\/pnpm[.]cjs/u,
  );
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/pnpx \/opt\/pnpm\/bin\/pnpx[.]cjs/u,
  );
  assert.match(
    runnerCloudInit,
    /\[\[ "\$\(\/usr\/local\/bin\/pnpm --version\)" == "\$pnpm_version" \]\]/u,
  );
  assert.match(runnerCloudInit, /\[\[ -x \/usr\/local\/go\/bin\/go \]\]/u);
  assert.match(
    runnerCloudInit,
    /symlink_target_is \/usr\/local\/bin\/go \/usr\/local\/go\/bin\/go/u,
  );
  assert.match(
    runnerCloudInit,
    /\[\[ "\$\(\/usr\/local\/bin\/go env GOVERSION\)" == "go\$\{go_version\}" \]\]/u,
  );
  assert.match(
    runnerCloudInit,
    /if ! node_ready; then\n\s+node_archive=[\s\S]+?sha256sum --check --strict[\s\S]+?\n\s+fi\n\s+if ! pnpm_ready; then/u,
  );
  assert.match(
    runnerCloudInit,
    /if ! pnpm_ready; then\n\s+pnpm_archive=[\s\S]+?sha512sum --check --strict[\s\S]+?\n\s+fi\n\s+if ! go_ready; then/u,
  );
  assert.match(
    runnerCloudInit,
    /if ! go_ready; then\n\s+go_archive=[\s\S]+?sha256sum --check --strict[\s\S]+?\n\s+fi\n\s+if ! govulncheck_ready; then\n\s+retry_command env GOPROXY=/u,
  );
  assert.doesNotMatch(
    runnerCloudInit,
    /command -v (?:node|npm|npx|corepack|pnpm|pnpx|go)/u,
  );
});

test("Runner VM bootstrap resumes the exact package with dual integrity checks", () => {
  assert.match(
    runnerCloudInit,
    /https:\/\/s3[.]dualstack[.]us-east-1[.]amazonaws[.]com\/gitlab-runner-downloads\/v\$\{runner_version\}\/deb\/gitlab-runner_amd64[.]deb/u,
  );
  assert.match(
    runnerCloudInit,
    /download_resumable_file "\$runner_package_url" "\$runner_package" 31141970/u,
  );
  assert.match(
    runnerCloudInit,
    /33be78d7358b9e49be183a6144c60cd531dc1f89b4dfb83298603809d6510ca8  \$runner_package/u,
  );
  assert.match(
    runnerCloudInit,
    /dpkg-deb --fsys-tarfile "\$runner_package" [|] tar -xOf - [.][/]usr\/bin\/gitlab-runner/u,
  );
  assert.match(
    runnerCloudInit,
    /9b642c14742b5db8622352c85f809ae6a588b6885a7d1a24caf8547e73eea7c9  \$work\/gitlab-runner-linux-amd64/u,
  );
  assert.match(
    runnerCloudInit,
    /install -o root -g root -m 0755 "\$work\/gitlab-runner-linux-amd64" \/usr\/local\/bin\/gitlab-runner/u,
  );
  assert.doesNotMatch(runnerCloudInit, /dpkg(?:-deb)?\s+-i/u);
});

test("Runner VM bootstrap skips only exact secondary tools and normalizes owners", () => {
  for (const readyCheck of [
    "govulncheck_ready",
    "shfmt_ready",
    "atlas_ready",
    "gitleaks_ready",
    "runner_ready",
  ]) {
    assert.match(runnerCloudInit, new RegExp(`${readyCheck}\\(\\) \\{`, "u"));
    assert.match(runnerCloudInit, new RegExp(`if ! ${readyCheck}; then`, "u"));
  }
  assert.match(
    runnerCloudInit,
    /\[\[ "\$\(stat -c '%U:%G:%a' "\$path"\)" == root:root:755 \]\]/u,
  );
  assert.match(
    runnerCloudInit,
    /tar -xzf "\$work\/\$gitleaks_archive" -C "\$work" gitleaks/u,
  );
  assert.match(
    runnerCloudInit,
    /install -o root -g root -m 0755 "\$work\/gitleaks" \/usr\/local\/bin\/gitleaks/u,
  );
  for (const binary of [
    "govulncheck",
    "shfmt",
    "atlas",
    "gitleaks",
    "gitlab-runner",
  ]) {
    assert.match(
      runnerCloudInit,
      new RegExp(
        `test "\\$\\(stat -c '%U:%G:%a' \/usr\/local\/bin\/${binary}\\)" = root:root:755`,
        "u",
      ),
    );
  }
});
