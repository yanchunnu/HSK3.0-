"""Browser regression checks (requires Python playwright and a Chromium binary).
Run: CHROMIUM_PATH=/usr/bin/chromium python -m unittest discover -s tests -v
These tests validate playback controls and text routing, not audible pronunciation.
"""
import json
import os
from pathlib import Path
import re
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MOCK = '''<script>
window.__voices=[{lang:'zh-CN',name:'Mandarin'}];
window.__utterances=[];window.__audios=[];window.__audioReject=false;
const synth=new EventTarget();
synth.getVoices=()=>window.__voices;synth.cancel=()=>{};
synth.speak=u=>window.__utterances.push(u);
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
window.Audio=class {
 constructor(url){this.src=url;this.paused=true;window.__audios.push(this);}
 play(){if(window.__audioReject)return Promise.reject(new Error('blocked'));this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
};
</script>'''

class PlaybackTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start()
  cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  cls.html=(ROOT/'level3.html').read_text()
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.page=self.browser.new_page()
  self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  self.page.set_content(self.html.replace('<body>','<body>'+MOCK,1))
 def tearDown(self):
  self.page.close();self.assertEqual(self.errors,[])
 def ev(self,code):return self.page.evaluate(code)
 def queue(self,entries):
  self.page.evaluate('(entries)=>playQueue(entries,"test")',entries)
 def wait_spoken(self,n):self.page.wait_for_function('(n)=>window.__utterances.length===n',arg=n)
 def test_1000_entries_search_and_annotations(self):
  self.assertEqual(self.page.locator('article.card').count(),1000)
  self.assertEqual(self.page.locator('.category').count(),15)
  self.assertEqual(self.ev('DATA.map(x=>x.no)'),list(range(1,1001)))
  self.assertEqual(self.ev('wordSpeechText(DATA.find(x=>x.word==="面¹"))'),'面')
  self.assertEqual(self.ev('wordSpeechText(DATA.find(x=>x.no===285))'),'有时候')
  self.assertEqual(self.ev('wordSpeechText(DATA.find(x=>x.no===993))'),'有一点儿')
  self.assertEqual(self.ev('DATA.find(x=>x.no===750).word'),'聊天儿')
  self.page.locator('#search').fill('750')
  self.assertEqual(self.page.locator('article.card').count(),1)
  self.assertIn('liáotiānr',self.page.locator('article.card').inner_text())
 def test_erhua_audio_matches_displayed_content(self):
  import hashlib
  manifest=json.loads((ROOT/'audio/level3-erhua/manifest.json').read_text())
  clips=manifest['clips']
  self.assertEqual(sum(c['kind']=='word' for c in clips),13)
  self.assertEqual(sum(c['kind']=='example' for c in clips),103)
  data={x['no']:x for x in self.ev('DATA')}
  for clip in clips:
   row=data[clip['no']]
   expected=re.sub('[()（）]','',row['word']) if clip['kind']=='word' else row['example']
   self.assertEqual(clip['text'],expected)
   path=ROOT/clip['file']
   self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),clip['sha256'])
   route=self.page.evaluate('(c)=>fixedAudio(c.no,c.kind)',clip)
   self.assertEqual(route,clip['file'])
  self.assertEqual(self.ev('fixedAudio(57,"word") || null'),None)
  self.assertEqual(self.ev('fixedAudio(58,"word") || null'),None)
  self.assertTrue(self.ev('fixedAudio(750,"word").includes("0750-word.mp3")'))
 def test_mandarin_voice_selection(self):
  for voices,expected in [([{'lang':'zh-HK'}],None),([{'lang':'zh-TW'},{'lang':'zh_CN'}],'zh_CN'),([{'lang':'cmn-Hans-CN'}],'cmn-Hans-CN')]:
   self.page.evaluate('(v)=>window.__voices=v',voices)
   self.assertEqual(self.ev('getChineseVoice()?.lang || null'),expected)
 def test_tts_error_restores_controls(self):
  self.queue([{'text':'你好','no':1}]);self.wait_spoken(1)
  self.ev('window.__utterances[0].onerror({error:"synthesis-failed"})')
  self.assertTrue(self.page.locator('#pauseResume').is_disabled())
  self.assertFalse(self.ev('state.speaking'))
  self.assertTrue(self.page.locator('.play').first.is_enabled())
 def test_voice_loading_and_stop(self):
  self.ev('window.__voices=[]');self.queue([{'text':'你好','no':1}])
  self.ev('window.__voices=[{lang:"zh-CN"}];speechSynthesis.dispatchEvent(new Event("voiceschanged"))')
  self.wait_spoken(1)
  self.ev('stopPlayback();window.__voices=[]')
  self.queue([{'text':'不应读出','no':2}]);self.ev('stopPlayback()')
  self.ev('window.__voices=[{lang:"zh-CN"}];speechSynthesis.dispatchEvent(new Event("voiceschanged"))')
  self.page.wait_for_timeout(100)
  self.assertEqual(self.ev('window.__utterances.length'),1)
 def test_cantonese_only_gives_specific_error(self):
  self.ev('window.__voices=[{lang:"zh-HK"}]');self.queue([{'text':'你好','no':1}])
  self.page.wait_for_function('!state.speaking')
  self.assertEqual(self.ev('window.__utterances.length'),0)
  self.assertIn('중국어(보통화)',self.page.locator('#status').inner_text())
  self.assertTrue(self.page.locator('#pauseResume').is_disabled())
 def test_audio_does_not_require_speech_synthesis(self):
  self.ev('Object.defineProperty(window,"speechSynthesis",{value:undefined})')
  self.queue([{'text':'聊天儿','audio':'test.mp3','no':750}])
  self.assertEqual(self.ev('window.__audios.length'),1)
  self.assertEqual(self.ev('window.__utterances.length'),0)
  self.ev('window.__audios[0].onended()');self.page.wait_for_function('!state.speaking')
 def test_recorded_audio_error_and_resume_failure(self):
  for mode in ['load','resume']:
   self.queue([{'text':'聊天儿','audio':'test.mp3','no':750}])
   if mode=='load':self.ev('window.__audios.at(-1).onerror()')
   else:
    self.ev('togglePause();window.__audioReject=true;togglePause()')
    self.page.wait_for_function('!state.speaking')
   self.assertTrue(self.page.locator('#pauseResume').is_disabled())
   self.assertIn('750번',self.page.locator('#status').inner_text())
 def test_stale_audio_callbacks_cannot_advance_new_queue(self):
  self.queue([{'text':'old','audio':'old.mp3','no':750}])
  self.queue([{'text':'new','audio':'new.mp3','no':1000}])
  self.ev('window.__audios[0].onended();window.__audios[0].onerror()')
  self.assertTrue(self.ev('state.speaking'))
  self.assertEqual(self.ev('state.currentAudio.src'),'new.mp3')
  self.assertNotIn('실패',self.page.locator('#status').inner_text())
 def test_mixed_queue_repeat_pause_stop(self):
  self.queue([{'text':'聊天儿','audio':'test.mp3','no':750},{'text':'你好','no':1},{'text':'你好','no':1}])
  self.ev('togglePause()');self.assertTrue(self.ev('window.__audios[0].paused'))
  self.ev('togglePause()');self.assertFalse(self.ev('window.__audios[0].paused'))
  self.ev('window.__audios[0].onended()');self.wait_spoken(1)
  self.ev('togglePause();togglePause()');self.wait_spoken(2)
  self.ev('window.__utterances[0].onend()')
  self.assertTrue(self.ev('state.speaking'))
  self.ev('window.__utterances[1].onend()');self.wait_spoken(3)
  self.ev('window.__utterances[2].onend()');self.page.wait_for_function('!state.speaking')
  self.assertTrue(self.page.locator('#pauseResume').is_disabled())
 def test_stop_clears_queue_and_status_timer(self):
  self.queue([{'text':'one','no':1},{'text':'two','no':2}]);self.wait_spoken(1)
  self.ev('window.__utterances[0].onend();stopPlayback()')
  self.queue([{'text':'new','no':3}]);self.wait_spoken(2)
  self.page.wait_for_timeout(1600)
  self.assertEqual(self.ev('window.__utterances.length'),2)
  self.assertTrue(self.ev('statusBox.classList.contains("show")'))
 def test_fractional_start_is_integer(self):
  self.page.locator('#startNo').fill('749.5');self.ev('selectedItems()')
  self.assertEqual(self.page.locator('#startNo').input_value(),'749')

if __name__=='__main__':unittest.main()
