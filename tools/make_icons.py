"""Writes icons/icon-192.png and icons/icon-512.png (same design as icon.svg) with no dependencies.

Run from the ReflexCheck folder:  python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

BG, WALL, FIELD, BLUE, RED = (0x11, 0x14, 0x18), (0, 0, 0), (255, 255, 255), (0x1F, 0x4F, 0xD8), (0xE0, 0x1B, 0x24)

# Rectangles on a 512 grid, painted in order (same as icon.svg).
RECTS = [
    (0, 0, 512, 512, BG),
    (64, 64, 384, 384, WALL),
    (112, 112, 288, 288, FIELD),
    (140, 140, 80, 64, BLUE),
    (300, 300, 72, 72, BLUE),
    (226, 226, 60, 60, RED),
]


def pixel(x, y):
    color = BG
    for rx, ry, rw, rh, c in RECTS:
        if rx <= x < rx + rw and ry <= y < ry + rh:
            color = c
    return color


def write_png(path, size):
    scale = 512 / size
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter: none
        for x in range(size):
            rows.extend(pixel(int(x * scale), int(y * scale)))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    for size in (192, 512):
        write_png(out / f"icon-{size}.png", size)
        print(f"wrote {out / f'icon-{size}.png'}")
