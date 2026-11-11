/**
 * Daily jobs: due deletions (GA-42) + founding ends-soon (GA-22).
 * Invoke: POST /api/internal/cron with header X-Cron-Secret, or:
 *   CRON_SECRET=… node scripts/scheduler.mjs
 */
import { runDueDeletions } from './deletion-handlers.mjs'
import { runFoundingEndsSoonJob } from './founding-email.mjs'

export async function runScheduledJobs() {
  const deletions = await runDueDeletions()
  const founding = await runFoundingEndsSoonJob()
  return {
    ok: true,
    when: new Date().toISOString(),
    deletions,
    founding,
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('scheduler.mjs')
if (isMain) {
  runScheduledJobs()
    .then((r) => {
      console.log(JSON.stringify(r))
      process.exit(0)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
