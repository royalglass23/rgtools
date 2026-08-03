'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { auth } from '@/lib/auth'
import { requireModule } from '@/lib/guard'
import { requestQuoteMovementJobFetch, requestQuoteMovementRefresh } from './service'
import {
  parseQuoteMovementJobNumbers,
  safeQuoteMovementRefreshError,
} from './sync'
import { updateQuoteMovementProjectComplexity } from './repository'
import { retryQuoteMovementSummary } from './summary-recovery'
import {
  quoteMovementProjectComplexityEnum,
  type QuoteMovementProjectComplexity,
} from '@rgtools/db/schema-quote-movement'

export async function refreshQuoteMovementAction() {
  await requireModule('quote-tracker')
  const session = await auth()

  try {
    const result = await requestQuoteMovementRefresh({
      actorId: session?.user?.id ?? null,
      schedule: after,
    })
    revalidatePath('/quote-movement')
    return result
  } catch (error) {
    const message = safeQuoteMovementRefreshError(error)
    redirect(`/quote-movement?refreshError=${encodeURIComponent(message)}`)
  }

}

export async function refreshQuoteMovementJobAction(formData: FormData) {
  await requireModule('quote-tracker')
  const session = await auth()
  const jobNumber = formData.get('jobNumber')
  if (typeof jobNumber !== 'string' || jobNumber.trim() === '') {
    redirect('/quote-movement?refreshError=Enter%20a%20job%20number%20to%20fetch.')
  }
  try {
    parseQuoteMovementJobNumbers(jobNumber.trim())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enter one job number to fetch.'
    redirect(`/quote-movement?refreshError=${encodeURIComponent(message)}`)
  }

  try {
    await requestQuoteMovementJobFetch({
      actorId: session?.user?.id ?? null,
      input: jobNumber.trim(),
      schedule: after,
    })
    revalidatePath('/quote-movement')
  } catch (error) {
    const message = safeQuoteMovementRefreshError(error)
    redirect(`/quote-movement?refreshError=${encodeURIComponent(message)}`)
  }
}

export async function refreshQuoteMovementDetailAction(jobNumber: string) {
  await requireModule('quote-tracker')
  const normalizedJobNumber = jobNumber.trim()
  if (!normalizedJobNumber) throw new Error('Quote Movement job number is required.')
  const session = await auth()
  const result = await requestQuoteMovementJobFetch({
    actorId: session?.user?.id ?? null,
    input: normalizedJobNumber,
    schedule: after,
  })
  revalidatePath('/quote-movement')
  return result
}

export async function retryQuoteMovementSummaryAction(recordId: string) {
  await requireModule('quote-tracker')
  const session = await auth()
  await retryQuoteMovementSummary(recordId.trim(), session?.user?.id ?? null)
  revalidatePath('/quote-movement')
  revalidatePath(`/quote-movement/${recordId.trim()}`)
  return { status: 'retried' as const }
}

export async function updateQuoteMovementComplexityAction(
  formData: FormData,
) {
  await requireModule('quote-tracker')
  const recordId = formData.get('recordId')
  if (typeof recordId !== 'string' || recordId.trim() === '') {
    throw new Error('Quote Movement record ID is required.')
  }
  const projectComplexity = formData.get('projectComplexity')
  if (
    typeof projectComplexity !== 'string' ||
    !quoteMovementProjectComplexityEnum.enumValues.includes(
      projectComplexity as QuoteMovementProjectComplexity,
    )
  ) {
    throw new Error('Invalid Project Complexity.')
  }

  await updateQuoteMovementProjectComplexity(
    recordId.trim(),
    projectComplexity as QuoteMovementProjectComplexity,
  )
  revalidatePath('/quote-movement')
}
