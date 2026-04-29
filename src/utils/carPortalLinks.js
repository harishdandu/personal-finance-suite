/** Build a search query from advisor result fields (CarWale / fallback). */
export function buildCarSearchQuery(car) {
  const make = String(car?.make || '').trim()
  const model = String(car?.model || '').trim()
  if (make && model) return `${make} ${model}`
  if (model) return model
  return make || 'cars'
}

function slugifySegment(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Remove duplicate leading make from model text (e.g. "Tata Punch" + make Tata → "Punch"). */
function stripMakePrefix(model, make) {
  const m = String(model || '').trim()
  const brand = String(make || '').trim()
  if (!brand || !m) return m
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return m.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim() || m
}

/** CarDekho uses paths like /tata/punch, /maruti/fronx, /hyundai/creta */
export function cardekhoBrandSlug(make) {
  const raw = String(make || '').trim().toLowerCase()
  if (!raw) return ''
  if (/maruti|maruti\s+suzuki|suzuki/.test(raw)) return 'maruti'
  if (/mercedes/.test(raw)) return 'mercedes-benz'
  if (/land\s*rover/.test(raw)) return 'land-rover'
  if (raw === 'vw' || /volkswagen/.test(raw)) return 'volkswagen'
  if (/mini\s*(cooper)?/.test(raw)) return 'mini'
  if (/rolls\s*royce/.test(raw)) return 'rolls-royce'
  if (/aston\s*martin/.test(raw)) return 'aston-martin'
  const firstWord = raw.split(/\s+/)[0] || raw
  return slugifySegment(firstWord)
}

const TRIM_END_ALIASES = new Set([
  'lr',
  'mr',
  'sr',
  'amt',
  'cvt',
  'dct',
  'mt',
  'at',
  'imat',
  'turbo',
  'max',
  'plus',
  's',
  'pure',
  'smart',
  'creative',
  'adventure',
  'accomplished',
  'empowered',
  'diesel',
  'petrol',
  'facelift',
  'edition',
  'optional',
  'opt',
  'sx',
  'zx',
  'xe',
  'xi',
  'xli',
  'vxi',
  'zxi',
  'lxi',
  'zdi',
  'vdi',
  'ldi',
  'xse',
  'cng',
])

function normalizeTokenForTrim(t) {
  return String(t || '')
    .replace(/\+/g, '')
    .replace(/[^\w]/g, '')
    .toLowerCase()
}

/** Variant / trim tokens often appended after the base model (e.g. Volvo "XC90 B6 Ultimate" → xc90). */
function isTrailingVariantOrTrimToken(token) {
  const raw = String(token || '').trim()
  const n = normalizeTokenForTrim(raw)
  if (!n) return false
  if (TRIM_END_ALIASES.has(n)) return true
  if (/^xz/i.test(n)) return true
  if (/^empowered/i.test(raw)) return true
  // Volvo / common luxury: B6 mild-hybrid, T8 PHEV, D5 diesel, etc.
  if (/^[btd]\d{1,2}$/i.test(n)) return true
  if (/^(ultimate|ultra|prestige|luxury|inscription|momentum|rdesign|rline|komfort|technology|premium|signature|electric|recharge)$/i.test(n)) {
    return true
  }
  return false
}

function stripTrailingTrims(words) {
  const w = [...words]
  while (w.length && isTrailingVariantOrTrimToken(w[w.length - 1])) w.pop()
  return w
}

/** Drop trailing EV / Hybrid / CNG so "Punch EV Long Range" → base model page /tata/punch (ICE hub lists EV). */
function stripTrailingPowertrainSuffix(words) {
  const w = [...words]
  while (w.length >= 2 && /^(ev|hybrid)$/i.test(String(w[w.length - 1] || '').trim())) {
    w.pop()
  }
  if (w.length >= 2 && /^cng$/i.test(String(w[w.length - 1] || '').trim())) {
    w.pop()
  }
  return w
}

/** Multi-word model names: keep "Grand" + "Vitara" → grand-vitara */
function wordsToModelSlug(words) {
  if (!words.length) return ''
  const joined = words.join(' ')
  return slugifySegment(joined)
}

/** e.g. XC90, EX30, X5, i20 — CarDekho path is usually /brand/xc90 not /brand/xc90-b6-ultimate */
function isLikelyAlphanumericModelCode(word) {
  return /^[a-z]{1,4}\d{1,4}[a-z]*$/i.test(String(word || '').trim())
}

export function cardekhoModelSlugFromName(modelRaw, make) {
  let text = stripMakePrefix(modelRaw, make)
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  let words = text.split(/\s+/).filter(Boolean)
  words = stripTrailingTrims(words)
  words = stripTrailingPowertrainSuffix(words)
  words = stripTrailingTrims(words)

  if (!words.length) return ''

  if (words.length >= 2 && /^(grand|new|all)$/i.test(words[0])) {
    return wordsToModelSlug(words.slice(0, 2))
  }

  // Volvo XC90 B6 Ultimate → keep first segment when it's a typical model code (avoids dead /volvo/xc90-b6-ultimate URLs)
  if (words.length >= 2 && isLikelyAlphanumericModelCode(words[0])) {
    return wordsToModelSlug([words[0]])
  }

  return wordsToModelSlug(words)
}

/** Primary model page: https://www.cardekho.com/tata/punch */
export function carDekhoModelPageUrl(car) {
  const brand = cardekhoBrandSlug(car?.make)
  const modelSlug = cardekhoModelSlugFromName(car?.model, car?.make)
  if (brand && modelSlug) {
    return `https://www.cardekho.com/${brand}/${modelSlug}`
  }
  const q = encodeURIComponent(buildCarSearchQuery(car))
  return `https://www.cardekho.com/searchresult?keyword=${q}`
}

/** @deprecated use carDekhoModelPageUrl — kept for clarity in imports */
export function carDekhoSearchUrl(car) {
  return carDekhoModelPageUrl(car)
}

/**
 * CarWale model hubs: https://www.carwale.com/bmw-cars/x5/
 * Pattern: https://www.carwale.com/{brand}-cars/{model}/
 */
export function carwaleBrandCarsSegment(make) {
  const raw = String(make || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!raw) return ''

  if (/maruti|maruti\s+suzuki/.test(raw)) return 'maruti-suzuki-cars'
  if (/mercedes|mercedes-benz/.test(raw)) return 'mercedes-benz-cars'
  if (/land\s*rover/.test(raw)) return 'land-rover-cars'
  if (raw === 'vw' || /volkswagen/.test(raw)) return 'volkswagen-cars'
  if (/rolls\s*royce/.test(raw)) return 'rolls-royce-cars'
  if (/aston\s*martin/.test(raw)) return 'aston-martin-cars'
  if (/mini(\s+cooper)?/.test(raw)) return 'mini-cars'
  if (/bmw/.test(raw)) return 'bmw-cars'
  if (/audi/.test(raw)) return 'audi-cars'
  if (/porsche/.test(raw)) return 'porsche-cars'
  if (/ferrari/.test(raw)) return 'ferrari-cars'
  if (/lamborghini/.test(raw)) return 'lamborghini-cars'
  if (/jaguar/.test(raw)) return 'jaguar-cars'
  if (/lexus/.test(raw)) return 'lexus-cars'
  if (/volvo/.test(raw)) return 'volvo-cars'
  if (/tata/.test(raw)) return 'tata-cars'
  if (/mahindra/.test(raw)) return 'mahindra-cars'
  if (/hyundai/.test(raw)) return 'hyundai-cars'
  if (/kia/.test(raw)) return 'kia-cars'
  if (/toyota/.test(raw)) return 'toyota-cars'
  if (/honda/.test(raw)) return 'honda-cars'
  if (/mg(\s*motor)?/.test(raw)) return 'mg-cars'
  if (/jeep/.test(raw)) return 'jeep-cars'
  if (/nissan/.test(raw)) return 'nissan-cars'
  if (/renault/.test(raw)) return 'renault-cars'
  if (/citroen|citroën/.test(raw)) return 'citroen-cars'
  if (/skoda/.test(raw)) return 'skoda-cars'
  if (/byd/.test(raw)) return 'byd-cars'
  if (/isuzu/.test(raw)) return 'isuzu-cars'
  if (/force\s*motors?/.test(raw)) return 'force-motors-cars'
  if (/bentley/.test(raw)) return 'bentley-cars'
  if (/mclaren/.test(raw)) return 'mclaren-cars'
  if (/maserati/.test(raw)) return 'maserati-cars'

  const base = slugifySegment(raw)
  return base ? `${base}-cars` : ''
}

/** Model page: https://www.carwale.com/bmw-cars/x5/ — same slug rules as CarDekho for trims/variants. */
export function carWaleModelPageUrl(car) {
  const brandSeg = carwaleBrandCarsSegment(car?.make)
  const modelSlug = cardekhoModelSlugFromName(car?.model, car?.make)
  if (brandSeg && modelSlug) {
    return `https://www.carwale.com/${brandSeg}/${modelSlug}/`
  }
  const q = encodeURIComponent(buildCarSearchQuery(car))
  return `https://www.carwale.com/search/results?q=${q}`
}

/** Opens CarWale model hub when make/model resolve; otherwise search. */
export function carWaleSearchUrl(car) {
  return carWaleModelPageUrl(car)
}
