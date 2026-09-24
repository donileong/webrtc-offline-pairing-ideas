import { describe, it, expect, beforeEach } from 'vitest';
import { ManualSignalingAdapter } from './ManualSignalingAdapter';

describe('ManualSignalingAdapter', () => {
  let adapter: ManualSignalingAdapter;

  beforeEach(() => {
    adapter = new ManualSignalingAdapter();
  });

  it('broadcasts an offer and triggers onPayload', async () => {
    let capturedPayload = '';
    let capturedType = '';
    adapter.onPayload = (payload, type) => {
      capturedPayload = payload;
      capturedType = type;
    };

    const offer = 'O|testufrag|testpwd|fingerprint|127.0.0.1:5000|sess1';
    await adapter.broadcastOffer(offer);

    expect(adapter.currentPayload).toBe(offer);
    expect(adapter.payloadType).toBe('offer');
    expect(capturedPayload).toBe(offer);
    expect(capturedType).toBe('offer');
  });

  it('listens for an answer and resolves when valid A| code is submitted', async () => {
    let waiting: string | null = null;
    adapter.onWaitingForChange = (w) => {
      waiting = w;
    };

    const answerPromise = adapter.listenForAnswer();
    expect(adapter.waitingFor).toBe('answer');
    expect(waiting).toBe('answer');

    const validAnswer = 'A|answufrag|anspwd|ansfp|127.0.0.1:5001|sess1';
    const result = adapter.submitPastedInput(validAnswer);

    expect(result.success).toBe(true);
    expect(adapter.waitingFor).toBe(null);
    expect(waiting).toBe(null);

    const receivedAnswer = await answerPromise;
    expect(receivedAnswer).toBe(validAnswer);
  });

  it('listens for an offer and resolves when valid O| code is submitted', async () => {
    let waiting: string | null = null;
    adapter.onWaitingForChange = (w) => {
      waiting = w;
    };

    const offerPromise = adapter.listenForOffer();
    expect(adapter.waitingFor).toBe('offer');
    expect(waiting).toBe('offer');

    const validOffer = 'O|hostufrag|hostpwd|hostfp|192.168.1.5:4000|sess2';
    const result = adapter.submitPastedInput(validOffer);

    expect(result.success).toBe(true);
    expect(adapter.waitingFor).toBe(null);

    const receivedOffer = await offerPromise;
    expect(receivedOffer).toBe(validOffer);
  });

  it('sends an answer and triggers onPayload', async () => {
    let capturedPayload = '';
    let capturedType = '';
    adapter.onPayload = (payload, type) => {
      capturedPayload = payload;
      capturedType = type;
    };

    const answer = 'A|answufrag|anspwd|ansfp|192.168.1.10:4001|sess2';
    await adapter.sendAnswer(answer);

    expect(adapter.currentPayload).toBe(answer);
    expect(adapter.payloadType).toBe('answer');
    expect(capturedPayload).toBe(answer);
    expect(capturedType).toBe('answer');
  });

  it('validates input and rejects invalid strings', () => {
    // Empty input
    const emptyRes = adapter.submitPastedInput('   ');
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.error).toContain('cannot be empty');

    // Not waiting for anything
    const notWaitingRes = adapter.submitPastedInput('O|somedata');
    expect(notWaitingRes.success).toBe(false);
    expect(notWaitingRes.error).toContain('Not currently waiting');

    // Waiting for offer, but receives answer
    adapter.listenForOffer();
    const wrongTypeRes = adapter.submitPastedInput('A|answerinstead');
    expect(wrongTypeRes.success).toBe(false);
    expect(wrongTypeRes.error).toContain('must start with "O|"');

    // Waiting for answer, but receives offer
    adapter.cleanup();
    adapter.listenForAnswer();
    const wrongOfferRes = adapter.submitPastedInput('O|offerinstead');
    expect(wrongOfferRes.success).toBe(false);
    expect(wrongOfferRes.error).toContain('must start with "A|"');
  });

  it('cleans up state and resolvers', () => {
    adapter.listenForAnswer();
    expect(adapter.waitingFor).toBe('answer');

    adapter.cleanup();
    expect(adapter.waitingFor).toBe(null);
    expect(adapter.currentPayload).toBe('');
    expect(adapter.payloadType).toBe(null);

    // Submitting after cleanup should fail gracefully
    const res = adapter.submitPastedInput('A|someanswer');
    expect(res.success).toBe(false);
  });
});
