'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireModule } from '@/lib/guard'
import { refreshQuoteMovementFromServiceM8 } from './service'
import { safeQuoteMovementRefreshError } from './sync'
import { updateQuoteMovementProjectComplexity } from './repository'
import {
  quoteMovementProjectComplexityEnum,
  type QuoteMovementProjectComplexity,
} from '@rgtools/db/schema-quote-movement'

export async function refreshQuoteMovementAction() {
  await requireModule('quote-tracker')
  const session = await auth()

  try {
    await refreshQuoteMovementFromServiceM8({
      actorId: session?.user?.id ?? null,
    })
  } catch (error) {
    const message = safeQuoteMovementRefreshError(error)
    redirect(`/quote-movement?refreshError=${encodeURIComponent(message)}`)
  }

  revalidatePath('/quote-movement')
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
