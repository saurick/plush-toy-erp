import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { executeProductionWipAction } from '../../api/productionWipApi.mjs'
import { buildProductionWipFormPayload } from '../../utils/productionWipFormPayload.mjs'
import { productionWipUUID } from '../../utils/productionWipModel.mjs'
import {
  isMutationResultUnknown,
  stableMutationSignature,
} from '../../utils/mutationAttempt.mjs'

export default function useProductionRouteSubmission() {
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(null)
  const attempt = useRef(null)

  const resetSubmission = useCallback(() => {
    inFlight.current = null
    attempt.current = null
    setSaving(false)
  }, [])

  useEffect(
    () => () => {
      inFlight.current = null
    },
    []
  )

  async function submit({ form, context, title }) {
    if (inFlight.current) return
    const submission = {}
    inFlight.current = submission
    setSaving(true)
    try {
      const values = await form.validateFields()
      if (inFlight.current !== submission) return
      const payload = buildProductionWipFormPayload({ ...context, values })
      const signature = stableMutationSignature({
        action: context.action,
        payload,
      })
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: productionWipUUID() }
      }
      const aggregate = await executeProductionWipAction(context.action, {
        ...payload,
        idempotency_key: attempt.current.key,
      })
      if (inFlight.current !== submission) return
      attempt.current = null
      return aggregate
    } catch (error) {
      if (inFlight.current === submission && !error?.errorFields) {
        if (isMutationResultUnknown(error)) {
          message.warning(
            '暂时无法确认工序是否已办理，请核对进度；填写内容未变时可再次确认办理'
          )
        } else {
          message.error(getActionErrorMessage(error, title || '办理生产工序'))
        }
      }
    } finally {
      if (inFlight.current === submission) {
        inFlight.current = null
        setSaving(false)
      }
    }
  }

  return { saving, submit, resetSubmission }
}
