<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import QRCode from 'qrcode';
  import { activeSession } from '../../transport/activeSession.svelte';
  import { QrSignalingAdapter } from './QrSignalingAdapter';
  import { CameraScanner } from './cameraScanner';
  import Modal from '../../ui/Modal.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const adapter = new QrSignalingAdapter();
  const scanner = new CameraScanner();

  let qrCanvas: HTMLCanvasElement | null = $state(null);
  let videoEl: HTMLVideoElement | null = $state(null);
  let isCameraActive = $state(false);
  let isCameraStarting = $state(false);
  let shouldShowScanner = $state(true);
  let cameraError = $state<string | null>(null);

  let currentQrPayload = $state('');
  let qrType = $state<'offer' | 'answer' | null>(null);

  adapter.onQrDisplay = (payload, type) => {
    currentQrPayload = payload;
    qrType = type;
  };

  // Re-render QR code whenever payload changes
  $effect(() => {
    if (currentQrPayload && qrCanvas) {
      QRCode.toCanvas(qrCanvas, currentQrPayload, {
        width: 220,
        margin: 2,
        color: {
          dark: '#020617',
          light: '#ffffff',
        },
      }).catch((err) => {
        console.error('Failed to render QR Code:', err);
      });
    }
  });

  async function startCamera() {
    if (isCameraActive || isCameraStarting) return;
    isCameraStarting = true;
    cameraError = null;

    try {
      await tick();
      if (!videoEl) {
        await new Promise((r) => setTimeout(r, 60));
      }
      if (!videoEl) return;

      await scanner.start({
        videoElement: videoEl,
        onScan: (scannedText) => {
          const handled = adapter.handleScannedPayload(scannedText);
          if (handled) {
            // Instantly turn off camera hardware and hide scanner
            stopCamera();
          }
        },
        onError: (err) => {
          cameraError = err.message || 'Camera permission denied or unavailable';
          isCameraActive = false;
        },
      });
      isCameraActive = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      cameraError = msg;
      isCameraActive = false;
    } finally {
      isCameraStarting = false;
    }
  }

  function stopCamera() {
    scanner.stop();
    isCameraActive = false;
    isCameraStarting = false;
    shouldShowScanner = false;
  }

  async function toggleCamera() {
    try {
      await scanner.toggleCamera();
    } catch (e) {
      console.warn('Camera toggle failed:', e);
    }
  }

  function handleClose() {
    stopCamera();
    adapter.cleanup();
    activeSession.reset();
    currentQrPayload = '';
    qrType = null;
    shouldShowScanner = true;
    onclose();
  }

  // Handle open prop changes - untrack internal camera and pairing execution
  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen) {
        shouldShowScanner = true;
        activeSession.startPairing('auto', adapter);
        startCamera();
      } else {
        stopCamera();
        adapter.cleanup();
      }
    });
  });

  // Watch for connection to auto-dismiss modal - untrack close logic
  $effect(() => {
    const isConnected = activeSession.state === 'connected';
    untrack(() => {
      if (isConnected) {
        stopCamera();
        adapter.cleanup();
        onclose();
      }
    });
  });

  onDestroy(() => {
    stopCamera();
    adapter.cleanup();
  });
</script>

<Modal
  {open}
  title="QR Code Pairing"
  subtitle="Point either phone at the other's screen"
  onclose={handleClose}
>
  <!-- Status banner -->
  <div class="status-callout" class:highlight={activeSession.state !== 'idle'}>
        <span class="status-dot pulsing"></span>
        <span class="status-text">
          {#if qrType === 'answer'}
            Scanned. Show this Answer QR code to the other phone...
          {:else}
            {activeSession.statusMessage}
          {/if}
        </span>
      </div>

      <!-- Main Visual Work Area -->
      <div class="modal-body" class:answer-mode={qrType === 'answer'}>
        <!-- Top / Primary: QR Code -->
        <div class="qr-panel">
          <span class="panel-tag">
            {qrType === 'answer' ? 'Answer Code' : 'Your QR Code'}
          </span>
          <div class="canvas-wrapper">
            <canvas bind:this={qrCanvas} class="qr-canvas"></canvas>
          </div>
          <span class="qr-subtext">
            {qrType === 'answer'
              ? 'Hold screen toward the other phone'
              : 'Can be scanned by other phone'}
          </span>
        </div>

        <!-- Bottom / Scanner: Camera (hidden if in answer mode or once scanned) -->
        {#if shouldShowScanner && qrType !== 'answer'}
          <div class="scanner-panel">
            <div class="viewfinder-box">
              <video bind:this={videoEl} class="video-preview" muted playsinline>
                <track kind="captions" />
              </video>

              {#if isCameraStarting}
                <div class="camera-loading-overlay">
                  <div class="spinner"></div>
                  <span>Starting camera...</span>
                </div>
              {/if}

              <div class="scanning-crosshairs">
                <div class="scanner-laser"></div>
              </div>

              <div class="camera-bar">
                <span class="camera-mode-tag">Scanner Ready</span>
                <button class="btn-switch-cam" onclick={toggleCamera} type="button">
                  Flip Camera
                </button>
              </div>
            </div>

            {#if cameraError}
              <div class="camera-error-banner">
                <small>{cameraError}</small>
                <button class="btn-retry" onclick={startCamera}>Retry Camera</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" onclick={handleClose}> Cancel Pairing </button>
      </div>
</Modal>

<style>
  .status-callout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid #334155;
    font-size: 0.82rem;
    color: #cbd5e1;
  }

  .status-callout.highlight {
    color: #f0f9ff;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    flex-shrink: 0;
  }

  .status-dot.pulsing {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.3);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.6;
    }
  }

  .status-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    align-items: center;
  }

  .modal-body.answer-mode {
    padding: 2rem 1.25rem;
  }

  .qr-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 1rem;
    width: 100%;
    max-width: 260px;
  }

  .panel-tag {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #38bdf8;
    margin-bottom: 0.5rem;
    background: rgba(56, 189, 248, 0.12);
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
  }

  .canvas-wrapper {
    background: white;
    padding: 0.4rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  }

  .qr-canvas {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .qr-subtext {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: center;
  }

  .scanner-panel {
    width: 100%;
    max-width: 320px;
  }

  .viewfinder-box {
    position: relative;
    width: 100%;
    height: 180px;
    border-radius: 0.75rem;
    overflow: hidden;
    background: #000;
    border: 2px solid #38bdf8;
  }

  .video-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .scanning-crosshairs {
    position: absolute;
    inset: 15%;
    border: 2px dashed rgba(56, 189, 248, 0.8);
    border-radius: 0.5rem;
    pointer-events: none;
  }

  .scanner-laser {
    width: 100%;
    height: 2px;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
    animation: laserScan 2s infinite ease-in-out;
  }

  @keyframes laserScan {
    0% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(115px);
    }
    100% {
      transform: translateY(0);
    }
  }

  .camera-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.35rem 0.6rem;
    background: rgba(15, 23, 42, 0.85);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .camera-mode-tag {
    color: #f1f5f9;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .btn-switch-cam {
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .btn-switch-cam:hover {
    background: #475569;
  }

  .camera-loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #38bdf8;
    font-size: 0.8rem;
    z-index: 5;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(56, 189, 248, 0.2);
    border-top-color: #38bdf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .camera-error-banner {
    margin-top: 0.5rem;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-retry {
    background: #334155;
    border: none;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .modal-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid #334155;
    display: flex;
    justify-content: flex-end;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
    padding: 0.45rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-cancel:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
    color: #fca5a5;
  }
</style>
