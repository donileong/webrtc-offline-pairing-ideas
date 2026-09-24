#!/usr/bin/env python3
"""
Generate vector SVG and crisp raster PNG icons for Peer Box.
Follows the official ii2d design system (github.com/ii2d):
- 1024x1024 canvas with 22.26% border radius squircle container (#090a0f)
- Transparent corner mask
- High-contrast pure white (#ffffff) geometric line-art
- Clean stroke-width with precise miter joints
- Pixel-perfect rasterization via rsvg-convert
"""

import math
import os
import subprocess

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")


def get_nested_hypercube_svg(
    size=1024,
    stroke_color="#ffffff",
    bg_fill="#090a0f",
    rx=228,
    sw=48.0,
    r_outer=338.0,
    ratio=0.50,
):
    cx, cy = size / 2.0, size / 2.0
    r_inner = r_outer * ratio
    cos30 = math.sqrt(3.0) / 2.0
    sin30 = 0.5

    out_pts = [
        (cx, cy - r_outer),
        (cx + r_outer * cos30, cy - r_outer * sin30),
        (cx + r_outer * cos30, cy + r_outer * sin30),
        (cx, cy + r_outer),
        (cx - r_outer * cos30, cy + r_outer * sin30),
        (cx - r_outer * cos30, cy - r_outer * sin30),
    ]

    in_pts = [
        (cx, cy - r_inner),
        (cx + r_inner * cos30, cy - r_inner * sin30),
        (cx + r_inner * cos30, cy + r_inner * sin30),
        (cx, cy + r_inner),
        (cx - r_inner * cos30, cy + r_inner * sin30),
        (cx - r_inner * cos30, cy - r_inner * sin30),
    ]

    out_points_str = " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in out_pts)
    in_points_str = " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in in_pts)

    struts = "\n    ".join(
        f'<line x1="{out_pts[i][0]:.2f}" y1="{out_pts[i][1]:.2f}" '
        f'x2="{in_pts[i][0]:.2f}" y2="{in_pts[i][1]:.2f}" />'
        for i in range(6)
    )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="100%" height="100%">
  <!-- App Icon Squircle Container (Safe Zone Standard) -->
  <rect width="{size}" height="{size}" rx="{rx * (size / 1024.0):.1f}" fill="{bg_fill}" />

  <!-- Centered Optical Nested Hypercube (Peer Vault Box) -->
  <g fill="none" stroke="{stroke_color}" stroke-width="{sw:.2f}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4">
    <!-- Outer Isometric Hexagon -->
    <polygon points="{out_points_str}" />

    <!-- Inner Core Isometric Hexagon -->
    <polygon points="{in_points_str}" />

    <!-- Radial Connection Struts -->
    {struts}
  </g>
</svg>
"""
    return svg


def generate():
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    # 1. Master pure-vector SVG
    svg_content = get_nested_hypercube_svg()
    svg_path = os.path.join(PUBLIC_DIR, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"✓ Master vector SVG: {svg_path}")

    # 2. Render PNG icon variants via rsvg-convert
    targets = [
        ("icon.png", 1024, 1024),
        ("apple-touch-icon.png", 180, 180),
        ("favicon-48x48.png", 48, 48),
        ("favicon-32x32.png", 32, 32),
        ("favicon-16x16.png", 16, 16),
    ]

    for filename, w, h in targets:
        out_path = os.path.join(PUBLIC_DIR, filename)
        subprocess.run(
            ["rsvg-convert", "-w", str(w), "-h", str(h), svg_path, "-o", out_path],
            check=True,
        )
        size_kb = os.path.getsize(out_path) / 1024.0
        print(f"✓ Rendered {filename} ({w}x{h}) - {size_kb:.1f} KB")


if __name__ == "__main__":
    generate()
