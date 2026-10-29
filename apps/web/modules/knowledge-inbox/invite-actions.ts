'use server'

import { redirect } from 'next/navigation'
import { getInboxQuestion, submitInboxAnswer } from './client'
import { readKnowledgeInvite } from './invite'

const inviteActor = 'Roxy link holder (identity unverified)'

function value(form: FormData, name: string): string {
  const item = form.get(name)
  return typeof item === 'string' ? item.trim() : ''
}

export async function submitInvitedAnswerAction(form: FormData) {
  const token = value(form, 'token')
  const questionId = value(form, 'question_id')
  const invite = readKnowledgeInvite(token)
  if (!invite || !invite.ids.includes(questionId)) throw new Error('This response link has expired or is invalid')
  const question = await getInboxQuestion(questionId)
  if (question.status !== 'open') throw new Error('This question is no longer open')
  await submitInboxAnswer(inviteActor, questionId, {
    answer: value(form, 'answer'), source_refs: value(form, 'source_refs'),
    exceptions: value(form, 'exceptions'), referred_to: value(form, 'referred_to'),
  })
  redirect(`/knowledge-response?token=${encodeURIComponent(token)}&saved=1`)
}
