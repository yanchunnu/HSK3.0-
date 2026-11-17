"""Rebuild grade-3 learning clips from immutable retained inputs (ffmpeg required).
No speech generation. Preserved references and requested-tone clips are copied exactly.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,shutil,subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
ROOT=Path(__file__).resolve().parents[1]
def rebuild():
 m=json.loads((ROOT/'audio/level3-natural/manifest.json').read_text());sources={('natural',s['chunk']):s for s in m['sources']};sources.update({('erhua',s['chunk']):s for s in m['reference_sources']});clips=[c for c in m['clips'] if not c.get('reused') or 'source_clip'in c];needed={(c['source_group'],c['source_chunk']) for c in clips if 'source_clip'not in c};sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 with TemporaryDirectory(prefix='hsk-level3-') as temp:
  decoded={}
  for key in sorted(needed):
   s=sources[key];original=ROOT/s['file'];assert sha(original)==s['sha256'];target=Path(temp)/f'{key[0]}-{key[1]}.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-ar','24000','-ac','1',str(target)],check=True);decoded[key]=target
  def encode(c):
   out=ROOT/c['file'];out.parent.mkdir(parents=True,exist_ok=True);filters=[]
   if 'source_clip'in c:
    original=ROOT/c['source_clip'];assert sha(original)==c['source_sha256'];lead=c.get('added_leading_padding_seconds',0);tail=c.get('added_trailing_padding_seconds',0)
    if not lead and not tail:shutil.copy2(original,out);return
    args=['-i',str(original)];filters=[f'adelay={round(lead*1000)}:all=1',f'apad=pad_dur={tail}']
   else:
    args=['-ss',str(c['start']),'-t',str(c['end']-c['start']),'-i',str(decoded[c['source_group'],c['source_chunk']])]
    if c.get('gain_db'):filters.append(f'volume={c["gain_db"]}dB')
    pad=c.get('padding_seconds',0);tail=c.get('trailing_padding_seconds',pad)
    if pad or tail:filters += [f'adelay={round(pad*1000)}:all=1',f'apad=pad_dur={tail}']
   args=['ffmpeg','-v','error','-y',*args,'-ar','24000','-ac','1']
   if filters:args+=['-af',','.join(filters)]
   subprocess.run(args+['-c:a','libmp3lame','-b:a','64000',str(out)],check=True)
  with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(encode,clips))
 print(f'Rebuilt {len(clips)} grade-3 files from retained inputs; no synthesis calls.')
if __name__=='__main__':rebuild()
