/**
 * registry.ts
 *
 * Central registry of available signaling methods.
 */

import type { SignalingAdapter } from './types';
import { WaveSignalingAdapter } from './wave/WaveSignalingAdapter';
import { QrSignalingAdapter } from './qr/QrSignalingAdapter';
import { ManualSignalingAdapter } from './manual/ManualSignalingAdapter';

export interface MethodMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  badge?: string;
  isReady: boolean;
}

export const SIGNALING_METHODS: MethodMetadata[] = [
  {
    id: 'wave',
    name: 'Sound Wave (ggwave)',
    description: 'Pair nearby devices using acoustic sound tones. No internet or setup needed.',
    icon: '🔊',
    badge: 'Acoustic',
    isReady: true,
  },
  {
    id: 'qr',
    name: 'QR Code',
    description: 'Scan animated optical QR codes between screens using device cameras.',
    icon: '📷',
    badge: 'Optical',
    isReady: true,
  },
  {
    id: 'manual',
    name: 'Manual Copy-Paste',
    description: 'Directly copy and paste short compact connection codes between devices.',
    icon: '📋',
    badge: 'Fallback',
    isReady: true,
  },
];

export function createSignalingAdapter(methodId: string): SignalingAdapter {
  switch (methodId) {
    case 'wave':
      return new WaveSignalingAdapter();
    case 'qr':
      return new QrSignalingAdapter();
    case 'manual':
      return new ManualSignalingAdapter();
    default:
      throw new Error(`Unknown signaling method: ${methodId}`);
  }
}
