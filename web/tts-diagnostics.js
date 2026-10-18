// M2a: optional GPU discovery. No model loads, downloads or remote calls.
(function () {
  'use strict';
  const button = document.getElementById('gpuProbeButton');
  const output = document.getElementById('gpuProbeStatus');
  if (!button || !output) return;

  function readableGPU(gpu) {
    if (!gpu || !Array.isArray(gpu.devices) || gpu.state !== 'detected') {
      if (gpu && gpu.state === 'unavailable') return 'No NVIDIA GPU reported by the driver.';
      return 'GPU detection unavailable. This does not prove the computer has no GPU.';
    }
    return gpu.devices.map((d) => {
      const total = Number.isFinite(d.vramTotalMiB) ? d.vramTotalMiB + ' MiB total' : 'VRAM unknown';
      const free = Number.isFinite(d.vramFreeMiB) ? ', ' + d.vramFreeMiB + ' MiB free' : '';
      return String(d.name || 'NVIDIA GPU') + ' (' + total + free + ')';
    }).join('; ');
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    output.textContent = 'Checking local GPU information…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/api/tts/capabilities', {
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('GPU probe returned HTTP ' + response.status);
      const data = await response.json();
      if (!data || data.schema !== 'readaloud-studio/tts-capabilities@0.1') {
        throw new Error('Unexpected GPU capability response');
      }
      const cos = Array.isArray(data.backends)
        ? data.backends.find(b => b.id === 'cosyvoice3-local') : null;
      const label = cos && cos.state === 'ready' ? 'CosyVoice ready'
        : cos && cos.state === 'warning' ? 'CosyVoice compatibility unverified'
        : 'CosyVoice native backend not installed';
      output.textContent = readableGPU(data.gpu) + ' — ' + label +
        '. Portable proofreading remains available.';
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      output.textContent = (timedOut
        ? 'GPU check timed out.'
        : 'GPU check unavailable; run the local START launcher to enable diagnostics.') +
        ' Portable proofreading is unaffected.';
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
    }
  });
})();
