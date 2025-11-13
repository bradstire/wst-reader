#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

interface WindowDiagnostic {
  startWord: number;
  endWord: number;
  staccatoShare: number;
  questionCount: number;
  shortLines: Array<{ index: number; text: string }>;
}

interface ConsecutiveRun {
  startLine: number;
  endLine: number;
  lines: string[];
}

interface QuestionContext {
  lineIndex: number;
  question: string;
  contextStart: number;
  contextEnd: number;
  contextText: string;
}

const WORD_REGEX = /\b[\w'’]+\b/g;

function countWords(text: string): number {
  const matches = text.match(WORD_REGEX);
  return matches ? matches.length : 0;
}

function bucketLineLengths(lengths: number[]): Map<string, number> {
  const buckets = new Map<string, number>();
  const bucketForLength = (length: number) => {
    if (length <= 3) return '0-3';
    if (length <= 6) return '4-6';
    if (length <= 10) return '7-10';
    if (length <= 15) return '11-15';
    if (length <= 20) return '16-20';
    if (length <= 30) return '21-30';
    return '31+';
  };
  lengths.forEach((length) => {
    const bucket = bucketForLength(length);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });
  return buckets;
}

function formatTable(headers: string[], rows: Array<string[]>): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((row) => `| ${row.join(' | ')} |`);
  return [headerLine, separatorLine, ...rowLines].join('\n');
}

function computeStaccatoWindows(lines: string[], windowWordLimit = 200): WindowDiagnostic[] {
  const wordCountsPerLine = lines.map((line) => countWords(line));
  const shortLineFlags = wordCountsPerLine.map((count) => count > 0 && count <= 6);
  const questionLineFlags = lines.map((line) => /\?/g.test(line));

  const diagnostics: WindowDiagnostic[] = [];
  let startLine = 0;

  while (startLine < lines.length) {
    let endLine = startLine;
    let wordSum = 0;
    let shortLineCount = 0;
    let questionCount = 0;

    while (endLine < lines.length && wordSum + wordCountsPerLine[endLine] <= windowWordLimit) {
      wordSum += wordCountsPerLine[endLine];
      if (shortLineFlags[endLine]) shortLineCount += 1;
      if (questionLineFlags[endLine]) questionCount += (lines[endLine].match(/\?/g) || []).length;
      endLine += 1;
    }

    if (wordSum === 0) {
      startLine += 1;
      continue;
    }

    const staccatoShare = shortLineCount / (endLine - startLine);
    diagnostics.push({
      startWord: countWords(lines.slice(0, startLine).join(' ')),
      endWord: countWords(lines.slice(0, endLine).join(' ')),
      staccatoShare,
      questionCount,
      shortLines: lines
        .slice(startLine, endLine)
        .map((text, idx) => ({ index: startLine + idx + 1, text }))
        .filter((item) => shortLineFlags[item.index - 1])
    });

    if (endLine === startLine) {
      startLine += 1;
    } else {
      startLine = endLine;
    }
  }

  return diagnostics;
}

function findConsecutiveShortRuns(shortLineIndices: number[]): ConsecutiveRun[] {
  const runs: ConsecutiveRun[] = [];
  if (!shortLineIndices.length) return runs;

  let runStart = shortLineIndices[0];
  let prev = shortLineIndices[0];

  for (let i = 1; i < shortLineIndices.length; i += 1) {
    const current = shortLineIndices[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    if (prev - runStart >= 1) {
      runs.push({ startLine: runStart, endLine: prev, lines: [] });
    }
    runStart = current;
    prev = current;
  }

  if (prev - runStart >= 1) {
    runs.push({ startLine: runStart, endLine: prev, lines: [] });
  }

  return runs;
}

function extractQuestionContexts(lines: string[], windowWordLimit = 120): QuestionContext[] {
  const contexts: QuestionContext[] = [];
  const wordsPerLine = lines.map((line) => (line.match(WORD_REGEX) ?? []).map((word) => word));
  const flatWords = wordsPerLine.flat();

  let cumulativeWords = 0;

  lines.forEach((line, index) => {
    const questions = line.match(/[^?]*\?/g);
    if (!questions) {
      cumulativeWords += wordsPerLine[index].length;
      return;
    }

    questions.forEach((question) => {
      const questionWordCount = countWords(question);
      const contextStart = Math.max(cumulativeWords - windowWordLimit, 0);
      const contextEnd = Math.min(cumulativeWords + questionWordCount + windowWordLimit, flatWords.length);
      const contextWords = flatWords.slice(contextStart, contextEnd).join(' ');
      contexts.push({
        lineIndex: index + 1,
        question: question.trim(),
        contextStart,
        contextEnd,
        contextText: contextWords
      });
      cumulativeWords += questionWordCount;
    });
  });

  return contexts;
}

function generateReport(filePath: string, reportPath: string) {
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.replace(/\r\n/g, '\n').split('\n');
  const totalLines = lines.length;
  const totalWords = countWords(original);

  const lineWordCounts = lines.map((line) => countWords(line));
  const shortLineIndices = lineWordCounts
    .map((count, index) => (count > 0 && count <= 6 ? index + 1 : -1))
    .filter((index) => index > 0);

  const staccatoLinesDetail = shortLineIndices.map((lineIndex) => ({
    index: lineIndex,
    text: lines[lineIndex - 1]
  }));

  const windows = computeStaccatoWindows(lines);
  const worstWindows = [...windows]
    .sort((a, b) => b.staccatoShare - a.staccatoShare)
    .slice(0, 10);

  const consecutiveRuns = findConsecutiveShortRuns(shortLineIndices).map((run) => ({
    startLine: run.startLine,
    endLine: run.endLine,
    lines: lines.slice(run.startLine - 1, run.endLine)
  }));

  const questionContexts = extractQuestionContexts(lines);
  const histogram = bucketLineLengths(lineWordCounts);

  const summaryRows = [
    ['totalWords', totalWords.toString()],
    ['totalLines', totalLines.toString()],
    ['shortLineCount', shortLineIndices.length.toString()],
    ['questionCount', questionContexts.length.toString()]
  ];

  const histogramRows = Array.from(histogram.entries()).map(([bucket, count]) => [bucket, String(count)]);
  const windowRows = worstWindows.map((window) => [
    `${window.startWord}-${window.endWord}`,
    window.staccatoShare.toFixed(2),
    window.questionCount.toString(),
    window.shortLines.map((shortLine) => `L${shortLine.index}`).join(', ')
  ]);

  const candidateLines = Array.from(new Set([...shortLineIndices])).sort((a, b) => a - b);
  const candidateCodeBlock = candidateLines
    .map((index) => `L${index}: ${lines[index - 1]}`)
    .join('\n');

  const markdownParts = [
    `# Diagnostics for ${path.basename(filePath)}\n`,
    '## Summary\n',
    formatTable(['Metric', 'Value'], summaryRows) + '\n',
    '## Line Length Histogram\n',
    formatTable(['Bucket', 'Count'], histogramRows) + '\n',
    '## Top 10 Windows (200 words)\n',
    formatTable(['Word Span', 'StaccatoShare', 'Questions', 'Short Lines'], windowRows) + '\n',
    '## Consecutive Short-Line Runs\n',
    consecutiveRuns.length
      ? consecutiveRuns
          .map((run) => `- Lines ${run.startLine}-${run.endLine}:\n\n${run.lines.map((line, idx) => `  - L${run.startLine + idx}: ${line}`).join('\n')}`)
          .join('\n\n')
      : '_None_\n',
    '\n## Question Contexts\n',
    questionContexts.length
      ? questionContexts
          .map((context) => `- L${context.lineIndex}: ${context.question}\n  - Context (${context.contextStart}-${context.contextEnd} words): ${context.contextText}`)
          .join('\n\n')
      : '_None_\n',
    '\n## Candidate Lines for Merging\n',
    candidateCodeBlock ? `\n\n
${candidateCodeBlock}

` : '_None_\n'
  ];

  fs.writeFileSync(reportPath, markdownParts.join('\n'), 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: ts-node scripts/diag_v54_staccato.ts <reading-file> [...more]');
    process.exit(1);
  }

  args.forEach((inputPath) => {
    const resolved = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${inputPath}`);
      return;
    }
    const basename = path.basename(resolved).replace(/\.[^.]+$/, '');
    const reportPath = path.resolve(process.cwd(), 'output', `DIAG__${basename}.md`);
    console.log(`[diag] Processing ${resolved}`);
    generateReport(resolved, reportPath);
    console.log(`[diag] Report written to ${reportPath}`);
  });
}

main();
