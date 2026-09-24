/**
 * types.ts
 *
 * Core interfaces for P2P Transports (Direct WebRTC, Trystero, etc.)
 */

export type ConnectionState =
  | 'idle'
  | 'generating-offer'
  | 'broadcasting-offer'
  | 'waiting-answer'
  | 'listening-offer'
  | 'generating-answer'
  | 'broadcasting-answer'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
}

export interface FileTransferMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface FileTransferProgress {
  meta: FileTransferMeta;
  receivedBytes: number;
  totalBytes: number;
  percentage: number;
  blobUrl?: string;
}

import type { SignalingAdapter } from '../signaling/types';

export interface PeerTransport {
  readonly id: string;
  readonly name: string;
  state: ConnectionState;
  role: 'host' | 'joiner' | null;
  statusMessage: string;
  latencyMs: number | null;

  sendMessage(text: string): ChatMessage;
  sendFile(file: File, onProgress?: (pct: number) => void): Promise<void>;
  close(): void;
  simulateLoopback(): void;
  startHost(adapter: SignalingAdapter): Promise<void>;
  startJoiner(adapter: SignalingAdapter): Promise<void>;
  startAutoPair(adapter: SignalingAdapter): Promise<void>;

  onStateChange?: (state: ConnectionState, message: string) => void;
  onChatMessage?: (msg: ChatMessage) => void;
  onFileProgress?: (progress: FileTransferProgress) => void;
  onLatencyUpdate?: (latencyMs: number) => void;
}
