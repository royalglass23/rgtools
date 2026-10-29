import { readKnowledgeInvite } from '@/modules/knowledge-inbox/invite'
import { getInboxQuestion } from '@/modules/knowledge-inbox/client'
import { submitInvitedAnswerAction } from '@/modules/knowledge-inbox/invite-actions'

export const dynamic = 'force-dynamic'

export default async function KnowledgeResponsePage({ searchParams }: {
  searchParams: Promise<{ token?: string; saved?: string }>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const invite = readKnowledgeInvite(token)
  if (!invite) return <main className="mx-auto max-w-2xl p-6 sm:p-10">
    <h1 className="text-2xl font-semibold">This response link is unavailable</h1>
    <p className="mt-3 text-sm text-slate-600">It may have expired. Please ask the Royal Glass team for a new link.</p>
  </main>
  let questions
  try {
    questions = await Promise.all(invite.ids.map((id) => getInboxQuestion(id)))
  } catch {
    return <main className="mx-auto max-w-2xl p-6 sm:p-10">
      <h1 className="text-2xl font-semibold">Questions are unavailable</h1>
      <p className="mt-3 text-sm text-slate-600">Please try again later. No response was saved.</p>
    </main>
  }
  const open = questions.filter((question) => question.status === 'open')
  return <main className="mx-auto w-full max-w-3xl space-y-7 p-6 sm:p-10">
    <header>
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Royal Glass · Process guidance</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Your written answers</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Please answer whichever questions you can. Short notes or the name of a current checklist are enough. If someone else owns a decision, tell us who. Leave customer names, email addresses and Job numbers out of the answers.</p>
      <p className="mt-2 text-sm text-slate-600">Answers are saved for review before agents can use them as Royal Glass guidance.</p>
    </header>
    {params.saved === '1' && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-4 text-sm">Thank you. Your response was saved. You can continue with the remaining questions.</p>}
    {open.length === 0 ? <section className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">All questions in this link have responses</h2>
      <p className="mt-2 text-sm text-slate-600">Thank you for writing them down. The Royal Glass team will review them.</p>
    </section> : open.map((question, index) => <section key={question.id} className="rounded border border-slate-200 bg-white p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {index + 1} of {open.length}</p>
      <h2 className="mt-2 text-lg font-semibold text-slate-950">{question.prompt}</h2>
      <form action={submitInvitedAnswerAction} className="mt-5 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="question_id" value={question.id} />
        <label className="grid gap-1 text-sm font-medium">Your answer
          <textarea name="answer" required maxLength={10000} rows={6} className="rounded border border-slate-300 p-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Current document or checklist (optional)
          <textarea name="source_refs" maxLength={3000} rows={2} className="rounded border border-slate-300 p-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Exceptions or things you are unsure about (optional)
          <textarea name="exceptions" maxLength={3000} rows={2} className="rounded border border-slate-300 p-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">If someone else decides this, who? (optional)
          <input name="referred_to" maxLength={160} className="rounded border border-slate-300 p-3" />
        </label>
        <button type="submit" className="w-fit rounded bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white">Save this answer</button>
      </form>
    </section>)}
  </main>
}
