// vcf-parser.jsx
// Parse VCF (Variant Call Format) files and provide import functionality

const VCF_COLORS = { SNP: '#5B8AA6', INS: '#7FA876', DEL: '#B67777', SV: '#8878A8' };

// ============================================================
// parseVCF(text)
// Parse VCF format: skip ##meta lines, extract #CHROM header,
// parse data lines into variant objects
// ============================================================
function parseVCF(text) {
  const variants = [];
  const sampleNames = [];
  let firstChrom = null;
  let genomeLen = 0;

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip meta lines (##)
    if (line.startsWith('##')) continue;

    // Parse header line (#CHROM)
    if (line.startsWith('#CHROM')) {
      const cols = line.split(/\t/);
      if (cols.length >= 9) {
        // Columns: #CHROM, POS, ID, REF, ALT, QUAL, FILTER, INFO, FORMAT, samples...
        for (let i = 9; i < cols.length; i++) {
          sampleNames.push(cols[i]);
        }
      }
      continue;
    }

    // Parse data lines
    const cols = line.split(/\t/);
    if (cols.length < 8) continue;

    const chrom = cols[0];
    const pos = parseInt(cols[1], 10) - 1; // VCF is 1-based; convert to 0-based
    const id = cols[2];
    const ref = cols[3];
    const altStr = cols[4];
    const qual = cols[5];
    const filter = cols[6];
    const info = cols[7];
    const format = cols[8] || '';
    const sampleCols = cols.slice(9);

    if (isNaN(pos)) continue;

    // Stick to first chromosome
    firstChrom = firstChrom || chrom;
    if (chrom !== firstChrom) continue;

    // Parse ALT field: can be comma-separated or structured like <DEL>, <INS>, etc.
    const alts = altStr.split(',');
    const alt = alts[0] || ref; // Take first ALT allele for now

    // Infer variant type
    let varType = 'SNP';
    let end = pos + ref.length;

    // Check for SV indicators in ALT field
    if (/^<(DEL|INS|DUP|INV|CNV|BND)>$/i.test(alt)) {
      varType = 'SV';
      // Try to get END from INFO
      const endMatch = info.match(/END=(\d+)/);
      if (endMatch) {
        end = parseInt(endMatch[1], 10) - 1; // VCF is 1-based
      }
    }
    // Check for SV indicators in INFO
    else if (/SVTYPE=/i.test(info)) {
      varType = 'SV';
      const endMatch = info.match(/END=(\d+)/);
      if (endMatch) {
        end = parseInt(endMatch[1], 10) - 1;
      }
    }
    // Check for very long ALT (>50bp is SV)
    else if (alt.length > 50) {
      varType = 'SV';
      end = pos + alt.length;
    }
    // Indel detection
    else if (alt.length > ref.length) {
      varType = 'INS';
      end = pos + ref.length;
    } else if (ref.length > alt.length) {
      varType = 'DEL';
      end = pos + ref.length;
    }

    genomeLen = Math.max(genomeLen, end);

    // Parse genotypes
    const genotypes = {};
    const formatFields = format.split(':');
    for (let i = 0; i < sampleNames.length && i < sampleCols.length; i++) {
      const sampleName = sampleNames[i];
      const sampleData = sampleCols[i];
      const sampleFields = sampleData.split(':');

      // Extract GT, DP, GQ, AF
      const gt = formatFields.indexOf('GT') >= 0 ? sampleFields[formatFields.indexOf('GT')] : '.';
      const dp = formatFields.indexOf('DP') >= 0 ? sampleFields[formatFields.indexOf('DP')] : '.';
      const gq = formatFields.indexOf('GQ') >= 0 ? sampleFields[formatFields.indexOf('GQ')] : '.';
      const af = formatFields.indexOf('AF') >= 0 ? sampleFields[formatFields.indexOf('AF')] : '.';

      genotypes[sampleName] = {
        gt: gt || '.',
        dp: dp || '.',
        gq: gq || '.',
        af: af || '.',
      };
    }

    // Parse VEP annotation (CSQ field in INFO)
    let vepAnnot = null;
    const cSQMatch = info.match(/CSQ=([^;]+)/);
    if (cSQMatch) {
      const csqStr = cSQMatch[1].split(',')[0]; // Take first annotation
      // Common CSQ field order: Allele|Consequence|IMPACT|SYMBOL|Gene|Feature|HGVSp|...
      const csqFields = csqStr.split('|');
      if (csqFields.length >= 7) {
        vepAnnot = {
          allele: csqFields[0] || '.',
          consequence: csqFields[1] || '.',
          impact: csqFields[2] || '.',
          symbol: csqFields[3] || '.',
          gene: csqFields[4] || '.',
          feature: csqFields[5] || '.',
          hgvsp: csqFields[6] || '.',
        };
      }
    }

    // Parse SnpEff annotation (ANN field in INFO)
    let snpeffAnnot = null;
    const annMatch = info.match(/ANN=([^;]+)/);
    if (annMatch) {
      const annStr = annMatch[1].split(',')[0]; // Take first annotation
      // Common ANN field order: Allele|Annotation|Impact|Gene_Name|Gene_ID|Feature_Type|Feature_ID|...
      const annFields = annStr.split('|');
      if (annFields.length >= 4) {
        snpeffAnnot = {
          allele: annFields[0] || '.',
          annotation: annFields[1] || '.',
          impact: annFields[2] || '.',
          geneName: annFields[3] || '.',
        };
      }
    }

    const variant = {
      id: id || '.',
      chrom,
      pos,
      ref,
      alt,
      qual: qual || '.',
      filter: filter || '.',
      info,
      varType,
      end,
      genotypes,
      vepAnnot,
      snpeffAnnot,
      _vcf: true, // sentinel
    };

    variants.push(variant);
  }

  return { variants, sampleNames, chrom: firstChrom, length: genomeLen };
}

// ============================================================
// openVCF(setTracks)
// File picker + import handler for VCF files
// ============================================================
function openVCF(setTracks) {
  pickFile('.vcf,.txt,text/plain', async (file) => {
    const text = await file.text();
    const parsed = parseVCF(text);

    if (parsed.variants.length === 0) {
      alert('No variants found in VCF file.');
      return;
    }

    // Adopt genome length if not already larger
    if (parsed.length > window.GENOME_LENGTH) {
      window.GENOME_LENGTH = parsed.length;
    }

    // Store VCF data in window
    window.USER_VCF = window.USER_VCF || {};
    const trackId = `t-vcf-${Date.now()}`;
    window.USER_VCF[trackId] = parsed.variants;

    // Add new track
    setTracks(ts => {
      const maxR = Math.max(...ts.map(t => t.radius));
      const name = file.name.replace(/\.(vcf|txt)$/i, '');
      const newTrack = {
        id: trackId,
        name: `VCF · ${name}`,
        type: 'vcf',
        visible: true,
        radius: Math.min(0.88, maxR + 0.04),
        thickness: 0.035,
        userImported: true,
      };
      return [...ts, newTrack];
    });

    window.dispatchEvent(new Event('gyre-data-loaded'));
    console.info(`[gyre] imported ${parsed.variants.length} variants from ${file.name}`);
  });
}

Object.assign(window, {
  parseVCF, openVCF, VCF_COLORS,
});
