import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { currentKnowledgeInboxAccess } from '@/modules/knowledge-inbox/access'
import { getInboxQuestion } from '@/modules/knowledge-inbox/client'
import { reviewAnswerAction, submitAnswerAction } from '@/modules/knowledge-inbox/actions'

export const dynamic = 'force-dynamic'

export default async function KnowledgeQuestionPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const access = await currentKnowledgeInboxAccess(session.user.id)
  if (!access.respondent) redirect('/?denied=knowledge-inbox')
  const { id } = await params
  let question
  try {
    question = await getInboxQuestion(id)
  } catch {
    return <p role="alert">Knowledge question is unavailable. <Link href="/knowledge-inbox" className="underline">Back to inbox</Link></p>
  }
  if (!question) notFound()
  const saved = (await searchParams).saved
  return <div className="max-w-4xl space-y-6">
    <Link href="/knowledge-inbox" className="text-sm text-teal-800 underline">← All questions</Link>
    <header>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{question.batch ? `Batch ${question.batch}` : 'Across batches'}{question.graph_nodes.length ? ` · Graph ${question.graph_nodes.join(', ')}` : ''}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">{question.prompt}</h1>
      {question.context && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{question.context}</p>}
    </header>
    {saved && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">{saved === 'answer' ? 'Written response saved for review.' : 'Review recorded.'}</p>}
    {question.status !== 'closed' && <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Add a written response</h2>
      <p className="mt-1 text-sm text-slate-600">Use current guidance where possible. Leave out customer names, email addresses and Job numbers.</p>
      <form action={submitAnswerAction} className="mt-4 grid gap-4">
        <input type="hidden" name="question_id" value={question.id} />
        <label className="grid gap-1 text-sm font-medium">Your answer
          <textarea name="answer" required maxLength={10000} rows={7} className="rounded border border-slate-300 p-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Current checklist or document used (optional)
          <textarea name="source_refs" maxLength={3000} rows={2} className="rounded border border-slate-300 p-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Exceptions or cases that need another decision (optional)
          <textarea name="exceptions" maxLength={3000} rows={2} className="rounded border border-slate-300 p-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium">If another person owns this decision, who? (optional)
          <input name="referred_to" maxLength={160} className="rounded border border-slate-300 p-2" />
        </label>
        <button type="submit" className="w-fit rounded bg-teal-800 px-4 py-2 text-sm font-semibold text-white">Save response</button>
      </form>
    </section>}
    <section aria-labelledby="responses-heading">
      <h2 id="responses-heading" className="text-lg font-semibold">Written responses</h2>
      {!question.answers?.length ? <p className="mt-2 text-sm text-slate-600">No response yet.</p> :
        <ul className="mt-3 space-y-4">{question.answers.map((answer) => <li key={answer.id} className="rounded border border-slate-200 bg-white p-5">
          <p className="whitespace-pre-wrap text-sm text-slate-900">{answer.answer}</p>
          {answer.source_refs && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Sources:</strong> {answer.source_refs}</p>}
          {answer.exceptions && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Exceptions:</strong> {answer.exceptions}</p>}
          {answer.referred_to && <p className="mt-2 text-sm"><strong>Refer to:</strong> {answer.referred_to}</p>}
          <p className="mt-3 text-xs text-slate-500">Submitted by staff ID {answer.submitted_by} · {answer.review_status.replace('_', ' ')}</p>
          {answer.review_note && <p className="mt-2 text-sm"><strong>Review note:</strong> {answer.review_note}</p>}
          {access.reviewer && answer.review_status === 'pending' && <form action={reviewAnswerAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4">
            <input type="hidden" name="question_id" value={question.id} />
            <input type="hidden" name="answer_id" value={answer.id} />
            <label className="grid gap-1 text-sm font-medium">Review outcome
              <select name="status" className="rounded border border-slate-300 p-2">
                <option value="verified_for_drafting">Verified for drafting guidance</option>
                <option value="needs_clarification">Needs clarification</option>
                <option value="rejected">Cannot use</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">Review note
              <textarea name="note" maxLength={3000} rows={2} className="rounded border border-slate-300 p-2" />
            </label>
            <button type="submit" className="w-fit rounded border border-teal-800 px-4 py-2 text-sm font-semibold text-teal-800">Record review</button>
          </form>}
        </li>)}</ul>}
    </section>
  </div>
}
