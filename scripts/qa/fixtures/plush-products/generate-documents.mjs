#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
if (!args.length || args[0] === "--help") {
  process.stdout.write("Usage: node scripts/qa/fixtures/plush-products/generate-documents.mjs --out <new-pdf-path>\n");
} else {
  if (args.length !== 2 || args[0] !== "--out" || !args[1])
    throw new Error("Specify --out with a new PDF path");
  const output = path.resolve(args[1]);
  const require = createRequire(new URL("../../../../web/package.json", import.meta.url));
  const { chromium } = require("playwright");
  const image = await fs.readFile(new URL("./cloud_bear.jpg", import.meta.url));
  const browser = await chromium.launch({ headless: true });
  let pdf;
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>产品与包装要求</title><style>
      @page { size: A4; margin: 18mm; }
      body { margin: 0; font: 14px/1.8 "PingFang SC", "Noto Sans CJK SC", sans-serif; color: #222; }
      h1 { font-size: 26px; margin: 0 0 20px; }
      p { margin: 8px 0; }
      img { display: block; width: 105mm; height: 105mm; object-fit: contain; margin: 24px auto; }
      footer { display: flex; justify-content: space-between; margin-top: 28px; font-size: 11px; color: #555; }
      </style></head><body><h1>产品与包装要求</h1>
      <p>产品名称：云朵小熊</p><p>款式：米白短毛绒，胸前云朵贴布</p>
      <p>尺寸：坐高 25 厘米；单只装袋，每箱 12 只</p>
      <p>外观：面料干净，左右对称，眼鼻绣线平整</p>
      <p>包装：吊牌与洗水标齐全，装箱前核对数量</p>
      <p>交付：确认样品、用料与包装资料后安排生产</p>
      <img src="data:image/jpeg;base64,${image.toString("base64")}" alt="云朵小熊产品外观">
      <footer><span>资料日期：2026-11-07</span><span>第 1 页</span></footer></body></html>`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((item) => item.decode()));
    });
    pdf = await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, pdf, { flag: "wx" });
  process.stdout.write(`Wrote PDF: ${output}\n`);
}
