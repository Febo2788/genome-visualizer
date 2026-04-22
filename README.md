# Gyre — Genome Viewer

A beautiful, interactive desktop application for genomic data visualization with BLAST comparison support. No terminal, no installation headaches — just download and run.

**[📥 Download for Windows](https://github.com/Febo2788/genome-visualizer/releases)** • [📥 Download for Mac](#) (coming soon)

---

## What is Gyre?

Gyre visualizes genomic sequences in beautiful **circular**, **linear**, and **synteny** (pairwise comparison) views. Upload GenBank files, compare genomes with BLAST, and export publication-ready diagrams.

### Screenshots & Demo

**[Screenshot 1: Circular genome view]**
*Insert screenshot of circular view with annotation tracks*

**[Screenshot 2: Synteny comparison]**
*Insert GIF of BLAST comparison showing matching regions*

**[Screenshot 3: Linear view with features]**
*Insert screenshot of linear genome view*

---

## Installation

### Windows

1. **Download** `Gyre Setup 1.0.0.exe` from [Releases](https://github.com/Febo2788/genome-visualizer/releases)
2. **Run** the installer
3. **Click** "Install" and wait (includes BLAST+ automatically)
4. **Done!** Desktop shortcut appears automatically

### Mac

Coming soon — currently Windows-only.

---

## Quick Start

1. **Open Gyre** from your Start Menu or desktop shortcut
2. Click **"Open GenBank..."** and select a `.gb` file
3. Your genome appears instantly as a circular diagram!

### Comparing Genomes (BLAST)

1. Click **"Compare genomes..."**
2. Select a reference genome and one or more query genomes
3. Click **"Run BLAST"**
4. Watch comparison rings appear automatically

**That's it!** Everything runs locally on your computer — no internet needed.

---

## Features

- **Multiple Views**: Circular, linear, and synteny comparison modes
- **BLAST Integration**: Compare genomes in seconds (everything runs locally)
- **GenBank Support**: Load standard genomic annotation files
- **Track Display**: Visualize genes, repeats, variants, and coverage
- **Export**: Save diagrams as PNG, SVG, or PDF
- **100% Offline**: No internet required — all tools bundled in the app
- **Cross-platform**: Windows and Mac support

---

## Supported File Formats

| Format | Use Case |
|--------|----------|
| **GenBank (.gb, .gbk)** | Primary genome format with annotations |
| **BED** | Genomic regions (genes, repeats, variants) |
| **VCF** | Variant call data |
| **bedGraph** | Coverage and score tracks |

**Where to find genomes:** [NCBI GenBank](https://www.ncbi.nlm.nih.gov/nucleotide/)

---

## Usage Guide

### Loading a Genome

**[GIF: Click 'Open GenBank' → select file → genome appears]**

1. Click **"Open GenBank..."**
2. Select a `.gb` file
3. Genome displays in circular view with all annotations

### Switching Views

- **Circular**: Full overview of genome structure
- **Linear**: Zoomed, scrollable view (good for details)
- **Synteny**: Side-by-side comparison of two genomes

**[GIF: Toggle between view modes]**

### Running BLAST Comparison

**[GIF: Click 'Compare' → select genomes → show results]**

1. Click **"Compare genomes..."**
2. Select **reference genome** (the "target")
3. Select one or more **query genomes** (the ones to compare)
4. Click **"Run BLAST"**
5. Wait for results (5-30 minutes depending on genome size)
6. Colored rings appear showing matching regions

### Exporting

Click **"Export..."** to save your current view as:
- **PNG** (for presentations/papers)
- **SVG** (scalable, editable)
- **PDF** (high-quality print)

---

## Troubleshooting

### App won't start

- Make sure Windows Defender or antivirus isn't blocking it
- Try reinstalling: uninstall, restart computer, reinstall
- Check that you have at least 200MB free disk space

### BLAST takes a long time

This is normal! Large genomes (>5MB) can take 10-30 minutes. Don't close the app — you'll see progress in the terminal (click the app window).

### Comparison didn't find matches

- Make sure genomes are similar enough (different organisms may have low similarity)
- Check that files are valid GenBank format
- Try with smaller test genomes first

### Export button doesn't work

- Make sure you have write permissions to your Downloads folder
- Try saving to a different location

---

## For Developers

### Building from Source

**Prerequisites:** Node.js 16+, BLAST+ installed on system PATH

```bash
# Install dependencies
npm install

# Download React, Babel, and BLAST binaries (first time only)
npm run fetch-vendor
npm run fetch-blast

# Build HTML from JSX components
npm run build

# Run in development mode (opens window)
npm run electron

# Build Windows installer
npm run dist:win
```

### Project Structure

- **`*.jsx`** — React components (circular-genome, linear-genome, app, etc.)
- **`build.js`** — Concatenates JSX files into standalone HTML
- **`main.js`** — Electron entry point (starts server + opens window)
- **`server.js`** — Express backend (handles BLAST, file uploads)
- **`vendor/`** — Bundled React, Babel, fonts (offline support)
- **`blast-bin/`** — BLAST+ binaries for Windows and Mac

See `CLAUDE.md` for detailed architecture notes.

---

## License

[Add your license here]

---

Happy genomics! 🧬
