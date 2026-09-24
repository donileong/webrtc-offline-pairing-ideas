/**
 * QrSignalingAdapter.ts
 *
 * Implements SignalingAdapter for visual QR-code exchange:
 * - Device 1 generates & displays Offer QR Code.
 * - Device 2 scans Offer QR Code using camera, displays Answer QR Code.
 * - Device 1 scans Answer QR Code to complete pairing.
 */

import type { SignalingAdapter, SignalingProgress } from '../types';

export class QrSignalingAdapter implements SignalingAdapter {
  readonly id = 'qr';
  readonly name = 'QR Code';
  readonly description = 'Scan screen codes between devices with cameras';
  readonly icon = '📷';

  public currentQrPayload = '';
  public qrType: 'offer' | 'answer' | null = null;
  public isScanning = false;
  public expectingType: 'offer' | 'answer' | null = null;

  public onProgress?: (progress: SignalingProgress) => void;
  public onSignalDebug?: (transmitted: string, received: string) => void;
  public onQrDisplay?: (payload: string, type: 'offer' | 'answer') => void;
  public onScanRequested?: (expecting: 'offer' | 'answer' | 'any') => void;

  private offerResolver?: (offer: string) => void;
  private answerResolver?: (answer: string) => void;
  private anySignalResolver?: (signal: string) => void;
  private lastTransmitted = '';
  private lastReceived = '';

  async broadcastOffer(offerPayload: string): Promise<void> {
    this.currentQrPayload = offerPayload;
    this.qrType = 'offer';
    this.lastTransmitted = offerPayload;
    this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
    this.onQrDisplay?.(offerPayload, 'offer');
    this.onProgress?.({
      status: 'Showing Offer QR code. Point other camera at this code.',
    });
  }

  async listenForOffer(): Promise<string> {
    this.isScanning = true;
    this.expectingType = 'offer';
    this.onScanRequested?.('offer');
    this.onProgress?.({
      status: 'Camera ready. Scan the Offer QR code on Device 1.',
    });

    return new Promise<string>((resolve) => {
      this.offerResolver = resolve;
    });
  }

  async listenForAnySignal(): Promise<string> {
    this.isScanning = true;
    this.expectingType = null;
    this.onScanRequested?.('any');
    this.onProgress?.({
      status: 'Point camera at the other screen, or let them scan this screen.',
    });

    return new Promise<string>((resolve) => {
      this.anySignalResolver = resolve;
    });
  }

  async sendAnswer(answerPayload: string): Promise<void> {
    this.currentQrPayload = answerPayload;
    this.qrType = 'answer';
    this.lastTransmitted = answerPayload;
    this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
    this.onQrDisplay?.(answerPayload, 'answer');
    this.onProgress?.({
      status: 'Showing Answer QR code. Point other camera at this code.',
    });
  }

  async listenForAnswer(): Promise<string> {
    this.isScanning = true;
    this.expectingType = 'answer';
    this.onScanRequested?.('answer');
    this.onProgress?.({
      status: "Scan Device 2's Answer QR code with camera to connect.",
    });

    return new Promise<string>((resolve) => {
      this.answerResolver = resolve;
    });
  }

  handleScannedPayload(payload: string): boolean {
    const trimmed = payload.trim();
    if (this.anySignalResolver && (trimmed.startsWith('O|') || trimmed.startsWith('A|'))) {
      this.lastReceived = trimmed;
      this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
      const resolve = this.anySignalResolver;
      this.anySignalResolver = undefined;
      this.isScanning = false;
      this.expectingType = null;
      resolve(trimmed);
      return true;
    }
    if (trimmed.startsWith('O|') && this.offerResolver) {
      this.lastReceived = trimmed;
      this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
      const resolve = this.offerResolver;
      this.offerResolver = undefined;
      this.isScanning = false;
      this.expectingType = null;
      resolve(trimmed);
      return true;
    } else if (trimmed.startsWith('A|') && this.answerResolver) {
      this.lastReceived = trimmed;
      this.onSignalDebug?.(this.lastTransmitted, this.lastReceived);
      const resolve = this.answerResolver;
      this.answerResolver = undefined;
      this.isScanning = false;
      this.expectingType = null;
      resolve(trimmed);
      return true;
    }
    return false;
  }

  cleanup(): void {
    this.isScanning = false;
    this.expectingType = null;
    this.offerResolver = undefined;
    this.answerResolver = undefined;
    this.anySignalResolver = undefined;
    this.currentQrPayload = '';
    this.qrType = null;
  }
}
