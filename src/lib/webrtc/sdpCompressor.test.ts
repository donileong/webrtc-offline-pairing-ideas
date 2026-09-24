import { describe, it, expect } from 'vitest';
import {
  extractCompactSignal,
  serializeCompactSignal,
  deserializeCompactSignal,
  reconstructSdp,
} from './sdpCompressor';

describe('sdpCompressor', () => {
  const sampleSdp = [
    'v=0',
    'o=- 3546782910 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:abcd',
    'a=ice-pwd:secretpassword123456789012',
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF',
    'a=setup:actpass',
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    'a=candidate:1 1 UDP 2122260223 192.168.1.150 54321 typ host generation 0',
    'a=end-of-candidates',
    '',
  ].join('\r\n');

  it('extracts compact parameters from full SDP', () => {
    const compact = extractCompactSignal('offer', sampleSdp, '3546782910');
    expect(compact.type).toBe('offer');
    expect(compact.ufrag).toBe('abcd');
    expect(compact.pwd).toBe('secretpassword123456789012');
    expect(compact.fingerprint.length).toBe(64);
    expect(compact.candidates).toHaveLength(1);
    expect(compact.candidates[0].ip).toBe('192.168.1.150');
    expect(compact.candidates[0].port).toBe(54321);
  });

  it('serializes and deserializes compact signal into short string', () => {
    const compact = extractCompactSignal('offer', sampleSdp, '3546782910');
    const serialized = serializeCompactSignal(compact);
    expect(serialized.length).toBeLessThan(120);
    expect(serialized.startsWith('O|abcd|secretpassword123456789012|')).toBe(true);

    const deserialized = deserializeCompactSignal(serialized);
    expect(deserialized.type).toBe('offer');
    expect(deserialized.ufrag).toBe('abcd');
    expect(deserialized.pwd).toBe('secretpassword123456789012');
    expect(deserialized.fingerprint).toBe(compact.fingerprint);
    expect(deserialized.candidates[0].ip).toBe('192.168.1.150');
    expect(deserialized.candidates[0].port).toBe(54321);
  });

  it('filters multi-candidate SDP to single private IPv4 host and stays under 115 bytes', () => {
    const multiCandSdp = [
      'v=0',
      'o=- 9353312 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=ice-ufrag:SaZK',
      'a=ice-pwd:OEgrRSX+z9JNd2Ws35g8pH8c',
      'a=fingerprint:sha-256 D2:61:73:00:4F:02:AE:CB:9C:57:D4:A3:F1:9E:4B:D3:80:31:45:96:B8:2E:B9:5F:AE:82:AA:49:BE:2E:47:4D',
      'a=candidate:1 1 UDP 2122260223 10.0.0.175 55538 typ host',
      'a=candidate:2 1 UDP 2122260222 fd00:ab:cd:0:842:4303:797b:d5aa 64431 typ host',
      'a=candidate:3 1 UDP 2122260221 2604:3d09:748b:d200:f196:ebba:9fd9:3626 62039 typ host',
      'a=candidate:4 1 UDP 1686052863 68.149.150.212 55538 typ srflx',
    ].join('\r\n');

    const compact = extractCompactSignal('offer', multiCandSdp, '9353312');
    expect(compact.candidates).toHaveLength(1);
    expect(compact.candidates[0].ip).toBe('10.0.0.175');
    expect(compact.candidates[0].port).toBe(55538);

    const serialized = serializeCompactSignal(compact);
    expect(serialized.length).toBeLessThan(115);
    expect(serialized).toBe(
      'O|SaZK|OEgrRSX+z9JNd2Ws35g8pH8c|0mFzAE8CrsucV9Sj8Z5L04AxRZa4LrlfroKqSb4uR00=|10.0.0.175:55538|9353312',
    );

    const deserialized = deserializeCompactSignal(serialized);
    expect(deserialized.fingerprint).toBe(
      'd26173004f02aecb9c57d4a3f19e4bd380314596b82eb95fae82aa49be2e474d',
    );
    expect(deserialized.candidates[0].ip).toBe('10.0.0.175');
  });

  it('reconstructs valid SDP containing essential WebRTC lines', () => {
    const compact = extractCompactSignal('offer', sampleSdp, '3546782910');
    const reconstructed = reconstructSdp(compact);

    expect(reconstructed).toContain('a=ice-ufrag:abcd');
    expect(reconstructed).toContain('a=ice-pwd:secretpassword123456789012');
    expect(reconstructed).toContain(
      'a=fingerprint:sha-256 01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF',
    );
    expect(reconstructed).toContain('a=setup:actpass');
    expect(reconstructed).toContain('a=candidate:1 1 UDP 2122260223 192.168.1.150 54321 typ host');
  });
});
