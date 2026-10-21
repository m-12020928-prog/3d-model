import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { visitorPassportStamps } from '@/db/schema'
import { passportChapters } from '@/content/visitor-experiences'

const cookieName = 'smkkb_visit_passport'
function visitorId(create: boolean): string {
  const existing = getCookie(cookieName)
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing
  if (!create) throw new Error('Your passport could not be opened. Allow site cookies and reopen the passport to try again.')
  const id = crypto.randomUUID()
  const preview = process.env.MONSTARX_PREVIEW === '1'
  setCookie(cookieName, id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 180, sameSite: preview ? 'none' : 'lax', secure: preview || process.env.NODE_ENV === 'production', partitioned: preview })
  return id
}

export const openPassport = createServerFn({ method: 'POST' }).handler(async () => {
  const id = visitorId(true)
  const db = await getDb()
  const rows = await db.select({ chapterId: visitorPassportStamps.chapterId }).from(visitorPassportStamps).where(eq(visitorPassportStamps.visitorId, id))
  return { visited: rows.map(row => row.chapterId) }
})

export const stampChapter = createServerFn({ method: 'POST' })
  .validator((input: { chapterId: string }) => {
    if (!passportChapters.some(chapter => chapter.id === input.chapterId)) throw new Error('This chapter is not part of the passport.')
    return { chapterId: input.chapterId }
  }).handler(async ({ data }) => {
    const id = visitorId(false)
    const db = await getDb()
    await db.insert(visitorPassportStamps).values({ id: `${id}:${data.chapterId}`, visitorId: id, chapterId: data.chapterId, visitedAt: new Date().toISOString() }).onConflictDoNothing()
    return { chapterId: data.chapterId }
  })
