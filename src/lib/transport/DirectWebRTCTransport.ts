/**
 * DirectWebRTCTransport.ts
 *
 * Implements PeerTransport for direct native WebRTC connections.
 * Uses SignalingAdapter to exchange compact SDP payloads out-of-band.
 */

import {
  extractCompactSignal,
  serializeCompactSignal,
  deserializeCompactSignal,
  reconstructSdp,
} from '../webrtc/sdpCompressor';
import type { SignalingAdapter } from '../signaling/types';
import { FileTransferManager } from './FileTransferManager';
import type {
  PeerTransport,
  ConnectionState,
  ChatMessage,
  FileTransferProgress,
} from './types';

export class DirectWebRTCTransport implements PeerTransport {
  readonly id = 'direct-webrtc';
  readonly name = 'Direct WebRTC';

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private activeAdapter: SignalingAdapter | null = null;
  private fileManager = new FileTransferManager();

  public state: ConnectionState = 'idle';
  public role: 'host' | 'joiner' | null = null;
  public statusMessage = 'Ready';
  public transmittedOfferStr = '';
  public receivedSignalStr = '';
  public latencyMs: number | null = null;

  // Event callbacks
  public onStateChange?: (state: ConnectionState, message: string) => void;
  public onChatMessage?: (msg: ChatMessage) => void;
  public onFileProgress?: (progress: FileTransferProgress) => void;
  public onLatencyUpdate?: (latencyMs: number) => void;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sessionSeq = 0;

  private updateState(newState: ConnectionState, message: string) {
    if (
      this.state === 'connected' &&
      (newState === 'connecting' ||
        newState === 'broadcasting-answer' ||
        newState === 'generating-answer')
    ) {
      return;
    }
    this.state = newState;
    this.statusMessage = message;
    this.onStateChange?.(newState, message);
  }

  private waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 800): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let candidateCount = 0;
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup();
          resolve();
        }
      };

      const handleCandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate) {
          candidateCount++;
          if (candidateCount >= 2) {
            setTimeout(() => {
              cleanup();
              resolve();
            }, 250);
          }
        } else {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', checkState);
        pc.removeEventListener('icecandidate', handleCandidate);
      };

      pc.addEventListener('icegatheringstatechange', checkState);
      pc.addEventListener('icecandidate', handleCandidate);
    });
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    this.fileManager.onFileProgress = (progress) => this.onFileProgress?.(progress);

    const onChannelOpen = () => {
      this.updateState('connected', 'Direct WebRTC connection established!');
      this.startPingLoop();

      setTimeout(() => {
        try {
          if (this.dataChannel && this.dataChannel.readyState === 'open') {
            const roleTitle = this.role === 'host' ? 'Host' : 'Joiner';
            const welcomeMsg = this.sendMessage(
              `Hello from ${roleTitle}! Direct P2P DataChannel connected.`,
            );
            this.onChatMessage?.(welcomeMsg);
          }
        } catch (e) {
          console.warn('Welcome message send error:', e);
        }
      }, 300);
    };

    if (channel.readyState === 'open') {
      onChannelOpen();
    } else {
      channel.onopen = onChannelOpen;
    }

    const channelSeq = this.sessionSeq;
    channel.onclose = () => {
      if (this.sessionSeq !== channelSeq) return;
      console.log(
        `%c[DirectWebRTC] 🔌 DataChannel (${this.role}) onclose fired`,
        'color: #ef4444; font-weight: bold;',
      );
      this.stopPingLoop();
      this.updateState('disconnected', 'WebRTC connection closed.');
    };

    channel.onerror = (err) => {
      console.error(`[DirectWebRTC] ❌ DataChannel (${this.role}) error:`, err);
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'chat') {
            this.onChatMessage?.({
              id: parsed.id || Math.random().toString(),
              sender: 'peer',
              text: parsed.text,
              timestamp: parsed.timestamp || Date.now(),
            });
          } else if (parsed.type === 'ping') {
            channel.send(JSON.stringify({ type: 'pong', time: parsed.time }));
          } else if (parsed.type === 'pong') {
            const rtt = Date.now() - parsed.time;
            this.latencyMs = rtt;
            this.onLatencyUpdate?.(rtt);
          } else if (parsed.type === 'file-start') {
            this.fileManager.handleFileStart(parsed.meta);
          }
        } catch {
          this.onChatMessage?.({
            id: Math.random().toString(),
            sender: 'peer',
            text: event.data,
            timestamp: Date.now(),
          });
        }
      } else if (event.data instanceof ArrayBuffer) {
        this.fileManager.handleChunk(event.data);
      }
    };
  }

  async startHost(adapter: SignalingAdapter): Promise<void> {
    this.close();
    this.role = 'host';
    this.activeAdapter = adapter;
    const currentSeq = ++this.sessionSeq;

    try {
      this.updateState('generating-offer', 'Creating WebRTC Offer...');

      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      const handleStateUpdate = () => {
        if (this.sessionSeq !== currentSeq) return;
        const connState = this.pc?.connectionState;
        const iceState = this.pc?.iceConnectionState;
        console.log(
          `%c[DirectWebRTC] 📡 Host WebRTC: connState="${connState}", iceState="${iceState}", dcState="${this.dataChannel?.readyState}"`,
          'color: #f59e0b; font-weight: bold;',
        );
        if (connState === 'connected' && this.dataChannel?.readyState === 'open') {
          this.updateState('connected', 'Direct WebRTC connection established!');
        } else if (connState === 'failed') {
          this.updateState('error', 'WebRTC connection failed (ICE candidate unreachable).');
        }
      };

      this.pc.onconnectionstatechange = handleStateUpdate;
      this.pc.oniceconnectionstatechange = handleStateUpdate;

      const dc = this.pc.createDataChannel('peer-box-channel', { ordered: true });
      this.setupDataChannel(dc);

      const offer = await this.pc.createOffer();
      if (this.sessionSeq !== currentSeq) return;
      await this.pc.setLocalDescription(offer);

      await this.waitForIceGathering(this.pc);
      if (this.sessionSeq !== currentSeq) return;

      const fullSdp = this.pc.localDescription?.sdp || '';
      const compact = extractCompactSignal('offer', fullSdp);
      const signalPayload = serializeCompactSignal(compact);
      this.transmittedOfferStr = signalPayload;

      this.updateState('broadcasting-offer', `Broadcasting Offer via ${adapter.name}...`);
      await adapter.broadcastOffer(signalPayload);
      if (this.sessionSeq !== currentSeq) return;

      this.updateState('waiting-answer', `Waiting for Answer via ${adapter.name}...`);
      const answerMsg = await adapter.listenForAnswer();
      if (this.sessionSeq !== currentSeq) return;
      this.receivedSignalStr = answerMsg;

      this.updateState('connecting', 'Received Answer! Establishing connection...');
      const answerSignal = deserializeCompactSignal(answerMsg);
      const answerSdp = reconstructSdp(answerSignal);
      console.log(
        `%c[DirectWebRTC] 📥 Host applying remote answer SDP...`,
        'color: #38bdf8; font-weight: bold;',
      );
      await this.pc?.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSdp }),
      );
      console.log(
        `%c[DirectWebRTC] 📥 Host applied remote answer. Signaling: ${this.pc?.signalingState}`,
        'color: #38bdf8; font-weight: bold;',
      );
    } catch (err: unknown) {
      if (this.sessionSeq !== currentSeq) return;
      console.error('startHost error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.updateState('error', `Host error: ${errMsg}`);
    }
  }

  async startJoiner(adapter: SignalingAdapter): Promise<void> {
    this.close();
    this.role = 'joiner';
    this.activeAdapter = adapter;
    const currentSeq = ++this.sessionSeq;

    try {
      this.updateState('listening-offer', `Waiting for Offer via ${adapter.name}...`);

      const offerMsg = await adapter.listenForOffer();
      if (this.sessionSeq !== currentSeq) return;
      this.receivedSignalStr = offerMsg;

      this.updateState('generating-answer', 'Received Offer! Generating Answer...');
      const offerSignal = deserializeCompactSignal(offerMsg);
      const offerSdp = reconstructSdp(offerSignal);

      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      const handleStateUpdate = () => {
        if (this.sessionSeq !== currentSeq) return;
        const connState = this.pc?.connectionState;
        const iceState = this.pc?.iceConnectionState;
        console.log(
          `%c[DirectWebRTC] 📡 Joiner WebRTC: connState="${connState}", iceState="${iceState}", dcState="${this.dataChannel?.readyState}"`,
          'color: #38bdf8; font-weight: bold;',
        );
        if (connState === 'connected' && this.dataChannel?.readyState === 'open') {
          this.updateState('connected', 'Direct WebRTC connection established!');
        } else if (connState === 'failed') {
          this.updateState('error', 'WebRTC connection failed (ICE candidate unreachable).');
        }
      };

      this.pc.onconnectionstatechange = handleStateUpdate;
      this.pc.oniceconnectionstatechange = handleStateUpdate;

      this.pc.ondatachannel = (e) => {
        if (this.sessionSeq !== currentSeq) return;
        console.log('[DirectWebRTC] 📥 Joiner received dataChannel event from Host');
        this.setupDataChannel(e.channel);
      };

      await this.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: offerSdp }),
      );
      if (this.sessionSeq !== currentSeq) return;
      const answer = await this.pc.createAnswer();
      if (this.sessionSeq !== currentSeq) return;
      await this.pc.setLocalDescription(answer);

      await this.waitForIceGathering(this.pc);
      if (this.sessionSeq !== currentSeq) return;

      const fullAnswerSdp = this.pc.localDescription?.sdp || '';
      const answerCompact = extractCompactSignal('answer', fullAnswerSdp, offerSignal.sessionId);
      const answerSignalPayload = serializeCompactSignal(answerCompact);
      this.transmittedOfferStr = answerSignalPayload;

      this.updateState('broadcasting-answer', `Sending Answer via ${adapter.name}...`);
      await adapter.sendAnswer(answerSignalPayload);
      if (this.sessionSeq !== currentSeq) return;

      if (this.state !== 'connected') {
        this.updateState('connecting', 'Answer sent! Handshaking WebRTC...');
      }
    } catch (err: unknown) {
      if (this.sessionSeq !== currentSeq) return;
      console.error('startJoiner error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.updateState('error', `Joiner error: ${errMsg}`);
    }
  }

  async startAutoPair(adapter: SignalingAdapter): Promise<void> {
    this.close();
    this.role = null;
    this.activeAdapter = adapter;
    const currentSeq = ++this.sessionSeq;
    const isWave = adapter.id === 'wave';

    try {
      this.updateState('generating-offer', 'Preparing connection...');

      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      this.pc.onconnectionstatechange = () => {
        if (this.sessionSeq !== currentSeq) return;
        if (this.pc?.connectionState === 'connected') {
          this.updateState('connected', 'Connected. Direct P2P link ready.');
        } else if (this.pc?.connectionState === 'failed') {
          this.updateState('error', 'Connection failed. Please retry pairing.');
        }
      };

      const dc = this.pc.createDataChannel('peer-box-channel', { ordered: true });
      this.setupDataChannel(dc);

      const offer = await this.pc.createOffer();
      if (this.sessionSeq !== currentSeq) return;
      await this.pc.setLocalDescription(offer);

      await this.waitForIceGathering(this.pc);
      if (this.sessionSeq !== currentSeq) return;

      const fullSdp = this.pc.localDescription?.sdp || '';
      const compact = extractCompactSignal('offer', fullSdp);
      const signalPayload = serializeCompactSignal(compact);
      this.transmittedOfferStr = signalPayload;

      this.updateState(
        'broadcasting-offer',
        isWave
          ? 'Searching for nearby device...'
          : 'Point camera at the other screen, or let them scan this screen.',
      );
      await adapter.broadcastOffer(signalPayload);
      if (this.sessionSeq !== currentSeq) return;

      if (!adapter.listenForAnySignal) {
        throw new Error(`Adapter ${adapter.name} does not support symmetric auto-pairing`);
      }

      const incomingSignal = await adapter.listenForAnySignal();
      if (this.sessionSeq !== currentSeq) return;
      this.receivedSignalStr = incomingSignal;

      if (incomingSignal.startsWith('A|')) {
        // Received Answer from the other peer -> we are Host!
        this.role = 'host';
        this.updateState(
          'connecting',
          'Device found. Acting as Host. Connection data received, opening room...',
        );
        const answerSignal = deserializeCompactSignal(incomingSignal);
        const answerSdp = reconstructSdp(answerSignal);
        await this.pc?.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: answerSdp }),
        );
      } else if (incomingSignal.startsWith('O|')) {
        // Received Offer from the other peer -> we switch to Joiner!
        this.role = 'joiner';
        this.updateState(
          'generating-answer',
          'Device found. Acting as Joiner. Offer data received, responding...',
        );

        if (this.pc) {
          this.pc.close();
          this.pc = null;
        }

        const remoteOfferSignal = deserializeCompactSignal(incomingSignal);
        const remoteOfferSdp = reconstructSdp(remoteOfferSignal);

        this.pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });

        this.pc.onconnectionstatechange = () => {
          if (this.sessionSeq !== currentSeq) return;
          if (this.pc?.connectionState === 'connected') {
            this.updateState('connected', 'Connected. Direct P2P link ready.');
          }
        };

        this.pc.ondatachannel = (e) => {
          if (this.sessionSeq !== currentSeq) return;
          this.setupDataChannel(e.channel);
        };

        await this.pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: remoteOfferSdp }),
        );
        if (this.sessionSeq !== currentSeq) return;

        const answer = await this.pc.createAnswer();
        if (this.sessionSeq !== currentSeq) return;
        await this.pc.setLocalDescription(answer);

        await this.waitForIceGathering(this.pc);
        if (this.sessionSeq !== currentSeq) return;

        const fullAnswerSdp = this.pc.localDescription?.sdp || '';
        const answerCompact = extractCompactSignal(
          'answer',
          fullAnswerSdp,
          remoteOfferSignal.sessionId,
        );
        const answerSignalPayload = serializeCompactSignal(answerCompact);
        this.transmittedOfferStr = answerSignalPayload;

        this.updateState(
          'broadcasting-answer',
          isWave
            ? 'Sending connection data to Host...'
            : 'Scanned! Show this Answer QR to the other device...',
        );
        await adapter.sendAnswer(answerSignalPayload);
        if (this.sessionSeq !== currentSeq) return;

        if (this.state !== 'connected') {
          this.updateState('connecting', 'Connection data sent. Finalizing link with Host...');
        }
      }
    } catch (err: unknown) {
      if (this.sessionSeq !== currentSeq) return;
      console.error('startAutoPair error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.updateState('error', `Pairing error: ${errMsg}`);
    }
  }

  async simulateLoopback(): Promise<void> {
    this.role = 'host';
    this.close();

    try {
      this.updateState('connecting', 'Simulating in-memory loopback connection...');

      const pcHost = new RTCPeerConnection();
      const pcJoiner = new RTCPeerConnection();

      pcHost.onicecandidate = (e) => {
        if (e.candidate) pcJoiner.addIceCandidate(e.candidate);
      };
      pcJoiner.onicecandidate = (e) => {
        if (e.candidate) pcHost.addIceCandidate(e.candidate);
      };

      pcJoiner.ondatachannel = (e) => {
        const joinerChannel = e.channel;
        joinerChannel.onmessage = (event) => {
          if (typeof event.data === 'string') {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'chat') {
              setTimeout(() => {
                joinerChannel.send(
                  JSON.stringify({
                    type: 'chat',
                    id: Math.random().toString(),
                    text: `Echo: "${parsed.text}"`,
                    timestamp: Date.now(),
                  }),
                );
              }, 400);
            } else if (parsed.type === 'ping') {
              joinerChannel.send(JSON.stringify({ type: 'pong', time: parsed.time }));
            }
          }
        };
      };

      const dc = pcHost.createDataChannel('peer-box-channel');
      this.setupDataChannel(dc);

      const offer = await pcHost.createOffer();
      await pcHost.setLocalDescription(offer);

      const offerCompact = extractCompactSignal('offer', offer.sdp || '');
      this.transmittedOfferStr = serializeCompactSignal(offerCompact);

      const reconstructedOfferSdp = reconstructSdp(offerCompact);
      await pcJoiner.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: reconstructedOfferSdp }),
      );

      const answer = await pcJoiner.createAnswer();
      await pcJoiner.setLocalDescription(answer);

      const answerCompact = extractCompactSignal(
        'answer',
        answer.sdp || '',
        offerCompact.sessionId,
      );
      this.receivedSignalStr = serializeCompactSignal(answerCompact);

      const reconstructedAnswerSdp = reconstructSdp(answerCompact);
      await pcHost.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: reconstructedAnswerSdp }),
      );

      this.pc = pcHost;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.updateState('error', `Loopback error: ${errMsg}`);
    }
  }

  sendMessage(text: string): ChatMessage {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: 'me',
      text,
      timestamp: Date.now(),
    };

    this.dataChannel.send(JSON.stringify({ type: 'chat', ...msg }));
    return msg;
  }

  async sendFile(file: File, onProgress?: (pct: number) => void): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }
    await this.fileManager.sendFile(file, this.dataChannel, onProgress);
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (this.dataChannel?.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({ type: 'ping', time: Date.now() }));
      }
    }, 2000);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  close() {
    if (this.state === 'idle' && !this.pc && !this.dataChannel && !this.activeAdapter) {
      return;
    }
    console.log(`[DirectWebRTC] 🛑 close() called (sessionSeq: ${this.sessionSeq}, role: ${this.role})`);
    this.sessionSeq++;
    this.stopPingLoop();
    this.fileManager.reset();
    if (this.activeAdapter) {
      this.activeAdapter.cleanup();
      this.activeAdapter = null;
    }
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.onmessage = null;
      try {
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.onicecandidate = null;
      this.pc.ondatachannel = null;
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    this.updateState('idle', 'Ready');
    this.transmittedOfferStr = '';
    this.receivedSignalStr = '';
    this.latencyMs = null;
  }
}
