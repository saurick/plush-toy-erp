import { createEngineeringPrintAssertions } from './engineeringPrintAssertions.mjs'
import { createMaterialDetailAssertions } from './materialDetailAssertions.mjs'
export function createMaterialDetailInteractionScenario({
  assertPrintWorkspacePaperTopRhythm,
  assertMaterialDetailLineCellsWrapLongValues,
  assertPrintEditableFocusBorderStyle,
  assertPrintEditableFocusSurvivesSwitch,
  assert,
  path,
  outputDir,
}) {
  return {
    name: 'engineering-material-detail-interactions',
    path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
    auth: 'admin',
    viewport: { width: 1600, height: 1100 },
    verify: async (page) => {
      const {
        assertEngineeringPaperScreenPrintBox,
        assertEngineeringEditorRounded,
        assertFullCellEditableCoverage,
        writeEngineeringPaperReviewScreenshot,
        assertEngineeringServerPdfSnapshotPageBox,
        assertEngineeringRichTextRedToggle,
        assertRichEditableNbspArtifactGuard,
        collectToolbarGroups,
        assertButtonTexts,
        assertNoLegacyEngineeringRowButtonText,
      } = await createEngineeringPrintAssertions({
        page,
        assert,
        path,
        outputDir,
      })
      const {
        assertMaterialDetailMetaGridFieldValueTextAlignment,
        assertMaterialDetailMetaValueEditableCoverage,
        assertMaterialDetailMetaSourceHeaderVisual,
        assertMaterialDetailTableVerticalCentering,
        assertMaterialDetailTableWidthAndUnitWrapPolicy,
        assertMaterialDetailFooterFieldsCompact,
        assertMaterialDetailSourceNoiseExcluded,
        assertMaterialDetailFooterTracksTableInPrint,
        assertMaterialDetailPageBreakBottomBorder,
      } = createMaterialDetailAssertions({
        page,
        assert,
        path,
        outputDir,
        writeEngineeringPaperReviewScreenshot,
      })

      await page.locator('.erp-material-detail-paper').waitFor({
        state: 'visible',
        timeout: 10_000,
      })

      await assertPrintWorkspacePaperTopRhythm(page, {
        paperSelector: '.erp-material-detail-paper',
        scenarioLabel: '物料分析明细表',
        screenshotName: 'print-workspace-material-detail-paper-top-rhythm',
      })

      await assertEngineeringPaperScreenPrintBox(
        '.erp-material-detail-paper',
        '物料分析明细表'
      )

      await assertEngineeringEditorRounded('物料分析明细表')

      await assertFullCellEditableCoverage(
        '物料分析明细表',
        '.erp-material-detail-table tbody tr:first-child td:nth-child(2)',
        '.erp-material-detail-table__editable'
      )

      await assertMaterialDetailMetaGridFieldValueTextAlignment()

      await assertMaterialDetailMetaValueEditableCoverage()

      await assertMaterialDetailMetaSourceHeaderVisual()

      await page
        .locator(
          '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
        )
        .nth(5)
        .locator('.erp-engineering-print-editable')
        .click()

      await writeEngineeringPaperReviewScreenshot(
        '.erp-material-detail-paper',
        'material-detail-meta-focus-latest.png'
      )

      await page
        .locator(
          '.erp-material-detail-paper .erp-engineering-print-meta-grid > .erp-engineering-print-meta-grid__hair-cell'
        )
        .locator('.erp-engineering-print-editable')
        .click()

      await writeEngineeringPaperReviewScreenshot(
        '.erp-material-detail-paper',
        'material-detail-hair-direction-focus-latest.png'
      )

      await assertMaterialDetailTableVerticalCentering()

      await assertMaterialDetailTableWidthAndUnitWrapPolicy()

      await assertMaterialDetailLineCellsWrapLongValues(page)

      await assertPrintEditableFocusBorderStyle(page, {
        selector:
          '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
        scenarioLabel: '物料分析明细表',
      })

      await assertPrintEditableFocusSurvivesSwitch(page, {
        firstSelector:
          '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
        secondSelector:
          '.erp-material-detail-table tbody tr:first-child td:nth-child(3) .erp-material-detail-table__editable',
        scenarioLabel: '物料分析明细表',
      })

      await assertMaterialDetailFooterFieldsCompact()

      await assertPrintEditableFocusBorderStyle(page, {
        selector: '.erp-material-detail-paper__footer-value',
        scenarioLabel: '物料分析明细表审核/制表',
      })

      await writeEngineeringPaperReviewScreenshot(
        '.erp-material-detail-paper',
        'material-detail-footer-focus-latest.png'
      )

      await assertMaterialDetailSourceNoiseExcluded()

      await writeEngineeringPaperReviewScreenshot(
        '.erp-material-detail-paper',
        'material-detail-runtime-latest.png'
      )

      await assertEngineeringServerPdfSnapshotPageBox({
        paperSelector: '.erp-material-detail-paper',
        contentSelector: '.erp-material-detail-table',
        scenarioLabel: '物料分析明细表',
        screenshotName: 'material-detail-server-pdf-page-box',
      })

      await assertMaterialDetailFooterTracksTableInPrint()

      await assertEngineeringRichTextRedToggle(
        '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
        '.erp-material-detail-paper__title',
        '物料分析明细表'
      )

      await assertRichEditableNbspArtifactGuard(
        '.erp-material-detail-paper',
        '物料分析明细表'
      )

      const materialImageState = await page.evaluate(() => {
        const headerUploadBar = document.querySelector(
          '.erp-processing-contract-upload-bar'
        )
        const appendixManager = document.querySelector(
          '[data-print-appendix-manager]'
        )
        return {
          headerUploadBarInPanel: Boolean(
            headerUploadBar?.closest('.erp-print-shell__record-panel')
          ),
          headerUploadBarInStage: Boolean(
            headerUploadBar?.closest('.erp-print-shell__stage')
          ),
          headerUploadItemCount:
            headerUploadBar?.querySelectorAll(
              '.erp-processing-contract-upload-bar__item'
            ).length || 0,
          topSlotCount: document.querySelectorAll(
            '.erp-material-detail-paper__images .erp-engineering-print-image-slot'
          ).length,
          appendixManagerInPanel: Boolean(
            appendixManager?.closest('.erp-print-shell__record-panel')
          ),
          appendixManagerInStage: Boolean(
            appendixManager?.closest('.erp-print-shell__stage')
          ),
          appendixSectionCount: document.querySelectorAll(
            '.erp-material-detail-paper [data-print-appendix-images]'
          ).length,
          legacyBottomSectionCount: document.querySelectorAll(
            '.erp-material-detail-paper__bottom-images'
          ).length,
          paperImageActionCount: document.querySelectorAll(
            '.erp-material-detail-paper .erp-engineering-print-image-slot__actions'
          ).length,
        }
      })

      assert.deepEqual(
        materialImageState,
        {
          headerUploadBarInPanel: true,
          headerUploadBarInStage: false,
          headerUploadItemCount: 2,
          topSlotCount: 2,
          appendixManagerInPanel: true,
          appendixManagerInStage: false,
          appendixSectionCount: 0,
          legacyBottomSectionCount: 0,
          paperImageActionCount: 0,
        },
        `物料明细应保留两个表头图片区，并用独立共享管理区接管末尾附图: ${JSON.stringify(materialImageState)}`
      )

      let toolbarGroups = await collectToolbarGroups()

      assertButtonTexts(
        toolbarGroups[0],
        [
          '上插一行',
          '下插一行',
          '移除当前行',
          '选择明细行',
          '选择单元格',
          '合并选区',
          '拆分当前',
        ],
        '物料分析明细表'
      )

      assert.equal(
        toolbarGroups[0].buttons[0].disabled,
        true,
        '物料明细未选择明细行前，上插一行应禁用'
      )

      await assertNoLegacyEngineeringRowButtonText('物料分析明细表')

      await page.getByRole('button', { name: '选择明细行' }).click()

      await page
        .locator('.erp-material-detail-table tbody tr')
        .nth(1)
        .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

      toolbarGroups = await collectToolbarGroups()

      assert.equal(
        toolbarGroups[0].buttons[0].disabled,
        false,
        '物料明细进入选择明细行模式并选中行后，上插一行应可用'
      )

      const materialRowsBefore = await page
        .locator('.erp-material-detail-table tbody tr')
        .count()

      await page
        .locator('.erp-print-shell__toolbar-group')
        .first()
        .getByRole('button', { name: '下插一行' })
        .click()

      assert.equal(
        await page.locator('.erp-material-detail-table tbody tr').count(),
        materialRowsBefore + 1,
        '物料明细下插一行应新增一行'
      )

      await page.getByRole('button', { name: '移除当前行' }).click()

      assert.equal(
        await page.locator('.erp-material-detail-table tbody tr').count(),
        materialRowsBefore,
        '物料明细移除当前行后行数应恢复'
      )

      await page.getByRole('button', { name: '取消选择' }).click()

      await assertMaterialDetailPageBreakBottomBorder()
    },
  }
}
