import { request, readLocal, writeLocal } from '../lib/api.js'
import { escapeHtml } from '../lib/html.js'
import { calculateAllowance, models, chosenMaterialIds } from '../data/planning.js'
import { downloadText } from '../lib/download.js'
import { formatMoney } from '../data/discovery.js'
import { enquiryStatusLabel } from '../data/enquiries.js'

export function planPayload(state) {
  return { furnitureType: state.estimator.furniture, quantity: state.estimator.quantity, tier: state.estimator.tier, pattern: Boolean(state.estimator.pattern) }
}

export function savePlanDraft(state) {
  writeLocal('uw-plan-draft', { ...state.estimator, updatedAt: new Date().toISOString() })
}

export function bindProjects({ state, materials, notify, signal }) {
  const form = document.querySelector('#project-save-form')
  let projectSubmission
  form?.addEventListener('submit', async event => {
    event.preventDefault()
    const quantity = document.querySelector('#estimate-quantity')
    if (quantity && !quantity.reportValidity()) return
    const button = form.querySelector('[type=submit]')
    const status = form.querySelector('[role=status]')
    button.disabled = true; button.textContent = 'Saving your brief…'; status.textContent = ''
    try {
      const fields = new FormData(form)
      const body = { ...planPayload(state), name: fields.get('name'), notes: fields.get('notes'), materialIds: [...chosenMaterialIds(state)] }
      const fingerprint = JSON.stringify(body)
      if (projectSubmission?.fingerprint !== fingerprint) projectSubmission = { fingerprint, key:crypto.randomUUID() }
      const project = await request(state.estimator.projectId ? `/api/projects/${state.estimator.projectId}` : '/api/projects', { method:state.estimator.projectId ? 'PUT' : 'POST', body, headers:{ 'Idempotency-Key':projectSubmission.key } })
      state.estimator.projectId = project.id
      state.estimator.materialIds = project.materialIds
      savePlanDraft(state)
      const projects = readLocal('uw-projects', [])
      writeLocal('uw-projects', [project, ...(Array.isArray(projects) ? projects : []).filter(item => item.id !== project.id)])
      status.textContent = 'Brief saved. You can find it in My showroom.'
      notify('Your project brief is saved.')
    } catch (error) {
      if (error.status === 404) { state.estimator.projectId = ''; savePlanDraft(state); status.textContent = 'That brief is no longer available. Your changes are still here; save a new copy.' }
      else status.textContent = error.message
    }
    finally { button.disabled = false; button.textContent = state.estimator.projectId ? 'Save project changes ↗' : 'Save project brief ↗' }
  }, { signal })

  document.querySelector('[data-download-brief]')?.addEventListener('click', () => {
    const allowance = calculateAllowance(planPayload(state))
    const fields = form ? new FormData(form) : null
    downloadText('upholstery-project-brief.txt', `UPHOLSTERY WAREHOUSE / PROJECT BRIEF\n\n${fields?.get('name') || 'My upholstery project'}\nFurniture: ${models[state.estimator.furniture][0]}\nPieces: ${state.estimator.quantity}\nDirection: ${state.estimator.tier}\nPattern matching: ${allowance.pattern ? 'Yes' : 'No'}\nIndicative fabric allowance: ${allowance.low}–${allowance.high} m at 140 cm width\n\nChosen materials:\n${chosenMaterialIds(state).map(id => materials.find(item => item.id === id)?.name).filter(Boolean).join('\n') || 'No materials selected yet.'}\n\nNotes: ${fields?.get('notes') || ''}\n\nFor planning only. Final usage, fabric specification, scope and pricing require assessment.`)
    notify('Project brief downloaded.')
  }, { signal })

  document.querySelector('[data-download-swatches]')?.addEventListener('click', () => {
    const chosen = materials.filter(item => state.swatches.includes(item.id))
    downloadText('upholstery-swatch-book.txt', `UPHOLSTERY WAREHOUSE / MY SWATCH BOOK\n\n${chosen.map(item => `${item.name} / ${item.shade}\nFeel: ${item.feel}\nExplore for: ${item.use}\nCare: ${item.care}\nConfirm: ${item.caution}`).join('\n\n')}\n\nScreen colours and surface studies are indicative. Confirm an exact physical sample before ordering.`)
    notify('Swatch book downloaded.')
  }, { signal })

  const contact = document.querySelector('#enquiry-form')
  let submission
  contact?.addEventListener('submit', async event => {
    event.preventDefault()
    const fields = new FormData(contact)
    const status = contact.querySelector('[role=status]')
    if (!String(fields.get('email') || '').trim() && !String(fields.get('phone') || '').trim()) {
      status.textContent = 'Add an email address or phone number so we can get in touch.'
      contact.querySelector('[name=email]').focus(); return
    }
    const button = contact.querySelector('[type=submit]')
    button.disabled = true; button.textContent = 'Saving your enquiry…'; status.textContent = ''
    try {
      const include = fields.get('include') === 'on'
      const body = {
        name: fields.get('name'), email: fields.get('email'), phone: fields.get('phone'), service: fields.get('service'), message: fields.get('message'), consent: fields.get('consent') === 'on', website: fields.get('website'),
        materialIds: include ? (readLocal('uw-plan-draft', null) ? chosenMaterialIds(state) : state.swatches) : [], furnitureLines: include ? state.cart.map(line => ({ id: line.id, quantity: line.quantity })) : [], plan: include && readLocal('uw-plan-draft', null) ? planPayload(state) : null,
      }
      const fingerprint = JSON.stringify(body)
      if (submission?.fingerprint !== fingerprint) submission = { fingerprint, key: crypto.randomUUID() }
      const data = await request('/api/enquiries', { method: 'POST', body, headers: { 'Idempotency-Key': submission.key } })
      const receipts = readLocal('uw-enquiry-receipts', [])
      writeLocal('uw-enquiry-receipts', [data, ...(Array.isArray(receipts) ? receipts : []).filter(item => item.id !== data.id)].slice(0, 100))
      contact.innerHTML = `<div class="enquiry-success"><span aria-hidden="true">✓</span><p class="spec-label">YOUR NEXT CHAPTER STARTS HERE</p><h2>Enquiry received.</h2><p>Your enquiry has been saved for the workshop.</p><p class="enquiry-reference">Reference <strong>${escapeHtml(data.id.slice(0, 8).toUpperCase())}</strong></p><div class="enquiry-success-actions"><button class="button gold" type="button" data-download-receipt="${escapeHtml(data.id)}">Download receipt ↓</button><a class="button ghost" href="/profile.html#my-enquiries">View my showroom ↗</a></div></div>`
      contact.setAttribute('tabindex', '-1'); contact.focus()
    } catch (error) { status.textContent = error.message; button.disabled = false; button.textContent = 'Send project enquiry ↗' }
  }, { signal })

  const list = document.querySelector('#saved-projects')
  if (list) {
    const paint = projects => {
      list.innerHTML = projects.length ? projects.map(project => `<article class="saved-project"><div><span class="spec-label">${escapeHtml(project.quantity)} PIECE${project.quantity === 1 ? '' : 'S'} / ${escapeHtml(project.tier)}</span><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(models[project.furnitureType]?.[0] || project.furnitureType)} · ${escapeHtml(project.low)}–${escapeHtml(project.high)} m indicative</p>${project.notes ? `<p>${escapeHtml(project.notes)}</p>` : ''}</div><div><button type="button" data-open-project="${escapeHtml(project.id)}">Continue planning ↗</button><button type="button" data-delete-project="${escapeHtml(project.id)}">Delete brief</button></div></article>`).join('') : '<p class="quiet-empty">Your saved briefs will appear here. Start in the project planner.</p>'
      list._projects = projects
    }
    const local = readLocal('uw-projects', [])
    paint(Array.isArray(local) ? local : [])
    request('/api/projects', { signal }).then(projects => { if (signal.aborted) return; writeLocal('uw-projects', projects); paint(projects) }).catch(() => {
      if (signal.aborted) return
      const status = document.querySelector('#project-sync-status')
      if (status) status.textContent = 'Showing briefs saved on this device. Connect to refresh.'
    })
    list.addEventListener('click', async event => {
      const open = event.target.closest('[data-open-project]')
      if (open) {
        const project = list._projects.find(item => item.id === open.dataset.openProject)
        writeLocal('uw-plan-draft', { projectId:project.id, furniture: project.furnitureType, quantity: project.quantity, tier: project.tier, pattern: project.pattern, name: project.name, notes: project.notes, materialIds:project.materialIds || [] })
        window.location.href = '/estimator.html'; return
      }
      const remove = event.target.closest('[data-delete-project]')
      if (!remove) return
      if (!remove.dataset.confirmDelete) {
        remove.dataset.confirmDelete = 'true'; remove.textContent = 'Confirm delete'
        window.setTimeout(() => { if (remove.isConnected) { delete remove.dataset.confirmDelete; remove.textContent = 'Delete brief' } }, 5000)
        return
      }
      remove.disabled = true
      try {
        await request(`/api/projects/${remove.dataset.deleteProject}`, { method: 'DELETE' })
        const projects = list._projects.filter(item => item.id !== remove.dataset.deleteProject)
        writeLocal('uw-projects', projects); paint(projects); notify('Project brief deleted.')
      } catch (error) { remove.disabled = false; notify(error.message) }
    }, { signal })
  }

  document.querySelector('#planner-material-picks')?.addEventListener('change', event => {
    const input = event.target.closest('[data-plan-material]')
    if (!input) return
    const selected = [...chosenMaterialIds(state)]
    if (input.checked && selected.length >= 8) { input.checked = false; notify('Choose up to eight material directions for a brief.'); return }
    state.estimator.materialIds = input.checked ? [...new Set([...selected, input.dataset.planMaterial])] : selected.filter(id => id !== input.dataset.planMaterial)
    document.querySelector('[data-estimate-material-count]').textContent = state.estimator.materialIds.length
    savePlanDraft(state)
  }, { signal })

  const enquiries = document.querySelector('#saved-enquiries')
  if (enquiries) {
    const paint = receipts => {
      enquiries.innerHTML = receipts.length ? receipts.map(receipt => `<article class="receipt-card"><div><span class="spec-label">${escapeHtml(enquiryStatusLabel(receipt.status).toUpperCase())} / ${escapeHtml(new Date(receipt.createdAt).toLocaleDateString('en-ZA', { day:'numeric',month:'long',year:'numeric' }))}</span><h3>${escapeHtml(receipt.service || 'Project enquiry')}</h3><p>${receipt.materialIds?.length || 0} material direction${receipt.materialIds?.length === 1 ? '' : 's'} · ${(receipt.furnitureLines || []).reduce((sum,line) => sum + line.quantity, 0)} furniture pieces${receipt.plan ? ' · Project plan included' : ''}</p><span class="receipt-reference">Reference ${escapeHtml(receipt.id.slice(0, 8).toUpperCase())}</span></div><button class="text-link" type="button" data-download-receipt="${escapeHtml(receipt.id)}">Download receipt ↓</button></article>`).join('') : '<div class="store-empty"><h3>A conversation waiting to happen.</h3><p>Your enquiry receipts will be kept here when you contact the workshop.</p><a class="text-link" href="/contact.html">Start a conversation ↗</a></div>'
    }
    const local = readLocal('uw-enquiry-receipts', [])
    paint(Array.isArray(local) ? local : [])
    request('/api/enquiries', { signal }).then(receipts => { if (signal.aborted) return; writeLocal('uw-enquiry-receipts', receipts); paint(receipts) }).catch(() => {
      if (signal.aborted) return
      document.querySelector('#enquiry-sync-status').textContent = 'Showing receipts saved on this browser. Reconnect to refresh.'
    })
  }
  document.querySelector('#app').addEventListener('click', event => {
    const button = event.target.closest('[data-download-receipt]')
    if (!button) return
    const receipts = readLocal('uw-enquiry-receipts', [])
    const receipt = Array.isArray(receipts) && receipts.find(item => item.id === button.dataset.downloadReceipt)
    if (!receipt) { notify('Reconnect and refresh My showroom to retrieve this receipt.'); return }
    const reference = receipt.id.slice(0, 8).toUpperCase()
    downloadText(`uw-enquiry-${reference}.txt`, `UPHOLSTERY WAREHOUSE / ENQUIRY RECEIPT\n\nReference: ${reference}\nReceived: ${new Date(receipt.createdAt).toLocaleString('en-ZA')}\nService: ${receipt.service}\nStatus: ${enquiryStatusLabel(receipt.status)}\n\nMaterial directions:\n${(receipt.materialIds || []).map(id => materials.find(item => item.id === id)?.name).filter(Boolean).join('\n') || 'No materials attached.'}\n\nFurniture selection:\n${(receipt.furnitureLines || []).map(line => `${line.quantity} × ${line.name} / ${formatMoney(line.lineTotal)} reference`).join('\n') || 'No furniture attached.'}\n${receipt.plan ? `\nProject plan: ${models[receipt.plan.furnitureType]?.[0]} / ${receipt.plan.quantity} pieces / ${receipt.plan.low}–${receipt.plan.high} m indicative\n` : ''}\nThis receipt confirms the saved enquiry. It is not an order, reservation or appointment. Final project scope and exact specifications are confirmed in consultation.`)
    notify('Your enquiry receipt is downloaded.')
  }, { signal })
}
