#!/usr/bin/env python3
"""
Combined script for generating either a Linear or Circular diagram for genomics.
At startup, a small dialog window will ask:
    "Select Diagram Type:"
with two buttons:
    Linear Diagram    and    Circular Diagram

Depending on your selection, the respective original script code will run.
Everything else remains the same.
"""

# ======================== COMMON IMPORTS ========================
import os
import sys
import json
import random
import tempfile
import subprocess
import tkinter as tk
import tkinter.font as tkfont
import math
import traceback
import cv2
import numpy as np
from tkinter import filedialog, messagebox, colorchooser
import tkinter.ttk as ttk
from io import StringIO
import xml.etree.ElementTree as ET
import fitz  # PyMuPDF
from Bio import SeqIO
from Bio.Graphics import GenomeDiagram
from Bio.Graphics.GenomeDiagram import CrossLink
from Bio.Blast import NCBIXML
from reportlab.lib import colors
from Bio.SeqFeature import SeqFeature, FeatureLocation
from PIL import Image, ImageDraw, ImageFont, ImageTk

# For the circular part
import re
import matplotlib.pyplot as plt
import pandas as pd  
from pathlib import Path

# ======================== FUNCTIONS AND CLASSES FROM THE LINEAR DIAGRAM SCRIPT ========================

# --- Global for custom annotations ---
custom_annotations = []

DEBUG = True
def debug_print(*args, **kwargs):
    if DEBUG:
        print("[DEBUG]", *args, **kwargs)
        sys.stdout.flush()

# Persistence configuration
CONFIG_FILENAME = "last_order.json"

def load_last_order():
    debug_print("Attempting to load last order")
    try:
        with open(CONFIG_FILENAME, "r") as f:
            order = json.load(f)
        debug_print(f"Successfully loaded last order with {len(order.get('files', []))} files")
        return order
    except Exception as e:
        debug_print(f"Failed to load last order: {e}")
        return None

def save_last_order(order_data):
    debug_print("Attempting to save order data")
    try:
        with open(CONFIG_FILENAME, "w") as f:
            json.dump(order_data, f, indent=2)
        debug_print("Successfully saved order data")
    except Exception as e:
        debug_print(f"Error saving order: {e}")
        print("Error saving order:", e)

def reverse_complement(seq):
    complement = str.maketrans('ACGTacgt', 'TGCAtgca')
    return seq.translate(complement)[::-1]

def group_gene_features(records, label_keys):
    debug_print("Starting gene feature grouping")
    progress_box = tk.Toplevel()
    progress_box.title("Gene Grouping")
    progress_label = tk.Label(progress_box, text="Collecting features...")
    progress_label.pack(padx=10, pady=10)
    progress_bar = ttk.Progressbar(progress_box, orient="horizontal", length=300, mode="determinate")
    progress_bar.pack(padx=10, pady=10)
    progress_box.update()
    
    features = []
    progress_bar["maximum"] = len(records)
    for rec_idx, record in enumerate(records):
        progress_label.config(text=f"Processing record {rec_idx+1}/{len(records)}")
        progress_bar["value"] = rec_idx + 1
        progress_box.update()
        feat_idx = 0
        for feature in record.features:
            if feature.type.lower() not in ("gene", "cds", "trna"):
                feat_idx += 1
                continue
            gene_id = get_gene_id(feature, label_keys)
            if gene_id is None:
                feat_idx += 1
                continue
            try:
                seq = str(feature.extract(record.seq)).upper()
                features.append(((rec_idx, feat_idx), gene_id, seq))
            except Exception as e:
                debug_print(f"Warning: Could not extract sequence for feature in record {rec_idx}: {e}")
                print(f"Warning: Could not extract sequence for feature in record {rec_idx}: {e}")
            feat_idx += 1

    progress_label.config(text="Building feature groups...")
    progress_box.update()
    parent = {}
    for feat in features:
        fid = feat[0]
        parent[fid] = fid

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx = find(x)
        ry = find(y)
        if rx != ry:
            parent[ry] = rx

    features_by_record = {}
    for feat in features:
        fid, gene_id, seq = feat
        r_idx = fid[0]
        features_by_record.setdefault(r_idx, []).append(feat)

    num_comparisons = len(records) - 1
    progress_bar["maximum"] = num_comparisons
    for r in range(num_comparisons):
        progress_label.config(text=f"Comparing records {r+1} and {r+2}")
        progress_bar["value"] = r + 1
        progress_box.update()
        feats1 = features_by_record.get(r, [])
        feats2 = features_by_record.get(r+1, [])
        seq_to_feat2 = {}
        rc_seq_to_feat2 = {}
        for f2 in feats2:
            _, _, seq2 = f2
            seq_to_feat2.setdefault(seq2, []).append(f2)
            rc_seq_to_feat2.setdefault(reverse_complement(seq2), []).append(f2)
        for f1 in feats1:
            fid1, _, seq1 = f1
            for f2 in seq_to_feat2.get(seq1, []):
                fid2 = f2[0]
                union(fid1, fid2)
            for f2 in rc_seq_to_feat2.get(seq1, []):
                fid2 = f2[0]
                union(fid1, fid2)

    progress_label.config(text="Finalizing gene groups...")
    progress_box.update()
    groups = {}
    for feat in features:
        fid, gene_id, seq = feat
        rep = find(fid)
        groups.setdefault(rep, []).append(feat)

    group_mapping = {}
    for rep, feats in groups.items():
        sorted_feats = sorted(feats, key=lambda f: f[0])
        rep_gene_id = sorted_feats[0][1]
        for feat in feats:
            group_mapping[feat[0]] = rep_gene_id
    
    progress_box.destroy()
    debug_print(f"Completed gene feature grouping with {len(group_mapping)} mappings")
    return group_mapping

def get_gene_id(feature, label_keys=None):
    for key in ("gene", "locus_tag"):
        if key in feature.qualifiers:
            return feature.qualifiers[key][0]
    if feature.type.lower() == "cds":
        for alt in ("gene", "name", "product"):
            if alt in feature.qualifiers:
                return feature.qualifiers[alt][0]
        return "CDS"
    if feature.type.lower() == "trna":
        if "product" in feature.qualifiers:
            return feature.qualifiers["product"][0]
        return "tRNA"
    return None

def get_label_from_feature(feature, keys):
    for key in keys:
        if key == "CDS" and feature.type.lower() == "cds":
            for alt in ("gene", "name", "product"):
                if alt in feature.qualifiers:
                    return feature.qualifiers[alt][0]
            return "CDS"
        elif key.lower() == "trna" and feature.type.lower() == "trna":
            if "product" in feature.qualifiers:
                return feature.qualifiers["product"][0]
            return "tRNA"
        elif key in feature.qualifiers:
            return feature.qualifiers[key][0]
    return None

def select_genbank_files():
    debug_print("Opening file selection dialog")
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    file_paths = filedialog.askopenfilenames(
        title="Select GenBank Files",
        filetypes=[("GenBank files", "*.gb*"), ("All files", "*.*")]
    )
    file_list = list(file_paths)
    debug_print(f"Selected {len(file_list)} files")
    for path in file_list:
        debug_print(f"  - {path}")
    return file_list

def reorder_files(file_list, record_sizes=None):
    debug_print("Opening reorder files dialog")
    last_order = load_last_order()
    ranges = {}
    if last_order and isinstance(last_order, dict):
        ordered = [f for f in last_order.get("files", []) if f in file_list]
        unordered = [f for f in file_list if f not in ordered]
        file_list = ordered + unordered
        if "ranges" in last_order:
            ranges = last_order["ranges"]
    elif last_order:
        ordered = [f for f in last_order if f in file_list]
        unordered = [f for f in file_list if f not in ordered]
        file_list = ordered + unordered
    
    top = tk.Toplevel()
    top.title("Reorder GenBank Files and Set Display Ranges")
    top.attributes('-topmost', True)
    tk.Label(top, text="Reorder sequences and set display ranges:").pack(padx=5, pady=5)
    
    tracks_frame = tk.Frame(top)
    tracks_frame.pack(padx=5, pady=5, fill=tk.BOTH, expand=True)
    headers_frame = tk.Frame(tracks_frame)
    headers_frame.pack(fill=tk.X)
    tk.Label(headers_frame, text="Sequence File", width=60, anchor="w", font=("Arial", 10, "bold")).grid(row=0, column=0, padx=5, pady=5, sticky="w")
    tk.Label(headers_frame, text="Start", width=10, anchor="center", font=("Arial", 10, "bold")).grid(row=0, column=1, padx=5, pady=5, sticky="w")
    tk.Label(headers_frame, text="End", width=10, anchor="center", font=("Arial", 10, "bold")).grid(row=0, column=2, padx=5, pady=5, sticky="w")
    tk.Label(headers_frame, text="Full Track", width=10, anchor="center", font=("Arial", 10, "bold")).grid(row=0, column=3, padx=5, pady=5, sticky="w")
    
    canvas = tk.Canvas(tracks_frame)
    scrollbar = tk.Scrollbar(tracks_frame, orient="vertical", command=canvas.yview)
    scroll_frame = tk.Frame(canvas)
    canvas.configure(yscrollcommand=scrollbar.set)
    canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    canvas.create_window((0, 0), window=scroll_frame, anchor="nw")
    
    track_frames = []
    track_entries = {}
    track_fullrange_vars = {}
    selected_index = [-1]
    
    def on_frame_configure(event):
        canvas.configure(scrollregion=canvas.bbox("all"))
    scroll_frame.bind("<Configure>", on_frame_configure)
    
    def update_track_order():
        for i, frame in enumerate(track_frames):
            frame.grid(row=i, column=0, sticky="we", padx=5, pady=2)
        update_selection()
    
    def update_selection():
        for idx, frame in enumerate(track_frames):
            if idx == selected_index[0]:
                frame.config(bg="lightblue")
            else:
                frame.config(bg="SystemButtonFace")
    
    def move_selected_up():
        idx = selected_index[0]
        if idx > 0:
            track_frames[idx - 1], track_frames[idx] = track_frames[idx], track_frames[idx - 1]
            selected_index[0] = idx - 1
            update_track_order()
    
    def move_selected_down():
        idx = selected_index[0]
        if idx < len(track_frames) - 1 and idx != -1:
            track_frames[idx + 1], track_frames[idx] = track_frames[idx], track_frames[idx + 1]
            selected_index[0] = idx + 1
            update_track_order()
    
    def select_row(idx):
        selected_index[0] = idx
        update_selection()
    
    for i, file_path in enumerate(file_list):
        frame = tk.Frame(scroll_frame, relief=tk.RIDGE, borderwidth=1)
        frame.grid(row=i, column=0, sticky="we", padx=5, pady=2)
        track_frames.append(frame)
        frame.file_path = file_path
        frame.bind("<Button-1>", lambda event, idx=i: select_row(idx))
        
        filename = os.path.basename(file_path)
        display_name = "..." + filename[-37:] if len(filename) > 40 else filename
        label = tk.Label(frame, text=display_name, width=60, anchor="w")
        label.grid(row=0, column=0, sticky="w")
        label.bind("<Button-1>", lambda event, idx=i: select_row(idx))
        
        def show_tooltip(event, path=file_path, widget=label):
            tooltip = tk.Toplevel(widget)
            tooltip.wm_overrideredirect(True)
            tooltip.geometry(f"+{event.x_root+10}+{event.y_root+10}")
            tk.Label(tooltip, text=path, background="lightyellow", relief="solid", borderwidth=1).pack()
            widget.tooltip = tooltip
        def hide_tooltip(event, widget=label):
            if hasattr(widget, "tooltip"):
                widget.tooltip.destroy()
        label.bind("<Enter>", show_tooltip)
        label.bind("<Leave>", hide_tooltip)
        
        start_var = tk.StringVar(value="0")
        start_entry = tk.Entry(frame, textvariable=start_var, width=10)
        start_entry.grid(row=0, column=1, padx=5, sticky="w")
        
        end_var = tk.StringVar()
        if record_sizes and file_path in record_sizes:
            end_var.set(str(record_sizes[file_path]))
        else:
            end_var.set("10000")
        end_entry = tk.Entry(frame, textvariable=end_var, width=10)
        end_entry.grid(row=0, column=2, padx=5, sticky="w")
        
        full_var = tk.IntVar(value=1)
        full_check = tk.Checkbutton(frame, variable=full_var)
        full_check.grid(row=0, column=3, padx=5, sticky="w")
        
        if file_path in ranges:
            start, end, is_full = ranges[file_path]
            start_var.set(str(start))
            end_var.set(str(end))
            full_var.set(1 if is_full else 0)
        
        track_entries[file_path] = (start_entry, end_entry)
        track_fullrange_vars[file_path] = full_var
        
        def toggle_full_range(file_path=file_path):
            is_full = track_fullrange_vars[file_path].get() == 1
            start_entry, end_entry = track_entries[file_path]
            if is_full:
                start_entry.config(state="disabled")
                end_entry.config(state="disabled")
                if record_sizes and file_path in record_sizes:
                    end_entry.delete(0, tk.END)
                    end_entry.insert(0, str(record_sizes[file_path]))
            else:
                start_entry.config(state="normal")
                end_entry.config(state="normal")
        full_var.trace_add("write", lambda *args, fp=file_path: toggle_full_range(fp))
        if full_var.get() == 1:
            start_entry.config(state="disabled")
            end_entry.config(state="disabled")
    
    order_btn_frame = tk.Frame(top)
    order_btn_frame.pack(pady=5)
    move_up_btn = tk.Button(order_btn_frame, text="Move Up", command=move_selected_up)
    move_up_btn.pack(side=tk.LEFT, padx=5)
    move_down_btn = tk.Button(order_btn_frame, text="Move Down", command=move_selected_down)
    move_down_btn.pack(side=tk.LEFT, padx=5)
    
    new_order = []
    new_ranges = {}
    def on_ok():
        nonlocal new_order, new_ranges
        new_order = [frame.file_path for frame in track_frames]
        for file_path in new_order:
            start_entry, end_entry = track_entries[file_path]
            is_full = track_fullrange_vars[file_path].get() == 1
            try:
                start = int(start_entry.get())
                end = int(end_entry.get())
                if start < 0 or (not is_full and start >= end):
                    messagebox.showerror("Invalid Range", 
                                          f"File {os.path.basename(file_path)}: Please enter a valid range with start < end.")
                    return
                new_ranges[file_path] = (start, end, is_full)
            except ValueError:
                messagebox.showerror("Invalid Input", 
                                      f"File {os.path.basename(file_path)}: Start and End positions must be integers.")
                return
        top.destroy()
    btn_frame = tk.Frame(top)
    btn_frame.pack(pady=5)
    ok_btn = tk.Button(btn_frame, text="OK", command=on_ok)
    ok_btn.pack(side=tk.LEFT, padx=5)
    cancel_btn = tk.Button(btn_frame, text="Cancel", command=top.destroy)
    cancel_btn.pack(side=tk.LEFT, padx=5)
    top.update()
    canvas.config(width=headers_frame.winfo_width(), height=min(400, scroll_frame.winfo_height()+30))
    debug_print("Waiting for reorder dialog...")
    top.wait_window()
    debug_print("Reorder dialog closed")
    if new_order:
        debug_print(f"Got new order with {len(new_order)} files")
        config_data = {
            "files": new_order,
            "ranges": new_ranges
        }
        last_order = load_last_order() or {}
        if "gene_colors" in last_order:
            config_data["gene_colors"] = last_order["gene_colors"]
        save_last_order(config_data)
    else:
        debug_print("No new order received")
        
    return new_order, new_ranges

def choose_label_categories(record_names=None, record_bounds=None):
    debug_print("Opening label categories dialog")
    top = tk.Toplevel()
    top.title("Select Label Categories")
    top.attributes('-topmost', True)
    categories = ["gene", "locus_tag", "CDS", "name", "product", "old_locus_tag", "tRNA"]
    vars = {}
    row = 0
    tk.Label(top, text="Choose annotation categories for labeling:", font=("Arial", 10, "bold")).grid(row=row, column=0, sticky="w", padx=5, pady=5)
    row += 1
    for cat in categories:
        var = tk.IntVar(value=1)
        chk = tk.Checkbutton(top, text=cat, variable=var)
        chk.grid(row=row, column=0, sticky="w", padx=5, pady=2)
        vars[cat] = var
        row += 1
    if record_names and record_bounds:
        def open_custom_annotation():
            show_custom_annotation_menu(record_names, record_bounds)
        add_btn = tk.Button(top, text="Add Custom Annotation", command=open_custom_annotation)
        add_btn.grid(row=row, column=0, padx=5, pady=5)
        row += 1
    def on_ok():
        top.destroy()
    ok_btn = tk.Button(top, text="OK", command=on_ok)
    ok_btn.grid(row=row, column=0, pady=10)
    debug_print("Waiting for label categories dialog...")
    top.wait_window()
    debug_print("Label categories dialog closed")
    selected_categories = [cat for cat in categories if vars[cat].get() == 1]
    debug_print(f"Selected {len(selected_categories)} categories: {selected_categories}")
    return selected_categories

def show_custom_annotation_menu(record_names, record_bounds):
    debug_print("Opening custom annotation editor")
    win = tk.Toplevel()
    win.title("Custom Annotation Editor")
    win.attributes('-topmost', True)
    left_frame = tk.Frame(win)
    left_frame.grid(row=0, column=0, sticky="ns", padx=5, pady=5)
    right_frame = tk.Frame(win)
    right_frame.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
    win.grid_columnconfigure(1, weight=1)
    win.grid_rowconfigure(0, weight=1)
    tk.Label(left_frame, text="Select Symbol:").grid(row=0, column=0, sticky="w")
    symbols = ["→", "←", "↑", "↓", "↔", "↕", "↗", "↖", "↘", "↙",
               "➤", "➢", "►", "◄", "⇨", "⇦", "⇧", "⇩",
               "★", "☆", "➲", "➵", "➴", "➷"]
    symbol_var = tk.StringVar(value=symbols[0])
    symbol_menu = tk.OptionMenu(left_frame, symbol_var, *symbols)
    symbol_menu.grid(row=0, column=1, sticky="w")
    tk.Label(left_frame, text="Base Pair Position:").grid(row=1, column=0, sticky="w")
    bp_var = tk.StringVar()
    bp_entry = tk.Entry(left_frame, textvariable=bp_var)
    bp_entry.grid(row=1, column=1, sticky="w")
    tk.Label(left_frame, text="Select Tracks:").grid(row=2, column=0, sticky="nw")
    tracks_frame = tk.Frame(left_frame)
    tracks_frame.grid(row=2, column=1, sticky="w")
    track_vars = {}
    for i, rec in enumerate(record_names):
        var = tk.IntVar(value=0)
        chk = tk.Checkbutton(tracks_frame, text=rec, variable=var)
        chk.grid(row=i, column=0, sticky="w")
        track_vars[rec] = var
    add_btn = tk.Button(left_frame, text="Add Annotation", command=lambda: add_annotation())
    add_btn.grid(row=3, column=0, pady=5)
    del_btn = tk.Button(left_frame, text="Delete Selected", command=lambda: delete_selected())
    del_btn.grid(row=3, column=1, pady=5)
    tk.Label(left_frame, text="Current Custom Annotations:").grid(row=4, column=0, columnspan=2, sticky="w", pady=5)
    listbox = tk.Listbox(left_frame, width=40, height=10)
    listbox.grid(row=5, column=0, columnspan=2, pady=5)
    close_btn = tk.Button(left_frame, text="Close", command=win.destroy)
    close_btn.grid(row=6, column=0, columnspan=2, pady=5)
    canvas_width = 400
    canvas_height = 30 * len(record_names) + 20
    vis_canvas = tk.Canvas(right_frame, width=canvas_width, height=canvas_height, bg="white")
    vis_canvas.pack(fill="both", expand=True)
    def update_canvas():
        vis_canvas.delete("all")
        margin = 50
        track_height = 30
        for i, rec in enumerate(record_names):
            y = 10 + i * track_height
            start_bound = 0
            end_bound = record_bounds.get(rec, 1000)
            vis_canvas.create_line(margin, y, canvas_width - margin, y, fill="black", width=2)
            vis_canvas.create_text(margin - 10, y, text=str(start_bound), anchor="e", fill="black")
            vis_canvas.create_text(canvas_width - margin + 10, y, text=str(end_bound), anchor="w", fill="black")
            for ann in custom_annotations:
                if rec in ann["tracks"]:
                    bp = ann["bp"]
                    if bp < start_bound or bp > end_bound:
                        continue
                    x = margin + (bp - start_bound) / (end_bound - start_bound) * (canvas_width - 2*margin)
                    vis_canvas.create_text(x, y, text=ann["symbol"], font=("Arial", 14), fill="red")
    def refresh_listbox():
        listbox.delete(0, tk.END)
        for ann in custom_annotations:
            tracks_str = ", ".join(ann["tracks"])
            listbox.insert(tk.END, f'{ann["symbol"]} @ {ann["bp"]} (Tracks: {tracks_str})')
        update_canvas()
    def add_annotation():
        try:
            bp = int(bp_var.get())
        except ValueError:
            messagebox.showerror("Error", "Base pair position must be an integer.")
            return
        selected_tracks = [rec for rec, var in track_vars.items() if var.get() == 1]
        if not selected_tracks:
            messagebox.showerror("Error", "Please select at least one track.")
            return
        ann = {"symbol": symbol_var.get(), "bp": bp, "tracks": selected_tracks}
        custom_annotations.append(ann)
        refresh_listbox()
    def delete_selected():
        sel = listbox.curselection()
        if not sel:
            return
        index = sel[0]
        del custom_annotations[index]
        refresh_listbox()
    update_canvas()
    debug_print("Waiting for custom annotation window...")
    win.wait_window()
    debug_print("Custom annotation window closed")

def highlight_regions_config(record_names, record_bounds, records=None):
    debug_print("Opening highlight regions configuration")
    highlight_regions = {}
    for rec in record_names:
        highlight_regions[rec] = []
    win = tk.Toplevel()
    win.title("Highlight Region Configuration")
    win.attributes('-topmost', True)
    tk.Label(win, text="Select Record:").grid(row=0, column=0, sticky="w", padx=5, pady=5)
    record_var = tk.StringVar(value=record_names[0])
    record_menu = tk.OptionMenu(win, record_var, *record_names)
    record_menu.grid(row=0, column=1, sticky="w", padx=5, pady=5)
    region_frame = tk.Frame(win, bd=2, relief=tk.GROOVE)
    region_frame.grid(row=1, column=0, columnspan=4, padx=10, pady=10, sticky="we")
    tk.Label(region_frame, text="Start Position:").grid(row=0, column=0, sticky="w", padx=5, pady=5)
    start_var = tk.StringVar()
    start_entry = tk.Entry(region_frame, textvariable=start_var)
    start_entry.grid(row=0, column=1, padx=5, pady=5)
    tk.Label(region_frame, text="End Position:").grid(row=1, column=0, sticky="w", padx=5, pady=5)
    end_var = tk.StringVar()
    end_entry = tk.Entry(region_frame, textvariable=end_var)
    end_entry.grid(row=1, column=1, padx=5, pady=5)
    tk.Label(region_frame, text="Label (optional):").grid(row=2, column=0, sticky="w", padx=5, pady=5)
    label_var = tk.StringVar()
    label_entry = tk.Entry(region_frame, textvariable=label_var)
    label_entry.grid(row=2, column=1, padx=5, pady=5)
    color_var = tk.StringVar(value="#FFFF00")
    tk.Label(region_frame, text="Highlight Color:").grid(row=3, column=0, sticky="w", padx=5, pady=5)
    color_btn = tk.Button(region_frame, bg=color_var.get(), width=8)
    color_btn.grid(row=3, column=1, sticky="w", padx=5, pady=5)
    tk.Label(region_frame, text="Transparency:").grid(row=4, column=0, sticky="w", padx=5, pady=5)
    alpha_var = tk.DoubleVar(value=0.3)
    alpha_scale = tk.Scale(region_frame, from_=0.1, to=0.9, resolution=0.1, orient=tk.HORIZONTAL, variable=alpha_var)
    alpha_scale.grid(row=4, column=1, sticky="we", padx=5, pady=5)
    tk.Label(win, text="Current Highlight Regions:").grid(row=2, column=0, sticky="w", padx=5, pady=5)
    regions_listbox = tk.Listbox(win, width=60, height=10)
    regions_listbox.grid(row=3, column=0, columnspan=4, padx=10, pady=5, sticky="we")
    btn_frame = tk.Frame(win)
    btn_frame.grid(row=4, column=0, columnspan=4, padx=5, pady=5)
    def pick_color():
        color_tuple = colorchooser.askcolor(initialcolor=color_var.get())
        if color_tuple[1] is not None:
            color_var.set(color_tuple[1])
            color_btn.config(bg=color_tuple[1])
    color_btn.config(command=pick_color)
    def update_listbox():
        regions_listbox.delete(0, tk.END)
        rec = record_var.get()
        for start, end, color, alpha, label in highlight_regions.get(rec, []):
            regions_listbox.insert(tk.END, f"Start: {start}, End: {end}, Label: {label}, Color: {color}, Alpha: {alpha}")
    def add_region():
        try:
            start = int(start_var.get())
            end = int(end_var.get())
            rec = record_var.get()
            max_len = record_bounds[rec]
            if start < 0 or end > max_len or start >= end:
                messagebox.showerror("Invalid Range", f"Please enter a valid range (0-{max_len}) with start < end.")
                return
            label = label_var.get()
            color = color_var.get()
            alpha = alpha_var.get()
            highlight_regions[rec].append((start, end, color, alpha, label))
            update_listbox()
            start_var.set("")
            end_var.set("")
            label_var.set("")
        except ValueError:
            messagebox.showerror("Invalid Input", "Start and End positions must be integers.")
    def delete_selected():
        sel = regions_listbox.curselection()
        if not sel:
            return
        rec = record_var.get()
        idx = sel[0]
        if rec in highlight_regions and idx < len(highlight_regions[rec]):
            del highlight_regions[rec][idx]
            update_listbox()
    def show_sequence():
        try:
            rec = record_var.get()
            start = int(start_var.get()) if start_var.get() else None
            end = int(end_var.get()) if end_var.get() else None
            if start is None or end is None:
                messagebox.showerror("Missing Coordinates", "Please enter both Start and End positions.")
                return
            if records:
                for record in records:
                    if record.name == rec:
                        seq_window = tk.Toplevel(win)
                        seq_window.title(f"Sequence: {rec} [{start}-{end}]")
                        seq_text = tk.Text(seq_window, width=80, height=20, wrap=tk.WORD)
                        seq_text.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)
                        seq_str = str(record.seq[start:end])
                        seq_text.insert(tk.END, seq_str)
                        seq_text.config(state=tk.DISABLED)
                        def copy_seq():
                            win.clipboard_clear()
                            win.clipboard_append(seq_str)
                            messagebox.showinfo("Copied", "Sequence copied to clipboard")
                        copy_btn = tk.Button(seq_window, text="Copy to Clipboard", command=copy_seq)
                        copy_btn.pack(pady=5)
                        break
            else:
                messagebox.showinfo("Sequence Preview", f"Would show sequence for {rec} from {start} to {end}.")
        except ValueError:
            messagebox.showerror("Invalid Input", "Start and End positions must be integers.")
    add_btn = tk.Button(btn_frame, text="Add Region", command=add_region)
    add_btn.grid(row=0, column=0, padx=5, pady=5)
    del_btn = tk.Button(btn_frame, text="Delete Selected", command=delete_selected)
    del_btn.grid(row=0, column=1, padx=5, pady=5)
    seq_btn = tk.Button(btn_frame, text="Show Sequence", command=show_sequence)
    seq_btn.grid(row=0, column=2, padx=5, pady=5)
    close_btn = tk.Button(btn_frame, text="Done", command=win.destroy)
    close_btn.grid(row=0, column=3, padx=5, pady=5)
    record_var.trace_add('write', lambda *args: update_listbox())
    update_listbox()
    debug_print("Waiting for highlight regions configuration...")
    win.wait_window()
    debug_print("Highlight regions configuration closed")
    return highlight_regions

def choose_gene_colors(unique_gene_list, gene_label_flags):
    debug_print("Opening gene colors selection window")
    sorted_gene_list = sorted(unique_gene_list, key=lambda tup: (not gene_label_flags.get(tup[0], False), tup[0]))
    
    def create_highlighted_text(parent, full_text, search_term, width, anchor="w", case_sensitive=False):
        text_widget = tk.Text(parent, height=1, width=width, borderwidth=0, highlightthickness=0, wrap="none")
        default_font = tkfont.nametofont("TkDefaultFont")
        bold_font = (default_font.actual("family"), default_font.actual("size"), "bold")
        text_widget.configure(font=default_font)
        text_widget.tag_configure("bold", font=bold_font)
        pos = 0
        if not search_term:
            text_widget.insert("end", full_text)
        else:
            if not case_sensitive:
                lower_full = full_text.lower()
                lower_search = search_term.lower()
            else:
                lower_full = full_text
                lower_search = search_term
            while True:
                idx = lower_full.find(lower_search, pos)
                if idx == -1:
                    text_widget.insert("end", full_text[pos:])
                    break
                text_widget.insert("end", full_text[pos:idx])
                text_widget.insert("end", full_text[idx:idx+len(search_term)], "bold")
                pos = idx + len(search_term)
        text_widget.configure(state="disabled", bg=parent.cget("bg"))
        return text_widget

    top = tk.Toplevel()
    top.title("Select Colors for Gene Groups")
    top.attributes('-topmost', True)
    
    last_order = load_last_order()
    if last_order and "gene_colors" in last_order:
        gene_colors = last_order["gene_colors"]
    else:
        gene_colors = {group_id: "#0000FF" if gene_label_flags.get(group_id, False) else "#808080"
                       for group_id, _, _, _ in unique_gene_list}
    
    locked_groups = {}
    button_widgets = {}
    
    page_size = 10
    current_page = [0]
    
    search_frame = tk.Frame(top)
    search_frame.grid(row=0, column=0, padx=5, pady=5, sticky="w")
    tk.Label(search_frame, text="Gene Group:").pack(side=tk.LEFT)
    gene_search_var = tk.StringVar()
    gene_search_entry = tk.Entry(search_frame, textvariable=gene_search_var, width=15)
    gene_search_entry.pack(side=tk.LEFT, padx=(0,10))
    tk.Label(search_frame, text="Records:").pack(side=tk.LEFT)
    records_search_var = tk.StringVar()
    records_search_entry = tk.Entry(search_frame, textvariable=records_search_var, width=15)
    records_search_entry.pack(side=tk.LEFT, padx=(0,10))
    tk.Label(search_frame, text="Product:").pack(side=tk.LEFT)
    product_search_var = tk.StringVar()
    product_search_entry = tk.Entry(search_frame, textvariable=product_search_var, width=15)
    product_search_entry.pack(side=tk.LEFT, padx=(0,10))
    case_sensitive_var = tk.IntVar(value=0)
    cs_chk = tk.Checkbutton(search_frame, text="Case Sensitive", variable=case_sensitive_var)
    cs_chk.pack(side=tk.LEFT)
    
    table_frame = tk.Frame(top)
    table_frame.grid(row=1, column=0, padx=5, pady=5, sticky="w")
    headers = [
        ("Gene Group", 20),
        ("Records", 20),
        ("Product", 10),
        ("Color", 15),
        ("Info", 10),
        ("Lock", 8)
    ]
    for col, (header_text, col_width) in enumerate(headers):
        tk.Label(table_frame, text=header_text, font=("Arial", 10, "bold"),
                 width=col_width, anchor="w").grid(row=0, column=col, padx=5, pady=2)
    
    def get_filtered_list():
        cs = (case_sensitive_var.get() == 1)
        gene_query = gene_search_var.get().strip() if cs else gene_search_var.get().strip().lower()
        records_query = records_search_var.get().strip() if cs else records_search_var.get().strip().lower()
        product_query = product_search_var.get().strip() if cs else product_search_var.get().strip().lower()
        filtered = []
        for item in sorted_gene_list:
            group_id, rec_names, product, details = item
            if cs:
                gene_ok = (not gene_query) or (gene_query in group_id)
                rec_ok = (not records_query) or any(records_query in r for r in rec_names)
                product_ok = (not product_query) or (product_query in product)
            else:
                gene_ok = (not gene_query) or (gene_query in group_id.lower())
                rec_ok = (not records_query) or any(records_query in r.lower() for r in rec_names)
                product_ok = (not product_query) or (product_query in product.lower())
            if gene_ok and rec_ok and product_ok:
                filtered.append(item)
        return filtered

    def update_table():
        for widget in table_frame.grid_slaves():
            info = widget.grid_info()
            if int(info["row"]) > 0:
                widget.destroy()
        filtered_list = get_filtered_list()
        total_pages = (len(filtered_list) + page_size - 1) // page_size
        if total_pages == 0:
            total_pages = 1
        if current_page[0] >= total_pages:
            current_page[0] = 0
        start_index = current_page[0] * page_size
        end_index = min(start_index + page_size, len(filtered_list))
        for i, (group_id, rec_names, product, details) in enumerate(filtered_list[start_index:end_index], start=1):
            cs = (case_sensitive_var.get() == 1)
            hg = create_highlighted_text(table_frame, group_id, gene_search_var.get().strip(), width=20, case_sensitive=cs)
            hg.grid(row=i, column=0, padx=5, pady=2)
            rec_text = ", ".join(rec_names)
            hr = create_highlighted_text(table_frame, rec_text, records_search_var.get().strip(), width=20, case_sensitive=cs)
            hr.grid(row=i, column=1, padx=5, pady=2)
            hp = create_highlighted_text(table_frame, product, product_search_var.get().strip(), width=30, case_sensitive=cs)
            hp.grid(row=i, column=2, padx=5, pady=2)
            btn = tk.Button(table_frame, text="Select Color", bg=gene_colors[group_id], width=15,
                            command=lambda gid=group_id: pick_color(gid))
            btn.grid(row=i, column=3, padx=5, pady=2)
            button_widgets[group_id] = btn
            info_btn = tk.Button(table_frame, text="Info", width=10,
                                 command=lambda details=details: messagebox.showinfo("Group Info", details))
            info_btn.grid(row=i, column=4, padx=5, pady=2)
            if group_id not in locked_groups:
                locked_groups[group_id] = tk.IntVar(value=0)
            lock_chk = tk.Checkbutton(table_frame, text="Lock", variable=locked_groups[group_id])
            lock_chk.grid(row=i, column=5, padx=5, pady=2)
        page_label.config(text=f"Page {current_page[0]+1} of {total_pages}")
        prev_btn.config(state="disabled" if current_page[0] == 0 else "normal")
        next_btn.config(state="disabled" if current_page[0] >= total_pages - 1 else "normal")
    
    def pick_color(gid):
        color_tuple = colorchooser.askcolor(initialcolor=gene_colors[gid])
        if color_tuple[1] is not None:
            gene_colors[gid] = color_tuple[1]
            if gid in button_widgets:
                button_widgets[gid].config(bg=gene_colors[gid])
            update_table()
    
    nav_frame = tk.Frame(top)
    nav_frame.grid(row=2, column=0, padx=5, pady=5)
    prev_btn = tk.Button(nav_frame, text="<< Previous", command=lambda: change_page(-1))
    prev_btn.grid(row=0, column=0, padx=5)
    page_label = tk.Label(nav_frame, text="")
    page_label.grid(row=0, column=1, padx=5)
    next_btn = tk.Button(nav_frame, text="Next >>", command=lambda: change_page(1))
    next_btn.grid(row=0, column=2, padx=5)
    rand_btn = tk.Button(nav_frame, text="Randomize Page", command=lambda: randomize_current_page())
    rand_btn.grid(row=0, column=3, padx=5)
    all_rand_btn = tk.Button(nav_frame, text="Randomize All", command=lambda: randomize_all())
    all_rand_btn.grid(row=0, column=4, padx=5)
    lock_filtered_btn = tk.Button(nav_frame, text="Lock Filtered", command=lambda: lock_filtered())
    lock_filtered_btn.grid(row=0, column=5, padx=5)
    unlock_filtered_btn = tk.Button(nav_frame, text="Unlock Filtered", command=lambda: unlock_filtered())
    unlock_filtered_btn.grid(row=0, column=6, padx=5)
    make_gray_btn = tk.Button(nav_frame, text="Make All Gray", command=lambda: make_all_gray())
    make_gray_btn.grid(row=0, column=7, padx=5)
    
    goto_label = tk.Label(nav_frame, text="Go to page:")
    goto_label.grid(row=0, column=8, padx=5)
    page_entry = tk.Entry(nav_frame, width=3)
    page_entry.grid(row=0, column=9, padx=5)
    goto_btn = tk.Button(nav_frame, text="Go", command=lambda: goto_page())
    goto_btn.grid(row=0, column=10, padx=5)
    
    hex_filter_var = tk.StringVar()
    tk.Label(nav_frame, text="Hex Filter:").grid(row=1, column=0, padx=5, pady=5)
    hex_filter_entry = tk.Entry(nav_frame, textvariable=hex_filter_var, width=10)
    hex_filter_entry.grid(row=1, column=1, padx=5, pady=5)
    def apply_hex_filter():
        hex_code = hex_filter_var.get().strip()
        if not hex_code.startswith("#") or len(hex_code) != 7:
            messagebox.showwarning("Invalid Hex Code", "Please enter a valid hex code in the format #RRGGBB.")
            return
        for group_id, _, _, _ in get_filtered_list():
            if locked_groups.get(group_id) and locked_groups[group_id].get() == 1:
                continue
            gene_colors[group_id] = hex_code
        update_table()
    hex_filter_btn = tk.Button(nav_frame, text="Apply Hex Filter", command=apply_hex_filter)
    hex_filter_btn.grid(row=1, column=2, padx=5, pady=5)
    
    def goto_page():
        try:
            page_val = int(page_entry.get()) - 1
        except ValueError:
            messagebox.showerror("Invalid page", "Please enter a valid integer for the page number.")
            return
        filtered_list = get_filtered_list()
        total_pages = (len(filtered_list) + page_size - 1) // page_size
        if total_pages == 0:
            total_pages = 1
        if page_val < 0 or page_val >= total_pages:
            messagebox.showerror("Invalid page", f"Page number must be between 1 and {total_pages}.")
            return
        current_page[0] = page_val
        update_table()
    
    def change_page(delta):
        current_page[0] += delta
        update_table()
    
    def randomize_current_page():
        filtered_list = get_filtered_list()
        start_index = current_page[0] * page_size
        end_index = min(start_index + page_size, len(filtered_list))
        for group_id, _, _, _ in filtered_list[start_index:end_index]:
            if locked_groups.get(group_id) and locked_groups[group_id].get() == 1:
                continue
            if gene_label_flags.get(group_id, False):
                rand_color = '#{:06X}'.format(random.randint(0, 0xFFFFFF))
                gene_colors[group_id] = rand_color
        update_table()
    
    def randomize_all():
        filtered_list = get_filtered_list()
        for group_id, _, _, _ in filtered_list:
            if locked_groups.get(group_id) and locked_groups[group_id].get() == 1:
                continue
            rand_color = '#{:06X}'.format(random.randint(0, 0xFFFFFF))
            gene_colors[group_id] = rand_color
        update_table()
    
    def lock_filtered():
        for group_id, _, _, _ in get_filtered_list():
            if group_id in locked_groups:
                locked_groups[group_id].set(1)
        update_table()
    
    def unlock_filtered():
        for group_id, _, _, _ in get_filtered_list():
            if group_id in locked_groups:
                locked_groups[group_id].set(0)
        update_table()
    
    def make_all_gray():
        for group_id in gene_colors:
            gene_colors[group_id] = "#808080"
        update_table()
    
    gene_search_var.trace_add('write', lambda *args: update_table())
    records_search_var.trace_add('write', lambda *args: update_table())
    product_search_var.trace_add('write', lambda *args: update_table())
    case_sensitive_var.trace_add('write', lambda *args: update_table())
    
    update_table()
    ok_btn = tk.Button(top, text="OK", command=top.destroy)
    ok_btn.grid(row=3, column=0, pady=10)
    debug_print("Waiting for gene colors selection window...")
    top.wait_window()
    debug_print("Gene colors selection window closed")
    debug_print(f"Selected colors for {len(gene_colors)} gene groups")
    config_data = load_last_order() or {}
    config_data["gene_colors"] = gene_colors
    save_last_order(config_data)
    return gene_colors

def compute_cross_links(records, perc_identity_threshold=70.0, alignment_length_threshold=50,
                        lower_bound=0.0, upper_bound=100.0):
    debug_print("Starting BLAST cross-links computation")
    cross_links = []
    if len(records) < 2:
        debug_print("Not enough records for BLAST cross-linking")
        return cross_links
    valid_records = []
    for idx, rec in enumerate(records):
        try:
            test_str = str(rec.seq[:1])
            valid_records.append((idx, rec))
        except Exception as e:
            debug_print(f"Warning: Record {rec.id} has undefined sequence and will be skipped for BLAST: {e}")
            print(f"Warning: Record {rec.id} has undefined sequence and will be skipped for BLAST: {e}")
    if len(valid_records) < 2:
        debug_print("Not enough valid records with defined sequences for BLAST comparison.")
        print("Not enough valid records with defined sequences for BLAST comparison.")
        return cross_links
    import tkinter.simpledialog as simpledialog
    root_temp = tk.Tk()
    root_temp.withdraw()
    root_temp.attributes('-topmost', True)
    debug_print("Opening BLAST threshold dialog")
    user_threshold = simpledialog.askfloat("Cross-Linking Threshold",
                                           "Enter minimum percent identity for cross linking",
                                           initialvalue=perc_identity_threshold)
    if user_threshold is not None:
        perc_identity_threshold = user_threshold
    user_lower_bound = simpledialog.askfloat("Color Scale Lower Bound",
                                             "What percent identity should white color represent in cross linking?",
                                             initialvalue=lower_bound)
    if user_lower_bound is not None:
        lower_bound = user_lower_bound
    root_temp.destroy()
    debug_print(f"User selected threshold: {perc_identity_threshold}, lower bound: {lower_bound}")
    valid_pairs = []
    for i in range(len(valid_records)-1):
        idx1, rec1 = valid_records[i]
        idx2, rec2 = valid_records[i+1]
        valid_pairs.append((i, idx1, rec1, idx2, rec2))
    total_pairs = len(valid_pairs)
    if total_pairs == 0:
        debug_print("No valid pairs for BLAST")
        return cross_links
    progress_box = tk.Toplevel()
    progress_box.title("BLAST Progress")
    progress_box.attributes('-topmost', True)
    progress_label = tk.Label(progress_box, text="Starting BLAST ...")
    progress_label.pack(padx=10, pady=10)
    progress_bar = ttk.Progressbar(progress_box, orient="horizontal", length=300, mode="determinate")
    progress_bar.pack(padx=10, pady=10)
    progress_bar["maximum"] = total_pairs
    for pair_count, (i, idx1, rec1, idx2, rec2) in enumerate(valid_pairs, 1):
        progress_label.config(text=f"BLASTing record {idx1+1} vs record {idx2+1} (Pair {pair_count}/{total_pairs})")
        progress_bar["value"] = pair_count
        progress_box.update()
        try:
            temp1 = tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".fasta")
            temp2 = tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".fasta")
            temp1_name = temp1.name
            temp2_name = temp2.name
            temp1.close()
            temp2.close()
            SeqIO.write(rec1, temp1_name, "fasta")
            SeqIO.write(rec2, temp2_name, "fasta")
        except Exception as e:
            debug_print(f"Error writing sequences to FASTA: {e}")
            print(f"Error writing sequences to FASTA: {e}")
            if 'temp1_name' in locals():
                try: os.unlink(temp1_name)
                except: pass
            if 'temp2_name' in locals():
                try: os.unlink(temp2_name)
                except: pass
            continue
        blast_cmd = [
            "blastn",
            "-query", temp1_name,
            "-subject", temp2_name,
            "-outfmt", "5",
            "-perc_identity", str(perc_identity_threshold)
        ]
        try:
            debug_print(f"Running BLAST: {' '.join(blast_cmd)}")
            result = subprocess.run(blast_cmd, capture_output=True, text=True, check=True)
            blast_xml = result.stdout
        except subprocess.CalledProcessError as e:
            debug_print(f"BLASTN failed for records {rec1.id} and {rec2.id}: {e}")
            print(f"BLASTN failed for records {rec1.id} and {rec2.id}: {e}")
            os.unlink(temp1_name)
            os.unlink(temp2_name)
            continue
        except Exception as e:
            debug_print(f"Unexpected error during BLAST: {e}")
            print(f"Unexpected error during BLAST: {e}")
            os.unlink(temp1_name)
            os.unlink(temp2_name)
            continue
        os.unlink(temp1_name)
        os.unlink(temp2_name)
        try:
            blast_io = StringIO(blast_xml)
            blast_records = list(NCBIXML.parse(blast_io))
            for blast_record in blast_records:
                for alignment in blast_record.alignments:
                    for hsp in alignment.hsps:
                        if hsp.align_length < alignment_length_threshold:
                            continue
                        score = (hsp.identities / hsp.align_length) * 100.0
                        if score < perc_identity_threshold:
                            continue
                        q_start = hsp.query_start - 1
                        q_end = hsp.query_end
                        s_start = hsp.sbjct_start - 1
                        s_end = hsp.sbjct_end
                        adj_score = max(lower_bound, min(score, upper_bound))
                        try:
                            if hsp.strand[0] == hsp.strand[1]:
                                cl_color = colors.linearlyInterpolatedColor(colors.white, colors.blue,
                                                                            lower_bound, upper_bound, adj_score)
                            else:
                                cl_color = colors.linearlyInterpolatedColor(colors.white, colors.red,
                                                                            lower_bound, upper_bound, adj_score)
                        except Exception:
                            cl_color = colors.HexColor("#0000FF")
                        cross_links.append({
                            "pair_index": idx1,
                            "q_start": q_start,
                            "q_end": q_end,
                            "s_start": s_start,
                            "s_end": s_end,
                            "color": cl_color
                        })
        except Exception as e:
            debug_print(f"Error parsing BLAST results: {e}")
            print(f"Error parsing BLAST results: {e}")
    progress_box.destroy()
    debug_print(f"BLAST completed, found {len(cross_links)} cross-links")
    return cross_links

def draw_diagram_final(records, label_keys, gene_colors, output_pdf, group_mapping, cross_links, 
                       repeat_regions_by_record=None, highlight_regions_by_record=None, track_ranges=None):
    debug_print(f"Drawing final diagram to {output_pdf}")
    diagram = GenomeDiagram.Diagram("Multi-GenBank Diagram")
    diagram_data = []
    n = len(records)
    for rec_idx, record in enumerate(records):
        track_number = 6 * (n - rec_idx) - 2
        start = 0
        end = len(record)
        if track_ranges and record.name in track_ranges:
            start, end = track_ranges[record.name]
        track = diagram.new_track(
            track_number,
            greytrack=False,
            name=record.name,
            scale_ticks=0,
            height=1.75,
            start=start,
            end=end
        )
        if highlight_regions_by_record and record.name in highlight_regions_by_record:
            highlight_set = track.new_set()
            for start, end, color_hex, alpha, label in highlight_regions_by_record[record.name]:
                r = int(color_hex[1:3], 16) / 255
                g = int(color_hex[3:5], 16) / 255
                b = int(color_hex[5:7], 16) / 255
                highlight_color = colors.Color(r, g, b, alpha)
                highlight_feature = SeqFeature(FeatureLocation(start, end), type="highlight")
                highlight_set.add_feature(
                    highlight_feature,
                    sigil="BOX",
                    color=highlight_color,
                    border=None,
                    label=bool(label),
                    name=label if label else "",
                    label_size=10,
                    label_angle=0
                )
        feature_set = track.new_set()
        feat_idx = 0
        for feature in record.features:
            if feature.type.lower() not in ("gene", "cds", "trna"):
                feat_idx += 1
                continue
            group_id = group_mapping.get((rec_idx, feat_idx), get_gene_id(feature, label_keys))
            feat_idx += 1
            if group_id is None:
                continue
            chosen_hex = gene_colors.get(group_id, "#0000FF")
            chosen_color = colors.HexColor(chosen_hex)
            lab = get_label_from_feature(feature, label_keys)
            sigil = "ARROW"
            if feature.type.lower() == "trna":
                sigil = "BOX"
                if not lab:
                    lab = feature.qualifiers.get("product", ["tRNA"])[0]
            feature_set.add_feature(
                feature,
                sigil=sigil,
                color=chosen_color,
                label=bool(lab),
                name=lab if lab else "",
                label_size=2,
                label_color=colors.HexColor('#222222'),
                border=None,
                arrowshaft_height=0.35,
                arrowhead_length=0.5
            )
            for ann in custom_annotations:
                if record.name in ann["tracks"]:
                    custom_feat = SeqFeature(FeatureLocation(ann["bp"], ann["bp"]+1), type="custom")
                    feature_set.add_feature(
                        custom_feat,
                        sigil="JAGGY",
                        color=colors.green,
                        label=True,
                        name=ann["symbol"],
                        label_size=2,
                        label_color=colors.HexColor('#222222'),
                        border=None,
                        label_position="top",
                        label_angle=0,
                        arrowshaft_height=0.2,
                        arrowhead_length=0.2
                    )
        if repeat_regions_by_record and record.name in repeat_regions_by_record:
            for (start, end, strand, rep_label) in repeat_regions_by_record[record.name]:
                rep_feature = SeqFeature(FeatureLocation(start, end), type="repeat", strand=strand)
                rep_sigil = "ARROW" if strand != 0 else "BOX"
                feature_set.add_feature(
                    rep_feature,
                    sigil=rep_sigil,
                    color=colors.red,
                    label=True,
                    name=rep_label,
                    label_size=2,
                    label_color=colors.HexColor('#222222'),
                    border=colors.black,
                    arrowshaft_height=0.3,
                    arrowhead_length=0.4
                )
        diagram_data.append({"record": record, "track": track})
    for cl in cross_links:
        i = cl["pair_index"]
        if i < len(diagram_data) - 1:
            track1 = diagram_data[i]["track"]
            track2 = diagram_data[i+1]["track"]
            cross_link = CrossLink(
                (track1, cl["q_start"], cl["q_end"]),
                (track2, cl["s_start"], cl["s_end"]),
                cl["color"],
                None
            )
            diagram.cross_track_links.append(cross_link)
    max_len = max(len(rec) for rec in records)
    overall_end = max_len
    scale_factor = 800.0 / overall_end
    width = overall_end * scale_factor
    height = n * 150
    diagram.draw(format="linear", pagesize=(width, height), fragments=1, start=0, end=overall_end, tracklines=0)
    diagram.write(output_pdf, "PDF")
    debug_print(f"Final diagram written to: {output_pdf}")
    print("Final diagram written to:", output_pdf)
    return output_pdf

def create_legend_image(legend_data, scale=2, margin=None, spacing=None, box_size=None,
                        cell_width=None, cell_height=None, font_size=10,
                        border_thickness=3, columns=8):
    if margin is None:
        margin = 10 * scale
    if spacing is None:
        spacing = 10 * scale
    if box_size is None:
        box_size = 40 * scale
    if cell_width is None:
        cell_width = box_size + 100
    if cell_height is None:
        cell_height = box_size + 40
    rows = math.ceil(len(legend_data) / columns)
    image_width = margin * 2 + columns * cell_width + (columns - 1) * spacing
    image_height = margin * 2 + rows * cell_height + (rows - 1) * spacing
    try:
        font = ImageFont.truetype("arial.ttf", font_size * scale)
    except IOError:
        font = ImageFont.load_default()
    image = Image.new("RGB", (image_width, image_height), "white")
    draw = ImageDraw.Draw(image)
    items = list(legend_data.items())
    for i, (color, product) in enumerate(items):
        col = i % columns
        row = i // columns
        cell_x = margin + col * cell_width + (col * spacing)
        cell_y = margin + row * cell_height + (row * spacing)
        box_x = cell_x + (cell_width - box_size) // 2
        box_y = cell_y
        for b in range(border_thickness):
            draw.rectangle(
                [box_x - b, box_y - b, box_x + box_size + b, box_y + box_size + b],
                outline="black"
            )
        draw.rectangle(
            [box_x, box_y, box_x + box_size, box_y + box_size],
            fill=color
        )
        text = product
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
        text_x = cell_x + (cell_width - text_w) // 2
        text_y = box_y + box_size + (cell_height - box_size - text_h) // 2
        draw.text((text_x, text_y), text, fill="black", font=font)
    return image

def preview_legend(legend_data):
    debug_print("Opening legend preview")
    initial_scale = 2
    initial_margin = 10 * initial_scale
    initial_spacing = 10 * initial_scale
    initial_box_size = 40 * initial_scale
    initial_cell_width = initial_box_size + 100
    initial_cell_height = initial_box_size + 40
    initial_font_size = 10
    initial_border_thickness = 3
    columns = 8
    preview_win = tk.Toplevel()
    preview_win.title("Legend Preview and Customization")
    preview_win.attributes('-topmost', True)
    controls_frame = tk.Frame(preview_win)
    controls_frame.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
    tk.Label(controls_frame, text="Font Size:").grid(row=0, column=0, sticky="w")
    font_size_var = tk.IntVar(value=initial_font_size)
    tk.Scale(controls_frame, from_=6, to=20, orient=tk.HORIZONTAL,
             variable=font_size_var).grid(row=0, column=1, sticky="we")
    tk.Label(controls_frame, text="Spacing (unscaled):").grid(row=1, column=0, sticky="w")
    spacing_var = tk.IntVar(value=initial_spacing // initial_scale)
    tk.Scale(controls_frame, from_=5, to=50, orient=tk.HORIZONTAL,
             variable=spacing_var).grid(row=1, column=1, sticky="we")
    tk.Label(controls_frame, text="Border Thickness:").grid(row=2, column=0, sticky="w")
    border_var = tk.IntVar(value=initial_border_thickness)
    tk.Scale(controls_frame, from_=1, to=10, orient=tk.HORIZONTAL,
             variable=border_var).grid(row=2, column=1, sticky="we")
    canvas = tk.Canvas(preview_win, bg="white")
    canvas.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=5, pady=5)
    canvas.image = None
    def update_preview():
        fs = font_size_var.get()
        sp = spacing_var.get() * initial_scale  
        bt = border_var.get()
        img = create_legend_image(
            legend_data,
            scale=initial_scale,
            margin=initial_margin,
            spacing=sp,
            box_size=initial_box_size,
            cell_width=initial_cell_width,
            cell_height=initial_cell_height,
            font_size=fs,
            border_thickness=bt,
            columns=columns
        )
        tk_img = ImageTk.PhotoImage(img)
        canvas.image = tk_img
        canvas.config(width=img.width, height=img.height)
        canvas.delete("all")
        canvas.create_image(0, 0, anchor="nw", image=tk_img)
    
    
    update_preview_button = tk.Button(controls_frame, text="Update Preview", command=update_preview)
    update_preview_button.grid(row=3, column=0, columnspan=2, pady=5)
    update_preview()
    def save_legend():
        file_path = filedialog.asksaveasfilename(
            defaultextension=".png", filetypes=[("PNG Image", "*.png")])
        if file_path:
            img = create_legend_image(
                legend_data,
                scale=5,
                margin=10*5,
                spacing=spacing_var.get() * 5,
                box_size=40*5,
                cell_width=(40*5)+100,
                cell_height=(40*5)+40,
                font_size=font_size_var.get(),
                border_thickness=border_var.get(),
                columns=columns
            )
            img.save(file_path)
            messagebox.showinfo("Saved", f"Legend saved to:\n{file_path}")
    save_button = tk.Button(preview_win, text="Save Legend", command=save_legend)
    save_button.pack(side=tk.BOTTOM, pady=5)
    debug_print("Waiting for legend preview window...")
    preview_win.mainloop()
    debug_print("Legend preview window closed")

import cv2
from PIL import ImageTk

def cv2_putText_with_font(cv_img, text, position, font_path="calibri.ttf", font_size=40, color=(0,0,0)):
    img_pil = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil)
    try:
        font = ImageFont.truetype(font_path, font_size)
    except IOError:
        font = ImageFont.load_default()
    draw.text(position, text, font=font, fill=color)
    cv_img[:] = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
    return cv_img

image_for_labeling = None
ordered_labels = []  # Filled with filenames (with full or relative paths)
current_label_index = 0

intimin_map = {
    "UTAK-1_cut.gb":         "ε-intimin",
    "UTME-12_cut.gb":        "β-intimin",
    "UTME-9_cut.gb":         "β-intimin",
    "UTME-14_cut.gb":        "β-intimin",
    "UTME-10_cut.gb":        "β-intimin",
    "UTAK-21_cut.gb":        "ε-intimin",
    "UTAK-16_NOT_RFS_cut.gb":"ε-intimin",
    "UTAK-7_NOT_RFS_cut.gb": "ε-intimin",
    "99E3116_cut.gb":        "ε-intimin",
    "UTAK-11_NOT_RFS_cut.gb":"ε-intimin",
    "UTAK-25_NOT_RFS_cut.gb":"ε-intimin",
    "UTAK-2_cut.gb":         "ε-intimin",
    "UTAK-4_cut.gb":         "ε-intimin",
    "2011C-4251_cut.gb":     "ξ-intimin",
    "SJ7_cut.gb":            "ε-intimin",
    "FWSEC0003_cut.gb":      "ξ-intimin",
    "2000-3039_cut.gb":      "ε-intimin",
}

def label_sequence(img, start_point):
    global current_label_index, ordered_labels
    start_x, start_y = start_point
    height, width = img.shape[:2]
    found_any = False
    y = start_y
    while y < height:
        if np.all(img[y, start_x] == 0):
            group_start_y = y
            while y < height and np.all(img[y, start_x] == 0):
                y += 1
            group_end_y = y - 1
            mid_y = (group_start_y + group_end_y) // 2
            text_position = (30, mid_y)
            if current_label_index < len(ordered_labels):
                text = ordered_labels[current_label_index]
                current_label_index += 1
            else:
                text = "Label"
            cv2_putText_with_font(img, text, text_position, font_path="calibri.ttf", font_size=40, color=(0,0,0))
            print(f"Label '{text}' placed at {text_position} (group from y={group_start_y} to y={group_end_y}).")
            found_any = True
        else:
            y += 1
    if not found_any:
        print("No contiguous block of pure black pixels found starting from that point.")

def mouse_callback(event, x, y, flags, param):
    global image_for_labeling
    if event == cv2.EVENT_LBUTTONDOWN:
        print(f"Clicked at ({x}, {y}). Scanning column for black pixel groups...")
        label_sequence(image_for_labeling, (x, y))
        cv2.imshow("Label Sequences", image_for_labeling)
        cv2.setMouseCallback("Label Sequences", lambda *args: None)
        print("Further clicks disabled. Press any key to close the window.")

def process_files(file_paths):
    debug_print("Processing GenBank files")
    records = []
    for idx, fp in enumerate(file_paths):
        try:
            debug_print(f"Reading record {idx+1}/{len(file_paths)}: {fp}")
            record = SeqIO.read(fp, "genbank")
            records.append(record)
        except Exception as e:
            debug_print(f"ERROR reading GenBank file {fp}: {e}")
            print(f"ERROR reading GenBank file {fp}: {e}")
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Error Reading GenBank", f"Failed to read {os.path.basename(fp)}:\n{e}")
            root.destroy()
    if not records:
        debug_print("No valid records loaded")
        return None, None
    root = tk.Tk()
    root.withdraw()
    label_keys = choose_label_categories(record_names=[r.name for r in records],
                                           record_bounds={r.name: len(r) for r in records})
    root.destroy()
    return records, label_keys

def convert_pdf_to_png(pdf_path, output_png, dpi=700):
    debug_print(f"Converting PDF to PNG: {pdf_path} -> {output_png}")
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=dpi)
        pix.save(output_png)
        debug_print(f"PNG saved to: {output_png}")
        print(f"PNG saved to: {output_png}")
    except Exception as e:
        debug_print(f"Error converting PDF to PNG: {e}")
        print(f"Error converting PDF to PNG: {e}")

# ---------------------- main_linear() ----------------------
def main_linear():
    print("Starting Linear Diagram Generation")
    debug_print("=== Script started ===")
    try:
        debug_print("Selecting GenBank files...")
        file_paths = select_genbank_files()
        if not file_paths:
            debug_print("No files selected. Exiting.")
            print("No files selected. Exiting.")
            return
        debug_print(f"Selected {len(file_paths)} files")
        
        debug_print("Loading initial records to get sizes")
        initial_records = {}
        for fp in file_paths:
            try:
                debug_print(f"Reading size from {fp}")
                record = SeqIO.read(fp, "genbank")
                initial_records[fp] = record
                debug_print(f"Successfully loaded {fp}, size: {len(record)}")
            except Exception as e:
                debug_print(f"Warning: Could not read record size from {fp}: {e}")
                print(f"Warning: Could not read record size from {fp}: {e}")
        record_sizes = {fp: len(rec) for fp, rec in initial_records.items()}
        debug_print(f"Loaded {len(record_sizes)} record sizes")
        
        debug_print("Opening reordering dialog")
        file_paths, track_ranges = reorder_files(file_paths, record_sizes)
        if not file_paths:
            debug_print("No files after reordering. Exiting.")
            return
        debug_print(f"After reordering: {len(file_paths)} files")
            
        debug_print("Processing files")
        records, label_keys = process_files(file_paths)
        if not records:
            debug_print("No valid records processed. Exiting.")
            return
        
        debug_print("Grouping gene features")
        group_mapping = group_gene_features(records, label_keys)
        
        debug_print("Processing features")
        progress_box = tk.Toplevel()
        progress_box.title("Processing Features")
        progress_box.attributes('-topmost', True)
        progress_label = tk.Label(progress_box, text="Building gene groups...")
        progress_label.pack(padx=10, pady=10)
        progress_bar = ttk.Progressbar(progress_box, orient="horizontal", length=300, mode="determinate")
        progress_bar.pack(padx=10, pady=10)
        progress_bar["maximum"] = len(records)
        progress_box.update()
        
        unique_genes = {}
        gene_label_flags = {}
        product_labels = {}
        group_info = {}
        gene_products = {}
        
        for rec_idx, record in enumerate(records):
            progress_label.config(text=f"Processing record {rec_idx+1}/{len(records)}")
            progress_bar["value"] = rec_idx + 1
            progress_box.update()
            feat_idx = 0
            for feature in record.features:
                if feature.type.lower() not in ("gene", "cds", "trna"):
                    feat_idx += 1
                    continue
                key = (rec_idx, feat_idx)
                group_id = group_mapping.get(key, get_gene_id(feature, label_keys))
                feat_idx += 1
                if group_id:
                    unique_genes.setdefault(group_id, set()).add(record.name)
                    info_parts = [f"Record: {record.name}", f"Type: {feature.type}"]
                    if "gene" in feature.qualifiers:
                        info_parts.append(f"gene: {feature.qualifiers['gene'][0]}")
                    if "locus_tag" in feature.qualifiers:
                        info_parts.append(f"locus_tag: {feature.qualifiers['locus_tag'][0]}")
                    if "product" in feature.qualifiers:
                        info_parts.append(f"product: {feature.qualifiers['product'][0]}")
                        if group_id not in gene_products:
                            gene_products[group_id] = feature.qualifiers["product"][0]
                    info_str = ", ".join(info_parts)
                    group_info.setdefault(group_id, []).append(info_str)
                    lab = get_label_from_feature(feature, label_keys)
                    if lab is not None and lab.strip() != "":
                        gene_label_flags[group_id] = True
                        if group_id not in product_labels:
                            product_labels[group_id] = lab
                    else:
                        if group_id not in gene_label_flags:
                            gene_label_flags[group_id] = False
        
        progress_label.config(text="Building gene list...")
        progress_box.update()
        unique_gene_list = [
            (
                gene_id,
                sorted(list(rec_names)),
                gene_products.get(gene_id, ""),
                "\n".join(sorted(set(group_info[gene_id])))
            )
            for gene_id, rec_names in unique_genes.items()
        ]
        progress_box.destroy()
        debug_print(f"Built list of {len(unique_gene_list)} unique gene groups")
        
        debug_print("Processing track ranges")
        diagram_ranges = {}
        for i, record in enumerate(records):
            if i < len(file_paths):
                file_path = file_paths[i]
                if file_path in track_ranges:
                    start, end, is_full = track_ranges[file_path]
                    if not is_full:
                        diagram_ranges[record.name] = (start, end)
        
        debug_print("Computing BLAST cross-links")
        cross_links = compute_cross_links(records)
        
        debug_print("Opening gene colors selection")
        root = tk.Tk()
        root.withdraw()
        gene_colors = choose_gene_colors(unique_gene_list, gene_label_flags)
        root.destroy()
        
        repeat_regions_by_record = {}
        
        debug_print("Creating linear visualization")
        final_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
        highlight_regions = highlight_regions_config([r.name for r in records], 
                                           {r.name: len(r) for r in records}, 
                                           records)
        draw_diagram_final(records, label_keys, gene_colors, final_pdf, group_mapping, 
                           cross_links, repeat_regions_by_record, highlight_regions_by_record=highlight_regions, track_ranges=diagram_ranges)
        
        downloads_folder = os.path.join(os.path.expanduser("~"), "Downloads")
        output_png = os.path.join(downloads_folder, "converted_output.png")
        convert_pdf_to_png(final_pdf, output_png, dpi=700)
        
        global image_for_labeling, ordered_labels, current_label_index
        debug_print("Opening image for labeling")
        try:
            image_for_labeling = cv2.imread(output_png)
            if image_for_labeling is None:
                debug_print(f"Error: Could not load the converted PNG: {output_png}")
                print("Error: Could not load the converted PNG for labeling.")
                return
            ordered_labels = [os.path.basename(fp) for fp in file_paths]
            current_label_index = 0
            cv2.imshow("Label Sequences", image_for_labeling)
            cv2.setMouseCallback("Label Sequences", mouse_callback)
            print("Interactive Labeling:\nClick on the diagram to select a starting point for scanning down the column.\nEach contiguous group of pure-black pixels found will be labeled with the next filename.\nAfter one click, further clicks are disabled. Then, press any key to close the window.")
            cv2.waitKey(0)
            cv2.destroyAllWindows()
            
            labeled_png = os.path.join(os.path.dirname(output_png), "diagram_labeled.png")
            cv2.imwrite(labeled_png, image_for_labeling)
            debug_print(f"Labeled diagram saved to: {labeled_png}")
            print("Labeled diagram saved to:", labeled_png)
            
            try:
                os.startfile(labeled_png)
            except Exception as e:
                debug_print(f"Could not open labeled diagram: {e}")
                messagebox.showerror("Error", f"Could not open labeled diagram PNG automatically:\n{e}")
        except Exception as e:
            debug_print(f"Error in image labeling process: {e}")
            print(f"Error in image labeling process: {e}")
            traceback.print_exc()
        
        legend_data = {}
        for group, color in gene_colors.items():
            product = product_labels.get(group, group)
            if color not in legend_data:
                legend_data[color] = product
        preview_legend(legend_data)
        
    except Exception as e:
        debug_print(f"CRITICAL ERROR in main function: {e}")
        print(f"CRITICAL ERROR: {e}")
        traceback.print_exc()
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Critical Error", f"An unexpected error occurred:\n{e}\n\nCheck console for details.")
        root.destroy()

# ======================== FUNCTIONS AND CLASSES FROM THE CIRCULAR DIAGRAM SCRIPT ========================
from tkinter import messagebox, filedialog, colorchooser, ttk
import tkinter.simpledialog as simpledialog

def show_info_popup(parent, title, message):

    popup = tk.Toplevel(parent)
    popup.title(title)
    popup.geometry("400x300")
    popup.transient(parent)
    popup.grab_set()
    
    # Add a frame with padding
    frame = tk.Frame(popup, padx=15, pady=15)
    frame.pack(fill="both", expand=True)
    
    # Add message as text
    msg_text = tk.Text(frame, wrap="word", height=12, width=45)
    msg_text.insert("1.0", message)
    msg_text.config(state="disabled")
    msg_text.pack(fill="both", expand=True, padx=5, pady=5)
    
    # Add close button
    close_btn = tk.Button(frame, text="Close", command=popup.destroy)
    close_btn.pack(pady=10)

def install_required_packages():
    required_packages = ["pycirclize", "pygenomeviz", "biopython", "pandas"]
    for package in required_packages:
        try:
            __import__(package.replace("-", "_"))
        except ImportError:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
    print("All required packages installed!")

def genbank_to_fasta(gb_file):
    original_basename = os.path.basename(gb_file).split('.')[0]
    sanitized_basename = re.sub(r'\s+', '_', original_basename)
    sanitized_path = os.path.join(os.path.dirname(gb_file), sanitized_basename + os.path.splitext(gb_file)[1])
    temp_gb_file = gb_file
    if ' ' in gb_file:
        temp_dir = os.path.dirname(os.path.abspath(gb_file))
        temp_gb_file = os.path.join(temp_dir, sanitized_basename + os.path.splitext(gb_file)[1])
        if not os.path.exists(temp_gb_file):
            import shutil
            shutil.copy2(gb_file, temp_gb_file)
    fasta_file = f"{os.path.splitext(temp_gb_file)[0]}.fasta"
    records = list(SeqIO.parse(temp_gb_file, "genbank"))
    SeqIO.write(records, fasta_file, "fasta")
    return fasta_file, records, original_basename

def save_separate_legend(comp_name2color, target_name, enhanced_tracks=None):
    """Create and save a separate legend figure for the circular genome visualization

    Parameters:
    -----------
    comp_name2color : dict
        Dictionary mapping comparison genome names to colors
    target_name : str
        Name of the target/reference genome
    enhanced_tracks : list, optional
        List of TrackInfo objects with enhanced configuration
        
    Returns:
    --------
    str
        Path to the saved legend file
    """
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    from pathlib import Path
    import matplotlib.pyplot as plt
    import os
    
    legend_fig = plt.figure(figsize=(5, 3))
    ax = legend_fig.add_subplot(111)
    ax.axis('off')
    
    handles = [
        Line2D([], [], color="green", label="Positive GC Skew", marker="^", ms=6, ls="None"),
        Line2D([], [], color="purple", label="Negative GC Skew", marker="v", ms=6, ls="None"),
    ]
    
    handles.extend([
        Patch(color="salmon", label="Forward CDS"),
        Patch(color="skyblue", label="Reverse CDS"),
    ])
    
    # Add comparison genomes
    handles.extend([Patch(label=query_name, fc=color) for query_name, color in comp_name2color.items()])
    
    # Add BED track indicator if any exists
    if enhanced_tracks:
        if any(t.track_type == "bed_graph" for t in enhanced_tracks if t.visible):
            bed_tracks = [t for t in enhanced_tracks if t.track_type == "bed_graph" and t.visible]
            for bed_track in bed_tracks:
                if bed_track.options.get("has_custom_colors", False):
                    handles.append(Patch(color="lightgrey", label=f"{bed_track.name} (custom colors)"))
                else:
                    handles.append(Patch(color=bed_track.color, label=bed_track.name))
    
    ax.legend(handles=handles, loc='center', fontsize=10, frameon=True, title="Legend")
    downloads_path = str(Path.home() / "Downloads")
    legend_path = os.path.join(downloads_path, f"{target_name}_legend.png")
    legend_fig.savefig(legend_path, dpi=300, bbox_inches='tight')
    plt.close(legend_fig)
    return legend_path

class TrackInfo:
    """Enhanced track configuration class that can handle any track type"""
    def __init__(self, name, track_type, inner_radius=0, outer_radius=0, color="#CCCCCC", 
                 visible=True, position=0, file_path=None, options=None):
        self.name = name
        self.track_type = track_type  # gb_file, gc_content, gc_skew, cds, ticks
        self.inner_radius = inner_radius
        self.outer_radius = outer_radius
        self.thickness = outer_radius - inner_radius
        self.color = color
        self.visible = visible
        self.position = position
        self.file_path = file_path  # Only for gb_file tracks
        self.options = options or {}  # Additional track-specific options
        
        # Add linked_to property for CDS tracks pairing
        self.linked_track = None
        

    def update_thickness(self, thickness, prevent_recursion=False):
        """Update track thickness while expanding away from the linked track
        
        Parameters:
        -----------
        thickness : float
            New thickness value
        prevent_recursion : bool
            Flag to prevent infinite recursion with linked tracks
        """
        # Handle regular tracks that aren't linked CDS tracks
        if not (self.track_type == "cds" and self.linked_track and self.options.get("linked", False)):
            # Regular track - adjust around center
            center = (self.inner_radius + self.outer_radius) / 2
            self.inner_radius = center - thickness / 2
            self.outer_radius = center + thickness / 2
            self.thickness = thickness
            return
            
        # Special handling for linked CDS tracks
        if self.options.get("strand") == 1:  # Forward CDS track (keep inner radius fixed)
            # Keep inner radius fixed, adjust outer radius
            self.thickness = thickness
            self.outer_radius = self.inner_radius + thickness
            
            # Update linked track if we're allowed
            if not prevent_recursion:
                # Update the reverse CDS track (keep its outer radius fixed)
                self.linked_track.inner_radius = self.outer_radius  # Make them adjacent
                self.linked_track.thickness = thickness
                self.linked_track.outer_radius = self.linked_track.inner_radius + thickness
                
        else:  # Reverse CDS track (keep outer radius fixed)
            # Keep outer radius fixed, adjust inner radius
            self.thickness = thickness
            self.inner_radius = self.outer_radius - thickness
            
            # Update linked track if we're allowed
            if not prevent_recursion:
                # Update the forward CDS track (keep its inner radius fixed)
                self.linked_track.outer_radius = self.inner_radius  # Make them adjacent
                self.linked_track.thickness = thickness
                self.linked_track.inner_radius = self.linked_track.outer_radius - thickness
                
    def set_inner_radius(self, inner_radius, prevent_recursion=False):
        """Update inner radius while maintaining proper track relationships
        
        Parameters:
        -----------
        inner_radius : float
            New inner radius value
        prevent_recursion : bool
            Flag to prevent infinite recursion with linked tracks
        """
        # For non-CDS tracks or unlinked CDS tracks, simply adjust maintaining thickness
        if not (self.track_type == "cds" and self.linked_track and self.options.get("linked", False)):
            self.inner_radius = inner_radius
            self.outer_radius = inner_radius + self.thickness
            return
            
        # Special handling for linked CDS tracks
        if self.options.get("strand") == 1:  # Forward CDS track
            # For forward track, directly set inner radius and maintain thickness
            self.inner_radius = inner_radius
            self.outer_radius = inner_radius + self.thickness
            
            # Update linked track if allowed
            if not prevent_recursion:
                # Make reverse track adjacent to forward track
                self.linked_track.outer_radius = self.inner_radius
                self.linked_track.inner_radius = self.linked_track.outer_radius - self.linked_track.thickness
                
        else:  # Reverse CDS track
            # For reverse track, calculate how much inner radius changed
            delta = inner_radius - self.inner_radius
            
            # Move both inner and outer radius by that amount to maintain thickness
            self.inner_radius = inner_radius
            self.outer_radius = self.outer_radius + delta
            
            # Update linked track if allowed
            if not prevent_recursion:
                # Make forward track adjacent to reverse track
                self.linked_track.inner_radius = self.outer_radius
                self.linked_track.outer_radius = self.linked_track.inner_radius + self.linked_track.thickness


    def set_linked_track(self, track):
        """Set the linked track and ensure both tracks know about each other"""
        if track and track != self and track.track_type == "cds" and self.track_type == "cds":
            self.linked_track = track
            if track.linked_track != self:
                track.linked_track = self
    
    def toggle_linked(self, value):
        """Toggle the linked status for this track and its linked track"""
        if self.track_type == "cds" and self.linked_track:
            self.options["linked"] = value
            self.linked_track.options["linked"] = value
            
            # If now linked, make sure they're adjacent and have same thickness
            if value:
                # Make thickness the same
                avg_thickness = (self.thickness + self.linked_track.thickness) / 2
                self.update_thickness(avg_thickness)
                
                # Make them adjacent
                if self.options.get("strand") == 1:  # Forward CDS is typically on top
                    self.linked_track.outer_radius = self.inner_radius
                    self.linked_track.inner_radius = self.linked_track.outer_radius - self.linked_track.thickness
                else:  # Reverse CDS is typically on bottom
                    self.linked_track.inner_radius = self.outer_radius
                    self.linked_track.outer_radius = self.linked_track.inner_radius + self.linked_track.thickness
    
    def __str__(self):
        return f"{self.name} ({self.track_type}): radius {self.inner_radius}-{self.outer_radius}"  

class BedSegment:
    """Class to store BED segment information"""
    def __init__(self, start, end, color=None):
        self.start = start
        self.end = end
        self.color = color or "#CCCCCC"  # Default to gray if color not specified

class EnhancedTrackConfigWindow(tk.Toplevel):
    """Enhanced track configuration window with visual preview and selection interface"""
    def __init__(self, master, all_tracks, callback):
        super().__init__(master)
        self.title("Configure All Tracks")
        self.geometry("1350x1000")
        self.callback = callback

        print("\n--- Opening Track Config Window ---")
        print(f"Received {len(all_tracks)} tracks")
        for i, t in enumerate(all_tracks):
            print(f"Track {i}: {t.name}, inner={t.inner_radius}, outer={t.outer_radius}, id={id(t)}")
    
        self.all_tracks = all_tracks.copy()
        self.selected_track = None
        
        # Link CDS tracks with each other
        self.establish_cds_track_links()
        
        # Store initial track state for comparison
        self.initial_track_state = self.save_track_state()
        
        # Update track radii based on positions to ensure proper visualization
        self.update_track_radii()
        
        # Default colors for different track types
        self.default_colors = {
            "gb_file": ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", 
                       "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"],
            "gc_content": "#333333", 
            "gc_skew_pos": "#228B22",
            "gc_skew_neg": "#9932CC", 
            "cds_fwd": "#FA8072",
            "cds_rev": "#87CEEB",
            "ticks": "#000000",
            "bed_graph": "#CCCCCC"  # Default color for BED graph tracks
        }
        
        # Create split layout (tracks list on left, preview on right)
        self.paned_window = tk.PanedWindow(self, orient=tk.HORIZONTAL)
        self.paned_window.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Left side - track controls
        self.tracks_frame = tk.Frame(self.paned_window)
        self.paned_window.add(self.tracks_frame, width=600)
        
        # Right side - circular preview
        self.preview_frame = tk.LabelFrame(self.paned_window, text="Preview")
        self.paned_window.add(self.preview_frame, width=350)
        
        # Track controls
        control_frame = tk.Frame(self.tracks_frame)
        control_frame.pack(fill="x", padx=5, pady=5)
        
        tk.Label(control_frame, text="Track Configuration", font=("Arial", 12, "bold")).pack(anchor="w")
        
        # Instructions
        instruction_text = (
            "• Click on a track to select it and edit its properties\n"
            "• Use 'Quick Arrange' to automatically organize GenBank tracks\n"
            "• Import BED Graph files for custom segment visualization\n"
            "• Customize track thickness, radius and colors\n"
            "• GC tracks have separate colors for positive and negative values\n"
            "• CDS Forward and Reverse tracks can be linked to move together"
        )
        instruction_frame = tk.Frame(self.tracks_frame, bg="#F0F8FF", bd=1, relief="solid")
        instruction_frame.pack(fill="x", padx=5, pady=5)
        tk.Label(instruction_frame, text=instruction_text, justify="left", 
                bg="#F0F8FF", fg="#333333", padx=10, pady=5).pack(anchor="w")
        
        # Quick arrange button
        quick_arrange_frame = tk.Frame(self.tracks_frame)
        quick_arrange_frame.pack(fill="x", padx=5, pady=5)

        # Quick arrange button
        button_row = tk.Frame(quick_arrange_frame)
        button_row.pack(fill="x", pady=5)        
        tk.Button(
            button_row, 
            text="Quick Arrange GenBank Tracks", 
            command=self.quick_arrange_gb_tracks,
            bg="#4682B4", fg="white", 
            padx=10, pady=5
        ).pack(side="left", padx=(0, 10))

        # Import BED Graph Track button
        tk.Button(
            button_row, 
            text="Import BED Graph Track", 
            command=self.import_bed_track,
            bg="#5F9EA0", fg="white", 
            padx=10, pady=5
        ).pack(side="left", padx=(0, 10))

        # Apply Changes button (right side, pastel green color)
        tk.Button(
            button_row, 
            text="Apply Changes", 
            command=self.apply_changes,
            bg="#a8e6cf", fg="black", 
            padx=10, pady=5,
            font=("Arial", 10, "bold")
        ).pack(side="right")
        
        # Track list with headers
        header_frame = tk.Frame(self.tracks_frame)
        header_frame.pack(fill="x", padx=5, pady=5)
        
        # Removed Position column
        tk.Label(header_frame, text="Visible", width=6).grid(row=0, column=0, padx=2)
        tk.Label(header_frame, text="Track Name", width=12).grid(row=0, column=1, padx=2, sticky="w")
        tk.Label(header_frame, text="Type", width=12).grid(row=0, column=2, padx=2, sticky="w")
        tk.Label(header_frame, text="Radius", width=11).grid(row=0, column=3, padx=2)
        tk.Label(header_frame, text="Color", width=9).grid(row=0, column=4, padx=2)
        tk.Label(header_frame, text="Delete", width=6).grid(row=0, column=5, padx=2)  # New column for delete button
        
        # Scrollable frame for tracks
        self.canvas = tk.Canvas(self.tracks_frame)
        scrollbar = tk.Scrollbar(self.tracks_frame, orient="vertical", command=self.canvas.yview)
        
        self.scrollable_frame = tk.Frame(self.canvas)
        self.scrollable_frame.bind("<Configure>", 
                             lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        
        self.canvas.pack(side="left", fill="both", expand=True, padx=5, pady=5)
        scrollbar.pack(side="right", fill="y", pady=5)
        
        # Selected track options panel (at bottom of tracks_frame)
        self.options_frame = tk.LabelFrame(self, text="Selected Track Options")
        self.options_frame.pack(fill="x", padx=10, pady=10)
        
        # Create empty options panel initially
        self.create_empty_options_panel()
        
        # Create preview canvas in the right panel
        preview_controls = tk.Frame(self.preview_frame)
        preview_controls.pack(fill="x", padx=5, pady=5)
        
        tk.Label(preview_controls, text="Preview Scale:").pack(side="left")
        self.scale_var = tk.DoubleVar(value=1.0)
        scale_slider = tk.Scale(preview_controls, variable=self.scale_var, 
                               from_=0.5, to=2.0, resolution=0.1, orient="horizontal",
                               length=150, command=self.update_preview)
        scale_slider.pack(side="left", padx=5)
        
        # Create canvas for the circular preview
        self.preview_canvas = tk.Canvas(self.preview_frame, bg="white", bd=1, relief="solid")
        self.preview_canvas.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Buttons frame (at bottom)
        buttons_frame = tk.Frame(self)
        buttons_frame.pack(fill="x", padx=10, pady=10)
        
        tk.Button(buttons_frame, text="Reset to Default", 
                 command=self.reset_to_default,
                 padx=10, pady=5).pack(side="right", padx=5)
        
        # Populate the track list and create the preview
        self.refresh_track_list()
        self.update_preview()
        
        # Add a status label to show when changes have been made
        self.status_label = tk.Label(self, text="", fg="gray", font=("Arial", 9))
        self.status_label.pack(side="bottom", anchor="e", padx=10, pady=(0, 5))
        self.check_for_changes()

    def delete_track(self, track):
        """Delete a track and refresh the UI"""
        # Ask for confirmation
        if messagebox.askyesno("Confirm Delete", f"Are you sure you want to delete the track '{track.name}'?"):
            # Remove from all_tracks
            if track in self.all_tracks:
                self.all_tracks.remove(track)
            
            # If the deleted track was selected, clear selection
            if self.selected_track is track:
                self.selected_track = None
                self.create_empty_options_panel()
            
            # Refresh UI
            self.refresh_track_list()
            self.update_preview()
            self.check_for_changes()

    def choose_bed_background_color(self, track):
        """Open color chooser for BED track background"""
        color_tuple = colorchooser.askcolor(initialcolor=track.options.get("background_color", "#E0E0E0"))
        if color_tuple and color_tuple[1]:
            # Update the track's background color
            track.options["background_color"] = color_tuple[1]
            
            # Update UI
            self.create_track_options_panel(track)
            self.update_preview()
            self.check_for_changes()

    def update_bed_background_color(self, track, hex_value):
        """Update BED track background color from hex input"""
        try:
            if not hex_value.startswith('#'):
                hex_value = '#' + hex_value
            if len(hex_value) not in (4, 7, 9):
                raise ValueError("Invalid hex code length")
                
            # Try creating a test widget to validate color
            test_btn = tk.Button(self, bg=hex_value)
            test_btn.destroy()
            
            # Update the track's background color
            track.options["background_color"] = hex_value
            
            # Update UI
            self.create_track_options_panel(track)
            self.update_preview()
            self.check_for_changes()
            
        except Exception as e:
            messagebox.showerror("Error", f"Invalid color code: {str(e)}")



    def import_bed_track(self):
        """Import a BED file as a new custom track"""
        filename = filedialog.askopenfilename(
            title="Select BED File",
            filetypes=(("BED files", "*.bed"), ("Text files", "*.txt"), ("All files", "*.*"))
        )
        
        if not filename:
            return
        
        try:
            # Ask for track name
            track_name = simpledialog.askstring("Track Name", "Enter a name for this track:",
                                            initialvalue=os.path.basename(filename).split('.')[0])
            if not track_name:
                return
            
            # Read the BED file
            segments = []
            has_custom_colors = False
            default_color = "#CCCCCC"  # Default gray
            
            with open(filename, 'r') as f:
                for line in f:
                    if line.startswith('#') or not line.strip():
                        continue
                        
                    parts = line.strip().split()
                    if len(parts) < 2:
                        continue
                        
                    try:
                        start = int(parts[0])
                        end = int(parts[1])
                        
                        # Check for color in third column
                        if len(parts) >= 3 and parts[2].startswith('#'):
                            color = parts[2]
                            has_custom_colors = True
                        else:
                            color = default_color
                            
                        segments.append(BedSegment(start, end, color))
                    except ValueError:
                        # Skip invalid lines
                        continue
            
            if not segments:
                messagebox.showerror("Error", "No valid segments found in the BED file")
                return
            
            # Find position to insert the new track
            insert_pos = len(self.all_tracks)
            
            # Create a new track
            new_track = TrackInfo(
                name=track_name,
                track_type="bed_graph",
                inner_radius=80,
                outer_radius=85,
                color=default_color,
                visible=True,
                position=insert_pos,
                file_path=filename,
                options={
                    "segments": segments,
                    "has_custom_colors": has_custom_colors,
                    "background_color": "#E0E0E0"  # Default light gray background
                }
            )
            
            # Add the track
            self.all_tracks.append(new_track)
            
            # Reposition tracks
            self.update_track_radii()
            
            # Refresh UI
            self.refresh_track_list()
            self.update_preview()
            self.check_for_changes()
            
            messagebox.showinfo("Success", f"Added {len(segments)} segments from BED file")
            
        except Exception as e:
            messagebox.showerror("Error", f"Error importing BED file: {str(e)}")




    def establish_cds_track_links(self):
        """Link CDS tracks with each other"""
        forward_cds = None
        reverse_cds = None
        
        # Find forward and reverse CDS tracks
        for track in self.all_tracks:
            if track.track_type == "cds":
                if track.options.get("strand") == 1:
                    forward_cds = track
                elif track.options.get("strand") == -1:
                    reverse_cds = track
        
        # Link them if both exist
        if forward_cds and reverse_cds:
            forward_cds.set_linked_track(reverse_cds)
            
            # Set linked status based on options (default to True if not specified)
            is_linked = forward_cds.options.get("linked", True)
            forward_cds.options["linked"] = is_linked
            reverse_cds.options["linked"] = is_linked
        
    def save_track_state(self):
        """Save the current state of all tracks for comparison"""
        state = []
        for track in self.all_tracks:
            track_state = {
                'name': track.name,
                'track_type': track.track_type,
                'inner_radius': track.inner_radius,
                'outer_radius': track.outer_radius,
                'thickness': track.thickness,
                'color': track.color,
                'visible': track.visible,
                'position': track.position
            }
            # Save negative color if it exists in options
            if track.track_type in ["gc_content", "gc_skew"] and "negative_color" in track.options:
                track_state['negative_color'] = track.options["negative_color"]
            
            # Save linked status for CDS tracks
            if track.track_type == "cds" and "linked" in track.options:
                track_state['linked'] = track.options["linked"]
                
            state.append(track_state)
        return state
    
    def check_for_changes(self):
        """Check if current track state differs from initial state"""
        current_state = self.save_track_state()
        
        # Compare states to see if anything changed
        has_changes = False
        if len(current_state) != len(self.initial_track_state):
            has_changes = True
        else:
            for current, initial in zip(current_state, self.initial_track_state):
                for key, value in current.items():
                    if key not in initial or initial[key] != value:
                        has_changes = True
                        break
                if has_changes:
                    break
        
        # Update status label
        if has_changes:
            self.status_label.config(text="Changes detected. Click 'Apply Changes' to save.", fg="#4682B4")
        else:
            self.status_label.config(text="No changes detected", fg="gray")
    
    def create_empty_options_panel(self):
        """Create empty options panel when no track is selected"""
        for widget in self.options_frame.winfo_children():
            widget.destroy()
        
        tk.Label(self.options_frame, text="Click on a track to edit its properties",
                font=("Arial", 10), fg="#888888").pack(pady=20)
    

    def create_track_options_panel(self, track):
        """Create options panel for the selected track with improved layout"""
        for widget in self.options_frame.winfo_children():
            widget.destroy()
        
        # Main options frame 
        main_options = tk.Frame(self.options_frame)
        main_options.pack(fill="x", padx=10, pady=10)
        
        # Track info
        info_frame = tk.Frame(main_options)
        info_frame.pack(fill="x", pady=5)
        
        tk.Label(info_frame, text=f"Selected Track: ", font=("Arial", 10, "bold")).pack(side="left")
        tk.Label(info_frame, text=f"{track.name} ({track.track_type})", 
                font=("Arial", 10)).pack(side="left")
        
        # Create two columns for controls
        controls_frame = tk.Frame(main_options)
        controls_frame.pack(fill="x", pady=5)
        
        left_col = tk.Frame(controls_frame)
        left_col.pack(side="left", fill="y", padx=(0, 20))
        
        right_col = tk.Frame(controls_frame)
        right_col.pack(side="left", fill="y")
        
        # --- Left column controls ---
        
        # Inner radius slider and input
        radius_frame = tk.Frame(left_col)
        radius_frame.pack(fill="x", pady=5)
        
        tk.Label(radius_frame, text="Inner Radius:").grid(row=0, column=0, sticky="w")
        
        # Slider for inner radius
        inner_radius_var = tk.DoubleVar(value=track.inner_radius)
        inner_radius_slider = tk.Scale(radius_frame, variable=inner_radius_var, 
                                    from_=30, to=150, resolution=0.5, 
                                    orient="horizontal", length=150,
                                    command=lambda val: self.update_track_radius(track, float(val)))
        inner_radius_slider.grid(row=0, column=1, padx=5)
        
        # Text entry for precise value
        inner_radius_entry = tk.Entry(radius_frame, width=6)
        inner_radius_entry.insert(0, str(track.inner_radius))
        inner_radius_entry.grid(row=0, column=2, padx=5)
        inner_radius_entry.bind("<Return>", lambda e: self.update_track_radius_from_entry(
            track, inner_radius_entry.get()
        ))
        
        # Thickness slider and input
        thickness_frame = tk.Frame(left_col)
        thickness_frame.pack(fill="x", pady=5)
        
        tk.Label(thickness_frame, text="Thickness:").grid(row=0, column=0, sticky="w")
        
        # Slider for thickness
        thickness_var = tk.DoubleVar(value=track.thickness)
        thickness_slider = tk.Scale(thickness_frame, variable=thickness_var, 
                                from_=0.5, to=20, resolution=0.5, 
                                orient="horizontal", length=150,
                                command=lambda val: self.update_track_thickness(track, float(val)))
        thickness_slider.grid(row=0, column=1, padx=5)
        
        # Text entry for precise value
        thickness_entry = tk.Entry(thickness_frame, width=6)
        thickness_entry.insert(0, str(track.thickness))
        thickness_entry.grid(row=0, column=2, padx=5)
        thickness_entry.bind("<Return>", lambda e: self.update_track_thickness_from_entry(
            track, thickness_entry.get()
        ))
        
        # --- Right column controls ---
        
        # Visibility checkbox
        visibility_frame = tk.Frame(right_col)
        visibility_frame.pack(fill="x", pady=5, anchor="w")
        
        visible_var = tk.BooleanVar(value=track.visible)
        visible_cb = tk.Checkbutton(visibility_frame, variable=visible_var, text="Visible",
                                command=lambda: self.toggle_visibility(track, visible_var))
        visible_cb.pack(anchor="w")
        
        # CDS linking checkbox (only for CDS tracks)
        if track.track_type == "cds" and track.linked_track:
            linked_frame = tk.Frame(right_col)
            linked_frame.pack(fill="x", pady=5, anchor="w")
            
            linked_var = tk.BooleanVar(value=track.options.get("linked", True))
            linked_cb = tk.Checkbutton(linked_frame, variable=linked_var, text="Link with other CDS track",
                                    command=lambda: self.toggle_cds_link(track, linked_var))
            linked_cb.pack(anchor="w")
            
            # Add explanatory text
            if linked_var.get():
                link_status = f"Linked with {track.linked_track.name}"
            else:
                link_status = "Tracks can be moved independently"
                
            tk.Label(linked_frame, text=link_status, font=("Arial", 8), fg="gray").pack(anchor="w", padx=20)
        
        # Color controls
        colors_frame = tk.LabelFrame(right_col, text="Color Settings")
        colors_frame.pack(fill="x", pady=5, anchor="w")
        
        # BED graph track - special handling
        if track.track_type == "bed_graph":
            # For BED graph tracks, show segment info and background color selector
            segments_frame = tk.LabelFrame(self.options_frame, text="BED Track Settings")
            segments_frame.pack(fill="x", pady=5)
            
            segments = track.options.get("segments", [])
            has_custom_colors = track.options.get("has_custom_colors", False)
            
            # Create two columns for BED settings
            bed_cols_frame = tk.Frame(segments_frame)
            bed_cols_frame.pack(fill="x", pady=5)
            
            bed_left_col = tk.Frame(bed_cols_frame)
            bed_left_col.pack(side="left", fill="y", padx=(0, 10))
            
            bed_right_col = tk.Frame(bed_cols_frame)
            bed_right_col.pack(side="left", fill="y")
            
            # Show segment count in left column
            info_text = f"{len(segments)} segments loaded"
            if has_custom_colors:
                info_text += " (with custom colors)"
            
            tk.Label(bed_left_col, text=info_text).pack(pady=5)
            
            # Background color control section in right column
            bg_color_frame = tk.Frame(bed_right_col)
            bg_color_frame.pack(fill="x", pady=5)
            
            tk.Label(bg_color_frame, text="Background Color:").pack(side="left", padx=5)
            
            # Get current background color or use default
            bg_color = track.options.get("background_color", "#E0E0E0")
            
            # Create color button
            bg_color_btn = tk.Button(
                bg_color_frame, 
                bg=bg_color, 
                width=3, 
                height=1,
                command=lambda: self.choose_bed_background_color(track)
            )
            bg_color_btn.pack(side="left", padx=5)
            
            # Hex entry for more precise control
            bg_hex_var = tk.StringVar(value=bg_color)
            bg_hex_entry = tk.Entry(bg_color_frame, textvariable=bg_hex_var, width=8)
            bg_hex_entry.pack(side="left", padx=5)
            
            # Apply button
            tk.Button(
                bg_color_frame, 
                text="Apply", 
                command=lambda: self.update_bed_background_color(track, bg_hex_var.get())
            ).pack(side="left", padx=5)
            
            # Show color warning if custom colors
            if has_custom_colors:
                tk.Label(segments_frame, 
                        text="Each segment has its own color defined in the BED file.\nChanging the segment colors will have no effect.",
                        fg="gray", font=("Arial", 8)).pack(pady=5)
            
            # Show example segments - MOVED TO THE RIGHT
            if segments:
                examples_frame = tk.Frame(bed_cols_frame)  # Put it in the columns frame instead
                examples_frame.pack(side="right", pady=5)  # Pack it to the right
                
                tk.Label(examples_frame, text="Example colors:", font=("Arial", 8)).pack(side="left")
                
                # Show up to 5 example colors
                sample_count = min(5, len(segments))
                for i in range(sample_count):
                    tk.Label(examples_frame, bg=segments[i].color, width=2, height=1).pack(side="left", padx=2)
                
                if len(segments) > sample_count:
                    tk.Label(examples_frame, text=f"+ {len(segments) - sample_count} more", font=("Arial", 8)).pack(side="left", padx=5)
            
            # Still include track color in color settings for non-custom-color BED tracks
            if not has_custom_colors:
                color_frame = tk.Frame(colors_frame)
                color_frame.pack(fill="x", pady=2)
                
                tk.Label(color_frame, text="Segment Color:").pack(side="left")
                color_btn = tk.Button(color_frame, bg=track.color, width=3, height=1,
                                    command=lambda: self.choose_color(track, "main"))
                color_btn.pack(side="left", padx=5)
            
        # Different color controls based on track type
        elif track.track_type in ["gc_content", "gc_skew"]:
            # Color controls for tracks with dual colors
            pos_frame = tk.Frame(colors_frame)
            pos_frame.pack(fill="x", pady=2)
            
            tk.Label(pos_frame, text="Positive Color:").pack(side="left")
            pos_color = track.color
            pos_btn = tk.Button(pos_frame, bg=pos_color, width=3, height=1,
                            command=lambda: self.choose_color(track, "pos"))
            pos_btn.pack(side="left", padx=5)
            
            neg_frame = tk.Frame(colors_frame)
            neg_frame.pack(fill="x", pady=2)
            
            tk.Label(neg_frame, text="Negative Color:").pack(side="left")
            neg_color = track.options.get("negative_color", 
                                    "#888888" if track.track_type == "gc_content" else "#9932CC")
            neg_btn = tk.Button(neg_frame, bg=neg_color, width=3, height=1,
                            command=lambda: self.choose_color(track, "neg"))
            neg_btn.pack(side="left", padx=5)
        else:
            # Single color control for other track types
            color_frame = tk.Frame(colors_frame)
            color_frame.pack(fill="x", pady=2)
            
            tk.Label(color_frame, text="Track Color:").pack(side="left")
            color_btn = tk.Button(color_frame, bg=track.color, width=3, height=1,
                                command=lambda: self.choose_color(track, "main"))
            color_btn.pack(side="left", padx=5)


    def toggle_cds_link(self, track, var):
        """Toggle the CDS tracks linking"""
        is_linked = var.get()
        track.toggle_linked(is_linked)
        
        # Update UI
        self.create_track_options_panel(track)
        self.refresh_track_list()
        self.update_preview()
        self.check_for_changes()
    
    def refresh_track_list(self):
        """Refresh the track list display"""
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
            
        # Sort tracks by position
        sorted_tracks = sorted(self.all_tracks, key=lambda x: x.position)
        
        for i, track in enumerate(sorted_tracks):
            # Determine if this track is selected
            is_selected = (self.selected_track is track)
            
            # Determine if this track is linked and paired CDS is selected
            is_linked_selected = False
            if track.track_type == "cds" and track.linked_track and track.options.get("linked", False):
                is_linked_selected = self.selected_track is track.linked_track
            
            # Create frame for this track with appropriate styling
            if is_selected:
                frame = tk.Frame(self.scrollable_frame, bd=2, relief="raised", bg="#e6f2ff")
            elif is_linked_selected:
                # Highlight linked track with a lighter styling
                frame = tk.Frame(self.scrollable_frame, bd=1, relief="solid", bg="#f0f8ff")
            else:
                frame = tk.Frame(self.scrollable_frame)
                # Use different background colors for different track types
                if i % 2 == 0:
                    bg_color = "#f8f8f8"
                else:
                    bg_color = "white"
                
                # Special coloring for track types
                if track.track_type == "gc_content":
                    bg_color = "#e6ffe6"  # Light green
                elif track.track_type == "gc_skew":
                    bg_color = "#e6f7ff"  # Light blue
                elif track.track_type == "cds":
                    bg_color = "#fff5e6"  # Light orange
                elif track.track_type == "bed_graph":
                    bg_color = "#F0F0E0"  # Light tan
                    
                frame.configure(bg=bg_color)
            
            frame.pack(fill="x", pady=2)
            
            # Make the whole frame clickable to select the track
            frame.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            
            # Visibility checkbox
            visible_var = tk.BooleanVar(value=track.visible)
            visible_cb = tk.Checkbutton(frame, variable=visible_var, bg=frame["bg"],
                                      command=lambda t=track, v=visible_var: self.toggle_visibility(t, v))
            visible_cb.grid(row=0, column=0, padx=2)
            
            # Track name with linked indicator for CDS tracks
            name_text = track.name
            if track.track_type == "cds" and track.linked_track and track.options.get("linked", False):
                name_text = f"{name_text} \u2194"  # Add bidirectional arrow for linked tracks
                
            name_label = tk.Label(frame, text=name_text, anchor="w", width=20, bg=frame["bg"])
            name_label.grid(row=0, column=1, padx=2, sticky="w")
            name_label.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            
            # Track type
            type_label = tk.Label(frame, text=track.track_type, anchor="w", width=10, bg=frame["bg"])
            type_label.grid(row=0, column=2, padx=2, sticky="w")
            type_label.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            
            # Radius display
            radius_text = f"{track.inner_radius:.1f}-{track.outer_radius:.1f}"
            radius_label = tk.Label(frame, text=radius_text, width=10, bg=frame["bg"])
            radius_label.grid(row=0, column=3, padx=2)
            radius_label.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            
            # Color display
            color_frame = tk.Frame(frame, bg=frame["bg"])
            color_frame.grid(row=0, column=4, padx=2)
            
            # For GC content and GC skew tracks, show dual colors
            if track.track_type in ["gc_content", "gc_skew"]:
                pos_color = track.color
                neg_color = track.options.get("negative_color", 
                                           "#888888" if track.track_type == "gc_content" else "#9932CC")
                
                # Create a small color preview showing both colors
                canvas = tk.Canvas(color_frame, width=30, height=15, bg=frame["bg"], bd=0, highlightthickness=0)
                canvas.pack()
                
                # Draw two color rectangles
                canvas.create_rectangle(0, 0, 15, 15, fill=pos_color, outline="black")
                canvas.create_rectangle(15, 0, 30, 15, fill=neg_color, outline="black")
                
                # Make canvas clickable
                canvas.bind("<Button-1>", lambda e, t=track: self.select_track(t))
                
            # For BED graph tracks with custom colors, show a special indicator
            elif track.track_type == "bed_graph" and track.options.get("has_custom_colors", False):
                # Show a multi-color indicator
                canvas = tk.Canvas(color_frame, width=30, height=15, bg=frame["bg"], bd=0, highlightthickness=0)
                canvas.pack()
                
                # Draw a gradient-like pattern
                segments = track.options.get("segments", [])
                if segments:
                    # Show up to 5 colors
                    sample_count = min(5, len(segments))
                    width_per_sample = 30 / sample_count
                    
                    for i in range(sample_count):
                        x1 = i * width_per_sample
                        x2 = (i + 1) * width_per_sample
                        canvas.create_rectangle(x1, 0, x2, 15, fill=segments[i].color, outline="")
                    
                    # Add border
                    canvas.create_rectangle(0, 0, 30, 15, fill="", outline="black")
                else:
                    # Fallback if no segments
                    canvas.create_rectangle(0, 0, 30, 15, fill="lightgrey", outline="black")
                
                # Make canvas clickable
                canvas.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            else:
                # Single color for other track types
                color_btn = tk.Label(color_frame, bg=track.color, width=4, height=1)
                color_btn.pack()
                color_btn.bind("<Button-1>", lambda e, t=track: self.select_track(t))
            
            # Delete button
            delete_btn = tk.Button(frame, text="🗑️", bg=frame["bg"], 
                                  command=lambda t=track: self.delete_track(t),
                                  width=10, height=1, fg="red")
            delete_btn.grid(row=0, column=5, padx=2, sticky="e")
    
    def select_track(self, track):
        """Select a track and show its options"""
        self.selected_track = track
        self.create_track_options_panel(track)
        self.refresh_track_list()
        self.update_preview() # Update preview to highlight selected track
    
    def toggle_visibility(self, track, var):
        """Toggle track visibility"""
        track.visible = var.get()
        self.refresh_track_list()
        self.update_preview()
        self.check_for_changes()
    
    def update_thickness(self, thickness, recursive=True):
        """Update the track thickness
        
        Parameters:
        -----------
        thickness : float
            New thickness value
        recursive : bool
            Whether to update linked track (to prevent infinite recursion)
        """
        self.thickness = thickness
        self.outer_radius = self.inner_radius + thickness
        
        # Only update linked track if recursive flag is True and linked track exists
        if recursive and self.linked_track and self.options.get("linked", False):
            # Pass recursive=False to prevent infinite recursion
            self.linked_track.update_thickness(thickness, recursive=False)
            
    def update_track_thickness(self, track, thickness):
        """Update track thickness from slider"""
        # Update the track's thickness
        track.update_thickness(thickness)
        
        # Calculate the new outer radius based on inner radius and thickness
        track.outer_radius = track.inner_radius + thickness
        
        # Force immediate redraw of the preview canvas
        self.update_preview()
        
        # Check for changes but don't refresh the track list
        self.check_for_changes()

    def update_track_radius(self, track, inner_radius):
        """Update track inner radius from slider"""
        # Update the track's inner radius
        track.set_inner_radius(inner_radius)
        
        # Recalculate the outer radius to maintain thickness
        track.outer_radius = inner_radius + track.thickness
        
        # Force immediate redraw of the preview canvas
        self.update_preview()
        
        # Check for changes but don't refresh the track list
        self.check_for_changes()


    def update_track_radius_from_entry(self, track, radius_text):
        """Update track radius from text entry"""
        try:
            inner_radius = float(radius_text)
            if inner_radius < 30:
                messagebox.showerror("Invalid Value", "Inner radius must be at least 30")
                return
                
            track.set_inner_radius(inner_radius)
            self.refresh_track_list()
            self.update_preview()
            self.check_for_changes()
            
            # Update the options panel
            if self.selected_track is track:
                self.create_track_options_panel(track)
        except ValueError:
            messagebox.showerror("Invalid Value", "Please enter a valid number for radius")
    
    def update_track_thickness_from_entry(self, track, thickness_text):
        """Update track thickness from text entry"""
        try:
            thickness = float(thickness_text)
            if thickness <= 0:
                messagebox.showerror("Invalid Value", "Thickness must be greater than 0")
                return
                
            track.update_thickness(thickness)
            self.refresh_track_list()
            self.update_preview()
            self.check_for_changes()
            
            # Update the options panel
            if self.selected_track is track:
                self.create_track_options_panel(track)
        except ValueError:
            messagebox.showerror("Invalid Value", "Please enter a valid number for thickness")
    
    def choose_color(self, track, color_type="main"):
        """Open color chooser dialog for the specified color type
        
        Parameters:
        -----------
        track : TrackInfo
            The track to update
        color_type : str
            The type of color to update:
            - "main" or "pos": The primary/positive color
            - "neg": The negative color (for GC content/skew)
        """
        # Prevent color changes for BED tracks with custom colors
        if track.track_type == "bed_graph" and track.options.get("has_custom_colors", False):
            messagebox.showinfo("Custom Colors", 
                               "This BED track has custom colors defined for each segment in the source file.")
            return
            
        if color_type in ["main", "pos"]:
            # Update the main track color
            initial_color = track.color
            color_tuple = colorchooser.askcolor(initialcolor=initial_color)
            if color_tuple and color_tuple[1]:
                track.color = color_tuple[1]
        elif color_type == "neg":
            # Update the negative color stored in options
            initial_color = track.options.get("negative_color", "#888888")
            color_tuple = colorchooser.askcolor(initialcolor=initial_color)
            if color_tuple and color_tuple[1]:
                track.options["negative_color"] = color_tuple[1]
        
        self.refresh_track_list()
        self.update_preview()
        self.check_for_changes()
        
        # Refresh options panel if this is the selected track
        if self.selected_track is track:
            self.create_track_options_panel(track)
    
    def quick_arrange_gb_tracks(self):
        """Automatically arrange GenBank tracks to be adjacent"""
        # Filter GenBank tracks
        gb_tracks = [t for t in self.all_tracks if t.track_type == "gb_file"]
        
        if not gb_tracks:
            messagebox.showinfo("No GenBank Tracks", "No GenBank tracks found to arrange")
            return
        
        # Find appropriate start radius
        # First, find the outermost non-GB track
        non_gb_tracks = [t for t in self.all_tracks if t.track_type != "gb_file"]
        
        if non_gb_tracks:
            # Find the outermost non-GB track
            max_outer_radius = max(t.outer_radius for t in non_gb_tracks)
            start_radius = max_outer_radius + 1  # Add 1 unit spacing
        else:
            # If no non-GB tracks, start at a reasonable default
            start_radius = 60
        
        # Default thickness for GB tracks
        default_thickness = 3.0
        
        # Arrange GB tracks
        current_radius = start_radius
        for track in gb_tracks:
            track.inner_radius = current_radius
            track.thickness = default_thickness
            track.outer_radius = current_radius + default_thickness
            current_radius = track.outer_radius + 0.5  # Small gap between tracks
        
        messagebox.showinfo(
            "Tracks Arranged", 
            f"Arranged {len(gb_tracks)} GenBank tracks starting at radius {start_radius:.1f}"
        )
        
        # Refresh UI
        self.refresh_track_list()
        self.update_preview()
        self.check_for_changes()
        
        # Update selected track panel if needed
        if self.selected_track and self.selected_track.track_type == "gb_file":
            self.create_track_options_panel(self.selected_track)
    
    def update_track_radii(self):
        # Sort tracks by position
        sorted_tracks = sorted(self.all_tracks, key=lambda x: x.position)
        
        # Default track thickness values by type
        default_thickness = {
            "ticks": 1,
            "gc_skew": 15,
            "gc_content": 10,
            "cds": 5,
            "gb_file": 3,
            "labels": 10,
            "bed_graph": 5  # Default thickness for BED graph tracks
        }
        
        # Start with innermost radius at 40 (standard for circular genomes)
        current_radius = 40
        
        for track in sorted_tracks:
            # Skip tracks with already defined values
            if track.inner_radius > 0 and track.outer_radius > 0:
                continue
                
            # Special handling for CDS tracks - make sure they're adjacent if linked
            if track.track_type == "cds" and track.linked_track and track.options.get("linked", True):
                # Check if the linked track is already positioned
                if track.linked_track.inner_radius > 0 and track.linked_track.outer_radius > 0:
                    # Position this track adjacent to the linked track
                    if track.options.get("strand") == 1:  # Forward CDS (top)
                        track.outer_radius = current_radius + default_thickness.get(track.track_type, 5)
                        track.inner_radius = current_radius
                    else:  # Reverse CDS (bottom)
                        track.inner_radius = track.linked_track.outer_radius
                        track.outer_radius = track.inner_radius + default_thickness.get(track.track_type, 5)
                    
                    # Update thickness
                    track.thickness = track.outer_radius - track.inner_radius
                    
                    # Move current radius
                    current_radius = track.outer_radius + 1
                    continue
                    
            # Get thickness for this track, either from track or default
            thickness = track.thickness or default_thickness.get(track.track_type, 5)
            
            # For all other tracks, set radii and increment
            track.inner_radius = current_radius
            track.outer_radius = current_radius + thickness
            track.thickness = thickness
            
            # Move to next radius position
            current_radius = track.outer_radius + 1  # Add 1 unit gap between tracks
    
    def update_preview(self, *args):
        """Update the circular preview using polygon shapes for filled rings with fix for GC tracks"""
        self.preview_canvas.delete("all")
        
        # Get canvas dimensions
        canvas_width = self.preview_canvas.winfo_width()
        canvas_height = self.preview_canvas.winfo_height()
        
        # Wait for canvas to be ready
        if canvas_width < 10 or canvas_height < 10:
            self.preview_canvas.after(100, self.update_preview)
            return
        
        # Calculate circle center and maximum radius
        center_x = canvas_width / 2
        center_y = canvas_height / 2
        max_radius = min(center_x, center_y) * 0.9 * self.scale_var.get()
        
        # Fill the background white
        self.preview_canvas.create_rectangle(0, 0, canvas_width, canvas_height, fill="white", outline="")
        
        # Sort tracks by position
        visible_tracks = [t for t in self.all_tracks if t.visible]
        
        # Sort tracks by outer radius in DESCENDING order 
        # (larger/outer tracks drawn first, then smaller/inner tracks on top)
        sorted_tracks = sorted(visible_tracks, key=lambda x: x.outer_radius, reverse=True)
        
        # Get the max outer radius to scale properly
        max_outer = max([t.outer_radius for t in sorted_tracks], default=100)
        
        # Helper function to calculate points on a circle
        def get_circle_points(radius, start_angle, end_angle, num_points=30):
            points = []
            angle_step = (end_angle - start_angle) / (num_points - 1) if num_points > 1 else 0
            for i in range(num_points):
                angle = start_angle + i * angle_step
                x = center_x + radius * math.cos(math.radians(angle))
                y = center_y + radius * math.sin(math.radians(angle))
                points.append((x, y))
            return points
        
        # Draw tracks
        for i, track in enumerate(sorted_tracks):
            # Map the track's actual index when sorted by position
            position_sorted = sorted(visible_tracks, key=lambda x: x.position)
            track_pos = position_sorted.index(track) + 1
            
            # Scale the radius to fit the canvas
            inner_radius = (track.inner_radius / max_outer) * max_radius
            outer_radius = (track.outer_radius / max_outer) * max_radius
            
            # Check if this is the selected track or linked to the selected track
            is_selected = (track is self.selected_track)
            is_linked_selected = False
            if track.track_type == "cds" and track.linked_track and track.options.get("linked", True):
                is_linked_selected = (track.linked_track is self.selected_track)
                
            outline_width = 2 if is_selected or is_linked_selected else 1
            outline_color = "red" if is_selected else ("blue" if is_linked_selected else "black")
            
            # Calculate thickness for display purposes
            thickness = outer_radius - inner_radius
            sector_size = 100000  # Default sector size for preview
            
            # For GC content and GC skew tracks, show two colors
            if track.track_type in ["gc_content", "gc_skew"]:
                # Get colors for positive and negative values
                pos_color = track.color
                neg_color = track.options.get("negative_color", 
                                "#888888" if track.track_type == "gc_content" else "#9932CC")
                
                # RIGHT HALF - POSITIVE VALUES (270° to 90°)
                # Create outer points from bottom to top (clockwise)
                outer_points_pos = get_circle_points(outer_radius, -90, 90, 30)  # -90° is bottom, 90° is top
                
                # Create inner points from top to bottom (counter-clockwise)
                inner_points_pos = get_circle_points(inner_radius, 90, -90, 30)  # Go back the other way
                
                # Combine points for complete polygon
                polygon_points_pos = outer_points_pos + inner_points_pos
                    
                # Create the polygon for right half
                if polygon_points_pos:
                    flat_points_pos = [coord for point in polygon_points_pos for coord in point]
                    self.preview_canvas.create_polygon(
                        flat_points_pos, 
                        fill=pos_color, 
                        outline=outline_color, 
                        width=outline_width
                    )
                
                # LEFT HALF - NEGATIVE VALUES (90° to 270°)
                # Create outer points from top to bottom (clockwise)
                outer_points_neg = get_circle_points(outer_radius, 90, 270, 30)  # 90° is top, 270° is bottom
                
                # Create inner points from bottom to top (counter-clockwise)
                inner_points_neg = get_circle_points(inner_radius, 270, 90, 30)  # Go back the other way
                
                # Combine points for complete polygon
                polygon_points_neg = outer_points_neg + inner_points_neg
                    
                # Create the polygon for left half
                if polygon_points_neg:
                    flat_points_neg = [coord for point in polygon_points_neg for coord in point]
                    self.preview_canvas.create_polygon(
                        flat_points_neg, 
                        fill=neg_color, 
                        outline=outline_color, 
                        width=outline_width
                    )
            elif track.track_type == "bed_graph":
                # For BED tracks, create segments with proper colors
                segments = track.options.get("segments", [])
                has_custom_colors = track.options.get("has_custom_colors", False)
                
                # Get background color (custom or default)
                bg_color = track.options.get("background_color", "#E0E0E0")
                
                # Create full 360° ring with polygon for the base track
                outer_points = get_circle_points(outer_radius, 0, 360, 60)
                inner_points = get_circle_points(inner_radius, 360, 0, 60)  # Reverse direction
                
                # Combine points for complete polygon
                polygon_points = outer_points + inner_points
                    
                # Create the polygon with custom background color - NO OUTLINE except when selected
                if polygon_points:
                    flat_points = [coord for point in polygon_points for coord in point]
                    self.preview_canvas.create_polygon(
                        flat_points, 
                        fill=bg_color,  # Use custom background color
                        outline=outline_color if (is_selected or is_linked_selected) else "",  # Only show outline when selected
                        width=outline_width if (is_selected or is_linked_selected) else 0
                    )
                
                # If there are segments and we have enough size to show them
                if segments and thickness > 3:
                    # Draw a few sample segments (not all to avoid cluttering preview)
                    sample_count = min(5, len(segments))
                    sample_segments = segments[:sample_count]
                    
                    for segment in sample_segments:
                        # Calculate angle spans for the segment
                        start_angle = (segment.start / sector_size) * 360
                        end_angle = (segment.end / sector_size) * 360
                        
                        if end_angle - start_angle < 3:  # Make very small segments visible
                            end_angle = start_angle + 3
                        
                        # Draw segment arc using a small polygon
                        color = segment.color if has_custom_colors else track.color
                        
                        # Create outer arc points
                        outer_segment = get_circle_points(outer_radius, start_angle, end_angle, 10)
                        
                        # Create inner arc points (reverse direction)
                        inner_segment = get_circle_points(inner_radius, end_angle, start_angle, 10)
                        
                        # Combine points for segment polygon
                        segment_points = outer_segment + inner_segment
                        
                        if segment_points:
                            flat_segment = [coord for point in segment_points for coord in point]
                            self.preview_canvas.create_polygon(
                                flat_segment,
                                fill=color,
                                outline=""  # No outline for segments
                            )
                
                # If there are too many segments, indicate this
                if len(segments) > sample_count:
                    avg_radius = (inner_radius + outer_radius) / 2
                    self.preview_canvas.create_text(
                        center_x + avg_radius * math.cos(math.radians(45)), 
                        center_y - avg_radius * math.sin(math.radians(45)),
                        text=f"{len(segments)} segments",
                        font=("Arial", 6),
                        fill="black"
                    )
            else:
                # For regular tracks, use single color ring
                # Create full 360° ring with polygon
                outer_points = get_circle_points(outer_radius, 0, 360, 60)
                inner_points = get_circle_points(inner_radius, 360, 0, 60)  # Reverse direction
                
                # Combine points for complete polygon
                polygon_points = outer_points + inner_points
                    
                # Create the polygon
                if polygon_points:
                    flat_points = [coord for point in polygon_points for coord in point]
                    self.preview_canvas.create_polygon(
                        flat_points, 
                        fill=track.color, 
                        outline=outline_color, 
                        width=outline_width
                    )
            
            # Calculate position for track name with a small white background
            thickness = outer_radius - inner_radius
            avg_radius = (inner_radius + outer_radius) / 2
            
            # Calculate different angles for different tracks to avoid overlap
            angle = 45 + (i * 10) % 60  # Vary the angle slightly for each track
            name_x = center_x + avg_radius * math.cos(math.radians(angle))
            name_y = center_y - avg_radius * math.sin(math.radians(angle))
            
            # Draw track name if there's enough space
            if thickness > 5:
                # Create small white background for the text
                text = f"{track_pos}. {track.name}"
                # For linked CDS tracks, add a link indicator
                if track.track_type == "cds" and track.linked_track and track.options.get("linked", True):
                    text += " \u2194"  # Add bidirectional arrow for linked tracks
                # For BED tracks with custom colors, add an indicator
                elif track.track_type == "bed_graph" and track.options.get("has_custom_colors", False):
                    text += " \u25A0"  # Add a small square to indicate custom colors
                
                text_width = len(text) * 5  # Approximate width
                text_height = 12
                
                self.preview_canvas.create_rectangle(
                    name_x - text_width/2, name_y - text_height/2,
                    name_x + text_width/2, name_y + text_height/2,
                    fill="white", outline=""
                )
                
                self.preview_canvas.create_text(
                    name_x, name_y, 
                    text=text, 
                    font=("Arial", min(8, int(thickness/2))),
                    fill="black"
                )
        
        # Draw title and explanation in center LAST (so they're on top)
        self.preview_canvas.create_rectangle(
            center_x - 60, center_y - 25,
            center_x + 60, center_y + 25,
            fill="white", outline=""
        )
        
        self.preview_canvas.create_text(
            center_x, center_y - 10, 
            text="Genome", 
            font=("Arial", 12, "bold")
        )
        self.preview_canvas.create_text(
            center_x, center_y + 10, 
            text="(Inner → Outer Tracks)", 
            font=("Arial", 8)
        )
        
        # Draw order direction indicator with white background
        arrow_length = 60
        arrow_start_x = center_x - arrow_length/2
        arrow_end_x = center_x + arrow_length/2
        
        self.preview_canvas.create_rectangle(
            arrow_start_x - 5, center_y + 25,
            arrow_end_x + 5, center_y + 50,
            fill="white", outline=""
        )
        
        # Draw arrow line
        self.preview_canvas.create_line(
            arrow_start_x, center_y + 30,
            arrow_end_x, center_y + 30,
            arrow=tk.LAST, width=2
        )
        self.preview_canvas.create_text(
            center_x, center_y + 45, 
            text="Track Order", 
            font=("Arial", 8)
        )

    def reset_to_default(self):
        """Reset track configuration to default settings"""
        # Reset positions
        for i, track in enumerate(self.all_tracks):
            track.position = i
        
        # Reset colors by track type
        gb_idx = 0
        for track in self.all_tracks:
            if track.track_type == "gb_file":
                track.color = self.default_colors["gb_file"][gb_idx % len(self.default_colors["gb_file"])]
                gb_idx += 1
            elif track.track_type == "gc_content":
                track.color = self.default_colors["gc_content"]
                track.options["negative_color"] = "#888888"
            elif track.track_type == "gc_skew":
                track.color = self.default_colors["gc_skew_pos"]
                track.options["negative_color"] = self.default_colors["gc_skew_neg"]
            elif track.track_type == "cds":
                if "forward" in track.name.lower():
                    track.color = self.default_colors["cds_fwd"]
                else:
                    track.color = self.default_colors["cds_rev"]
                
                # Reset CDS linking - default is linked
                if track.linked_track:
                    track.options["linked"] = True
                
            elif track.track_type == "ticks":
                track.color = self.default_colors["ticks"]
            elif track.track_type == "bed_graph" and not track.options.get("has_custom_colors", False):
                track.color = self.default_colors["bed_graph"]
            
            # Reset thickness based on track type
            if track.track_type == "ticks":
                track.update_thickness(1)
            elif track.track_type == "gc_content":
                track.update_thickness(10)
            elif track.track_type == "gc_skew":
                track.update_thickness(15)
            elif track.track_type == "cds":
                track.update_thickness(5)
            elif track.track_type == "gb_file":
                track.update_thickness(3)
            elif track.track_type == "bed_graph":
                track.update_thickness(5)
            else:
                track.update_thickness(5)
            
            # All tracks visible by default
            track.visible = True
        
        # Reset the selected track
        self.selected_track = None
        self.create_empty_options_panel()
        
        # Update track radii based on positions
        self.update_track_radii()
        
        # Refresh UI
        self.refresh_track_list()
        self.update_preview()
        self.check_for_changes()

    def apply_changes(self):
        """Apply changes and return to main window"""
        # Debug print
        print("\n--- Applying Track Changes ---")
        print(f"Returning {len(self.all_tracks)} tracks")
        for i, t in enumerate(self.all_tracks):
            print(f"Track {i}: {t.name}, inner={t.inner_radius}, outer={t.outer_radius}, id={id(t)}")
        
        self.callback(self.all_tracks)
        
        # Update the saved state to reflect that changes have been applied
        self.initial_track_state = self.save_track_state()
        self.check_for_changes()
        
        # Show confirmation message
        self.status_label.config(text="Changes applied successfully!", fg="green")
        self.status_label.after(2000, lambda: self.status_label.config(text="No changes detected", fg="gray"))
        
        # Debug message
        print("Changes applied!")
        self.destroy()

class TrackConfig:
    def __init__(self, file_path, color="#FF0000", position=0):
        self.file_path = file_path
        self.name = os.path.basename(file_path).split('.')[0]
        self.color = color
        self.position = position

class CustomLabelsManager(tk.Toplevel):
    """Manager for custom annotation labels with color support"""
    def __init__(self, master, custom_labels, callback):
        super().__init__(master)
        self.title("Custom Labels Manager")
        self.geometry("700x800")
        self.callback = callback
        # Make a deep copy to avoid reference issues
        self.custom_labels = []
        for label in custom_labels:
            if isinstance(label, tuple):
                self.custom_labels.append(list(label))
            else:
                self.custom_labels.append(label[:])
        
        # Create notebook for tabs
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=10)
        
        # View/Delete tab
        self.view_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.view_tab, text="View/Delete Labels")
        
        # Add New Label tab
        self.add_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.add_tab, text="Add New Label")
        
        # Batch Import tab
        self.import_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.import_tab, text="Import from File")
        
        # Set up each tab
        self.setup_view_tab()
        self.setup_add_tab()
        self.setup_import_tab()
        
        # Bottom buttons
        btn_frame = tk.Frame(self)
        btn_frame.pack(fill="x", padx=10, pady=10)
        
        tk.Button(btn_frame, text="Apply Changes", 
                 command=self.apply_changes,
                 bg="#4CAF50", fg="white").pack(side="right")
        
        tk.Button(btn_frame, text="Cancel", 
                 command=self.destroy).pack(side="right", padx=5)
    
    def setup_view_tab(self):
        """Set up the view/delete tab"""
        # Instructions
        instruction_frame = tk.Frame(self.view_tab, bg="#F0F8FF", bd=1, relief="solid")
        instruction_frame.pack(fill="x", pady=5, padx=5)
        
        instruction_text = (
            "• View and manage existing labels\n"
            "• Delete individual labels or clear all\n"
            "• Labels can have custom colors if imported with a 'hexcode_color' column\n"
            "• Labels will be displayed as text annotations, not as tick marks"
        )
        tk.Label(instruction_frame, text=instruction_text, justify="left", 
                bg="#F0F8FF", fg="#333333", padx=10, pady=5).pack(anchor="w")
        
        # Create list frame with scrollbar
        list_frame = tk.Frame(self.view_tab)
        list_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        scrollbar = tk.Scrollbar(list_frame)
        scrollbar.pack(side="right", fill="y")
        
        # Header frame
        header_frame = tk.Frame(list_frame)
        header_frame.pack(fill="x")
        
        tk.Label(header_frame, text="Position (bp)", width=15).pack(side="left")
        tk.Label(header_frame, text="Label", width=25).pack(side="left", expand=True, fill="x")
        tk.Label(header_frame, text="Color", width=8).pack(side="left")
        tk.Label(header_frame, text="Actions", width=10).pack(side="left")
        
        # Canvas for scrollable content
        self.canvas = tk.Canvas(list_frame)
        self.canvas.pack(side="left", fill="both", expand=True)
        
        scrollbar.config(command=self.canvas.yview)
        self.canvas.config(yscrollcommand=scrollbar.set)
        
        # Frame inside canvas for content
        self.labels_frame = tk.Frame(self.canvas)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.labels_frame, anchor="nw")
        
        self.labels_frame.bind("<Configure>", self.on_frame_configure)
        
        # Batch action buttons
        batch_frame = tk.Frame(self.view_tab)
        batch_frame.pack(fill="x", pady=5, padx=5)
        
        tk.Button(batch_frame, text="Delete All Labels", 
                 command=self.delete_all_labels,
                 fg="white", bg="#FF6347").pack(side="left", padx=5)
        
        # Stats label
        self.stats_label = tk.Label(self.view_tab, text="")
        self.stats_label.pack(pady=5)
        
        # Populate the list
        self.refresh_labels_list()
    
    def setup_add_tab(self):
        """Set up the add new label tab"""
        # Instructions
        instruction_frame = tk.Frame(self.add_tab, bg="#F0F8FF", bd=1, relief="solid")
        instruction_frame.pack(fill="x", pady=10, padx=20)
        
        instruction_text = (
            "• Add custom labels at specific positions in the genome\n"
            "• These will appear as text annotations on the circular visualization\n"
            "• Position must be a valid base pair position in the reference genome\n"
            "• You can select a custom color for each label"
        )
        tk.Label(instruction_frame, text=instruction_text, justify="left", 
                bg="#F0F8FF", fg="#333333", padx=10, pady=5).pack(anchor="w")
        
        # Form frame
        form_frame = tk.Frame(self.add_tab)
        form_frame.pack(fill="x", padx=20, pady=20)
        
        # Position input
        pos_frame = tk.Frame(form_frame)
        pos_frame.pack(fill="x", pady=10)
        
        tk.Label(pos_frame, text="Position (bp):").pack(side="left")
        self.position_var = tk.StringVar()
        tk.Entry(pos_frame, textvariable=self.position_var, width=20).pack(side="left", padx=5)
        
        # Label input
        label_frame = tk.Frame(form_frame)
        label_frame.pack(fill="x", pady=10)
        
        tk.Label(label_frame, text="Label Text:").pack(side="left")
        self.label_var = tk.StringVar()
        tk.Entry(label_frame, textvariable=self.label_var, width=40).pack(side="left", padx=5)
        
        # Color input
        color_frame = tk.Frame(form_frame)
        color_frame.pack(fill="x", pady=10)
        
        tk.Label(color_frame, text="Label Color:").pack(side="left")
        self.color_var = tk.StringVar(value="#000000")  # Default black
        color_entry = tk.Entry(color_frame, textvariable=self.color_var, width=10)
        color_entry.pack(side="left", padx=5)
        
        self.color_preview = tk.Button(color_frame, bg=self.color_var.get(), width=3, height=1,
                                    command=self.choose_color)
        self.color_preview.pack(side="left", padx=5)
        
        # Update color preview when entry changes
        self.color_var.trace("w", self.update_color_preview)
        
        # Add Label button
        btn_frame = tk.Frame(form_frame)
        btn_frame.pack(fill="x", pady=10)
        
        tk.Button(btn_frame, text="Add Label", 
                 command=self.add_new_label,
                 bg="#4682B4", fg="white").pack(pady=5)
    
    def update_color_preview(self, *args):
        """Update the color preview button"""
        try:
            color = self.color_var.get()
            if not color.startswith('#'):
                color = f"#{color}"
            self.color_preview.config(bg=color)
        except tk.TclError:
            # Invalid color, don't update preview
            pass
    
    def choose_color(self):
        """Open color chooser dialog"""
        color_tuple = colorchooser.askcolor(initialcolor=self.color_var.get())
        if color_tuple and color_tuple[1]:
            self.color_var.set(color_tuple[1])
            self.color_preview.config(bg=color_tuple[1])
    
    def setup_import_tab(self):
        """Set up the batch import tab"""
        # Instructions
        instruction_frame = tk.Frame(self.import_tab, bg="#F0F8FF", bd=1, relief="solid")
        instruction_frame.pack(fill="x", pady=10, padx=20)
        
        instruction_text = (
            "• Import labels from CSV or Excel files\n"
            "• File must have columns named 'position' and 'label'\n"
            "• Optional 'hexcode_color' column will be used for label colors\n"
            "• Position values must be valid base pair positions\n"
            "• Labels will appear as text annotations on the visualization"
        )
        tk.Label(instruction_frame, text=instruction_text, justify="left", 
                bg="#F0F8FF", fg="#333333", padx=10, pady=5).pack(anchor="w")
        
        # Import frame
        import_frame = tk.Frame(self.import_tab)
        import_frame.pack(fill="x", padx=20, pady=20)
        
        # File selection
        file_frame = tk.Frame(import_frame)
        file_frame.pack(fill="x", pady=10)
        
        self.file_label = tk.Label(file_frame, text="No file selected", width=40, anchor="w")
        self.file_label.pack(side="left", padx=5)
        
        tk.Button(file_frame, text="Browse", 
                 command=self.select_import_file).pack(side="right")
        
        # Import button
        btn_frame = tk.Frame(import_frame)
        btn_frame.pack(fill="x", pady=10)
        
        self.import_btn = tk.Button(btn_frame, text="Import Labels", 
                                  command=self.import_labels,
                                  state="disabled")
        self.import_btn.pack(pady=5)
        
        # Import status
        self.import_status = tk.Label(import_frame, text="")
        self.import_status.pack(pady=5)
    
    def on_frame_configure(self, event):
        """Handle frame configuration for scrolling"""
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
    
    def refresh_labels_list(self):
        """Refresh the labels list display"""
        # Clear existing items
        for widget in self.labels_frame.winfo_children():
            widget.destroy()
        
        # No labels message
        if not self.custom_labels:
            no_labels_frame = tk.Frame(self.labels_frame)
            no_labels_frame.pack(fill="x", pady=10)
            tk.Label(no_labels_frame, text="No custom labels defined. Add some labels to get started.", 
                    fg="#888888").pack()
            self.stats_label.config(text="0 custom labels")
            return
        
        # Sort labels by position
        sorted_labels = sorted(self.custom_labels, key=lambda x: x[0])
        
        # Add each label to the list
        for i, label_info in enumerate(sorted_labels):
            row_frame = tk.Frame(self.labels_frame)
            row_frame.pack(fill="x", pady=2)
            
            # Use alternating background colors
            bg_color = "#f8f8f8" if i % 2 == 0 else "white"
            row_frame.configure(bg=bg_color)
            
            # Unpack label info
            if len(label_info) >= 3:
                position, label, color = label_info
            else:
                position, label = label_info
                color = "#000000"  # Default black
            
            # Position
            tk.Label(row_frame, text=f"{int(position):,}", width=15, 
                    bg=bg_color).pack(side="left")
            
            # Label text
            tk.Label(row_frame, text=label, width=25, anchor="w", 
                    bg=bg_color).pack(side="left", expand=True, fill="x")
            
            # Color preview
            color_btn = tk.Button(row_frame, bg=color, width=3, height=1,
                                command=lambda pos=position, lbl=label, clr=color: 
                                         self.edit_label_color(pos, lbl, clr))
            color_btn.pack(side="left", padx=5)
            
            # Delete button
            tk.Button(row_frame, text="Delete", 
                     command=lambda pos=position, lbl=label, clr=color: 
                              self.delete_label(pos, lbl, clr)).pack(side="left")
        
        # Update stats
        self.stats_label.config(text=f"{len(self.custom_labels)} custom labels")
    
    def edit_label_color(self, position, label, current_color):
        """Edit the color of a specific label"""
        color_tuple = colorchooser.askcolor(initialcolor=current_color)
        if color_tuple and color_tuple[1]:
            # Find and update the label
            for i, label_info in enumerate(self.custom_labels):
                if len(label_info) >= 3:
                    pos, lbl, _ = label_info
                else:
                    pos, lbl = label_info
                    
                if pos == position and lbl == label:
                    self.custom_labels[i] = [position, label, color_tuple[1]]
                    break
            
            self.refresh_labels_list()
    
    def delete_label(self, position, label, color):
        """Delete a specific label"""
        self.custom_labels = [lbl for lbl in self.custom_labels 
                             if not (lbl[0] == position and lbl[1] == label)]
        self.refresh_labels_list()
    
    def delete_all_labels(self):
        """Delete all custom labels"""
        if messagebox.askyesno("Confirm Delete", "Are you sure you want to delete all custom labels?"):
            self.custom_labels = []
            self.refresh_labels_list()
    
    def add_new_label(self):
        """Add a new custom label"""
        try:
            # Get and validate position
            position = float(self.position_var.get())
            if position <= 0:
                messagebox.showerror("Error", "Position must be a positive number")
                return
            
            # Get and validate label
            label = self.label_var.get().strip()
            if not label:
                messagebox.showerror("Error", "Label text cannot be empty")
                return
            
            # Get and validate color
            color = self.color_var.get()
            if not color.startswith('#'):
                color = f"#{color}"
            
            try:
                # Validate color by creating a dummy widget
                dummy = tk.Button(self, bg=color)
                dummy.destroy()
            except tk.TclError:
                messagebox.showerror("Error", f"Invalid color code: {color}")
                return
            
            # Add the label with color as a list instead of tuple
            self.custom_labels.append([position, label, color])
            
            # Clear the inputs
            self.position_var.set("")
            self.label_var.set("")
            self.color_var.set("#000000")  # Reset to default black
            
            # Switch to view tab and refresh
            self.notebook.select(0)
            self.refresh_labels_list()
            
        except ValueError:
            messagebox.showerror("Error", "Position must be a valid number")
    
    def select_import_file(self):
        """Select a file to import labels from"""
        filename = filedialog.askopenfilename(
            title="Select CSV/Excel File for Custom Labels",
            filetypes=(("CSV files", "*.csv"), ("Excel files", "*.xlsx *.xls"), ("All files", "*.*"))
        )
        
        if filename:
            self.import_file = filename
            self.file_label.config(text=os.path.basename(filename))
            self.import_btn.config(state="normal")
    
    def import_labels(self):
        """Import labels from the selected file"""
        try:
            # Get file extension
            ext = os.path.splitext(self.import_file)[1].lower()
            
            # Read file based on extension
            if ext == ".csv":
                df = pd.read_csv(self.import_file)
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(self.import_file)
            else:
                messagebox.showerror("Error", "Unsupported file type")
                return
            
            # Validate columns
            if not {"position", "label"}.issubset(df.columns):
                messagebox.showerror("Error", "File must contain 'position' and 'label' columns")
                return
            
            # Convert positions to numeric and drop invalid rows
            df["position"] = pd.to_numeric(df["position"], errors="coerce")
            df = df.dropna(subset=["position"])
            
            # Check if hexcode_color column exists
            has_color = "hexcode_color" in df.columns
            
            # Extract labels
            new_labels = []
            for _, row in df.iterrows():
                if has_color and pd.notna(row["hexcode_color"]):
                    # Validate color
                    color = row["hexcode_color"]
                    if not isinstance(color, str):
                        color = str(color)
                    if not color.startswith('#'):
                        color = f"#{color}"
                    
                    try:
                        # Validate color by creating a dummy widget
                        dummy = tk.Button(self, bg=color)
                        dummy.destroy()
                        new_labels.append([row["position"], row["label"], color])
                    except tk.TclError:
                        # Invalid color, use default black
                        new_labels.append([row["position"], row["label"], "#000000"])
                else:
                    # No color specified, use default black
                    new_labels.append([row["position"], row["label"], "#000000"])
            
            # Add new labels to existing ones
            self.custom_labels.extend(new_labels)
            
            # Switch to view tab and refresh
            self.notebook.select(0)
            self.refresh_labels_list()
            
            # Show success message
            messagebox.showinfo("Success", f"{len(new_labels)} labels imported successfully")
            self.import_status.config(text=f"{len(new_labels)} labels imported successfully")
            
        except Exception as e:
            messagebox.showerror("Error", f"Error importing labels: {str(e)}")
            self.import_status.config(text=f"Error: {str(e)}")
    
    def apply_changes(self):
        """Apply changes and return to main window"""
        # Make sure custom_labels is a list of lists, not tuples
        formatted_labels = []
        for label in self.custom_labels:
            if isinstance(label, tuple):
                formatted_labels.append(list(label))
            else:
                formatted_labels.append(label)
                
        self.callback(formatted_labels)
        self.destroy()
        
class EnhancedFeatureSelectionWindow(tk.Toplevel):
    """Enhanced window for selecting features to label with pagination and keyword filtering"""
    def __init__(self, master, features_list, callback):
        super().__init__(master)
        self.title("Select Features for Labeling")
        self.geometry("1200x900")
        self.callback = callback
        self.features_list = features_list
        self.selected_features = []
        
        # Pagination variables
        self.page_size = 15
        self.current_page = 0
        self.total_pages = 0
        
        # Interesting keyword definitions
        self.interesting_keywords = [
            "polymerase", "replicase", "synthase", "transporter", 
            "kinase", "protease", "transcription", "translation",
            "ribosomal", "capsid", "membrane", "receptor", "toxin",
            "regulator", "transferase", "reductase", "integrase"
        ]
        self.keyword_filters = {keyword: tk.BooleanVar(value=False) for keyword in self.interesting_keywords}
        
        # Create UI
        main_frame = tk.Frame(self)
        main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Instructions
        instruction_frame = tk.Frame(main_frame, bg="#F0F8FF", bd=1, relief="solid")
        instruction_frame.pack(fill="x", pady=5)
        
        instruction_text = (
            "• Select features to label on the circular visualization\n"
            "• Use the tabs to switch between different views\n"
            "• Check specific keywords to filter by function"
        )
        tk.Label(instruction_frame, text=instruction_text, justify="left", 
                bg="#F0F8FF", fg="#333333", padx=10, pady=5).pack(anchor="w")
        
        # Initialize selection state for all features
        self.selection_state = {i: tk.BooleanVar(value=False) for i in range(len(self.features_list))}
        
        # Create notebook for tabs - This will be the main container
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(fill="both", expand=True, pady=5)
        
        # Setup each tab
        self.setup_search_tab()
        self.setup_function_keywords_tab()
        
        # Buttons
        button_frame = tk.Frame(self)
        button_frame.pack(fill="x", padx=10, pady=10)
        
        tk.Button(button_frame, text="Apply Selection", command=self.apply_selection, 
                 bg="#4CAF50", fg="white").pack(side="right", padx=5)
        
        tk.Button(button_frame, text="Cancel", command=self.destroy).pack(side="right", padx=5)
        
        # Bind tab change event to update the current view
        self.notebook.bind("<<NotebookTabChanged>>", self.on_tab_changed)
        
# All Features tab has been removed
    
    def setup_search_tab(self):
        """Setup the Search tab with its own complete view"""
        search_tab = ttk.Frame(self.notebook)
        self.notebook.add(search_tab, text="Text Search")
        
        # Search controls
        search_frame = tk.Frame(search_tab)
        search_frame.pack(fill="x", pady=5)
        
        tk.Label(search_frame, text="Search:").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace("w", lambda *args: self.apply_search_filter())
        tk.Entry(search_frame, textvariable=self.search_var, width=30).pack(side="left", padx=5)
        
        # Quick select buttons
        select_frame = tk.Frame(search_tab)
        select_frame.pack(fill="x", pady=5)
        
        tk.Button(select_frame, text="Select All Visible", 
                 command=lambda: self.select_all_visible("search")).pack(side="left", padx=5)
        tk.Button(select_frame, text="Select None", 
                 command=self.select_none).pack(side="left", padx=5)
        tk.Button(select_frame, text="Select All Matching Search", 
                 command=lambda: self.select_all_filtered("search"),
                 bg="#4682B4", fg="white").pack(side="left", padx=5)
        
        # Statistics display
        self.search_stats_frame = tk.Frame(search_tab)
        self.search_stats_frame.pack(fill="x", pady=5)
        
        self.search_total_stats_label = tk.Label(self.search_stats_frame, text="", anchor="w")
        self.search_total_stats_label.pack(side="left", padx=5)
        
        self.search_page_stats_label = tk.Label(self.search_stats_frame, text="", anchor="e")
        self.search_page_stats_label.pack(side="right", padx=5)
        
        # Feature list
        list_frame = tk.Frame(search_tab)
        list_frame.pack(fill="both", expand=True, pady=5)
        
        # Headers
        header_frame = tk.Frame(list_frame)
        header_frame.pack(fill="x")
        
        tk.Label(header_frame, text="Select", width=8).pack(side="left")
        tk.Label(header_frame, text="Position", width=12).pack(side="left")
        tk.Label(header_frame, text="Feature", width=50, anchor="w").pack(side="left", expand=True, fill="x")
        tk.Label(header_frame, text="Interesting", width=10).pack(side="left")
        
        # Scrollable list for current page
        self.search_features_frame = tk.Frame(list_frame)
        self.search_features_frame.pack(fill="both", expand=True)
        
        # Pagination controls
        pagination_frame = tk.Frame(search_tab)
        pagination_frame.pack(fill="x", pady=5)
        
        tk.Button(pagination_frame, text="< Previous", 
                 command=lambda: self.prev_page("search")).pack(side="left", padx=5)
        self.search_page_label = tk.Label(pagination_frame, text="Page 1 of 1")
        self.search_page_label.pack(side="left", padx=10)
        tk.Button(pagination_frame, text="Next >", 
                 command=lambda: self.next_page("search")).pack(side="left", padx=5)
        
        # Jump to page controls
        jump_frame = tk.Frame(pagination_frame)
        jump_frame.pack(side="right", padx=5)
        
        tk.Label(jump_frame, text="Jump to page:").pack(side="left")
        self.search_page_entry = tk.Entry(jump_frame, width=5)
        self.search_page_entry.pack(side="left", padx=5)
        tk.Button(jump_frame, text="Go", 
                 command=lambda: self.jump_to_page("search")).pack(side="left")
        
        # Store pagination variables for this tab
        self.search_current_page = 0
        self.search_filtered_features = []
    
    def setup_function_keywords_tab(self):
        """Setup the Function Keywords tab with its own complete view"""
        keywords_tab = ttk.Frame(self.notebook)
        self.notebook.add(keywords_tab, text="Function Keywords")
        
        # Keywords selection area
        keywords_control_frame = tk.Frame(keywords_tab)
        keywords_control_frame.pack(fill="x", pady=5)
        
        # Create scrollable frame for keywords
        keywords_canvas = tk.Canvas(keywords_control_frame, height=120)
        keywords_scrollbar = tk.Scrollbar(keywords_control_frame, orient="vertical", command=keywords_canvas.yview)
        keywords_scrollable = tk.Frame(keywords_canvas)
        
        keywords_scrollable.bind(
            "<Configure>",
            lambda e: keywords_canvas.configure(scrollregion=keywords_canvas.bbox("all"))
        )
        
        keywords_canvas.create_window((0, 0), window=keywords_scrollable, anchor="nw")
        keywords_canvas.configure(yscrollcommand=keywords_scrollbar.set)
        
        keywords_canvas.pack(side="left", fill="both", expand=True, padx=5, pady=5)
        keywords_scrollbar.pack(side="right", fill="y")
        
        # Create checkbox grid for keywords with 7 columns
        row, col = 0, 0
        for keyword in sorted(self.interesting_keywords):
            if col > 6:  # 7 columns (0-6)
                col = 0
                row += 1
            
            frame = tk.Frame(keywords_scrollable)
            frame.grid(row=row, column=col, sticky="w", padx=5, pady=2)
            
            # Calculate count for this keyword
            count = sum(1 for _, label, _ in self.features_list if keyword in label.lower())
            
            checkbox = tk.Checkbutton(
                frame, 
                text=f"{keyword.capitalize()} ({count})", 
                variable=self.keyword_filters[keyword],
                command=lambda kw=keyword: self.apply_keyword_filter()  # Use default argument to avoid closure issues
            )
            checkbox.pack(side="left")
            
            col += 1
        
        # Add buttons for keywords selection
        keyword_buttons = tk.Frame(keywords_control_frame)
        keyword_buttons.pack(fill="x", pady=5)
        
        tk.Button(keyword_buttons, text="Select All Keywords", 
                 command=self.select_all_keywords).pack(side="left", padx=5)
        tk.Button(keyword_buttons, text="Clear Keywords", 
                 command=self.clear_keywords).pack(side="left", padx=5)
        
        # Feature selection controls
        select_frame = tk.Frame(keywords_tab)
        select_frame.pack(fill="x", pady=5)
        
        tk.Button(select_frame, text="Select All Visible", 
                 command=lambda: self.select_all_visible("keywords")).pack(side="left", padx=5)
        tk.Button(select_frame, text="Select None", 
                 command=self.select_none).pack(side="left", padx=5)
        tk.Button(select_frame, text="Select All Matching Keywords", 
                 command=lambda: self.select_all_filtered("keywords"),
                 bg="#4682B4", fg="white").pack(side="left", padx=5)
        
        # Statistics display
        self.keywords_stats_frame = tk.Frame(keywords_tab)
        self.keywords_stats_frame.pack(fill="x", pady=5)
        
        self.keywords_total_stats_label = tk.Label(self.keywords_stats_frame, text="", anchor="w")
        self.keywords_total_stats_label.pack(side="left", padx=5)
        
        self.keywords_page_stats_label = tk.Label(self.keywords_stats_frame, text="", anchor="e")
        self.keywords_page_stats_label.pack(side="right", padx=5)
        
        # Feature list with scrollbar
        list_frame = tk.Frame(keywords_tab)
        list_frame.pack(fill="both", expand=True, pady=5)
        
        # Headers
        header_frame = tk.Frame(list_frame)
        header_frame.pack(fill="x")
        
        tk.Label(header_frame, text="Select", width=8).pack(side="left")
        tk.Label(header_frame, text="Position", width=12).pack(side="left")
        tk.Label(header_frame, text="Feature", width=50, anchor="w").pack(side="left", expand=True, fill="x")
        tk.Label(header_frame, text="Keywords", width=15).pack(side="left")
        
        # Scrollable list for current page
        self.keywords_features_frame = tk.Frame(list_frame)
        self.keywords_features_frame.pack(fill="both", expand=True)
        
        # Pagination controls
        pagination_frame = tk.Frame(keywords_tab)
        pagination_frame.pack(fill="x", pady=5)
        
        tk.Button(pagination_frame, text="< Previous", 
                 command=lambda: self.prev_page("keywords")).pack(side="left", padx=5)
        self.keywords_page_label = tk.Label(pagination_frame, text="Page 1 of 1")
        self.keywords_page_label.pack(side="left", padx=10)
        tk.Button(pagination_frame, text="Next >", 
                 command=lambda: self.next_page("keywords")).pack(side="left", padx=5)
        
        # Jump to page controls
        jump_frame = tk.Frame(pagination_frame)
        jump_frame.pack(side="right", padx=5)
        
        tk.Label(jump_frame, text="Jump to page:").pack(side="left")
        self.keywords_page_entry = tk.Entry(jump_frame, width=5)
        self.keywords_page_entry.pack(side="left", padx=5)
        tk.Button(jump_frame, text="Go", 
                 command=lambda: self.jump_to_page("keywords")).pack(side="left")
        
        # Store pagination variables for this tab
        self.keywords_current_page = 0
        self.keywords_filtered_features = []
    
    def on_tab_changed(self, event):
        """Handle tab change event"""
        tab_id = self.notebook.select()
        tab_name = self.notebook.tab(tab_id, "text")
        
        # Refresh the current tab
        if tab_name == "Text Search":
            self.apply_search_filter()
        elif tab_name == "Function Keywords":
            self.apply_keyword_filter()
    
# The populate_all_features method has been removed since the All Features tab is gone
    
    def apply_search_filter(self):
        """Apply text search filter"""
        search_text = self.search_var.get().lower()
        
        if not search_text:
            # If search is empty, show all features
            self.search_filtered_features = [(i, pos, label, is_interesting) 
                                            for i, (pos, label, is_interesting) in enumerate(self.features_list)]
        else:
            # Filter features based on search text
            self.search_filtered_features = [(i, pos, label, is_interesting) 
                                            for i, (pos, label, is_interesting) in enumerate(self.features_list)
                                            if search_text in label.lower()]
        
        # Calculate total pages
        self.search_total_pages = max(1, (len(self.search_filtered_features) + self.page_size - 1) // self.page_size)
        self.search_current_page = min(self.search_current_page, self.search_total_pages - 1)
        
        # Populate the page
        self.populate_current_page("search")
        self.update_stats("search")
    
    def apply_keyword_filter(self):
        """Apply keyword filter"""
        active_keywords = [kw for kw, var in self.keyword_filters.items() if var.get()]
        
        if not active_keywords:
            # If no keywords selected, show all features
            self.keywords_filtered_features = [(i, pos, label, []) 
                                              for i, (pos, label, is_interesting) in enumerate(self.features_list)]
        else:
            # Filter features based on selected keywords
            self.keywords_filtered_features = []
            
            for i, (pos, label, is_interesting) in enumerate(self.features_list):
                # Find matching keywords for this feature
                matching_keywords = [kw for kw in active_keywords if kw in label.lower()]
                
                # Only include if any selected keyword matches
                if matching_keywords:
                    self.keywords_filtered_features.append((i, pos, label, matching_keywords))
        
        # Calculate total pages
        self.keywords_total_pages = max(1, (len(self.keywords_filtered_features) + self.page_size - 1) // self.page_size)
        self.keywords_current_page = min(self.keywords_current_page, self.keywords_total_pages - 1)
        
        # Populate the page
        self.populate_current_page("keywords")
        self.update_stats("keywords")
    
    def populate_current_page(self, tab_name):
        """Populate the feature list for the specified tab with the current page"""
        # Determine which tab's elements to update
        if tab_name == "search":
            features_frame = self.search_features_frame
            current_page = self.search_current_page
            filtered_features = self.search_filtered_features
            page_label = self.search_page_label
            total_pages = self.search_total_pages
        elif tab_name == "keywords":
            features_frame = self.keywords_features_frame
            current_page = self.keywords_current_page
            filtered_features = self.keywords_filtered_features
            page_label = self.keywords_page_label
            total_pages = self.keywords_total_pages
        
        # Clear existing items
        for widget in features_frame.winfo_children():
            widget.destroy()
        
        # Get current page slice
        start_idx = current_page * self.page_size
        end_idx = min(start_idx + self.page_size, len(filtered_features))
        current_page_features = filtered_features[start_idx:end_idx]
        
        # Special handling for keywords tab which has different data structure
        is_keywords_tab = (tab_name == "keywords")
        
        # Populate with filtered items for current page
        for i, feature_data in enumerate(current_page_features):
            # Create row frame
            row_frame = tk.Frame(features_frame)
            row_frame.pack(fill="x", pady=1)
            
            if is_keywords_tab:
                # In keywords tab, we have (orig_idx, pos, label, matching_keywords)
                orig_idx, pos, label, matching_keywords = feature_data
                bg_color = "#fffacd"  # Light yellow for keyword matches
            else:
                # In search tab, we have (orig_idx, pos, label, is_interesting)
                orig_idx, pos, label, is_interesting = feature_data
                # Use alternating background colors
                bg_color = "#f8f8f8" if i % 2 == 0 else "white"
                if is_interesting:
                    bg_color = "#fffacd"  # Light yellow for interesting features
            
            row_frame.configure(bg=bg_color)
            
            # Checkbox for selection
            cb = tk.Checkbutton(
                row_frame, 
                variable=self.selection_state[orig_idx], 
                bg=bg_color,
                command=lambda t=tab_name: self.update_stats(t)
            )
            cb.pack(side="left", padx=2)
            
            # Position
            tk.Label(row_frame, text=f"{int(pos):,}", width=12, bg=bg_color).pack(side="left")
            
            # Feature label (truncated if too long)
            display_label = label
            if len(display_label) > 45:
                display_label = display_label[:42] + "..."
            
            label_widget = tk.Label(row_frame, text=display_label, anchor="w", 
                                  width=50, bg=bg_color)
            label_widget.pack(side="left", expand=True, fill="x")
            
            # Add tooltip for long labels
            if len(label) > 45:
                self.create_tooltip(label_widget, label)
            
            # Last column - different for keywords tab
            if is_keywords_tab:
                # Show matched keywords
                if isinstance(matching_keywords, list):
                    # This is the correct path - matching_keywords is a list
                    display_keywords = ", ".join(matching_keywords[:3] if len(matching_keywords) > 3 else matching_keywords)
                    if len(matching_keywords) > 3:
                        display_keywords += ", ..."
                        
                    keywords_label = tk.Label(row_frame, text=display_keywords, 
                                           width=15, bg=bg_color, anchor="w")
                    keywords_label.pack(side="left")
                    
                    # Add tooltip for all keywords if more than shown
                    if len(matching_keywords) > 3:
                        self.create_tooltip(keywords_label, ", ".join(matching_keywords))
                else:
                    # Fallback for old data structure
                    tk.Label(row_frame, text="✓", width=15, bg=bg_color).pack(side="left")
            else:
                # Interesting indicator for search tab
                tk.Label(row_frame, text="✓" if is_interesting else "", 
                        width=10, bg=bg_color).pack(side="left")
        
        # Update page label
        page_label.config(text=f"Page {current_page + 1} of {total_pages}")
    
    def create_tooltip(self, widget, text):
        """Create a simple tooltip for a widget"""
        def enter(event):
            x, y, _, _ = widget.bbox("insert")
            x += widget.winfo_rootx() + 25
            y += widget.winfo_rooty() + 25
            
            # Create tooltip window
            self.tooltip = tk.Toplevel(widget)
            self.tooltip.wm_overrideredirect(True)
            self.tooltip.wm_geometry(f"+{x}+{y}")
            
            label = tk.Label(self.tooltip, text=text, justify="left",
                           background="#ffffe0", relief="solid", borderwidth=1,
                           padx=5, pady=2)
            label.pack()
            
        def leave(event):
            if hasattr(self, "tooltip"):
                self.tooltip.destroy()
                
        widget.bind("<Enter>", enter)
        widget.bind("<Leave>", leave)
    
    def update_stats(self, tab_name):
        """Update statistics display for the specified tab"""
        total_features = len(self.features_list)
        selected_features = sum(1 for var in self.selection_state.values() if var.get())
        
        # Determine which tab's elements to update
        if tab_name == "search":
            total_stats_label = self.search_total_stats_label
            page_stats_label = self.search_page_stats_label
            filtered_features = self.search_filtered_features
            current_page = self.search_current_page
        elif tab_name == "keywords":
            total_stats_label = self.keywords_total_stats_label
            page_stats_label = self.keywords_page_stats_label
            filtered_features = self.keywords_filtered_features
            current_page = self.keywords_current_page
        
        # Update overall stats
        filtered_count = len(filtered_features)
        total_stats_label.config(
            text=f"Total: {total_features} features | Filtered: {filtered_count} | Selected: {selected_features}"
        )
        
        # Update page stats
        start_idx = current_page * self.page_size + 1
        end_idx = min(start_idx + self.page_size - 1, filtered_count)
        if filtered_features:
            page_stats_label.config(
                text=f"Showing {start_idx}-{end_idx} of {filtered_count}"
            )
        else:
            page_stats_label.config(text="No features to display")
    
    def select_all_visible(self, tab_name):
        """Select all features currently visible on the specified tab's page"""
        if tab_name == "search":
            current_page = self.search_current_page
            filtered_features = self.search_filtered_features
        elif tab_name == "keywords":
            current_page = self.keywords_current_page
            filtered_features = self.keywords_filtered_features
        
        start_idx = current_page * self.page_size
        end_idx = min(start_idx + self.page_size, len(filtered_features))
        
        for i in range(start_idx, end_idx):
            orig_idx = filtered_features[i][0]  # Original index is always the first element
            self.selection_state[orig_idx].set(True)
        
        self.update_stats(tab_name)
    
    def select_all_filtered(self, tab_name):
        """Select all features matching the current filter on the specified tab"""
        if tab_name == "search":
            filtered_features = self.search_filtered_features
        elif tab_name == "keywords":
            filtered_features = self.keywords_filtered_features
        
        for feature_data in filtered_features:
            orig_idx = feature_data[0]  # Original index is always the first element
            self.selection_state[orig_idx].set(True)
        
        self.update_stats(tab_name)
    
    def select_none(self):
        """Deselect all features"""
        for var in self.selection_state.values():
            var.set(False)
        
        # Update stats for all tabs
        self.update_stats("search")
        self.update_stats("keywords")
    
    def select_all_keywords(self):
        """Select all keyword filters"""
        for var in self.keyword_filters.values():
            var.set(True)
        
        self.apply_keyword_filter()
    
    def clear_keywords(self):
        """Clear all keyword filters"""
        for var in self.keyword_filters.values():
            var.set(False)
        
        self.apply_keyword_filter()
    
    def prev_page(self, tab_name):
        """Go to previous page for the specified tab"""
        if tab_name == "search":
            if self.search_current_page > 0:
                self.search_current_page -= 1
                self.populate_current_page(tab_name)
                self.update_stats(tab_name)
        elif tab_name == "keywords":
            if self.keywords_current_page > 0:
                self.keywords_current_page -= 1
                self.populate_current_page(tab_name)
                self.update_stats(tab_name)
    
    def next_page(self, tab_name):
        """Go to next page for the specified tab"""
        if tab_name == "search":
            if self.search_current_page < self.search_total_pages - 1:
                self.search_current_page += 1
                self.populate_current_page(tab_name)
                self.update_stats(tab_name)
        elif tab_name == "keywords":
            if self.keywords_current_page < self.keywords_total_pages - 1:
                self.keywords_current_page += 1
                self.populate_current_page(tab_name)
                self.update_stats(tab_name)
    
    def jump_to_page(self, tab_name):
        """Jump to specific page for the specified tab"""
        try:
            if tab_name == "search":
                page_num = int(self.search_page_entry.get())
                total_pages = self.search_total_pages
                if 1 <= page_num <= total_pages:
                    self.search_current_page = page_num - 1
                else:
                    messagebox.showerror("Error", f"Page number must be between 1 and {total_pages}")
                    return
            elif tab_name == "keywords":
                page_num = int(self.keywords_page_entry.get())
                total_pages = self.keywords_total_pages
                if 1 <= page_num <= total_pages:
                    self.keywords_current_page = page_num - 1
                else:
                    messagebox.showerror("Error", f"Page number must be between 1 and {total_pages}")
                    return
            
            self.populate_current_page(tab_name)
            self.update_stats(tab_name)
        except ValueError:
            messagebox.showerror("Error", "Please enter a valid page number")
    
    def apply_selection(self):
        """Apply selection and return selected features"""
        selected_features = []
        
        for i, (pos, label, _) in enumerate(self.features_list):
            if self.selection_state[i].get():
                selected_features.append((pos, label))
        
        self.callback(selected_features)
        self.destroy()

# Import additions for the updated class
import math
import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Union

class GenomeViewerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Genome Comparison Viewer")
        self.root.geometry("600x750")
        self.reference_gb = None
        self.comparison_gbs = []
        self.track_configs = []
        self.custom_labels = []
        self.selected_feature_labels = []
        
        # Enhanced track configuration
        self.all_tracks = []
        
        tk.Label(root, text="Genome Comparison Tool", font=("Arial", 16)).pack(pady=10)
        
        # Reference genome selection frame
        ref_frame = tk.Frame(root)
        ref_frame.pack(fill="x", padx=20, pady=5)
        tk.Label(ref_frame, text="Reference Genome:").pack(side="left")
        self.ref_label = tk.Label(ref_frame, text="No file selected", width=40, anchor="w")
        self.ref_label.pack(side="left", padx=10)
        tk.Button(ref_frame, text="Browse", command=self.select_reference).pack(side="right")
        
        # Comparison genomes selection frame
        comp_frame = tk.Frame(root)
        comp_frame.pack(fill="x", padx=20, pady=5)
        tk.Label(comp_frame, text="Comparison Genomes:").pack(side="left")
        self.comp_label = tk.Label(comp_frame, text="0 files selected", width=40, anchor="w")
        self.comp_label.pack(side="left", padx=10)
        tk.Button(comp_frame, text="Browse", command=self.select_comparisons).pack(side="right")
        
        # Settings frame - keep existing settings UI
        settings_frame = tk.Frame(root)
        settings_frame.pack(fill="x", padx=20, pady=10)
        
        # Left settings panel
        left_settings = tk.Frame(settings_frame)
        left_settings.pack(side="left", fill="y", padx=(0, 20))
        
        tk.Label(left_settings, text="Min Identity (%):").grid(row=0, column=0, sticky="w")
        self.min_identity_var = tk.StringVar(value="70")
        tk.Entry(left_settings, textvariable=self.min_identity_var, width=5).grid(row=0, column=1, sticky="w")
        
        tk.Label(left_settings, text="Ticks Interval (bp):").grid(row=1, column=0, sticky="w")
        self.ticks_interval_var = tk.StringVar(value="1000000")
        tk.Entry(left_settings, textvariable=self.ticks_interval_var, width=10).grid(row=1, column=1, sticky="w")
        
        tk.Label(left_settings, text="Image DPI:").grid(row=2, column=0, sticky="w")
        self.dpi_var = tk.StringVar(value="300")
        tk.Entry(left_settings, textvariable=self.dpi_var, width=5).grid(row=2, column=1, sticky="w")
        
        # Font size and default track width (will be overridden by track config)
        tk.Label(left_settings, text="Label Font Size:").grid(row=4, column=0, sticky="w")
        self.font_size_var = tk.StringVar(value="3")
        tk.Entry(left_settings, textvariable=self.font_size_var, width=5).grid(row=4, column=1, sticky="w")
        
        # Right settings panel
        right_settings = tk.Frame(settings_frame)
        right_settings.pack(side="left", fill="y")
        
        # CDS Display Options
        cds_frame = tk.LabelFrame(right_settings, text="CDS Display Options")
        cds_frame.pack(fill="x", pady=5)
        
        self.show_cds_var = tk.BooleanVar(value=False)
        self.show_cds_cb = tk.Checkbutton(
            cds_frame, 
            text="Show Reference CDS", 
            variable=self.show_cds_var,
            command=self.update_cds_options
        )
        self.show_cds_cb.pack(anchor="w", padx=5, pady=2)
        
        self.show_only_labeled_cds_var = tk.BooleanVar(value=False)
        self.show_only_labeled_cds_cb = tk.Checkbutton(
            cds_frame, 
            text="Show Only Labeled CDS", 
            variable=self.show_only_labeled_cds_var,
            state="disabled"
        )
        self.show_only_labeled_cds_cb.pack(anchor="w", padx=20, pady=2)
        
        self.use_arrow_shape_var = tk.BooleanVar(value=True)
        self.use_arrow_shape_cb = tk.Checkbutton(
            cds_frame, 
            text="Use Arrow Shape for CDS", 
            variable=self.use_arrow_shape_var,
            state="disabled"
        )
        self.use_arrow_shape_cb.pack(anchor="w", padx=20, pady=2)
        
        # GC content settings section
        gc_settings = tk.LabelFrame(right_settings, text="GC Content Settings")
        gc_settings.pack(fill="x", pady=5)
        
        # Binning size input
        binning_frame = tk.Frame(gc_settings)
        binning_frame.pack(fill="x", pady=2)
        tk.Label(binning_frame, text="Binning Size (bp):").pack(side="left", padx=5)
        self.binning_size_var = tk.StringVar(value="5000")
        tk.Entry(binning_frame, textvariable=self.binning_size_var, width=8).pack(side="left", padx=5)
        
        # Info button for binning size
        binning_info_btn = tk.Button(
            binning_frame, 
            text="i", 
            font=("Arial", 8, "bold"),
            width=2,
            command=lambda: show_info_popup(
                self.root,
                "Binning Size Information",
                "Binning Size determines the window size (in base pairs) used for calculating GC content and skew.\n\n"
                "Example: A binning size of 5000 means each point on the GC content and skew tracks represents the "
                "GC statistics for a 5000bp window of the genome.\n\n"
                "Larger values (e.g., 10000) produce smoother plots but may miss localized variations.\n"
                "Smaller values (e.g., 1000) show more detail but may appear noisy.\n\n"
                "For genomes < 100kb: try 500-1000\n"
                "For genomes 100kb-1Mb: try 1000-5000\n"
                "For genomes > 1Mb: try 5000-10000"
            )
        )
        binning_info_btn.pack(side="left")
        
        # Step size input
        step_frame = tk.Frame(gc_settings)
        step_frame.pack(fill="x", pady=2)
        tk.Label(step_frame, text="Step Size (bp):").pack(side="left", padx=5)
        self.step_size_var = tk.StringVar(value="1000")
        tk.Entry(step_frame, textvariable=self.step_size_var, width=8).pack(side="left", padx=5)
        
        # Info button for step size
        step_info_btn = tk.Button(
            step_frame, 
            text="i", 
            font=("Arial", 8, "bold"),
            width=2,
            command=lambda: show_info_popup(
                self.root,
                "Step Size Information",
                "Step Size determines how far to move the analysis window for each calculation of GC content and skew.\n\n"
                "Example: With a binning size of 5000 and a step size of 1000, the window moves 1000bp each time, "
                "creating overlapping bins for smoother plots.\n\n"
                "Smaller step sizes (relative to binning size) create smoother transitions but increase "
                "calculation time and may cause memory issues with large genomes.\n\n"
                "Recommendation: Set step size to 20-40% of the binning size, or larger for very big genomes."
            )
        )
        step_info_btn.pack(side="left")
        
        # Replace the old track config button with the enhanced one
        track_config_frame = tk.Frame(root)
        track_config_frame.pack(fill="x", padx=20, pady=5)
        
        # New enhanced track config button
        tk.Button(
            track_config_frame, 
            text="Configure All Tracks", 
            command=self.open_enhanced_track_config,
            bg="#4682B4", fg="white", font=("Arial", 10, "bold")
        ).pack(pady=5)
        
        # Label buttons frame
        label_buttons_frame = tk.Frame(root)
        label_buttons_frame.pack(fill="x", padx=20, pady=10)
        
        # Removed the "Upload Custom Labels" button
        
        tk.Button(label_buttons_frame, text="Manage Custom Labels", 
                 command=self.manage_custom_labels).pack(side="left", padx=5)
        
        tk.Button(label_buttons_frame, text="Select Features for Labeling", 
                 command=self.open_feature_selection_window).pack(side="left", padx=5)
        
        # Generate visualization button
        tk.Button(root, text="Generate Visualization", command=self.generate_visualization,
                bg="#4CAF50", fg="white", font=("Arial", 12)).pack(pady=20)
        
        # Status labels
        self.custom_label_status = tk.Label(root, text="No custom labels loaded")
        self.custom_label_status.pack()
        
        self.feature_label_status = tk.Label(root, text="No feature labels selected")
        self.feature_label_status.pack()
        
        self.track_config_status = tk.Label(root, text="No tracks configured")
        self.track_config_status.pack()
        
    def update_enhanced_track_configs(self, new_tracks):
        """Update track configurations from the enhanced window"""
        # Debug print
        print("\n--- Received Track Changes ---")
        print(f"Received {len(new_tracks)} tracks")
        for i, t in enumerate(new_tracks):
            print(f"Track {i}: {t.name}, inner={t.inner_radius}, outer={t.outer_radius}, id={id(t)}")
        
        # Check if we're receiving the same objects
        if hasattr(self, 'all_tracks') and self.all_tracks:
            if id(self.all_tracks) == id(new_tracks):
                print("Same track list object!")
            else:
                print("Different track list object!")
                
            # Check track objects
            old_ids = [id(t) for t in self.all_tracks]
            new_ids = [id(t) for t in new_tracks]
            if old_ids == new_ids:
                print("All track objects are the same!")
            else:
                print("Track objects changed!")
        
        # IMPORTANT: Use the returned track list directly
        self.all_tracks = new_tracks
        
        # Update the legacy track_configs for backward compatibility
        self.track_configs = []
        gb_tracks = [t for t in self.all_tracks if t.track_type == "gb_file"]
        
        for track in gb_tracks:
            if track.file_path:
                tc = TrackConfig(track.file_path, track.color, track.position)
                self.track_configs.append(tc)
        
        # Update status
        visible_tracks = [t for t in self.all_tracks if t.visible]
        self.track_config_status.config(text=f"{len(visible_tracks)} tracks visible out of {len(self.all_tracks)}")
        
        # Debug after update
        print("\n--- After Update ---")
        print(f"Current tracks: {len(self.all_tracks)}")
        for i, t in enumerate(self.all_tracks):
            print(f"Track {i}: {t.name}, inner={t.inner_radius}, outer={t.outer_radius}, id={id(t)}")

    def select_reference(self):
        """Select reference genome file"""
        filename = filedialog.askopenfilename(
            title="Select Reference GenBank File",
            filetypes=(("GenBank files", "*.gb *.gbk *.gbff"), ("All files", "*.*"))
        )
        if filename:
            self.reference_gb = filename
            self.ref_label.config(text=os.path.basename(filename))
            self.initialize_track_config()


    def select_comparisons(self):
        """Select comparison genome files"""
        filenames = filedialog.askopenfilenames(
            title="Select Comparison GenBank Files",
            filetypes=(("GenBank files", "*.gb *.gbk *.gbff"), ("All files", "*.*"))
        )
        if filenames:
            self.comparison_gbs = list(filenames)
            self.comp_label.config(text=f"{len(filenames)} files selected")
            
            # Initialize legacy track configs (compatibility with old code)
            self.track_configs = []
            for i, file_path in enumerate(self.comparison_gbs):
                default_colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", 
                                "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]
                color = default_colors[i % len(default_colors)]
                self.track_configs.append(TrackConfig(file_path, color, i))
            
            self.track_config_status.config(text=f"{len(self.track_configs)} tracks configured with default settings")
            
            # Initialize enhanced track configuration
            self.initialize_track_config()


    def update_cds_options(self):
        """Update CDS display options based on checkbox state"""
        if self.show_cds_var.get():
            self.show_only_labeled_cds_cb.config(state="normal")
            self.use_arrow_shape_cb.config(state="normal")
            
            # Check if we need to add CDS tracks
            has_cds_tracks = any(t.track_type == "cds" for t in self.all_tracks)
            if not has_cds_tracks and self.all_tracks:
                # Find position to insert CDS tracks (after GC content)
                insert_pos = 0
                for i, track in enumerate(self.all_tracks):
                    if track.track_type == "gc_content":
                        insert_pos = i + 1
                        break
                
                # Add special options for linking CDS tracks
                cds_options = {
                    "linked": True,  # Default to linked
                    "strand": 1
                }
                
                # Insert CDS forward track
                fwd_track = TrackInfo(
                    name="CDS Forward",
                    track_type="cds",
                    inner_radius=75,
                    outer_radius=80,
                    color="#FA8072",  # Salmon
                    position=insert_pos,
                    options=cds_options.copy()
                )
                self.all_tracks.insert(insert_pos, fwd_track)
                
                # Insert CDS reverse track
                rev_options = cds_options.copy()
                rev_options["strand"] = -1
                rev_track = TrackInfo(
                    name="CDS Reverse",
                    track_type="cds",
                    inner_radius=70,
                    outer_radius=75,
                    color="#87CEEB",  # Light blue
                    position=insert_pos + 1,
                    options=rev_options
                )
                self.all_tracks.insert(insert_pos + 1, rev_track)
                
                # Reorder positions
                for i, track in enumerate(self.all_tracks):
                    track.position = i
        else:
            self.show_only_labeled_cds_var.set(False)
            self.show_only_labeled_cds_cb.config(state="disabled")
            self.use_arrow_shape_cb.config(state="disabled")
            
            # Remove CDS tracks if they exist
            self.all_tracks = [t for t in self.all_tracks if t.track_type != "cds"]
            
            # Reorder positions
            for i, track in enumerate(self.all_tracks):
                track.position = i

    def upload_custom_labels(self):
        filename = filedialog.askopenfilename(
            title="Select CSV/Excel File for Custom Labels",
            filetypes=(("CSV files", "*.csv"), ("Excel files", "*.xlsx *.xls"), ("All files", "*.*"))
        )
        if not filename:
            return
        try:
            ext = os.path.splitext(filename)[1].lower()
            if ext == ".csv":
                df = pd.read_csv(filename)
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(filename)
            else:
                messagebox.showerror("Error", "Unsupported file type.")
                return
            if not {"position", "label"}.issubset(df.columns):
                messagebox.showerror("Error", "File must contain 'position' and 'label' columns.")
                return
            df["position"] = pd.to_numeric(df["position"], errors="coerce")
            df = df.dropna(subset=["position"])
            self.custom_labels = list(zip(df["position"].tolist(), df["label"].tolist()))
            self.custom_label_status.config(text=f"{len(self.custom_labels)} custom labels loaded")
            messagebox.showinfo("Success", f"{len(self.custom_labels)} custom labels loaded.")
            
            # Update track config
            self.initialize_track_config()
        except Exception as e:
            messagebox.showerror("Error", f"Error loading custom labels: {str(e)}")

    def manage_custom_labels(self):
        if not hasattr(self, 'custom_labels'):
            self.custom_labels = []
        CustomLabelsManager(self.root, self.custom_labels, self.update_custom_labels)

    def set_feature_labels(self, selected_labels):
        """Update the selected feature labels from the feature selection window"""
        self.selected_feature_labels = selected_labels
        self.feature_label_status.config(text=f"{len(selected_labels)} feature labels selected")
        # Update track config
        self.initialize_track_config()

    def update_custom_labels(self, updated_labels):
        """Update custom labels from the labels manager"""
        self.custom_labels = updated_labels
        self.custom_label_status.config(text=f"{len(self.custom_labels)} custom labels loaded")
        # Update track config
        self.initialize_track_config()

    def open_feature_selection_window(self):
        if not self.reference_gb:
            messagebox.showerror("Error", "Please select a reference genome file first.")
            return
        try:
            records = list(SeqIO.parse(self.reference_gb, "genbank"))
            features_list = []
            interesting_keywords = [
                "polymerase", "replicase", "synthase", "transporter", 
                "kinase", "protease", "transcription", "translation",
                "ribosomal", "capsid", "membrane", "receptor", "toxin",
                "regulator", "transferase", "reductase", "integrase"
            ]
            for rec in records:
                for feature in rec.features:
                    if feature.type == "CDS":
                        start = int(feature.location.start)
                        end = int(feature.location.end)
                        label = feature.qualifiers.get("product", [""])[0]
                        if label == "" or label.lower().startswith("hypothetical"):
                            continue
                        is_interesting = any(keyword in label.lower() for keyword in interesting_keywords)
                        pos = (start + end) / 2
                        features_list.append((pos, label, is_interesting))
            if not features_list:
                messagebox.showinfo("Info", "No valid CDS features found for labeling.")
                return
            EnhancedFeatureSelectionWindow(self.root, features_list, self.set_feature_labels)
        except Exception as e:
            messagebox.showerror("Error", f"Error processing reference genome: {str(e)}")

    def generate_visualization(self):
        """Generate the circular visualization with the configured tracks"""
        if not self.reference_gb:
            messagebox.showerror("Error", "Please select a reference genome file")
            return
            
        if not self.comparison_gbs:
            messagebox.showerror("Error", "Please select at least one comparison genome file")
            return
            
        try:
            # Get settings from UI
            min_identity = float(self.min_identity_var.get())
            ticks_interval = int(self.ticks_interval_var.get())
            dpi = int(self.dpi_var.get())
            font_size = int(self.font_size_var.get())
            binning_size = int(self.binning_size_var.get())
            step_size = int(self.step_size_var.get())
            
            # Validate values
            if dpi <= 0 or font_size <= 0 or binning_size <= 0 or step_size <= 0:
                messagebox.showerror("Error", "DPI, Font Size, Binning Size, and Step Size must be positive numbers")
                return
                
            if step_size > binning_size:
                if not messagebox.askyesno("Warning", "Step Size is larger than Binning Size, which may cause gaps in the GC content analysis. Continue anyway?"):
                    return
        except ValueError:
            messagebox.showerror("Error", "Invalid settings values")
            return

        self.root.config(cursor="wait")
        self.root.update()
        
        try:
            from pycirclize import Circos
            
            # Get target name for output files
            target_name = os.path.basename(self.reference_gb).split('.')[0]
            
            # Create track color mapping for compatibility with original function
            track_colors = {}
            comparison_order = []
            
            # If we're using enhanced track config, extract GB file tracks
            if self.all_tracks:
                # Filter visible tracks that are genome comparisons
                visible_gb_tracks = [t for t in self.all_tracks if t.track_type == "gb_file" and t.visible]
                sorted_tracks = sorted(visible_gb_tracks, key=lambda x: x.position)
                
                for track in sorted_tracks:
                    if track.file_path:
                        track_colors[track.file_path] = track.color
                        comparison_order.append(track.file_path)
            else:
                # Fall back to legacy track config
                sorted_tracks = sorted(self.track_configs, key=lambda x: x.position)
                for tc in sorted_tracks:
                    track_colors[tc.file_path] = tc.color
                    comparison_order.append(tc.file_path)
            
            # Create the visualization
            fig = create_circular_comparison(
                self.reference_gb, 
                comparison_order,
                track_colors=track_colors,
                min_identity=min_identity,
                ticks_interval=ticks_interval,
                custom_labels_csv=self.custom_labels,
                custom_labels_interactive=self.selected_feature_labels,
                track_width=2.5,  # Default value, will be overridden by track config
                font_size=font_size,
                show_cds=self.show_cds_var.get(),
                show_only_labeled_cds=self.show_only_labeled_cds_var.get(),
                use_arrow_shape=self.use_arrow_shape_var.get(),
                binning_size=binning_size,
                step_size=step_size,
                # Pass enhanced track config if available
                enhanced_tracks=self.all_tracks if self.all_tracks else None
            )
            
            # Save the figure
            save_path = filedialog.asksaveasfilename(
                title="Save Visualization",
                defaultextension=".png",
                filetypes=(("PNG", "*.png"), ("PDF", "*.pdf"), ("All files", "*.*"))
            )
            
            if save_path:
                # Get legend path
                legend_path = str(Path.home() / "Downloads" / f"{target_name}_legend.png")
                
                # Save the figure
                fig.savefig(save_path, dpi=dpi)
                messagebox.showinfo(
                    "Success", 
                    f"Visualization saved to {save_path} with DPI {dpi}\nLegend saved to {legend_path}"
                )
                plt.show()
                
        except Exception as e:
            messagebox.showerror("Error", f"Error generating visualization: {str(e)}")
            raise  # Re-raise for debugging
        finally:
            self.root.config(cursor="")

    def initialize_track_config(self):
        """Initialize the enhanced track configuration"""
        # Only initialize if we have both reference and comparison genomes
        if not self.reference_gb or not self.comparison_gbs:
            return
            
        # Start with a clean slate
        self.all_tracks = []
        position = 0
        
        # Add tracks in default order (radius values are just initial defaults)
        # Ticks track
        self.all_tracks.append(TrackInfo(
            name="Ticks",
            track_type="ticks",
            inner_radius=39.75,
            outer_radius=40,
            color="#000000",
            position=position
        ))
        position += 1
        
        # GC Skew track
        self.all_tracks.append(TrackInfo(
            name="GC Skew",
            track_type="gc_skew",
            inner_radius=40,
            outer_radius=55,
            color="#228B22",  # Green for positive skew
            position=position,
            options={"variant": "positive"}
        ))
        position += 1
        
        # GC Content track
        self.all_tracks.append(TrackInfo(
            name="GC Content",
            track_type="gc_content",
            inner_radius=60,
            outer_radius=70,
            color="#333333",
            position=position
        ))
        position += 1
        
        # CDS track if enabled
        if self.show_cds_var.get():
            self.all_tracks.append(TrackInfo(
                name="CDS Forward",
                track_type="cds",
                inner_radius=75,
                outer_radius=80,
                color="#FA8072",  # Salmon
                position=position,
                options={"strand": 1}
            ))
            position += 1
            
            self.all_tracks.append(TrackInfo(
                name="CDS Reverse",
                track_type="cds",
                inner_radius=70,
                outer_radius=75,
                color="#87CEEB",  # Light blue
                position=position,
                options={"strand": -1}
            ))
            position += 1
        
        # Comparison genome tracks
        default_colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", 
                         "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]
        track_height = 2.5  # Default track height
        min_r_pos = 100
        
        for i, gb_file in enumerate(self.comparison_gbs):
            color = default_colors[i % len(default_colors)]
            
            # For comparison tracks, use the existing position from track_configs if available
            track_position = position
            for tc in self.track_configs:
                if tc.file_path == gb_file:
                    color = tc.color
                    track_position = tc.position
                    break
            
            # Create new track
            self.all_tracks.append(TrackInfo(
                name=os.path.basename(gb_file).split('.')[0],
                track_type="gb_file",
                inner_radius=min_r_pos - track_height,
                outer_radius=min_r_pos,
                color=color,
                position=track_position,
                file_path=gb_file
            ))
            min_r_pos -= track_height
            position += 1
        
        # Custom labels track (always last/outermost)
        if self.custom_labels or self.selected_feature_labels:
            outer_radius = 100
            inner_radius = outer_radius - 10
            
            self.all_tracks.append(TrackInfo(
                name="Custom Labels",
                track_type="labels",
                inner_radius=inner_radius,
                outer_radius=outer_radius,
                color="#E0E0E0",  # Light gray
                position=position
            ))
        
        # Update status
        self.track_config_status.config(text=f"{len(self.all_tracks)} tracks configured")




    def open_enhanced_track_config(self):
        """Open the enhanced track configuration window"""
        if not self.all_tracks:
            messagebox.showerror("Error", "No tracks configured. Please select reference and comparison genomes first.")
            return
        
        print("\n--- Opening Track Config Window ---")
        print(f"Passing {len(self.all_tracks)} tracks")
        for i, t in enumerate(self.all_tracks):
            print(f"Track {i}: {t.name}, inner={t.inner_radius}, outer={t.outer_radius}, id={id(t)}")
            
        # Store initial track state for comparison
        initial_track_state = []
        for track in self.all_tracks:
            track_state = {
                'name': track.name,
                'track_type': track.track_type,
                'inner_radius': track.inner_radius,
                'outer_radius': track.outer_radius,
                'thickness': track.thickness,
                'color': track.color,
                'visible': track.visible,
                'position': track.position
            }
            initial_track_state.append(track_state)
        
        # Create and show the configuration window
        EnhancedTrackConfigWindow(self.root, self.all_tracks, self.update_enhanced_track_configs)

class TrackConfigWindow(tk.Toplevel):
    def __init__(self, master, track_configs, callback):
        super().__init__(master)
        self.title("Configure Comparison Tracks")
        self.geometry("600x800")
        self.callback = callback
        self.track_configs = track_configs
        main_frame = tk.Frame(self)
        main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        header_frame = tk.Frame(main_frame)
        header_frame.pack(fill="x", pady=5)
        tk.Label(header_frame, text="Position", width=10).pack(side="left")
        tk.Label(header_frame, text="Track Name", width=25).pack(side="left")
        tk.Label(header_frame, text="Color", width=10).pack(side="left")
        tk.Label(header_frame, text="Actions", width=20).pack(side="left")
        self.canvas = tk.Canvas(main_frame)
        scrollbar = tk.Scrollbar(main_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas)
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        control_frame = tk.Frame(self)
        control_frame.pack(fill="x", padx=10, pady=10)
        tk.Button(control_frame, text="Apply Changes", command=self.apply_changes).pack(side="right", padx=5)
        tk.Button(control_frame, text="Reset to Default", command=self.reset_to_default).pack(side="right", padx=5)
        self.refresh_track_list()
    
    def refresh_track_list(self):
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        sorted_tracks = sorted(self.track_configs, key=lambda x: x.position)
        for i, track in enumerate(sorted_tracks):
            frame = tk.Frame(self.scrollable_frame)
            frame.pack(fill="x", pady=2)
            pos_label = tk.Label(frame, text=f"{track.position + 1}", width=10)
            pos_label.pack(side="left")
            name_label = tk.Label(frame, text=track.name, width=25, anchor="w")
            name_label.pack(side="left")
            color_btn = tk.Button(
                frame, 
                bg=track.color, 
                width=5, 
                command=lambda t=track: self.choose_color(t)
            )
            color_btn.pack(side="left", padx=5)
            move_up_btn = tk.Button(
                frame, 
                text="▲", 
                command=lambda t=track: self.move_track_up(t),
                state="disabled" if i == 0 else "normal"
            )
            move_up_btn.pack(side="left", padx=2)
            move_down_btn = tk.Button(
                frame, 
                text="▼", 
                command=lambda t=track: self.move_track_down(t),
                state="disabled" if i == len(sorted_tracks) - 1 else "normal"
            )
            move_down_btn.pack(side="left", padx=2)
            hex_var = tk.StringVar(value=track.color)
            hex_entry = tk.Entry(frame, textvariable=hex_var, width=8)
            hex_entry.pack(side="left", padx=5)
            tk.Button(
                frame, 
                text="✓", 
                command=lambda t=track, var=hex_var: self.update_color_from_hex(t, var.get())
            ).pack(side="left")
    
    def choose_color(self, track):
        color_tuple = colorchooser.askcolor(initialcolor=track.color)
        if color_tuple and color_tuple[1]:
            track.color = color_tuple[1]
            self.refresh_track_list()
    
    def update_color_from_hex(self, track, hex_value):
        try:
            if not hex_value.startswith('#'):
                hex_value = '#' + hex_value
            if len(hex_value) not in (4, 7, 9):
                raise ValueError("Invalid hex code length")
            tk.Button(self, bg=hex_value).destroy()
            track.color = hex_value
            self.refresh_track_list()
        except Exception as e:
            messagebox.showerror("Error", f"Invalid hex color code: {str(e)}")
    
    def move_track_up(self, track):
        target_position = track.position - 1
        for t in self.track_configs:
            if t.position == target_position:
                t.position, track.position = track.position, t.position
                break
        self.refresh_track_list()
    
    def move_track_down(self, track):
        target_position = track.position + 1
        for t in self.track_configs:
            if t.position == target_position:
                t.position, track.position = track.position, t.position
                break
        self.refresh_track_list()
    
    def reset_to_default(self):
        for i, track in enumerate(self.track_configs):
            track.position = i
        default_colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", 
                          "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]
        for i, track in enumerate(self.track_configs):
            track.color = default_colors[i % len(default_colors)]
        self.refresh_track_list()
    
    def apply_changes(self):
        self.callback(self.track_configs)
        self.destroy()


def create_circular_comparison(target_gb_file, comparison_gb_files, track_colors=None, min_identity=70,  
                              ticks_interval=100000, custom_labels_csv=None, custom_labels_interactive=None,
                              track_width=2.5, font_size=7, show_cds=False, show_only_labeled_cds=False,
                              use_arrow_shape=True, binning_size=5000, step_size=1000, enhanced_tracks=None):
    """
    Create a circular genome comparison visualization with enhanced track configuration support.
    
    Parameters:
    -----------
    target_gb_file : str
        Path to the reference genome in GenBank format
    comparison_gb_files : list
        List of paths to comparison genomes in GenBank format
    track_colors : dict, optional
        Dictionary mapping file paths to colors (for backward compatibility)
    min_identity : float, optional
        Minimum sequence identity percentage for BLAST hits
    ticks_interval : int, optional
        Interval in base pairs for tick marks
    custom_labels_csv : list, optional
        List of custom labels loaded from CSV/Excel
    custom_labels_interactive : list, optional
        List of custom labels selected interactively
    track_width : float, optional
        Default width of each track (legacy parameter)
    font_size : int, optional
        Size of label fonts
    show_cds : bool, optional
        Whether to show CDS features
    show_only_labeled_cds : bool, optional
        Whether to show only labeled CDS features
    use_arrow_shape : bool, optional
        Whether to use arrow shapes for CDS features
    binning_size : int, optional
        Window size for GC content/skew analysis
    step_size : int, optional
        Step size for GC content/skew analysis
    enhanced_tracks : list, optional
        List of TrackInfo objects with enhanced configuration
        
    Returns:
    --------
    matplotlib.figure.Figure
        The figure object containing the visualization
    """
    import os
    import numpy as np
    from pycirclize import Circos, config
    from pygenomeviz.parser import Fasta
    from pygenomeviz.utils import ColorCycler
    from pygenomeviz.align import AlignCoord, Blast
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    import matplotlib.colors as mcolors
    import matplotlib.pyplot as plt

    # Store all custom labels with their colors for post-processing
    all_custom_labels = []
    if custom_labels_csv:
        all_custom_labels.extend(custom_labels_csv)
    if custom_labels_interactive:
        all_custom_labels.extend(custom_labels_interactive)
    
    # Create a dictionary mapping label text to color for easy lookup later
    label_color_map = {}
    for label_info in all_custom_labels:
        if len(label_info) >= 3:
            text = label_info[1]
            color = label_info[2]
            label_color_map[text] = color

    # Define helper function for BED graph tracks
    def create_bed_graph_track(sector, track_info):
        """Create a BED graph track with proper background color"""
        # Create the track using the configured radii
        bed_track = sector.add_track((track_info.inner_radius, track_info.outer_radius))
        
        # Apply the background color from track options with no border
        background_color = track_info.options.get("background_color", "#E0E0E0")
        bed_track.axis(fc=background_color, ec="none")  # Set ec="none" to remove the border
        
        # Add each segment
        segments = track_info.options.get("segments", [])
        has_custom_colors = track_info.options.get("has_custom_colors", False)
        
        for segment in segments:
            if segment.start < sector.size and segment.end > 0:
                # Ensure segment is within sector bounds
                start = max(0, segment.start)
                end = min(sector.size, segment.end)
                
                # Use segment color if custom colors are enabled, otherwise use track color
                color = segment.color if has_custom_colors else track_info.color
                
                # Add ec="none" to remove the border around segments
                bed_track.rect(start, end, fc=color, ec="none")
        
        return bed_track


    # Enable annotation adjustments for pycirclize
    config.ann_adjust.enable = True

    # Set up track colors for backward compatibility
    if track_colors is None:
        ColorCycler.set_cmap("Set1")
        track_colors = {}

    # Convert target Genbank file to FASTA and load records
    target_fasta_file, target_records, original_target_name = genbank_to_fasta(target_gb_file)
    target_name = os.path.basename(target_gb_file).split('.')[0]
    target_seqid2size = {rec.id: len(rec.seq) for rec in target_records}
    target_genome_length = sum(target_seqid2size.values())
    target_fasta = Fasta(target_fasta_file)

    # Initialize the circos plot with sectors
    circos = Circos(
        sectors=target_seqid2size,
        space=0 if len(target_seqid2size) == 1 else 2,
    )
    circos.text(f"{original_target_name}\n({target_genome_length:,} bp)", size=13)

    # Print track colors used for debugging
    print("Track colors being used:")
    for path, color in track_colors.items():
        print(f"  {os.path.basename(path)}: {color}")

    # Default colors
    default_colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", 
                      "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]
    
    # Create mapping for track information
    comp_name2color = {}
    
    # Configure based on enhanced track information if available
    if enhanced_tracks is not None and len(enhanced_tracks) > 0:
        print("Using enhanced track configuration with", len(enhanced_tracks), "tracks")
        
        # Only use visible tracks
        visible_tracks = [t for t in enhanced_tracks if t.visible]
        
        # Sort tracks by position
        sorted_tracks = sorted(visible_tracks, key=lambda x: x.position)
        
        # Process each record
        for rec in target_records:
            sequence = str(rec.seq)
            sector = circos.get_sector(rec.id)
            
            # Track specific operations
            for track in sorted_tracks:
                # Process comparison genome tracks
                if track.track_type == "gb_file" and track.file_path in comparison_gb_files:
                    comp_fasta_file, comp_records, original_comp_name = genbank_to_fasta(track.file_path)
                    comp_fasta = Fasta(comp_fasta_file)
                    align_coords = Blast([target_fasta, comp_fasta]).run()
                    align_coords = AlignCoord.filter(align_coords, identity_thr=min_identity)
                    comp_name2color[original_comp_name] = track.color
                    
                    # Create track in the sector
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius), r_pad_ratio=0.1)
                    
                    # Add alignments
                    for ac in align_coords:
                        if ac.query_name == rec.id:
                            track_obj.rect(ac.query_start, ac.query_end, color=track.color)
                
                # Process tick marks
                elif track.track_type == "ticks":
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius))
                    track_obj.axis(fc=track.color)
                    if sector.size >= ticks_interval:
                        track_obj.xticks_by_interval(
                            ticks_interval,
                            outer=False,
                            label_formatter=lambda v: f"{int(v/1000)} kbp",
                            label_orientation="vertical",
                        )
                
                # Process GC content
                elif track.track_type == "gc_content":
                    positions = []
                    gc_contents = []
                    
                    if len(sequence) < binning_size:
                        window = sequence.upper()
                        g = window.count('G')
                        c = window.count('C')
                        a = window.count('A')
                        t = window.count('T')
                        total_bases = g + c + a + t
                        gc_content = (g + c) / total_bases * 100 if total_bases > 0 else 0
                        positions.append(len(sequence) // 2)
                        gc_contents.append(gc_content)
                    else:
                        # Extend sequence to account for circular wrap-around
                        extended_seq = sequence + sequence[:binning_size]
                        for i in range(0, len(sequence), step_size):
                            window = extended_seq[i:i+binning_size].upper()
                            g = window.count('G')
                            c = window.count('C')
                            a = window.count('A')
                            t = window.count('T')
                            total_bases = g + c + a + t
                            gc_content = (g + c) / total_bases * 100 if total_bases > 0 else 0
                            pos = (i + binning_size // 2) % len(sequence)
                            positions.append(pos)
                            gc_contents.append(gc_content)
                        # Ensure the positions are in order around the circle
                        positions, gc_contents = zip(*sorted(zip(positions, gc_contents)))
                    
                    # Compute genome-wide average GC content
                    total_g = sequence.upper().count('G')
                    total_c = sequence.upper().count('C')
                    genome_gc_content = (total_g + total_c) / len(sequence) * 100
                    
                    # Adjust window GC contents by subtracting the genome average
                    adjusted_gc_contents = np.array(gc_contents) - genome_gc_content
                    
                    # Separate positive and negative deviations
                    positive_gc = np.where(adjusted_gc_contents > 0, adjusted_gc_contents, 0)
                    negative_gc = np.where(adjusted_gc_contents < 0, adjusted_gc_contents, 0)
                    
                    # Calculate plot scales
                    if len(adjusted_gc_contents) > 0:
                        abs_max = np.max(np.abs(adjusted_gc_contents))
                        vmin, vmax = -abs_max, abs_max
                    else:
                        vmin, vmax = 0, 1
                    
                    # Create track
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius))
                    track_obj.fill_between(positions, positive_gc, 0, vmin=vmin, vmax=vmax, color=track.color)
                    track_obj.fill_between(positions, negative_gc, 0, vmin=vmin, vmax=vmax, color="#888888")
                
                # Process GC skew
                elif track.track_type == "gc_skew":
                    positions = []
                    gc_skews = []
                    
                    if len(sequence) < binning_size:
                        window = sequence.upper()
                        g = window.count('G')
                        c = window.count('C')
                        gc_skew = (g - c) / (g + c) if (g + c) > 0 else 0
                        positions.append(len(sequence) // 2)
                        gc_skews.append(gc_skew)
                    else:
                        extended_seq = sequence + sequence[:binning_size]
                        for i in range(0, len(sequence), step_size):
                            window = extended_seq[i:i+binning_size].upper()
                            g = window.count('G')
                            c = window.count('C')
                            gc_skew = (g - c) / (g + c) if (g + c) > 0 else 0
                            pos = (i + binning_size // 2) % len(sequence)
                            positions.append(pos)
                            gc_skews.append(gc_skew)
                        positions, gc_skews = zip(*sorted(zip(positions, gc_skews)))
                    
                    # Calculate plot data
                    if gc_skews:
                        positive_gc_skews = np.where(np.array(gc_skews) > 0, gc_skews, 0)
                        negative_gc_skews = np.where(np.array(gc_skews) < 0, gc_skews, 0)
                        abs_max_gc_skew = max(abs(min(gc_skews)), abs(max(gc_skews)))
                        vmin_skew, vmax_skew = -abs_max_gc_skew, abs_max_gc_skew
                    else:
                        vmin_skew, vmax_skew = -1, 1
                        positive_gc_skews = negative_gc_skews = np.zeros_like(np.array(gc_skews))
                    
                    # Create track
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius))
                    
                    # Use track color for positive skew, and a complementary color for negative
                    pos_color = track.color
                    neg_color = "#9932CC"  # Default purple for negative skew
                    
                    track_obj.fill_between(positions, positive_gc_skews, 0, vmin=vmin_skew, vmax=vmax_skew, color=pos_color)
                    track_obj.fill_between(positions, negative_gc_skews, 0, vmin=vmin_skew, vmax=vmax_skew, color=neg_color)
                
                # Process CDS tracks
                elif track.track_type == "cds" and show_cds:
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius))
                    track_obj.axis(fc="lightgrey", ec="none")
                    
                    # Get strand from options
                    strand = track.options.get("strand", 1)
                    
                    # Get labeled positions if needed
                    labeled_positions = set()
                    if show_only_labeled_cds and (custom_labels_csv or custom_labels_interactive):
                        all_labels = []
                        if custom_labels_csv:
                            all_labels.extend(custom_labels_csv)
                        if custom_labels_interactive:
                            all_labels.extend(custom_labels_interactive)
                        for pos, label in all_labels:
                            labeled_positions.add(int(pos))
                    
                    # Process features
                    for feature in rec.features:
                        if feature.type == "CDS" and feature.strand == strand:
                            start = int(feature.location.start)
                            end = int(feature.location.end)
                            mid_point = (start + end) // 2
                            
                            # Skip if not labeled and show_only_labeled_cds is True
                            if show_only_labeled_cds and not any(abs(mid_point - pos) < 5000 for pos in labeled_positions):
                                continue
                            
                            # Draw the feature
                            if use_arrow_shape:
                                track_obj.genomic_features(
                                    feature,
                                    plotstyle="arrow",
                                    fc=track.color,
                                    r_lim=(track.inner_radius, track.outer_radius)
                                )
                            else:
                                track_obj.rect(
                                    start, end, 
                                    fc=track.color,
                                    r_lim=(track.inner_radius, track.outer_radius)
                                )

                # Process BED graph tracks - FIXED VERSION USING HELPER FUNCTION
                elif track.track_type == "bed_graph":
                    create_bed_graph_track(sector, track)

                # Process labels
                elif track.track_type == "labels":
                    track_obj = sector.add_track((track.inner_radius, track.outer_radius))
                    track_obj.axis(fc=track.color, ec="none")
                    
                    # Combine label sources
                    combined_labels = []
                    if custom_labels_csv:
                        combined_labels.extend(custom_labels_csv)
                    if custom_labels_interactive:
                        combined_labels.extend(custom_labels_interactive)

                    # Add labels without trying to set color - we'll do that in post-processing
                    for label_info in combined_labels:
                        if len(label_info) >= 2:  # Make sure we have at least position and text
                            pos = label_info[0]
                            text = label_info[1]
                            
                            if pos < sector.size:
                                track_obj.annotate(pos, text, label_size=font_size)

    else:
        # Legacy implementation for backward compatibility
        print("Using legacy track configuration")
        
        QUERY_TRACK_SIZE = track_width
        min_r_pos = 100
        
        # Process each comparison genome
        for i, comp_gb_file in enumerate(comparison_gb_files):
            comp_fasta_file, comp_records, original_comp_name = genbank_to_fasta(comp_gb_file)
            comp_name = os.path.basename(comp_gb_file).split('.')[0]
            comp_fasta = Fasta(comp_fasta_file)
            align_coords = Blast([target_fasta, comp_fasta]).run()
            align_coords = AlignCoord.filter(align_coords, identity_thr=min_identity)
            
            # Determine color
            if comp_gb_file in track_colors and track_colors[comp_gb_file]:
                try:
                    color_value = track_colors[comp_gb_file]
                    if mcolors.is_color_like(color_value):
                        color = color_value
                    else:
                        print(f"Invalid color {color_value} for {comp_name}, using default")
                        color = default_colors[i % len(default_colors)]
                except Exception as e:
                    print(f"Error with color {track_colors[comp_gb_file]} for {comp_name}: {str(e)}")
                    color = default_colors[i % len(default_colors)]
            else:
                color = default_colors[i % len(default_colors)]
                
            print(f"Using color {color} for track {comp_name}")
            comp_name2color[original_comp_name] = color
            
            min_r_pos -= QUERY_TRACK_SIZE
            for sector in circos.sectors:
                sector.add_track((min_r_pos, min_r_pos + QUERY_TRACK_SIZE), r_pad_ratio=0.1)
                
            for ac in align_coords:
                track = circos.get_sector(ac.query_name).tracks[-1]
                track.rect(ac.query_start, ac.query_end, color=color)

        # Process each target record for GC content and skew
        for rec in target_records:
            sequence = str(rec.seq)
            sector = circos.get_sector(rec.id)
            positions = []
            gc_contents = []
            gc_skews = []

            if len(sequence) < binning_size:
                window = sequence.upper()
                g = window.count('G')
                c = window.count('C')
                a = window.count('A')
                t = window.count('T')
                total_bases = g + c + a + t
                gc_content = (g + c) / total_bases * 100 if total_bases > 0 else 0
                gc_skew = (g - c) / (g + c) if (g + c) > 0 else 0
                positions.append(len(sequence) // 2)
                gc_contents.append(gc_content)
                gc_skews.append(gc_skew)
            else:
                # Use circular sliding windows: extend the sequence by the first binning_size bases
                extended_seq = sequence + sequence[:binning_size]
                for i in range(0, len(sequence), step_size):
                    window = extended_seq[i:i+binning_size].upper()
                    g = window.count('G')
                    c = window.count('C')
                    a = window.count('A')
                    t = window.count('T')
                    total_bases = g + c + a + t
                    gc_content = (g + c) / total_bases * 100 if total_bases > 0 else 0
                    gc_skew = (g - c) / (g + c) if (g + c) > 0 else 0
                    pos = (i + binning_size // 2) % len(sequence)
                    positions.append(pos)
                    gc_contents.append(gc_content)
                    gc_skews.append(gc_skew)
                positions, gc_contents, gc_skews = map(list, zip(*sorted(zip(positions, gc_contents, gc_skews))))

            # Compute overall genome-wide GC content for the sequence
            total_g = sequence.upper().count('G')
            total_c = sequence.upper().count('C')
            genome_gc_content = (total_g + total_c) / len(sequence) * 100

            # Adjust window GC contents by subtracting the genome average
            adjusted_gc_contents = np.array(gc_contents) - genome_gc_content

            # Separate positive and negative deviations
            positive_gc = np.where(adjusted_gc_contents > 0, adjusted_gc_contents, 0)
            negative_gc = np.where(adjusted_gc_contents < 0, adjusted_gc_contents, 0)

            if len(adjusted_gc_contents) > 0:
                abs_max = np.max(np.abs(adjusted_gc_contents))
                vmin, vmax = -abs_max, abs_max
            else:
                vmin, vmax = 0, 1

            # Create the GC content track and plot the deviations
            gc_content_track = sector.add_track((60, 70))
            gc_content_track.fill_between(positions, positive_gc, 0, vmin=vmin, vmax=vmax, color="black")
            gc_content_track.fill_between(positions, negative_gc, 0, vmin=vmin, vmax=vmax, color="grey")

            if gc_skews:
                positive_gc_skews = np.where(np.array(gc_skews) > 0, gc_skews, 0)
                negative_gc_skews = np.where(np.array(gc_skews) < 0, gc_skews, 0)
                abs_max_gc_skew = max(abs(min(gc_skews)), abs(max(gc_skews)))
                vmin_skew, vmax_skew = -abs_max_gc_skew, abs_max_gc_skew
            else:
                vmin_skew, vmax_skew = -1, 1
                positive_gc_skews = negative_gc_skews = np.zeros_like(np.array(gc_skews))

            # Create the GC skew track and plot the values
            gc_skew_track = sector.add_track((40, 55))
            gc_skew_track.fill_between(positions, positive_gc_skews, 0, vmin=vmin_skew, vmax=vmax_skew, color="green")
            gc_skew_track.fill_between(positions, negative_gc_skews, 0, vmin=vmin_skew, vmax=vmax_skew, color="purple")

            # Optionally, show CDS features if enabled
            if show_cds:
                cds_track = sector.add_track((70, 80))
                cds_track.axis(fc="lightgrey", ec="none")
                labeled_positions = set()
                
                if show_only_labeled_cds and (custom_labels_csv or custom_labels_interactive):
                    all_labels = []
                    if custom_labels_csv:
                        all_labels.extend(custom_labels_csv)
                    if custom_labels_interactive:
                        all_labels.extend(custom_labels_interactive)
                    for pos, label in all_labels:
                        labeled_positions.add(int(pos))
                        
                for feature in rec.features:
                    if feature.type == "CDS":
                        start = int(feature.location.start)
                        end = int(feature.location.end)
                        mid_point = (start + end) // 2
                        
                        if show_only_labeled_cds and not any(abs(mid_point - pos) < 5000 for pos in labeled_positions):
                            continue
                            
                        gene_name = ""
                        if "gene" in feature.qualifiers:
                            gene_name = feature.qualifiers["gene"][0]
                        elif "product" in feature.qualifiers:
                            product = feature.qualifiers["product"][0]
                            if len(product) > 20:
                                product = product[:20] + "..."
                            gene_name = product
                            
                        if use_arrow_shape:
                            if feature.strand == 1:
                                cds_track.genomic_features(
                                    feature,
                                    plotstyle="arrow",
                                    fc="salmon",
                                    r_lim=(75, 80)
                                )
                            else:
                                cds_track.genomic_features(
                                    feature,
                                    plotstyle="arrow",
                                    fc="skyblue",
                                    r_lim=(70, 75)
                                )
                        else:
                            if feature.strand == 1:
                                cds_track.rect(start, end, fc="salmon", r_lim=(75, 80))
                            else:
                                cds_track.rect(start, end, fc="skyblue", r_lim=(70, 75))

        # Add tick marks to each sector
        for sector in circos.sectors:
            track = sector.add_track((39.75, 40))
            track.axis(fc="black")
            if sector.size >= ticks_interval:
                track.xticks_by_interval(
                    ticks_interval,
                    outer=False,
                    label_formatter=lambda v: f"{int(v/1000)} kbp",
                    label_orientation="vertical",
                )

        # Add custom labels if provided
        label_track_outer = 100
        label_track_width = max(track_width, len(comparison_gb_files) * track_width)
        label_track_inner = label_track_outer - label_track_width
        combined_labels = []
        
        if custom_labels_csv:
            combined_labels.extend(custom_labels_csv)
        if custom_labels_interactive:
            combined_labels.extend(custom_labels_interactive)
            
        if combined_labels:
            for sector in circos.sectors:
                custom_label_track = sector.add_track((label_track_inner, label_track_outer))
                custom_label_track.axis(fc="lightgrey", ec="none")
                
                for label_info in combined_labels:
                    if isinstance(label_info, (list, tuple)):
                        if len(label_info) >= 2:
                            pos = label_info[0]
                            text = label_info[1]
                            
                            if pos < sector.size:
                                custom_label_track.annotate(pos, text, label_size=font_size)

    # Generate the figure
    fig = circos.plotfig()
    
    # Post-process: Find all text elements in the figure and update colors
    if label_color_map:
        print(f"Applying colors to {len(label_color_map)} custom labels...")
        for ax in fig.get_axes():
            for text_obj in ax.findobj(plt.Text):
                text_content = text_obj.get_text()
                if text_content in label_color_map:
                    text_obj.set_color(label_color_map[text_content])
    
    # Create and save the legend
    save_separate_legend(comp_name2color, target_name, enhanced_tracks)

    # Clean up temporary FASTA files
    os.unlink(target_fasta_file)
    for comp_gb_file in comparison_gb_files:
        comp_fasta_file, _, _ = genbank_to_fasta(comp_gb_file)
        try:
            os.unlink(comp_fasta_file)
        except Exception:
            pass

    return fig

# ---------------------- main_circular() ----------------------
def main_circular():
    install_required_packages()
    root = tk.Tk()
    app = GenomeViewerApp(root)
    root.mainloop()

# ======================== DIAGRAM SELECTION DIALOG ========================
def choose_diagram_type():
    # Create a small dialog window to select the diagram type.
    selection_window = tk.Tk()
    selection_window.title("Select Diagram Type")
    selection_window.geometry("300x150")
    diagram_type = tk.StringVar(value="")
    def set_linear():
        diagram_type.set("linear")
        selection_window.destroy()
    def set_circular():
        diagram_type.set("circular")
        selection_window.destroy()
    tk.Label(selection_window, text="Select Diagram Type:", font=("Arial", 12)).pack(pady=10)
    tk.Button(selection_window, text="Linear Diagram", width=20, command=set_linear).pack(pady=5)
    tk.Button(selection_window, text="Circular Diagram", width=20, command=set_circular).pack(pady=5)
    selection_window.mainloop()
    return diagram_type.get()

# ======================== MAIN EXECUTION ========================
if __name__ == "__main__":
    choice = choose_diagram_type()
    if choice == "linear":
        main_linear()
    elif choice == "circular":
        main_circular()
    else:
        print("No valid selection made. Exiting.")
