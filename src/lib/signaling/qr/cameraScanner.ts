/**
 * cameraScanner.ts
 *
 * Provides a robust camera-based QR code scanner combining native BarcodeDetector
 * (for hardware acceleration where supported) with jsQR fallback for universal browser support.
 */

import jsQR from 'jsqr';

export interface ScannerOptions {
  videoElement: HTMLVideoElement;
  onScan: (data: string) => void;
  onError?: (err: Error) => void;
  facingMode?: 'environment' | 'user';
}

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
}

export class CameraScanner {
  private stream: MediaStream | null = null;
  private animId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isScanning = false;
  private currentFacingMode: 'environment' | 'user' = 'environment';
  private videoEl: HTMLVideoElement | null = null;
  private onScanCallback?: (data: string) => void;
  private barcodeDetector: NativeBarcodeDetector | null = null;

  constructor() {
    // Check if BarcodeDetector is available natively (e.g. Chrome, Android, iOS 17+)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BD = (
          window as unknown as {
            BarcodeDetector: new (opts: { formats: string[] }) => NativeBarcodeDetector;
          }
        ).BarcodeDetector;
        this.barcodeDetector = new BD({ formats: ['qr_code'] });
      } catch {
        this.barcodeDetector = null;
      }
    }
  }

  async start(options: ScannerOptions): Promise<void> {
    this.stop();

    this.videoEl = options.videoElement;
    this.onScanCallback = options.onScan;
    this.currentFacingMode = options.facingMode || 'environment';

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const error = new Error(
        'Camera API (getUserMedia) unavailable. Secure context (HTTPS or localhost) required.',
      );
      options.onError?.(error);
      throw error;
    }

    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: this.currentFacingMode },
            width: { ideal: 640 },
            height: { ideal: 640 },
          },
          audio: false,
        });
      } catch (firstErr) {
        // Fallback for devices/browsers that reject ideal facingMode
        console.warn(
          'Initial facingMode getUserMedia failed, retrying with basic constraints:',
          firstErr,
        );
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      this.videoEl.srcObject = this.stream;
      this.videoEl.setAttribute('playsinline', 'true'); // Required for iOS Safari
      await this.videoEl.play();

      this.isScanning = true;
      this.canvas = document.createElement('canvas');
      this.scanLoop();
    } catch (err: unknown) {
      this.stop();
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
      throw error;
    }
  }

  private lastScanTime = 0;

  private scanLoop = async () => {
    if (!this.isScanning || !this.videoEl) return;

    const now = performance.now();
    const shouldScan = now - this.lastScanTime >= 80;

    if (shouldScan && this.videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.lastScanTime = now;
      let detectedText: string | null = null;

      // 1. Try native BarcodeDetector if available
      if (this.barcodeDetector) {
        try {
          const barcodes = await this.barcodeDetector.detect(this.videoEl);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            detectedText = barcodes[0].rawValue;
          }
        } catch {
          // Fall back to jsQR
        }
      }

      // 2. jsQR Fallback
      if (!detectedText && this.canvas) {
        const width = this.videoEl.videoWidth;
        const height = this.videoEl.videoHeight;

        if (width > 0 && height > 0) {
          if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
          }

          const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(this.videoEl, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              detectedText = code.data;
            }
          }
        }
      }

      if (detectedText) {
        this.handleDetectedCode(detectedText);
        if (!this.isScanning) {
          return;
        }
      }
    }

    if (this.isScanning) {
      this.animId = requestAnimationFrame(this.scanLoop);
    }
  };

  private handleDetectedCode(data: string) {
    const trimmed = data.trim();
    this.onScanCallback?.(trimmed);
  }

  async toggleCamera(): Promise<void> {
    if (!this.videoEl || !this.onScanCallback) return;
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    await this.start({
      videoElement: this.videoEl,
      onScan: this.onScanCallback,
      facingMode: this.currentFacingMode,
    });
  }

  get facingMode(): 'environment' | 'user' {
    return this.currentFacingMode;
  }

  stop(): void {
    this.isScanning = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch (e) {
          console.warn('Error stopping camera track:', e);
        }
      });
      this.stream = null;
    }
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {
        // Ignore pause errors
      }
      this.videoEl.srcObject = null;
    }
    this.canvas = null;
  }
}
