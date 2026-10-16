// Split the eight paragraphs only when all seven deliberately inserted pauses exist.
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LISTENING_PASSAGES } from '../src/listening.js';
const [batch, approvedSample] = process.argv.slice(2);
if (!batch || !approvedSample)
  throw Error('Provide batch MP3 and approved first passage MP3.');
const run = (args) => {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status) throw Error(r.stderr);
  return r.stderr;
};
const probe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', batch],
  { encoding: 'utf8' },
);
if (probe.status) throw Error(probe.stderr);
const duration = Number(JSON.parse(probe.stdout).format.duration);
const log = run([
  '-hide_banner',
  '-i',
  batch,
  '-af',
  'silencedetect=noise=-45dB:d=5',
  '-f',
  'null',
  '-',
]);
const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) =>
  Number(m[1]),
);
const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) =>
  Number(m[1]),
);
if (
  starts.length !== 7 ||
  ends.length !== 7 ||
  starts.some((s, i) => ends[i] - s < 8)
)
  throw Error(
    'Expected exactly seven long paragraph gaps; inspect instead of guessing cuts.',
  );
const out = resolve(import.meta.dirname, '../public/assets/listening');
await mkdir(out, { recursive: true });
run([
  '-hide_banner',
  '-y',
  '-i',
  approvedSample,
  '-c:a',
  'libmp3lame',
  '-b:a',
  '64k',
  resolve(out, LISTENING_PASSAGES[0].id + '.mp3'),
]);
for (let i = 0; i < 8; i++) {
  const from = i ? ends[i - 1] - 0.2 : 0;
  const to = i < 7 ? starts[i] + 0.25 : duration;
  if (to - from < 5 || to - from > 90)
    throw Error('Unexpected passage duration.');
  const p = LISTENING_PASSAGES[i + 1];
  run([
    '-hide_banner',
    '-y',
    '-ss',
    String(from),
    '-i',
    batch,
    '-t',
    String(to - from),
    '-vn',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    resolve(out, p.id + '.mp3'),
  ]);
  console.log(p.id + ': ' + (to - from).toFixed(2) + ' seconds');
}
