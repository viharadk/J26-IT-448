"""Render a scientific presentation board from ACTUAL verified EE PNGs.

No AI imagery or radar processing: display composition only. Original downloaded
PNGs and numeric evidence remain untouched. Requires installed Pillow.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parents[1] / "artifacts" / sys.argv[1]
record = json.loads((folder / "verification.json").read_text(encoding="utf-8"))
assert record["liveHttpEndpointsPassed"]
q = record["preview"]["quality"]
canvas = Image.new("RGB", (2400, 1500), "#081525")
d = ImageDraw.Draw(canvas)

def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)

def text(x, y, content, size=26, color="#b3c5d5", bold=False):
    d.text((x, y), content, font=font(size, bold), fill=color)

text(80, 44, "KELANI  FLOODWATCH", 28, "#78dfc6", True)
text(1840, 49, "FUNCTION 2  /  PHASE 2B", 22, "#94afc5")
text(80, 105, "Observe the radar. Question the change.", 67, "#eef5fb", True)
text(82, 198, "Lower Kelani River  /  24 May and 30 May 2017  /  Sentinel-1 VV", 30)
d.rounded_rectangle((80, 258, 2320, 338), radius=12, fill="#292a21", outline="#746142", width=2)
text(104, 276, "Exploratory observation comparison. May 30 is post-peak; flood extent remains unverified.", 28, "#f2d49f", True)

metrics = [
    ("COMMON VALID AREA", f'{q["common"]["validPixelAreaKm2"]:,.2f} km²'),
    ("COMMON VV SAMPLES", f'{q["statistics"]["before_count"]:,}'),
    ("MEAN LATER - BEFORE", f'{q["statistics"]["change_mean"]:+.3f} dB'),
    ("CROSS-PLATFORM STATUS", "Calibration unvalidated"),
]
for i, (label, value) in enumerate(metrics):
    x = 80 + i * 565
    d.rounded_rectangle((x, 370, x + 545, 490), radius=12, fill="#11283d", outline="#2d4861", width=2)
    text(x + 22, 389, label, 18, "#94afc5")
    text(x + 22, 424, value, 35 if i < 3 else 29, "#eef5fb", True)

titles = ["Before  /  24 May 2017", "Later  /  30 May 2017", "Exploratory radar change"]
captions = ["Sentinel-1A · 00:25:12 UTC", "Sentinel-1B · 00:24:30 UTC", "Later dB − before dB · not flood extent"]
for i, name in enumerate(["before", "later", "change"]):
    x = 80 + i * 760
    d.rounded_rectangle((x, 530, x + 720, 1162), radius=14, fill="#102237", outline="#2d4861", width=2)
    text(x + 20, 549, titles[i], 31, "#eef5fb", True)
    text(x + 20, 594, captions[i], 21)
    original = Image.open(folder / f"{name}-preview.png").convert("RGBA")
    original.thumbnail((690, 474), Image.Resampling.NEAREST)
    canvas.paste(original, (x + (720 - original.width) // 2, 638), original)
    text(x + 20, 1120 if i < 2 else 1108, "−25 to 0 dB · shared grayscale" if i < 2 else "−6 to +6 dB · signed log-ratio", 21)
    if i == 2:
        text(x + 20, 1140, "Blue: lower later VV   /   Red: higher later VV", 19)

text(82, 1210, f'Common valid coverage: {q["common"]["validPixelCoveragePercent"]:.3f}% of raster AOI; {q["common"]["validPixelCoveragePercentOfVectorAoi"]:.3f}% of vector AOI. Joint footprint: {q["common"]["jointFootprintCoveragePercent"]:.3f}%.', 26)
text(82, 1258, "Before-VV EPSG:32644 reference grid · nearest-neighbor alignment · original native grid origins differ.", 26)
text(82, 1306, "Valid samples are not proof of artifact-free pixels. Wet soil, speckle and land cover can alter backscatter.", 26)
text(82, 1377, "Research prototype. No confirmed flood extent, peak inundation, depth or detection-accuracy claim.", 27, "#f2d49f", True)
text(82, 1440, f'Actual Earth Engine PNG downloads · ESA/Copernicus Sentinel-1 · captured {q["queriedAt"]}', 22, "#8ca7bf")
output = folder / "pp1-sar-comparison.png"
canvas.save(output)
print(output)
