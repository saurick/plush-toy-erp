import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { renderBusinessHandbookMarkdown, getBusinessHandbookIntroductions, getBusinessPageHandbookSections } from "../../web/src/erp/config/businessHandbook.mjs";
import { BUSINESS_USABILITY_CATALOG } from "../../web/src/erp/config/businessUsabilityCatalog.mjs";
import { ENGINEERING_MATERIAL_HELP } from "../../web/src/erp/config/engineeringMaterialHelp.mjs";
import { ROLE_HELP_GUIDES } from "../../web/src/erp/config/roleHelpContent.mjs";
import { getHelpReadingCatalog, HELP_REFERENCE_PAGES } from "../../web/src/erp/config/helpManualCatalog.mjs";
import { getRoleHelpScenarios } from "../../web/src/erp/config/helpScenarios.mjs";
import { getProjectManualDocuments } from "../../web/src/erp/config/projectManuals.mjs";
import {
  renderBusinessHandbookHtml,
  renderProjectManualHtml,
  wrapHandbookHtml,
} from "../../web/src/erp/utils/businessHandbookExport.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const manualDirectory = path.join(root, "docs/manuals");
const runtimePath = path.join(root, "server/internal/projectmanuals/content.generated.json");
const businessPath = path.join(manualDirectory, "业务使用手册.md");

export function renderHelpDesignSnapshots(source) {
  const declaration = (name) => {
    const matches = [...source.matchAll(new RegExp(`    const ${name} = ([\\s\\S]*?);\\n`, "gu"))];
    if (matches.length !== 1) throw new Error(`帮助交互稿缺少唯一内容快照 ${name}`);
    return matches[0];
  };
  const catalog = JSON.parse(declaration("catalog")[1]);
  catalog.roles = ROLE_HELP_GUIDES.map((guide) => ({ key: guide.key, label: guide.label, scenes: getRoleHelpScenarios(guide, { isSuperAdmin: true }) }));
  const fields = ["key", "title", "sectionTitle", "task", "path", "flowSteps", "roleHelpKeys", "completion", "handoff", "boundary", "items"];
  const values = {
    catalog,
    helpReferencePages: HELP_REFERENCE_PAGES.map((page) => Object.fromEntries(fields.map((field) => [field, page[field]]))),
    handbookPageAdditions: Object.fromEntries(HELP_REFERENCE_PAGES.map((page) => [page.key, getBusinessPageHandbookSections(page)])),
  };
  for (const [name, value] of Object.entries(values)) {
    const match = declaration(name);
    source = source.slice(0, match.index) + `    const ${name} = ${JSON.stringify(value, null, 2)};\n` + source.slice(match.index + match[0].length);
  }
  return source;
}
const manuals = ["业务使用手册", "管理员与实施手册", "技术维护与运维手册"];
const sourcePaths = [
  "web/src/erp/config/businessHandbook.mjs",
  "web/src/erp/config/projectManuals.mjs",
  "web/src/erp/config/businessHandbookOperations.mjs",
  "web/src/erp/config/businessUsabilityCatalog.mjs",
  "web/src/erp/config/businessModules.mjs",
  "web/src/erp/config/engineeringMaterialHelp.mjs",
  "web/src/erp/config/roleHelpContent.mjs",
  "web/src/erp/utils/businessHandbookExport.mjs",
  "web/src/common/components/markdown/anchors.mjs",
  "scripts/docs/project-manuals.mjs",
  "server/internal/projectmanuals/content.generated.json",
  "server/internal/projectmanuals/documents.generated.json",
  ...manuals.map((title) => `docs/manuals/${title}.md`),
];
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function sourceDigests() {
  return Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (file) => [
        file,
        digest(await readFile(path.join(root, file))),
      ]),
    ),
  );
}

export async function generateBusinessManual({ check = false } = {}) {
  const expected = renderBusinessHandbookMarkdown();
  if (check) {
    const current = await readFile(businessPath, "utf8");
    if (current !== expected)
      throw new Error(
        "业务使用手册与当前帮助内容不同步，请运行 node scripts/docs/project-manuals.mjs",
      );
    return;
  }
  await mkdir(manualDirectory, { recursive: true });
  if (await readFile(businessPath, "utf8").catch(() => "") !== expected) await writeFile(businessPath, expected);
}

export async function generateRuntimeProjectManuals({ check = false } = {}) {
  const definitions = [
    { key: "administration", title: "管理员与实施手册", summary: "实施准备、人员岗位、权限配置、培训验收和日常管理。" },
    { key: "operations", title: "技术维护与运维手册", summary: "开发接手、运行维护、迁移发布、备份恢复和排障。" },
  ];
  const values = await Promise.all(definitions.map(async definition => {
    const markdown = await readFile(path.join(manualDirectory, `${definition.title}.md`), "utf8");
    return { ...definition, markdown, source_hash: digest(markdown) };
  }));
  const expected = JSON.stringify(values, null, 2) + "\n";
  const current = await readFile(runtimePath, "utf8").catch(() => "");
  if (check && current !== expected) throw new Error("在线项目手册与正式文档不同步，请运行 node scripts/docs/project-manuals.mjs");
  if (!check && current !== expected) {
    await mkdir(path.dirname(runtimePath), { recursive: true });
    await writeFile(runtimePath, expected);
  }
  const pages = [...BUSINESS_USABILITY_CATALOG, ENGINEERING_MATERIAL_HELP];
  const catalog = getHelpReadingCatalog(ROLE_HELP_GUIDES, { allowedMenuPaths: pages.map(page => page.path) });
  const documents = [
    ...catalog.references.map(entry => ({ id: entry.id, book: "business", title: entry.title, source_hash: digest(JSON.stringify(entry)), path: entry.page?.path || "", roles: entry.page?.roleHelpKeys || [], supplement: !entry.item })),
    ...catalog.scenarios.map(entry => ({ id: `guide:${entry.key}`, book: "business", title: entry.title, source_hash: digest(JSON.stringify(entry)), path: pages.find(page => page.key === entry.pageKey)?.path || "", roles: entry.roleKeys, supplement: false })),
    ...values.flatMap(manual => getProjectManualDocuments(manual).map(entry => ({ id: entry.id, book: manual.key, title: entry.title, source_hash: digest(entry.markdown), supplement: true }))),
  ];
  const catalogPath = path.join(root, "server/internal/projectmanuals/documents.generated.json");
  const catalogExpected = JSON.stringify(documents, null, 2) + "\n";
  const catalogCurrent = await readFile(catalogPath, "utf8").catch(() => "");
  if (check && catalogCurrent !== catalogExpected) throw new Error("帮助章节与后端权限目录不同步，请重新生成项目手册");
  if (!check && catalogCurrent !== catalogExpected) await writeFile(catalogPath, catalogExpected);
  const requireWeb = createRequire(path.join(root, "web/package.json"));
  const { Remarkable } = requireWeb("remarkable");
  const renderer = new Remarkable({ html: false });
  const prototypePath = path.join(root, "docs/product/ui-design/index.html");
  const prototypeCurrent = await readFile(prototypePath, "utf8");
  const replaceSnapshot = (source, name, following, value) => {
    const prefix = `    const ${name} = `;
    const start = source.indexOf(prefix);
    const end = source.indexOf(`;\n    const ${following}`, start);
    if (start < 0 || end < 0 || source.indexOf(prefix, start + 1) >= 0) throw new Error(`帮助交互稿缺少唯一内容快照 ${name}`);
    return source.slice(0, start) + prefix + JSON.stringify(value, null, 2) + source.slice(end);
  };
  const prototypeBooks = values.map(manual => ({ key: manual.key, title: manual.title, summary: manual.summary, sourceHash: manual.source_hash, chapters: getProjectManualDocuments(manual).map(document => ({ id: document.id, title: document.title, html: renderer.render(document.markdown) })) }));
  const prototypeExpected = replaceSnapshot(replaceSnapshot(renderHelpDesignSnapshots(prototypeCurrent), "handbookIntroductions", "handbookPageAdditions", getBusinessHandbookIntroductions()), "projectManualBooks", "referenceDocs", prototypeBooks);
  if (check && prototypeCurrent !== prototypeExpected) throw new Error("帮助交互稿的手册快照与正式来源不同步，请重新生成项目手册");
  if (!check && prototypeCurrent !== prototypeExpected) await writeFile(prototypePath, prototypeExpected);
}

export async function exportProjectManuals() {
  const requireWeb = createRequire(path.join(root, "web/package.json"));
  const { chromium } = requireWeb("playwright");
  const output = path.join(root, "output/pdf/project-manuals");
  await mkdir(output, { recursive: true });
  const before = await sourceDigests();
  const browser = await chromium.launch({ headless: true });
  const files = [];
  try {
    const page = await browser.newPage();
    for (const title of manuals) {
      const source = await readFile(
        path.join(manualDirectory, `${title}.md`),
        "utf8",
      );
      const html =
        title === "业务使用手册"
          ? renderBusinessHandbookHtml({
              guides: ROLE_HELP_GUIDES,
              pages: [...BUSINESS_USABILITY_CATALOG, ENGINEERING_MATERIAL_HELP],
            })
          : renderProjectManualHtml({ title, markdown: source });
      await writeFile(path.join(output, `${title}.html`), html);
      await writeFile(path.join(output, `${title}.md`), source);
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({
        path: path.join(output, `${title}.pdf`),
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:9px;width:100%;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      for (const extension of ["md", "html", "pdf"]) {
        const file = `${title}.${extension}`;
        const bytes = await readFile(path.join(output, file));
        files.push({ file, bytes: bytes.length, sha256: digest(bytes) });
      }
    }
  } finally {
    await browser.close();
  }
  if (JSON.stringify(before) !== JSON.stringify(await sourceDigests()))
    throw new Error("导出期间手册来源发生变化，请重新生成并导出");
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
  const manifest = {
    source: "working-tree",
    head: git(["rev-parse", "HEAD"]),
    dirty: Boolean(
      git([
        "-c",
        "diff.autoRefreshIndex=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=normal",
      ]),
    ),
    generatedAt: new Date().toISOString(),
    sources: before,
    files,
  };
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(
    path.join(output, "index.html"),
    wrapHandbookHtml(
      "项目手册",
      `<h1>项目手册</h1><p>三册内容按同一工作区生成，来源身份与校验值见 manifest.json。当前包不表示已发布或已通过客户验收。</p><ul>${manuals.map((title) => `<li>${title}：<a href="${title}.html">离线阅读</a> · <a href="${title}.pdf">PDF</a> · <a href="${title}.md">Markdown</a></li>`).join("")}</ul>`,
    ),
  );
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "node scripts/docs/project-manuals.mjs [--check | --export]\n默认生成业务 Markdown 与后端受控手册内容；--check 只读检查同步；--export 生成三册离线 HTML / PDF / Markdown 和来源清单。",
    );
    return;
  }
  if (
    args.some((arg) => !["--check", "--export"].includes(arg)) ||
    (args.includes("--check") && args.includes("--export"))
  )
    throw new Error("只支持 --check 或 --export");
  await generateBusinessManual({ check: args.includes("--check") });
  await generateRuntimeProjectManuals({ check: args.includes("--check") });
  console.log(
    args.includes("--check")
      ? "业务手册同步检查通过"
      : "业务手册已从共享帮助内容生成",
  );
  if (args.includes("--export"))
    console.log(`三册手册导出完成：${await exportProjectManuals()}`);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
