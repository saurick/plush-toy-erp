import { createHash } from 'node:crypto'

const ZIP_LOCAL_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_EOCD_SIGNATURE = 0x06054b50

const XLSX_ENTRIES = [
  [
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
  ],
  [
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  ],
  [
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="材料分析明细表" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  ],
  [
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
  ],
  [
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="19" uniqueCount="19">
  <si><t>产品编号</t></si><si><t>SYN-P-001</t></si>
  <si><t>产品名称</t></si><si><t>Synthetic Plush</t></si>
  <si><t>订单编号</t></si><si><t>SYN-O-001</t></si>
  <si><t>物料编号</t></si><si><t>物料名称</t></si><si><t>规格</t></si>
  <si><t>单位</t></si><si><t>组装部位</t></si><si><t>单位用量</t></si><si><t>加工方式</t></si>
  <si><t>SYN-MAT-001</t></si><si><t>Synthetic Fabric</t></si><si><t>个</t></si>
  <si><t>左侧片</t></si><si><t>1.25</t></si><si><t>激光</t></si>
</sst>`,
  ],
  [
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>
    <row r="6"><c r="A6" t="s"><v>6</v></c><c r="B6" t="s"><v>7</v></c><c r="C6" t="s"><v>8</v></c><c r="D6" t="s"><v>9</v></c><c r="E6" t="s"><v>10</v></c><c r="F6" t="s"><v>11</v></c><c r="G6" t="s"><v>12</v></c></row>
    <row r="7"><c r="A7" t="s"><v>13</v></c><c r="B7" t="s"><v>14</v></c><c r="C7"/><c r="D7" t="s"><v>15</v></c><c r="E7" t="s"><v>16</v></c><c r="F7" t="s"><v>17</v></c><c r="G7" t="s"><v>18</v></c></row>
  </sheetData>
</worksheet>`,
  ],
]

const PURCHASE_XLSX_ENTRIES = [
  [
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
  ],
  [
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  ],
  [
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  ],
  [
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
  ],
  [
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="14" uniqueCount="14">
  <si><t>产品订单编号</t></si><si><t>产品编号</t></si><si><t>产品名称</t></si><si><t>材料品名</t></si>
  <si><t>单位</t></si><si><t>采购数量</t></si><si><t>采购金额</t></si><si><t>厂商简称</t></si>
  <si><t>SYN-O-002</t></si><si><t>SYN-P-002</t></si><si><t>Synthetic Product</t></si>
  <si><t>Synthetic Thread</t></si><si><t>个</t></si><si><t>Synthetic Supplier</t></si>
</sst>`,
  ],
  [
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c><c r="H1" t="s"><v>7</v></c></row>
    <row r="2"><c r="A2" t="s"><v>8</v></c><c r="B2" t="s"><v>9</v></c><c r="C2" t="s"><v>10</v></c><c r="D2" t="s"><v>11</v></c><c r="E2" t="s"><v>12</v></c><c r="F2"><v>2</v></c><c r="G2"><v>20</v></c><c r="H2" t="s"><v>13</v></c></row>
  </sheetData>
</worksheet>`,
  ],
]

export function createSyntheticSourceFixture(options = {}) {
  const customerKey = options.customerKey ?? 'synthetic-customer'
  const relativePath = options.relativePath ?? 'minimal-material-detail.xlsx'
  const xlsx = createStoredZip(XLSX_ENTRIES)
  return {
    relativePath,
    xlsx,
    manifest: {
      version: 2,
      customerKey,
      description: 'Synthetic customer source fixture for Product Core tests.',
      boundaries: {
        noRealImport: true,
        canExecuteRealImport: false,
        createsTenant: false,
        changesSchema: false,
        writesBusinessRecords: false,
        writesFacts: false,
      },
      sources: [
        {
          sourceId: `${customerKey}-minimal-material-detail`,
          relativePath,
          sha256: createHash('sha256').update(xlsx).digest('hex'),
          sizeBytes: xlsx.length,
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sourceKind: 'xlsx_workbook',
          sourceTypes: ['Synthetic Test Fixture'],
          domains: ['materials', 'bom', 'products', 'units'],
          classification: 'synthetic-test-data',
          usage: 'Product Core contract and parser tests only.',
          sensitiveReviewRequired: false,
          structuredExtract: {
            enabled: true,
            mode: 'xlsx_workbook',
            parser: 'scripts/import/customerSourceExtract.mjs',
          },
          storage: {
            provider: 'minio',
            bucketAlias: 'synthetic-private',
            objectKey: `sources/${customerKey}-minimal-material-detail/v0001/original.xlsx`,
          },
        },
      ],
    },
  }
}

export function createSyntheticPurchaseSourceFixture(options = {}) {
  const customerKey = options.customerKey ?? 'synthetic-customer'
  const relativePath = options.relativePath ?? 'synthetic-辅材-purchase.xlsx'
  const sourceId = `${customerKey}-minimal-purchase-summary`
  const xlsx = createStoredZip(PURCHASE_XLSX_ENTRIES)
  return {
    relativePath,
    xlsx,
    manifest: {
      version: 2,
      customerKey,
      boundaries: {
        canExecuteRealImport: false,
      },
      sources: [
        {
          sourceId,
          relativePath,
          sha256: createHash('sha256').update(xlsx).digest('hex'),
          sizeBytes: xlsx.length,
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sourceKind: 'xlsx_workbook',
          classification: 'synthetic-test-data',
          structuredExtract: {
            enabled: true,
            mode: 'xlsx_workbook',
          },
          storage: {
            provider: 'minio',
            bucketAlias: 'synthetic-private',
            objectKey: `sources/${sourceId}/v0001/original.xlsx`,
          },
        },
      ],
    },
  }
}

function createStoredZip(entries) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const data = Buffer.from(text, 'utf8')
    const checksum = crc32(data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBuffer)

    localOffset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
