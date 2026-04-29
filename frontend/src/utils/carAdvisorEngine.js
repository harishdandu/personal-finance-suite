export const CAR_CATALOG = [
  {
    id: 'baleno',
    model: 'Maruti Suzuki Baleno',
    make: 'Maruti Suzuki',
    priceLakh: 8.9,
    mileageKmpl: 22.3,
    engineType: 'petrol',
    bodyType: 'hatchback',
    transmission: ['manual', 'automatic'],
    features: ['6 airbags', '360 camera', 'touchscreen'],
  },
  {
    id: 'fronx',
    model: 'Maruti Suzuki Fronx',
    make: 'Maruti Suzuki',
    priceLakh: 9.6,
    mileageKmpl: 21.5,
    engineType: 'petrol',
    bodyType: 'suv',
    transmission: ['manual', 'automatic'],
    features: ['head-up display', 'cruise control', '6 airbags'],
  },
  {
    id: 'nexon-ev',
    model: 'Tata Nexon EV',
    make: 'Tata',
    priceLakh: 15.8,
    mileageKmpl: 0,
    rangeKm: 325,
    engineType: 'ev',
    bodyType: 'suv',
    transmission: ['automatic'],
    features: ['fast charging', '6 airbags', 'connected car'],
  },
  {
    id: 'punch',
    model: 'Tata Punch',
    make: 'Tata',
    priceLakh: 8.2,
    mileageKmpl: 20.1,
    engineType: 'petrol',
    bodyType: 'suv',
    transmission: ['manual', 'automatic'],
    features: ['5 star safety', 'cruise control', 'rear camera'],
  },
  {
    id: 'venue',
    model: 'Hyundai Venue',
    make: 'Hyundai',
    priceLakh: 10.7,
    mileageKmpl: 19.2,
    engineType: 'petrol',
    bodyType: 'suv',
    transmission: ['manual', 'automatic'],
    features: ['sunroof', 'connected car', '6 airbags'],
  },
  {
    id: 'i20',
    model: 'Hyundai i20',
    make: 'Hyundai',
    priceLakh: 9.4,
    mileageKmpl: 20.3,
    engineType: 'petrol',
    bodyType: 'hatchback',
    transmission: ['manual', 'automatic'],
    features: ['sunroof', 'wireless charging', '6 airbags'],
  },
  {
    id: 'sonet',
    model: 'Kia Sonet',
    make: 'Kia',
    priceLakh: 10.2,
    mileageKmpl: 18.8,
    engineType: 'petrol',
    bodyType: 'suv',
    transmission: ['manual', 'automatic'],
    features: ['ventilated seats', 'air purifier', '6 airbags'],
  },
  {
    id: 'seltos',
    model: 'Kia Seltos',
    make: 'Kia',
    priceLakh: 13.1,
    mileageKmpl: 17.0,
    engineType: 'petrol',
    bodyType: 'suv',
    transmission: ['manual', 'automatic'],
    features: ['panoramic display', 'adas', '6 airbags'],
  },
  {
    id: 'city-hybrid',
    model: 'Honda City e:HEV',
    make: 'Honda',
    priceLakh: 19.0,
    mileageKmpl: 26.5,
    engineType: 'hybrid',
    bodyType: 'sedan',
    transmission: ['automatic'],
    features: ['adas', 'lane watch camera', 'sunroof'],
  },
  {
    id: 'virtus',
    model: 'Volkswagen Virtus',
    make: 'Volkswagen',
    priceLakh: 13.8,
    mileageKmpl: 18.5,
    engineType: 'petrol',
    bodyType: 'sedan',
    transmission: ['manual', 'automatic'],
    features: ['turbo engine', '6 airbags', 'ventilated seats'],
  },
]

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
}

export function findMatchingCars(preferences) {
  const budget = Number(preferences?.budgetLakh || 0)
  const mileageMin = Number(preferences?.mileageMin || 0)
  const make = norm(preferences?.make)
  const engineType = norm(preferences?.engineType)
  const transmission = norm(preferences?.transmission)
  const bodyType = norm(preferences?.bodyType)
  const specsText = norm(preferences?.specsText)
  const keywords = specsText
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 3)

  const scored = CAR_CATALOG.map((car) => {
    // Strict filters: if a user provided a criterion, car must satisfy it.
    if (budget > 0 && car.priceLakh > budget) return null
    if (make && !(norm(car.make) === make || norm(car.make).includes(make) || make.includes(norm(car.make)))) return null
    if (engineType && norm(car.engineType) !== engineType) return null
    if (transmission && !car.transmission.map(norm).includes(transmission)) return null
    if (bodyType && norm(car.bodyType) !== bodyType) return null
    if (mileageMin > 0) {
      const ref = car.engineType === 'ev' ? Number(car.rangeKm || 0) / 10 : Number(car.mileageKmpl || 0)
      if (ref < mileageMin) return null
    }

    if (keywords.length) {
      const hay = car.features.map(norm).join(' ')
      const hasAll = keywords.every((k) => hay.includes(k))
      if (!hasAll) return null
    }

    let score = 0
    const reasons = []
    if (budget > 0) {
      score += 35
      reasons.push(`Within budget ₹${car.priceLakh}L`)
    }

    if (make) {
      score += 22
      reasons.push(`Matches preferred make ${car.make}`)
    }

    if (engineType) {
      score += 18
      reasons.push(`${car.engineType.toUpperCase()} powertrain match`)
    }

    if (mileageMin > 0) {
      score += 15
      reasons.push(`Meets efficiency target (${car.mileageKmpl || `${car.rangeKm} km range`})`)
    }

    if (transmission) {
      score += 8
    }

    if (bodyType) {
      score += 8
    }

    if (keywords.length) {
      score += Math.min(12, keywords.length * 4)
      reasons.push(`Has requested features: ${keywords.join(', ')}`)
    }

    return { ...car, score, reasons }
  })

  return scored
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}
