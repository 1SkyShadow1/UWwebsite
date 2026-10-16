import { shopProducts } from './shop-products.js'

export const shoppingLimits = Object.freeze({ lines: 50, quantity: 99, operations: 50 })
const products = new Map(shopProducts.map(item => [item.id, item]))
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i

export function validateSelection({ cart = [], wishlist = [] } = {}) {
  if (!Array.isArray(cart) || !Array.isArray(wishlist) || cart.length > shoppingLimits.lines || wishlist.length > shoppingLimits.lines) throw new Error('Your selection contains too many pieces.')
  const seen = new Set()
  const lines = cart.map(line => {
    if (!line || !products.has(line.id) || seen.has(line.id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > shoppingLimits.quantity) throw new Error('Choose a known piece and a quantity from 1 to 99.')
    seen.add(line.id)
    return { id: line.id, quantity: line.quantity }
  })
  if (wishlist.some(id => !products.has(id))) throw new Error('Your favourites contain an unknown piece.')
  return { cart: lines, wishlist: [...new Set(wishlist)] }
}

export function validateShoppingOperations(operations) {
  if (!Array.isArray(operations) || !operations.length || operations.length > shoppingLimits.operations) throw new Error('Send between 1 and 50 selection changes.')
  return operations.map(operation => {
    if (!operation || typeof operation.mutationId !== 'string' || !uuid.test(operation.mutationId) || !products.has(operation.productId)) throw new Error('A selection change needs a valid reference and piece.')
    if ((operation.type === 'quantity' && Number.isInteger(operation.value) && operation.value >= 0 && operation.value <= shoppingLimits.quantity) || (operation.type === 'delta' && Number.isInteger(operation.value) && operation.value !== 0 && Math.abs(operation.value) <= shoppingLimits.quantity) || (operation.type === 'favourite' && typeof operation.value === 'boolean')) {
      return { mutationId: operation.mutationId, productId: operation.productId, type: operation.type, value: operation.value }
    }
    throw new Error('Choose a valid quantity or favourite setting.')
  })
}

export function applyShoppingOperations(selection, operations) {
  const current = validateSelection(selection)
  const cart = new Map(current.cart.map(line => [line.id, line.quantity]))
  const wishlist = new Set(current.wishlist)
  for (const operation of operations) {
    if (operation.type === 'quantity' || operation.type === 'delta') {
      const quantity = operation.type === 'delta' ? Math.max(0, (cart.get(operation.productId) || 0) + operation.value) : operation.value
      if (quantity > shoppingLimits.quantity) throw new Error('Choose up to 99 of each piece for your selection.')
      if (quantity) cart.set(operation.productId, quantity)
      else cart.delete(operation.productId)
    } else if (operation.value) wishlist.add(operation.productId)
    else wishlist.delete(operation.productId)
  }
  return validateSelection({ cart: [...cart].map(([id, quantity]) => ({ id, quantity })), wishlist: [...wishlist] })
}

export function selectionDetails(selection) {
  const { cart } = validateSelection(selection)
  const lines = cart.map(line => {
    const item = products.get(line.id)
    return { id: line.id, quantity: line.quantity, name: item.name, supplier: item.supplier, unitPrice: item.price, lineTotal: item.price * line.quantity }
  })
  return { lines, currency: 'ZAR', units: lines.reduce((sum, line) => sum + line.quantity, 0), subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0) }
}
