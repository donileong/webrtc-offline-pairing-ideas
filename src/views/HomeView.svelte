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
    <div class="badge-tag">Architecture Lab &amp; Demo</div>
    <h1 class="hero-title">WebRTC Offline Pairing Ideas</h1>
    <p class="hero-desc">
      Direct, zero-infrastructure WebRTC peer connection prototypes. Explore how nearby devices
      can establish high-speed P2P data channels completely offline without servers or internet access.
    </p>
  </div>

  <div class="demo-disclaimer-banner">
    <div class="disclaimer-badge">DEMO PROTOTYPE</div>
    <p class="disclaimer-text">
      This is a technical demonstration exploring physical and out-of-band signaling channels to solve
      the WebRTC SDP exchange chicken-and-egg problem without signaling servers or internet connectivity.
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

  <div class="section-title-wrap">
    <h2 class="section-heading">Signaling Channels</h2>
    <span class="section-subheading">Choose a physical or out-of-band channel to test pairing</span>
  </div>

  <div class="methods-grid">
    {#each SIGNALING_METHODS as method (method.id)}
      <button class="method-card" onclick={() => selectMethod(method.id)}>
        <div class="method-top">
          <div class="method-icon-title">
            <span class="method-icon">{method.icon}</span>
            <h3 class="method-name">{method.name}</h3>
          </div>
          {#if method.badge}
            <span class="method-badge">{method.badge}</span>
          {/if}
        </div>
        <p class="method-desc">{method.description}</p>
        <div class="method-footer">
          <span class="action-link">Launch Demo &rarr;</span>
        </div>
      </button>
    {/each}
  </div>

  <div class="ideas-section">
    <div class="section-title-wrap">
      <h2 class="section-heading">Core Offline Pairing Ideas</h2>
      <span class="section-subheading">Architectural solutions enabling zero-server WebRTC</span>
    </div>

    <div class="ideas-grid">
      <div class="idea-card">
        <div class="idea-icon">📦</div>
        <h4 class="idea-title">Extreme SDP Compression</h4>
        <p class="idea-body">
          Standard WebRTC SDPs are ~1.5–3KB. By isolating only DTLS SHA-256 fingerprints, ICE credentials
          (<code>ufrag</code>/<code>pwd</code>), and private host IPv4 candidates, payloads compress down to ~95–110 bytes,
          fitting inside a single audio tone or low-density QR code.
        </p>
      </div>

      <div class="idea-card">
        <div class="idea-icon">📻</div>
        <h4 class="idea-title">Slotted Leader Election</h4>
        <p class="idea-body">
          Without a central server to assign Host vs Joiner roles, both devices listen for a randomized jitter
          window (1.8s–3.0s). The first device to finish its silence window becomes the Host (Offerer) and transmits;
          the other detects the tone and automatically becomes the Joiner (Answerer).
        </p>
      </div>

      <div class="idea-card">
        <div class="idea-icon">📷</div>
        <h4 class="idea-title">Air-Gapped Optical Handshake</h4>
        <p class="idea-body">
          Optical cameras and dynamic QR codes create an instant, screen-to-lens visual data conduit.
          Devices exchange compact Offer and Answer payloads with zero RF emissions or local Wi-Fi pairing needed during signaling.
        </p>
      </div>

      <div class="idea-card">
        <div class="idea-icon">⚡</div>
        <h4 class="idea-title">Serverless Local ICE</h4>
        <p class="idea-body">
          Once credentials are exchanged via sound, light, or manual input, WebRTC's ICE agent binds directly
          across the shared LAN or ad-hoc mobile hotspot with zero STUN/TURN relays required for end-to-end encryption.
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .home-container {
    max-width: 860px;
    margin: 0 auto;
    padding: 1rem 0 3rem;
  }

  .hero-section {
    text-align: center;
    margin-bottom: 1.5rem;
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
    margin: 0 0 0.75rem 0;
    background: linear-gradient(135deg, #f8fafc, #94a3b8);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.15;
  }

  .hero-desc {
    color: #94a3b8;
    font-size: 1.05rem;
    max-width: 620px;
    margin: 0 auto;
    line-height: 1.5;
  }

  .demo-disclaimer-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    padding: 0.85rem 1.25rem;
    border-radius: 0.75rem;
    margin-bottom: 2rem;
  }

  .disclaimer-badge {
    flex-shrink: 0;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.6rem;
    border-radius: 0.375rem;
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .disclaimer-text {
    margin: 0;
    font-size: 0.85rem;
    color: #fde68a;
    line-height: 1.45;
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

  .section-title-wrap {
    margin-bottom: 1rem;
  }

  .section-heading {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 0.25rem 0;
  }

  .section-subheading {
    font-size: 0.85rem;
    color: #64748b;
  }

  .methods-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.25rem;
    margin-bottom: 3rem;
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

  .method-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .method-icon-title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .method-icon {
    font-size: 1.25rem;
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

  .method-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #f1f5f9;
    line-height: 1.3;
  }

  .method-desc {
    margin: 0 0 1.25rem 0;
    font-size: 0.85rem;
    color: #94a3b8;
    line-height: 1.45;
  }

  .method-footer {
    display: flex;
    justify-content: flex-end;
    font-size: 0.85rem;
    font-weight: 600;
    color: #38bdf8;
  }

  .ideas-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 2rem;
  }

  .ideas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.25rem;
    margin-top: 1.25rem;
  }

  .idea-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(51, 65, 85, 0.7);
    border-radius: 0.875rem;
    padding: 1.25rem;
    transition: border-color 0.2s ease;
  }

  .idea-card:hover {
    border-color: rgba(56, 189, 248, 0.4);
  }

  .idea-icon {
    font-size: 1.5rem;
    margin-bottom: 0.6rem;
  }

  .idea-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #e2e8f0;
  }

  .idea-body {
    margin: 0;
    font-size: 0.825rem;
    color: #94a3b8;
    line-height: 1.5;
  }

  .idea-body code {
    font-family: monospace;
    font-size: 0.75rem;
    padding: 0.1rem 0.3rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
    color: #38bdf8;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  @media (max-width: 640px) {
    .demo-disclaimer-banner {
      flex-direction: column;
      align-items: flex-start;
    }
    .hero-title {
      font-size: 2rem;
    }
  }
</style>
