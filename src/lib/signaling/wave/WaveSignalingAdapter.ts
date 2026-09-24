/**
 * WaveSignalingAdapter.ts
 *
 * Implements Pattern 2: Slotted Leader Election Acoustic Pairing.
 * - Both devices start in a silent listening window (1.8s - 3.0s).
 * - If sound is detected: device marks itself as JOINER and stays listening.
 * - If silence timeout expires: device marks itself as HOST and broadcasts Offer up to 3 times.
 * - 16-second overall watchdog times out and prompts user retry.
 * - Only 2 audio broadcasts needed: Host Offer (O|...) -> Joiner Answer (A|...).
 */

import { ggwaveService, type ProtocolType, type TxProgress } from './ggwaveService';
import type { SignalingAdapter, SignalingProgress } from '../types';
import { isAcousticOffer, isAcousticAnswer } from './acousticFraming';

export type HandshakeState =
  'IDLE' | 'ELECTING' | 'HOST_BROADCASTING' | 'JOINER_LISTENING' | 'CONNECTED' | 'TIMED_OUT';

export class WaveSignalingAdapter implements SignalingAdapter {
  readonly id = 'wave';
  readonly name = 'Sound Wave (ggwave)';
  readonly description = 'Connect nearby devices using acoustic sound chirps';
  readonly icon = '🔊';

  // Ultrasound by default (~16–20 kHz) so humans cannot hear the audio data
  public protocol: ProtocolType = 'ULTRASOUND_FAST';
  public volume = 40;
  public autoPairMode = true;
  public isTransmitting = false;
  public handshakeState: HandshakeState = 'IDLE';
  public electedRole: 'host' | 'joiner' | null = null;
  public broadcastAttempt = 0;

  public onProgress?: (progress: SignalingProgress) => void;
  public onSignalDebug?: (transmitted: string, received: string) => void;
  public onTxProgress?: (progress: TxProgress) => void;
  public onRoleElected?: (role: 'host' | 'joiner') => void;
  public onTimeout?: () => void;

  private activeListener: ((msg: string) => void) | null = null;
  private anySignalResolver: ((signal: string) => void) | null = null;
  private offerResolver: ((offer: string) => void) | null = null;
  private answerResolver: ((answer: string) => void) | null = null;

  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTransmitted = '';
  private lastReceived = '';

  /**
   * Pre-warms ggwave WebAssembly engine and AudioContext.
   */
  async prewarm(): Promise<void> {
    try {
      await ggwaveService.init();
    } catch (e) {
      console.warn('Audio engine pre-warm warning:', e);
    }
  }

  private getProtoLabel(): string {
    return this.protocol === 'ULTRASOUND_FAST' ? 'Ultrasound' : 'Audible';
  }

  async broadcastOffer(offerPayload: string): Promise<void> {
    this.lastTransmitted = offerPayload;
    this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);

    if (this.autoPairMode) {
      // In auto-pair mode, transmission is managed by the leader election phase
      return;
    }

    // Classic manual host mode
    this.onProgress?.({
      status: `Broadcasting Offer via sound (${this.getProtoLabel()})...`,
      isTransmitting: true,
    });

    try {
      await this.transmitTone(offerPayload);
    } finally {
      this.onProgress?.({
        status: 'Offer sent! Listening for Answer tone...',
        isTransmitting: false,
      });
    }
  }

  /**
   * Orchestrates the Slotted Leader Election acoustic pairing.
   */
  async listenForAnySignal(): Promise<string> {
    this.cleanupTimers();
    this.autoPairMode = true;
    this.electedRole = null;
    this.broadcastAttempt = 0;
    this.handshakeState = 'ELECTING';

    return new Promise<string>((resolve) => {
      this.anySignalResolver = resolve;

      this.activeListener = (msg: string) => {
        this.handleIncomingAudioMessage(msg.trim());
      };

      this.onProgress?.({
        status: 'Listening for nearby device...',
        isTransmitting: false,
      });

      ggwaveService.startListening(this.activeListener);

      // Start 16-second overall watchdog
      this.watchdogTimer = setTimeout(() => {
        this.handlePairingTimeout();
      }, 16000);

      // Slotted Leader Election: 1800ms - 3000ms pure listening window
      const listenSlotMs = 1800 + Math.random() * 1200;
      console.log(`[WaveSignaling] Slotted listen window: ${Math.round(listenSlotMs)}ms`);

      this.electionTimer = setTimeout(async () => {
        if (this.handshakeState === 'ELECTING') {
          // Silence timeout expired without hearing any peer -> Elect as HOST!
          await this.electHost();
        }
      }, listenSlotMs);
    });
  }

  private async electHost(): Promise<void> {
    this.clearElectionTimer();
    this.electedRole = 'host';
    this.handshakeState = 'HOST_BROADCASTING';
    this.onRoleElected?.('host');

    console.log(
      '%c[WaveSignaling] Silence timeout expired -> Elected as HOST',
      'color: #f59e0b; font-weight: bold;',
    );
    await this.broadcastHostOffer();
  }

  private async electJoiner(): Promise<void> {
    this.clearElectionTimer();
    this.electedRole = 'joiner';
    this.handshakeState = 'JOINER_LISTENING';
    this.onRoleElected?.('joiner');

    console.log(
      '%c[WaveSignaling] Sound detected -> Elected as JOINER',
      'color: #38bdf8; font-weight: bold;',
    );
    this.onProgress?.({
      status: 'Role: Joiner (Receiving connection data...)',
      isTransmitting: false,
    });
  }

  private async broadcastHostOffer(): Promise<void> {
    if (this.handshakeState !== 'HOST_BROADCASTING' || this.isTransmitting) return;

    this.broadcastAttempt++;
    console.log(
      `[WaveSignaling] Host broadcasting Offer (Attempt ${this.broadcastAttempt} of 3)...`,
    );

    this.onProgress?.({
      status: `Role: Host (Broadcasting data, Attempt ${this.broadcastAttempt} of 3)...`,
      isTransmitting: true,
    });

    await this.transmitTone(this.lastTransmitted);

    if (this.handshakeState === 'HOST_BROADCASTING') {
      this.onProgress?.({
        status: `Role: Host (Listening for Joiner response, Attempt ${this.broadcastAttempt} of 3)...`,
        isTransmitting: false,
      });

      // If more attempts remain, schedule next broadcast after 2.2s listening window
      if (this.broadcastAttempt < 3) {
        this.clearRepeatTimer();
        this.repeatTimer = setTimeout(async () => {
          if (this.handshakeState === 'HOST_BROADCASTING') {
            await this.broadcastHostOffer();
          }
        }, 2200);
      }
    }
  }

  private async handleIncomingAudioMessage(msg: string): Promise<void> {
    console.log(
      '%c[WaveSignaling] Received audio message:',
      'color: #10b981; font-weight: bold;',
      `"${msg.length > 25 ? msg.substring(0, 25) + '...' : msg}"`,
      `| Current State: ${this.handshakeState}`,
    );

    this.lastReceived = msg;
    this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);

    // 1. If currently in ELECTING (initial 1.8s - 3.0s window):
    if (this.handshakeState === 'ELECTING') {
      // Hearing ANY audio means a peer is already chirping -> Yield and become JOINER!
      await this.electJoiner();
    }

    // 2. Offer received (O|...):
    if (isAcousticOffer(msg)) {
      this.cleanupTimers();
      this.electedRole = 'joiner';
      this.handshakeState = 'JOINER_LISTENING';
      this.onRoleElected?.('joiner');

      this.onProgress?.({
        status: 'Connection data received. Generating response...',
        isTransmitting: false,
      });

      const resolve = this.anySignalResolver;
      this.anySignalResolver = null;
      resolve?.(msg);
      return;
    }

    // 3. Answer received (A|...):
    if (isAcousticAnswer(msg)) {
      this.cleanupTimers();
      this.handshakeState = 'CONNECTED';

      this.onProgress?.({
        status: 'Connection data received. Finalizing link...',
        isTransmitting: false,
      });

      const resolve = this.anySignalResolver;
      this.anySignalResolver = null;
      resolve?.(msg);
      return;
    }
  }

  private async transmitTone(payload: string): Promise<void> {
    if (this.isTransmitting) return;
    this.isTransmitting = true;

    console.log(
      '%c[WaveSignaling] 📤 Transmitting audio tone:',
      'color: #f59e0b; font-weight: bold;',
      `"${payload.length > 25 ? payload.substring(0, 25) + '...' : payload}"`,
      `| Protocol: ${this.protocol} | Volume: ${this.volume}% | State: ${this.handshakeState}`,
    );

    try {
      await ggwaveService.transmit(payload, this.protocol, this.volume, (p) => {
        this.onTxProgress?.(p);
      });
    } catch (err) {
      console.warn('Tone transmit error:', err);
    } finally {
      this.isTransmitting = false;
    }
  }

  private handlePairingTimeout(): void {
    if (this.handshakeState === 'CONNECTED') return;

    console.warn('[WaveSignaling] ⏱️ 16-second pairing watchdog timed out.');
    this.cleanupTimers();
    this.handshakeState = 'TIMED_OUT';
    this.isTransmitting = false;

    this.onProgress?.({
      status: 'Pairing timed out — no device reached.',
      isTransmitting: false,
    });

    this.onTimeout?.();
  }

  /**
   * User-triggered immediate chirp button ("Chirp Now" / "Retry").
   */
  async triggerChirpNow(): Promise<void> {
    if (this.isTransmitting) return;
    this.cleanupTimers();

    if (this.handshakeState === 'ELECTING') {
      await this.electHost();
    } else if (this.handshakeState === 'HOST_BROADCASTING') {
      await this.broadcastHostOffer();
    }
  }

  async listenForAnswer(): Promise<string> {
    this.onProgress?.({
      status: 'Listening with microphone for Answer tone from nearby device...',
      isTransmitting: false,
    });

    return new Promise<string>((resolve) => {
      this.answerResolver = resolve;
      this.activeListener = (msg: string) => {
        if (!isAcousticAnswer(msg)) return;
        this.lastReceived = msg;
        this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
        this.cleanup();
        this.answerResolver = null;
        resolve(msg);
      };
      ggwaveService.startListening(this.activeListener);
    });
  }

  async listenForOffer(): Promise<string> {
    this.onProgress?.({
      status: 'Listening with microphone for Offer tone...',
      isTransmitting: false,
    });

    return new Promise<string>((resolve) => {
      this.offerResolver = resolve;
      this.activeListener = (msg: string) => {
        if (!isAcousticOffer(msg)) return;
        this.lastReceived = msg;
        this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
        this.cleanup();
        this.offerResolver = null;
        resolve(msg);
      };
      ggwaveService.startListening(this.activeListener);
    });
  }

  async sendAnswer(answerPayload: string): Promise<void> {
    this.cleanupTimers();
    this.lastTransmitted = answerPayload;
    this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);

    // Turnaround delay (400ms) so Host is ready
    await new Promise((r) => setTimeout(r, 400));

    this.onProgress?.({
      status: 'Sending response data back to Host...',
      isTransmitting: true,
    });

    try {
      await this.transmitTone(answerPayload);
    } finally {
      this.onProgress?.({
        status: 'Response data sent! Establishing P2P link...',
        isTransmitting: false,
      });
    }
  }

  async replayLastTone(): Promise<void> {
    if (!this.lastTransmitted || this.isTransmitting) return;
    this.onProgress?.({
      status: `Replaying sound (${this.getProtoLabel()})...`,
      isTransmitting: true,
    });
    await this.transmitTone(this.lastTransmitted);
    this.onProgress?.({
      status: isAcousticAnswer(this.lastTransmitted)
        ? 'Response sent! Handshaking connection...'
        : 'Sound sent! Listening for response...',
      isTransmitting: false,
    });
  }

  private clearElectionTimer(): void {
    if (this.electionTimer !== null) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  private clearRepeatTimer(): void {
    if (this.repeatTimer !== null) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private clearWatchdogTimer(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private cleanupTimers(): void {
    this.clearElectionTimer();
    this.clearRepeatTimer();
    this.clearWatchdogTimer();
  }

  cleanup(releaseMic = false): void {
    this.cleanupTimers();
    this.handshakeState = 'IDLE';
    this.electedRole = null;
    this.broadcastAttempt = 0;
    this.anySignalResolver = null;
    this.offerResolver = null;
    this.answerResolver = null;
    this.isTransmitting = false;
    this.autoPairMode = false;

    ggwaveService.stopTransmitting();
    if (this.activeListener) {
      ggwaveService.stopListening(this.activeListener);
      this.activeListener = null;
    } else {
      ggwaveService.stopListening();
    }

    if (releaseMic) {
      ggwaveService.releaseMicrophone();
    }
  }
}
