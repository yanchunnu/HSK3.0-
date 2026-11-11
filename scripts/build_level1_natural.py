"""Rebuild the 600 grade-1 MP3 clips from saved lossless sources (ffmpeg required).
No new speech is generated. Voice identity matches the grade-4 learning page.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
def rebuild():
 manifest=json.loads((ROOT/'audio/level1-natural/manifest.json').read_text())
 with TemporaryDirectory(prefix='hsk-level1-') as directory:
  sources={}
  for s in manifest['sources']:
   native=ROOT/s['file'];assert hashlib.sha256(native.read_bytes()).hexdigest()==s['sha256'];wav=Path(directory)/f'{s["chunk"]}.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(native),'-ar','24000','-ac','1',str(wav)],check=True);sources[s['chunk']]=wav
  def encode(c):
   filters=[]
   if c.get('gain_db'):filters.append(f'volume={c["gain_db"]}dB')
   filters += [f'adelay={round(c["padding_seconds"]*1000)}:all=1',f'apad=pad_dur={c.get("trailing_padding_seconds",c["padding_seconds"])}']
   output=ROOT/c['file'];output.parent.mkdir(parents=True,exist_ok=True);subprocess.run(['ffmpeg','-v','error','-y','-ss',str(c['start']),'-t',str(c['end']-c['start']),'-i',str(sources[c['source_chunk']]),'-af',','.join(filters),'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64000',str(output)],check=True)
  with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(encode,manifest['clips']))
 print('Rebuilt 600 clips from retained sources; no speech synthesis calls.')
if __name__=='__main__':rebuild()
