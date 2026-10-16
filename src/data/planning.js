// One planning model shared by the browser and API. Allowances are illustrative,
// in linear metres of 140 cm fabric, and never represent a workshop quotation.
export const models = {
  chesterfield: ['Chesterfield sofa', '17.3', 'Deep button', 'sofa'],
  wingback: ['Wingback chair', '5.2', 'Fluted back', 'wingback'],
  sectional: ['Modular sectional', '18.6', 'Double welt', 'sectional'],
  ottoman: ['Upholstered ottoman', '3.1', 'Tufted grid', 'ottoman'],
  'apartment-sofa': ['Apartment sofa', '12.0', 'Compact silhouette', 'sofa'],
  loveseat: ['Two-seat loveseat', '13.0', 'Two-seat form', 'sofa'],
  chaise: ['Chaise lounge', '11.0', 'Extended seat', 'chaise'],
  'club-chair': ['Club chair', '6.0', 'Rounded arms', 'chair'],
  'tub-chair': ['Tub chair', '5.0', 'Curved back', 'tub'],
  'slipper-chair': ['Slipper chair', '4.5', 'Armless profile', 'slipper'],
  'accent-chair': ['Accent chair', '6.0', 'Statement form', 'chair'],
  'dining-chair': ['Dining chair', '1.5', 'Compact seat', 'dining'],
  'dining-bench': ['Dining bench', '5.0', 'Long seat', 'bench'],
  headboard: ['Upholstered headboard', '3.0', 'Panel form', 'headboard'],
  footstool: ['Tufted footstool', '2.5', 'Small accent', 'ottoman'],
}

export const serviceOptions = ['Reupholstery & repair', 'Custom furniture', 'Commercial project', 'Materials & samples', 'Furniture selection', 'Something else']
export const tiers = ['everyday', 'artisan', 'heritage']

export function calculateAllowance({ furnitureType, quantity, pattern = false }) {
  if (!Object.hasOwn(models, furnitureType) || !Number.isInteger(quantity) || quantity < 1 || quantity > 12 || typeof pattern !== 'boolean') {
    throw new RangeError('Choose a furniture type and between 1 and 12 whole pieces.')
  }
  const metres = Number((Number(models[furnitureType][1]) * quantity * (pattern ? 1.2 : 1)).toFixed(1))
  return { metres, low: Number((metres * 0.85).toFixed(1)), high: Number((metres * 1.15).toFixed(1)), widthCm: 140, pattern, quantity, furnitureType }
}

export function chosenMaterialIds(state) {
  return Array.isArray(state.estimator.materialIds) ? state.estimator.materialIds : state.swatches
}
