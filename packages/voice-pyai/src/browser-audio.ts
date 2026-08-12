/**
 * Browser audio for Omni: 24 kHz PCM16 in both directions.
 *
 * Capture uses echo cancellation and noise suppression so the agent does not
 * hear itself. Playback keeps a queue that `clear()` empties instantly, which
 * is what makes barge-in feel immediate rather than "finishes the sentence
 * then stops".
 *
 * ScriptProcessor is deprecated but is one file and works everywhere; an
 * AudioWorklet would need a separate served module for no demo-visible gain.
 */

const RATE = 24000;

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
  const source = ctx.createMediaStreamSource(stream);
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
  // Zero-gain sink: required for the processor to run, silent to the user.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute);
  mute.connect(ctx.destination);

  return () => {
    node.onaudioprocess = null;
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}

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
    const pcm = new Int16Array(chunk);
    const buffer = ctx.createBuffer(1, pcm.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (cursor < now) cursor = now;
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
    cursor = ctx.currentTime;
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
