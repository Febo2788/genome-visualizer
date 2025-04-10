# Genomic Visualization Tool Documentation

## Overview

This tool provides interactive visualization of genomic data in both linear and circular formats. It allows researchers to compare multiple genomes, visualize GC content and skew, highlight coding sequences, and add custom annotations.

## Features

- **Dual Visualization Modes**: Choose between linear and circular visualization depending on your analysis needs
- **Multi-Genome Comparison**: Compare multiple GenBank files with customizable tracks and colors
- **GC Content and Skew Analysis**: Visualize GC content and GC skew with adjustable window sizes
- **CDS Visualization**: Display coding sequences with directional arrows
- **Custom Annotations**: Add your own labels and annotations at specific positions
- **BLAST-based Alignment**: View sequence similarities between genomes with adjustable identity thresholds
- **Interactive Track Configuration**: Customize track order, colors, visibility, and thickness
- **Export Options**: Save high-quality images in various formats (PNG, PDF)

## Installation

### Dependencies

The tool requires the following Python packages:
```
biopython
numpy
matplotlib
pandas
tkinter
PyMuPDF (fitz)
opencv-python (cv2)
pycirclize (for circular visualization)
pygenomeviz (for circular visualization)
```

Install dependencies using pip:
```bash
pip install biopython numpy matplotlib pandas fitz opencv-python pycirclize pygenomeviz
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/username/genomic-visualization-tool.git
cd genomic-visualization-tool
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the tool:
```bash
python a_little_experiment.py
```

## Usage

### Starting the Application

Run the script to launch the application:
```bash
python a_little_experiment.py
```

At startup, you'll be prompted to choose between Linear and Circular diagram modes.

### Linear Visualization Mode

The linear visualization mode compares multiple GenBank files arranged in tracks from top to bottom.

#### Basic Workflow:

1. **Select GenBank Files**: Click "Select GenBank Files" to choose the files you want to visualize.
2. **Reorder and Set Display Ranges**: Rearrange the order of files and set specific regions to display.
3. **Choose Label Categories**: Select which feature annotations to include in the visualization.
4. **Configure Gene Colors**: Customize the colors of gene features based on their identifiers.
5. **Add Custom Annotations**: Optionally add position-specific annotations.
6. **Generate Visualization**: Create the linear diagram and export it.

#### Track Reordering and Configuration

- Use the "Move Up" and "Move Down" buttons to change the order of tracks
- Set specific start and end positions for each track to focus on regions of interest
- Use the "Full Track" checkbox to display the entire sequence

#### Gene Color Configuration

- Search and filter genes by name, record, or product
- Apply colors individually or use the randomization features
- Lock specific genes to prevent color changes during batch operations

#### Custom Annotation

- Add symbols at specific positions to highlight features of interest
- Choose from various arrow and symbol types
- Apply annotations to specific tracks

### Circular Visualization Mode

The circular visualization mode displays genomes in a circular format with concentric rings representing different features and comparisons.

#### Basic Workflow:

1. **Select Reference Genome**: Choose a GenBank file as the reference genome.
2. **Select Comparison Genomes**: Add one or more GenBank files to compare against the reference.
3. **Adjust Settings**: Configure parameters like minimum identity percentage, tick intervals, and image DPI.
4. **Configure Tracks**: Customize track appearance, order, and visibility.
5. **Add Labels**: Optionally add custom labels or select features for labeling.
6. **Generate Visualization**: Create the circular diagram and export it.

#### Track Configuration

- Use the "Configure All Tracks" button to open the track manager
- Adjust track thickness, inner radius, and colors
- Toggle track visibility
- Link CDS forward and reverse tracks to move them together
- Import BED files for custom segment visualization

#### GC Content Settings

- **Binning Size**: Set the window size for GC content and skew calculations
- **Step Size**: Control how far to move the analysis window for each calculation

#### CDS Display Options

- Show or hide reference coding sequences
- Choose to display only labeled CDS features
- Toggle between arrow shape or rectangular representation

#### Custom Labels

- Use the "Manage Custom Labels" button to add, edit, or delete labels
- Import labels from CSV or Excel files
- Select specific features for labeling based on keywords or searches

## File Format Requirements

### GenBank Files

The tool accepts standard GenBank files (.gb, .gbk, .gbff) with proper annotation. For optimal results, ensure your GenBank files include:
- Properly annotated genes, CDS, and tRNA features
- Product information for features when available
- Well-defined sequence data

### Custom Label Files

When importing custom labels, the CSV or Excel file should contain at least these columns:
- `position`: The base pair position for the label (numeric)
- `label`: The text of the label
- `hexcode_color` (optional): Hex color code for the label text (e.g., "#FF0000")

## Advanced Features

### BLAST-based Cross-linking

The linear visualization mode uses BLASTN to identify sequence similarities between adjacent tracks. You can adjust:
- Minimum percent identity threshold (default: 70%)
- Color scale bounds for identity representation

### Custom Annotation Editor

Create custom annotations with various symbols:
- Choose from multiple arrow types and directional indicators
- Position annotations at exact base pair locations
- Apply annotations to specific tracks

### Feature Selection for Labeling

The feature selection window allows you to:
- Search for features by keyword
- Filter by functional categories
- Preview and select specific features for labeling
- Navigate through results with pagination controls

## Exporting and Saving

### Linear Diagram

- The linear diagram is saved as a PDF and automatically converted to PNG
- A labeled PNG is created with track labels added to the diagram
- A separate legend is generated showing gene colors and labels

### Circular Diagram

- The visualization can be saved as PNG or PDF
- DPI can be adjusted for higher resolution output
- A separate legend is automatically generated and saved

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   - Error: "ModuleNotFoundError"
   - Solution: Install the required package using pip

2. **BLAST Not Found**
   - Error: "BLASTN failed" or "Command 'blastn' not found"
   - Solution: Install NCBI BLAST+ tools and ensure they're in your PATH

3. **Memory Issues with Large Genomes**
   - Error: Memory error or application crash
   - Solution: Reduce the number of comparison genomes or focus on smaller regions

4. **Display Issues**
   - Problem: Text or features appear too small or crowded
   - Solution: Adjust font size, track thickness, or export at higher DPI

5. **Custom Label Issues**
   - Problem: Labels not appearing in the right position
   - Solution: Ensure positions are within the sequence range and label text is not empty

## Citation

If you use this tool in your research, please cite:

```
Borrego, F. (2024). Genomic Visualization Tool: A software for interactive visualization of genomic data in linear and circular formats. GitHub. https://github.com/felixborrego/genomic-visualization-tool
```

## License

This project is licensed under MIT License - see the LICENSE file for details.

## Contact

For questions or support, please contact felix.borrego02@gmail.com
I'll try my best to get back to you.
