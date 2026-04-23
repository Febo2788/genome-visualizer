# Gyre — Genome Viewer

So I found a few genome visualization programs online, right? But honestly, they all felt kinda outdated or clunky. One was missing features, another had this weird interface, and they were all a pain to set up. So I decided to just make one myself.

Here's what I built:

## How It Works

1. **Drop a GenBank file** → it shows up as a gorgeous circular diagram with all your genes and annotations
2. **Want to compare two genomes?** → Run BLAST and watch matching regions light up in real-time
3. **Got results?** → Export as PNG, SVG, or PDF for papers/presentations

That's it. No terminal nonsense, no weird dependencies. Just download, install, run.

---

## Demo

**[GIF: Opening a genome file and circular view appears]**

**[GIF: Running BLAST comparison and watching results appear]**

**[GIF: Switching between circular, linear, and synteny views]**

---

## Installation

### Windows

1. Download `Gyre Setup 1.0.0.exe` from [Releases](https://github.com/Febo2788/genome-visualizer/releases)
2. Run the installer and click "Install"
3. Done — app appears in your Start Menu

### Mac

Coming soon.

---

## What You Can Do

- **Circular view** — See your whole genome at a glance with all annotations
- **Linear view** — Zoom in on specific regions, scroll around
- **Synteny view** — Compare two genomes side-by-side with BLAST matches highlighted
- **Load multiple tracks** — Show genes, repeats, variants, coverage data all at once
- **Export** — Save diagrams as PNG, SVG, or PDF for your papers/presentations
- **BLAST comparison** — Compare genomes automatically (everything runs locally on your computer)

---

## What Files Do I Need?

Mostly **GenBank files** (.gb, .gbk). You can download them from [NCBI GenBank](https://www.ncbi.nlm.nih.gov/nucleotide/) — just search your organism, then "Send to" → GenBank format.

You can also load:
- **BED files** for genes/regions
- **VCF files** for variants
- **bedGraph files** for coverage

---

## Troubleshooting

### App won't start

Windows Defender might be blocking it. Try uninstalling and reinstalling, or adding it to your antivirus whitelist.

### BLAST is slow

Yeah, that's normal. Large genomes can take 10-30 minutes. Just let it run — you'll see progress in the terminal window.

### It says "BLAST not found"

Make sure BLAST+ is installed. The installer should handle it, but if something went wrong:

**Windows:** `winget install ncbi-blast`
**Mac:** `brew install blast`

### Comparison found nothing

Could be that the genomes are too different, or the files are corrupted. Try with two similar genomes first as a test.

---

## For Developers

Want to build from source or contribute?

```bash
npm install
npm run fetch-vendor
npm run fetch-blast
npm run build
npm run electron          # Test locally
npm run dist:win          # Build installer
```

See `CLAUDE.md` for architecture notes.

---

Happy genomics! 🧬
