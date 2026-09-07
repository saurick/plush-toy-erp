import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);

export function verifyBusinessPDF(info, fonts, text) {
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  assert(
    pages >= 1 && pages <= 8,
    "business PDF page count is missing or exceeds the fixture budget",
  );
  assert.match(info, /^Page size:.*\(A4\)/m, "paper must remain A4");
  assert.match(
    info,
    /^JavaScript:\s+no$/m,
    "PDF must contain no executable JavaScript",
  );
  const faces = fonts
    .split("\n")
    .slice(2)
    .filter((line) => line.trim());
  assert(
    faces.length > 0 &&
      faces.every((line) => /\byes\s+yes\s+yes\s+\d+\s+\d+\s*$/.test(line)),
    "all fonts must be embedded, subset and Unicode mapped",
  );
  assert(
    faces.some((line) => /Noto(Sans|Serif)SC/.test(line)),
    "PDF must use bundled Noto fonts",
  );
  assert(
    (text.match(/[\u3400-\u9fff]/g) || []).length >= 20,
    "Chinese business text must remain extractable",
  );
  assert.doesNotMatch(
    text,
    /编辑工具|显示比例|正在保存|重试保存|点击填写/,
    "workspace tools and empty hints must not appear in PDF",
  );
  return {
    pages,
    embeddedFontFaces: faces.length,
    chineseCharacters: (text.match(/[\u3400-\u9fff]/g) || []).length,
  };
}

async function main(directory) {
  assert(directory, "usage: pdf-runtime-pdfs.mjs PDF_DIR");
  const files = (await readdir(directory))
    .filter((file) => /^print-snapshot-.+\.pdf$/.test(file))
    .sort();
  assert(files.length, "real business PDFs are required");
  const results = [];
  for (const file of files) {
    const pdf = path.join(directory, file);
    const [info, fonts, content] = await Promise.all([
      run("pdfinfo", [pdf], { timeout: 10000 }),
      run("pdffonts", [pdf], { timeout: 10000 }),
      run("pdftotext", ["-layout", pdf, "-"], { timeout: 10000 }),
    ]);
    const bytes = await readFile(pdf);
    results.push({
      file,
      bytes: bytes.length,
      ...verifyBusinessPDF(info.stdout, fonts.stdout, content.stdout),
    });
  }
  await writeFile(
    path.join(directory, "pdf-checks.json"),
    `${JSON.stringify({ status: "passed", results }, null, 2)}\n`,
  );
  console.log(
    `[pdf-runtime] ${results.length} real business PDFs: A4, embedded fonts and Chinese text verified`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main(process.argv[2]).catch((error) => {
    console.error(`[pdf-runtime] ${error.message}`);
    process.exitCode = 1;
  });
}
