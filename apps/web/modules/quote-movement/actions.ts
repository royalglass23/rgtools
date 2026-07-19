'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireModule } from '@/lib/guard'
import { refreshQuoteMovementFromServiceM8 } from './service'
import { safeQuoteMovementRefreshError } from './sync'

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
