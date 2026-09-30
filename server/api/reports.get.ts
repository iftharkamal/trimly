import { reportQuerySchema } from '../../shared/schemas/report'
import type { ReportDto } from '../../shared/types/report'
import { getReport } from '../services/reports/report.service'

// Shop owner only: ?period=day|week|month&date=YYYY-MM-DD (any date in the period).
export default defineApiHandler(async (event): Promise<ReportDto> => {
  const { shopId } = await requireShopOwner(event)
  const { period, date } = parseQuery(event, reportQuerySchema)
  return getReport(shopId, period, date)
})
