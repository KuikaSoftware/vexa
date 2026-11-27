/**
 * How the bot holds its meeting microphone: `VEXA_MIC_MODE`, infrastructure config read from env like
 * TTS_SERVICE_URL (not the sealed invocation.v1).
 *
 *   toggle (default)  the PulseAudio mic source is muted between speaks, and the meeting UI's mic is
 *                     muted at join and clicked on and off around every speak.
 *   open              the source stays live (it carries silence between speaks) and the meeting mic is
 *                     never touched. Teams shows a muted source as "mic off" and drops the first second
 *                     of each speak while it reopens; the clicks also fall out of step when two speaks
 *                     overlap. The entrypoint then plays the meeting into a sink of its own, so the
 *                     meeting's audio cannot loop back into the mic.
 */
export type MicMode = "toggle" | "open";

export function micMode(env: NodeJS.ProcessEnv = process.env): MicMode {
  return env.VEXA_MIC_MODE?.trim().toLowerCase() === "open" ? "open" : "toggle";
}
