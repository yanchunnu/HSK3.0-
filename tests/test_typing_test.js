const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../typing-test.js');

function readData(name) {
  const text = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const match = text.match(/const DATA = (\[.*?\]);\r?\n/);
  assert.ok(match, name + ' has DATA');
  return JSON.parse(match[1]);
}

const files = ['index.html', 'level2.html', 'level3.html', 'level4.html', 'level5.html', 'level6.html'];

function testSentences() {
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '你是老师吗?'), true);
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '你是老师吗'), true);
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '你 是 老师 吗？'), true);
  assert.strictEqual(api.sentencesMatch('您好，请问您找谁？', '您好,请问您找谁'), true);
  assert.strictEqual(api.sentencesMatch('您好，请问您找谁？', '您好，请问您找谁?'), true);
  assert.strictEqual(api.sentencesMatch('老师，再见！', '老师,再见'), true);
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '你是老师。'), false);
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '你是学生吗'), false);
  assert.strictEqual(api.sentencesMatch('你是老师吗？', '   '), false);
  assert.strictEqual(api.sentencesMatch('他有很多爱好，例如画画、摄影和游泳。', '他有很多爱好,例如画画、摄影和游泳'), true);
  assert.strictEqual(api.sentencesMatch('他有很多爱好，例如画画、摄影和游泳。', '他有很多爱好,例如画画,摄影和游泳'), false);
  assert.strictEqual(api.sentencesMatch('首先，这家店价格低；其次，服务也不错。', '首先,这家店价格低;其次,服务也不错'), true);
  assert.strictEqual(api.sentencesMatch('“百发百中”是一个常用的成语。', '"百发百中"是一个常用的成语'), true);
  assert.strictEqual(api.sentencesMatch('他正在用GPS进行定位，寻找目的地。', '他正在用gps进行定位,寻找目的地'), true);
  assert.strictEqual(api.sentencesMatch('公元2020年是不平凡的一年。', '公元２０２０年是不平凡的一年'), true);
  assert.strictEqual(api.sentencesMatch('他说“好”。', '他说"好"'), true);
  assert.strictEqual(api.sentencesMatch('他说“好”。', '他说好'), false);
}

function testWords() {
  assert.strictEqual(api.wordMatches({word: '你'}, '你'), true);
  assert.strictEqual(api.wordMatches({word: '你'}, ' 你 '), true);
  assert.strictEqual(api.wordMatches({word: '你'}, '我'), false);
  assert.strictEqual(api.wordMatches({word: '你'}, 'ni'), false);
  assert.strictEqual(api.wordMatches({word: '你'}, ''), false);
  assert.strictEqual(api.wordMatches({word: '没(有)'}, '没有'), true);
  assert.strictEqual(api.wordMatches({word: '没(有)'}, '没'), true);
  assert.strictEqual(api.wordMatches({word: '没(有)'}, '没（有）'), true);
  assert.strictEqual(api.wordMatches({word: '没(有)'}, '有'), false);
  assert.strictEqual(api.wordMatches({word: '有(一)点儿'}, '有一点儿'), true);
  assert.strictEqual(api.wordMatches({word: '有(一)点儿'}, '有点儿'), true);
  assert.strictEqual(api.wordMatches({word: '有(一)点儿'}, '有一点'), false);
  assert.deepStrictEqual(api.wordForms({word: '有时（候）'}), ['有时候', '有时']);
  assert.strictEqual(api.wordMatches({word: '差（一）点儿'}, '差点儿'), true);
  assert.strictEqual(api.wordMatches({word: '要不（然）'}, '要不'), true);
  assert.strictEqual(api.wordMatches({word: '凡（是）'}, '凡是'), true);
  assert.strictEqual(api.wordMatches({word: '面¹'}, '面'), true);
  assert.strictEqual(api.wordMatches({word: '面¹'}, '面1'), true);
  assert.strictEqual(api.wordMatches({word: '成年1'}, '成年'), true);
  assert.strictEqual(api.wordMatches({word: '称2'}, '称'), true);
  assert.strictEqual(api.wordMatches({word: '称2'}, '称２'), true);
  assert.strictEqual(api.displayWord({word: '没(有)'}), '没有 또는 没');
}

function testEnterAndScore() {
  const base = {composing: false, blockEnterUntil: 0, now: 1000};
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'Enter', isComposing: false, keyCode: 13}, base), true);
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'Enter', isComposing: true, keyCode: 13}, base), false);
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'Enter', isComposing: false, keyCode: 229}, base), false);
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'Enter', isComposing: false, keyCode: 13}, {composing: true, blockEnterUntil: 0, now: 1000}), false);
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'Enter', isComposing: false, keyCode: 13}, {composing: false, blockEnterUntil: 1100, now: 1000}), false);
  assert.strictEqual(api.shouldSubmitOnEnter({key: 'a', isComposing: false, keyCode: 65}, base), false);
  assert.strictEqual(api.scoreOutOf100(17, 20), 85);
  assert.strictEqual(api.scoreOutOf100(2, 3), 67);
  assert.strictEqual(api.scoreOutOf100(0, 5), 0);
  assert.strictEqual(api.scoreOutOf100(0, 0), 0);
}

function testPages() {
  const half = {'。': '.', '？': '?', '！': '!', '，': ',', '；': ';'};
  files.forEach(function (name) {
    const data = readData(name);
    let missing = 0;
    data.forEach(function (item) {
      if (!api.hasKoreanTranslation(item)) missing += 1;
      assert.strictEqual(api.wordMatches(item, item.word), true, name + ' ' + item.no + ' ' + item.word);
      assert.strictEqual(api.wordMatches(item, api.displayWord(item).split(' 또는 ')[0]), true);
      assert.strictEqual(api.sentencesMatch(item.example, item.example), true, name + ' example ' + item.no);
      const loosened = item.example.replace(/[。？！，；]/g, function (ch) { return half[ch]; }).replace(/[.!?]$/, '');
      const spaced = loosened.split('').join(' ');
      assert.strictEqual(api.sentencesMatch(item.example, spaced), true, name + ' loose ' + item.no + ' ' + item.example);
    });
    assert.strictEqual(missing, 0, name + ' missing translations');
    const plan = api.sentencePlan(api.selectRange(data, 1, data.length));
    assert.strictEqual(plan.skipped.length, 0);
    assert.strictEqual(plan.queue.length, data.length);
  });
  const sample = [
    {no: 1, word: '你', meaning: '너', example: '你好。', translation: '안녕'},
    {no: 2, word: '我', meaning: '나', example: '我来了。', translation: '   '},
    {no: 3, word: '他', meaning: '그', example: '他来了。', translation: ''}
  ];
  const part = api.sentencePlan(api.selectRange(sample, 1, 3));
  assert.deepStrictEqual(part.queue.map(function (item) { return item.no; }), [1]);
  assert.deepStrictEqual(part.skipped.map(function (item) { return item.no; }), [2, 3]);
  const none = api.sentencePlan(api.selectRange(sample, 2, 3));
  assert.strictEqual(none.queue.length, 0);
  assert.strictEqual(none.skipped.length, 2);
}

function testPronunciation() {
  assert.strictEqual(api.pronunciationMatches({word: '我'}, '我', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '我'}, ' 我。 ', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '我'}, '我?', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '我'}, '你', 'word'), false);
  assert.strictEqual(api.pronunciationMatches({word: '没(有)'}, '没有', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '没(有)'}, '没', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '没(有)'}, '有', 'word'), false);
  assert.strictEqual(api.pronunciationMatches({word: '面¹'}, '面', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '面¹'}, '面1', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '成年1'}, '成年', 'word'), true);
  assert.strictEqual(api.pronunciationMatches({word: '你是老师吗？', example: '你是老师吗？'}, '你 是 老师 吗', 'sentence'), true);
  assert.strictEqual(api.pronunciationMatches({example: '他说“好”。'}, '他说好', 'sentence'), true);
  assert.strictEqual(api.pronunciationMatches({example: '你是老师吗？'}, '你是学生吗', 'sentence'), false);
  assert.strictEqual(api.pronunciationAnyMatch({word: '我'}, ['你', '我'], 'word'), true);
  assert.strictEqual(api.pronunciationAnyMatch({word: '我'}, ['你', '他'], 'word'), false);
  assert.strictEqual(api.pronunciationBlocker({secure: true, hasRecognition: false}), 'unsupported');
  assert.strictEqual(api.pronunciationBlocker({secure: false, hasRecognition: true}), 'insecure');
  assert.strictEqual(api.pronunciationBlocker({secure: true, hasRecognition: true}), '');
  assert.ok(api.pronunciationSupportMessage('unsupported').includes('Chrome'));
  assert.ok(api.pronunciationSupportMessage('unsupported').includes('Safari'));
  assert.ok(api.pronunciationSupportMessage('unsupported').includes('카카오톡'));
  assert.ok(api.pronunciationSupportMessage('insecure').includes('HTTPS'));
  const nin = {word: '您', pinyin: 'nín', example: '您好。', examplePinyin: 'nín hǎo.'};
  const dict = {'你': ['ni'], '拧': ['ning'], '宁': ['ning'], '人': ['ren'], '您': ['nin']};
  const syllables = function (text) { return dict[text] || null; };
  assert.strictEqual(api.pronunciationLenientMatch(nin, ['你'], 'word', syllables), true);
  assert.strictEqual(api.pronunciationLenientMatch(nin, ['拧'], 'word', syllables), true);
  assert.strictEqual(api.pronunciationLenientMatch(nin, ['宁'], 'word', syllables), true);
  assert.strictEqual(api.pronunciationLenientMatch(nin, ['人'], 'word', syllables), false);
  assert.strictEqual(api.pronunciationLenientMatch(nin, ['人', '你'], 'word', syllables), true);
  assert.strictEqual(api.pronunciationLenientMatch({word: '我', pinyin: 'wǒ'}, ['我'], 'word', null), true);
  assert.strictEqual(api.pronunciationLenientMatch({word: '我', pinyin: 'wǒ'}, ['你'], 'word', syllables), false);
  const sentence = {example: '你是老师吗？', examplePinyin: 'nǐ shì lǎoshī ma?', pinyin: ''};
  assert.strictEqual(api.pronunciationLenientMatch(sentence, ['你是老师吗'], 'sentence', function () {
    return ['ni', 'shi', 'lao', 'shi', 'ma'];
  }), true);
  files.forEach(function (name) {
    readData(name).forEach(function (item) {
      assert.strictEqual(api.pinyinResidue(item.pinyin), '', name + ' ' + item.no + ' ' + item.pinyin);
      if (!/\b[A-Z]{2,}\b/.test(item.examplePinyin || '')) {
        assert.strictEqual(api.pinyinResidue(item.examplePinyin), '', name + ' ex ' + item.no + ' ' + item.examplePinyin);
      }
    });
  });
}

function testPagesWired() {
  files.forEach(function (name) {
    const text = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert.ok(text.includes('typing-test.css'), name + ' css');
    assert.ok(text.includes('typing-test.js'), name + ' js');
    assert.ok(text.includes('HskTypingTest.mount(DATA)'), name + ' mount');
  });
}

testSentences();
testWords();
testEnterAndScore();
testPronunciation();
testPages();
testPagesWired();
console.log('typing test checks passed');
