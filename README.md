Genomic Visualization Tool
A comprehensive Python-based tool for creating both linear and circular genomic visualizations from GenBank files. This tool provides a user-friendly GUI for generating publication-quality comparative genomic diagrams.
Features
General Features

Choose between linear and circular diagram visualization modes
Interactive GUI for easy file selection and configuration
Process multiple GenBank files for comparative analysis
Customizable track visualization with color selection
Export diagrams as high-quality PNG and PDF files

Linear Diagram Features

Create linear genomic track diagrams from multiple GenBank files
Reorder and customize display of genomic tracks
Identify and color gene groups across different genomes
Generate cross-links between genomes using BLAST comparison
Support for custom annotations and highlighting of genomic regions
Interactive track labeling system
Customizable gene coloring system with filtering

Circular Diagram Features

Create circular genome visualizations with multiple tracks
Show GC content and GC skew with customizable binning
Support for displaying CDS features with directional arrows
Import and display BED graph tracks
Add custom labels and annotations
Enhanced track configuration with flexible radius settings
Create separate legend files

Requirements
Software Requirements

Python 3.6 or higher
NCBI BLAST+ command-line tools
Tkinter (usually included with Python installations)

Python Package Dependencies

Core dependencies: Biopython, NumPy, Pandas, Matplotlib
Image processing: OpenCV (cv2), PIL/Pillow, PyMuPDF (fitz)
Circular diagram specific: pycirclize, pygenomeviz

Installation

Ensure you have Python 3.6+ installed
Install BLAST+ tools from NCBI: https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Web&PAGE_TYPE=BlastDocs&DOC_TYPE=Download
Clone or download this repository
Install Python dependencies:

bash# For the basic dependencies
pip install biopython numpy pandas matplotlib opencv-python pillow PyMuPDF

# For circular diagrams
pip install pycirclize pygenomeviz
Note: The circular diagram module includes a function to automatically install its required packages if needed.
Usage

Run the script:

bashpython a_little_experiment.py

Select your preferred diagram type (Linear or Circular) from the opening dialog.

Linear Diagram Workflow

Select GenBank files for analysis
Reorder the files and set display ranges if needed
Choose annotation categories to label
Customize gene colors and highlighting regions
The tool will perform BLAST analysis to identify cross-links between genomes
The final diagram will be generated as a PDF and automatically converted to PNG
Use the interactive labeling feature to add labels to the diagram

Circular Diagram Workflow

Select a reference genome in GenBank format
Select comparison genomes in GenBank format
Configure visualization parameters (Min Identity, Ticks Interval, etc.)
Customize track display using the "Configure All Tracks" option
Add custom labels or select features for labeling if desired
Generate and save the visualization

Example Output
The tool generates:

Linear comparison diagrams showing gene conservation across multiple genomes with cross-links
Circular diagrams showing comparisons, GC content, GC skew, and annotations
Separate legend files for reference

Troubleshooting

BLAST Errors: Ensure BLAST+ tools are properly installed and in your system PATH
Memory Issues: When processing very large genomes, increase available memory or reduce the complexity of the visualization
File Format Issues: Ensure your GenBank files are properly formatted
Track Visualization: If tracks appear incorrectly, use the track configuration options to adjust display parameters

Notes

For large genomes, the BLAST comparison process may take significant time
Customize binning size and step size based on your genome size for optimal GC content visualization
Use the "Configure All Tracks" option for detailed control over track appearance


This tool combines both linear and circular genomic visualization approaches in a single user-friendly package, allowing researchers to create publication-quality genomic visualizations with ease.
