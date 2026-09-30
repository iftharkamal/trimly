import type { ReportPeriod } from '#shared/constants'
import type { ApiSuccess } from '#shared/types/queue'
import type { ReportDto } from '#shared/types/report'

/** A report for the period containing `date` (default: today in shop time). */
export async function useReport(
  period: MaybeRefOrGetter<ReportPeriod>,
  date: MaybeRefOrGetter<string | undefined>
) {
  // Forwards the session cookie during the server render.
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `report:${toValue(period)}:${toValue(date) ?? 'current'}`,
    async () => {
      const selectedDate = toValue(date)
      const response = await requestFetch<ApiSuccess<ReportDto>>('/api/reports', {
        query: { period: toValue(period), ...(selectedDate ? { date: selectedDate } : {}) }
      })
      return response.data
    }
  )

  await asyncData
  const { data, status, error, refresh } = asyncData
  return { report: data, status, error, refresh }
}
