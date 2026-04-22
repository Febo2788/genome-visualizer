# Gyre — Genome Viewer

A beautiful, interactive visualization tool for genomic data with BLAST comparison support.

---

## Quick Start (3 Easy Steps)

### Step 1: Install BLAST+ (One-time only)

BLAST is the tool that compares genomes. Install it once:

**Windows:**
```
choco install ncbi-blast
```
(If you don't have `choco`, use Windows Package Manager instead: `winget install ncbi-blast`)

**Mac:**
```
brew install blast
```

**Linux:**
```
sudo apt-get install ncbi-blast+
```

---

### Step 2: Start the Backend Server

1. **Open a terminal** in this folder (`genomic visualizer v2`)
   - Windows: Right-click → "Open in Terminal"
   - Mac: Open Terminal, drag folder in
   - Linux: Right-click → "Open Terminal Here"

2. **Run these commands** (first time only):
   ```
   npm install --save-dev express multer
   ```

3. **Start the server** (every time you want to use the app):
   ```
   npm start
   ```

You should see:
```
🧬 Gyre BLAST backend running on http://localhost:3000
```

**Keep this terminal window open** while using the app.

---

### Step 3: Open the App in Your Browser

1. Open your web browser (Chrome, Firefox, Safari, Edge)

2. In the address bar, type:
   ```
   http://localhost:3000/Gyre%20-%20Genome%20Viewer.html
   ```

3. Hit Enter

**That's it!** The app is now running.

---

## Using the App

### Load a Genome

1. Click **"Open GenBank..."** in the toolbar
2. Select a `.gb` file (GenBank format)
3. Your genome appears as a circular diagram

### Compare Genomes (BLAST)

1. Click **"Compare genomes..."**
2. Follow the setup instructions (first time only)
3. Click **"Next: Upload Genomes"**
4. Select a **reference genome** (.gb file)
5. Select one or more **query genomes** (.gb files)
6. Click **"Run BLAST"**
7. Wait a few minutes (BLAST is running on your computer)
8. Comparison rings appear automatically!

### Reset Workspace

Click **"New"** to clear everything and start fresh.

---

## Troubleshooting

### "Failed to fetch" error when running BLAST

**Problem:** You opened the HTML by double-clicking it (shows `file://` in address bar)

**Solution:** Use the proper web address instead:
```
http://localhost:3000/Gyre%20-%20Genome%20Viewer.html
```

### "BLAST backend running" but then app doesn't work

**Problem:** The app can't connect to the server

**Check:**
1. Is the terminal still showing the "BLAST backend running" message? (Should still say that)
2. Is the address bar showing `http://localhost:3000/...`? (Not `file://`)
3. Try refreshing the page (Ctrl+R or Cmd+R)

### "Command 'blastn' not found"

**Problem:** BLAST+ didn't install properly

**Solution:** Re-run the install command:
```
Windows: choco install ncbi-blast
Mac: brew install blast
Linux: sudo apt-get install ncbi-blast+
```

### BLAST takes forever

**This is normal!** Large genomes take 5-30 minutes. Don't close the terminal or browser.

---

## File Formats

**GenBank (.gb, .gbk):** Standard genomic format from NCBI. Download from:
- https://www.ncbi.nlm.nih.gov/nucleotide/
- Select your organism → "Send to" → Format: GenBank

---

## What Each Button Does

| Button | What it does |
|--------|-------------|
| **New** | Clear everything, start fresh |
| **Open GenBank...** | Load a genome for visualization |
| **Compare genomes...** | Run BLAST to compare multiple genomes |
| **Circular / Linear / Synteny** | Switch between visualization types |
| **Export...** | Save your diagram as PNG/SVG/PDF |

---

## Need Help?

- **BLAST won't run:** Make sure `npm start` is showing "BLAST backend running"
- **App won't load:** Check the address bar shows `http://localhost:3000/...`
- **Questions:** Check the info icons (ⓘ) in the app for details

---

Happy genomics! 🧬
