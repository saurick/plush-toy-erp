import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const currentFile = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(currentFile), "..");
const repoRoot = path.resolve(webRoot, "..");
const tempDir = path.join(repoRoot, "tmp", "pdfs");
const outputDir = path.join(repoRoot, "output", "pdf");
const htmlPath = path.join(tempDir, "plush_factory_formal_report_v4_mobile.html");
const pdfPath = path.join(outputDir, "plush_factory_formal_report_v4_mobile.pdf");

const html = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>毛绒玩具工厂流程图 · 甲方确认修订版 V4</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      :root {
        --ink: #17233b;
        --muted: #66758b;
        --line: #cfd8e6;
        --brand: #155eef;
        --brand-soft: #e9f0ff;
        --business: #dceeff;
        --boss: #ffe6d7;
        --pmc: #fff0b5;
        --purchase: #eee4ff;
        --warehouse: #d9f4f7;
        --quality: #ffe1e2;
        --production: #ffeccf;
        --good: #0e8a64;
        --warn: #b45309;
        --bad: #b42318;
      }
      html, body { margin: 0; padding: 0; background: #edf1f7; color: var(--ink); }
      body {
        font-family: "Noto Sans SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        position: relative;
        width: 210mm;
        height: 297mm;
        padding: 13mm 13mm 12mm;
        background: #fff;
        page-break-after: always;
        overflow: hidden;
      }
      .page:last-child { page-break-after: auto; }
      .eyebrow { color: var(--brand); font-size: 8.5pt; font-weight: 800; letter-spacing: .12em; }
      h1 { margin: 2.5mm 0 1.5mm; font-size: 21pt; line-height: 1.2; letter-spacing: -.02em; }
      h2 { margin: 0; font-size: 17pt; line-height: 1.25; }
      h3 { margin: 0 0 2mm; font-size: 10.5pt; }
      p { margin: 0; }
      .subtitle { color: var(--muted); font-size: 9.2pt; line-height: 1.55; }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 6mm;
        margin-top: 3mm;
        padding: 2.3mm 3mm;
        border: 1px solid #dfe6f1;
        border-radius: 3mm;
        background: #f8faff;
        font-size: 7.6pt;
        color: #526177;
      }
      .legend { display: flex; flex-wrap: wrap; gap: 2.4mm 4mm; margin: 3.5mm 0 3mm; }
      .legend span { display: inline-flex; align-items: center; gap: 1.5mm; font-size: 7.2pt; color: #59687e; }
      .legend i { width: 4mm; height: 2.5mm; border-radius: 1mm; border: 1px solid #9eb0c9; }
      .flow { display: flex; flex-direction: column; align-items: center; }
      .node {
        width: 91%;
        padding: 2mm 3mm;
        border: 1.1px solid #6f819b;
        border-radius: 3mm;
        text-align: center;
        font-size: 8.1pt;
        line-height: 1.38;
        background: #fff;
      }
      .node strong { font-size: 8.6pt; }
      .business { background: var(--business); }
      .boss { background: var(--boss); }
      .pmc { background: var(--pmc); }
      .purchase { background: var(--purchase); }
      .warehouse { background: var(--warehouse); }
      .quality { background: var(--quality); }
      .production { background: var(--production); }
      .arrow { height: 3.1mm; width: 1px; background: #8494aa; position: relative; }
      .arrow::after {
        content: "";
        position: absolute;
        left: -1.5mm;
        bottom: -.2mm;
        border-left: 1.5mm solid transparent;
        border-right: 1.5mm solid transparent;
        border-top: 1.7mm solid #8494aa;
      }
      .split {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 12mm 1fr;
        align-items: stretch;
        margin: .5mm 0;
      }
      .split .branch {
        border: 1px solid #b8c5d7;
        border-radius: 3mm;
        padding: 2mm 2.3mm;
        background: #fbfcff;
      }
      .split .branch.external { background: #fff7ed; border-color: #efc28e; }
      .split .branch.internal { background: #eefaf6; border-color: #93cfb9; }
      .split .bridge { display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #728198; text-align: center; }
      .branch-title { font-size: 8.2pt; font-weight: 800; margin-bottom: 1mm; }
      .branch-line { font-size: 7.2pt; line-height: 1.35; color: #4d5b70; }
      .decision {
        width: 95%;
        padding: 2mm 3mm;
        border: 1.2px solid #d5912a;
        border-radius: 2mm;
        background: #fff9e9;
        text-align: center;
        font-size: 7.8pt;
        line-height: 1.35;
      }
      .gate-row {
        width: 98%;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 2mm;
      }
      .gate {
        min-height: 12mm;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5mm;
        border: 1px solid #e4a2a6;
        border-radius: 2.5mm;
        background: var(--quality);
        font-size: 7.3pt;
        line-height: 1.3;
        text-align: center;
        font-weight: 700;
      }
      .gate.conditional { border-style: dashed; background: #fff6f6; }
      .dual {
        width: 98%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2mm;
      }
      .dual .node { width: 100%; font-size: 7.3pt; }
      .callout {
        margin-top: 3mm;
        padding: 2.5mm 3mm;
        border-radius: 2.5mm;
        background: #eef4ff;
        border-left: 1.2mm solid var(--brand);
        font-size: 7.5pt;
        line-height: 1.45;
        color: #34445b;
      }
      .page-no { position: absolute; bottom: 5.5mm; right: 13mm; font-size: 7pt; color: #8b98ab; }
      .section-head { display: flex; justify-content: space-between; align-items: end; gap: 4mm; margin-bottom: 5mm; }
      .section-head .subtitle { max-width: 85mm; text-align: right; }
      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
      .card {
        padding: 3mm;
        border: 1px solid #dbe3ef;
        border-radius: 3mm;
        background: #fbfcff;
        break-inside: avoid;
      }
      .card.full { grid-column: 1 / -1; }
      .card h3 { display: flex; align-items: center; gap: 2mm; }
      .number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 5.5mm;
        height: 5.5mm;
        border-radius: 50%;
        background: var(--brand-soft);
        color: var(--brand);
        font-size: 7.2pt;
      }
      .card p, .card li { font-size: 7.7pt; line-height: 1.55; color: #46566d; }
      ul { margin: 1mm 0 0; padding-left: 5mm; }
      li + li { margin-top: .7mm; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #d8e0eb; padding: 2mm 2.2mm; vertical-align: top; }
      th { background: #edf3ff; font-size: 7.3pt; text-align: left; color: #33445d; }
      td { font-size: 7.1pt; line-height: 1.45; color: #46566d; }
      .quality-table th:nth-child(1) { width: 18%; }
      .quality-table th:nth-child(2) { width: 30%; }
      .quality-table th:nth-child(3) { width: 24%; }
      .quality-table th:nth-child(4) { width: 28%; }
      .status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 5mm 0; }
      .status-card { border-radius: 3mm; padding: 3mm; border: 1px solid #d9e2ee; min-height: 25mm; }
      .status-card.good { background: #ecfdf6; border-color: #9fd9c4; }
      .status-card.warn { background: #fff8eb; border-color: #efc98b; }
      .status-card.neutral { background: #f5f7fb; }
      .status-card b { display: block; margin-bottom: 1.5mm; font-size: 8.5pt; }
      .status-card span { display: block; color: #536278; font-size: 7.4pt; line-height: 1.45; }
      .mapping th:nth-child(1) { width: 19%; }
      .mapping th:nth-child(2) { width: 37%; }
      .mapping th:nth-child(3) { width: 44%; }
      .evidence {
        margin-top: 4mm;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3mm;
      }
      .code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 6.6pt;
        line-height: 1.5;
        word-break: break-all;
      }
      .boundary {
        margin-top: 4mm;
        padding: 3mm;
        border: 1px solid #f0c7c7;
        border-radius: 3mm;
        background: #fff7f7;
      }
      .boundary h3 { color: var(--bad); }
      .boundary p { font-size: 7.7pt; line-height: 1.55; color: #5a4650; }
    </style>
  </head>
  <body>
    <section class="page">
      <div class="eyebrow">YONGSHEN · CONFIRMED BUSINESS FLOW</div>
      <h1>毛绒玩具工厂流程图</h1>
      <p class="subtitle">甲方确认修订版 V4 · 固化“先车缝、后手工”，车缝与手工分别决定本厂或外发</p>
      <div class="meta">
        <span>流程口径：高层主链已由甲方确认</span>
        <span>修订日期：2026-07-17</span>
        <span>用途：业务评审 / 系统治理 / 验收对照</span>
      </div>
      <div class="legend">
        <span><i style="background:var(--business)"></i>业务</span>
        <span><i style="background:var(--boss)"></i>老板</span>
        <span><i style="background:var(--pmc)"></i>工程 / PMC</span>
        <span><i style="background:var(--purchase)"></i>采购</span>
        <span><i style="background:var(--warehouse)"></i>仓库</span>
        <span><i style="background:var(--quality)"></i>品质</span>
        <span><i style="background:var(--production)"></i>生产经理 / 生产</span>
      </div>

      <div class="flow">
        <div class="node business"><strong>业务接单</strong><br />客户订单 + 包装材料订单表 / 版面要求</div>
        <div class="arrow"></div>
        <div class="node boss"><strong>老板审核</strong><br />审核订单、包装要求与启动条件</div>
        <div class="arrow"></div>
        <div class="node pmc"><strong>工程 + PMC</strong><br />冻结生产路线与主辅料需求；PMC 全程齐套、交期和异常跟进</div>
        <div class="arrow"></div>
        <div class="node purchase"><strong>采购 + 仓库 + 品质</strong><br />采购主辅料 → 到仓 → 来料 IQC；未通过不得进入生产主线</div>
        <div class="arrow"></div>
        <div class="node warehouse"><strong>布料加工（固定整单外发）</strong><br />BOM 明确标记布料加工材料 → 同一有效加工合同逐材料分配 → 已过账委外发料 → 外发回仓 → 裁片检验（CUT_PIECE）</div>
        <div class="arrow"></div>

        <div class="decision"><strong>生产经理决策 ①：车缝</strong>　同一批允许拆量；各子批分别选择本厂或外发</div>
        <div class="split">
          <div class="branch internal">
            <div class="branch-title">本厂车缝</div>
            <div class="branch-line">内部车间执行 → 皮套 WIP → <strong>车间移交 / WIP 转移</strong></div>
          </div>
          <div class="bridge">数量<br />守恒</div>
          <div class="branch external">
            <div class="branch-title">外发车缝</div>
            <div class="branch-line">绑定加工合同行与子批 → 回货 → <strong>外发回仓</strong></div>
          </div>
        </div>
        <div class="arrow"></div>
        <div class="node quality"><strong>皮套检验（SHELL）</strong><br />未通过：退回明确目标工序返工；通过后才允许进入手工</div>
        <div class="arrow"></div>

        <div class="decision"><strong>生产经理决策 ②：手工</strong>　重新独立决策，不继承车缝的本厂 / 外发方式</div>
        <div class="split">
          <div class="branch internal">
            <div class="branch-title">本厂手工</div>
            <div class="branch-line">内部手工执行 → 成品 WIP → <strong>车间移交 / WIP 转移</strong></div>
          </div>
          <div class="bridge">独立<br />分流</div>
          <div class="branch external">
            <div class="branch-title">外发手工</div>
            <div class="branch-line">绑定加工合同行与子批 → 回货 → <strong>外发回仓</strong></div>
          </div>
        </div>
        <div class="arrow"></div>
        <div class="gate-row">
          <div class="gate">成品检验<br />FINISHED_GOODS</div>
          <div class="gate">针检<br />NEEDLE</div>
          <div class="gate">抽检<br />SAMPLING</div>
          <div class="gate conditional">部分订单：客户验货<br />CUSTOMER_ACCEPTANCE</div>
        </div>
        <div class="arrow"></div>
        <div class="dual">
          <div class="node business"><strong>业务：包材版面 / 版本确认</strong><br />确认客户要求、文字、颜色和包装版本</div>
          <div class="node quality"><strong>品质：包材正式检验</strong><br />按材料与批次执行 IQC；不由业务确认替代</div>
        </div>
        <div class="arrow"></div>
        <div class="node production"><strong>最终包装 → 成品入仓</strong><br />包装完成不等于已入仓；库存只由正式成品入库事实增加</div>
      </div>
      <div class="callout"><strong>关键结论：</strong>裁片、皮套是 WIP，不是原材料或可销售成品；内部流转只叫“车间移交 / WIP 转移”，只有外部加工返回才叫“外发回仓”。</div>
      <div class="page-no">01 / 03</div>
    </section>

    <section class="page">
      <div class="section-head">
        <div>
          <div class="eyebrow">BUSINESS RULES & RESPONSIBILITIES</div>
          <h2>流程口径与责任边界</h2>
        </div>
        <p class="subtitle">把甲方认可的主流程变成可执行、可审计、不会混淆事实层的系统规则</p>
      </div>

      <div class="cards">
        <div class="card">
          <h3><span class="number">1</span>固定顺序，逐步决策</h3>
          <ul>
            <li>车缝完成且皮套检验通过后，才能进入手工。</li>
            <li>车缝、手工分别选择本厂或外发，不自动继承。</li>
            <li>布料加工整单外发、不拆批；裁片检验通过后，车缝与手工可按数量拆成多个子批。</li>
          </ul>
        </div>
        <div class="card">
          <h3><span class="number">2</span>WIP 与回仓用词</h3>
          <ul>
            <li>本厂：车间移交 / WIP 转移。</li>
            <li>外发：发出后返回才叫外发回仓。</li>
            <li>裁片、皮套保留父子批、数量、步骤与来源追溯。</li>
          </ul>
        </div>
        <div class="card">
          <h3><span class="number">3</span>拆量、返工与守恒</h3>
          <ul>
            <li>车缝、手工的有效子批数量合计必须与父批数量守恒。</li>
            <li>不合格返工必须保存原批次、目标步骤、数量和原因；活动 WIP 未终结时不能关闭生产订单。</li>
            <li>返工形成新执行记录；外发返工绑定新的成品加工合同行，不复用原材料合同行。</li>
          </ul>
        </div>
        <div class="card">
          <h3><span class="number">4</span>包装材料双责任</h3>
          <ul>
            <li>业务确认客户版面、外观和包装版本。</li>
            <li>品质按材料批次登记正式检验结论。</li>
            <li>两类记录互不替代，也不直接写成品库存。</li>
          </ul>
        </div>
      </div>

      <div class="card full" style="margin-top:4mm">
        <h3><span class="number">5</span>独立质量关口</h3>
        <table class="quality-table">
          <thead>
            <tr><th>关口</th><th>绑定对象</th><th>通过后允许</th><th>未通过处理</th></tr>
          </thead>
          <tbody>
            <tr><td>主辅料 IQC</td><td>采购到货材料、仓库、批次</td><td>采购入库 / 生产准备</td><td>阻止对应材料进入生产</td></tr>
            <tr><td>裁片检验</td><td>布料加工整批 / CUT_PIECE WIP</td><td>车缝拆量与分流</td><td>外发处置或指定返工</td></tr>
            <tr><td>皮套检验</td><td>车缝子批 / SHELL WIP</td><td>手工拆量与分流</td><td>退回车缝或指定早期步骤</td></tr>
            <tr><td>成品检验</td><td>手工子批 / FINISHED_GOODS WIP</td><td>针检</td><td>复检、返工或报废处置</td></tr>
            <tr><td>针检</td><td>成品检验已通过的精确子批</td><td>抽检</td><td>阻止抽检和包装</td></tr>
            <tr><td>抽检</td><td>针检已通过的精确子批</td><td>条件性客户验货 / 包装</td><td>复检或指定返工</td></tr>
            <tr><td>客户验货</td><td>订单明确要求的成品子批</td><td>包装</td><td>不要求则不适用；要求时未通过保持阻断</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card full" style="margin-top:4mm">
        <h3><span class="number">6</span>角色与事实边界</h3>
        <table>
          <thead><tr><th>岗位</th><th>正式责任</th><th>不能越界写成</th></tr></thead>
          <tbody>
            <tr><td>生产经理</td><td>车缝 / 手工拆量、逐工序本厂 / 外发选择、退返工目标</td><td>不能拆分首道布料加工，也不能绕过数量、状态与权限校验</td></tr>
            <tr><td>生产岗位</td><td>本厂工序执行、车间移交 / WIP 转移</td><td>内部移交不能冒充仓库入库或外发回仓</td></tr>
            <tr><td>品质</td><td>按关口登记质量事实与判定</td><td>质检任务 done 不等于质量结论通过</td></tr>
            <tr><td>业务</td><td>包材版面 / 版本确认、客户验货条件来源</td><td>业务确认不能替代包材 IQC 或客户系统验收</td></tr>
            <tr><td>仓库</td><td>真实收货、外发回仓、领用和成品入仓</td><td>包装完成不等于库存已经增加</td></tr>
            <tr><td>PMC</td><td>齐套、交期、进度和异常协同</td><td>排程任务完成不能替代生产 / 质检 / 库存事实</td></tr>
          </tbody>
        </table>
      </div>

      <div class="callout"><strong>客户验货 ≠ 客户系统验收：</strong>前者是部分订单的生产质量关口；后者是系统交付与 UAT 证据，两者必须分别记录。</div>
      <div class="page-no">02 / 03</div>
    </section>

    <section class="page">
      <div class="section-head">
        <div>
          <div class="eyebrow">SYSTEM MAPPING & DELIVERY TRUTH</div>
          <h2>系统实现映射与交付边界</h2>
        </div>
        <p class="subtitle">本页只说明当前本地源代码和生成物，不把本地绿色写成已发布或客户已验收</p>
      </div>

      <div class="status-grid">
        <div class="status-card good">
          <b>本地源代码</b>
          <span>路线快照、WIP 批次 / 事件、包装确认、分段质检、RBAC、JSON-RPC 与正式页面已治理进同一工作树。</span>
        </div>
        <div class="status-card warn">
          <b>数据库迁移</b>
          <span>Atlas migration 已生成并纳入本地变更；本报告未对共享或目标数据库执行 migrate apply。</span>
        </div>
        <div class="status-card neutral">
          <b>发布与验收</b>
          <span>目标环境部署、health / smoke、真实岗位账号回归和甲方系统 UAT 尚需独立证据。</span>
        </div>
      </div>

      <table class="mapping">
        <thead><tr><th>业务口径</th><th>系统真源</th><th>治理结果</th></tr></thead>
        <tbody>
          <tr><td>固定路线</td><td><span class="code">PLUSH_SEW_HAND_V1 / route_version=1</span></td><td>布料加工 → 车缝 → 手工 → 包装；订单行冻结路线与“是否客户验货”。首道布料加工整单外发，车缝与手工才允许拆量。</td></tr>
          <tr><td>布料材料归属</td><td><span class="code">bom_items / production_order_material_requirements.production_operation_code</span></td><td>只认 BOM 中明确标记为 FABRIC_PROCESSING 的冻结材料需求，不从部位或备注猜测；每项必须精确绑定同一已确认合同的 MATERIAL 行。</td></tr>
          <tr><td>工序快照</td><td><span class="code">processes.production_route_operation_code → production_order_operations</span></td><td>四个标准位置由工序主档显式唯一绑定，发布时冻结步骤号、工序主档快照、产出类型、内外发允许范围和质量关口；不按名称、类别、普通编码或列表排序猜路线。</td></tr>
          <tr><td>在制品执行</td><td><span class="code">production_wip_batches / production_wip_events</span></td><td>保存父子批、数量、步骤、执行方式、版本与事件；拆量、取消、转序、外发回仓和返工均保留审计，取消不重新拆分数量。</td></tr>
          <tr><td>逐步内外发</td><td><span class="code">execution_mode + production_wip_outsourcing_allocations</span></td><td>正常布料加工逐条绑定 MATERIAL 行且须有足量已过账委外发料；车缝、手工及布料返工绑定 PRODUCT 行，本厂不伪造外发回仓。</td></tr>
          <tr><td>质量关口</td><td><span class="code">quality_inspections.production_wip_batch_id + gate_code</span></td><td>裁片、皮套、成品、针检、抽检、条件客户验货逐关口推进；当前 WIP 关口只接受 PASS，未通过不能转序。</td></tr>
          <tr><td>包材确认</td><td><span class="code">production_packaging_confirmations</span></td><td>业务版面 / 版本确认独立保存；来料品质仍复用材料批次 IQC，不相互替代。</td></tr>
          <tr><td>并发与重试</td><td><span class="code">expected_version + idempotency_key + intent_hash</span></td><td>服务端校验版本、数量与意图；相同请求可重放，不同意图复用幂等键会被拒绝。</td></tr>
          <tr><td>权限</td><td><span class="code">production.wip.read / assign / execute / rework</span></td><td>生产经理、生产、品质、业务按职责投影；前端按钮显隐不替代后端 RBAC。</td></tr>
        </tbody>
      </table>

      <div class="evidence">
        <div class="card">
          <h3>正式入口</h3>
          <p class="code">production_wip.get_production_wip<br />production_wip.execute_production_wip_action<br />quality.list_production_stage_quality_inspections</p>
        </div>
        <div class="card">
          <h3>页面办理</h3>
          <p>生产订单发布时冻结固定路线；页面打开“工艺执行”，办理拆批、分流、取消未开工批次、开始、完成、外发回仓、转序、返工与包材确认；质量检验页按生产关口查询并判定。</p>
        </div>
        <div class="card">
          <h3>本地验证范围</h3>
          <p>业务规则、repo / usecase、JSON-RPC、RBAC、客户配置契约、前端模型 / 组件、页面场景与 Atlas schema guard 按影响面执行；最终结果以同次交付说明为准。</p>
        </div>
        <div class="card">
          <h3>未扩大的范围</h3>
          <p>不扩成完整 MES、自动 MRP、产能优化、工资工时、成本归集、质量让步审批策略、客户专属 schema 或多租户；库存仍只由正式入出库事实改变。</p>
        </div>
      </div>

      <div class="boundary">
        <h3>诚实交付口径</h3>
        <p>甲方确认的是高层业务流程；本次治理完成的是本地源代码、迁移生成物、配置与文档的一致性闭环。只有在指定版本发布到目标环境、迁移实际应用、服务健康检查与业务 smoke 通过，并由甲方完成系统 UAT / 签收后，才能写成“已发布 / 已交付”。</p>
      </div>

      <div class="callout"><strong>评审结论：</strong>主流程本身无需推翻；本次修订重点是把术语、顺序、质量关口、内外发分流、返工和系统交付边界落成同一套可验证口径。</div>
      <div class="page-no">03 / 03</div>
    </section>
  </body>
</html>`;

await mkdir(tempDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
await writeFile(htmlPath, html, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
} finally {
  await browser.close();
}

console.log(`html=${htmlPath}`);
console.log(`pdf=${pdfPath}`);
