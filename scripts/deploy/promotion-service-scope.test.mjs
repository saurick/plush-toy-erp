import assert from "node:assert/strict";
import test from "node:test";
import { readPromotionServiceScope } from "./promotion-service-scope.mjs";

const before = "a".repeat(40);
const after = "b".repeat(40);
const id = (char) => `sha256:${char.repeat(64)}`;
const args = {
  repoRoot: "/fixture",
  targetKey: "demo-133",
  currentGitSha: before,
  candidateGitSha: after,
};
const candidate = [
  "promotion_postgres_image=postgres:18.6",
  "promotion_jaeger_image=jaegertracing/jaeger:2.21.0",
  "promotion_attachment_store_image=chrislusf/seaweedfs:4.47",
  "promotion_jaeger_mem_limit=192m",
  "promotion_jaeger_mem_reservation=96m",
].join("\n");

test("the comparison uses the selected commit and separates outside storage from pinned dependencies", () => {
  const scope = readPromotionServiceScope(args, {
    run(command, argv, options) {
      if (command === "git") {
        const blob = argv[2];
        if (blob.endsWith("remote-promotion.sh")) {
          assert.equal(blob, `${after}:scripts/deploy/remote-promotion.sh`);
          return { status: 0, stdout: candidate };
        }
        return {
          status: 0,
          stdout: blob.endsWith("jaeger-v2.yml") ? blob : "unchanged",
        };
      }
      assert.match(options.input, new RegExp(before));
      return {
        status: 0,
        stdout: [
          "external",
          `postgres postgres:18.6 ${id("a")} 0 0 ${id("b")} linux/amd64`,
          `jaeger jaegertracing/jaeger:2.21.0 ${id("c")} 268435456 100663296 ${id("c")} linux/amd64`,
        ].join("\n"),
      };
    },
  });
  assert.deepEqual(scope.configurationChanges, ["jaegerConfig"]);
  assert.deepEqual(
    scope.services.map(({ key }) => key),
    ["postgres", "jaeger"],
  );
  assert.notEqual(
    scope.services[0].current.contentId,
    scope.services[0].candidate.contentId,
  );
  assert.equal(scope.services[1].candidate.memoryLimit, 201326592);
});

test("unexpected shell syntax in a candidate image pin stops before the target probe", () => {
  assert.throws(
    () =>
      readPromotionServiceScope(args, {
        run(command) {
          assert.equal(command, "git");
          return {
            status: 0,
            stdout: candidate.replace("postgres:18.6", "$(arbitrary-command)"),
          };
        },
      }),
    /promotion service scope is unavailable or invalid/u,
  );
});
