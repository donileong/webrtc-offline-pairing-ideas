import { describe, it, expect, vi } from 'vitest';
import { QrSignalingAdapter } from './QrSignalingAdapter';

describe('QrSignalingAdapter', () => {
  it('initializes with default values', () => {
    const adapter = new QrSignalingAdapter();
    expect(adapter.id).toBe('qr');
    expect(adapter.name).toBe('QR Code');
    expect(adapter.icon).toBe('📷');
    expect(adapter.isScanning).toBe(false);
    expect(adapter.currentQrPayload).toBe('');
    expect(adapter.qrType).toBeNull();
  });

  it('broadcasts offer and triggers onQrDisplay', async () => {
    const adapter = new QrSignalingAdapter();
    const qrDisplaySpy = vi.fn();
    adapter.onQrDisplay = qrDisplaySpy;

    const offerStr = 'O|ufrag|pwd|fingerprint|192.168.1.1:5000|seq1';
    await adapter.broadcastOffer(offerStr);

    expect(adapter.currentQrPayload).toBe(offerStr);
    expect(adapter.qrType).toBe('offer');
    expect(qrDisplaySpy).toHaveBeenCalledWith(offerStr, 'offer');
  });

  it('handles full simulated offer/answer handshake via QR payloads', async () => {
    const hostAdapter = new QrSignalingAdapter();
    const joinerAdapter = new QrSignalingAdapter();

    const hostScanSpy = vi.fn();
    const joinerScanSpy = vi.fn();
    hostAdapter.onScanRequested = hostScanSpy;
    joinerAdapter.onScanRequested = joinerScanSpy;

    const offerPayload = 'O|hostUfrag|hostPwd|hostFp|192.168.1.10:50000|1';
    const answerPayload = 'A|joinerUfrag|joinerPwd|joinerFp|192.168.1.20:50001|1';

    // 1. Host broadcasts offer
    await hostAdapter.broadcastOffer(offerPayload);
    expect(hostAdapter.currentQrPayload).toBe(offerPayload);

    // 2. Joiner listens for offer
    const offerPromise = joinerAdapter.listenForOffer();
    expect(joinerAdapter.isScanning).toBe(true);
    expect(joinerAdapter.expectingType).toBe('offer');
    expect(joinerScanSpy).toHaveBeenCalledWith('offer');

    // Simulate joiner camera scanning host's offer
    const handledOffer = joinerAdapter.handleScannedPayload(offerPayload);
    expect(handledOffer).toBe(true);
    const receivedOffer = await offerPromise;
    expect(receivedOffer).toBe(offerPayload);
    expect(joinerAdapter.isScanning).toBe(false);

    // 3. Joiner sends answer
    await joinerAdapter.sendAnswer(answerPayload);
    expect(joinerAdapter.currentQrPayload).toBe(answerPayload);
    expect(joinerAdapter.qrType).toBe('answer');

    // 4. Host listens for answer
    const answerPromise = hostAdapter.listenForAnswer();
    expect(hostAdapter.isScanning).toBe(true);
    expect(hostAdapter.expectingType).toBe('answer');
    expect(hostScanSpy).toHaveBeenCalledWith('answer');

    // Mismatched payload should be rejected
    const invalidScan = hostAdapter.handleScannedPayload('O|invalid');
    expect(invalidScan).toBe(false);

    // Valid answer scan
    const handledAnswer = hostAdapter.handleScannedPayload(answerPayload);
    expect(handledAnswer).toBe(true);
    const receivedAnswer = await answerPromise;
    expect(receivedAnswer).toBe(answerPayload);
    expect(hostAdapter.isScanning).toBe(false);
  });

  it('supports listenForAnySignal for auto-role pairing', async () => {
    const adapter = new QrSignalingAdapter();
    const scanSpy = vi.fn();
    adapter.onScanRequested = scanSpy;

    const promise = adapter.listenForAnySignal();
    expect(adapter.isScanning).toBe(true);
    expect(scanSpy).toHaveBeenCalledWith('any');

    const offerPayload = 'O|ufrag|pwd|fp|10.0.0.1:5000|sess1';
    const handled = adapter.handleScannedPayload(offerPayload);
    expect(handled).toBe(true);

    const result = await promise;
    expect(result).toBe(offerPayload);
    expect(adapter.isScanning).toBe(false);
  });

  it('cleans up state properly', () => {
    const adapter = new QrSignalingAdapter();
    adapter.currentQrPayload = 'O|sample';
    adapter.qrType = 'offer';
    adapter.isScanning = true;
    adapter.expectingType = 'offer';

    adapter.cleanup();

    expect(adapter.isScanning).toBe(false);
    expect(adapter.expectingType).toBeNull();
    expect(adapter.currentQrPayload).toBe('');
    expect(adapter.qrType).toBeNull();
  });
});
