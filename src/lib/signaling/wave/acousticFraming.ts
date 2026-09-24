/**
 * acousticFraming.ts
 *
 * Framing utilities for ggwave acoustic signaling payloads.
 * Packets are prefixed with role identifiers:
 * - 'O|': Host Offer
 * - 'A|': Joiner Answer
 */

export const ACOUSTIC_PREFIX = {
  OFFER: 'O|',
  ANSWER: 'A|',
} as const;

export type AcousticSignalType = 'offer' | 'answer';

/**
 * Checks whether an acoustic message represents a Host Offer.
 */
export function isAcousticOffer(msg: string): boolean {
  return msg.startsWith(ACOUSTIC_PREFIX.OFFER);
}

/**
 * Checks whether an acoustic message represents a Joiner Answer.
 */
export function isAcousticAnswer(msg: string): boolean {
  return msg.startsWith(ACOUSTIC_PREFIX.ANSWER);
}

/**
 * Inspects an acoustic message and parses its packet type.
 */
export function parseAcousticPayload(
  msg: string,
): { type: AcousticSignalType; payload: string } | null {
  if (isAcousticOffer(msg)) {
    return { type: 'offer', payload: msg };
  }
  if (isAcousticAnswer(msg)) {
    return { type: 'answer', payload: msg };
  }
  return null;
}
