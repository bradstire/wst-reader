import fs from 'fs';
import path from 'path';

const TPL_DIR = path.join(process.cwd(), 'templates');

export function readTemplate(name: string) {
  return fs.readFileSync(path.join(TPL_DIR, name), 'utf8');
}

// convenience exports
export const TPL_01 = readTemplate('01.txt');
export const TPL_02 = readTemplate('02.txt');
export const TPL_03 = readTemplate('03.txt');
export const TPL_04 = readTemplate('04.txt');
export const TPL_05 = readTemplate('05.txt');
export const TPL_06 = readTemplate('06.txt');     // CH06 finale with CTA
