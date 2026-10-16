import { enquiryStatuses } from '../src/data/enquiries.js'

export function receiptFor(enquiry) {
  return { id: enquiry.id, service: enquiry.service, status: enquiry.status, createdAt: enquiry.createdAt, updatedAt: enquiry.updatedAt || enquiry.createdAt, materialIds: enquiry.materialIds, furnitureLines: enquiry.furnitureLines || [], plan: enquiry.plan, history: enquiry.history || [{ status:'received', at:enquiry.createdAt }] }
}

// Operator-only: this module is used from the host CLI, never a public route.
export function setEnquiryStatus(database, id, status) {
  if (!Object.hasOwn(enquiryStatuses, status)) throw new Error(`Choose a status: ${Object.keys(enquiryStatuses).join(', ')}.`)
  const record = database.getRecord('enquiry', id)
  if (!record) throw new Error('Enquiry not found.')
  if (record.payload.status === status) return record.payload
  const updatedAt = new Date().toISOString()
  const data = { ...record.payload, status, updatedAt, history: [...(record.payload.history || [{ status:'received', at:record.payload.createdAt }]), { status, at:updatedAt }].slice(-20) }
  database.put('enquiry', id, record.owner, data)
  return data
}
