#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FRONTMATTER_KEYS = new Set(["name", "description"]);
const INTERFACE_KEYS = new Set([
  "display_name",
  "short_description",
  "icon_small",
  "icon_large",
  "brand_color",
  "default_prompt",
]);

function parseScalar(raw, source, lineNumber) {
  const value = raw.trim();
  if (!value) {
    throw new Error(`${source}:${lineNumber}: value must not be empty`);
  }
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(
        `${source}:${lineNumber}: invalid quoted value: ${error.message}`,
      );
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function parseFlatMapping(text, source, { indent = "" } = {}) {
  const mapping = new Map();
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    if (!line.startsWith(indent) || line.slice(indent.length).startsWith(" ")) {
      throw new Error(`${source}:${index + 1}: unexpected YAML indentation`);
    }
    const body = line.slice(indent.length);
    const match = body.match(/^([a-z_]+):\s*(.*)$/u);
    if (!match) {
      throw new Error(`${source}:${index + 1}: unsupported YAML line`);
    }
    const [, key, rawValue] = match;
    if (mapping.has(key)) {
      throw new Error(`${source}:${index + 1}: duplicate key ${key}`);
    }
    mapping.set(key, parseScalar(rawValue, source, index + 1));
  }
  return mapping;
}

export function parseSkillFrontmatter(content, source = "SKILL.md") {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) {
    throw new Error(`${source}: missing YAML frontmatter`);
  }
  const mapping = parseFlatMapping(match[1], source);
  for (const key of mapping.keys()) {
    if (!FRONTMATTER_KEYS.has(key)) {
      throw new Error(`${source}: unsupported frontmatter key ${key}`);
    }
  }
  for (const key of FRONTMATTER_KEYS) {
    if (!mapping.has(key)) {
      throw new Error(`${source}: missing frontmatter key ${key}`);
    }
  }
  return Object.fromEntries(mapping);
}

export function parseOpenAIYaml(content, source = "agents/openai.yaml") {
  const lines = content.split(/\r?\n/u);
  const firstContentLine = lines.findIndex(
    (line) => line.trim() && !line.trimStart().startsWith("#"),
  );
  if (firstContentLine < 0 || lines[firstContentLine].trim() !== "interface:") {
    throw new Error(`${source}: expected interface as the only top-level key`);
  }
  const bodyLines = lines.slice(firstContentLine + 1);
  const mapping = parseFlatMapping(bodyLines.join("\n"), source, {
    indent: "  ",
  });
  for (const key of mapping.keys()) {
    if (!INTERFACE_KEYS.has(key)) {
      throw new Error(`${source}: unsupported interface key ${key}`);
    }
  }
  for (const key of ["display_name", "short_description", "default_prompt"]) {
    if (!mapping.has(key)) {
      throw new Error(`${source}: missing interface key ${key}`);
    }
  }
  return Object.fromEntries(mapping);
}

function validateRelativeLinks(content, skillDir, source, errors) {
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim().split("#", 1)[0];
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/iu.test(target) ||
      target.includes("<") ||
      target.includes(">")
    ) {
      continue;
    }
    const resolved = path.resolve(skillDir, decodeURIComponent(target));
    if (!fs.existsSync(resolved)) {
      errors.push(`${source}: missing relative link target ${target}`);
    }
  }
}

export function validateSkillRoot(rootDir) {
  const root = path.resolve(rootDir);
  const skillsRoot = path.join(root, ".agents", "skills");
  const readmePath = path.join(skillsRoot, "README.md");
  const errors = [];
  if (!fs.existsSync(readmePath)) {
    return { errors: [`${readmePath}: missing skill index`], skills: [] };
  }

  const skillNames = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const skillName of skillNames) {
    const skillDir = path.join(skillsRoot, skillName);
    const skillPath = path.join(skillDir, "SKILL.md");
    const metadataPath = path.join(skillDir, "agents", "openai.yaml");
    if (!SKILL_NAME_PATTERN.test(skillName) || skillName.length > 64) {
      errors.push(`${skillDir}: invalid skill directory name`);
      continue;
    }
    if (!fs.existsSync(skillPath)) {
      errors.push(`${skillPath}: missing`);
      continue;
    }
    if (!fs.existsSync(metadataPath)) {
      errors.push(`${metadataPath}: missing`);
      continue;
    }

    const skillContent = fs.readFileSync(skillPath, "utf8");
    try {
      const frontmatter = parseSkillFrontmatter(skillContent, skillPath);
      if (frontmatter.name !== skillName) {
        errors.push(
          `${skillPath}: frontmatter name ${frontmatter.name} does not match directory ${skillName}`,
        );
      }
      if (frontmatter.description.length > 1024) {
        errors.push(`${skillPath}: description exceeds 1024 characters`);
      }
      if (/[<>]/u.test(frontmatter.description)) {
        errors.push(`${skillPath}: description must not contain angle brackets`);
      }
    } catch (error) {
      errors.push(error.message);
    }
    validateRelativeLinks(skillContent, skillDir, skillPath, errors);

    try {
      const metadata = parseOpenAIYaml(
        fs.readFileSync(metadataPath, "utf8"),
        metadataPath,
      );
      const shortLength = Array.from(metadata.short_description).length;
      if (shortLength < 25 || shortLength > 64) {
        errors.push(
          `${metadataPath}: short_description must be 25-64 characters, got ${shortLength}`,
        );
      }
      if (!/^[\x20-\x7e]+$/u.test(metadata.display_name)) {
        errors.push(`${metadataPath}: display_name must remain English/ASCII`);
      }
      if (!metadata.default_prompt.includes(`$${skillName}`)) {
        errors.push(
          `${metadataPath}: default_prompt must mention $${skillName}`,
        );
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  const readme = fs.readFileSync(readmePath, "utf8");
  const commonPrefix = skillNames.reduce((prefix, skillName) => {
    let index = 0;
    while (
      index < prefix.length &&
      index < skillName.length &&
      prefix[index] === skillName[index]
    ) {
      index += 1;
    }
    return prefix.slice(0, index);
  }, skillNames[0] || "");
  const projectPrefix = commonPrefix.slice(0, commonPrefix.lastIndexOf("-") + 1);
  const listed = [...readme.matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)+)/gu)]
    .map((match) => match[1])
    .filter((name) => name.startsWith(projectPrefix));
  for (const skillName of skillNames) {
    const count = listed.filter((name) => name === skillName).length;
    if (count !== 1) {
      errors.push(`${readmePath}: expected one $${skillName} entry, got ${count}`);
    }
  }
  for (const listedName of new Set(listed)) {
    if (!skillNames.includes(listedName)) {
      errors.push(`${readmePath}: lists missing skill $${listedName}`);
    }
  }

  return { errors, skills: skillNames };
}

function parseArgs(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) {
      root = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argv[index] === "-h" || argv[index] === "--help") {
      return { help: true, root };
    }
    throw new Error(`unknown or incomplete option: ${argv[index]}`);
  }
  return { help: false, root };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/qa/skill-health.mjs [--root <repo>]");
    return;
  }
  const result = validateSkillRoot(options.root);
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`[skill-health] ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`[skill-health] status=ok skills=${result.skills.length}`);
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPath) {
  try {
    main();
  } catch (error) {
    console.error(`[skill-health] ${error.message}`);
    process.exitCode = 1;
  }
}
