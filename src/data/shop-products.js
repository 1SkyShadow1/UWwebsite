const hertex = handle => `https://hertexhaus.co.za/products/${handle}`


const product = (id, name, category, price, handle, image, options = {}) => ({
  id,
  name,
  category,
  price,
  sourceUrl: hertex(handle),
  image: `/assets/products/${id}.webp`,
  supplier: 'Hertex HAUS',
  availability: 'Supplier availability',
  leadTime: 'Confirm with supplier',
  material: 'See supplier specification',
  badge: 'CURATED',
  ...options,
})

export const shopProducts = [
  product('alessio-corner', 'Alessio Corner Sofa', 'Sofas', 58800, 'alessio-corner-sofa-in-mesopotamia-driftwood', '/assets/library/furniture/modular-sectional.jpeg', { badge: 'NEW', material: 'Textured upholstery', description: 'A deep, architectural corner sofa designed for relaxed, room-defining comfort.' }),
  product('alessio-three', 'Alessio Sofa 3-Seater', 'Sofas', 27600, 'alessio-sofa-3-seater-in-mesopotamia-driftwood', '/assets/library/furniture/three-seat-sofa.jpeg', { badge: 'NEW', material: 'Textured upholstery', description: 'Generous proportions, low lines and a calm three-seat silhouette.' }),
  product('blanche-four', 'Blanche Sofa 4-Seater', 'Sofas', 26600, 'blanche-sofa-4-seater-anatolia-driftwood', '/assets/library/furniture/apartment-sofa.jpeg', { badge: 'NEW', material: 'Performance textile', description: 'An expansive four-seater with tailored edges and an easy lounge profile.' }),
  product('gianni-leather', 'Gianni Leather Sofa 3-Seater', 'Sofas', 33000, 'gianni-leather-sofa-3-seater-in-mocha', '/assets/library/furniture/chesterfield-sofa.jpeg', { badge: 'EDITOR\'S PICK', material: 'Leather', description: 'Warm leather character shaped into a clean, contemporary three-seat form.' }),
  product('noah-modular', 'Noah Modular Sofa', 'Outdoor', 44500, 'noah-modular-sofa-oyster', '/assets/library/furniture/modular-sectional.jpeg', { badge: 'NEW', material: 'Woven upholstery', description: 'A flexible modular composition made for large, social living spaces.' }),
  product('porter-two', 'Porter Sofa 2-Seater', 'Sofas', 21800, 'porter-sofa-2-seater-in-demerara', '/assets/library/furniture/loveseat-alt.jpeg', { material: 'Woven upholstery', description: 'A compact two-seat sofa with a relaxed stance for apartments and quiet corners.' }),
  product('sia-outdoor-sofa', 'Sia Outdoor Sofa 4-Seater', 'Outdoor', 39200, 'sia-outdoor-sofa-4-seater-bronze', '/assets/library/furniture/modular-sectional.jpeg', { badge: 'OUTDOOR', material: 'Outdoor performance textile', description: 'Substantial open-air seating with a sophisticated indoor level of comfort.' }),
  product('kyoto-teak-sofa', 'Kyoto Teak Sofa 3-Seater', 'Outdoor', 47600, 'kyoto-teak-sofa-3-seater', '/assets/library/furniture/three-seat-sofa.jpeg', { badge: 'DESIGN ICON', material: 'Teak and outdoor textile', description: 'A teak-framed outdoor sofa balancing clean craft with deep cushions.' }),
  product('swedish-nightstand', 'Swedish Nightstand', 'Tables & storage', 3900, 'swedish-nightstand-in-nutmeg', '/assets/library/furniture/bed-end-bench.jpeg', { badge: 'BEST SELLER', material: 'Timber', description: 'A compact bedside piece offered in warm Nutmeg and graphic Onyx finishes.' }),
  product('boulder-stool', 'Boulder Stool', 'Stools & ottomans', 2300, 'boulder-stool-1', '/assets/library/furniture/ottoman-pouf.jpeg', { badge: 'BEST SELLER', material: 'Upholstered pouf', description: 'A soft, useful accent offered in four earthy Diesel colourways.' }),
  product('abigail-bed', 'Abigail Floating Bed', 'Bedroom', 12900, 'abigail-floating-bed-in-pristine-cafe-au-lait', '/assets/library/furniture/upholstered-headboard.jpeg', { badge: 'BEST SELLER', material: 'Wood frame and upholstered headboard', description: 'A low wooden bed frame with a softly upholstered headboard and a floating stance.' }),
  product('fjord-bed', 'Fjord Oak Bed', 'Bedroom', 19600, 'fjord-oak-bed-queen-in-natura', '/assets/library/furniture/upholstered-headboard.jpeg', { material: 'Oak frame', description: 'A tactile oak bed that brings natural structure to a restful room.' }),
  product('aurora-headboard', 'Aurora Slipcover Headboard', 'Bedroom', 10400, 'aurora-slipcover-headboard-ghent-earth', '/assets/library/furniture/upholstered-headboard.jpeg', { material: 'Removable textile slipcover', description: 'A soft, relaxed headboard with a tailored slipcover in warm neutral tones.' }),
  product('zion-chair', 'Zion Outdoor Chair', 'Outdoor', 3200, 'zion-outdoor-chair-in-treetop', '/assets/library/furniture/dining-chair.jpeg', { badge: 'BEST SELLER', material: 'Woven rope and metal frame', description: 'A stackable outdoor chair in Treetop, Tawny Bark and Night Sky.' }),
  product('casablanca-lounger', 'Casablanca Outdoor Lounger', 'Outdoor', 6900, 'casablanca-outdoor-lounger-in-desert-stone', '/assets/library/furniture/chaise-alt.jpeg', { badge: 'BEST SELLER', material: 'Outdoor performance finish', description: 'A poolside lounger with a long, restrained silhouette and two mineral shades.' }),
  product('capri-lounger', 'Capri Stackable Lounger', 'Outdoor', 6300, 'capri-outdoor-stackable-lounger-obsidian', '/assets/library/furniture/chaise-lounge.jpeg', { material: 'Outdoor performance finish', description: 'A stackable sun lounger in Obsidian or Safari for considered terraces.' }),
  product('karoo-chair', 'Karoo Outdoor Chair', 'Outdoor', 4200, 'karoo-outdoor-chair-in-thatch', '/assets/library/furniture/accent-chair.jpeg', { material: 'Outdoor weave', description: 'A sculptural occasional chair in Thatch or Eclipse for outdoor rooms.' }),
  product('marbella-chair', 'Marbella Outdoor Dining Chair', 'Outdoor', 3900, 'marbella-outdoor-dining-chair-1', '/assets/library/furniture/dining-chair.jpeg', { material: 'Outdoor weave', description: 'A light dining chair with a relaxed coastal profile and durable finish.' }),
  product('serene-table', 'Serene Table', 'Tables & storage', 3600, 'serene-table', '/assets/library/furniture/ottoman-leather.jpeg', { badge: 'BEST SELLER', material: 'Stone top, metal legs and lower shelf', description: 'A round accent table with slender legs, metallic feet and an additional lower shelf.' }),
  product('sandpiper-set', 'Sandpiper Side Table Set', 'Tables & storage', 5400, 'sandpiper-side-table-set-in-vintage', '/assets/library/furniture/ottoman.jpeg', { material: 'Vintage finish', description: 'A nested side-table pair that layers height and surface beside a sofa.' }),
  product('archer-dining', 'Archer Dining Table', 'Dining', 17400, 'archer-6-8-seater-dining-table', '/assets/library/furniture/dining-bench-alt.jpeg', { badge: 'BEST SELLER', material: 'Timber', description: 'A grounded dining table in Nutmeg or Clove for six to ten guests.' }),
  product('grace-dining', 'Grace Dining Chair', 'Dining', 6800, 'grace-dining-chair-in-husk', '/assets/library/furniture/dining-chair.jpeg', { material: 'Upholstery and timber', description: 'A refined dining chair in Husk or Onyx with an elegant curved back.' }),
  product('grace-counter', 'Grace Counter Chair', 'Dining', 6900, 'grace-counter-chair', '/assets/library/furniture/dining-chair.jpeg', { material: 'Upholstery and timber', description: 'The Grace silhouette raised to counter height in two quiet finishes.' }),
  product('milano-chair', 'Milano Oak Chair', 'Armchairs', 5200, 'milano-oak-chair-romeo-latte', '/assets/library/furniture/slipper-chair.jpeg', { material: 'Oak and upholstery', description: 'A light oak occasional chair softened with Latte or Granite upholstery.' }),
  product('diane-swivel', 'Diane Swivel Chair', 'Armchairs', 4900, 'diane-swivel-chair-cosmopolitan-almond', '/assets/library/furniture/tub-chair-alt.jpeg', { badge: 'BEST SELLER', material: 'Cosmopolitan textile', description: 'A compact, enveloping swivel chair in three understated colourways.' }),
  product('alba-swivel', 'Alba Swivel Chair', 'Armchairs', 6900, 'alba-swivel-chair-pristine-natural', '/assets/library/furniture/club-chair.jpeg', { material: 'Pristine textile', description: 'A softly rounded swivel chair made for conversation and reading.' }),
  product('clarens-office', 'Clarens Office Chair', 'Office', 3800, 'clarens-office-chair-primal-dune', '/assets/library/furniture/tub-chair.jpeg', { badge: 'BEST SELLER', material: 'Primal textile', description: 'A warm, upholstered office chair in Dune or Ginger for a softer workspace.' }),
  product('paralla-ottoman', 'Paralla Ottoman', 'Stools & ottomans', 3600, 'paralla-ottoman-pistachio-cream', '/assets/library/furniture/ottoman.jpeg', { material: 'Textured textile', description: 'A generous ottoman in Pistachio Cream, Nut Brittle or Liquorice.' }),
  product('zion-bar', 'Zion Outdoor Bar Chair', 'Dining', 4500, 'zion-outdoor-bar-chair', '/assets/library/furniture/dining-chair.jpeg', { material: 'Outdoor performance finish', description: 'A durable high seat in Night Sky or Tawny Bark for outdoor counters.' }),
  product('rosette-coffee', 'Rosette Coffee Table', 'Tables & storage', 12600, 'rosette-coffee-table-1', '/assets/library/furniture/ottoman-leather.jpeg', { badge: 'SCULPTURAL', material: 'Cinnamon or Pepper finish', description: 'A strong, rounded coffee-table centrepiece in two deep tonal finishes.' }),
  product('archer-coffee', 'Archer Coffee Table', 'Tables & storage', 7200, 'archer-coffee-table', '/assets/library/furniture/ottoman-pouf.jpeg', { material: 'Timber', description: 'A low timber coffee table in Nutmeg or Clove with balanced proportions.' }),
  product('essence-coffee', 'Essence Coffee Table', 'Tables & storage', 7300, 'essence-coffee-table', '/assets/library/furniture/ottoman.jpeg', { material: 'Vintage or Sable finish', description: 'An understated coffee table offered in two finishes and two sizes.' }),
  product('essence-side', 'Essence Side Table', 'Tables & storage', 4900, 'essence-side-table-in-sable', '/assets/library/furniture/tufted-footstool-alt.jpeg', { material: 'Vintage or Sable finish', description: 'A compact side table with a strong shape and a dark tactile finish.' }),
  product('merriman-nesting', 'Merriman Nesting Tables', 'Tables & storage', 6300, 'merriman-nesting-table-in-cumin', '/assets/library/furniture/ottoman-pouf.jpeg', { material: 'Cumin finish', description: 'A nested pair for flexible surfaces, styled in a warm cumin tone.' }),
  product('dublin-side', 'Dublin Side Table', 'Tables & storage', 2600, 'dublin-side-table-in-riverbed', '/assets/library/furniture/tufted-footstool.jpeg', { material: 'Riverbed finish', description: 'A compact sculptural side table offered in short and tall formats.' }),
]

export const shopCategories = [...new Set(shopProducts.map(item => item.category))]
export const furnitureCatalogueUrl = 'https://hertexhaus.co.za/collections/homeware-furniture'
