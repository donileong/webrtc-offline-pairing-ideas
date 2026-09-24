/**
 * ManualSignalingAdapter.ts
 *
 * Implements SignalingAdapter for manual copy-pasting of compact SDP strings.
 * Useful for debugging, headless setups, or environments without mic/speakers/camera.
 */

import type { SignalingAdapter, SignalingProgress } from '../types';

export interface ManualSubmitResult {
  success: boolean;
  error?: string;
}

export class ManualSignalingAdapter implements SignalingAdapter {
  readonly id = 'manual';
  readonly name = 'Manual Copy-Paste';
  readonly description = 'Copy and paste compact pairing codes directly';
  readonly icon = '📋';

  public currentPayload = '';
  public payloadType: 'offer' | 'answer' | null = null;
  public waitingFor: 'offer' | 'answer' | null = null;

  public onPayload?: (payload: string, type: 'offer' | 'answer') => void;
  public onWaitingForChange?: (waitingFor: 'offer' | 'answer' | null) => void;
  public onProgress?: (progress: SignalingProgress) => void;
  public onSignalDebug?: (transmitted: string, received: string) => void;

  private offerResolver?: (offer: string) => void;
  private answerResolver?: (answer: string) => void;

  async broadcastOffer(offerPayload: string): Promise<void> {
    this.currentPayload = offerPayload;
    this.payloadType = 'offer';
    this.onPayload?.(offerPayload, 'offer');
    this.onSignalDebug?.(offerPayload, '');
    this.onProgress?.({
      status: 'Copy the Offer code below and send it to Device 2.',
    });
  }

  async listenForOffer(): Promise<string> {
    this.waitingFor = 'offer';
    this.onWaitingForChange?.('offer');
    this.onProgress?.({
      status: 'Paste the Offer code from Device 1 below.',
    });
    return new Promise<string>((resolve) => {
      this.offerResolver = resolve;
    });
  }

  async sendAnswer(answerPayload: string): Promise<void> {
    this.currentPayload = answerPayload;
    this.payloadType = 'answer';
    this.onPayload?.(answerPayload, 'answer');
    this.onSignalDebug?.(answerPayload, '');
    this.onProgress?.({
      status: 'Copy the Answer code below and send it back to Device 1.',
    });
  }

  async listenForAnswer(): Promise<string> {
    this.waitingFor = 'answer';
    this.onWaitingForChange?.('answer');
    this.onProgress?.({
      status: 'Paste the Answer code from Device 2 below.',
    });
    return new Promise<string>((resolve) => {
      this.answerResolver = resolve;
    });
  }

  submitPastedInput(input: string): ManualSubmitResult {
    const trimmed = input.trim();
    if (!trimmed) {
      return { success: false, error: 'Input code cannot be empty.' };
    }

    if (this.waitingFor === 'offer' || this.offerResolver) {
      if (!trimmed.startsWith('O|')) {
        return {
          success: false,
          error: 'Invalid Offer code. Host Offer codes must start with "O|".',
        };
      }
      const resolve = this.offerResolver;
      this.offerResolver = undefined;
      this.waitingFor = null;
      this.onWaitingForChange?.(null);
      resolve?.(trimmed);
      return { success: true };
    }

    if (this.waitingFor === 'answer' || this.answerResolver) {
      if (!trimmed.startsWith('A|')) {
        return {
          success: false,
          error: 'Invalid Answer code. Joiner Answer codes must start with "A|".',
        };
      }
      const resolve = this.answerResolver;
      this.answerResolver = undefined;
      this.waitingFor = null;
      this.onWaitingForChange?.(null);
      resolve?.(trimmed);
      return { success: true };
    }

    return {
      success: false,
      error: 'Not currently waiting for an input code.',
    };
  }

  cleanup(): void {
    this.offerResolver = undefined;
    this.answerResolver = undefined;
    this.currentPayload = '';
    this.payloadType = null;
    this.waitingFor = null;
    this.onWaitingForChange?.(null);
  }
}
