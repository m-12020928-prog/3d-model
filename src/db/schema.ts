export * from './auth-schema'
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

// 匿名参观凭证仅关联盖章记录，不保存身份、答案或反馈。
export const visitorPassportStamps = sqliteTable('visitor_passport_stamps', {
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  visitedAt: text('visited_at').notNull(),
}, table => [index('visitor_passport_owner').on(table.visitorId)])
