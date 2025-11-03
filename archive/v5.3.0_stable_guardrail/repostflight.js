process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'placeholder-key';
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');

const { enforcePostFlight, computeValidatorHash } = require('../lib/generate');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
  const inputPath = path.resolve(
    __dirname,
    '../output/FULL_READING__Capricorn__FINAL__2025-11-03T04-33-13Z.txt'
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const lines = raw.split('\n');
  const body = lines.slice(2).join('\n');

  const postFlight = enforcePostFlight(body);
  const hash = computeValidatorHash();
  const banner = `[validator_hash=${hash} | pass_order=card>contextual>fragments>redundant>noun-collision>plural>synonyms>safeguards | energy=${postFlight.energyBefore}→${postFlight.energyAfter} | signature=${postFlight.signatureBefore}→${postFlight.signatureAfter}]`;
  const outputText = `${banner}\n\n${postFlight.text}`;

  const outPath = path.resolve(
    __dirname,
    `../output/FULL_READING__Capricorn__POSTFIX__${timestamp()}.txt`
  );
  fs.writeFileSync(outPath, outputText, 'utf8');

  console.log('[postflight-run] Wrote', outPath);
  console.log(banner);
  console.log(`[postflight-run] Softened signatures: ${postFlight.signatureSoftened}`);
}

try {
  main();
} catch (error) {
  console.error('[postflight-run] ERROR', error);
  process.exit(1);
}
