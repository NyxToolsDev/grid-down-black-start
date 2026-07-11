"""Generate icon-192.png and icon-512.png: phosphor power symbol on dark board."""
import math
import struct
import zlib
from pathlib import Path

BG = (5, 8, 7, 255)
GREEN = (51, 255, 102, 255)
DIM = (26, 128, 64, 255)


def make(size: int) -> bytes:
    px = [[BG for _ in range(size)] for _ in range(size)]
    cx = cy = size / 2
    r_outer = size * 0.32
    thick = max(2.0, size * 0.045)
    glow = thick * 2.2

    def blend(x, y, color, alpha):
        if 0 <= x < size and 0 <= y < size:
            r, g, b, _ = px[y][x]
            nr = int(r + (color[0] - r) * alpha)
            ng = int(g + (color[1] - g) * alpha)
            nb = int(b + (color[2] - b) * alpha)
            px[y][x] = (nr, ng, nb, 255)

    # power-symbol arc (gap at top) + vertical bar, with soft glow
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            ang = math.degrees(math.atan2(dx, -dy))  # 0 = up
            on_arc = abs(dist - r_outer) < glow and abs(ang) > 35
            bar_len = r_outer * 1.05
            on_bar = abs(dx) < glow and -bar_len < dy < -r_outer * 0.05
            if on_arc:
                d = abs(dist - r_outer)
            elif on_bar:
                d = abs(dx)
            else:
                continue
            if d < thick:
                blend(x, y, GREEN, 1.0)
            else:
                blend(x, y, GREEN, max(0.0, 0.5 * (1 - (d - thick) / (glow - thick))))

    # scanlines
    for y in range(0, size, 4):
        for x in range(size):
            r, g, b, _ = px[y][x]
            px[y][x] = (int(r * 0.85), int(g * 0.85), int(b * 0.85), 255)

    # baseline dots — a hint of the one-line diagram
    dot_y = int(size * 0.83)
    for i in range(4):
        dot_x = int(size * (0.28 + i * 0.15))
        for yy in range(dot_y - 2, dot_y + 3):
            for xx in range(dot_x - 2, dot_x + 3):
                blend(xx, yy, DIM if i % 2 else GREEN, 0.9)

    raw = b''.join(
        b'\x00' + b''.join(struct.pack('4B', *px[y][x]) for x in range(size))
        for y in range(size)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


out = Path(__file__).resolve().parent.parent / 'icons'
out.mkdir(exist_ok=True)
for s in (192, 512):
    (out / f'icon-{s}.png').write_bytes(make(s))
    print(f'icon-{s}.png written')
