import { z } from 'zod'

/** "HH:MM", 24-hour. */
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 09:30')

const rangeSchema = z
  .strictObject({ opens: timeSchema, closes: timeSchema })
  .refine(range => range.opens < range.closes, { message: 'Must close after it opens', path: ['closes'] })

const daySchema = z
  .strictObject({
    // ISO weekday: 1 = Monday … 7 = Sunday.
    weekday: z.int().min(1).max(7),
    // Empty = closed. At most two ranges (e.g. around a lunch break).
    ranges: z.array(rangeSchema).max(2)
  })
  .refine(
    day => day.ranges.every((range, index) => index === 0 || day.ranges[index - 1]!.closes <= range.opens),
    { message: 'Ranges must be in order and not overlap', path: ['ranges'] }
  )

export const openingHoursSchema = z
  .strictObject({ days: z.array(daySchema).length(7) })
  .refine(
    hours => new Set(hours.days.map(day => day.weekday)).size === 7,
    { message: 'Give each weekday exactly once', path: ['days'] }
  )

export type OpeningHours = z.infer<typeof openingHoursSchema>
