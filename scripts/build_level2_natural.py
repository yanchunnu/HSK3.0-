"""Rebuild grade-2 fixed audio from retained sources (ffmpeg required).
Reuses exact-text recordings in the grade-4 reference voice; no speech generation.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib,json,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1]
def rebuild():
 m=json.loads((ROOT/'audio/level2-natural/manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 with TemporaryDirectory(prefix='hsk-level2-') as directory:
  sources={}
  for s in m['sources']:
   source=ROOT/s['file'];assert sha(source)==s['sha256'];wav=Path(directory)/f'{s["chunk"]}.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ar','24000','-ac','1',str(wav)],check=True);sources[s['chunk']]=wav
  def encode(c):
   output=ROOT/c['file'];output.parent.mkdir(parents=True,exist_ok=True)
   if 'source_clip' in c:
    source=ROOT/c['source_clip'];assert sha(source)==c['source_sha256'],f'Restore {c["source_clip"]} from source commit {m["reuse_source_commit"]} before rebuilding.';lead=c['added_leading_padding_seconds'];tail=c['added_trailing_padding_seconds']
    if not lead and not tail:shutil.copy2(source,output);return
    args=['-i',str(source)];filters=[f'adelay={round(lead*1000)}:all=1',f'apad=pad_dur={tail}']
   else:
    args=['-ss',str(c['start']),'-t',str(c['end']-c['start']),'-i',str(sources[c['source_chunk']])];filters=[]
    if c.get('gain_db'):filters.append(f'volume={c["gain_db"]}dB')
    filters += [f'adelay={round(c["padding_seconds"]*1000)}:all=1',f'apad=pad_dur={c["trailing_padding_seconds"]}']
   subprocess.run(['ffmpeg','-v','error','-y',*args,'-af',','.join(filters),'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64000',str(output)],check=True)
  with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(encode,m['clips']))
 print('Rebuilt 1,000 grade-2 clips without speech synthesis.')
if __name__=='__main__':rebuild()
