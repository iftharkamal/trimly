// A production server refuses to start with settings that would leave it
// broken or unsafe (see server/utils/production-config.ts). Skipped under
// `nuxt dev` and in the API test build (both fixed at build time).
import { DEV_SMS_ALLOWED } from '../services/sms/dev-sms'
import { checkProductionConfig } from '../utils/production-config'

export default defineNitroPlugin(() => {
  if (DEV_SMS_ALLOWED) {
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
