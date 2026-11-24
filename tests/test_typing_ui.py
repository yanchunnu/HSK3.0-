"""Browser checks for the shared typing test. Requires Playwright and Chrome.

CHROMIUM_PATH=/usr/bin/google-chrome python -m unittest tests.test_typing_ui -v
"""
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get('ARTIFACT_DIR', '/opt/cursor/artifacts'))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return


def rgb(page, selector, prop):
    return page.locator(selector).first.evaluate(
        '(el, prop) => getComputedStyle(el)[prop]', prop)


class TypingUiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/google-chrome'),
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        self.page = self.browser.new_page(viewport={'width': 1280, 'height': 900})
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def url(self, name):
        return 'http://127.0.0.1:%s/%s' % (self.port, name)

    def open_page(self, name):
        self.page.goto(self.url(name), wait_until='domcontentloaded', timeout=60000)
        self.page.wait_for_selector('#mode-word')

    def shot(self, name):
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / name))

    def test_level1_word_range_and_red_result(self):
        self.open_page('index.html')
        self.assertEqual(self.page.locator('article.card').count(), 300)
        self.assertTrue(self.page.locator('#playAllWords').is_visible())
        self.page.locator('#mode-word').click()
        self.assertTrue(self.page.locator('#search').is_hidden())
        self.assertTrue(self.page.locator('#list').is_hidden())
        self.page.locator('#range-start').fill('4')
        self.page.locator('#range-end').fill('6')
        preview = self.page.locator('#range-preview').inner_text()
        self.assertIn('4번', preview)
        self.assertIn('6번', preview)
        self.assertIn('3문제', preview)
        self.page.screenshot(path=str(ARTIFACTS / 'level1_modes_and_range.png'), full_page=False)
        self.shot('level1_word_range.png')
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-meta').inner_text(), '4번')
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '나, 저')
        self.assertNotIn('我', self.page.locator('.question-card').inner_text())
        self.shot('level1_word_question.png')
        blocked = self.page.evaluate('''() => {
          const input = document.getElementById('typing-answer');
          const before = document.getElementById('q-progress').textContent;
          input.value = '我';
          input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}));
          input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:229, isComposing:true, bubbles:true, cancelable:true}));
          input.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', keyCode:229, isComposing:true, bubbles:true, cancelable:true}));
          const during = document.getElementById('q-progress').textContent;
          input.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true, data:'我'}));
          input.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', keyCode:13, bubbles:true, cancelable:true}));
          const justAfter = document.getElementById('q-progress').textContent;
          return {before, during, justAfter};
        }''')
        self.assertEqual(blocked['before'], blocked['during'])
        self.assertEqual(blocked['before'], blocked['justAfter'])
        self.page.wait_for_timeout(150)
        self.page.locator('#typing-answer').fill('我们')
        self.page.locator('#typing-answer').press('Enter')
        self.assertEqual(self.page.locator('#last-mark').inner_text(), '틀렸습니다')
        self.assertEqual(self.page.locator('#q-meta').inner_text(), '5번')
        self.page.locator('#typing-answer').fill('我们')
        self.page.locator('#typing-answer').press('Enter')
        self.assertEqual(self.page.locator('#last-mark').inner_text(), '맞았습니다')
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '그, 그 사람')
        self.page.locator('#typing-answer').fill('他')
        self.page.locator('#test-submit').click()
        self.assertEqual(self.page.locator('#score-fraction').inner_text(), '2/3')
        self.assertEqual(self.page.locator('#score-hundred').inner_text(), '100점 만점에 67점')
        self.assertIn('4–6', self.page.locator('#score-note').inner_text())
        wrong = self.page.locator('.result-list li.is-wrong')
        self.assertEqual(wrong.count(), 1)
        wrong_text = wrong.inner_text()
        self.assertIn('오답 · 4번', wrong_text)
        self.assertIn('정답: 我', wrong_text)
        self.assertIn('내 답: 我们', wrong_text)
        self.assertEqual(rgb(self.page, '.result-list li.is-wrong', 'color'), 'rgb(166, 27, 27)')
        self.assertEqual(rgb(self.page, '.result-list li.is-wrong', 'backgroundColor'), 'rgb(255, 241, 241)')
        self.assertEqual(self.page.locator('.result-list li.is-right').count(), 2)
        self.assertEqual(rgb(self.page, '.result-list li.is-right', 'color'), 'rgb(11, 107, 69)')
        self.shot('level1_word_result_wrong_red.png')
        self.page.locator('#mode-listen').click()
        self.assertTrue(self.page.locator('#list').is_visible())
        self.assertEqual(self.page.locator('article.card').count(), 300)
        self.assertTrue(self.page.locator('.play').first.is_enabled())

    def test_level2_sentence_range_halfwidth_and_red_result(self):
        self.open_page('level2.html')
        self.assertEqual(self.page.locator('article.card').count(), 500)
        self.page.locator('#mode-sentence').click()
        self.page.locator('#range-start').fill('1')
        self.page.locator('#range-end').fill('3')
        self.assertIn('3문제', self.page.locator('#range-preview').inner_text())
        self.shot('level2_sentence_range.png')
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '당신은 선생님인가요?')
        self.assertNotIn('你是老师吗', self.page.locator('.question-card').inner_text())
        self.shot('level2_sentence_question.png')
        self.page.locator('#typing-answer').fill('你 是 老师 吗')
        self.page.locator('#typing-answer').press('Enter')
        self.assertEqual(self.page.locator('#last-mark').inner_text(), '맞았습니다')
        self.page.locator('#typing-answer').fill('您好,请问您找谁')
        self.page.locator('#typing-answer').press('Enter')
        self.assertEqual(self.page.locator('#last-mark').inner_text(), '맞았습니다')
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '여러분은 모두 학생인가요?')
        self.page.locator('#typing-answer').fill('不对')
        self.page.locator('#typing-answer').press('Enter')
        self.assertEqual(self.page.locator('#score-fraction').inner_text(), '2/3')
        self.assertEqual(self.page.locator('#score-hundred').inner_text(), '100점 만점에 67점')
        wrong = self.page.locator('.result-list li.is-wrong')
        self.assertEqual(wrong.count(), 1)
        wrong_text = wrong.inner_text()
        self.assertIn('오답 · 3번', wrong_text)
        self.assertIn('정답: 你们都是学生吗？', wrong_text)
        self.assertIn('내 답: 不对', wrong_text)
        self.assertEqual(rgb(self.page, '.result-list li.is-wrong', 'color'), 'rgb(166, 27, 27)')
        self.shot('level2_sentence_result_wrong_red.png')
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.locator('#test-retry').click()
        self.page.wait_for_selector('#q-prompt')
        overflow = self.page.evaluate('() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
        self.assertTrue(overflow)
        self.page.screenshot(path=str(ARTIFACTS / 'level2_sentence_question_phone.png'), full_page=False)
        self.page.locator('#mode-listen').click()
        self.assertEqual(self.page.locator('article.card').count(), 500)

    def test_skip_message_and_other_levels(self):
        self.open_page('index.html')
        self.page.evaluate('''() => {
          document.getElementById('typing-test').remove();
          document.querySelector('.mode-switch').remove();
          document.body.classList.remove('typing-test-active');
          const copy = DATA.map(item => Object.assign({}, item));
          copy[0].translation = '';
          copy[2].translation = '   ';
          HskTypingTest.mount(copy);
        }''')
        self.page.locator('#mode-sentence').click()
        self.page.locator('#range-start').fill('1')
        self.page.locator('#range-end').fill('3')
        message = self.page.locator('#test-message').inner_text()
        self.assertIn('1번', message)
        self.assertIn('3번', message)
        self.assertIn('건너뛰', message)
        self.assertIn('1문제', self.page.locator('#range-preview').inner_text())
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-meta').inner_text(), '2번')
        self.page.evaluate('''() => {
          document.getElementById('typing-test').remove();
          document.querySelector('.mode-switch').remove();
          document.body.classList.remove('typing-test-active');
          const copy = DATA.slice(0, 3).map(item => Object.assign({}, item, {translation: ''}));
          HskTypingTest.mount(copy);
        }''')
        self.page.locator('#mode-sentence').click()
        self.page.locator('#range-start').fill('1')
        self.page.locator('#range-end').fill('3')
        self.assertTrue(self.page.locator('#test-start').is_disabled())
        self.assertIn('시작할 수 없습니다', self.page.locator('#test-message').inner_text())

        fresh = self.browser.new_page()
        fresh_errors = []
        fresh.on('pageerror', lambda error: fresh_errors.append(str(error)))
        for name, count in [('level3.html', 1000), ('level4.html', 1000), ('level5.html', 1600), ('level6.html', 1800)]:
            fresh.goto(self.url(name), wait_until='domcontentloaded', timeout=60000)
            fresh.wait_for_selector('#mode-sentence')
            self.assertEqual(fresh.locator('article.card').count(), count, name)
            fresh.locator('#mode-word').click()
            self.assertTrue(fresh.locator('#typing-test').is_visible())
            self.assertEqual(fresh.locator('#test-title').inner_text(), '단어 시험')
            fresh.locator('#mode-sentence').click()
            self.assertEqual(fresh.locator('#test-title').inner_text(), '예문 시험')
            fresh.locator('#mode-listen').click()
            self.assertEqual(fresh.locator('article.card').count(), count, name)
        fresh.close()
        self.assertEqual(fresh_errors, [])

    def test_pronunciation_mock_range_retry_and_unsupported(self):
        self.open_page('index.html')
        self.page.evaluate('''() => {
          window.__recogStarted = [];
          window.__recogQueue = [];
          function FakeRecognition() {
            this.lang = '';
            this.interimResults = true;
            this.maxAlternatives = 1;
            this.continuous = false;
          }
          FakeRecognition.prototype.start = function () {
            const job = window.__recogQueue.shift() || {alts: []};
            const self = this;
            window.__recogStarted.push({lang: self.lang, interim: self.interimResults, max: self.maxAlternatives});
            setTimeout(function () {
              if (job.error) {
                if (self.onerror) self.onerror({error: job.error});
              } else {
                const result = {length: job.alts.length, isFinal: true};
                job.alts.forEach(function (text, index) { result[index] = {transcript: text}; });
                if (self.onresult) self.onresult({results: [result]});
              }
              if (self.onend) self.onend();
            }, 0);
          };
          FakeRecognition.prototype.abort = function () {};
          FakeRecognition.prototype.stop = function () {};
          window.SpeechRecognition = FakeRecognition;
          window.webkitSpeechRecognition = FakeRecognition;
          const lib = document.getElementById('pinyin-pro-lib');
          if (lib) lib.remove();
          window.pinyinPro = {pinyin: function (text) {
            const table = {"你": ["ni"], "我": ["wo"], "我们": ["wo", "men"], "他": ["ta"], "人": ["ren"], "您": ["nin"], "拧": ["ning"], "宁": ["ning"]};
            return table[text] || null;
          }};
        }''')
        self.page.locator('#mode-pronounce').click()
        self.assertIn('성조', self.page.locator('#test-help').inner_text())
        self.assertIn('소리가 같으면', self.page.locator('#test-help').inner_text())
        self.page.locator('#range-start').fill('4')
        self.page.locator('#range-end').fill('6')
        preview = self.page.locator('#range-preview').inner_text()
        self.assertIn('4번', preview)
        self.assertIn('6번', preview)
        self.assertIn('3문제', preview)
        self.page.screenshot(path=str(ARTIFACTS / 'pronounce_range.png'), full_page=False)
        self.page.locator('#pronounce-sentence').click()
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '我是学生。')
        self.assertNotIn('학생', self.page.locator('#q-prompt').inner_text())
        self.page.locator('#mode-pronounce').click()
        self.page.locator('#pronounce-word').click()
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '我')
        self.assertNotIn('나, 저', self.page.locator('.question-card').inner_text())
        self.page.set_viewport_size({'width': 390, 'height': 844})
        overflow = self.page.evaluate('() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
        self.assertTrue(overflow)
        self.page.screenshot(path=str(ARTIFACTS / 'pronounce_question_phone.png'), full_page=False)
        self.page.set_viewport_size({'width': 1280, 'height': 900})
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_question.png'))
        self.page.evaluate('''() => {
          window.__recogQueue = [
            {alts: ['你']},
            {alts: ['你']},
            {alts: ['你']},
            {alts: ['我们']},
            {alts: ['他']}
          ];
        }''')
        self.page.locator('#mic-button').click()
        self.page.wait_for_function("() => document.getElementById('heard').textContent.includes('ni') && !document.getElementById('heard').textContent.includes('你')")
        self.assertEqual(self.page.locator('#q-meta').inner_text(), '4번')
        self.assertIn('1/3', self.page.locator('#last-mark').inner_text())
        started = self.page.evaluate('window.__recogStarted[0]')
        self.assertEqual(started['lang'], 'zh-CN')
        self.assertEqual(started['interim'], True)
        self.assertIn('두 번', self.page.locator('#repeat-hint').inner_text())
        self.assertIn('我我', self.page.locator('#repeat-hint').inner_text())
        self.assertGreaterEqual(started['max'], 5)
        self.assertTrue(self.page.locator('#pronounce-skip').is_visible())
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_heard_retry.png'))
        self.page.locator('#mic-button').click()
        self.page.wait_for_function("() => document.getElementById('try-count').textContent.includes('남은 기회 1')")
        self.page.locator('#mic-button').click()
        self.page.wait_for_selector('#pronounce-fail')
        self.assertEqual(self.page.locator('#q-meta').inner_text(), '4번')
        fail = self.page.locator('#pronounce-fail').inner_text()
        self.assertIn('틀렸습니다', fail)
        self.assertIn('정답: wǒ', fail)
        self.assertNotIn('我', fail)
        self.assertNotIn('병음', fail)
        self.assertIn('들은 말: ni', fail)
        self.assertNotIn('你', fail)
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '我')
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_pinyin_only_fail.png'))
        self.page.wait_for_function("() => document.getElementById('q-meta').textContent === '5번'", timeout=4000)
        self.page.locator('#mic-button').click()
        self.page.wait_for_function("() => document.getElementById('q-meta').textContent === '6번'")
        self.assertIn('맞았습니다', self.page.locator('#last-mark').inner_text())
        self.page.locator('#mic-button').click()
        self.page.wait_for_function("() => document.getElementById('score-fraction').textContent === '2/3'")
        self.assertEqual(self.page.locator('#score-hundred').inner_text(), '100점 만점에 67점')
        wrong = self.page.locator('.result-list li.is-wrong')
        self.assertEqual(wrong.count(), 1)
        wrong_text = wrong.inner_text()
        self.assertIn('오답 · 4번', wrong_text)
        self.assertIn('정답: wǒ', wrong_text)
        self.assertNotIn('我', wrong_text)
        self.assertIn('들은 말: ni', wrong_text)
        self.assertNotIn('你', wrong_text)
        self.assertEqual(rgb(self.page, '.result-list li.is-wrong', 'color'), 'rgb(166, 27, 27)')
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_pinyin_only_result.png'))
        self.page.locator('#mode-listen').click()
        self.assertEqual(self.page.locator('article.card').count(), 300)

        self.page.locator('#mode-pronounce').click()
        self.page.locator('#range-start').fill('1')
        self.page.locator('#range-end').fill('2')
        self.page.locator('#test-start').click()
        self.assertTrue(self.page.locator('#pronounce-skip').is_visible())
        self.page.locator('#pronounce-skip').click()
        self.page.wait_for_function("() => document.getElementById('q-meta').textContent === '2번'")
        self.page.locator('#pronounce-skip').click()
        self.page.wait_for_function("() => document.getElementById('score-fraction').textContent === '0/2'")
        skipped = self.page.locator('.result-list li.is-wrong')
        self.assertEqual(skipped.count(), 2)
        self.assertIn('건너뜀 · 1번', skipped.nth(0).inner_text())
        self.assertIn('들은 말: (건너뜀)', skipped.nth(0).inner_text())
        self.assertIn('건너뜀 · 2번', skipped.nth(1).inner_text())
        self.assertEqual(rgb(self.page, '.result-list li.is-wrong', 'color'), 'rgb(166, 27, 27)')
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_skip_result.png'))

        self.page.evaluate('''() => {
          window.pinyinPro = {pinyin: function (text) {
            const table = {"你": ["ni"], "拧": ["ning"], "宁": ["ning"], "您": ["nin"], "人": ["ren"]};
            return table[text] || ["xx"];
          }};
          window.__recogQueue = [{alts: ["人", "你"]}];
        }''')
        self.page.locator('#test-back').click()
        self.page.locator('#range-start').fill('2')
        self.page.locator('#range-end').fill('2')
        self.page.locator('#test-start').click()
        self.assertEqual(self.page.locator('#q-prompt').inner_text(), '您')
        self.page.locator('#mic-button').click()
        self.page.wait_for_function("() => document.getElementById('score-fraction').textContent === '1/1'")
        nin = self.page.locator('.result-list li.is-right').inner_text()
        self.assertIn('정답: nín', nin)
        self.assertNotIn('您', nin)
        self.assertIn('들은 말: ren / ni', nin)
        self.assertNotIn('人', nin)
        self.assertNotIn('你', nin)
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_lenient_nin.png'))

        bare = self.browser.new_page(viewport={'width': 1280, 'height': 900})
        bare_errors = []
        bare.on('pageerror', lambda error: bare_errors.append(str(error)))
        bare.goto(self.url('index.html'), wait_until='domcontentloaded', timeout=60000)
        bare.wait_for_selector('#mode-pronounce')
        bare.evaluate('''() => {
          window.SpeechRecognition = undefined;
          window.webkitSpeechRecognition = undefined;
        }''')
        bare.locator('#mode-pronounce').click()
        notice = bare.locator('#pronounce-support').inner_text()
        self.assertIn('Chrome', notice)
        self.assertIn('Safari', notice)
        self.assertIn('카카오톡', notice)
        self.assertTrue(bare.locator('#test-start').is_disabled())
        bare.screenshot(path=str(ARTIFACTS / 'pronounce_unsupported.png'), full_page=False)
        bare.close()
        self.assertEqual(bare_errors, [])

    def test_level1_number_words_accept_arabic_digits(self):
        self.open_page('index.html')
        self.page.evaluate('''() => {
          window.__recogQueue = [];
          function FakeRecognition() {}
          FakeRecognition.prototype.start = function () {
            const job = window.__recogQueue.shift() || {alts: []};
            const self = this;
            setTimeout(function () {
              if (self.onaudiostart) self.onaudiostart();
              const result = {length: job.alts.length, isFinal: true};
              job.alts.forEach(function (text, index) { result[index] = {transcript: text}; });
              if (self.onresult) self.onresult({results: [result]});
              if (self.onend) self.onend();
            }, 0);
          };
          FakeRecognition.prototype.abort = function () {};
          FakeRecognition.prototype.stop = function () {};
          window.SpeechRecognition = FakeRecognition;
          window.webkitSpeechRecognition = FakeRecognition;
          const reading = {"零":"ling","一":"yi","二":"er","两":"liang","三":"san","四":"si","五":"wu","六":"liu","七":"qi","八":"ba","九":"jiu","十":"shi","百":"bai","千":"qian","万":"wan","点":"dian","幺":"yao","分":"fen","之":"zhi","个":"ge"};
          window.pinyinPro = {pinyin: function (text) {
            const out = [];
            for (const ch of text) if (reading[ch]) out.push(reading[ch]);
            return out;
          }};
        }''')
        cases = [('44', '1', '一', 'yī', 'yi / yao'), ('45', '2', '二', 'èr', 'er / liang'), ('46', '2', '两', 'liǎng', 'er / liang'), ('54', '１０', '十', 'shí', 'shi'), ('55', '100', '百', 'bǎi', 'yi bai')]
        for number, heard, hanzi, answer, heard_py in cases:
            self.page.locator('#mode-pronounce').click()
            self.page.locator('#pronounce-word').click()
            self.page.locator('#range-start').fill(number)
            self.page.locator('#range-end').fill(number)
            self.page.locator('#test-start').click()
            self.assertEqual(self.page.locator('#q-prompt').inner_text(), hanzi)
            if hanzi == '一':
                self.assertIn('一一', self.page.locator('#repeat-hint').inner_text())
            self.page.evaluate('''(text) => { window.__recogQueue = [{alts: [text]}]; }''', heard)
            self.page.locator('#mic-button').click()
            self.page.wait_for_function('''(answer) => {
              const result = document.getElementById('test-result');
              const score = document.getElementById('score-fraction');
              const row = document.querySelector('.result-list li');
              return result && !result.hidden && score && score.textContent === '1/1' && row && row.innerText.includes('정답: ' + answer);
            }''', arg=answer)
            row = self.page.locator('.result-list li.is-right').inner_text()
            self.assertIn('정답: ' + answer, row)
            self.assertNotIn(hanzi, row)
            self.assertIn('들은 말: ' + heard_py, row)
            self.assertNotIn('(' + heard + ')', row)
        self.page.locator('#typing-test').screenshot(path=str(ARTIFACTS / 'pronounce_pinyin_only_bai.png'))


if __name__ == '__main__':
    unittest.main()
