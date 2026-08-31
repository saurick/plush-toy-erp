import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  new URL("./remote-release-acquire.sh", import.meta.url),
  "utf8",
);

test("target release acquisition fixes the internal GitLab route and keeps the token out of argv", () => {
  assert.match(
    source,
    /formal_url="https:\/\/gitlab[.]saurick[.]me\/api\/v4\/projects\/saurick%2Fplush-toy-erp\/packages\/generic\/plush-release\/artifact-\$release_sha\/\$name"/u,
  );
  assert.match(source, /plush-release-source\/artifact-\$release_sha\/source[.]tar/u);
  assert.match(
    source,
    /--resolve gitlab[.]saurick[.]me:443:192[.]168[.]0[.]133/u,
  );
  assert.match(source, /acquisition_deadline=\$\(\(SECONDS \+ 900\)\)/u);
  assert.match(
    source,
    /remaining_seconds=\$\(\(acquisition_deadline - SECONDS\)\)[\s\S]*remaining_seconds > 10[\s\S]*--connect-timeout 10 --max-time "\$remaining_seconds"/u,
  );
  assert.equal(
    (source.match(/--max-time "\$remaining_seconds"/gu) || []).length,
    2,
  );
  assert.doesNotMatch(source, /--max-time 600/u);
  assert.match(source, /printf 'header = "DEPLOY-TOKEN: %s"/u);
  assert.match(source, /curl --config "\$curl_config"/u);
  assert.doesNotMatch(
    source,
    /curl[^\n]*(?:DEPLOY-TOKEN|PRIVATE-TOKEN|target_fetch_token)/u,
  );
});

test("target release acquisition validates the exact formal and source packages before publishing", () => {
  assert.match(
    source,
    /\[\.formal[.]files\[\][.]name\] \| sort\) == \["checksums[.]sha256","release-artifact[.]json","release-manifest[.]json","release-rehearsal[.]json","sbom[.]cdx[.]json","server-image[.]tar","web-image[.]tar"\]/u,
  );
  assert.match(source, /sha256sum --check --strict checksums[.]sha256/u);
  const formalValidation = source.indexOf(
    'fail "formal release asset identity does not match package metadata"',
  );
  const sourceValidation = source.indexOf(
    'fail "release source does not match formal release artifact"',
  );
  const publishLoop = source.indexOf(
    'for name in "${release_files[@]}"; do',
    sourceValidation,
  );
  assert.ok(formalValidation >= 0 && formalValidation < publishLoop);
  assert.ok(sourceValidation >= 0 && sourceValidation < publishLoop);
  assert.equal(
    source.slice(0, publishLoop).includes('mv "$fetch_materializing/'),
    false,
  );
  assert.ok(
    source.indexOf("fetch_payloads_published=1") < publishLoop,
    "cleanup ownership must be recorded before the first payload move",
  );
});

test("target release acquisition has exact partial-state and transient-secret cleanup gates", () => {
  assert.match(
    source,
    /any_present=0 all_present=1[\s\S]*partial target release acquisition exists/u,
  );
  assert.match(
    source,
    /-e "\$incoming\/\$name" \|\| -L "\$incoming\/\$name"/u,
  );
  assert.match(
    source,
    /"\$\{target_fetch_token-\}" =~ \^\[A-Za-z0-9_[.]-\]\{20,512\}\$/u,
  );
  assert.match(source, /unset target_fetch_token/u);
  assert.match(source, /rm -f -- "\$curl_config"/u);
  assert.match(source, /-z "\$\{target_fetch_token\+x\}"/u);
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
  assert.match(source, /rm -rf -- "\$fetch_materializing"/u);
  assert.match(source, /acquisition_mode=target_cache/u);
  assert.match(source, /acquisition_mode=gitlab_internal/u);
  for (const script of [
    "remote-target-initialization.sh",
    "remote-promotion.sh",
    "remote-code-rollback.sh",
  ]) {
    const caller = readFileSync(path.join(import.meta.dirname, script), "utf8");
    assert.match(caller, /fetch_payloads_published=0/u, script);
    assert.match(
      caller,
      /"\$incoming\/checksums[.]sha256" "\$incoming\/release-artifact[.]json"[\s\\]+\n[\s]*"\$incoming\/release-manifest[.]json" "\$incoming\/release-rehearsal[.]json"[\s\S]*"\$incoming\/source[.]tar" "\$incoming\/web-image[.]tar"/u,
      script,
    );
  }
});
