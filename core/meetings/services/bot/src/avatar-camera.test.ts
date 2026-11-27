/**
 * The bot's picture camera (avatar-camera.ts): which invocations get one, how the picture is
 * resolved, and that the page script carries the picture as data, never as code.
 */
import { avatarCameraScript, resolveAvatar, wantsAvatarCamera, AVATAR_MAX_BYTES } from './avatar-camera.js';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
}

const quiet = (): void => {};
const fakeFetch = (status: number, type: string, body: Uint8Array): typeof fetch =>
  (async () => new Response(body, { status, headers: { 'content-type': type } })) as typeof fetch;

(async () => {
  check('Meet with a picture gets a camera', wantsAvatarCamera({ cameraEnabled: true, defaultAvatarUrl: 'data:image/png;base64,AA==', platform: 'google_meet' }));
  check('Teams never does', !wantsAvatarCamera({ cameraEnabled: true, defaultAvatarUrl: 'data:image/png;base64,AA==', platform: 'teams' }));
  check('no picture, no camera', !wantsAvatarCamera({ cameraEnabled: true, platform: 'google_meet' }));
  check('camera not asked for, none', !wantsAvatarCamera({ defaultAvatarUrl: 'data:image/png;base64,AA==', platform: 'google_meet' }));

  check('a data: picture is used as it is', (await resolveAvatar('data:image/svg+xml,%3Csvg/%3E', fakeFetch(500, '', new Uint8Array()), quiet)) === 'data:image/svg+xml,%3Csvg/%3E');
  const png = await resolveAvatar('https://runner/avatar/7/sig', fakeFetch(200, 'image/png; charset=binary', new Uint8Array([1, 2, 3])), quiet);
  check('an http picture becomes a data: URL', png === 'data:image/png;base64,AQID', String(png));
  check('a page is not a picture', (await resolveAvatar('https://runner/x', fakeFetch(200, 'text/html', new Uint8Array([1])), quiet)) === null);
  check('a failed fetch shows nothing', (await resolveAvatar('https://runner/x', fakeFetch(404, 'image/png', new Uint8Array([1])), quiet)) === null);
  check('a huge picture shows nothing', (await resolveAvatar('https://runner/x', fakeFetch(200, 'image/png', new Uint8Array(AVATAR_MAX_BYTES + 1)), quiet)) === null);
  check('file: and other schemes are refused', (await resolveAvatar('file:///etc/passwd', fakeFetch(200, 'image/png', new Uint8Array([1])), quiet)) === null);

  const hostile = 'data:image/svg+xml,";alert(1);//';
  const script = avatarCameraScript(hostile);
  check('the picture is embedded as a JSON string', script.includes(`var SRC = ${JSON.stringify(hostile)};`));
  check('the script marks the page as having its own camera', script.includes('window.__vexaCameraSource = true'));

  if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
})();
