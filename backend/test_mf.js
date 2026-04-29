import { mfService } from './src/services/mfService.js'

async function test() {
  console.log('Testing search...')
  const scheme = await mfService.searchFund('Parag Parikh Flexi Cap')
  console.log('Found scheme:', scheme)
  
  if (scheme) {
    console.log('Testing performance...')
    const perf = await mfService.getPerformance(scheme.schemeCode)
    console.log('Performance:', JSON.stringify(perf, null, 2))
  }
}

test()
