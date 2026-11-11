"""Grade 1 recorded voice, routing, and playback-control regression checks."""
import hashlib,json,os,re,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_level3_playback import MOCK
ROOT=Path(__file__).resolve().parents[1]
class Level1Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);cls.html=(ROOT/'index.html').read_text()
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.page=self.browser.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.set_content(self.html.replace('<body>','<body>'+MOCK,1))
 def tearDown(self):self.page.close();self.assertEqual(self.errors,[])
 def ev(self,code):return self.page.evaluate(code)
 def test_all_300_words_and_examples_match_grade4_voice(self):
  data=self.ev('DATA');self.assertEqual([x['no'] for x in data],list(range(1,301)));self.assertEqual(self.page.locator('article.card').count(),300)
  m=json.loads((ROOT/'audio/level1-natural/manifest.json').read_text());reference=json.loads((ROOT/'audio/level4-natural/manifest.json').read_text());self.assertEqual(m['voice_id'],reference['voice_id']);self.assertEqual(m['requested_speed'],reference['requested_speed']);self.assertEqual(len(m['clips']),600)
  self.assertEqual({(c['no'],c['kind']) for c in m['clips']},{(n,k) for n in range(1,301) for k in ['word','example']});routes=self.ev('FIXED_AUDIO')
  for c in m['clips']:
   self.assertEqual(c['display_text'],data[c['no']-1]['word' if c['kind']=='word' else 'example']);self.assertEqual(routes[str(c['no'])][c['kind']].split('?')[0],c['file']);self.assertEqual(hashlib.sha256((ROOT/c['file']).read_bytes()).hexdigest(),c['sha256'])
  for s in m['sources']:self.assertEqual(hashlib.sha256((ROOT/s['file']).read_bytes()).hexdigest(),s['sha256'])
  self.assertEqual(self.page.get_by_role('link',name='1급 PDF 내려받기').count(),1);self.assertEqual(self.page.locator('nav a').count(),1)
 def test_no_device_voice_needed_repeat_pause_and_resume(self):
  self.ev('Object.defineProperty(window,"speechSynthesis",{value:undefined})');self.page.locator('#startNo').fill('300');self.page.locator('#wordRepeat').select_option('2');self.page.locator('#sentenceRepeat').select_option('1');self.page.locator('#speechRate').select_option('0.9');self.page.locator('#playAllBoth').click();self.assertEqual(self.ev('state.currentAudio.playbackRate'),.9)
  self.assertTrue(self.ev('state.currentAudio.src.includes("0300-word.mp3")'));self.ev('togglePause()');self.assertTrue(self.ev('state.currentAudio.paused'));self.ev('togglePause()');self.assertFalse(self.ev('state.currentAudio.paused'))
  for n in [2,3]:self.ev('state.currentAudio.onended()');self.page.wait_for_function('(n)=>window.__audios.length===n',arg=n)
  self.assertTrue(self.ev('state.currentAudio.src.includes("0300-example.mp3")'));self.ev('state.currentAudio.onended()');self.page.wait_for_function('!state.speaking');self.assertEqual(self.ev('window.__utterances.length'),0);self.assertTrue(self.page.locator('#pauseResume').is_disabled())
 def test_error_stop_and_stale_callbacks(self):
  self.ev('playQueue([{no:1,audio:fixedAudio(1,"word")}],"old");playQueue([{no:2,audio:fixedAudio(2,"word")}],"new");window.__audios[0].onended();window.__audios[0].onerror()');self.assertTrue(self.ev('state.currentAudio.src.includes("0002-word.mp3")'));self.ev('state.currentAudio.onerror()');self.assertFalse(self.ev('state.speaking'));self.assertTrue(self.page.locator('#pauseResume').is_disabled());self.assertIn('2번',self.page.locator('#status').inner_text())
  self.ev('playQueue([{no:1,audio:fixedAudio(1,"word")},{no:2,audio:fixedAudio(2,"word")}],"stop");state.currentAudio.onended();stopPlayback()');self.page.wait_for_timeout(500);self.assertEqual(self.ev('window.__audios.length'),3)
 def test_annotations_start_number_and_visibility(self):
  self.assertEqual(self.ev('wordSpeechText(DATA[272])'),'没有');self.assertEqual(self.ev('wordSpeechText(DATA[298])'),'有一点儿');self.page.locator('#startNo').fill('299.5');self.ev('selectedItems()');self.assertEqual(self.page.locator('#startNo').input_value(),'299')
  self.page.locator('#search').fill('一点儿');self.assertGreater(self.page.locator('article.card').count(),0)
  for button,selector in [('pinyinToggle','.pinyin'),('meaningToggle','.meaning'),('translationToggle','.translation')]:self.page.locator('#'+button).click();self.assertEqual(self.page.locator(selector+':not(.hidden)').count(),0)
if __name__=='__main__':unittest.main()
