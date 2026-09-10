import { assertBusinessFormPage, closeBusinessFormPage, isBusinessFormPageTitle } from './businessFormPageAssertions.mjs'
import { assertAntdModalCentered } from './modalAssertions.mjs'
import { expectText } from './pageAssertions.mjs'
import {
  assertVisibleRoundedInputWrapperClipping,
  assertVisibleInputFocusRingNotClipped,
  assertVisibleInputTextVerticalRhythm,
} from './inputControlAssertions.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'

export function createBusinessActionAssertions({ outputDir }) {
  async function verifyBusinessActionFormModal(
    page,
    {
      buttonName,
      titleText,
      minFieldCount = 4,
      screenshotName,
      expectedTexts = [],
      absentTexts = [],
      requireMultiColumn = true,
      expectContactItemsLayout = false,
      beforeMeasure,
      afterOpen,
    }
  ) {
    await page.getByRole('button', { name: buttonName }).click()
    const modal = page
      .locator('.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible')
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, titleText)
    const isPage = isBusinessFormPageTitle(titleText)
    if (isPage) await assertBusinessFormPage(page, modal)
    else await assertAntdModalCentered(page, modal, `${screenshotName}-centered`)
    if (typeof beforeMeasure === 'function') {
      await beforeMeasure(modal)
    }

    const metrics = await modal.evaluate((node) => {
      const body = node.querySelector('.erp-business-form-page__body, .ant-modal-body')
      const form = node.querySelector('.erp-business-action-form')
      const formStyle = form ? window.getComputedStyle(form) : null
      const title = node.querySelector('.erp-business-form-page__header, .erp-business-action-modal__title')
      const modalRect = node.getBoundingClientRect()
      const contactItemLists = Array.from(
        node.querySelectorAll('.erp-master-contact-list__items')
      ).map((list) => {
        const style = window.getComputedStyle(list)
        const initialScrollLeft = list.scrollLeft
        list.scrollLeft = 0
        const defaultScrollLeft = list.scrollLeft
        list.scrollLeft = list.scrollWidth - list.clientWidth
        const maxScrollLeft = list.scrollLeft
        list.scrollLeft = defaultScrollLeft
        const rows = Array.from(
          list.querySelectorAll('.erp-master-contact-list__row')
        ).map((row) => {
          const rect = row.getBoundingClientRect()
          const rowStyle = window.getComputedStyle(row)
          return {
            width: rect.width,
            minWidth: rowStyle.minWidth,
            overflowX: rowStyle.overflowX,
          }
        })
        const grids = Array.from(
          list.querySelectorAll('.erp-master-contact-list__grid')
        ).map((grid) => {
          const gridStyle = window.getComputedStyle(grid)
          const fields = Array.from(
            grid.querySelectorAll('.ant-form-item')
          ).map((field) => {
            const rect = field.getBoundingClientRect()
            return {
              text: field.textContent?.replace(/\s+/g, ' ').trim() || '',
              width: rect.width,
              scrollWidth: field.scrollWidth,
              left: rect.left,
            }
          })
          return {
            clientWidth: grid.clientWidth,
            scrollWidth: grid.scrollWidth,
            overflowX: gridStyle.overflowX,
            overflowY: gridStyle.overflowY,
            gridAutoFlow: gridStyle.gridAutoFlow,
            fields,
          }
        })
        return {
          clientWidth: list.clientWidth,
          scrollWidth: list.scrollWidth,
          scrollLeft: list.scrollLeft,
          initialScrollLeft,
          defaultScrollLeft,
          maxScrollLeft,
          left: list.getBoundingClientRect().left,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          rows,
          grids,
        }
      })
      const fieldItems = Array.from(
        node.querySelectorAll('.erp-business-action-form__field')
      )
      const controls = Array.from(
        node.querySelectorAll(
          [
            '.erp-business-action-form input.ant-input:not([type="hidden"])',
            '.erp-business-action-form textarea.ant-input',
            '.erp-business-action-form .ant-input-affix-wrapper',
            '.erp-business-action-form .ant-input-number',
            '.erp-business-action-form .ant-picker',
            '.erp-business-action-form .ant-select-selector',
          ].join(', ')
        )
      )
        .filter((control) => {
          if (control.matches('.erp-item-field-unit-suffix')) {
            return false
          }
          if (
            control.matches('input.ant-input, textarea.ant-input') &&
            control.closest(
              '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select'
            )
          ) {
            return false
          }
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        })
        .map((control) => {
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return {
            width: rect.width,
            height: rect.height,
            borderRadius: style.borderRadius,
          }
        })
      const singleLineControls = Array.from(
        node.querySelectorAll(
          [
            '.erp-business-action-form input.ant-input:not([type="hidden"])',
            '.erp-business-action-form .ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)',
            '.erp-business-action-form .ant-input-number',
            '.erp-business-action-form .ant-picker',
            '.erp-business-action-form .ant-select-single .ant-select-selector',
          ].join(', ')
        )
      )
        .filter((control) => {
          if (
            control.matches('input.ant-input') &&
            control.closest(
              '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select'
            )
          ) {
            return false
          }
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        })
        .map((control) => {
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return {
            tagName: control.tagName,
            className: String(control.className || ''),
            height: rect.height,
            lineHeight: style.lineHeight,
          }
        })
      const textareaCountLayouts = Array.from(
        node.querySelectorAll(
          '.erp-business-action-form .ant-input-textarea-show-count'
        )
      )
        .filter((wrapper) => {
          const rect = wrapper.getBoundingClientRect()
          const style = window.getComputedStyle(wrapper)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        })
        .map((wrapper) => {
          const textarea = wrapper.querySelector('textarea.ant-input')
          const borderNode =
            (wrapper.matches('.ant-input-textarea-affix-wrapper')
              ? wrapper
              : wrapper.querySelector('.ant-input-textarea-affix-wrapper')) ||
            textarea
          const count = wrapper.querySelector('.ant-input-data-count')
          const wrapperRect = wrapper.getBoundingClientRect()
          const borderRect = borderNode?.getBoundingClientRect()
          const countRect = count?.getBoundingClientRect()
          const borderStyle = borderNode
            ? window.getComputedStyle(borderNode)
            : null
          const textareaStyle = textarea
            ? window.getComputedStyle(textarea)
            : null

          return {
            wrapper: {
              width: wrapperRect.width,
              height: wrapperRect.height,
              bottom: wrapperRect.bottom,
            },
            border: borderRect
              ? {
                  top: borderRect.top,
                  right: borderRect.right,
                  bottom: borderRect.bottom,
                  left: borderRect.left,
                  width: borderRect.width,
                  height: borderRect.height,
                  paddingBottom: Number.parseFloat(
                    borderStyle?.paddingBottom || '0'
                  ),
                }
              : null,
            textarea: textarea
              ? {
                  clientWidth: textarea.clientWidth,
                  scrollWidth: textarea.scrollWidth,
                  paddingBottom: Number.parseFloat(
                    textareaStyle?.paddingBottom || '0'
                  ),
                }
              : null,
            count: countRect
              ? {
                  top: countRect.top,
                  right: countRect.right,
                  bottom: countRect.bottom,
                  left: countRect.left,
                  width: countRect.width,
                  height: countRect.height,
                  text: count.textContent?.replace(/\s+/g, ' ').trim() || '',
                }
              : null,
          }
        })
      const controlHeight =
        Number.parseFloat(
          formStyle?.getPropertyValue('--erp-control-height') || ''
        ) || 36
      return {
        className: String(node.className || ''),
        textContent: String(node.textContent || '')
          .replace(/\s+/g, ' ')
          .trim(),
        titleText: title?.textContent?.replace(/\s+/g, ' ').trim() || '',
        hasSubtitle: Boolean(title?.querySelector('small, p')),
        viewportWidth: window.innerWidth,
        modal: {
          width: modalRect.width,
          left: modalRect.left,
          right: modalRect.right,
        },
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
            }
          : null,
        gridTemplateColumns: formStyle?.gridTemplateColumns || '',
        fieldItemCount: fieldItems.length,
        fullFieldCount: fieldItems.filter((item) =>
          item.classList.contains('erp-business-action-form__field--full')
        ).length,
        controls,
        controlHeight,
        singleLineControls,
        textareaCountLayouts,
        contactItemLists,
      }
    })

    assert(
      metrics.className.includes(isPage ? 'erp-business-form-page' : 'erp-business-action-modal--form'),
      `${screenshotName} 未使用业务表单弹窗标准类: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.titleText.includes(titleText) && (isPage || metrics.hasSubtitle),
      `${screenshotName} 弹窗标题或说明未按业务样板展示: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${screenshotName} 表单弹窗出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fieldItemCount >= minFieldCount,
      `${screenshotName} 表单字段数量不足: ${JSON.stringify(metrics)}`
    )
    for (const expectedText of expectedTexts) {
      assert(
        metrics.textContent.includes(expectedText),
        `${screenshotName} 缺少产品核心字段 ${expectedText}: ${JSON.stringify(metrics)}`
      )
    }
    for (const absentText of absentTexts) {
      assert(
        !metrics.textContent.includes(absentText),
        `${screenshotName} 不应继续显示旧字段 ${absentText}: ${JSON.stringify(metrics)}`
      )
    }
    if (typeof afterOpen === 'function') {
      await afterOpen(modal)
    }
    await assertVisibleInputFocusRingNotClipped(page, screenshotName)
    await assertVisibleInputTextVerticalRhythm(page, screenshotName)
    if (requireMultiColumn) {
      assert(
        metrics.gridTemplateColumns.split(' ').length >= 2,
        `${screenshotName} 桌面表单未使用多列表格化布局: ${JSON.stringify(metrics)}`
      )
    }
    if (expectContactItemsLayout) {
      if (!isPage) {
        const expectedWidth = Math.min(1180, metrics.viewportWidth - 48)
        assert(
          metrics.modal.width >= expectedWidth - 2,
          `${screenshotName} 联系人聚合表单未使用明细型主数据宽弹窗: ${JSON.stringify(metrics)}`
        )
      }
      assert(
        metrics.contactItemLists.length > 0 &&
          metrics.contactItemLists.every(
            (list) =>
              ['auto', 'scroll'].includes(list.overflowX) &&
              ['auto', 'visible'].includes(list.overflowY) &&
              list.scrollWidth > list.clientWidth &&
              list.scrollLeft === 0 &&
              list.defaultScrollLeft === 0 &&
              list.maxScrollLeft > 0 &&
              list.clientWidth >= Math.min(1000, metrics.modal.width - 110)
          ),
        `${screenshotName} 联系人区未由同一个外层列表稳定横向滚动，或默认态未停在首列: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.contactItemLists.every(
          (list) =>
            list.rows.length > 0 &&
            list.rows.every((row) => row.width > list.clientWidth + 16) &&
            Math.max(...list.rows.map((row) => row.width)) -
              Math.min(...list.rows.map((row) => row.width)) <=
              2
        ),
        `${screenshotName} 多个联系人条目未共享同一列宽和滚动面: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.contactItemLists.every((list) =>
          list.grids.every(
            (grid) =>
              grid.gridAutoFlow === 'column' &&
              !['auto', 'scroll'].includes(grid.overflowX) &&
              grid.fields.every(
                (field) =>
                  field.width >= 220 && field.scrollWidth <= field.width + 2
              )
          )
        ),
        `${screenshotName} 联系人字段宽度或文本溢出异常: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.contactItemLists.every((list) =>
          list.grids.every((grid) =>
            grid.fields.length === 0
              ? true
              : grid.fields[0].left >= list.left - 1
          )
        ),
        `${screenshotName} 联系人区默认态首列被裁切: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      metrics.controls.every(
        (control) => control.width >= 120 && control.height >= 30
      ),
      `${screenshotName} 表单控件尺寸异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.controls.every(
        (control) => Number.parseFloat(control.borderRadius) >= 9
      ),
      `${screenshotName} 表单控件圆角未统一到业务弹窗基线: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.singleLineControls.length > 0 &&
        metrics.singleLineControls.every(
          (control) => Math.abs(control.height - metrics.controlHeight) <= 1
        ),
      `${screenshotName} 单行输入控件高度未统一: ${JSON.stringify(metrics)}`
    )
    for (const layout of metrics.textareaCountLayouts) {
      assert(
        layout.border && layout.textarea && layout.count,
        `${screenshotName} 多行输入字数统计缺少边框、textarea 或计数器: ${JSON.stringify(layout)}`
      )
      assert(
        layout.count.top >= layout.border.top + 4 &&
          layout.count.right <= layout.border.right - 24 &&
          layout.count.bottom <= layout.border.bottom - 4 &&
          layout.count.left >= layout.border.left + 8,
        `${screenshotName} 多行输入字数统计超出输入框边界: ${JSON.stringify(layout)}`
      )
      assert(
        Math.max(layout.border.paddingBottom, layout.textarea.paddingBottom) >=
          layout.count.height + 6,
        `${screenshotName} 多行输入字数统计未预留内容底部空间: ${JSON.stringify(layout)}`
      )
      assert(
        layout.textarea.scrollWidth <= layout.textarea.clientWidth + 1,
        `${screenshotName} 多行输入框出现横向溢出: ${JSON.stringify(layout)}`
      )
    }

    await assertVisibleRoundedInputWrapperClipping(page, screenshotName)
    await modal.screenshot({
      path: path.resolve(outputDir, `${screenshotName}.png`),
    })
    await closeBusinessFormModal(page, modal)
  }

  async function assertProcessSuggestionOptions(page, modal, { scenarioName }) {
    const readVisibleSuggestionOptions = async (popupClassName) => {
      const popup = page.locator(`${popupClassName}:visible`).last()
      await popup.waitFor({ state: 'visible', timeout: 10_000 })
      return (
        await popup.locator('.ant-select-item-option-content').allTextContents()
      )
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    }

    const assertSuggestionList = async (selector, expectedOptions, label) => {
      const input = modal.locator(`${selector} input`).first()
      const popupClassName = `${selector}__popup`
      await input.click()
      await input.fill('')
      let optionTexts = await readVisibleSuggestionOptions(popupClassName)
      for (const expected of expectedOptions) {
        if (!optionTexts.includes(expected)) {
          await input.fill(expected)
          optionTexts = await readVisibleSuggestionOptions(popupClassName)
        }
        assert(
          optionTexts.includes(expected),
          `${scenarioName} ${label}缺少行业默认候选 ${expected}: ${JSON.stringify(optionTexts)}`
        )
      }
      await page.keyboard.press('Escape')
    }

    await assertSuggestionList(
      '.erp-process-name-suggested-input',
      ['查货', '手工', '车缝', '包装'],
      '环节名称'
    )
    await assertSuggestionList(
      '.erp-process-category-suggested-input',
      ['查货', '手工', '车缝', '包装'],
      '环节类别'
    )
  }

  async function assertOutsourcingProcessSelectOptions(
    page,
    modal,
    { scenarioName }
  ) {
    const processField = modal
      .locator('.ant-form-item:has(.ant-form-item-label label[title="工序"])')
      .first()
    await processField.locator('.ant-select-selector').click()
    const dropdown = page.locator('.ant-select-dropdown:visible').last()
    await dropdown.waitFor({ state: 'visible', timeout: 10_000 })
    const expectedOptions = ['查货', '手工', '车缝', '包装']
    let optionTexts = []
    for (let attempt = 0; attempt < 20; attempt += 1) {
      optionTexts = (
        await dropdown
          .locator('.ant-select-item-option-content')
          .allTextContents()
      )
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      let hasAllExpectedOptions = true
      for (const expected of expectedOptions) {
        if (!optionTexts.some((text) => text.includes(expected))) {
          hasAllExpectedOptions = false
          break
        }
      }
      if (hasAllExpectedOptions) {
        break
      }
      await page.waitForTimeout(250)
    }
    for (const expected of expectedOptions) {
      assert(
        optionTexts.some((text) => text.includes(expected)),
        `${scenarioName} 加工合同工序下拉缺少行业默认候选 ${expected}: ${JSON.stringify(optionTexts)}`
      )
    }
    await page.keyboard.press('Escape')
  }

  async function assertOperationalFactModalViewport(
    page,
    scenarioName,
    visibleModal = null
  ) {
    const modal =
      visibleModal ||
      page
        .locator(
          '.erp-business-action-modal--operational-fact.ant-modal:visible'
        )
        .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(page, modal, `${scenarioName}-centered`)
    const metrics = await modal.evaluate((node) => {
      const body = node.querySelector('.erp-business-form-page__body, .ant-modal-body')
      const form = node.querySelector(
        '.erp-business-action-form, form.ant-form'
      )
      const modalRect = node.getBoundingClientRect()
      const bodyStyle = body ? window.getComputedStyle(body) : null
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        modal: {
          top: modalRect.top,
          bottom: modalRect.bottom,
          width: modalRect.width,
          height: modalRect.height,
        },
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
              clientHeight: body.clientHeight,
              scrollHeight: body.scrollHeight,
              overflowY: bodyStyle?.overflowY || '',
            }
          : null,
        hasBusinessForm: Boolean(form),
      }
    })
    assert(
      metrics.hasBusinessForm,
      `${scenarioName} 未使用业务表单结构: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} modal body 出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body &&
        (metrics.body.scrollHeight <= metrics.body.clientHeight + 1 ||
          metrics.body.overflowY === 'auto'),
      `${scenarioName} 长表单未由 modal body 承载滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.modal.top >= -1 &&
        metrics.modal.bottom <= metrics.viewport.height + 1 &&
        metrics.modal.width <= metrics.viewport.width,
      `${scenarioName} modal 超出视口: ${JSON.stringify(metrics)}`
    )
    await modal.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
    await closeBusinessFormModal(page, modal)
  }

  async function verifyBusinessRowDoubleClickModal(
    page,
    { rowText, titleText, scenarioName, screenshotName, afterModalOpen }
  ) {
    const row = page
      .locator('.erp-business-data-table-card .ant-table-tbody tr')
      .filter({ hasText: rowText })
      .first()
    await row.waitFor({ timeout: 10_000 })
    const copyableCellContent = row
      .locator('.erp-business-table-copyable-cell__content')
      .first()
    if ((await copyableCellContent.count()) > 0) {
      await copyableCellContent.dblclick()
    } else {
      await row.dblclick()
    }

    const modal = page
      .locator('.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible')
      .filter({ hasText: titleText })
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    if (isBusinessFormPageTitle(titleText)) await assertBusinessFormPage(page, modal)
    else await assertAntdModalCentered(page, modal, `${scenarioName}-double-click-modal`)
    await expectText(page, titleText)
    if (afterModalOpen) {
      await afterModalOpen(modal)
    }
    if (screenshotName) {
      await page.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
        fullPage: true,
      })
    }

    const modalMetrics = await page.evaluate(
      ({ expectedTitle }) => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        }
        return {
          visibleEditModals: Array.from(document.querySelectorAll('.erp-business-form-page:not([hidden]), .ant-modal'))
            .filter(isVisible)
            .filter((node) =>
              String(node.textContent || '').includes(expectedTitle)
            ).length,
          visibleDetailDrawers: Array.from(
            document.querySelectorAll('.ant-drawer')
          ).filter(isVisible).length,
        }
      },
      { expectedTitle: titleText }
    )
    assert.equal(
      modalMetrics.visibleEditModals,
      1,
      `${scenarioName} 双击行应打开业务弹窗: ${JSON.stringify(modalMetrics)}`
    )
    assert.equal(
      modalMetrics.visibleDetailDrawers,
      0,
      `${scenarioName} 双击行不应打开详情抽屉: ${JSON.stringify(modalMetrics)}`
    )

    await closeBusinessFormModal(page, modal)
  }

  async function closeBusinessFormModal(page, modal) {
    if (await modal.evaluate(node => node.matches('.erp-business-form-page'))) {
      await closeBusinessFormPage(page, modal)
      return
    }
    await modal
      .locator('.ant-modal-close')
      .click({ force: true })
      .catch(() => {})
    try {
      await modal.waitFor({ state: 'hidden', timeout: 10_000 })
    } catch {
      const closeButton = modal
        .getByRole('button', { name: /取消|关闭/ })
        .last()
      await closeButton.click({ force: true }).catch(() => {})
      await page.keyboard.press('Escape').catch(() => {})
      await modal.waitFor({ state: 'hidden', timeout: 10_000 })
    }
  }
  return {
    verifyBusinessActionFormModal,
    assertProcessSuggestionOptions,
    assertOutsourcingProcessSelectOptions,
    assertOperationalFactModalViewport,
    verifyBusinessRowDoubleClickModal,
    closeBusinessFormModal,
  }
}
