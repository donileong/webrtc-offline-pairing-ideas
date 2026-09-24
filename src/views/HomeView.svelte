<script lang="ts">
  import { router } from '../lib/router/routerStore.svelte';
  import { activeSession } from '../lib/transport/activeSession.svelte';
  import { SIGNALING_METHODS } from '../lib/signaling/registry';
  import QrPairingModal from '../lib/signaling/qr/QrPairingModal.svelte';
  import WavePairingModal from '../lib/signaling/wave/WavePairingModal.svelte';
  import ManualPairingModal from '../lib/signaling/manual/ManualPairingModal.svelte';

  let showQrModal = $state(false);
  let showWaveModal = $state(false);
  let showManualModal = $state(false);

  function selectMethod(methodId: string) {
    if (methodId === 'qr') {
      showQrModal = true;
    } else if (methodId === 'wave') {
      showWaveModal = true;
    } else if (methodId === 'manual') {
      showManualModal = true;
    } else {
      router.navigate(`/connect/${methodId}`);
    }
  }

  function goToActiveRoom() {
    router.navigate('/room');
  }
</script>

<QrPairingModal open={showQrModal} onclose={() => (showQrModal = false)} />
<WavePairingModal open={showWaveModal} onclose={() => (showWaveModal = false)} />
<ManualPairingModal open={showManualModal} onclose={() => (showManualModal = false)} />

<div class="home-container">
  <div class="hero-section">
    <div class="badge-tag">P2P Decentralized Toolbox</div>
    <h1 class="hero-title">Peer Box</h1>
    <p class="hero-desc">
      Direct, serverless WebRTC data transfer between nearby or remote devices. Choose how you want
      to connect:
    </p>
  </div>

  {#if activeSession.state === 'connected'}
    <div class="active-session-banner">
      <div class="banner-info">
        <span class="pulse-indicator"></span>
        <span>You have an active P2P session ({activeSession.role || 'connected'})</span>
      </div>
      <button class="btn btn-resume" onclick={goToActiveRoom}> Resume Room &rarr; </button>
    </div>
  {/if}

  <div class="methods-grid">
    {#each SIGNALING_METHODS as method (method.id)}
      <button class="method-card" onclick={() => selectMethod(method.id)}>
        <div class="method-top">
          <h3 class="method-name">{method.name}</h3>
          {#if method.badge}
            <span class="method-badge">{method.badge}</span>
          {/if}
        </div>
        <p class="method-desc">{method.description}</p>
        <div class="method-footer">
          <span class="action-link">Start Pairing &rarr;</span>
        </div>
      </button>
    {/each}

    <!-- Preview of Trystero / Relay Architecture -->
    <div class="method-card future-card">
      <div class="method-top">
        <h3 class="method-name">Trystero Rooms</h3>
        <span class="method-badge relay">Relay Provider</span>
      </div>
      <p class="method-desc">
        Serverless P2P matchmaking over Nostr, BitTorrent trackers, or MQTT relays using shared room
        codes.
      </p>
      <div class="method-footer">
        <span class="future-tag">Supported in PeerTransport</span>
      </div>
    </div>
  </div>
</div>

<style>
  .home-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem 0;
  }

  .hero-section {
    text-align: center;
    margin-bottom: 2rem;
  }

  .badge-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.2);
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hero-title {
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #f8fafc, #94a3b8);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .hero-desc {
    color: #94a3b8;
    font-size: 1.05rem;
    max-width: 580px;
    margin: 0 auto;
    line-height: 1.5;
  }

  .active-session-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.75rem 1.25rem;
    border-radius: 0.75rem;
    margin-bottom: 2rem;
  }

  .banner-info {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: #a7f3d0;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .pulse-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 10px #10b981;
    animation: pulse 1.5s infinite;
  }

  .btn-resume {
    background: #10b981;
    color: #064e3b;
    border: none;
    font-weight: 600;
    padding: 0.4rem 0.9rem;
    border-radius: 0.375rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .methods-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2.5rem;
  }

  .method-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 1rem;
    padding: 1.25rem;
    text-align: left;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.2s ease;
    color: inherit;
    text-decoration: none;
  }

  .method-card:hover {
    border-color: #38bdf8;
    transform: translateY(-3px);
    box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.25);
  }

  .future-card {
    cursor: default;
    background: rgba(30, 41, 59, 0.5);
    border-style: dashed;
  }

  .future-card:hover {
    border-color: #64748b;
    transform: none;
    box-shadow: none;
  }

  .method-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .method-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    white-space: nowrap;
  }

  .method-badge.relay {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .method-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #f1f5f9;
    line-height: 1.3;
  }

  .method-desc {
    margin: 0 0 1rem 0;
    font-size: 0.85rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  .method-footer {
    display: flex;
    justify-content: flex-end;
    font-size: 0.85rem;
    font-weight: 600;
    color: #38bdf8;
  }

  .future-tag {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 500;
  }
</style>
