"""Rebuild the 2,000 grade-4 MP3 clips from retained native sources.
Requires ffmpeg. Does not synthesize or purchase new audio.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
def main():
 manifest=json.loads((ROOT/'audio/level4-natural/manifest.json').read_text())
 with tempfile.TemporaryDirectory() as tmp:
  sources={}
  for source in manifest['sources']:
   native=ROOT/source['file']
   if hashlib.sha256(native.read_bytes()).hexdigest()!=source['sha256']:raise ValueError(f'Source checksum mismatch: {native}')
   wav=Path(tmp)/f'{source["chunk"]:02}.wav'
   subprocess.run(['ffmpeg','-v','error','-y','-i',str(native),'-ar','24000','-ac','1',str(wav)],check=True);sources[source['chunk']]=wav
  def encode(c):
   pad=c['padding_seconds'];output=ROOT/c['file'];output.parent.mkdir(parents=True,exist_ok=True)
   subprocess.run(['ffmpeg','-v','error','-y','-ss',str(c['start']),'-t',str(c['end']-c['start']),'-i',str(sources[c['source_chunk']]),'-af',f'adelay={int(pad*1000)}:all=1,apad=pad_dur={pad}','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64000',str(output)],check=True)
  with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(encode,manifest['clips']))
 print('Rebuilt 2,000 clips from the saved native audio; no new synthesis.')
if __name__=='__main__':main()
