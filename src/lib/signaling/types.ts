/**
 * types.ts
 *
 * Defines the contract for physical/out-of-band signaling adapters
 * (Wave/Sound, QR Code, Manual Copy/Paste, etc.) used to exchange
 * WebRTC Offer/Answer compact payloads.
 */

export type SignalingRole = 'host' | 'joiner';

export interface SignalingProgress {
  status: string;
  percentage?: number;
  isTransmitting?: boolean;
}

export interface SignalingAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;

  /**
   * Device 1 (Host): Transmits/broadcasts the generated compact offer payload.
   */
  broadcastOffer(offerPayload: string): Promise<void>;

  /**
   * Device 2 (Joiner): Listens for or receives the compact offer payload.
   */
  listenForOffer(): Promise<string>;

  /**
   * Device 2 (Joiner): Transmits/broadcasts the generated compact answer payload.
   */
  sendAnswer(answerPayload: string): Promise<void>;

  /**
   * Device 1 (Host): Listens for or receives the compact answer payload from Joiner.
   */
  listenForAnswer(): Promise<string>;

  /**
   * Auto-Pairing mode: listens for either Offer or Answer without predetermined roles.
   */
  listenForAnySignal?(): Promise<string>;

  /**
   * Stops any background listening, audio context, camera streams, etc.
   */
  cleanup(): void;

  /**
   * Optional callbacks for UI feedback
   */
  onProgress?: (progress: SignalingProgress) => void;
  onSignalDebug?: (transmitted: string, received: string) => void;
}
