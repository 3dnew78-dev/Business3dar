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
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
<style>
  :root{
    --paper:#EDEFF3;
    --paper-line:#D3D8E0;
    --ink:#161B2E;
    --ink-soft:#5B6478;
    --accent:#5B5FEF;
    --accent-ink:#FFFFFF;
    --price:#D9861C;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    font-family:'Inter',system-ui,sans-serif;
    background:
      linear-gradient(var(--paper-line) 1px, transparent 1px) 0 0/100% 28px,
      linear-gradient(90deg, var(--paper-line) 1px, transparent 1px) 0 0/28px 100%,
      var(--paper);
    background-attachment:fixed;
    color:var(--ink);
    min-height:100vh;
    display:flex;
    flex-direction:column;
    align-items:center;
    padding:20px 16px 48px;
  }
  .topbar{
    width:100%;
    max-width:520px;
    display:flex;
    align-items:center;
    gap:10px;
    margin-bottom:18px;
  }
  .topbar img{
    width:32px;height:32px;border-radius:8px;object-fit:cover;
    border:1px solid var(--paper-line);
    background:#fff;
  }
  .topbar .company-name{
    font-family:'IBM Plex Mono',monospace;
    font-size:12px;
    letter-spacing:0.06em;
    text-transform:uppercase;
    color:var(--ink-soft);
  }
  .viewer-frame{
    position:relative;
    width:100%;
    max-width:520px;
    aspect-ratio:1/1;
    background:#fff;
  }
  .bracket{
    position:absolute;
    width:22px;height:22px;
    border:2px solid var(--accent);
  }
  .bracket.tl{top:-2px;left:-2px;border-right:none;border-bottom:none;}
  .bracket.tr{top:-2px;right:-2px;border-left:none;border-bottom:none;}
  .bracket.bl{bottom:-2px;left:-2px;border-right:none;border-top:none;}
  .bracket.br{bottom:-2px;right:-2px;border-left:none;border-top:none;}
  model-viewer{
    width:100%;
    height:100%;
    background:#fff;
    --poster-color:transparent;
  }
  .eyebrow{
    font-family:'IBM Plex Mono',monospace;
    font-size:11px;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--accent);
    display:flex;
    align-items:center;
    gap:6px;
    margin:14px 0 4px;
  }
  .eyebrow .dot{
    width:6px;height:6px;border-radius:50%;
    background:var(--accent);
    animation:pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse{
    0%,100%{opacity:1;} 50%{opacity:0.25;}
  }
  .panel{
    width:100%;
    max-width:520px;
  }
  h1{
    font-family:'Space Grotesk',sans-serif;
    font-size:28px;
    font-weight:700;
    margin:2px 0 8px;
    line-height:1.15;
  }
  .price{
    font-family:'IBM Plex Mono',monospace;
    font-size:18px;
    color:var(--price);
    margin:0 0 14px;
  }
  .description{
    font-size:15px;
    line-height:1.55;
    color:var(--ink-soft);
    margin:0 0 22px;
  }
  #ar-button{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    width:100%;
    padding:14px 18px;
    background:var(--accent);
    color:var(--accent-ink);
    border:none;
    border-radius:10px;
    font-family:'Space Grotesk',sans-serif;
    font-size:15px;
    font-weight:700;
    cursor:pointer;
  }
  #ar-button:focus-visible{outline:3px solid var(--ink); outline-offset:2px;}
  .hint{
    font-family:'IBM Plex Mono',monospace;
    font-size:11px;
    color:var(--ink-soft);
    text-align:center;
    margin-top:10px;
  }
  #status-log{
    width:100%;
    max-width:520px;
    margin-top:18px;
    padding:12px;
    background:#fff;
    border:1px solid var(--paper-line);
    border-radius:8px;
    font-family:'IBM Plex Mono',monospace;
    font-size:11px;
    line-height:1.6;
    color:var(--ink-soft);
    word-break:break-word;
    white-space:pre-wrap;
  }
  #status-log strong{color:var(--ink);}
  @media (prefers-reduced-motion: reduce){
    .eyebrow .dot{animation:none;}
  }
</style>
</head>
<body>

  <div class="topbar">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName} logo" />` : ''}
    <span class="company-name">${companyName}</span>
  </div>

  <div class="viewer-frame">
    <div class="bracket tl"></div>
    <div class="bracket tr"></div>
    <div class="bracket bl"></div>
    <div class="bracket br"></div>
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
    ></model-viewer>
  </div>

  <div class="panel">
    <div class="eyebrow"><span class="dot"></span>AR READY</div>
    <h1>${esc(product.name)}</h1>
    <div class="price">${Number(product.price).toLocaleString()}</div>
    <p class="description">${esc(product.description)}</p>
    <button id="ar-button">View in your space</button>
    <div class="hint">Opens your camera â€” point it at a flat surface</div>
  </div>

  <div id="status-log"><strong>Status:</strong> waiting for model to load...</div>

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

    mv.addEventListener('load', () => {
      logMsg('<strong>âœ… Model loaded successfully.</strong>');
    });
    mv.addEventListener('error', (ev) => {
      logMsg('<strong>âŒ Model error:</strong> ' + JSON.stringify(ev.detail || ev.type));
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

module.exports = { buildServer };
