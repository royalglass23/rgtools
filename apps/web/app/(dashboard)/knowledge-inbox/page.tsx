import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { currentKnowledgeInboxAccess } from '@/modules/knowledge-inbox/access'
import { listInboxQuestions } from '@/modules/knowledge-inbox/client'
import { createQuestionAction } from '@/modules/knowledge-inbox/actions'
import { createKnowledgeInvite } from '@/modules/knowledge-inbox/invite'
import { CopyInviteLink } from '@/modules/knowledge-inbox/CopyInviteLink'

export const dynamic = 'force-dynamic'

export default async function KnowledgeInboxPage({ searchParams }: {
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const access = await currentKnowledgeInboxAccess(session.user.id)
  if (!access.respondent) redirect('/?denied=knowledge-inbox')
  const saved = (await searchParams).saved
  let questions
  try {
    ({ questions } = await listInboxQuestions())
  } catch {
    return <section className="rounded border border-amber-300 bg-amber-50 p-6">
      <h1 className="text-2xl font-semibold text-slate-950">Knowledge inbox unavailable</h1>
      <p className="mt-2 text-sm text-slate-700">Please try again later. No answer was submitted from this page.</p>
    </section>
  }
  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold text-slate-950">Royal Glass knowledge inbox</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Answer process questions in writing, one batch at a time. Your response is saved for review and does not become agent guidance automatically.</p>
    </header>
    {saved === 'question' && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">Question saved.</p>}
    {access.reviewer && (process.env.RG_BRAIN_INBOX_INVITE_SECRET?.length ?? 0) >= 32 && <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Send a written response link</h2>
      <p className="mt-1 text-sm text-slate-600">Each link covers only the open questions in that group and expires after 14 days. Anyone with the link can respond, so send it privately.</p>
      <div className="mt-4 grid gap-3">{[null, 1, 2, 3, 4, 5, 6, 7].map((batch) => {
        const ids = questions.filter((q) => q.status === 'open' && q.batch === batch).map((q) => q.id)
        return ids.length ? <CopyInviteLink key={batch ?? 'general'} token={createKnowledgeInvite(ids)} label={batch === null ? 'current policy questions' : `batch ${batch}`} /> : null
      })}</div>
    </section>}
    {access.reviewer && <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Add a question</h2>
      <form action={createQuestionAction} className="mt-4 grid max-w-3xl gap-4">
        <label className="grid gap-1 text-sm font-medium">Question
          <textarea name="prompt" required minLength={10} maxLength={2000} rows={3} className="rounded border border-slate-300 p-2" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Graph batch (optional)
            <select name="batch" className="rounded border border-slate-300 p-2">
              <option value="">Across batches</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Batch {n}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Graph nodes (optional, comma separated)
            <input name="graph_nodes" maxLength={60} className="rounded border border-slate-300 p-2" placeholder="A, B, C" />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium">Context or existing evidence (optional)
          <textarea name="context" maxLength={3000} rows={2} className="rounded border border-slate-300 p-2" />
        </label>
        <button type="submit" className="w-fit rounded bg-teal-800 px-4 py-2 text-sm font-semibold text-white">Save question</button>
      </form>
    </section>}
    <section aria-labelledby="questions-heading">
      <h2 id="questions-heading" className="text-lg font-semibold">Questions</h2>
      {questions.length === 0 ? <p className="mt-3 text-sm text-slate-600">No questions have been added yet.</p> :
        <ul className="mt-3 grid gap-3">{questions.map((question) => <li key={question.id} className="rounded border border-slate-200 bg-white p-4">
          <Link href={`/knowledge-inbox/${question.id}`} className="font-semibold text-teal-800 underline">{question.prompt}</Link>
          <p className="mt-2 text-xs text-slate-500">{question.batch ? `Batch ${question.batch}` : 'Across batches'} · {question.status.replace('_', ' ')} · {question.answer_count ?? 0} written response(s)</p>
        </li>)}</ul>}
    </section>
  </div>
}
