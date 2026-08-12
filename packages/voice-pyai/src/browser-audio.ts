/**
 * Browser audio for Omni: 24 kHz PCM16 in both directions.
 *
 * Capture uses echo cancellation and noise suppression so the agent does not
 * hear itself. Playback keeps a queue that `clear()` empties instantly, which
 * is what makes barge-in feel immediate rather than "finishes the sentence
 * then stops".
 *
 * Capture runs in an AudioWorklet, on the audio thread. `ScriptProcessor` — the
 * one-file option this used to use — delivers its callbacks on the main thread,
 * so it competes with whatever the host page is doing. On a quiet demo page that
 * is invisible; on a real dashboard busy with its own scripts, callbacks arrive
 * late and the captured audio stutters, which the model hears as a chopped-up
 * sentence. The worklet is loaded from a blob URL so it stays a single file
 * with nothing extra to serve, and `ScriptProcessor` remains the fallback for
 * anywhere the worklet cannot load.
 */

const RATE = 24000;

/**
 * Runs on the audio thread. Accumulates 128-frame render quanta into ~40 ms
 * chunks so the socket is not woken hundreds of times a second.
 */
const CAPTURE_WORKLET = `
class MinuteOneCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Int16Array(1024);
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const c = Math.max(-1, Math.min(1, input[i]));
      this.chunk[this.filled++] = c < 0 ? c * 0x8000 : c * 0x7fff;
      if (this.filled === this.chunk.length) {
        const out = this.chunk.slice();
        this.port.postMessage(out.buffer, [out.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('minute-one-capture', MinuteOneCapture);
`;

export async function startMicrophone(
  onChunk: (pcm: ArrayBuffer) => void
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new AudioContext({ sampleRate: RATE });
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);

  // Zero-gain sink. The worklet needs a route to the destination to be pulled,
  // and this keeps the user from hearing their own microphone.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  mute.connect(ctx.destination);

  let disconnectNode: () => void;

  try {
    const url = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET], { type: "application/javascript" })
    );
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const node = new AudioWorkletNode(ctx, "minute-one-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) =>
      onChunk(event.data);

    source.connect(node);
    node.connect(mute);
    disconnectNode = () => {
      node.port.onmessage = null;
      node.disconnect();
    };
  } catch (err) {
    // A page whose CSP forbids blob workers, or an older browser. Capture still
    // has to work; it is just back on the main thread.
    console.warn(
      "[minute-one] AudioWorklet capture unavailable, falling back to ScriptProcessor:",
      err
    );
    const node = ctx.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const clamped = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }
      onChunk(pcm.buffer);
    };
    source.connect(node);
    node.connect(mute);
    disconnectNode = () => {
      node.onaudioprocess = null;
      node.disconnect();
    };
  }

  return () => {
    disconnectNode();
    source.disconnect();
    mute.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}

/**
 * How far ahead of the clock the first chunk of a phrase is scheduled.
 *
 * Chunks are played back-to-back off a moving cursor. With no lead, the cursor
 * sits exactly at "now", so any chunk that arrives even slightly late finds the
 * clock already past it: playback restarts at `now` and the listener hears a
 * gap. Over a phrase that is a steady stutter, and it gets worse on a busy host
 * page, where the main thread is competing with the host's own work.
 *
 * 120 ms buys enough slack to absorb ordinary network and scheduling jitter
 * while staying far below the point where a reply feels delayed.
 */
const JITTER_LEAD_SECONDS = 0.12;

export async function createPlayback(): Promise<{
  push: (chunk: ArrayBuffer) => void;
  clear: () => void;
  stop: () => void;
}> {
  const ctx = new AudioContext({ sampleRate: RATE });
  let cursor = 0;
  let sources: AudioBufferSourceNode[] = [];

  const push = (chunk: ArrayBuffer) => {
    if (chunk.byteLength < 2) return;

    // A context created before a user gesture starts suspended, and every
    // scheduled chunk would silently never play.
    if (ctx.state === "suspended") void ctx.resume();

    const pcm = new Int16Array(chunk);
    const buffer = ctx.createBuffer(1, pcm.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // Behind the clock means the queue drained — the start of a phrase, or a
    // late chunk. Restart with a lead rather than at the bare current time.
    const now = ctx.currentTime;
    if (cursor < now) cursor = now + JITTER_LEAD_SECONDS;
    src.start(cursor);
    cursor += buffer.duration;

    sources.push(src);
    src.onended = () => {
      sources = sources.filter((s) => s !== src);
    };
  };

  const clear = () => {
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already ended
      }
    });
    sources = [];
    // Not `currentTime`: the next chunk after a barge-in is the first of a new
    // phrase and needs the same lead, or the reply starts by stuttering.
    cursor = 0;
  };

  return {
    push,
    clear,
    stop: () => {
      clear();
      void ctx.close();
    },
  };
}
