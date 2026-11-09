"""Rebuild the approved clips from original audio and retained trim offsets.
Requires ffmpeg. Does not generate new speech or alter its speed or pitch.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'audio/level3-erhua/manifest.json').read_text())
sources = {source['chunk']: source for source in manifest['sources']}
for source in sources.values():
    assert hashlib.sha256((ROOT / source['file']).read_bytes()).hexdigest() == source['sha256']

def build(clip):
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', str(ROOT / sources[clip['source_chunk']]['file']),
        '-ss', str(clip['start']), '-t', str(clip['end'] - clip['start']),
        '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64000',
        str(ROOT / clip['file'])
    ], check=True)

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(build, manifest['clips']))
    print(f"Rebuilt {len(manifest['clips'])} audio clips.")
