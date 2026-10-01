// A production server refuses to start with settings that would leave it
// broken or unsafe (see server/utils/production-config.ts).
import { checkProductionConfig } from '../utils/production-config'

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  const { errors, warnings } = checkProductionConfig(process.env)
  for (const warning of warnings) {
    console.warn(`[trimly] ${warning}`)
  }
  if (errors.length) {
    throw new Error(`Trimly cannot start in production:\n- ${errors.join('\n- ')}`)
  }
})
