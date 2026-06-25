export function createLineItemUnitAssertions({ assert }) {
  const assertLineQuantityUnitSuffix = async (
    modal,
    { label, expectedText, scenarioName }
  ) => {
    let metrics = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      metrics = await modal.evaluate(
        (node, args) => {
          const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            )
          }
          const field = Array.from(
            node.querySelectorAll('.ant-form-item')
          ).find((item) => {
            const labelText =
              item
                .querySelector('.ant-form-item-label label')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim() || ''
            const itemText = item.textContent?.replace(/\s+/g, ' ').trim() || ''
            return (
              (labelText.includes(args.label) ||
                itemText.includes(args.label)) &&
              item.querySelector('.erp-item-field-with-unit')
            )
          })
          const wrapper = field?.querySelector('.erp-item-field-with-unit')
          const suffix = field?.querySelector('.erp-item-field-unit-suffix')
          const input = wrapper?.querySelector(
            '.ant-input:not(.erp-item-field-unit-suffix), .ant-input-number'
          )
          const fieldRect = field?.getBoundingClientRect()
          const wrapperRect = wrapper?.getBoundingClientRect()
          const inputRect = input?.getBoundingClientRect()
          const suffixRect = suffix?.getBoundingClientRect()
          return {
            label: args.label,
            expectedText: args.expectedText,
            hasField: Boolean(field),
            unitWrapperCount: node.querySelectorAll('.erp-item-field-with-unit')
              .length,
            unitSuffixCount: node.querySelectorAll(
              '.erp-item-field-unit-suffix'
            ).length,
            fieldVisible: isVisible(field),
            wrapperVisible: isVisible(wrapper),
            inputVisible: isVisible(input),
            suffixVisible: isVisible(suffix),
            suffixValue: suffix?.value || '',
            suffixAria: suffix?.getAttribute('aria-label') || '',
            fieldClientWidth: field?.clientWidth || 0,
            fieldScrollWidth: field?.scrollWidth || 0,
            fieldWidth: fieldRect?.width || 0,
            wrapperWidth: wrapperRect?.width || 0,
            inputWidth: inputRect?.width || 0,
            suffixWidth: suffixRect?.width || 0,
            inputRight: inputRect?.right || 0,
            suffixLeft: suffixRect?.left || 0,
            suffixRight: suffixRect?.right || 0,
            wrapperRight: wrapperRect?.right || 0,
          }
        },
        { label, expectedText }
      )
      if (
        metrics.hasField &&
        metrics.fieldVisible &&
        metrics.wrapperVisible &&
        metrics.inputVisible &&
        metrics.suffixVisible
      ) {
        break
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
    }
    assert(
      metrics.hasField &&
        metrics.fieldVisible &&
        metrics.wrapperVisible &&
        metrics.inputVisible &&
        metrics.suffixVisible,
      `${scenarioName} ${label} 应显示单位后缀: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.suffixValue,
      expectedText,
      `${scenarioName} ${label} 单位后缀应显示可读单位而不是裸 ID: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.suffixAria,
      `单位 ${expectedText}`,
      `${scenarioName} ${label} 单位后缀缺少可访问名称: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.inputWidth >= 96 &&
        metrics.suffixWidth >= 48 &&
        metrics.suffixLeft >= metrics.inputRight - 1 &&
        metrics.suffixRight <= metrics.wrapperRight + 1,
      `${scenarioName} ${label} 单位后缀挤压或错位: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fieldScrollWidth <= metrics.fieldClientWidth + 1,
      `${scenarioName} ${label} 单位后缀造成字段横向溢出: ${JSON.stringify(
        metrics
      )}`
    )
  }

  const assertLineSourceSummaryReadableUnit = async (
    modal,
    { label, expectedText, scenarioName }
  ) => {
    const metrics = await modal.evaluate(
      (node, args) => {
        const fields = Array.from(node.querySelectorAll('.ant-form-item'))
          .filter((item) => {
            const labelText =
              item
                .querySelector('.ant-form-item-label label')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim() || ''
            return labelText.includes(args.label)
          })
          .map((item) => ({
            value: item.querySelector('input')?.value || '',
          }))
        return {
          label: args.label,
          expectedText: args.expectedText,
          fieldCount: fields.length,
          values: fields.map((field) => field.value),
        }
      },
      { label, expectedText }
    )
    assert(
      metrics.fieldCount > 0 &&
        metrics.values.some((value) => value.includes(expectedText)),
      `${scenarioName} ${label} 应显示可读单位: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.values.every((value) => !/单位\s*#\d+/.test(value)),
      `${scenarioName} ${label} 不应显示裸单位 ID: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineAmountCalculation = async (
    modal,
    {
      quantityLabel,
      unitPriceLabel,
      amountLabel,
      quantity,
      unitPrice,
      expected,
      scenarioName,
    }
  ) => {
    const inputForLabel = (label) =>
      modal
        .locator('.ant-form-item')
        .filter({ hasText: label })
        .locator('input:not(.erp-item-field-unit-suffix)')
        .first()

    await inputForLabel(quantityLabel).fill(quantity)
    await inputForLabel(unitPriceLabel).fill(unitPrice)

    let metrics = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      metrics = await modal.evaluate(
        (node, args) => {
          const field = Array.from(
            node.querySelectorAll('.ant-form-item')
          ).find((item) => {
            const labelText =
              item
                .querySelector('.ant-form-item-label label')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim() || ''
            return labelText.includes(args.amountLabel)
          })
          const input = field?.querySelector(
            'input:not(.erp-item-field-unit-suffix)'
          )
          const fieldRect = field?.getBoundingClientRect()
          return {
            amountLabel: args.amountLabel,
            expected: args.expected,
            hasField: Boolean(field),
            fieldVisible: Boolean(
              fieldRect && fieldRect.width > 0 && fieldRect.height > 0
            ),
            inputValue: input?.value || '',
            inputDisabled: Boolean(input?.disabled),
            inputReadOnly: Boolean(input?.readOnly),
          }
        },
        { amountLabel, expected }
      )
      if (metrics.inputValue === expected) {
        break
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
    }

    assert(
      metrics.hasField && metrics.fieldVisible,
      `${scenarioName} ${amountLabel} 字段应可见: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.inputValue,
      expected,
      `${scenarioName} ${amountLabel} 应按数量和单价计算: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.inputDisabled || metrics.inputReadOnly,
      `${scenarioName} ${amountLabel} 应保持自动计算只读: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineQuantityPrecisionBlocksAmount = async (
    modal,
    {
      quantityLabel,
      unitPriceLabel,
      amountLabel,
      quantity,
      unitPrice,
      expectedErrorText,
      scenarioName,
    }
  ) => {
    const inputForLabel = (label) =>
      modal
        .locator('.ant-form-item')
        .filter({ hasText: label })
        .locator('input:not(.erp-item-field-unit-suffix)')
        .first()

    await inputForLabel(quantityLabel).fill(quantity)
    await inputForLabel(unitPriceLabel).fill(unitPrice)
    await modal
      .locator('.ant-form-item-explain-error', { hasText: expectedErrorText })
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })

    const metrics = await modal.evaluate(
      (node, args) => {
        const fields = Array.from(node.querySelectorAll('.ant-form-item'))
        const amountField = fields.find((item) => {
          const labelText =
            item
              .querySelector('.ant-form-item-label label')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || ''
          return labelText.includes(args.amountLabel)
        })
        const amountInput = amountField?.querySelector(
          'input:not(.erp-item-field-unit-suffix)'
        )
        return {
          amountLabel: args.amountLabel,
          amountValue: amountInput?.value || '',
          visibleErrors: fields
            .flatMap((item) =>
              Array.from(item.querySelectorAll('.ant-form-item-explain-error'))
            )
            .map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
            .filter(Boolean),
        }
      },
      { amountLabel }
    )

    assert.equal(
      metrics.amountValue,
      '',
      `${scenarioName} 数量精度非法时不应继续显示金额: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.visibleErrors.includes(expectedErrorText),
      `${scenarioName} 应显示单位精度错误: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineItemFieldLayout = async (
    modal,
    { scenarioName, visibleThroughLabel, absentLabels = [], maxRowWidth = 2200 }
  ) => {
    const metrics = await modal.evaluate(
      (node, args) => {
        const isVisible = (element) => {
          if (!(element instanceof HTMLElement)) return false
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        }
        const list = node.querySelector('.erp-sales-order-lines-form__list')
        const row = node.querySelector('.erp-sales-order-lines-form__row')
        const grid = node.querySelector('.erp-sales-order-lines-form__grid')
        const listRect = list?.getBoundingClientRect()
        const rowRect = row?.getBoundingClientRect()
        const fields = Array.from(
          grid?.querySelectorAll(':scope > .ant-form-item') || []
        )
          .filter(isVisible)
          .map((item) => {
            const label =
              item
                .querySelector('.ant-form-item-label label')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim() || ''
            const input = item.querySelector(
              'input:not([type="hidden"]), textarea'
            )
            const suffix = item.querySelector('.erp-item-field-unit-suffix')
            const rect = item.getBoundingClientRect()
            return {
              label,
              width: Math.round(rect.width),
              inputClientWidth: input?.clientWidth || 0,
              inputScrollWidth: input?.scrollWidth || 0,
              suffixValue: suffix?.value || '',
              suffixWidth: Math.round(
                suffix?.getBoundingClientRect().width || 0
              ),
              fullyInViewport: rect.right <= (listRect?.right || 0) + 1,
            }
          })
        const visibleText = node.textContent?.replace(/\s+/g, ' ').trim() || ''
        return {
          visibleThroughLabel: args.visibleThroughLabel,
          absentLabels: args.absentLabels,
          rowWidth: Math.round(rowRect?.width || 0),
          listClientWidth: list?.clientWidth || 0,
          listScrollWidth: list?.scrollWidth || 0,
          fields,
          visibleText,
        }
      },
      { visibleThroughLabel, absentLabels }
    )
    assert(
      metrics.rowWidth > 0 && metrics.rowWidth <= maxRowWidth,
      `${scenarioName} 明细行宽度不合理: ${JSON.stringify(metrics)}`
    )
    const throughIndex = metrics.fields.findIndex(
      (field) => field.label === visibleThroughLabel
    )
    assert(
      throughIndex >= 0,
      `${scenarioName} 未找到首屏目标字段 ${visibleThroughLabel}: ${JSON.stringify(
        metrics
      )}`
    )
    const clippedFields = metrics.fields
      .slice(0, throughIndex + 1)
      .filter((field) => !field.fullyInViewport)
    assert.deepEqual(
      clippedFields,
      [],
      `${scenarioName} 首屏字段到 ${visibleThroughLabel} 应完整可见: ${JSON.stringify(
        metrics
      )}`
    )
    const visibleLineNoFields = metrics.fields.filter(
      (field) => field.label === '行号'
    )
    assert.deepEqual(
      visibleLineNoFields,
      [],
      `${scenarioName} 行号应由明细顺序自动生成，不应作为可见输入字段: ${JSON.stringify(
        metrics
      )}`
    )
    const narrowQuantityFields = metrics.fields.filter(
      (field) =>
        field.label.includes('数量') &&
        field.suffixValue &&
        field.inputClientWidth < 112
    )
    assert.deepEqual(
      narrowQuantityFields,
      [],
      `${scenarioName} 带单位数量输入本体过窄: ${JSON.stringify(metrics)}`
    )
    const leakedLabels = absentLabels.filter((label) =>
      metrics.visibleText.includes(label)
    )
    assert.deepEqual(
      leakedLabels,
      [],
      `${scenarioName} 不应继续展示重复快照字段: ${JSON.stringify(metrics)}`
    )
    assert(
      !metrics.visibleText.includes('核心演示单位'),
      `${scenarioName} 不应在明细行展示演示单位长文案: ${JSON.stringify(
        metrics
      )}`
    )
  }

  const assertLineItemDuplicateAction = async (modal, { scenarioName }) => {
    const duplicateButton = modal.getByRole('button', { name: '复制第 1 行' })
    await duplicateButton.waitFor({ state: 'visible', timeout: 5_000 })
    await duplicateButton.click()

    const metrics = await modal.evaluate((node) => {
      const visibleText = node.textContent?.replace(/\s+/g, ' ').trim() || ''
      const rows = Array.from(
        node.querySelectorAll('.erp-sales-order-lines-form__row')
      )
      return {
        rowCount: rows.length,
        copyLabels: Array.from(
          node.querySelectorAll('button[aria-label^="复制第"]')
        ).map((button) => button.getAttribute('aria-label')),
        rowActionTexts: rows.map(
          (row) =>
            row
              .querySelector('.erp-sales-order-lines-form__row-actions')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || ''
        ),
        visibleText,
      }
    })

    assert(
      metrics.rowCount >= 2,
      `${scenarioName} 复制本行后应插入新明细行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.copyLabels.includes('复制第 1 行') &&
        metrics.copyLabels.includes('复制第 2 行'),
      `${scenarioName} 复制按钮应保留可访问名称并随行号更新: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      !metrics.visibleText.includes('行号'),
      `${scenarioName} 复制后仍不应展示行号输入: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rowActionTexts.every(
        (text) => text.includes('复制行') && text.includes('移除行')
      ),
      `${scenarioName} 明细行操作应统一展示短文案: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineItemFooterFollowsModalScroll = async (
    modal,
    { scenarioName }
  ) => {
    const metrics = await modal.evaluate((node) => {
      const list = node.querySelector('.erp-sales-order-lines-form__list')
      const footer = node.querySelector('.erp-line-items-form__footer')
      const addButton = Array.from(node.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('添加条目')
      )
      const modalBody =
        node.querySelector('.ant-modal-body') || node.closest('.ant-modal-body')
      const section = node.querySelector('.erp-sales-order-lines-form')
      const footerStyle = footer ? window.getComputedStyle(footer) : null

      if (list) {
        list.scrollLeft = 0
      }

      const bodyBeforeScrollLeft = modalBody?.scrollLeft || 0
      const listBeforeScrollLeft = list?.scrollLeft || 0
      const footerBeforeRect = footer?.getBoundingClientRect()
      const buttonBeforeRect = addButton?.getBoundingClientRect()

      if (list) {
        list.scrollLeft = Math.max(80, list.scrollWidth - list.clientWidth)
      }

      const footerAfterRect = footer?.getBoundingClientRect()
      const buttonAfterRect = addButton?.getBoundingClientRect()

      return {
        hasList: Boolean(list),
        hasFooter: Boolean(footer),
        hasAddButton: Boolean(addButton),
        footerInModalBody: Boolean(modalBody?.contains(footer)),
        footerInsideHorizontalList: Boolean(list?.contains(footer)),
        addButtonInsideFooter: Boolean(footer?.contains(addButton)),
        footerPosition: footerStyle?.position || '',
        bodyScrollLeft: modalBody?.scrollLeft || 0,
        bodyBeforeScrollLeft,
        listClientWidth: list?.clientWidth || 0,
        listScrollWidth: list?.scrollWidth || 0,
        listBeforeScrollLeft,
        listAfterScrollLeft: list?.scrollLeft || 0,
        sectionWidth: Math.round(section?.getBoundingClientRect().width || 0),
        footerWidth: Math.round(footerAfterRect?.width || 0),
        footerLeftDelta: Math.round(
          (footerAfterRect?.left || 0) - (footerBeforeRect?.left || 0)
        ),
        buttonLeftDelta: Math.round(
          (buttonAfterRect?.left || 0) - (buttonBeforeRect?.left || 0)
        ),
      }
    })

    assert(
      metrics.hasList && metrics.hasFooter && metrics.hasAddButton,
      `${scenarioName} 明细列表、footer 和添加条目按钮应同时存在: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.footerInModalBody,
      true,
      `${scenarioName} 添加条目 footer 应随弹窗内容纵向滚动: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.footerInsideHorizontalList,
      false,
      `${scenarioName} 添加条目 footer 不应放在明细横向滚动容器内: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.addButtonInsideFooter,
      true,
      `${scenarioName} 添加条目按钮应归属 footer 操作区: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.footerPosition !== 'fixed' && metrics.footerPosition !== 'sticky',
      `${scenarioName} 添加条目 footer 不应固定或吸附，应随弹窗滚动: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.listScrollWidth > metrics.listClientWidth &&
        metrics.listAfterScrollLeft > metrics.listBeforeScrollLeft,
      `${scenarioName} 应由明细列表承接横向滚动: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.bodyScrollLeft,
      metrics.bodyBeforeScrollLeft,
      `${scenarioName} 弹窗正文不应承接明细横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(metrics.footerLeftDelta) <= 1 &&
        Math.abs(metrics.buttonLeftDelta) <= 1,
      `${scenarioName} 添加条目按钮不应跟随明细横向滚动: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.footerWidth <= metrics.sectionWidth + 1,
      `${scenarioName} footer 不应被明细宽度撑开: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineItemAddActionScrollsToNewRow = async (
    modal,
    { scenarioName, targetRowCount = 6 }
  ) => {
    const addButton = modal.getByRole('button', { name: '添加条目' })
    await addButton.waitFor({ state: 'visible', timeout: 5_000 })

    let rowCount = await modal
      .locator('.erp-sales-order-lines-form__row')
      .count()
    while (rowCount < targetRowCount) {
      await addButton.scrollIntoViewIfNeeded()
      await addButton.click()
      rowCount += 1
      await modal
        .locator('.erp-sales-order-lines-form__row')
        .nth(rowCount - 1)
        .waitFor({ state: 'visible', timeout: 5_000 })
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 450)
    })

    const metrics = await modal.evaluate((node) => {
      const modalBody =
        node.querySelector('.ant-modal-body') || node.closest('.ant-modal-body')
      const list = node.querySelector('.erp-sales-order-lines-form__list')
      const rows = Array.from(
        node.querySelectorAll('.erp-sales-order-lines-form__row')
      )
      const latestRow = rows[rows.length - 1]
      const footer = node.querySelector('.erp-line-items-form__footer')
      const listStyle = list ? window.getComputedStyle(list) : null
      const listRect = list?.getBoundingClientRect()
      const bodyRect = modalBody?.getBoundingClientRect()
      const latestRect = latestRow?.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      return {
        rowCount: rows.length,
        listOverflowY: listStyle?.overflowY || '',
        listScrollTop: Math.round(list?.scrollTop || 0),
        listClientHeight: Math.round(list?.clientHeight || 0),
        listScrollHeight: Math.round(list?.scrollHeight || 0),
        bodyScrollTop: Math.round(modalBody?.scrollTop || 0),
        bodyClientHeight: Math.round(modalBody?.clientHeight || 0),
        bodyScrollHeight: Math.round(modalBody?.scrollHeight || 0),
        latestRowTop: Math.round(latestRect?.top || 0),
        latestRowBottom: Math.round(latestRect?.bottom || 0),
        listTop: Math.round(listRect?.top || 0),
        listBottom: Math.round(listRect?.bottom || 0),
        bodyTop: Math.round(bodyRect?.top || 0),
        bodyBottom: Math.round(bodyRect?.bottom || 0),
        footerBottom: Math.round(footerRect?.bottom || 0),
        latestRowVisibleInList:
          Boolean(listRect && latestRect) &&
          latestRect.top >= listRect.top - 1 &&
          latestRect.bottom <= listRect.bottom + 1,
      }
    })

    assert(
      metrics.rowCount >= targetRowCount,
      `${scenarioName} 连续添加后应达到目标明细行数: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.listOverflowY === 'auto' || metrics.listOverflowY === 'scroll',
      `${scenarioName} 多明细列表应由 item 区域承接纵向滚动: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.listScrollHeight > metrics.listClientHeight,
      `${scenarioName} 多明细后 item 区域应形成纵向滚动: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.listScrollTop > 0,
      `${scenarioName} 添加多行后 item 区域应自动滚动到新明细附近: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.latestRowVisibleInList,
      true,
      `${scenarioName} 最新添加的明细行应进入 item 区域可视区: ${JSON.stringify(
        metrics
      )}`
    )
  }

  return {
    assertLineItemAddActionScrollsToNewRow,
    assertLineItemDuplicateAction,
    assertLineItemFooterFollowsModalScroll,
    assertLineItemFieldLayout,
    assertLineAmountCalculation,
    assertLineQuantityPrecisionBlocksAmount,
    assertLineQuantityUnitSuffix,
    assertLineSourceSummaryReadableUnit,
  }
}
