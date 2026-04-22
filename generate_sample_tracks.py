#!/usr/bin/env python3
"""
Generate sample BED (feature tracks) and bedGraph (continuous value tracks)
for importing into Gyre genome viewer.

Generates:
- two BED files (gene predictions + transposable elements)
- two bedGraph files (GC content + coverage)
"""

import random
from pathlib import Path


def generate_bed_genes(genome_len, output_file, num_genes=150):
    """Generate a BED file with predicted genes."""
    random.seed(42)
    genes = []

    pos = 0
    while pos < genome_len - 1000:
        # Gene length: 800-3000 bp
        length = random.randint(800, 3000)
        end = min(pos + length, genome_len)

        # Strand: +/- equally
        strand = '+' if random.random() > 0.5 else '-'

        # Gene name
        gene_num = len(genes)
        gene_name = f"gene_{gene_num:04d}"

        genes.append({
            'start': pos,
            'end': end,
            'name': gene_name,
            'strand': strand,
        })

        # Next gene: 500-2000 bp gap
        pos = end + random.randint(500, 2000)

    # Write BED file
    with open(output_file, 'w') as f:
        f.write(f"# Generated feature track: {num_genes} genes\n")
        f.write("# Format: chrom  start  end  name  score  strand\n")
        for gene in genes[:num_genes]:
            score = random.randint(800, 1000)  # Arbitrary score
            f.write(f"chr1\t{gene['start']}\t{gene['end']}\t{gene['name']}\t{score}\t{gene['strand']}\n")

    print(f"[OK] Generated {len(genes[:num_genes])} genes -> {output_file}")


def generate_bed_repeats(genome_len, output_file, num_repeats=80):
    """Generate a BED file with repetitive elements (transposons, etc)."""
    random.seed(123)
    repeats = []

    pos = 0
    repeat_types = ['Tn10', 'IS1', 'P-element', 'Alu', 'LINE', 'SINE']

    while pos < genome_len - 500:
        # Repeat length: 200-1500 bp
        length = random.randint(200, 1500)
        end = min(pos + length, genome_len)

        # Repeat type
        repeat_type = random.choice(repeat_types)
        repeat_name = f"{repeat_type}_{len(repeats):03d}"

        repeats.append({
            'start': pos,
            'end': end,
            'name': repeat_name,
        })

        # Next repeat: 1000-5000 bp gap
        pos = end + random.randint(1000, 5000)

    # Write BED file
    with open(output_file, 'w') as f:
        f.write(f"# Generated feature track: {num_repeats} repeats/transposons\n")
        f.write("# Format: chrom  start  end  name\n")
        for repeat in repeats[:num_repeats]:
            f.write(f"chr1\t{repeat['start']}\t{repeat['end']}\t{repeat['name']}\n")

    print(f"[OK] Generated {len(repeats[:num_repeats])} repeats -> {output_file}")


def generate_bedgraph_gc(genome_len, output_file, window_size=5000):
    """Generate a bedGraph file with simulated GC content."""
    random.seed(99)

    bins = []
    pos = 0

    while pos < genome_len:
        end = min(pos + window_size, genome_len)

        # Simulate GC content: 40-65% range (realistic for bacteria/eukaryotes)
        gc_content = random.uniform(0.40, 0.65)

        bins.append({
            'start': pos,
            'end': end,
            'value': gc_content,
        })

        pos = end

    # Write bedGraph file
    with open(output_file, 'w') as f:
        f.write("# bedGraph: simulated GC content in 5kb windows\n")
        f.write("# Format: chrom  start  end  value\n")
        for bin_data in bins:
            f.write(f"chr1\t{bin_data['start']}\t{bin_data['end']}\t{bin_data['value']:.3f}\n")

    print(f"[OK] Generated {len(bins)} GC content bins -> {output_file}")


def generate_bedgraph_coverage(genome_len, output_file, window_size=10000):
    """Generate a bedGraph file with simulated sequencing coverage (normalized 0-1)."""
    random.seed(234)

    bins = []
    pos = 0

    # Simulate coverage with some variation (normalized 0..1)
    base_coverage = 0.7

    while pos < genome_len:
        end = min(pos + window_size, genome_len)

        # Coverage: varies around base_coverage with some peaks/valleys
        variation = random.gauss(0, 0.15)  # Gaussian noise
        coverage = max(0, min(1, base_coverage + variation))  # Clamp to 0..1

        bins.append({
            'start': pos,
            'end': end,
            'value': coverage,
        })

        pos = end

    # Write bedGraph file
    with open(output_file, 'w') as f:
        f.write("# bedGraph: simulated sequencing coverage in 10kb windows (normalized 0-1)\n")
        f.write("# Format: chrom  start  end  value\n")
        for bin_data in bins:
            f.write(f"chr1\t{bin_data['start']}\t{bin_data['end']}\t{bin_data['value']:.3f}\n")

    print(f"[OK] Generated {len(bins)} coverage bins -> {output_file}")


def main():
    # Default genome length: 3.2 Mb
    GENOME_LEN = 3200000

    output_dir = Path(__file__).parent

    print(f"Generating sample tracks for {GENOME_LEN:,} bp genome...\n")

    # Feature tracks (BED format)
    generate_bed_genes(GENOME_LEN, output_dir / "sample_genes.bed", num_genes=150)
    generate_bed_repeats(GENOME_LEN, output_dir / "sample_repeats.bed", num_repeats=80)

    # Continuous value tracks (bedGraph format)
    generate_bedgraph_gc(GENOME_LEN, output_dir / "sample_gc_content.bedgraph", window_size=5000)
    generate_bedgraph_coverage(GENOME_LEN, output_dir / "sample_coverage.bedgraph", window_size=10000)

    print("\n[DONE] All sample tracks generated!")
    print("\nImport these files in Gyre:")
    print("  1. Feature tracks: Use 'Add Feature Track' button")
    print("  2. Continuous tracks: Use 'Add bedGraph' button")


if __name__ == '__main__':
    main()
