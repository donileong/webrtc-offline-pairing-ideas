import { describe, it, expect } from 'vitest';
import { ggwaveService } from './ggwaveService';

describe('ggwaveService', () => {
  it('initializes and simulates round-trip acoustic encode and decode', async () => {
    const payload = 'O|testufrag|testpwd|0123456789abcdef|127.0.0.1:5000|sess123';
    const decoded = await ggwaveService.simulateTransmission(payload);
    expect(decoded).toBe(payload);
  });

  it('encodes and decodes using ultrasound protocol', async () => {
    const payload = 'O|ufrag|pwd|fingerprint|10.0.0.1:5000|sess456';
    const decoded = await ggwaveService.simulateTransmission(payload, 'ULTRASOUND_FAST');
    expect(decoded).toBe(payload);
  });
});
