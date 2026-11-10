"""Grade 5 content, fixed-audio routing and playback race regression checks."""
import hashlib,json,os,re,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_level3_playback import MOCK
ROOT=Path(__file__).resolve().parents[1]
class Level5Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);cls.html=(ROOT/'level5.html').read_text()
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.page=self.browser.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.set_content(self.html.replace('<body>','<body>'+MOCK,1))
 def tearDown(self):self.page.close();self.assertEqual(self.errors,[])
 def ev(self,s):return self.page.evaluate(s)
 def test_content_routes_and_source_integrity(self):
  rows=self.ev('DATA');self.assertEqual([r['no'] for r in rows],list(range(1,1601)));self.assertEqual(self.page.locator('article.card').count(),1600);self.assertEqual(self.page.locator('.category').count(),15)
  saved=json.loads((ROOT/'study/HSK3.0_5급_1600단어_학습데이터.json').read_text());self.assertEqual(rows,saved)
  m=json.loads((ROOT/'audio/level5-natural/manifest.json').read_text());self.assertEqual(m['voice_id'],'6c364011f30747c9a0a89eec3787cadc');self.assertEqual(len(m['clips']),3200)
  self.assertEqual({(c['no'],c['kind']) for c in m['clips']},{(n,k) for n in range(1,1601) for k in ['word','example']})
  routes=self.ev('FIXED_AUDIO')
  for c in m['clips']:
   self.assertEqual(c['display_text'],rows[c['no']-1]['word' if c['kind']=='word' else 'example']);self.assertEqual(routes[str(c['no'])][c['kind']],c['file']);self.assertEqual(hashlib.sha256((ROOT/c['file']).read_bytes()).hexdigest(),c['sha256'])
  for s in m['sources']:self.assertEqual(hashlib.sha256((ROOT/s['file']).read_bytes()).hexdigest(),s['sha256'])
 def test_repeat_speed_pause_resume_and_end_selection(self):
  self.page.locator('#startNo').fill('1600');self.page.locator('#wordRepeat').select_option('2');self.page.locator('#sentenceRepeat').select_option('1');self.page.locator('#speechRate').select_option('0.9');self.page.locator('#playAllBoth').click()
  self.assertTrue(self.ev('state.currentAudio.src.endsWith("1600-word.mp3")'));self.assertEqual(self.ev('state.currentAudio.playbackRate'),.9)
  self.ev('togglePause()');self.assertTrue(self.ev('state.currentAudio.paused'));self.ev('togglePause()');self.assertFalse(self.ev('state.currentAudio.paused'))
  for count in [2,3]:
   self.ev('state.currentAudio.onended()');self.page.wait_for_function('(n)=>window.__audios.length===n',arg=count)
  self.assertTrue(self.ev('state.currentAudio.src.endsWith("1600-example.mp3")'));self.ev('state.currentAudio.onended()');self.page.wait_for_function('!state.speaking');self.assertTrue(self.page.locator('#pauseResume').is_disabled())
 def test_stale_callbacks_stop_and_audio_failure(self):
  self.ev('playQueue([{no:1,audio:fixedAudio(1,"word")}],"old");playQueue([{no:2,audio:fixedAudio(2,"word")}],"new")');self.ev('window.__audios[0].onended();window.__audios[0].onerror()');self.assertTrue(self.ev('state.currentAudio.src.endsWith("0002-word.mp3")'))
  self.ev('state.currentAudio.onerror()');self.assertFalse(self.ev('state.speaking'));self.assertIn('2번',self.page.locator('#status').inner_text());self.assertEqual(self.ev('window.__utterances.length'),0)
  self.ev('playQueue([{no:3,audio:fixedAudio(3,"word")}],"stop");stopPlayback()');self.assertFalse(self.ev('state.speaking'));self.assertTrue(self.page.locator('.play').first.is_enabled())
 def test_annotated_headword_spoken_text(self):
  self.assertEqual(self.ev('wordSpeechText({word:"本2"})'),"本")
  self.assertEqual(self.ev('wordSpeechText({word:"要不（然）"})'),"要不然")
 def test_search_and_visibility(self):
  self.page.locator('#search').fill('1600');self.assertEqual(self.page.locator('article.card').count(),1)
  for button,selector in [('pinyinToggle','.pinyin'),('meaningToggle','.meaning'),('translationToggle','.translation')]:
   self.page.locator('#'+button).click();self.assertEqual(self.page.locator(selector+':not(.hidden)').count(),0)
  self.page.locator('#startNo').fill('1249.5');self.ev('selectedItems()');self.assertEqual(self.page.locator('#startNo').input_value(),'1249')
if __name__=='__main__':unittest.main()
