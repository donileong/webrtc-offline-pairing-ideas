/**
 * activeSession.svelte.ts
 *
 * Central reactive Svelte 5 session holding active P2P state across all views.
 */

import { DirectWebRTCTransport } from './DirectWebRTCTransport';
import type { PeerTransport, ConnectionState, ChatMessage, FileTransferProgress } from './types';
import type { SignalingAdapter } from '../signaling/types';
import { router } from '../router/routerStore.svelte';

class ActiveSession {
  public transport = $state<PeerTransport>(new DirectWebRTCTransport());

  public state = $state<ConnectionState>('idle');
  public statusMessage = $state('Ready');
  public role = $state<'host' | 'joiner' | null>(null);
  public chatMessages = $state<ChatMessage[]>([]);
  public fileProgress = $state<FileTransferProgress | null>(null);
  public latencyMs = $state<number | null>(null);

  // Inspector / Debug signals
  public transmittedSignal = $state('');
  public receivedSignal = $state('');
  public pairingStartTime = $state<number | null>(null);
  public pairingDurationSec = $state<number | null>(null);

  constructor() {
    this.bindTransport(this.transport);
  }

  public getDirectTransport(): DirectWebRTCTransport {
    if (!(this.transport instanceof DirectWebRTCTransport)) {
      this.setTransport(new DirectWebRTCTransport());
    }
    return this.transport as DirectWebRTCTransport;
  }

  public setTransport(newTransport: PeerTransport): void {
    if (this.transport && this.transport !== newTransport) {
      this.transport.close();
    }
    this.transport = newTransport;
    this.bindTransport(this.transport);
  }

  private bindTransport(transport: PeerTransport) {
    transport.onStateChange = (newState, msg) => {
      this.state = newState;
      this.statusMessage = msg;
      this.role = transport.role;

      if (transport instanceof DirectWebRTCTransport) {
        this.transmittedSignal = transport.transmittedOfferStr;
        this.receivedSignal = transport.receivedSignalStr;
      }

      if (newState === 'connected') {
        if (this.pairingStartTime) {
          this.pairingDurationSec = Number(
            ((Date.now() - this.pairingStartTime) / 1000).toFixed(2),
          );
        }
        // Auto-navigate to connected room
        if (router.path !== '/room') {
          router.navigate('/room');
        }
      }
    };

    transport.onChatMessage = (msg) => {
      this.chatMessages = [...this.chatMessages, msg];
    };

    transport.onFileProgress = (progress) => {
      this.fileProgress = progress;
    };

    transport.onLatencyUpdate = (lat) => {
      this.latencyMs = lat;
    };
  }

  startPairing(
    mode: 'host' | 'joiner' | 'auto',
    adapter: SignalingAdapter,
  ): Promise<void> {
    this.pairingStartTime = Date.now();
    this.pairingDurationSec = null;
    const transport = this.getDirectTransport();
    if (mode === 'host') {
      return transport.startHost(adapter);
    } else if (mode === 'joiner') {
      return transport.startJoiner(adapter);
    } else {
      return transport.startAutoPair(adapter);
    }
  }

  sendChatMessage(text: string): ChatMessage {
    const msg = this.transport.sendMessage(text);
    this.chatMessages = [...this.chatMessages, msg];
    return msg;
  }

  async sendFile(file: File, onProgress?: (pct: number) => void): Promise<void> {
    await this.transport.sendFile(file, onProgress);
  }

  reset(): void {
    this.transport.close();
    this.state = 'idle';
    this.statusMessage = 'Ready';
    this.role = null;
    this.chatMessages = [];
    this.fileProgress = null;
    this.latencyMs = null;
    this.transmittedSignal = '';
    this.receivedSignal = '';
    this.pairingStartTime = null;
    this.pairingDurationSec = null;
  }
}

export const activeSession = new ActiveSession();
