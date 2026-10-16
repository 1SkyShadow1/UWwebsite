// Run on the server host. The database is never part of the public website.
import { openDatabase } from '../server/database.mjs'
import { setEnquiryStatus } from '../server/enquiries.mjs'
import { enquiryStatuses } from '../src/data/enquiries.js'

const db = openDatabase()
try {
  const args = process.argv.slice(2)
  if (args[0] === '--set-status') {
    if (args.length !== 3) throw new Error('Usage: npm run inbox -- --set-status <enquiry-id> <status>')
    const data = setEnquiryStatus(db, args[1], args[2])
    console.log(`Enquiry ${data.id}: ${enquiryStatuses[data.status]}`)
  } else {
    if (args.length && (args[0] !== '--status' || args.length !== 2 || !Object.hasOwn(enquiryStatuses, args[1]))) throw new Error('Usage: npm run inbox -- [--status received|reviewing|in-conversation|closed]')
    const enquiries = db.listAll('enquiry').filter(item => !args.length || item.status === args[1])
    if (!enquiries.length) console.log('No project enquiries match this view.')
    else console.log(JSON.stringify(enquiries, null, 2))
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { db.close() }
