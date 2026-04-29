// Using global fetch (available in Node 18+)

let schemeMaster = null
let lastFetchTime = 0
const MASTER_LIST_URL = 'https://api.mfapi.in/mf'

async function getSchemeMaster() {
  const now = Date.now()
  // Refresh master list every 24 hours
  if (!schemeMaster || (now - lastFetchTime) > 24 * 60 * 60 * 1000) {
    try {
      const res = await fetch(MASTER_LIST_URL)
      schemeMaster = await res.json()
      lastFetchTime = now
      console.log(`Fetched ${schemeMaster.length} schemes from MFapi.in`)
    } catch (err) {
      console.error('Error fetching scheme master:', err)
      return []
    }
  }
  return schemeMaster
}

export const mfService = {
  async searchFund(name) {
    const list = await getSchemeMaster()
    if (!list.length) return null

    const target = name.toLowerCase()
    const tokens = target.split(/\s+/).filter(t => t.length > 2)
    
    let bestMatch = null
    let bestScore = -1

    for (const scheme of list) {
      const schemeName = scheme.schemeName.toLowerCase()
      let score = 0

      // Match tokens
      for (const token of tokens) {
        if (schemeName.includes(token)) score += 10
      }

      // Bonus for Direct and Growth
      if (target.includes('direct') && schemeName.includes('direct')) score += 5
      if (target.includes('growth') && schemeName.includes('growth')) score += 5
      
      // Penalty for Regular/IDCW if not asked
      if (!target.includes('regular') && schemeName.includes('regular')) score -= 5
      if (!target.includes('idcw') && (schemeName.includes('idcw') || schemeName.includes('dividend'))) score -= 5

      if (score > bestScore) {
        bestScore = score
        bestMatch = scheme
      }
    }

    return bestScore > 0 ? bestMatch : null
  },

  async getPerformance(schemeCode) {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`)
      const data = await res.json()
      
      if (!data?.data?.length) return null

      const navData = data.data.map(item => ({
        date: item.date, // dd-mm-yyyy
        nav: parseFloat(item.nav),
        timestamp: parseDate(item.date)
      })).sort((a, b) => b.timestamp - a.timestamp) // Latest first

      const latest = navData[0]
      if (!latest) return null

      const periods = {
        '1M': 30,
        '3M': 90,
        '6M': 180,
        '1Y': 365,
        '3Y': 365 * 3,
        '5Y': 365 * 5
      }

      const history = []
      const now = latest.timestamp

      // Specific periods
      for (const [label, days] of Object.entries(periods)) {
        const targetTs = now - (days * 24 * 60 * 60 * 1000)
        const pastNav = findNavAtDate(navData, targetTs)
        if (pastNav) {
          const ret = ((latest.nav - pastNav.nav) / pastNav.nav) * 100
          history.push({ period: label, value: parseFloat(ret.toFixed(2)) })
        }
      }

      // 'ALL' - return from the oldest data point
      const oldest = navData[navData.length - 1]
      if (oldest && oldest !== latest) {
        const ret = ((latest.nav - oldest.nav) / oldest.nav) * 100
        history.push({ period: 'ALL', value: parseFloat(ret.toFixed(2)) })
      }

      return {
        history: history.sort((a,b) => orderOf(a.period) - orderOf(b.period)),
        latestNav: latest.nav,
        navDate: latest.date,
        fundAge: calculateAge(oldest.timestamp)
      }
    } catch (err) {
      console.error(`Error getting performance for ${schemeCode}:`, err)
      return null
    }
  }
}

function parseDate(str) {
  const [d, m, y] = str.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function findNavAtDate(data, targetTs) {
  // Find the data point closest to the target timestamp (historical)
  let best = data[0]
  let minDiff = Math.abs(data[0].timestamp - targetTs)

  for (const item of data) {
    const diff = Math.abs(item.timestamp - targetTs)
    if (diff < minDiff) {
      minDiff = diff
      best = item
    }
  }
  
  // If the closest date is too far (e.g. 10 days), item might not exist yet
  if (minDiff > 10 * 24 * 60 * 60 * 1000) return null 
  return best
}

function orderOf(period) {
  const map = { '1M': 1, '3M': 2, '6M': 3, '1Y': 4, '3Y': 5, '5Y': 6, 'ALL': 7 }
  return map[period] || 99
}

function calculateAge(startTs) {
  const diff = Date.now() - startTs
  const years = diff / (365 * 24 * 60 * 60 * 1000)
  return `${years.toFixed(1)} years`
}
