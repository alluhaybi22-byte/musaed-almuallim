// Pin the exact generated transcript to each immutable audio filename.
import { readFile, writeFile } from 'node:fs/promises';
import { LISTENING_PASSAGES } from '../src/listening.js';
const recordings = {};
for (const p of LISTENING_PASSAGES) {
  const path = `./assets/listening/${p.id}.mp3`;
  const bytes = await readFile(
    new URL('../public/' + path.slice(2), import.meta.url),
  );
  if (bytes.length < 1000) throw Error('Empty recording: ' + path);
  recordings[p.id] = {
    path,
    text: p.text,
    voice: 'TTSMaker Yusuf 700612',
    speed: 0.9,
  };
}
await writeFile(
  new URL('../src/listening-recordings.js', import.meta.url),
  '// Generated transcript pins. Changing a passage invalidates mismatched audio.\nexport const LISTENING_RECORDINGS = ' +
    JSON.stringify(recordings, null, 2) +
    ';\n',
);
console.log(
  'Pinned ' + Object.keys(recordings).length + ' offline recordings.',
);
