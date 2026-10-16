export const enquiryStatuses = Object.freeze({ received: 'Received', reviewing: 'Being reviewed', 'in-conversation': 'In conversation', closed: 'Closed' })

export const enquiryStatusLabel = status => Object.hasOwn(enquiryStatuses, status) ? enquiryStatuses[status] : 'Received'
