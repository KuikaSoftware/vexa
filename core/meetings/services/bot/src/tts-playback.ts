/**
 * TTS playback adapter (2b) — the OS-level half of the SPEAK path.  // L4 (O6/VM).
 *
 * The browser half (unmute the meeting-UI mic) lives in capture-bridge.ts's SpeakController; this
 * is the audio half: synthesize `text` via the Vexa TTS service and play the returned PCM through
 * the container's PulseAudio `tts_sink` (→ `virtual_mic`, which Chromium captures as its mic). The
 * `tts_sink → virtual_mic` graph is created by entrypoint.sh; here we only unmute it during
 * playback, stream PCM to `paplay`, and re-mute after. With `muteBetweenSpeaks: false`
 * (VEXA_MIC_MODE=open) the graph is never muted: it carries silence between speaks.
 *
 * Ported (focused: the streaming-PCM path only — no ffmpeg) from the production bot
 *   services/vexa-bot/core/src/services/tts-playback.ts (synthesizeViaTtsService + (un)mute).
 * acts.v1 `speak` already carries {text, voice} — no contract change. Config is infrastructure
 * (the TTS service URL/token), read from env like production (TTS_SERVICE_URL / TTS_API_TOKEN),
 * NOT the sealed invocation.v1. Gated by the SpeakController on inv.voiceAgentEnabled.
 *
 * Node-only (child_process + http/https) — no DOM, no workspace imports → gate:isolation-clean.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';

const PAPLAY_ARGS = ['--raw', '--format=s16le', '--rate=24000', '--channels=1', '--device=tts_sink'];

function setTtsMute(muted: boolean, log: (m: string) => void): void {
  const v = muted ? '1' : '0';
  try {
    execSync(`pactl set-sink-mute tts_sink ${v}`, { stdio: 'pipe' });
    execSync(`pactl set-source-mute virtual_mic ${v}`, { stdio: 'pipe' });
  } catch (err) {
    log(`[tts] pactl ${muted ? 'mute' : 'unmute'} failed: ${(err as Error).message}`);
  }
}

export interface TtsPlayback {
  /** Synthesize `text` (voice optional) and play it into the meeting via tts_sink. Resolves when
   *  playback finishes. Best-effort: a synthesis/playback failure logs + resolves (never throws out
   *  — the voice handler must not break the orchestrator). */
  speak(text: string, voice?: string): Promise<void>;
  /** Interrupt any in-flight playback (barge-in) + re-mute. */
  stop(): void;
}

export interface TtsPlaybackOptions {
  /** Mute tts_sink/virtual_mic between speaks (the default). False keeps the mic path open. */
  muteBetweenSpeaks?: boolean;
}

/** Build a TtsPlayback that streams the TTS service's PCM straight to paplay. */
export function createTtsPlayback(
  log: (m: string) => void = () => { /* */ },
  { muteBetweenSpeaks = true }: TtsPlaybackOptions = {},
): TtsPlayback {
  let proc: ChildProcess | null = null;
  const setMute = (muted: boolean): void => { if (muteBetweenSpeaks) setTtsMute(muted, log); };

  const stop = (): void => {
    if (proc) {
      try { proc.stdin?.destroy(); proc.kill('SIGKILL'); } catch { /* */ }
      proc = null;
    }
    setMute(true);
  };

  const speak = async (text: string, voice = 'auto'): Promise<void> => {
    const base = process.env.TTS_SERVICE_URL?.trim();
    if (!base) { log('[tts] TTS_SERVICE_URL not set — speak is a no-op'); return; }
    const postData = JSON.stringify({ model: 'tts-1', input: text, voice, response_format: 'pcm' });
    let url: URL;
    try { url = new URL(`${base.replace(/\/$/, '')}/v1/audio/speech`); }
    catch { log(`[tts] bad TTS_SERVICE_URL: ${base}`); return; }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(postData)),
    };
    const token = process.env.TTS_API_TOKEN?.trim();
    if (token) headers['X-API-Key'] = token;

    await new Promise<void>((resolve) => {
      const req = (url.protocol === 'https:' ? https : http).request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      }, (res) => {
        if (res.statusCode !== 200) {
          let body = ''; res.on('data', (c) => (body += c));
          res.on('end', () => { log(`[tts] service ${res.statusCode}: ${body.slice(0, 120)}`); resolve(); });
          return;
        }
        setMute(false);                               // open the mic only during playback
        const p = spawn('paplay', PAPLAY_ARGS, { stdio: ['pipe', 'pipe', 'pipe'] });
        proc = p;
        p.stderr?.on('data', (d: Buffer) => log(`[tts] paplay: ${d.toString().trim()}`));
        const done = () => { if (proc === p) proc = null; setMute(true); resolve(); };
        p.on('exit', done);
        p.on('error', (e) => { log(`[tts] paplay error: ${String(e)}`); done(); });
        res.pipe(p.stdin!);                           // stream PCM straight to the mic sink
      });
      req.on('error', (e) => { log(`[tts] request error: ${String(e)}`); resolve(); });
      req.write(postData); req.end();
    });
  };

  return { speak, stop };
}
