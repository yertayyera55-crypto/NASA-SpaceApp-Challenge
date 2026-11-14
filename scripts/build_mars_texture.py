"""Build a low-resolution equirectangular Mars texture from NASA's verified Viking WMTS.

Layer and matrix metadata: https://api.nasa.gov/mars-wmts/catalog/
Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml
Matrix 2 has 8 columns x 4 rows of 256 px JPEG tiles.
"""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from subprocess import run
from PIL import Image

BASE = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/2"
OUT = Path(__file__).resolve().parents[1] / "public/images/mars.jpg"


def tile(position: tuple[int, int]):
    row, col = position
    response = run(["curl", "-LsS", "--fail", "--retry", "2", "--max-time", "30", f"{BASE}/{row}/{col}.jpg"], capture_output=True, check=True)
    image = Image.open(BytesIO(response.stdout)).convert("RGB")
    return row, col, image


def main():
    canvas = Image.new("RGB", (2048, 1024))
    with ThreadPoolExecutor(max_workers=6) as pool:
        for row, col, image in pool.map(tile, ((row, col) for row in range(4) for col in range(8))):
            if image.size != (256, 256):
                raise ValueError(f"Unexpected tile size at {row}, {col}: {image.size}")
            canvas.paste(image, (col * 256, row * 256))
    canvas.save(OUT, quality=90, optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
