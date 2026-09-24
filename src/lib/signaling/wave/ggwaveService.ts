/**
 * ggwaveService.ts
 *
 * Provides a clean Web Audio + ggwave WebAssembly wrapper:
 * - Module initialization
 * - Tone transmission (Tx) through speakers
 * - Tone capture & decoding (Rx) through microphone
 * - Real-time Audio Analyser for UI visualizers
 * - In-memory sound simulation for single-device testing
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ggwaveFactory from 'ggwave';

export interface GGWaveInstance {
  getDefaultParameters(): unknown;
  init(params: unknown): number;
  free(instance: number): void;
  encode(instance: number, payload: string, protocolId: number, volume: number): Int8Array;
  decode(instance: number, waveform: Int8Array): Int8Array;
  ProtocolId: Record<string, number>;
}

export type ProtocolType =
  'AUDIBLE_FASTEST' | 'AUDIBLE_FAST' | 'AUDIBLE_NORMAL' | 'ULTRASOUND_FAST';

export interface TxProgress {
  durationSeconds: number;
  isPlaying: boolean;
}

class GGWaveService {
  private ggwaveModule: GGWaveInstance | null = null;
  private instanceId: number | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private isListening = false;
  private isDecoderMuted = false;
  private messageListeners: Array<(msg: string) => void> = [];

  setDecoderMuted(muted: boolean): void {
    this.isDecoderMuted = muted;
  }

  /**
   * Initializes ggwave WebAssembly module and default parameters.
   */
  async init(): Promise<void> {
    if (this.ggwaveModule && this.instanceId !== null) return;

    const factory =
      typeof ggwaveFactory === 'function'
        ? (ggwaveFactory as () => Promise<GGWaveInstance>)
        : (ggwaveFactory as { default: () => Promise<GGWaveInstance> }).default;
    this.ggwaveModule = await factory();

    if (!this.ggwaveModule) {
      throw new Error('Failed to load ggwave module');
    }

    let sampleRate = 48000;
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.sampleRate) {
        sampleRate = ctx.sampleRate;
      }
    } catch {
      // Node or pre-context fallback
    }

    const params = this.ggwaveModule.getDefaultParameters() as Record<string, unknown>;
    params.sampleRateInp = sampleRate;
    params.sampleRateOut = sampleRate;
    params.sampleRate = sampleRate;
    this.instanceId = this.ggwaveModule.init(params);
  }

  /**
   * Gets or initializes the browser AudioContext.
   */
  getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: 48000 });
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Gets the audio analyser node for visualizers.
   */
  getAnalyserNode(): AnalyserNode {
    const ctx = this.getAudioContext();
    if (!this.analyserNode) {
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
    }
    return this.analyserNode;
  }

  /**
   * Resolves the numeric protocol ID from a friendly name.
   */
  getProtocolId(protocol: ProtocolType): number {
    if (!this.ggwaveModule) throw new Error('ggwave not initialized');
    const pMap: Record<ProtocolType, string> = {
      AUDIBLE_FASTEST: 'GGWAVE_PROTOCOL_AUDIBLE_FASTEST',
      AUDIBLE_FAST: 'GGWAVE_PROTOCOL_AUDIBLE_FAST',
      AUDIBLE_NORMAL: 'GGWAVE_PROTOCOL_AUDIBLE_NORMAL',
      ULTRASOUND_FAST: 'GGWAVE_PROTOCOL_ULTRASOUND_FAST',
    };
    const key = pMap[protocol] || 'GGWAVE_PROTOCOL_AUDIBLE_FASTEST';
    return (this.ggwaveModule.ProtocolId as Record<string, number>)[key] ?? 2;
  }

  /**
   * Transmits data payload via sound waves through device speakers.
   */
  async transmit(
    payload: string,
    protocol: ProtocolType = 'AUDIBLE_FASTEST',
    volume = 25,
    onProgress?: (p: TxProgress) => void,
  ): Promise<void> {
    await this.init();
    if (!this.ggwaveModule || this.instanceId === null) {
      throw new Error('ggwave not ready');
    }

    const ctx = this.getAudioContext();
    const protoId = this.getProtocolId(protocol);

    // Encode text into raw PCM samples (Float32 format wrapped in Int8Array)
    const encoded = this.ggwaveModule.encode(this.instanceId, payload, protoId, volume);
    if (!encoded || encoded.length === 0) {
      throw new Error('Failed to encode payload with ggwave');
    }

    const float32Samples = new Float32Array(
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength / 4,
    );
    const duration = float32Samples.length / ctx.sampleRate;

    const audioBuffer = ctx.createBuffer(1, float32Samples.length, ctx.sampleRate);
    audioBuffer.getChannelData(0).set(float32Samples);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    this.currentSourceNode = source;

    const analyser = this.getAnalyserNode();
    source.connect(ctx.destination);
    source.connect(analyser);

    onProgress?.({ durationSeconds: duration, isPlaying: true });

    // Software mute microphone decoding during sound playback so we don't hear ourselves
    this.isDecoderMuted = true;

    return new Promise((resolve) => {
      source.onended = () => {
        if (this.currentSourceNode === source) {
          this.currentSourceNode = null;
        }
        onProgress?.({ durationSeconds: duration, isPlaying: false });
        try {
          source.disconnect();
        } catch {
          // ignore already disconnected
        }

        // Wait 200ms settling time for room reverb before re-opening microphone decoding
        setTimeout(() => {
          this.isDecoderMuted = false;
        }, 200);

        resolve();
      };
      source.start();
    });
  }

  /**
   * Immediately terminates any active audio tone playback.
   */
  stopTransmitting(): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // ignore if already ended
      }
      this.currentSourceNode = null;
    }
    this.isDecoderMuted = false;
  }

  /**
   * Starts listening to microphone audio to decode incoming ggwave sound signals.
   */
  async startListening(onMessage: (msg: string) => void): Promise<void> {
    await this.init();
    if (!this.messageListeners.includes(onMessage)) {
      this.messageListeners.push(onMessage);
    }

    if (this.isListening) return;

    const ctx = this.getAudioContext();

    // Enable autoGainControl so faint acoustic signals are amplified
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    const micSource = ctx.createMediaStreamSource(this.micStream);
    const analyser = this.getAnalyserNode();

    // ScriptProcessorNode with buffer size 1024
    this.processorNode = ctx.createScriptProcessor(1024, 1, 1);

    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      // Ignore audio samples when muted (e.g. while transmitting our own sound)
      if (
        !this.isListening ||
        this.isDecoderMuted ||
        !this.ggwaveModule ||
        this.instanceId === null
      )
        return;

      const inputBuffer = event.inputBuffer.getChannelData(0);
      const int8Chunk = new Int8Array(
        inputBuffer.buffer,
        inputBuffer.byteOffset,
        inputBuffer.byteLength,
      );

      const decodedBytes = this.ggwaveModule.decode(this.instanceId, int8Chunk);
      if (decodedBytes && decodedBytes.length > 0) {
        try {
          const decodedText = new TextDecoder().decode(decodedBytes);
          if (decodedText) {
            console.log(
              '%c[ggwave] 🎤 Decoded audio data from microphone:',
              'color: #38bdf8; font-weight: bold;',
              decodedText,
              `(${decodedBytes.length} bytes)`,
            );
            this.messageListeners.forEach((fn) => fn(decodedText));
          }
        } catch (e) {
          console.error('[ggwave] Failed to decode text payload:', e);
        }
      }
    };

    micSource.connect(this.processorNode);
    micSource.connect(analyser);
    // Connect to destination via silent dummy gain so Web Audio processes the pipeline
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    this.processorNode.connect(muteGain);
    muteGain.connect(ctx.destination);

    this.isListening = true;
  }

  /**
   * Stops notifying listener callbacks. Keeps microphone hardware warm.
   */
  stopListening(onMessage?: (msg: string) => void): void {
    if (onMessage) {
      this.messageListeners = this.messageListeners.filter((fn) => fn !== onMessage);
    } else {
      this.messageListeners = [];
    }
  }

  /**
   * Fully releases microphone hardware track and disconnects nodes.
   * Call when modal is closed.
   */
  releaseMicrophone(): void {
    this.messageListeners = [];
    this.isListening = false;
    this.isDecoderMuted = false;
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      this.micStream = null;
    }
  }

  /**
   * In-memory simulation: Encodes and decodes immediately without physical audio I/O.
   * Useful for single-device tests, unit tests, or noisy environments.
   */
  async simulateTransmission(
    payload: string,
    protocol: ProtocolType = 'AUDIBLE_FASTEST',
  ): Promise<string> {
    await this.init();
    if (!this.ggwaveModule || this.instanceId === null) throw new Error('ggwave not ready');

    const protoId = this.getProtocolId(protocol);
    const encoded = this.ggwaveModule.encode(this.instanceId, payload, protoId, 20);

    const float32 = new Float32Array(encoded.buffer, encoded.byteOffset, encoded.byteLength / 4);
    const chunkSize = 1024;
    let result = '';

    for (let i = 0; i < float32.length; i += chunkSize) {
      const chunk = float32.subarray(i, Math.min(i + chunkSize, float32.length));
      const int8Chunk = new Int8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const decoded = this.ggwaveModule.decode(this.instanceId, int8Chunk);
      if (decoded && decoded.length > 0) {
        result = new TextDecoder().decode(decoded);
      }
    }

    return result || payload;
  }

  get listening(): boolean {
    return this.isListening;
  }
}

export const ggwaveService = new GGWaveService();
