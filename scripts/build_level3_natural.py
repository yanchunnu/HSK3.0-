"""Rebuild fixed natural-voice clips from retained originals (requires ffmpeg).
No speech generation calls are made. Reference clips are kept unchanged.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]

def rebuild():
    manifest = json.loads((ROOT / 'audio/level3-natural/manifest.json').read_text())
    sources = {('natural', s['chunk']): s for s in manifest['sources']}
    sources.update({('erhua', s['chunk']): s for s in manifest['reference_sources']})
    clips = [clip for clip in manifest['clips'] if not clip['reused']]
    needed = {(c['source_group'], c['source_chunk']) for c in clips}
    with TemporaryDirectory(prefix='hsk-natural-') as temporary:
        decoded = {}
        for key in sorted(needed):
            source = sources[key]
            original = ROOT / source['file']
            assert hashlib.sha256(original.read_bytes()).hexdigest() == source['sha256']
            target = Path(temporary) / f'{key[0]}-{key[1]}.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(original),
                            '-ar', '24000', '-ac', '1', str(target)], check=True)
            decoded[key] = target
        def encode(clip):
            command = ['ffmpeg', '-v', 'error', '-y', '-ss', str(clip['start']),
                       '-t', str(clip['end'] - clip['start']), '-i',
                       str(decoded[clip['source_group'], clip['source_chunk']]),
                       '-ar', '24000', '-ac', '1']
            padding = clip['padding_seconds']
            tail = clip.get('trailing_padding_seconds', padding)
            if padding or tail:
                command += ['-af', f'adelay={round(padding*1000)}:all=1,apad=pad_dur={tail}']
            command += ['-c:a', 'libmp3lame', '-b:a', '64000', str(ROOT / clip['file'])]
            subprocess.run(command, check=True)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(encode, clips))
    print(f'Rebuilt {len(clips)} natural-voice clips; reference clips retained.')

if __name__ == '__main__':
    rebuild()
