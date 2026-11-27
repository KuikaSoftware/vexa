/** sequential(): overlapping calls run one after another, in order, and a failure does not block. */
import { sequential } from './sequential.js';

let failed = 0;
const check = (name: string, cond: boolean, detail = ''): void => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : '  — ' + detail}`);
  if (!cond) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const log: string[] = [];
  let running = 0;
  let overlapped = false;
  const say = sequential(async (text: string, ms: number) => {
    running++;
    if (running > 1) overlapped = true;
    log.push(`start:${text}`);
    await sleep(ms);
    log.push(`end:${text}`);
    running--;
    if (text === 'bad') throw new Error('tts failed');
  });

  const a = say('first', 30);
  const b = say('bad', 5).catch(() => 'caught');
  const c = say('third', 1);
  await Promise.all([a, b, c]);

  check('calls never overlap', !overlapped);
  check('calls run in call order',
    log.join(',') === 'start:first,end:first,start:bad,end:bad,start:third,end:third', log.join(','));
  check('a failed call reaches its own caller', (await b) === 'caught');
};

main().then(() => {
  if (failed) { console.error(`\n❌ sequential: ${failed} check(s) FAILED.`); process.exit(1); }
  console.log('\n✅ sequential: overlapping speaks play one after another.');
});
