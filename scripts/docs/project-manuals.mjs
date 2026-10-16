import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { renderBusinessHandbookMarkdown } from "../../web/src/erp/config/businessHandbook.mjs";
import { BUSINESS_USABILITY_CATALOG } from "../../web/src/erp/config/businessUsabilityCatalog.mjs";
import { ENGINEERING_MATERIAL_HELP } from "../../web/src/erp/config/engineeringMaterialHelp.mjs";
import { ROLE_HELP_GUIDES } from "../../web/src/erp/config/roleHelpContent.mjs";
import {
  renderBusinessHandbookHtml,
  wrapHandbookHtml,
} from "../../web/src/erp/utils/businessHandbookExport.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const manualDirectory = path.join(root, "docs/manuals");
const businessPath = path.join(manualDirectory, "业务使用手册.md");
const manuals = ["业务使用手册", "管理员与实施手册", "技术维护与运维手册"];
const sourcePaths = [
  "web/src/erp/config/businessHandbook.mjs",
  "web/src/erp/config/businessUsabilityCatalog.mjs",
  "web/src/erp/config/businessModules.mjs",
  "web/src/erp/config/engineeringMaterialHelp.mjs",
  "web/src/erp/config/roleHelpContent.mjs",
  "web/src/erp/utils/businessHandbookExport.mjs",
  "scripts/docs/project-manuals.mjs",
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
  await writeFile(businessPath, expected);
}

export async function exportProjectManuals() {
  const requireWeb = createRequire(path.join(root, "web/package.json"));
  const { Remarkable } = requireWeb("remarkable");
  const { chromium } = requireWeb("playwright");
  const output = path.join(root, "output/pdf/project-manuals");
  await mkdir(output, { recursive: true });
  const before = await sourceDigests();
  const markdown = new Remarkable({ html: true });
  const browser = await chromium.launch({ headless: true });
  const files = [];
  try {
    const page = await browser.newPage();
    for (const title of manuals) {
      const source = await readFile(
        path.join(manualDirectory, `${title}.md`),
        "utf8",
      );
      const body = markdown
        .render(source)
        .replace(
          /<a href="([^"#][^"]*)">([\s\S]*?)<\/a>/gu,
          (original, href, label) =>
            /^(?:https?:|mailto:)/u.test(href)
              ? original
              : `<span>${label}（源码专题：<code>${href}</code>）</span>`,
        );
      const html =
        title === "业务使用手册"
          ? renderBusinessHandbookHtml({
              guides: ROLE_HELP_GUIDES,
              pages: [...BUSINESS_USABILITY_CATALOG, ENGINEERING_MATERIAL_HELP],
            })
          : wrapHandbookHtml(title, body);
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
      "node scripts/docs/project-manuals.mjs [--check | --export]\n默认生成业务 Markdown；--check 只读检查同步；--export 生成三册离线 HTML / PDF / Markdown 和来源清单。",
    );
    return;
  }
  if (
    args.some((arg) => !["--check", "--export"].includes(arg)) ||
    (args.includes("--check") && args.includes("--export"))
  )
    throw new Error("只支持 --check 或 --export");
  await generateBusinessManual({ check: args.includes("--check") });
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
