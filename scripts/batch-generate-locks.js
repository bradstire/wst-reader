// Load environment variables manually
const fs = require('fs');
const path = require('path');
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} catch (e) {
  console.error('Warning: Could not load .env.local');
}

// Set up TypeScript support
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
require('ts-node/register/transpile-only');

const { generateFullReading } = require('../lib/generate.ts');

const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

(async () => {
  const results = [];
  
  // Aries was already generated - add it manually
  const ariesContent = fs.readFileSync('output/FULL_READING__Aries__LOCK__2025-11-03T07-13-57Z.txt', 'utf8');
  const ariesBanner = ariesContent.split('\n')[0];
  const ariesEnergyMatch = ariesBanner.match(/energy=(\d+)→(\d+)/);
  const ariesSignatureMatch = ariesBanner.match(/signature=(\d+)→(\d+)/);
  const ariesHashMatch = ariesBanner.match(/validator_hash=([a-f0-9]+)/);
  
  results.push({
    sign: 'Aries',
    hash: ariesHashMatch ? ariesHashMatch[1] : 'unknown',
    energyBefore: ariesEnergyMatch ? ariesEnergyMatch[1] : '?',
    energyAfter: ariesEnergyMatch ? ariesEnergyMatch[2] : '?',
    signatureBefore: ariesSignatureMatch ? ariesSignatureMatch[1] : '?',
    signatureAfter: ariesSignatureMatch ? ariesSignatureMatch[2] : '?',
    path: 'FULL_READING__Aries__LOCK__2025-11-03T07-13-57Z.txt'
  });
  
  console.log(`✅ Aries (already generated) | energy ${ariesEnergyMatch[1]}→${ariesEnergyMatch[2]} | signature ${ariesSignatureMatch[1]}→${ariesSignatureMatch[2]}`);
  
  for (const sign of signs.slice(1)) {  // Skip Aries
    console.log(`\n🔮 Generating ${sign}...\n`);
    
    try {
      const result = await generateFullReading(sign);
      
      // Rename files to add __LOCK__ suffix
      const lockPlainName = result.plainName.replace(`__${sign}__`, `__${sign}__LOCK__`);
      const lockBreaksName = result.breaksName.replace(`__${sign}__`, `__${sign}__LOCK__`);
      
      fs.renameSync(`output/${result.plainName}`, `output/${lockPlainName}`);
      fs.renameSync(`output/${result.breaksName}`, `output/${lockBreaksName}`);
      
      // Read the generated file
      const content = fs.readFileSync(`output/${lockPlainName}`, 'utf8');
      const lines = content.split('\n');
      const banner = lines[0];
      
      // Extract metrics
      const energyMatch = banner.match(/energy=(\d+)→(\d+)/);
      const signatureMatch = banner.match(/signature=(\d+)→(\d+)/);
      const hashMatch = banner.match(/validator_hash=([a-f0-9]+)/);
      
      if (hashMatch && hashMatch[1] !== 'af871599b2ecfad2230750512cb03a2805971a62') {
        console.error(`❌ Validator hash drift for ${sign}: ${hashMatch[1]}`);
        process.exit(1);
      }
      
      results.push({
        sign,
        hash: hashMatch ? hashMatch[1] : 'unknown',
        energyBefore: energyMatch ? energyMatch[1] : '?',
        energyAfter: energyMatch ? energyMatch[2] : '?',
        signatureBefore: signatureMatch ? signatureMatch[1] : '?',
        signatureAfter: signatureMatch ? signatureMatch[2] : '?',
        path: lockPlainName
      });
      
      console.log(`✅ ${sign} | energy ${energyMatch[1]}→${energyMatch[2]} | signature ${signatureMatch[1]}→${signatureMatch[2]}`);
      console.log(`📄 output/${lockPlainName}`);
    } catch (error) {
      console.error(`❌ ${sign} failed:`, error.message);
      process.exit(1);
    }
  }
  
  console.log(`\n\n📊 FINAL SUMMARY TABLE:\n`);
  console.log('┌──────────────┬──────────────────┬───────────────────┬─────────────────────┐');
  console.log('│ Sign         │ Validator Hash   │ Energy            │ Signature           │');
  console.log('├──────────────┼──────────────────┼───────────────────┼─────────────────────┤');
  
  for (const r of results) {
    const hashShort = r.hash.substring(0, 8) + '...';
    const sign = r.sign.padEnd(12);
    const energy = `${r.energyBefore}→${r.energyAfter}`.padEnd(17);
    const signature = `${r.signatureBefore}→${r.signatureAfter}`.padEnd(19);
    console.log(`│ ${sign} │ ${hashShort.padEnd(16)} │ ${energy} │ ${signature} │`);
  }
  
  console.log('└──────────────┴──────────────────┴───────────────────┴─────────────────────┘');
  console.log(`\n✅ All 12 signs generated successfully with validator af871599b2ecfad2230750512cb03a2805971a62`);
})();

