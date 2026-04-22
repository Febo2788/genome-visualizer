// Sample genome data — Mycobacterium tuberculosis H37Rv-ish subset, fabricated but biologically plausible
// Used to populate the viewer with real-feeling tracks.

const GENOME_LENGTH = 4411532;
const GENOME_NAME = "M. tuberculosis H37Rv";
const GENOME_ACCESSION = "NC_000962.3";

// Feature categories with curated colors (muted scientific palette)
const FEATURE_CATEGORIES = {
  "Information storage":    { color: "#5B8AA6", label: "Information storage & processing" },
  "Cellular processes":     { color: "#7FA876", label: "Cellular processes & signaling" },
  "Metabolism":             { color: "#C4976A", label: "Metabolism" },
  "Poorly characterized":   { color: "#9C9C9C", label: "Poorly characterized" },
  "Mobile elements":        { color: "#B67777", label: "Mobile elements" },
  "RNA":                    { color: "#8878A8", label: "RNA (tRNA / rRNA / ncRNA)" },
  "Regulatory":             { color: "#D4A84A", label: "Regulatory" },
  "Hypothetical":           { color: "#BCB7A8", label: "Hypothetical" },
};

// Deterministic PRNG so layout is stable between reloads
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate ~400 CDS features spread around the genome
function generateFeatures() {
  const rnd = mulberry32(42);
  const cats = Object.keys(FEATURE_CATEGORIES);
  const features = [];
  let pos = 2000;
  let idx = 1;
  while (pos < GENOME_LENGTH - 3000) {
    const length = 300 + Math.floor(rnd() * 2400);
    const strand = rnd() > 0.48 ? 1 : -1;
    // weight category assignment roughly like real bacteria
    const r = rnd();
    let cat;
    if (r < 0.32) cat = "Metabolism";
    else if (r < 0.52) cat = "Poorly characterized";
    else if (r < 0.66) cat = "Cellular processes";
    else if (r < 0.78) cat = "Information storage";
    else if (r < 0.86) cat = "Hypothetical";
    else if (r < 0.92) cat = "Mobile elements";
    else if (r < 0.97) cat = "RNA";
    else cat = "Regulatory";

    // Generate gene name from category or use locus tag
    const geneNames = {
      "Information storage": ["dnaA", "dnaB", "dnaC", "dnaG", "dnaX", "dnaN", "dnaE", "polA", "gyrA", "gyrB", "topA", "rpoA", "rpoB", "rpoC", "rpoD"],
      "Cellular processes": ["ftsA", "ftsK", "ftsZ", "divIB", "divIC", "divJ", "mraY", "murC", "murD", "murE", "murF", "murG"],
      "Metabolism": ["aceA", "aceB", "acoA", "acoB", "acoC", "acpP", "adhA", "adhE", "aldA", "araA", "araB", "araC"],
      "Poorly characterized": ["ORF", "conserved", "predicted", "unknown", "putative", "hypothetical"],
      "Regulatory": ["crp", "dam", "dcm", "fis", "hfq", "leuO", "tyrR"],
      "Mobile elements": ["IS", "transposase", "integrase"],
      "RNA": ["trnA", "trnB", "trnC", "rrnA", "rrnB", "rrnC"],
      "Hypothetical": ["unk", "hyp", "putative"],
    };
    const genePool = geneNames[cat] || ["gene"];
    const geneName = genePool[Math.floor(rnd() * genePool.length)] + idx;

    features.push({
      id: `Rv${String(idx).padStart(4, '0')}${rnd() > 0.8 ? 'c' : ''}`,
      start: pos,
      end: pos + length,
      strand,
      category: cat,
      gene: geneName,
      product: productForCat(cat, rnd),
      locus_tag: `Rv${String(idx).padStart(4, '0')}`,
    });
    pos += length + Math.floor(rnd() * 400) + 20;
    idx++;
  }
  return features;
}

function productForCat(cat, rnd) {
  const pools = {
    "Information storage": ["DNA polymerase III subunit alpha", "50S ribosomal protein L2", "RNA polymerase sigma factor SigA", "DNA gyrase subunit B", "transcription elongation factor NusA"],
    "Cellular processes": ["cell division protein FtsZ", "chaperone protein DnaK", "ATP synthase subunit beta", "penicillin-binding protein", "two-component sensor histidine kinase"],
    "Metabolism": ["acyl-CoA dehydrogenase", "isocitrate dehydrogenase", "phosphoenolpyruvate carboxylase", "aconitate hydratase", "pyruvate kinase", "mycolic acid synthase"],
    "Poorly characterized": ["conserved hypothetical protein", "uncharacterized membrane protein", "PPE family protein", "PE family protein"],
    "Mobile elements": ["IS1081 transposase", "IS6110 transposase", "phage integrase family protein", "mobile genetic element"],
    "RNA": ["tRNA-Ala", "tRNA-Leu", "23S ribosomal RNA", "16S ribosomal RNA", "ncRNA Mcr7"],
    "Regulatory": ["transcriptional regulator WhiB3", "TetR family regulator", "response regulator transcription factor"],
    "Hypothetical": ["hypothetical protein", "hypothetical protein, conserved"],
  };
  const p = pools[cat] || pools["Hypothetical"];
  return p[Math.floor(rnd() * p.length)];
}

const FEATURES = generateFeatures();

// GC content — compute smooth pseudo-signal
function generateGCContent(windowCount = 360) {
  const rnd = mulberry32(7);
  const values = [];
  let v = 0.655;
  for (let i = 0; i < windowCount; i++) {
    v += (rnd() - 0.5) * 0.012;
    // Mycobacterium is GC-rich (~65%)
    v = Math.max(0.58, Math.min(0.72, v));
    values.push(v);
  }
  return values;
}

// GC skew — oscillates, with inflection near origin/terminus
function generateGCSkew(windowCount = 360) {
  const rnd = mulberry32(99);
  const values = [];
  for (let i = 0; i < windowCount; i++) {
    const theta = (i / windowCount) * Math.PI * 2;
    // two inflection points (origin ~0, terminus ~half)
    const base = Math.sin(theta) * 0.22;
    const noise = (rnd() - 0.5) * 0.05;
    values.push(base + noise);
  }
  return values;
}

// Coverage-ish track from a synthetic BED
function generateCoverage(windowCount = 360) {
  const rnd = mulberry32(1234);
  const values = [];
  let v = 0.5;
  for (let i = 0; i < windowCount; i++) {
    v += (rnd() - 0.5) * 0.08;
    v = Math.max(0.1, Math.min(0.95, v));
    // occasional amplified region
    if (i === 120 || i === 121 || i === 122) v = Math.min(1, v + 0.3);
    values.push(v);
  }
  return values;
}

// Curated labels (named genes)
const CURATED_LABELS = [
  { position: 1471846, name: "katG",   note: "catalase-peroxidase" },
  { position: 2155168, name: "rpoB",   note: "RNA pol β subunit" },
  { position: 781560,  name: "rpsL",   note: "30S ribosomal S12" },
  { position: 4247431, name: "embB",   note: "arabinosyltransferase" },
  { position: 3073680, name: "gyrA",   note: "DNA gyrase α" },
  { position: 759807,  name: "inhA",   note: "enoyl-ACP reductase" },
  { position: 2714124, name: "pncA",   note: "pyrazinamidase" },
  { position: 4326003, name: "ethA",   note: "monooxygenase" },
  { position: 1917940, name: "esxA",   note: "ESAT-6" },
  { position: 1917339, name: "esxB",   note: "CFP-10" },
];

// Synthetic BLAST-like cross-links between two genomes
// SYNTENY_LINKS: comparison blocks between reference and one other genome (for 2-genome view)
// Will be populated with real BLAST data when genomes are compared
const SYNTENY_LINKS = [];

// COMPARISON_GENOMES: list of genomes being compared (reference + uploaded genomes)
// Demo includes synthetic comparison genomes for visualization
function generateSyntheticGenomes() {
  return [
    { id: "ref", name: "Reference", length: GENOME_LENGTH, color: "#2B5F6B" },
    { id: "g1", name: "Strain A", length: Math.floor(GENOME_LENGTH * 0.98), color: "#5B8AA6" },
    { id: "g2", name: "Strain B", length: Math.floor(GENOME_LENGTH * 0.95), color: "#7FA876" },
  ];
}

const COMPARISON_GENOMES = generateSyntheticGenomes();

// MULTI_SYNTENY: BLAST ribbons between adjacent genomes in synteny view
// Generate demo BLAST alignments between reference and strains
function generateDemoSynteny() {
  const rnd = mulberry32(99);
  const pairs = [];
  // Create ~15 BLAST alignment pairs between ref and strain A
  for (let i = 0; i < 15; i++) {
    const refStart = Math.floor(rnd() * (GENOME_LENGTH - 50000));
    const refEnd = refStart + 5000 + Math.floor(rnd() * 20000);
    const g1Start = Math.floor(rnd() * (COMPARISON_GENOMES[1].length - 50000));
    const g1End = g1Start + 5000 + Math.floor(rnd() * 20000);
    pairs.push({
      a: [refStart, refEnd],
      b: [g1Start, g1End],
      identity: 0.75 + rnd() * 0.24,
      inverted: rnd() < 0.1,
    });
  }

  const pairs2 = [];
  // Create ~12 BLAST alignment pairs between strain A and strain B
  for (let i = 0; i < 12; i++) {
    const g1Start = Math.floor(rnd() * (COMPARISON_GENOMES[1].length - 50000));
    const g1End = g1Start + 5000 + Math.floor(rnd() * 20000);
    const g2Start = Math.floor(rnd() * (COMPARISON_GENOMES[2].length - 50000));
    const g2End = g2Start + 5000 + Math.floor(rnd() * 20000);
    pairs2.push({
      a: [g1Start, g1End],
      b: [g2Start, g2End],
      identity: 0.70 + rnd() * 0.28,
      inverted: rnd() < 0.15,
    });
  }

  return [
    { from: 0, to: 1, pairs },
    { from: 1, to: 2, pairs: pairs2 },
  ];
}

const MULTI_SYNTENY = generateDemoSynteny();

// Per-genome features for synteny view (includes demo features for synthetic genomes)
function generateDemoSyntenyFeatures() {
  const rnd = mulberry32(88);
  const cats = Object.keys(FEATURE_CATEGORIES);

  // Generate features for strain A (slightly fewer than reference)
  const g1Features = [];
  let pos = 1500;
  while (pos < COMPARISON_GENOMES[1].length - 2000) {
    const length = 300 + Math.floor(rnd() * 2200);
    const strand = rnd() > 0.48 ? 1 : -1;
    const cat = cats[Math.floor(rnd() * cats.length)];
    g1Features.push({
      id: `g1_f${g1Features.length}`,
      start: pos,
      end: Math.min(pos + length, COMPARISON_GENOMES[1].length),
      strand,
      category: cat,
      gene: `Strain_A_${Math.floor(pos / 10000)}`,
      product: "",
    });
    pos += length + Math.floor(rnd() * 1800);
  }

  // Generate features for strain B (slightly fewer than strain A)
  const g2Features = [];
  pos = 1500;
  while (pos < COMPARISON_GENOMES[2].length - 2000) {
    const length = 300 + Math.floor(rnd() * 2100);
    const strand = rnd() > 0.48 ? 1 : -1;
    const cat = cats[Math.floor(rnd() * cats.length)];
    g2Features.push({
      id: `g2_f${g2Features.length}`,
      start: pos,
      end: Math.min(pos + length, COMPARISON_GENOMES[2].length),
      strand,
      category: cat,
      gene: `Strain_B_${Math.floor(pos / 10000)}`,
      product: "",
    });
    pos += length + Math.floor(rnd() * 1800);
  }

  return {
    g1: g1Features,
    g2: g2Features,
  };
}

const SYNTENY_GENOME_FEATURES = generateDemoSyntenyFeatures();

// Generate demo labels for circular view (~50 labels, unevenly spread to show clustering)
function generateDemoLabels() {
  const rnd = mulberry32(77);
  const colors = ['#5B8AA6', '#7FA876', '#C4976A', '#B67777', '#8878A8', '#D4A84A', '#BCB7A8', '#2B5F6B', '#9C9C9C', '#FF6B6B', '#4ECDC4'];
  const labels = [];

  // Group features by genome region to ensure proper distribution
  const regionSize = GENOME_LENGTH / 4;
  const regions = [[], [], [], []];

  // Sort features into regions by position
  for (const feature of FEATURES) {
    if (!feature || !feature.gene) continue;
    const pos = (feature.start + feature.end) / 2;
    const regionIdx = Math.floor(Math.min(3, pos / regionSize));
    regions[regionIdx].push({ position: Math.floor(pos), name: feature.gene });
  }

  // Pick from each region with different densities
  // Regions 1 and 3 dense, regions 0 and 2 sparse
  const targetCounts = [5, 18, 5, 22]; // uneven distribution across 4 regions

  for (let r = 0; r < 4; r++) {
    const featuresToPick = Math.min(targetCounts[r], regions[r].length);
    const picked = new Set();

    while (picked.size < featuresToPick && picked.size < regions[r].length) {
      const idx = Math.floor(rnd() * regions[r].length);
      if (!picked.has(idx)) {
        picked.add(idx);
        const feature = regions[r][idx];
        labels.push({
          position: feature.position,
          name: feature.name,
          color: colors[Math.floor(rnd() * colors.length)],
          bold: rnd() > 0.65,
          italic: rnd() > 0.55,
        });
      }
    }
  }

  return labels;
}

const DEMO_LABELS = generateDemoLabels();

// BRIG-style per-genome BLAST hit tracks for the circular view.
// Each track is an array of {start, end, identity} segments; gaps = absent in that genome.
function generateBlastRing(seed, presenceRate = 0.85) {
  const rnd = mulberry32(seed);
  const out = [];
  let pos = 0;
  while (pos < GENOME_LENGTH) {
    const len = 3000 + Math.floor(rnd() * 25000);
    const present = rnd() < presenceRate;
    if (present) {
      out.push({
        start: pos,
        end: Math.min(GENOME_LENGTH, pos + len),
        identity: 0.70 + rnd() * 0.29,
      });
    }
    pos += len + Math.floor(rnd() * 2000);
  }
  return out;
}
// Reference = one solid 100%-identity ring covering the full genome (shown as filled line)
const REFERENCE_RING = [{ start: 0, end: GENOME_LENGTH, identity: 1.0 }];
const BLAST_RINGS = {
  g0: REFERENCE_RING,
  g1: generateBlastRing(11, 0.88),
  g2: generateBlastRing(22, 0.82),
  g3: generateBlastRing(33, 0.74),  // more gaps — distant lineage
  g4: generateBlastRing(44, 0.79),
};

// Default track configuration (inner → outer), mapped directly from the python script's model
const DEFAULT_TRACKS = [
  { id: "t-inner-ruler", name: "Coordinates (inner)", type: "ruler", visible: true, radius: 0.30, thickness: 0.015, color: "#666" },
  { id: "t-gc-skew",     name: "GC skew",             type: "gc-skew",  visible: true, radius: 0.34, thickness: 0.07,  posColor: "#7FA876", negColor: "#B67777" },
  { id: "t-gc",          name: "GC content",          type: "gc",       visible: true, radius: 0.43, thickness: 0.07,  color: "#3A3A3A" },
  { id: "t-coverage",    name: "Coverage (BED)",      type: "bed",      visible: true, radius: 0.52, thickness: 0.06,  color: "#5B8AA6", bg: "#EFEBE1" },
  { id: "t-cds-rev",     name: "CDS (reverse)",       type: "cds",      visible: true, radius: 0.60, thickness: 0.045, strand: -1, colorBy: "category" },
  { id: "t-cds-fwd",     name: "CDS (forward)",       type: "cds",      visible: true, radius: 0.66, thickness: 0.045, strand: 1,  colorBy: "category" },
  { id: "t-rna",         name: "tRNA / rRNA",         type: "rna",      visible: true, radius: 0.72, thickness: 0.025, color: "#8878A8" },
  { id: "t-mobile",      name: "Mobile elements",     type: "mobile",   visible: true, radius: 0.755, thickness: 0.025, color: "#B67777" },
  { id: "t-ruler",       name: "Coordinates (outer)", type: "ruler",    visible: true, radius: 0.80, thickness: 0.015, color: "#666" },
  { id: "t-blast-g0",    name: "BLAST · H37Rv (ref)", type: "blast-ring", visible: true, radius: 0.815, thickness: 0.018, color: "#2B5F6B", ringId: "g0", opacity: 1.0 },
  { id: "t-blast-g1",    name: "BLAST · CDC1551",     type: "blast-ring", visible: true, radius: 0.837, thickness: 0.018, color: "#5B8AA6", ringId: "g1", opacity: 1.0 },
  { id: "t-blast-g2",    name: "BLAST · Erdman",      type: "blast-ring", visible: true, radius: 0.859, thickness: 0.018, color: "#7FA876", ringId: "g2", opacity: 1.0 },
  { id: "t-blast-g3",    name: "BLAST · Beijing/W",   type: "blast-ring", visible: true, radius: 0.881, thickness: 0.018, color: "#C4976A", ringId: "g3", opacity: 1.0 },
  { id: "t-labels",      name: "Gene labels",         type: "labels",   visible: true, radius: 0.91, thickness: 0,     color: "#1A1A1A" },
];

const GC_CONTENT = generateGCContent();
const GC_SKEW = generateGCSkew();
const COVERAGE = generateCoverage();

Object.assign(window, {
  GENOME_LENGTH, GENOME_NAME, GENOME_ACCESSION,
  FEATURE_CATEGORIES, FEATURES, CURATED_LABELS, DEMO_LABELS,
  GC_CONTENT, GC_SKEW, COVERAGE,
  SYNTENY_LINKS, DEFAULT_TRACKS,
  COMPARISON_GENOMES, MULTI_SYNTENY, BLAST_RINGS, SYNTENY_GENOME_FEATURES,
});
