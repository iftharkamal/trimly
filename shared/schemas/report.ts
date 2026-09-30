import { z } from 'zod'
import { REPORT_PERIODS } from '../constants'

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.toISOString().slice(0, 10) === value
}

export const reportQuerySchema = z.strictObject({
  period: z.enum(REPORT_PERIODS).default('day'),
  // Any date inside the wanted period, in the shop's timezone. Default: today.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-30')
    .refine(isCalendarDate, 'Not a real date')
    .optional()
})

export type ReportQuery = z.infer<typeof reportQuerySchema>
