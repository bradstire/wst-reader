process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'placeholder-key';
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');

const { enforcePostFlight, computeValidatorHash } = require('../lib/generate');

function extractBody(raw) {
  if (!raw.startsWith('[')) {
    return raw;
  }
  const doubleNewline = raw.indexOf('\n\n');
  if (doubleNewline !== -1) {
    return raw.slice(doubleNewline + 2);
  }
  const lines = raw.split('\n');
  return lines.slice(1).join('\n');
}

function main() {
  const inputArgs = process.argv.slice(2);
  if (inputArgs.length === 0) {
    console.error('[postflight-run] ERROR No input files provided.');
    process.exit(1);
  }

  const absPaths = inputArgs.map((rel) => path.resolve(process.cwd(), rel));
  const validatorHash = computeValidatorHash();
  const rows = [];

  for (const inputPath of absPaths) {
    if (!fs.existsSync(inputPath)) {
      console.error(`[postflight-run] WARN Skipping missing file: ${inputPath}`);
      continue;
    }

    const raw = fs.readFileSync(inputPath, 'utf8');
    const body = extractBody(raw);

    const postFlight = enforcePostFlight(body);
    const banner = `[validator_hash=${validatorHash} | pass_order=card>contextual>fragments>redundant>noun-collision>plural>synonyms>safeguards | energy=${postFlight.energyBefore}→${postFlight.energyAfter} | signature=${postFlight.signatureBefore}→${postFlight.signatureAfter}]`;
    const outputText = `${banner}\n\n${postFlight.text}`;
    fs.writeFileSync(inputPath, outputText, 'utf8');

    rows.push({
      file: inputPath,
      energy: `${postFlight.energyBefore}→${postFlight.energyAfter}`,
      signature: `${postFlight.signatureBefore}→${postFlight.signatureAfter}`,
      commaFixes: postFlight.commaFixes ?? 0,
      nounSeams: postFlight.nounSeamsCollapsed ?? 0,
    });
  }

  if (rows.length === 0) {
    console.error('[postflight-run] ERROR No files processed.');
    process.exit(1);
  }

  console.log('File | energy before→after | signature before→after | comma fixes | noun seams fixed');
  console.log('-'.repeat(110));
  for (const row of rows) {
    console.log(`${row.file} | ${row.energy} | ${row.signature} | ${row.commaFixes} | ${row.nounSeams}`);
  }
}

try {
  main();
} catch (error) {
  console.error('[postflight-run] ERROR', error);
  process.exit(1);
}
