'use server'

import { auth } from '@/lib/auth'
import { currentKnowledgeInboxAccess } from './access'
import { createInboxQuestion, reviewInboxAnswer, submitInboxAnswer } from './client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function actor(required: 'respondent' | 'reviewer') {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const access = await currentKnowledgeInboxAccess(session.user.id)
  if (!access[required]) throw new Error('Knowledge inbox access denied')
  return session.user.id
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function createQuestionAction(form: FormData) {
  const userId = await actor('reviewer')
  const batchText = text(form, 'batch')
  const batch = batchText ? Number(batchText) : null
  const graph_nodes = text(form, 'graph_nodes').toUpperCase().split(/[\s,]+/).filter(Boolean)
  await createInboxQuestion(userId, { prompt: text(form, 'prompt'), batch, graph_nodes, context: text(form, 'context') })
  revalidatePath('/knowledge-inbox')
  redirect('/knowledge-inbox?saved=question')
}

export async function submitAnswerAction(form: FormData) {
  const userId = await actor('respondent')
  const questionId = text(form, 'question_id')
  await submitInboxAnswer(userId, questionId, {
    answer: text(form, 'answer'), source_refs: text(form, 'source_refs'),
    exceptions: text(form, 'exceptions'), referred_to: text(form, 'referred_to'),
  })
  revalidatePath(`/knowledge-inbox/${questionId}`)
  redirect(`/knowledge-inbox/${questionId}?saved=answer`)
}

export async function reviewAnswerAction(form: FormData) {
  const userId = await actor('reviewer')
  const questionId = text(form, 'question_id')
  await reviewInboxAnswer(userId, text(form, 'answer_id'), { status: text(form, 'status'), note: text(form, 'note') })
  revalidatePath(`/knowledge-inbox/${questionId}`)
  redirect(`/knowledge-inbox/${questionId}?saved=review`)
}
