const express = require('express');
const db = require('./db');

function buildServer() {
  const app = express();

  app.get('/', (req, res) => {
    res.send('View3D bot is running.');
  });

  app.get('/media/:id', async (req, res) => {
    const media = await db.getMedia(req.params.id);
    if (!media) return res.status(404).send('Not found');
    const filename = media.filename || fallbackFilename(media.mimetype);
    res.setHeader('Content-Type', media.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(media.data);
  });

  app.get('/view/:id/debug', async (req, res) => {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).send('Product not found');
    res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Debug: ${esc(product.name)}</title></head>
<body style="font-family:sans-serif;padding:16px;">
  <h2>${esc(product.name)}</h2>
  <p>Product ID: ${product.id}</p>
  <p><a href="/media/${product.image_media_id}" download="product-image.jpg">ðŸ“· Download product image</a></p>
  <p><a href="/media/${product.model_media_id}" download="product-model.glb">ðŸ“¦ Download .glb model file</a></p>
  ${product.usdz_media_id ? `<p><a href="/media/${product.usdz_media_id}" download="product-model.usdz">ðŸŽ Download .usdz file</a></p>` : '<p>No .usdz uploaded.</p>'}
</body></html>`);
  });

  app.get('/view/:id', async (req, res) => {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).send('Product not found');
    const company = await db.getCompanyById(product.company_id);

    const modelUrl = `/media/${product.model_media_id}`;
    const usdzUrl = product.usdz_media_id ? `/media/${product.usdz_media_id}` : null;
    const posterUrl = `/media/${product.image_media_id}`;
    const logoUrl = company && company.logo_media_id ? `/media/${company.logo_media_id}` : null;

    res.send(renderViewPage({ product, company, modelUrl, usdzUrl, posterUrl, logoUrl }));
  });

  return app;
}

function esc(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fallbackFilename(mimetype) {
  const map = {
    'model/gltf-binary': 'model.glb',
    'model/gltf+json': 'model.gltf',
    'model/vnd.usdz+zip': 'model.usdz',
    'image/jpeg': 'image.jpg',
    'image/png': 'image.png',
  };
  return map[mimetype] || 'file';
}

function renderViewPage({ product, company, modelUrl, usdzUrl, posterUrl, logoUrl }) {
  const companyName = company ? esc(company.name) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(product.name)} â€” AR view</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script>
  window.ModelViewerElement = window.ModelViewerElement || {};
  window.ModelViewerElement.meshoptDecoderLocation = 'https://cdn.jsdelivr.net/npm/meshoptimizer@1.2.0/meshopt_decoder.mjs';
</script>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
<style>
  :root{
    --bg:#F3F4F8;
    --card:#FFFFFF;
    --ink:#14162B;
    --ink-soft:#6B7280;
    --border:#ECEDF3;
    --accent:#5B5FEF;
    --accent-soft:#EEEEFD;
    --price:#14162B;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    font-family:'Inter',system-ui,-apple-system,sans-serif;
    background:var(--bg);
    color:var(--ink);
    min-height:100vh;
    display:flex;
    flex-direction:column;
    align-items:center;
    padding:20px 14px 40px;
  }
  .card{
    width:100%;
    max-width:460px;
    background:var(--card);
    border-radius:24px;
    padding:16px;
    box-shadow:0 24px 48px -28px rgba(20,22,43,0.22);
  }
  .card-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    margin-bottom:14px;
  }
  .brand{display:flex; align-items:center; gap:10px; min-width:0;}
  .brand img{
    width:40px;height:40px;border-radius:11px;object-fit:cover;
    border:1px solid var(--border);
    background:#fff;
    flex-shrink:0;
  }
  .brand-text{min-width:0;}
  .brand-name{
    font-weight:700;
    font-size:14px;
    letter-spacing:0.02em;
    text-transform:uppercase;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .brand-tag{
    font-size:12px;
    color:var(--ink-soft);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:220px;
  }
  #share-btn{
    display:flex;
    align-items:center;
    justify-content:center;
    width:38px;height:38px;
    border-radius:50%;
    border:1px solid var(--border);
    background:#fff;
    color:var(--ink);
    cursor:pointer;
    flex-shrink:0;
    position:relative;
  }
  #share-btn[data-copied]::after{
    content:'Copied';
    position:absolute;
    top:44px; right:0;
    background:var(--ink);
    color:#fff;
    font-size:11px;
    padding:4px 8px;
    border-radius:6px;
    white-space:nowrap;
  }
  .hero{
    position:relative;
    width:100%;
    aspect-ratio:4/3;
    border-radius:16px;
    overflow:hidden;
    background:#fafafb;
  }
  .ar-badge{
    position:absolute;
    top:12px; left:12px;
    z-index:2;
    display:flex;
    align-items:center;
    gap:5px;
    background:var(--accent);
    color:#fff;
    font-size:11px;
    font-weight:600;
    letter-spacing:0.03em;
    padding:6px 10px;
    border-radius:999px;
  }
  model-viewer{
    position:relative;
    width:100%;
    height:100%;
    background:#fafafb;
    --poster-color:transparent;
  }
  .ar-fab{
    position:absolute;
    bottom:12px; right:12px;
    width:44px;height:44px;
    border-radius:50%;
    border:none;
    background:#fff;
    color:var(--accent);
    display:flex;
    align-items:center;
    justify-content:center;
    box-shadow:0 6px 16px -4px rgba(20,22,43,0.35);
    cursor:pointer;
  }
  .info{padding:18px 4px 4px;}
  .title-row{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
  }
  h1{
    font-size:22px;
    font-weight:700;
    margin:0;
    line-height:1.25;
  }
  .price{
    font-size:20px;
    font-weight:700;
    color:var(--price);
    white-space:nowrap;
  }
  .description{
    font-size:14px;
    line-height:1.55;
    color:var(--ink-soft);
    margin:8px 0 20px;
  }
  #ar-button{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    width:100%;
    padding:14px 16px;
    background:var(--accent);
    color:#fff;
    border:none;
    border-radius:14px;
    cursor:pointer;
  }
  #ar-button .ar-button-text{text-align:left;}
  #ar-button strong{display:block; font-size:15px; font-weight:700;}
  #ar-button small{display:block; font-size:12px; font-weight:400; opacity:0.85; margin-top:1px;}
  #ar-button:focus-visible{outline:3px solid var(--ink); outline-offset:2px;}
  .footer-brand{
    margin-top:16px;
    font-size:11px;
    color:var(--ink-soft);
    text-align:center;
  }
  details{
    width:100%;
    max-width:460px;
    margin-top:14px;
  }
  summary{
    font-size:12px;
    color:var(--ink-soft);
    cursor:pointer;
  }
  #status-log{
    margin-top:8px;
    padding:12px;
    background:#fff;
    border:1px solid var(--border);
    border-radius:10px;
    font-family:ui-monospace,'SF Mono',monospace;
    font-size:11px;
    line-height:1.6;
    color:var(--ink-soft);
    word-break:break-word;
    white-space:pre-wrap;
  }
  #status-log strong{color:var(--ink);}
</style>
</head>
<body>

  <div class="card">
    <div class="card-header">
      <div class="brand">
        ${logoUrl ? `<img src="${logoUrl}" alt="${companyName} logo" />` : ''}
        <div class="brand-text">
          <div class="brand-name">${companyName}</div>
          ${company && company.description ? `<div class="brand-tag">${esc(company.description)}</div>` : ''}
        </div>
      </div>
      <button id="share-btn" aria-label="Share">${arIcon(18)}</button>
    </div>

    <div class="hero">
      <div class="ar-badge">${arIcon(13)} AR READY</div>
      <model-viewer
        id="mv"
        src="${modelUrl}"
        ${usdzUrl ? `ios-src="${usdzUrl}"` : ''}
        poster="${posterUrl}"
        alt="${esc(product.name)}"
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        shadow-intensity="1"
        touch-action="pan-y"
      >
        <button slot="ar-button" class="ar-fab" aria-label="View in AR">${arIcon(20)}</button>
      </model-viewer>
    </div>

    <div class="info">
      <div class="title-row">
        <h1>${esc(product.name)}</h1>
        <div class="price">${Number(product.price).toLocaleString()}</div>
      </div>
      <p class="description">${esc(product.description)}</p>

      <button id="ar-button">
        ${arIcon(20)}
        <span class="ar-button-text">
          <strong>View in your space</strong>
          <small>Point your camera to see it in your room</small>
        </span>
      </button>
    </div>
  </div>

  <div class="footer-brand">Powered by View3D</div>

  <details>
    <summary>Diagnostics (for testing)</summary>
    <div id="status-log"><strong>Status:</strong> waiting for model to load...</div>
  </details>

  <script>
    const mv = document.getElementById('mv');
    const log = document.getElementById('status-log');
    function logMsg(msg) {
      log.innerHTML += '<br>' + msg;
    }

    document.getElementById('ar-button').addEventListener('click', () => {
      logMsg('AR button tapped. canActivateAR = ' + mv.canActivateAR);
      mv.activateAR();
    });

    document.getElementById('share-btn').addEventListener('click', async () => {
      const shareData = { title: '${esc(product.name)}', text: '${esc(product.description)}', url: location.href };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch (e) {}
      } else if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(location.href);
          const btn = document.getElementById('share-btn');
          btn.setAttribute('data-copied', '1');
          setTimeout(() => btn.removeAttribute('data-copied'), 1500);
        } catch (e) {}
      }
    });

    mv.addEventListener('load', () => {
      logMsg('<strong>âœ… Model loaded successfully.</strong>');
    });
    mv.addEventListener('error', (ev) => {
      const d = ev.detail || {};
      let errText = 'no further detail';
      if (d.sourceError) {
        errText = (d.sourceError.name || 'Error') + ': ' + (d.sourceError.message || String(d.sourceError));
      }
      logMsg('<strong>âŒ Model error:</strong> type=' + d.type + ' â€” ' + errText);
    });
    mv.addEventListener('ar-status', (ev) => {
      logMsg('AR status: ' + ev.detail.status);
    });

    window.addEventListener('error', (ev) => {
      logMsg('<strong>âŒ Page error:</strong> ' + ev.message);
    });

    // Fetch the model URL directly too, to separate "can't fetch" from "can't parse".
    fetch('${modelUrl}').then((r) => {
      logMsg('Direct fetch of model URL: HTTP ' + r.status + ', ' + r.headers.get('content-type') + ', ' + r.headers.get('content-length') + ' bytes');
      return r.arrayBuffer();
    }).then((buf) => {
      try {
        const dv = new DataView(buf);
        const magic = dv.getUint32(0, true);
        if (magic !== 0x46546c67) {
          logMsg('<strong>âš ï¸ Not a valid GLB header</strong> (magic bytes don\\'t match "glTF").');
          return;
        }
        const chunkLength = dv.getUint32(12, true);
        const chunkType = dv.getUint32(16, true);
        if (chunkType === 0x4e4f534a) { // 'JSON'
          const jsonBytes = new Uint8Array(buf, 20, chunkLength);
          const json = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
          logMsg('<strong>Extensions used:</strong> ' + JSON.stringify(json.extensionsUsed || []));
          logMsg('<strong>Extensions required:</strong> ' + JSON.stringify(json.extensionsRequired || []));
        }
      } catch (e) {
        logMsg('GLB header parse check failed: ' + e.message);
      }
    }).catch((err) => {
      logMsg('<strong>âŒ Direct fetch failed:</strong> ' + err.message);
    });

    setTimeout(() => {
      if (!mv.loaded) {
        logMsg('âš ï¸ Still not loaded after 8 seconds. modelIsVisible=' + mv.modelIsVisible);
      }
    }, 8000);
  </script>
</body>
</html>`;
}

function arIcon(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
    <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 10.3 12 8l4 2.3v5.4L12 18l-4-2.3v-5.4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

module.exports = { buildServer };
