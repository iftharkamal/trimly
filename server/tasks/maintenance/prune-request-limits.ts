// Hourly: drop request-limit counters whose window has ended.
import { pruneRequestLimits } from '../../services/request-limit.service'

export default defineTask({
  meta: {
    name: 'maintenance:prune-request-limits',
    description: 'Delete expired request-limit counters'
  },
  async run() {
    return { result: { removed: await pruneRequestLimits() } }
  }
})
