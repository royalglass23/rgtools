import 'server-only'
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

export type InboxQuestion = {
  id: string
  prompt: string
  batch: number | null
  graph_nodes: string[]
  context: string
  status: 'open' | 'answered' | 'needs_owner' | 'closed'
  answer_count?: number
  answers?: InboxAnswer[]
}

export type InboxAnswer = {
  id: string
  answer: string
  source_refs: string
  exceptions: string
  referred_to: string
  submitted_by: string
  submitted_at: string
  review_status: string
  review_note: string
}

const nodeIds = new Set('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC AD'.split(' '))
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function database() {
  const url = process.env.RG_BRAIN_INBOX_DATABASE_URL
  if (!url) throw new Error('Knowledge inbox database is not configured')
  return neon(url)
}

function bounded(value: string, name: string, max: number, required = false): string {
  const text = value.trim()
  if ((required && !text) || text.length > max) throw new Error(`Invalid ${name}`)
  return text
}

function noCustomerIdentifiers(value: string) {
  if (/\b[A-Z]\d{6}\b/i.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) {
    throw new Error('Remove Job numbers and email addresses')
  }
}

export async function listInboxQuestions() {
  const sql = database()
  const rows = await sql`SELECT q.id, q.prompt, q.batch, q.graph_nodes, q.context, q.status,
    q.created_by, q.created_at, q.updated_at,
    (SELECT count(*)::int FROM knowledge_answers a WHERE a.question_id = q.id) AS answer_count
    FROM knowledge_questions q ORDER BY CASE q.status WHEN 'open' THEN 0 WHEN 'needs_owner' THEN 1 WHEN 'answered' THEN 2 ELSE 3 END,
    q.batch NULLS FIRST, q.created_at, q.id LIMIT 100`
  return { questions: rows as unknown as InboxQuestion[] }
}

export async function getInboxQuestion(id: string) {
  if (!uuidPattern.test(id)) throw new Error('Invalid question')
  const sql = database()
  const questions = await sql`SELECT id, prompt, batch, graph_nodes, context, status, created_by, created_at, updated_at
    FROM knowledge_questions WHERE id = ${id}::uuid`
  if (!questions[0]) throw new Error('Question unavailable')
  const answers = await sql`SELECT id, answer, source_refs, exceptions, referred_to, submitted_by,
    submitted_at, review_status, review_note FROM knowledge_answers WHERE question_id = ${id}::uuid
    ORDER BY submitted_at, id`
  return { ...questions[0], answers } as unknown as InboxQuestion
}

export async function createInboxQuestion(actorId: string, payload: { prompt: string; batch: number | null; graph_nodes: string[]; context: string }) {
  const prompt = bounded(payload.prompt, 'question', 2000, true)
  if (prompt.length < 10) throw new Error('Question must be at least 10 characters')
  const context = bounded(payload.context, 'context', 3000)
  noCustomerIdentifiers(`${prompt} ${context}`)
  if (payload.batch !== null && (!Number.isInteger(payload.batch) || payload.batch < 1 || payload.batch > 7)) throw new Error('Invalid batch')
  if (payload.graph_nodes.length > 10 || payload.graph_nodes.some((node) => !nodeIds.has(node))) throw new Error('Invalid graph nodes')
  const nodes = [...new Set(payload.graph_nodes)]
  const id = randomUUID()
  const sql = database()
  const rows = await sql`INSERT INTO knowledge_questions (id, prompt, batch, graph_nodes, context, created_by)
    VALUES (${id}::uuid, ${prompt}, ${payload.batch}, ${nodes}::text[], ${context}, ${bounded(actorId, 'actor', 160, true)})
    RETURNING id, prompt, batch, graph_nodes, context, status, created_by, created_at`
  return rows[0] as InboxQuestion
}

export async function submitInboxAnswer(actorId: string, id: string, payload: { answer: string; source_refs: string; exceptions: string; referred_to: string }) {
  if (!uuidPattern.test(id)) throw new Error('Invalid question')
  const answer = bounded(payload.answer, 'answer', 10000, true)
  const sourceRefs = bounded(payload.source_refs, 'source references', 3000)
  const exceptions = bounded(payload.exceptions, 'exceptions', 3000)
  const referredTo = bounded(payload.referred_to, 'referral', 160)
  noCustomerIdentifiers(`${answer} ${sourceRefs} ${exceptions}`)
  const submittedBy = bounded(actorId, 'actor', 160, true)
  const answerId = randomUUID()
  const nextStatus = referredTo ? 'needs_owner' : 'answered'
  const sql = database()
  const rows = await sql`WITH claim AS (
    UPDATE knowledge_questions SET status = ${nextStatus}, updated_at = now()
    WHERE id = ${id}::uuid AND status IN ('open', 'needs_owner') RETURNING id
  )
  INSERT INTO knowledge_answers (id, question_id, answer, source_refs, exceptions, referred_to, submitted_by)
  SELECT ${answerId}::uuid, claim.id, ${answer}, ${sourceRefs}, ${exceptions}, ${referredTo}, ${submittedBy} FROM claim
  RETURNING id, question_id, answer, source_refs, exceptions, referred_to, submitted_by, submitted_at, review_status`
  if (!rows[0]) throw new Error('Question is no longer open')
  return rows[0] as InboxAnswer
}

export async function reviewInboxAnswer(actorId: string, id: string, payload: { status: string; note: string }) {
  if (!uuidPattern.test(id)) throw new Error('Invalid answer')
  if (!['needs_clarification', 'verified_for_drafting', 'rejected'].includes(payload.status)) throw new Error('Invalid review status')
  const note = bounded(payload.note, 'review note', 3000)
  const reviewedBy = bounded(actorId, 'actor', 160, true)
  const sql = database()
  const rows = await sql`UPDATE knowledge_answers SET review_status = ${payload.status}, review_note = ${note},
    reviewed_by = ${reviewedBy}, reviewed_at = now()
    WHERE id = ${id}::uuid AND review_status = 'pending'
    RETURNING id, question_id, review_status, review_note, reviewed_by, reviewed_at`
  if (!rows[0]) throw new Error('Answer is no longer pending review')
  return rows[0] as InboxAnswer
}
