#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function cleanupRunnerImages(sha, options = {}) {
  const env = options.env || process.env;
  const run = options.run || spawnSync;
  const hostname = options.hostname || os.hostname();
  if (
    !/^[0-9a-f]{40}$/u.test(sha) ||
    hostname !== "plush-gitlab-runner" ||
    env.CI !== "true" ||
    env.GITLAB_CI !== "true" ||
    env.CI_PROJECT_PATH !== "saurick/plush-toy-erp"
  ) {
    throw new Error(
      "image cleanup requires the dedicated Plush CI runner and exact SHA",
    );
  }
  const call = (args) => run("docker", args, { encoding: "utf8" });
  const checked = (args) => {
    const result = call(args);
    if (result.error || result.status !== 0) {
      throw new Error(
        `runner image command failed: ${args.slice(0, 2).join(" ")}`,
      );
    }
    return result.stdout.trim();
  };
  const tags = ["server", "web"].flatMap((kind) => [
    `plush-source-archive-${kind}:${sha.slice(0, 12)}`,
    `plush-toy-erp-${kind}:yoyoosun-${sha}`,
    `ghcr.io/saurick/plush-toy-erp-${kind}:sha-${sha}`,
  ]);
  const images = [];
  for (const tag of tags) {
    const result = call(["image", "inspect", tag]);
    if (result.status !== 0) {
      if (
        !result.error &&
        /No such (?:image|object):/iu.test(result.stderr || "")
      )
        continue;
      throw new Error("runner image inspection failed");
    }
    const inspected = JSON.parse(result.stdout);
    if (inspected.length !== 1)
      throw new Error("runner image identity is ambiguous");
    const image = inspected[0];
    const revisions = [
      image.Config?.Labels?.["org.opencontainers.image.revision"],
      ...(image.Config?.Env || [])
        .filter((value) => value.startsWith("GIT_SHA="))
        .map((value) => value.slice("GIT_SHA=".length)),
    ].filter(Boolean);
    if (
      !/^sha256:[0-9a-f]{64}$/u.test(image.Id) ||
      revisions.length === 0 ||
      revisions.some((revision) => revision !== sha)
    ) {
      throw new Error("runner image revision does not match the published SHA");
    }
    images.push({ tag, id: image.Id });
  }
  for (const id of new Set(images.map((image) => image.id))) {
    if (
      checked(["ps", "-a", "--filter", `ancestor=${id}`, "--format", "{{.ID}}"])
    ) {
      return { status: "preserved", reason: "container-reference", sha };
    }
  }
  if (!options.execute) return { status: "preview", sha, images };
  // A short tag from another build must never be removed after it changes identity.
  for (const image of images) {
    const current = JSON.parse(checked(["image", "inspect", image.tag]));
    if (current.length !== 1 || current[0].Id !== image.id) {
      throw new Error("runner image tag changed before cleanup");
    }
  }
  if (images.length)
    checked(["image", "rm", ...images.map((image) => image.tag)]);
  return {
    status: "cleaned",
    sha,
    removedTags: images.map((image) => image.tag),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute");
    const rest = args.filter((arg) => arg !== "--execute");
    if (rest.length !== 2 || rest[0] !== "--sha")
      throw new Error(
        "usage: gitlab-runner-images.mjs --sha <SHA> [--execute]",
      );
    process.stdout.write(
      `${JSON.stringify(cleanupRunnerImages(rest[1], { execute }))}\n`,
    );
  } catch (error) {
    process.stderr.write(`[runner-images] ${error.message}\n`);
    process.exitCode = 1;
  }
}
