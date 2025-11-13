import path from 'path';
import fs from 'fs';
import { generateFullReading, computeValidatorHash } from '../lib/generate';

type ControlConfig = {
  sign: string;
  seed: string;
  mode: string;
  with_breaks: boolean;
};

const EXPECTED_VALIDATOR_HASH = 'af871599b2ecfad2230750512cb03a2805971a62';

const controls: ControlConfig[] = [
  { sign: 'Libra', seed: 'BREATH_PARASOCIAL_CONTROL_001', mode: 'control_v54', with_breaks: true },
  { sign: 'Capricorn', seed: 'BREATH_PARASOCIAL_CONTROL_001', mode: 'control_v54', with_breaks: true },
];

async function runControl() {
  const validatorHash = computeValidatorHash();
  const allowDrift = process.env.ALLOW_VALIDATOR_DRIFT === 'true';
  if (!allowDrift && validatorHash !== EXPECTED_VALIDATOR_HASH) {
    throw new Error(`Validator drift detected. Expected ${EXPECTED_VALIDATOR_HASH}, got ${validatorHash}`);
  }

  for (const control of controls) {
    const result = await generateFullReading(control.sign);
    const baseName = control.with_breaks ? result.breaksName : result.plainName;
    const outputPath = path.resolve(process.cwd(), 'output', `${control.mode}__${control.sign}__${control.seed}.txt`);
    fs.copyFileSync(path.resolve(process.cwd(), 'output', baseName), outputPath);
    console.log(`${control.sign.padEnd(10)} | seed=${control.seed} | file=${path.basename(outputPath)}`);
  }
}

runControl().catch((error) => {
  console.error('[run_v54_control] Failed:', error);
  process.exit(1);
});
