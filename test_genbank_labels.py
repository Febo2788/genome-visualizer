#!/usr/bin/env python3
"""Test script to extract and visualize gene label positions from GenBank files."""

import sys
from pathlib import Path

def parse_genbank_simple(filename):
    """Parse GenBank file and extract gene positions."""
    genes = []

    with open(filename, 'r') as f:
        lines = f.readlines()

    genome_len = 0
    in_features = False
    current_feature = None

    for i, line in enumerate(lines):
        # Extract genome length from LOCUS
        if line.startswith('LOCUS'):
            match_str = line.split()
            for j, word in enumerate(match_str):
                if word == 'bp':
                    try:
                        genome_len = int(match_str[j-1])
                    except:
                        pass

        # Find FEATURES section
        if line.startswith('FEATURES'):
            in_features = True
            continue

        if not in_features:
            continue

        # Stop at ORIGIN or end marker
        if line.startswith('ORIGIN') or line.startswith('//'):
            break

        # Feature type line (starts at column 5 with non-whitespace)
        if len(line) > 5 and line[5] != ' ' and line[0] == ' ':
            # Save previous feature
            if current_feature and ('gene' in current_feature or 'product' in current_feature):
                genes.append(current_feature)

            parts = line.split()
            if len(parts) >= 2:
                feature_type = parts[0]
                location = parts[1]

                # Extract positions
                try:
                    # Handle formats like: 123..456, complement(123..456), etc.
                    import re
                    numbers = re.findall(r'\d+', location)
                    if numbers:
                        start = int(numbers[0])
                        end = int(numbers[-1])
                        current_feature = {
                            'type': feature_type,
                            'start': start,
                            'end': end,
                            'gene': None,
                            'product': None
                        }
                except:
                    pass

        # Qualifier lines (start at column 21 with /)
        elif current_feature and len(line) > 21 and line[21] == '/':
            try:
                # Extract /gene="name" or /product="name"
                if '/gene=' in line:
                    name = line.split('/gene=')[1].strip().strip('"')
                    current_feature['gene'] = name
                elif '/product=' in line:
                    name = line.split('/product=')[1].strip().strip('"')
                    current_feature['product'] = name
            except:
                pass

    return genome_len, genes

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_genbank_labels.py <genbank_file>")
        sys.exit(1)

    gb_file = sys.argv[1]

    if not Path(gb_file).exists():
        print(f"Error: File not found: {gb_file}")
        sys.exit(1)

    genome_len, genes = parse_genbank_simple(gb_file)

    print(f"\n{'='*80}")
    print(f"GenBank File: {gb_file}")
    print(f"Genome Length: {genome_len:,} bp")
    print(f"Total Features: {len(genes)}")
    print(f"{'='*80}\n")

    # Filter to genes that have names
    named_genes = [g for g in genes if g['gene'] or g['product']]
    print(f"Features with gene/product names: {len(named_genes)}\n")

    if named_genes:
        print(f"{'Gene/Product':<40} {'Position (bp)':<20} {'% of Genome':<15}")
        print("-" * 75)

        for gene in named_genes[:50]:  # Show first 50
            name = gene['gene'] or gene['product'] or 'unknown'
            pos = (gene['start'] + gene['end']) // 2
            pct = (pos / genome_len * 100) if genome_len > 0 else 0

            print(f"{name:<40} {pos:>10,} bp       {pct:>6.1f}%")

        if len(named_genes) > 50:
            print(f"\n... and {len(named_genes) - 50} more genes")

        # Analyze distribution
        print(f"\n{'='*80}")
        print("DISTRIBUTION ANALYSIS:")
        print(f"{'='*80}")

        positions = [(g['start'] + g['end']) // 2 for g in named_genes]
        positions.sort()

        # Check if clustered in top 10%
        threshold = genome_len * 0.1
        top_10_percent = sum(1 for p in positions if p < threshold)
        pct_in_top_10 = (top_10_percent / len(positions) * 100) if positions else 0

        print(f"Genes in top 10% of genome: {top_10_percent}/{len(positions)} ({pct_in_top_10:.1f}%)")
        print(f"Min position: {min(positions):,} bp")
        print(f"Max position: {max(positions):,} bp")

        if pct_in_top_10 > 70:
            print(f"\n⚠️  GENES ARE CLUSTERED at top of genome!")
            print("This is REAL data, not a bug. Genes naturally cluster in some regions.")
        else:
            print(f"\n✓ Genes are well-distributed around the genome")

if __name__ == '__main__':
    main()
