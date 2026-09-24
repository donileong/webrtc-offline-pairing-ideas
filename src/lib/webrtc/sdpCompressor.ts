/**
 * sdpCompressor.ts
 *
 * Compresses standard WebRTC DataChannel SDPs (~1.5KB) down to ~90-105 bytes
 * by extracting only the essential parameters needed for direct P2P connections:
 * - Session role (Offer / Answer)
 * - ICE ufrag & pwd
 * - DTLS SHA-256 Fingerprint (Base64-encoded to save 20 bytes)
 * - Single best local IPv4 host candidate (IP + port)
 *
 * And reconstructs a standards-compliant SDP string on the receiving side.
 */

export interface CompactSignal {
  type: 'offer' | 'answer';
  ufrag: string;
  pwd: string;
  fingerprint: string; // 64 hex chars (without colons)
  candidates: Array<{ ip: string; port: number }>;
  sessionId?: string;
}

/**
 * Converts a 64-char hex string to a 44-char Base64 string.
 */
export function hexToBase64(hex: string): string {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string back to a 64-char hex string.
 */
export function base64ToHex(b64: string): string {
  const binary = atob(b64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, '0');
    hex += byte;
  }
  return hex.toLowerCase();
}

/**
 * Checks if an IP is a local private IPv4 address.
 */
function isPrivateIpv4(ip: string): boolean {
  return /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(
    ip,
  );
}

/**
 * Checks if an IP is any standard IPv4 address.
 */
function isIpv4(ip: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
}

/**
 * Extracts essential parameters from a full WebRTC SDP string.
 */
export function extractCompactSignal(
  type: 'offer' | 'answer',
  sdp: string,
  sessionId?: string,
): CompactSignal {
  // Extract ice-ufrag
  const ufragMatch = sdp.match(/a=ice-ufrag:([^\r\n]+)/);
  if (!ufragMatch) throw new Error('SDP missing a=ice-ufrag');
  const ufrag = ufragMatch[1].trim();

  // Extract ice-pwd
  const pwdMatch = sdp.match(/a=ice-pwd:([^\r\n]+)/);
  if (!pwdMatch) throw new Error('SDP missing a=ice-pwd');
  const pwd = pwdMatch[1].trim();

  // Extract fingerprint
  const fpMatch = sdp.match(/a=fingerprint:sha-256\s+([A-Fa-f0-9:]+)/);
  if (!fpMatch) throw new Error('SDP missing a=fingerprint:sha-256');
  const rawFingerprint = fpMatch[1].trim();
  const fingerprintHex = rawFingerprint.replace(/:/g, '').toLowerCase();

  // Extract candidate pool
  const allCandidates: Array<{ ip: string; port: number; typ: string }> = [];
  const candidateRegex = /a=candidate:\S+\s+\d+\s+UDP\s+\d+\s+([^\s]+)\s+(\d+)\s+typ\s+(\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = candidateRegex.exec(sdp)) !== null) {
    const ip = match[1];
    const port = parseInt(match[2], 10);
    const typ = match[3].toLowerCase();
    allCandidates.push({ ip, port, typ });
  }

  // Prioritize single best candidate to guarantee payload stays <120 bytes:
  // 1. Private IPv4 host candidate (e.g. 10.0.0.x or 192.168.x.x)
  // 2. Any IPv4 host candidate
  // 3. Fallback to c= line or first candidate
  const candidates: Array<{ ip: string; port: number }> = [];

  const privateIpv4Cand = allCandidates.find((c) => isPrivateIpv4(c.ip) && c.typ === 'host');
  const anyIpv4Cand = allCandidates.find((c) => isIpv4(c.ip));

  if (privateIpv4Cand) {
    candidates.push({ ip: privateIpv4Cand.ip, port: privateIpv4Cand.port });
  } else if (anyIpv4Cand) {
    candidates.push({ ip: anyIpv4Cand.ip, port: anyIpv4Cand.port });
  } else if (allCandidates.length > 0) {
    candidates.push({ ip: allCandidates[0].ip, port: allCandidates[0].port });
  } else {
    // Fallback: search for c= line
    const cMatch = sdp.match(/c=IN\s+IP4\s+([^\r\n]+)/);
    if (cMatch && cMatch[1] !== '0.0.0.0') {
      candidates.push({ ip: cMatch[1].trim(), port: 9 });
    }
  }

  const generatedSessionId = sessionId || Math.floor(Math.random() * 0xffffff).toString(16);

  return {
    type,
    ufrag,
    pwd,
    fingerprint: fingerprintHex,
    candidates,
    sessionId: generatedSessionId,
  };
}

/**
 * Encodes a CompactSignal into an ultra-compact string for transmission.
 * Format:
 * O|ufrag|pwd|fingerprint_b64|ip:port|sessionId
 * Result is strictly ~95 to 110 bytes (well below ggwave's 140-byte variable limit).
 */
export function serializeCompactSignal(signal: CompactSignal): string {
  const roleChar = signal.type === 'offer' ? 'O' : 'A';
  const candStr = signal.candidates.map((c) => `${c.ip}:${c.port}`).join(',');
  const sessId = signal.sessionId || '';

  // Compress 64-char hex fingerprint to 44-char base64
  const fpB64 = hexToBase64(signal.fingerprint);

  return `${roleChar}|${signal.ufrag}|${signal.pwd}|${fpB64}|${candStr}|${sessId}`;
}

/**
 * Decodes an ultra-compact string back into a CompactSignal.
 */
export function deserializeCompactSignal(str: string): CompactSignal {
  const parts = str.trim().split('|');
  if (parts.length < 5) {
    throw new Error(`Invalid compact signal format (expected at least 5 segments): ${str}`);
  }

  const roleChar = parts[0].toUpperCase();
  const type: 'offer' | 'answer' = roleChar === 'O' ? 'offer' : 'answer';
  const ufrag = parts[1];
  const pwd = parts[2];
  const fpRaw = parts[3];
  const candPart = parts[4];
  const sessionId = parts[5] || undefined;

  // Unpack fingerprint: handle both 44-char base64 and 64-char hex
  let fingerprint = fpRaw.toLowerCase();
  if (fpRaw.length <= 44 && !/^[0-9a-fA-F]{64}$/.test(fpRaw)) {
    try {
      fingerprint = base64ToHex(fpRaw);
    } catch {
      fingerprint = fpRaw.toLowerCase();
    }
  }

  const candidates: Array<{ ip: string; port: number }> = [];
  if (candPart) {
    for (const item of candPart.split(',')) {
      if (!item.trim()) continue;
      const [ip, portStr] = item.split(':');
      const port = parseInt(portStr, 10);
      if (ip && !isNaN(port)) {
        candidates.push({ ip: ip.trim(), port });
      }
    }
  }

  return {
    type,
    ufrag,
    pwd,
    fingerprint,
    candidates,
    sessionId,
  };
}

/**
 * Reconstructs a valid RFC-compliant WebRTC SDP string from a CompactSignal.
 */
export function reconstructSdp(signal: CompactSignal): string {
  // Format fingerprint back with colons: XX:XX:XX...
  const fpChunks: string[] = [];
  for (let i = 0; i < signal.fingerprint.length; i += 2) {
    fpChunks.push(signal.fingerprint.substring(i, i + 2).toUpperCase());
  }
  const formattedFingerprint = fpChunks.join(':');

  const sessId = signal.sessionId || '123456789';
  const setupRole = signal.type === 'offer' ? 'actpass' : 'active';

  let candidateLines = '';
  if (signal.candidates.length > 0) {
    signal.candidates.forEach((cand, idx) => {
      const priority = 2122260223 - idx;
      candidateLines += `a=candidate:${idx + 1} 1 UDP ${priority} ${cand.ip} ${cand.port} typ host\r\n`;
    });
  } else {
    // If no candidate, add default localhost placeholder
    candidateLines = 'a=candidate:1 1 UDP 2122260223 127.0.0.1 5000 typ host\r\n';
  }

  const sdpLines = [
    'v=0',
    `o=- ${sessId} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${signal.ufrag}`,
    `a=ice-pwd:${signal.pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${formattedFingerprint}`,
    `a=setup:${setupRole}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    candidateLines.trimEnd(),
    'a=end-of-candidates',
    '',
  ];

  return sdpLines.join('\r\n');
}
