// Auto-fit calculation utilities for exports and previews
// These determine the zoom/view level to fit all content in one frame

/**
 * Calculate zoom level for circular view to fit all tracks
 * @param {Array} tracks - Array of track objects with radius and thickness
 * @returns {number} Zoom level (1 = normal, <1 = zoomed out)
 */
function calculateAutoFitZoomCircular(tracks) {
  if (!tracks || tracks.length === 0) return 1;

  // Find the maximum radius needed
  const maxRadius = Math.max(
    ...tracks.map(t => (t.radius || 0) + (t.thickness || 0.01) / 2)
  );

  // ViewBox is "-0.18 -0.18 1.36 1.36", so max safe radius is ~0.68 from center
  // With 0.05 padding buffer, we need content to fit within 0.63
  const maxSafeRadius = 0.63;

  // If max radius fits in safe area, use zoom 1
  // Otherwise, zoom out proportionally
  if (maxRadius <= maxSafeRadius) {
    return 1;
  }

  // Zoom out to fit: zoom = maxSafeRadius / maxRadius
  const autoZoom = maxSafeRadius / maxRadius;
  return Math.max(0.3, autoZoom); // Min zoom 0.3 to avoid shrinking too much
}

/**
 * Calculate view window for linear view to show entire genome
 * @param {number} genomeLen - Total genome length
 * @returns {Object} {viewStart, viewEnd}
 */
function calculateAutoFitViewLinear(genomeLen) {
  return {
    viewStart: 0,
    viewEnd: genomeLen || 1,
  };
}

/**
 * Get auto-fit parameters for current view mode
 * @param {string} viewMode - 'circular', 'linear', or 'synteny'
 * @param {Array} tracks - Tracks array (for circular)
 * @param {number} genomeLen - Genome length (for linear/synteny)
 * @returns {Object} {zoom, panX, panY, viewStart, viewEnd}
 */
function getAutoFitParams(viewMode, tracks, genomeLen) {
  const params = { zoom: 1, panX: 0, panY: 0 };

  if (viewMode === 'circular') {
    params.zoom = calculateAutoFitZoomCircular(tracks);
  } else if (viewMode === 'linear') {
    const view = calculateAutoFitViewLinear(genomeLen);
    params.viewStart = view.viewStart;
    params.viewEnd = view.viewEnd;
  } else if (viewMode === 'synteny') {
    const view = calculateAutoFitViewLinear(genomeLen);
    params.viewStart = view.viewStart;
    params.viewEnd = view.viewEnd;
  }

  return params;
}

Object.assign(window, { calculateAutoFitZoomCircular, calculateAutoFitViewLinear, getAutoFitParams });
