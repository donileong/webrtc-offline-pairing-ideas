<script lang="ts">
  import { router } from '../lib/router/routerStore.svelte';
  import { SIGNALING_METHODS } from '../lib/signaling/registry';
  import WavePairingModal from '../lib/signaling/wave/WavePairingModal.svelte';
  import ManualPairingModal from '../lib/signaling/manual/ManualPairingModal.svelte';
  import QrPairingModal from '../lib/signaling/qr/QrPairingModal.svelte';

  let currentMethod = $derived(router.params.method || 'wave');
  let showQrModal = $state(false);
  let showWaveModal = $state(false);
  let showManualModal = $state(false);

  $effect(() => {
    if (currentMethod === 'qr') {
      showQrModal = true;
      showWaveModal = false;
      showManualModal = false;
    } else if (currentMethod === 'wave') {
      showWaveModal = true;
      showQrModal = false;
      showManualModal = false;
    } else if (currentMethod === 'manual') {
      showManualModal = true;
      showWaveModal = false;
      showQrModal = false;
    }
  });

  function switchMethod(methodId: string) {
    if (methodId === 'qr') {
      showWaveModal = false;
      showManualModal = false;
      showQrModal = true;
    } else if (methodId === 'wave') {
      showQrModal = false;
      showManualModal = false;
      showWaveModal = true;
    } else if (methodId === 'manual') {
      showQrModal = false;
      showWaveModal = false;
      showManualModal = true;
    } else {
      showQrModal = false;
      showWaveModal = false;
      showManualModal = false;
      router.navigate(`/connect/${methodId}`);
    }
  }

  import { activeSession } from '../lib/transport/activeSession.svelte';

  function handleQrClose() {
    showQrModal = false;
    if (currentMethod === 'qr' && activeSession.state !== 'connected') {
      router.navigate('/');
    }
  }

  function handleWaveClose() {
    showWaveModal = false;
    if (currentMethod === 'wave' && activeSession.state !== 'connected') {
      router.navigate('/');
    }
  }

  function handleManualClose() {
    showManualModal = false;
    if (currentMethod === 'manual' && activeSession.state !== 'connected') {
      router.navigate('/');
    }
  }

  function goHome() {
    router.navigate('/');
  }
</script>

<QrPairingModal open={showQrModal} onclose={handleQrClose} />
<WavePairingModal open={showWaveModal} onclose={handleWaveClose} />
<ManualPairingModal open={showManualModal} onclose={handleManualClose} />

<div class="connect-view">
  <div class="connect-header">
    <button class="back-btn" onclick={goHome}> &larr; All Methods </button>

    <div class="method-tabs">
      {#each SIGNALING_METHODS as m (m.id)}
        <button
          class="tab-btn"
          class:active={currentMethod === m.id}
          onclick={() => switchMethod(m.id)}
        >
          <span>{m.name.replace(' (ggwave)', '')}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="method-content">
    {#if currentMethod === 'wave'}
      <div class="qr-trigger-box">
        <h3>Sound Wave Acoustic Pairing</h3>
        <p>Acoustic sound wave pairing with ultrasound near-silent tone chirps.</p>
        <button class="btn btn-primary" onclick={() => (showWaveModal = true)}>
          Open Sound Wave Pairing Modal
        </button>
      </div>
    {:else if currentMethod === 'qr'}
      <div class="qr-trigger-box">
        <h3>QR Code Optical Pairing</h3>
        <p>Scan screen codes between devices without selecting host or joiner.</p>
        <button class="btn btn-primary" onclick={() => (showQrModal = true)}>
          Open QR Pairing Modal
        </button>
      </div>
    {:else if currentMethod === 'manual'}
      <div class="qr-trigger-box">
        <h3>Manual Copy-Paste Pairing</h3>
        <p>Directly copy and paste short compact connection codes between devices.</p>
        <button class="btn btn-primary" onclick={() => (showManualModal = true)}>
          Open Manual Pairing Modal
        </button>
      </div>
    {:else}
      <div class="not-found">
        <p>Unknown method "{currentMethod}"</p>
        <button class="btn btn-primary" onclick={goHome}>Return Home</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .connect-view {
    max-width: 720px;
    margin: 0 auto;
  }

  .connect-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .back-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    transition: color 0.15s;
  }

  .back-btn:hover {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.05);
  }

  .method-tabs {
    display: flex;
    background: #0f172a;
    padding: 0.25rem;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    gap: 0.25rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 0.35rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    color: #f1f5f9;
  }

  .tab-btn.active {
    background: #1e293b;
    color: #38bdf8;
    font-weight: 600;
  }

  .qr-trigger-box {
    text-align: center;
    padding: 3rem 1.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 1rem;
  }

  .qr-trigger-box h3 {
    margin: 0 0 0.5rem 0;
    color: #f8fafc;
  }

  .qr-trigger-box p {
    color: #94a3b8;
    margin: 0 0 1.5rem 0;
    font-size: 0.9rem;
  }

  .not-found {
    text-align: center;
    padding: 3rem;
    background: #1e293b;
    border-radius: 1rem;
  }
</style>
