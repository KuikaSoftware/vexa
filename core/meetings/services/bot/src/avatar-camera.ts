/**
 * The bot's camera shows a picture: invocation.v1 `cameraEnabled` + `defaultAvatarUrl`.
 *
 * The container has no camera, so the page is given one: an init script answers every
 * getUserMedia request for video with a canvas stream that draws the picture, and lists an
 * "Avatar" camera among the devices so the meeting's camera button is enabled. It also sets
 * `window.__vexaCameraSource`, which tells the join flow to turn the camera on instead of off.
 *
 * The picture is resolved to a data: URL on the Node side first: a cross-origin image would taint
 * the canvas, and a tainted canvas cannot be captured.
 */

/** A picture larger than this is not shown (an invocation carries an avatar, not a photo album). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export async function resolveAvatar(
  url: string,
  fetchFn: typeof fetch = fetch,
  log: (m: string) => void = (m) => console.log(m),
): Promise<string | null> {
  const src = url.trim();
  if (src.startsWith('data:image/')) return src.length <= AVATAR_MAX_BYTES * 1.4 ? src : null;
  if (!/^https?:\/\//i.test(src)) {
    log('[bot] avatar: not a data: or http(s) URL; the camera stays off');
    return null;
  }
  try {
    const r = await fetchFn(src, { signal: AbortSignal.timeout(10_000) });
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!r.ok || !type.startsWith('image/')) {
      log(`[bot] avatar: ${r.status} ${type || 'no content-type'}; the camera stays off`);
      return null;
    }
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > AVATAR_MAX_BYTES) {
      log(`[bot] avatar: ${body.length} bytes is too large; the camera stays off`);
      return null;
    }
    return `data:${type};base64,${body.toString('base64')}`;
  } catch (e) {
    log(`[bot] avatar: fetch failed (${String(e)}); the camera stays off`);
    return null;
  }
}

/** The init script that makes ``src`` the page's camera. */
export function avatarCameraScript(src: string): string {
  return `(() => {
  var SRC = ${JSON.stringify(src)};
  var md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  window.__vexaCameraSource = true;
  var img = new Image();
  img.src = SRC;
  var stream = null;
  function track() {
    if (!stream) {
      var c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      var g = c.getContext('2d');
      var draw = function () {
        g.fillStyle = '#202124';
        g.fillRect(0, 0, c.width, c.height);
        if (img.complete) {
          var s = 480;
          try { g.drawImage(img, (c.width - s) / 2, (c.height - s) / 2, s, s); } catch (e) {}
        }
      };
      draw();
      setInterval(draw, 200);
      stream = c.captureStream(5);
    }
    return stream.getVideoTracks()[0].clone();
  }
  var getUserMedia = md.getUserMedia.bind(md);
  md.getUserMedia = function (constraints) {
    if (!constraints || !constraints.video) return getUserMedia(constraints);
    var audio = constraints.audio ? getUserMedia({ audio: constraints.audio }) : Promise.resolve(new MediaStream());
    return audio.then(function (s) { s.addTrack(track()); return s; });
  };
  var enumerateDevices = md.enumerateDevices.bind(md);
  md.enumerateDevices = function () {
    return enumerateDevices().then(function (list) {
      var others = list.filter(function (d) { return d.kind !== 'videoinput'; });
      var cam = { deviceId: 'vexa-avatar', groupId: 'vexa-avatar', kind: 'videoinput', label: 'Avatar' };
      cam.toJSON = function () { return { deviceId: cam.deviceId, groupId: cam.groupId, kind: cam.kind, label: cam.label }; };
      return others.concat([cam]);
    });
  };
})();`;
}

/** Whether this invocation shows a picture as its camera. Google Meet only: in Teams the same
 *  stream made the call fail to start (MediaCreateAnswer localFatal, measured 26.11.2026). */
export function wantsAvatarCamera(inv: { cameraEnabled?: boolean; defaultAvatarUrl?: string; platform?: string }): boolean {
  return !!inv.cameraEnabled && !!inv.defaultAvatarUrl && inv.platform === 'google_meet';
}
