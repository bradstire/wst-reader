#!/usr/bin/env ts-node
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'placeholder-key';
import fs from 'fs';
import path from 'path';
import { enforcePostFlight, computeValidatorHash } from '../lib/generate';
import { headerize } from '../lib/postprocess';
import { applyBreaks } from '../lib/withBreaks';

interface ControlRecord {
  sign: string;
  metrics: {
    energyBefore: number;
    energyAfter: number;
    signatureBefore: number;
    signatureAfter: number;
    ellipsesCount: number;
    questionCount: number;
    staccatoShare: number;
    letsCount: number;
  };
  status: string;
  filePath: string;
}

const FIXED_SEED = 'BREATH_PARASOCIAL_CONTROL_001';
const SIGNS = ['Libra', 'Capricorn'] as const;
const validatorHash = computeValidatorHash();
const GOLD_DIR = path.resolve(process.cwd(), 'archive', 'v5.3.0_stable_guardrail', 'gold12');

function findBaseline(sign: string): string {
  const files = fs.readdirSync(GOLD_DIR);
  const match = files.find((file) => file.startsWith(`FULL_READING__${sign}__LOCK__`));
  if (!match) {
    throw new Error(`Baseline file for ${sign} not found in ${GOLD_DIR}`);
  }
  return path.join(GOLD_DIR, match);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function evaluate(sign: string, filePath: string, metrics: ControlRecord['metrics']): string {
  const words = Math.max(1, fs.readFileSync(filePath, 'utf8').split(/\s+/).length);
  const questionsPerK = metrics.questionCount / (words / 1000);
  let status = 'PASS';
  if (sign === 'Libra') {
    if (questionsPerK < 6 || questionsPerK > 10) status = 'FAIL';
    if (metrics.staccatoShare < 0.20 || metrics.staccatoShare > 0.25) status = 'FAIL';
  }
  if (sign === 'Capricorn') {
    if (questionsPerK < 5 || questionsPerK > 8) status = 'FAIL';
    if (metrics.staccatoShare > 0.20) status = 'FAIL';
    if (metrics.energyAfter !== 0) status = 'FAIL';
    if (metrics.signatureAfter > 3) status = 'FAIL';
  }
  return status;
}

function runControl(sign: string): ControlRecord {
  const bodyPath = findBaseline(sign);
  let text = fs.readFileSync(bodyPath, 'utf8');
  // Strip any existing banner from the gold baseline before processing
  text = text.replace(/^\[validator_hash=[^\]]*\]\n*/m, '');
  const output = enforcePostFlight(text, sign);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `FULL_READING__${sign}__CONTROL_v5.4.1__${timestamp}.txt`;
  const plainPath = path.resolve(process.cwd(), 'output', baseName);
  const banner = `[validator_hash=${validatorHash} | pass_order=card>contextual>fragments>redundant>noun-collision>plural>synonyms>safeguards | energy=${output.energyBefore}→${output.energyAfter} | signature=${output.signatureBefore}→${output.signatureAfter} | ellipses=${output.ellipsesCount} | questions=${output.questionCount} | staccatoShare=${output.staccatoShare.toFixed(2)} | lets=${output.letsCount}]`;
  const textWithBanner = `${banner}\n\n${output.text}`;
  const headerized = headerize(textWithBanner, sign);
  fs.writeFileSync(plainPath, headerized, 'utf8');
  fs.writeFileSync(plainPath.replace('FULL_READING__', 'FULL_READING_with_breaks__'), applyBreaks(headerized), 'utf8');
  const status = evaluate(sign, plainPath, {
    energyBefore: output.energyBefore,
    energyAfter: output.energyAfter,
    signatureBefore: output.signatureBefore,
    signatureAfter: output.signatureAfter,
    ellipsesCount: output.ellipsesCount,
    questionCount: output.questionCount,
    staccatoShare: output.staccatoShare,
    letsCount: output.letsCount,
  });
  return {
    sign,
    metrics: {
      energyBefore: output.energyBefore,
      energyAfter: output.energyAfter,
      signatureBefore: output.signatureBefore,
      signatureAfter: output.signatureAfter,
      ellipsesCount: output.ellipsesCount,
      questionCount: output.questionCount,
      staccatoShare: output.staccatoShare,
      letsCount: output.letsCount,
    },
    status,
    filePath: plainPath,
  };
}

function formatMetrics(records: ControlRecord[]) {
  const cols = ['Sign', 'Energy', 'Signature', 'Ellipses', 'Questions', 'Staccato', 'Lets'];
  const rows = records.map((record) => {
    const m = record.metrics;
    return [
      record.sign,
      `${m.energyBefore}→${m.energyAfter}`,
      `${m.signatureBefore}→${m.signatureAfter}`,
      `${m.ellipsesCount}`,
      `${m.questionCount}`,
      m.staccatoShare.toFixed(2),
      `${m.letsCount}`,
    ];
  });
  const header = `| ${cols.join(' | ')} |`;
  const separator = `| ${cols.map(() => '---').join(' | ')} |`;
  const lines = rows.map((row) => `| ${row.join(' | ')} |`);
  return [header, separator, ...lines].join('\n');
}

function main() {
  const records = SIGNS.map((sign) => runControl(sign));
  console.log(formatMetrics(records));

  const receiptLines = [
    '# v5.4.1 Control QA Receipt',
    '',
    formatMetrics(records),
    '',
    '## Results',
    ...records.map((record) => `- ${record.sign}: **${record.status}** (${record.filePath})`),
    '',
    '## Notes',
    'Runs use seeded post-flight enforcement only; FAIL status is informational for tuning.',
  ];
  fs.writeFileSync(path.resolve(process.cwd(), 'output', 'CONTROL_QA__v5.4.1_receipt.md'), receiptLines.join('\n'), 'utf8');
}

main();
