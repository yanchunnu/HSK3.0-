"""Grade-2 fixed reference voice and audio-only playback integration checks."""
import hashlib,json,os,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_level3_playback import MOCK
ROOT=Path(__file__).resolve().parents[1]
class Level2Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);cls.html=(ROOT/'level2.html').read_text()
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.page=self.browser.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.set_content(self.html.replace('<body>','<body>'+MOCK,1))
 def tearDown(self):self.page.close();self.assertEqual(self.errors,[])
 def ev(self,code):return self.page.evaluate(code)
 def test_500_entries_and_all_1000_clips_use_reference_voice(self):
  data=self.ev('DATA');self.assertEqual([r['no'] for r in data],list(range(1,501)));self.assertEqual(self.page.locator('article.card').count(),500);self.assertEqual(data,json.loads((ROOT/'study/HSK3.0_2급_500단어_학습데이터.json').read_text()))
  m=json.loads((ROOT/'audio/level2-natural/manifest.json').read_text());ref=json.loads((ROOT/'audio/level4-natural/manifest.json').read_text());self.assertEqual(m['voice_id'],ref['voice_id']);self.assertEqual(m['requested_speed'],ref['requested_speed']);self.assertEqual(len(m['clips']),1000);self.assertEqual({(c['no'],c['kind']) for c in m['clips']},{(n,k) for n in range(1,501) for k in ['word','example']});routes=self.ev('FIXED_AUDIO')
  for c in m['clips']:
   row=data[c['no']-1];self.assertEqual(c['display_text'],row['word' if c['kind']=='word' else 'example']);self.assertEqual(c['pinyin'],row['pinyin' if c['kind']=='word' else 'examplePinyin']);self.assertEqual(routes[str(c['no'])][c['kind']].split('?')[0],c['file']);self.assertEqual(hashlib.sha256((ROOT/c['file']).read_bytes()).hexdigest(),c['sha256'])
   if 'source_clip'in c:self.assertEqual(hashlib.sha256((ROOT/c['source_clip']).read_bytes()).hexdigest(),c['source_sha256'])
  for s in m['sources']:self.assertEqual(hashlib.sha256((ROOT/s['file']).read_bytes()).hexdigest(),s['sha256'])
  self.assertEqual(self.page.get_by_role('link',name='1급 복습하기').get_attribute('href'),'index.html');self.assertEqual(self.page.get_by_role('link',name='2급 PDF 내려받기').get_attribute('href'),'HSK3.0_2급단어장_표지포함.pdf');self.assertEqual(self.page.locator('nav a').count(),2)
 def test_recorded_audio_works_without_device_voice_repeat_pause_resume(self):
  self.assertNotIn('speechSynthesis',self.html);self.ev('Object.defineProperty(window,"speechSynthesis",{value:undefined})');self.page.locator('#startNo').fill('500');self.page.locator('#wordRepeat').select_option('2');self.page.locator('#sentenceRepeat').select_option('1');self.page.locator('#speechRate').select_option('0.9');self.page.locator('#playAllBoth').click();self.assertEqual(self.ev('state.currentAudio.playbackRate'),.9);self.assertTrue(self.ev('state.currentAudio.src.includes("0500-word.mp3")'));self.ev('togglePause()');self.assertTrue(self.ev('state.currentAudio.paused'));self.ev('togglePause()');self.assertFalse(self.ev('state.currentAudio.paused'))
  for n in [2,3]:self.ev('state.currentAudio.onended()');self.page.wait_for_function('(n)=>window.__audios.length===n',arg=n)
  self.assertTrue(self.ev('state.currentAudio.src.includes("0500-example.mp3")'));self.ev('state.currentAudio.onended()');self.page.wait_for_function('!state.speaking');self.assertEqual(self.ev('window.__utterances.length'),0)
 def test_errors_stop_and_stale_callbacks_do_not_advance_new_queue(self):
  self.ev('playQueue([{no:1,audio:fixedAudio(1,"word")}],"old");playQueue([{no:2,audio:fixedAudio(2,"word")}],"new");window.__audios[0].onended();window.__audios[0].onerror()');self.assertTrue(self.ev('state.currentAudio.src.includes("0002-word.mp3")'));self.ev('state.currentAudio.onerror()');self.assertFalse(self.ev('state.speaking'));self.assertTrue(self.page.locator('#pauseResume').is_disabled());self.assertIn('2번',self.page.locator('#status').inner_text())
  self.ev('playQueue([{no:1,audio:fixedAudio(1,"word")},{no:2,audio:fixedAudio(2,"word")}],"stop");state.currentAudio.onended();stopPlayback()');self.page.wait_for_timeout(500);self.assertEqual(self.ev('window.__audios.length'),3)
 def test_start_number_search_and_visibility(self):
  self.page.locator('#startNo').fill('499.5');self.ev('selectedItems()');self.assertEqual(self.page.locator('#startNo').input_value(),'499');self.page.locator('#startNo').fill('999');self.ev('selectedItems()');self.assertEqual(self.page.locator('#startNo').input_value(),'500');self.page.locator('#search').fill('男孩儿');self.assertGreater(self.page.locator('article.card').count(),0)
  for button,selector in [('pinyinToggle','.pinyin'),('meaningToggle','.meaning'),('translationToggle','.translation')]:self.page.locator('#'+button).click();self.assertEqual(self.page.locator(selector+':not(.hidden)').count(),0)
if __name__=='__main__':unittest.main()
