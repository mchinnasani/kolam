"""Bake geographic point clouds once; browsers load compact, gzip-compressed data.
Run: python3 scripts/bake-planets.py (requires Pillow).
Format: KPL1 + uint32 LE count, then 12-byte records: 3 int16 positions
(scale 10000), RGB uint8, seed uint16, layer uint8 (scale 10).
"""
import gzip
import math
from pathlib import Path
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public' / 'planets'

def bake(kind, filename):
    surface = Image.open(ASSETS / filename).convert('RGB')
    clouds = Image.open(ASSETS / 'clouds.jpg').convert('RGB') if kind == 'about' else surface
    records = bytearray()
    seed = 713
    def rand():
        nonlocal seed
        seed = (seed * 1664525 + 1013904223) & 0xffffffff
        return seed / 4294967296
    def sample(image, x, y, z):
        u = (math.atan2(x, z) / (2 * math.pi) + .5) % 1
        v = .5 - math.asin(y) / math.pi
        return [c / 255 for c in image.getpixel((int(u * image.width), min(image.height-1, int(v * image.height))))]
    def add(x, y, z, color, layer):
        records.extend(struct.pack('<hhhBBBHB', *(round(v*10000) for v in (x,y,z)),
            *(round(max(0,min(1,c))*255) for c in color), round(rand()*65535), round(layer*10)))
    for i in range(16000):
        y = 1-2*(i+.5)/16000
        a = i*2.3999632297
        r = math.sqrt(1-y*y)
        x,z = math.sin(a)*r, math.cos(a)*r
        c = sample(surface,x,y,z)
        if kind == 'about':
            ocean = c[2] > c[0]*1.2 and c[2] > c[1]*1.05
            c = [.06,.28+c[1]*.65,.7+c[2]*.3] if ocean else [min(1,v*1.5+(.08 if j==1 else .025)) for j,v in enumerate(c)]
        elif kind == 'projects':
            c = [min(1,c[0]*1.4),c[1]*1.15,c[2]*.8]
        else:
            light = c[0]*.3+c[1]*.4+c[2]*.3
            c = [.22+light*.8,.08+light*.56,.48+light*.52]
        add(x,y,z,c,0)
        if kind == 'about' and sample(clouds,x,y,z)[0] > .48 and rand() > .38:
            add(x*1.018,y*1.018,z*1.018,[.8,.9,1],1)
    if kind == 'projects':
        for _ in range(10000):
            a,r = rand()*math.tau, 1.24+rand()*.69
            if abs(r-1.68) < .025:
                continue
            band = .55+.25*math.sin(r*155)+rand()*.2
            add(math.cos(a)*r,(rand()-.5)*.012,math.sin(a)*r,[band,band*.79,band*.46],2)
    for _ in range(1400):
        y,a = 1-2*rand(),rand()*math.tau
        r,height = math.sqrt(1-y*y),1.035+rand()*.035
        color = [.2,.75,1] if kind=='about' else [.8,.55,.22] if kind=='projects' else [.55,.3,1]
        add(math.sin(a)*r*height,y*height,math.cos(a)*r*height,color,1.2)
    if kind == 'interests':
        for _ in range(170):
            a,r = rand()*math.tau,1.2+rand()*.2
            add(math.cos(a)*r,0,math.sin(a)*r,[.6,.4,1],2)
    payload = b'KPL1'+struct.pack('<I',len(records)//12)+records
    compressed = gzip.compress(payload,mtime=0)
    (ASSETS / f'{kind}.points.gz').write_bytes(compressed)
    print(f'{kind}: {len(records)//12:,} points; {len(compressed):,} compressed bytes')

if __name__ == '__main__':
    for kind,filename in [('about','earth.jpg'),('projects','saturn.jpg'),('interests','jupiter.jpg')]:
        bake(kind,filename)
