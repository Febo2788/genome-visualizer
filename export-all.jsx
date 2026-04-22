// Export — "what you see is what you get".
// For each wanted view we:
//   (1) switch into the view,
//   (2) wait for React to commit + fonts to settle,
//   (3) grab every <svg> inside the view area using its ON-SCREEN rect + declared
//       viewBox (NO bbox sweep — that's what was causing blank/cropped exports
//       when labels hadn't laid out yet),
//   (4) also snapshot the legend strip as a small embedded SVG,
//   (5) compose pages into a master SVG, and convert to the requested format.

function exportAllViews(opts) {
  const { format = 'SVG', figureTarget = 'all3', resolution = 300, includes = {} } = opts || {};
  const mountPoint = document.getElementById('root');
  if (!mountPoint) return;

  const origMode = localStorage.getItem('gyre-view') || 'circular';
  const wantedModes =
    figureTarget === 'current' ? [origMode] :
    figureTarget === 'circular' ? ['circular'] :
    figureTarget === 'linear'   ? ['linear']   :
    figureTarget === 'synteny'  ? ['synteny']  :
    ['circular', 'linear', 'synteny'];

  (async () => {
    const snapshots = {};
    for (const mode of wantedModes) {
      localStorage.setItem('gyre-view', mode);
      window.dispatchEvent(new CustomEvent('gyre-set-view', { detail: mode }));
      // Wait generously for React commit + layout + any font-metric settling.
      await waitForIdle(650);

      const viewArea = document.querySelector('[data-gyre-viewarea]') || mountPoint;
      const svgs = Array.from(viewArea.querySelectorAll('svg'));
      if (svgs.length === 0) continue;
      snapshots[mode] = svgs.map(s => serializeSvg(s));
    }

    // Legend snapshot (shared across all pages if includes.Legend is on)
    let legendSnap = null;
    if (includes.Legend !== false) {
      legendSnap = snapshotLegend();
    }

    // Restore user's view
    localStorage.setItem('gyre-view', origMode);
    window.dispatchEvent(new CustomEvent('gyre-set-view', { detail: origMode }));

    // Compose master SVG
    const master = composeMasterSvg(snapshots, wantedModes, {
      legend: legendSnap,
      title: includes['Title block'] !== false,
      scale: includes['Scale bar'] !== false,
    });

    const filename = `gyre-${figureTarget === 'all3' ? 'all-views' : figureTarget}`;

    if (format === 'SVG') {
      downloadBlob(new Blob([master], { type: 'image/svg+xml' }), filename + '.svg');
    } else if (format === 'PNG' || format === 'TIFF') {
      const png = await svgToPng(master, resolution);
      downloadBlob(png, filename + (format === 'TIFF' ? '.tiff' : '.png'));
    } else if (format === 'PDF') {
      const png = await svgToPng(master, resolution);
      const pdfBlob = await pngToPdf(png);
      downloadBlob(pdfBlob, filename + '.pdf');
    }
  })().catch(err => {
    console.error('Export failed:', err);
    alert('Export failed: ' + err.message);
  });
}

async function waitForIdle(ms) {
  // Two rAFs + explicit delay — covers React commit + layout + paint.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }
  await new Promise(r => setTimeout(r, ms));
}

// ============================================================
// Per-SVG snapshot — uses DECLARED viewBox (what the user sees),
// not a bbox sweep. This is the key fix for blank/cropped output.
// ============================================================
function serializeSvg(svg) {
  const rect = svg.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;

  // Inline critical computed styles on text so fonts/sizes render in the rasterizer.
  // We do this on a CLONE so the live DOM is untouched.
  const clone = svg.cloneNode(true);
  inlineTextStyles(svg, clone);

  // If the live SVG allows overflow (synteny ribbons reach BEYOND their own
  // SVG into the neighboring strips), preserve that in the export so ribbons
  // don't get clipped at the band boundary.
  const liveCS = getComputedStyle(svg);
  const overflowVisible = liveCS.overflow === 'visible'
                       || svg.style.overflow === 'visible';

  // Use the declared viewBox (falls back to pixel dims). This is exactly the coord
  // system the author laid out in — labels, ribbons, everything stays at their
  // intended positions. No bbox-sweep fragility.
  const vb = svg.getAttribute('viewBox');
  let viewBox;
  if (vb) {
    viewBox = vb;
  } else {
    viewBox = `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`;
  }
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);

  clone.removeAttribute('style');
  clone.setAttribute('viewBox', viewBox);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return {
    rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
    viewBox,
    contentBox: { x: vx, y: vy, w: vw, h: vh },
    inner: clone.innerHTML,
    overflowVisible,
    attrs: {
      preserveAspectRatio: clone.getAttribute('preserveAspectRatio') || 'xMidYMid meet',
    },
  };
}

// Walk the live SVG and copy computed font/fill/stroke onto the clone's matching
// text/tspan nodes. Tree order is identical between live and clone so we zip them.
function inlineTextStyles(live, clone) {
  const liveNodes = live.querySelectorAll('text, tspan');
  const cloneNodes = clone.querySelectorAll('text, tspan');
  const n = Math.min(liveNodes.length, cloneNodes.length);
  for (let i = 0; i < n; i++) {
    const cs = getComputedStyle(liveNodes[i]);
    const dst = cloneNodes[i];
    const s = [];
    s.push(`font-family:${cs.fontFamily}`);
    s.push(`font-size:${cs.fontSize}`);
    s.push(`font-weight:${cs.fontWeight}`);
    s.push(`font-style:${cs.fontStyle}`);
    if (cs.fill && cs.fill !== 'rgb(0, 0, 0)') s.push(`fill:${cs.fill}`);
    s.push(`letter-spacing:${cs.letterSpacing}`);
    dst.setAttribute('style', s.join(';'));
  }
}

// ============================================================
// Legend snapshot — serialize the rendered legend strip into a small SVG.
// We draw it from scratch in SVG using the same FEATURE_CATEGORIES the UI
// uses, so it matches regardless of on-screen wrapping.
// ============================================================
function snapshotLegend() {
  const cats = (window.FEATURE_CATEGORIES) || {};
  const entries = Object.values(cats).map(c => ({ color: c.color, label: c.label }));
  if (entries.length === 0) return null;

  // Layout — pack into up to 2 rows, measured in a canvas for accurate widths.
  const ctx = document.createElement('canvas').getContext('2d');
  const font = '13px "IBM Plex Sans", system-ui, sans-serif';
  ctx.font = font;
  const swatch = 12, gap = 8, pad = 18, rowH = 24, interItem = 22;

  // Greedy row fill targeting ~1600px wide
  const maxRowW = 1600;
  const rows = [[]];
  let curW = 0;
  for (const e of entries) {
    const w = swatch + gap + ctx.measureText(e.label).width + interItem;
    if (curW + w > maxRowW && rows[rows.length - 1].length > 0) {
      rows.push([]); curW = 0;
    }
    rows[rows.length - 1].push({ ...e, w });
    curW += w;
  }

  const totalW = Math.max(...rows.map(r => r.reduce((a, x) => a + x.w, 0))) + pad * 2;
  const totalH = rows.length * rowH + pad;
  const parts = [];
  parts.push(`<text x="${pad}" y="${pad - 2}" font-family="IBM Plex Mono, monospace" font-size="10" fill="#8A8A84" letter-spacing="0.5">LEGEND</text>`);
  rows.forEach((row, ri) => {
    let x = pad;
    const y = pad + 6 + ri * rowH;
    row.forEach(e => {
      parts.push(`<rect x="${x}" y="${y}" width="${swatch}" height="${swatch}" rx="2" fill="${e.color}"/>`);
      parts.push(`<text x="${x + swatch + gap}" y="${y + swatch - 1.5}" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13" fill="#3A3A36">${escapeXml(e.label)}</text>`);
      x += e.w;
    });
  });

  return {
    w: totalW,
    h: totalH,
    inner: parts.join(''),
  };
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
}

// ============================================================
// Master SVG composer
// ============================================================
function composeMasterSvg(snapshots, order, { legend, title, scale }) {
  const pageW = 1920;
  const gap = 60;
  const titleH = title ? 56 : 0;
  const legendH = legend ? Math.min(160, legend.h + 20) : 0;

  // Each page height = titleH + contentH + legendH
  // Content fills whatever's left of a 1080 target (per page).
  const pageContentH = 1080 - titleH - legendH;
  const pageH = 1080;
  const totalH = order.length * pageH + Math.max(0, (order.length - 1) * gap);

  const pages = order.map((mode, i) => {
    const pageY = i * (pageH + gap);
    const snaps = (snapshots[mode] || []).filter(Boolean);

    // Title
    const titleEl = title
      ? `<text x="40" y="36" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="22" font-weight="600" fill="#1A1A1A">${labelTitle(mode)}</text>
         <text x="40" y="54" font-family="IBM Plex Mono, monospace" font-size="11" fill="#8A8A84" letter-spacing="0.5">GYRE · GENOME VIEWER</text>`
      : '';

    // Empty page
    if (snaps.length === 0) {
      return `<g transform="translate(0 ${pageY})">
        <rect width="${pageW}" height="${pageH}" fill="#FAF8F2"/>
        ${titleEl}
        <text x="40" y="${pageH/2}" font-family="IBM Plex Sans, sans-serif" font-size="16" fill="#8A8A84">(no content captured)</text>
      </g>`;
    }

    // Lay SVGs out in their on-screen order
    const ordered = [...snaps].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
    const stackVertical = ordered.length > 1 && ordered.every((s, idx) => {
      if (idx === 0) return true;
      return ordered[idx].rect.y > ordered[idx-1].rect.y + 4;
    });

    // Synteny: strips + ribbon bands overlap deliberately (ribbons extend into
    // adjacent strip rows). Detect this case — any SVG with overflow:visible
    // declares "I reach outside my own viewBox". Use the LIVE on-screen
    // positions (rect.x / rect.y) so that overlap is preserved, and keep
    // overflow:visible on nested SVGs so ribbons aren't clipped at the band
    // boundary.
    const hasOverflowingSvgs = ordered.some(s => s.overflowVisible);

    let bboxW, bboxH;
    const positioned = [];
    if (hasOverflowingSvgs && ordered.length > 1) {
      // Position by rect — scale pixel rect coords into contentBox units per SVG.
      // We pick a reference SVG to set the coordinate system; ratio px → unit
      // differs per SVG only if the viewBox isn't 1:1, which is the normal case.
      // So: place each SVG's top-left at (rect.x - minX, rect.y - minY), and
      // its width/height follows its rect. This preserves overlaps.
      const minX = Math.min(...ordered.map(s => s.rect.x));
      const minY = Math.min(...ordered.map(s => s.rect.y));
      let maxX = 0, maxY = 0;
      for (const s of ordered) {
        const ox = s.rect.x - minX;
        const oy = s.rect.y - minY;
        positioned.push({ ...s, ox, oy, rectMode: true });
        maxX = Math.max(maxX, ox + s.rect.w);
        maxY = Math.max(maxY, oy + s.rect.h);
      }
      bboxW = maxX;
      bboxH = maxY;
    } else if (stackVertical) {
      bboxW = Math.max(...ordered.map(s => s.contentBox.w));
      let cy = 0;
      const rowGap = 6;
      for (const s of ordered) {
        const dx = (bboxW - s.contentBox.w) / 2;
        positioned.push({ ...s, ox: dx, oy: cy });
        cy += s.contentBox.h + rowGap;
      }
      bboxH = cy - rowGap;
    } else {
      bboxH = Math.max(...ordered.map(s => s.contentBox.h));
      let cx = 0;
      const colGap = 10;
      for (const s of ordered) {
        const dy = (bboxH - s.contentBox.h) / 2;
        positioned.push({ ...s, ox: cx, oy: dy });
        cx += s.contentBox.w + colGap;
      }
      bboxW = cx - colGap;
    }

    bboxW = Math.max(1, bboxW);
    bboxH = Math.max(1, bboxH);

    const contentAvailH = pageContentH - 20;
    const contentAvailW = pageW - 80;
    const fitScale = Math.min(contentAvailW / bboxW, contentAvailH / bboxH);
    const tx = (pageW - bboxW * fitScale) / 2;
    const ty = titleH + 10 + (contentAvailH - bboxH * fitScale) / 2;

    const nested = positioned.map(s => {
      const styleAttr = s.overflowVisible ? ' style="overflow:visible"' : '';
      const overflowAttr = s.overflowVisible ? ' overflow="visible"' : '';
      // In rectMode we use on-screen pixel dims + viewBox so overlaps are faithful.
      // In stack modes we use contentBox (viewBox units) since each SVG is isolated.
      const w = s.rectMode ? s.rect.w : s.contentBox.w;
      const h = s.rectMode ? s.rect.h : s.contentBox.h;
      return `<svg x="${s.ox}" y="${s.oy}" width="${w}" height="${h}" viewBox="${s.viewBox}" preserveAspectRatio="${s.attrs.preserveAspectRatio}"${overflowAttr}${styleAttr} xmlns="http://www.w3.org/2000/svg">${s.inner}</svg>`;
    }).join('');

    // Scale bar, optional — bottom-left of content block
    const scaleEl = scale
      ? `<g transform="translate(${tx} ${titleH + pageContentH - 6})">
          <line x1="0" y1="0" x2="80" y2="0" stroke="#3A3A36" stroke-width="1.5"/>
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#3A3A36" stroke-width="1.5"/>
          <line x1="80" y1="-4" x2="80" y2="4" stroke="#3A3A36" stroke-width="1.5"/>
          <text x="86" y="4" font-family="IBM Plex Mono, monospace" font-size="10" fill="#6A6A6A">scale varies by view</text>
         </g>`
      : '';

    // Legend strip at the bottom of the page
    const legendEl = legend
      ? `<g transform="translate(${(pageW - legend.w) / 2} ${pageH - legendH + 6})">
          <rect width="${legend.w}" height="${legend.h + 8}" fill="#FFFFFF" stroke="#E0DDD3"/>
          <g transform="translate(0 4)">${legend.inner}</g>
         </g>`
      : '';

    return `<g transform="translate(0 ${pageY})">
      <rect width="${pageW}" height="${pageH}" fill="#FAF8F2"/>
      ${titleEl}
      <g transform="translate(${tx} ${ty}) scale(${fitScale})">${nested}</g>
      ${scaleEl}
      ${legendEl}
    </g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${totalH}" viewBox="0 0 ${pageW} ${totalH}">
  <rect width="${pageW}" height="${totalH}" fill="#FAF8F2"/>
  ${pages}
</svg>`;
}

function labelTitle(k) {
  return k === 'circular' ? 'Circular genome view'
       : k === 'linear'   ? 'Linear genome view'
       : 'Synteny comparison';
}

// ============================================================
// Rasterization
// ============================================================
async function svgToPng(svgText, dpi) {
  const m = svgText.match(/width="(\d+)"\s+height="(\d+)"/);
  const w = m ? parseInt(m[1], 10) : 1920;
  const h = m ? parseInt(m[2], 10) : 1200;
  const scale = Math.min(3, Math.max(1, dpi / 150));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('SVG rasterize failed'));
      im.src = url;
    });
    ctx.fillStyle = '#FAF8F2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  return await new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
}

async function pngToPdf(pngBlob) {
  const img = await blobToImage(pngBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FAF8F2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const jpgBlob = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.92));
  const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
  return buildPdfWithJpeg(jpgBytes, canvas.width, canvas.height);
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = reject; im.src = url;
  });
}

function buildPdfWithJpeg(jpgBytes, w, h) {
  const pageW = w * 72 / 150;
  const pageH = h * 72 / 150;
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };

  add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);
  const imgDict = `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.length} >>`;
  add({ __stream: true, dict: imgDict, data: jpgBytes });
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;
  add({ __stream: true, dict: `<< /Length ${content.length} >>`, data: new TextEncoder().encode(content) });

  const parts = [];
  const pushStr = (s) => parts.push(new TextEncoder().encode(s));
  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [0];
  objs.forEach((o, i) => {
    const off = parts.reduce((a, p) => a + p.length, 0);
    offsets.push(off);
    const n = i + 1;
    if (typeof o === 'string') {
      pushStr(`${n} 0 obj\n${o}\nendobj\n`);
    } else {
      pushStr(`${n} 0 obj\n${o.dict}\nstream\n`);
      parts.push(o.data);
      pushStr(`\nendstream\nendobj\n`);
    }
  });
  const xrefStart = parts.reduce((a, p) => a + p.length, 0);
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return new Blob([out], { type: 'application/pdf' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

Object.assign(window, { exportAllViews });
