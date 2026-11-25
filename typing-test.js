/* Shared typing test for the six HSK 3.0 study pages.
   Each page embeds `const DATA` and calls HskTypingTest.mount(DATA).
   A word entry is {no, word, meaning, example, translation}.
   Parentheses in a headword mark optional characters (没(有), 有(一)点儿).
   A trailing digit or superscript is a printed sense number (面¹, 成年1), not part of the hanzi. */
(function (root, factory) {
  const api = factory();
  root.HskTypingTest = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FINAL_PUNCT = '.!?';
  const QUOTE_TO_STRAIGHT = {
    '\u3002': '.',
    '\uFF61': '.',
    '\u201C': '"',
    '\u201D': '"',
    '\u300C': '"',
    '\u300D': '"',
    '\u300E': '"',
    '\u300F': '"',
    '\u2018': "'",
    '\u2019': "'",
    '\u300A': '"',
    '\u300B': '"'
  };

  function stripIgnorable(value) {
    return String(value || '').replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '');
  }

  function normalizeSentence(value) {
    const mapped = stripIgnorable(value).normalize('NFKC');
    let out = '';
    for (const ch of mapped) {
      if (/\s/u.test(ch)) continue;
      const replaced = Object.prototype.hasOwnProperty.call(QUOTE_TO_STRAIGHT, ch) ? QUOTE_TO_STRAIGHT[ch] : ch;
      out += /[A-Za-z]/.test(replaced) ? replaced.toLowerCase() : replaced;
    }
    return out;
  }

  function sentencesMatch(expected, given) {
    const exp = normalizeSentence(expected);
    const got = normalizeSentence(given);
    if (!exp || !got) return false;
    if (exp === got) return true;
    const last = exp.charAt(exp.length - 1);
    if (FINAL_PUNCT.indexOf(last) !== -1 && exp.slice(0, -1) === got) return true;
    const tail = exp.match(/^(.*?)([.!?])(["']+)$/);
    if (tail && tail[1] + tail[3] === got) return true;
    return false;
  }

  function expandWord(source) {
    const normalized = stripIgnorable(source)
      .normalize('NFKC')
      .replace(/[\s\u3000]/g, '')
      .replace(/(\p{Script=Han})\d+/gu, '$1');
    const tokens = [];
    const re = /\(([^)]*)\)|[^()]+/g;
    let match;
    while ((match = re.exec(normalized))) {
      if (match[0].charAt(0) === '(') tokens.push({optional: match[1]});
      else tokens.push({text: match[0]});
    }
    if (!tokens.length) return normalized ? [normalized] : [];
    const optionalCount = tokens.filter(function (token) { return token.optional !== undefined; }).length;
    const forms = [];
    const limit = 1 << optionalCount;
    for (let mask = limit - 1; mask >= 0; mask--) {
      let optionalIndex = 0;
      let text = '';
      tokens.forEach(function (token) {
        if (token.optional !== undefined) {
          if (mask & (1 << optionalIndex)) text += token.optional;
          optionalIndex += 1;
        } else {
          text += token.text;
        }
      });
      if (text && forms.indexOf(text) === -1) forms.push(text);
    }
    return forms;
  }

  function wordForms(item) {
    const forms = [];
    expandWord(item && item.word).forEach(function (form) {
      if (forms.indexOf(form) === -1) forms.push(form);
    });
    return forms;
  }

  function normalizeWordAnswer(value) {
    return stripIgnorable(value)
      .normalize('NFKC')
      .replace(/[\s\u3000]/g, '')
      .replace(/[()]/g, '')
      .replace(/(\p{Script=Han})\d+/gu, '$1');
  }

  function wordMatches(item, given) {
    const answer = normalizeWordAnswer(given);
    if (!answer) return false;
    return wordForms(item).indexOf(answer) !== -1;
  }

  function displayWord(item) {
    return wordForms(item).join(' 또는 ');
  }

  function hasKoreanTranslation(item) {
    return !!(item && typeof item.translation === 'string' && item.translation.trim());
  }

  function selectRange(data, start, end) {
    return (data || []).filter(function (item) {
      return item && item.no >= start && item.no <= end;
    });
  }

  function sentencePlan(selected) {
    const queue = [];
    const skipped = [];
    (selected || []).forEach(function (item) {
      if (hasKoreanTranslation(item)) queue.push(item);
      else skipped.push(item);
    });
    return {queue: queue, skipped: skipped};
  }

  function shouldSubmitOnEnter(event, state) {
    if (!event || event.key !== 'Enter') return false;
    if (event.isComposing || (state && state.composing) || event.keyCode === 229) return false;
    if (state && state.blockEnterUntil && state.now < state.blockEnterUntil) return false;
    return true;
  }

  function scoreOutOf100(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 100);
  }

  function skipMessage(skipped) {
    const nos = skipped.map(function (item) { return item.no + '번'; });
    const list = nos.length <= 8 ? nos.join(', ') : nos.slice(0, 8).join(', ') + ' 외 ' + (nos.length - 8) + '개';
    return '한국어 해석이 없어 건너뛰는 항목: ' + list + '.';
  }

  function shortText(value) {
    const text = String(value || '').trim();
    if (text.length <= 22) return text;
    return text.slice(0, 22) + '…';
  }

  function normalizePronunciation(value, stripSenseNumbers) {
    const mapped = stripIgnorable(value).normalize('NFKC');
    let out = '';
    for (const ch of mapped) {
      if (/\s/u.test(ch)) continue;
      if (!/[\p{Script=Han}\p{Letter}\p{Number}]/u.test(ch)) continue;
      out += /[A-Za-z]/.test(ch) ? ch.toLowerCase() : ch;
    }
    if (stripSenseNumbers) out = out.replace(/(\p{Script=Han})\d+/gu, '$1');
    return out;
  }

  function pronunciationMatches(item, transcript, kind) {
    const heard = normalizePronunciation(transcript, kind !== 'sentence');
    if (!heard || !item) return false;
    if (kind === 'sentence') return heard === normalizePronunciation(item.example, false);
    return wordForms(item).some(function (form) {
      return normalizePronunciation(form, true) === heard;
    });
  }

  function pronunciationAnyMatch(item, transcripts, kind) {
    return (transcripts || []).some(function (text) {
      return pronunciationMatches(item, text, kind);
    });
  }

  function isAndroidChrome(ua) {
    const text = String(ua || '');
    if (!/Android/i.test(text)) return false;
    if (/SamsungBrowser/i.test(text) || /; wv\)/.test(text)) return false;
    if (/EdgA\/|Edg\/|OPR\/|Opera Mini|Firefox\//i.test(text)) return false;
    return /Chrome\/[\d.]+/.test(text);
  }

  function shouldOfferChrome(ua, hasRecognition) {
    const text = String(ua || '');
    if (!/Android/i.test(text) || isAndroidChrome(text)) return false;
    if (/SamsungBrowser/i.test(text) || /; wv\)/.test(text)) return true;
    return !hasRecognition;
  }

  function chromeIntentHref(pathname, search) {
    const path = String(pathname || '');
    const marker = '/HSK3.0-/';
    const at = path.indexOf(marker);
    const rest = at >= 0 ? path.slice(at + marker.length) : path.replace(/^\/+/, '');
    return 'intent://yanchunnu.github.io/HSK3.0-/' + rest + (search || '') + '#Intent;scheme=https;package=com.android.chrome;end';
  }

  function pronunciationBlocker(env) {
    if (!env || !env.hasRecognition) return env && env.samsung ? 'samsung' : 'unsupported';
    if (!env.secure) return 'insecure';
    return '';
  }

  function pronunciationSupportMessage(blocker) {
    if (blocker === 'insecure') return '음성 인식은 보안 연결(HTTPS)에서만 동작합니다. GitHub Pages 주소(https)로 열어 주세요.';
    if (blocker === 'samsung') return '삼성 인터넷에서는 음성 인식이 되지 않습니다. Chrome으로 열어 주세요.';
    if (blocker === 'unsupported') return '이 브라우저는 음성 인식을 지원하지 않습니다. 안드로이드에서는 Chrome, 아이폰에서는 Safari 또는 Chrome을 사용해 주세요. 카카오톡처럼 앱 안에서 열면 마이크가 막히는 경우가 많습니다.';
    return '';
  }

  const TONE_MARKS = {
    ā:'a', á:'a', ǎ:'a', à:'a', ē:'e', é:'e', ě:'e', è:'e',
    ī:'i', í:'i', ǐ:'i', ì:'i', ō:'o', ó:'o', ǒ:'o', ò:'o',
    ū:'u', ú:'u', ǔ:'u', ù:'u', ǖ:'v', ǘ:'v', ǚ:'v', ǜ:'v', ü:'v',
    ń:'n', ň:'n', ǹ:'n', ḿ:'m'
  };
  const PINYIN_SYLLABLES = new Set(('a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ' +
    'ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo ' +
    'da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er ' +
    'fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ' +
    'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ' +
    'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo ' +
    'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu lv lve luan lun luo ' +
    'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu ' +
    'na nai nan nang nao ne nei nen neng ng ni nian niang niao nie nin ning niu nong nou nu nv nve nuan nun nuo ' +
    'o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu ' +
    'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ' +
    'ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo ' +
    'sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ' +
    'ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo ' +
    'wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ' +
    'ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun ' +
    'za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo'
  ).split(' '));

  function normalizePinyin(value) {
    // ü, v, and u: are the same vowel. Tone numbers (ni3) are removed later with other non-letters.
    const prepared = String(value || '').toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
    let out = '';
    for (const ch of prepared) out += TONE_MARKS[ch] || ch;
    return out;
  }

  function tonelessLetters(value) {
    return normalizePinyin(value).replace(/[^a-z]/g, '');
  }

  function segmentLetters(letters) {
    const memo = new Array(letters.length + 1);
    function walk(index) {
      if (index === letters.length) return [];
      if (memo[index] !== undefined) return memo[index];
      const max = Math.min(6, letters.length - index);
      for (let len = max; len >= 1; len--) {
        const piece = letters.slice(index, index + len);
        if (!PINYIN_SYLLABLES.has(piece)) continue;
        const rest = walk(index + len);
        if (rest) {
          memo[index] = [piece].concat(rest);
          return memo[index];
        }
      }
      if (letters.charAt(index) === 'r') {
        const rest = walk(index + 1);
        if (rest) {
          memo[index] = ['er'].concat(rest);
          return memo[index];
        }
      }
      memo[index] = null;
      return null;
    }
    return walk(0);
  }

  function pinyinChunks(value) {
    return normalizePinyin(value).split(/[^a-z]+/).filter(Boolean);
  }

  function pinyinResidue(value) {
    let residue = '';
    pinyinChunks(value).forEach(function (chunk) {
      const letters = tonelessLetters(chunk);
      if (letters && !segmentLetters(letters)) residue += letters;
    });
    return residue;
  }

  function segmentPinyin(value) {
    const syllables = [];
    pinyinChunks(value).forEach(function (chunk) {
      const parts = segmentLetters(tonelessLetters(chunk));
      if (parts) syllables.push.apply(syllables, parts);
    });
    return syllables;
  }

  function baseSyllable(syllable) {
    return String(syllable || '').replace(/(?:ng|n)$/, '');
  }

  function sameSyllables(left, right) {
    if (!left || !right || left.length !== right.length || !left.length) return false;
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
    return true;
  }

  // Long sentences may drop or add a syllable. 90% of the longer sequence
  // matching in order still counts. Shorter sentences must match exactly.
  const LONG_SENTENCE_MIN_SYLLABLES = 8;
  const LONG_SENTENCE_SYLLABLE_TOLERANCE = 0.9;

  function lcsLength(left, right) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = Array.from({length: rows}, function () { return new Array(cols).fill(0); });
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        dp[i][j] = left[i - 1] === right[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[left.length][right.length];
  }

  function sentenceSyllablesClose(target, heard) {
    if (target.length < LONG_SENTENCE_MIN_SYLLABLES) return false;
    const longer = Math.max(target.length, heard.length);
    if (!longer) return false;
    return lcsLength(target, heard) / longer >= LONG_SENTENCE_SYLLABLE_TOLERANCE;
  }

  function normalizeHeardSyllables(heard) {
    return (heard || []).map(tonelessLetters).filter(Boolean);
  }

  // Single-syllable answers only. Final n/ng is ignored, so in≡ing, en≡eng,
  // and 您 (nin) matches ni or ning. Retroflex initials match the plain pair.
  const SINGLE_SYLLABLE_SOUND_EQUIVALENCE = {
    ignoreFinalNasal: true,
    initialAliases: [['zh', 'z'], ['ch', 'c'], ['sh', 's']]
  };

  function singleSyllableKey(syllable) {
    let text = tonelessLetters(syllable);
    if (!text) return '';
    const aliases = SINGLE_SYLLABLE_SOUND_EQUIVALENCE.initialAliases;
    for (let i = 0; i < aliases.length; i++) {
      if (text.indexOf(aliases[i][0]) === 0) {
        text = aliases[i][1] + text.slice(aliases[i][0].length);
        break;
      }
    }
    if (SINGLE_SYLLABLE_SOUND_EQUIVALENCE.ignoreFinalNasal) text = text.replace(/(?:ng|n)$/, '');
    return text;
  }

  function pinyinAlternativeMatches(target, normalized, kind) {
    if (sameSyllables(target, normalized)) return true;
    if (kind === 'sentence' && sentenceSyllablesClose(target, normalized)) return true;
    // One syllable: any syllable in the guess may carry the sound ("nin hao" still passes for 您).
    if (kind !== 'sentence' && target.length === 1) {
      const wanted = singleSyllableKey(target[0]);
      if (!wanted) return false;
      return normalized.some(function (syllable) { return singleSyllableKey(syllable) === wanted; });
    }
    return false;
  }

  function heardPinyinText(part) {
    const lists = part.syllableLists || (part.syllables ? [part.syllables] : []);
    return lists.map(function (list) {
      return normalizeHeardSyllables(list).join(' ');
    }).filter(Boolean).filter(function (item, index, all) {
      return all.indexOf(item) === index;
    }).join(' / ');
  }

  function formatHeardList(parts) {
    return (parts || []).map(heardPinyinText).filter(Boolean).join(' / ');
  }

  function storedAnswerPinyin(item, sentence) {
    return String((sentence ? item.examplePinyin : item.pinyin) || '').trim();
  }

  function wordAnswerText(item) {
    const hanzi = displayWord(item);
    const py = storedAnswerPinyin(item, false);
    if (hanzi && py) return hanzi + ' ' + py;
    return hanzi || py;
  }

  function tonePinyinOf(text) {
    const api = globalThis.pinyinPro;
    if (!api || typeof api.pinyin !== 'function') return '';
    try {
      const reading = api.pinyin(String(text || ''), {toneType: 'symbol', type: 'string', nonZh: 'removed'});
      return String(reading || '').trim();
    } catch (error) {
      return '';
    }
  }

  function typedAnswerText(given) {
    const text = String(given || '').trim();
    if (!text) return '(미입력)';
    const py = tonePinyinOf(text);
    if (!py) return text;
    return text + ' ' + py;
  }

  function pronounceAnswerText(item, sentence) {
    const hanzi = sentence
      ? String((item && item.example) || '').trim()
      : (wordForms(item)[0] || String((item && item.word) || '').trim());
    const py = storedAnswerPinyin(item, sentence);
    if (hanzi && py) return hanzi + ' ' + py;
    return hanzi || py;
  }

  const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function asciiNumberText(text) {
    return String(text || '').normalize('NFKC').replace(/％/g, '%');
  }

  function readBelow10000(n, liang) {
    function digit(value, useLiang) {
      if (value === 2 && useLiang) return '两';
      return CN_DIGITS[value];
    }
    if (n === 0) return '零';
    if (n < 10) return digit(n, liang);
    if (n < 20) return n === 10 ? '十' : '十' + CN_DIGITS[n - 10];
    if (n < 100) {
      let text = CN_DIGITS[Math.floor(n / 10)] + '十';
      if (n % 10) text += CN_DIGITS[n % 10];
      return text;
    }
    if (n < 1000) {
      let text = digit(Math.floor(n / 100), liang) + '百';
      const rest = n % 100;
      if (!rest) return text;
      if (rest < 10) return text + '零' + CN_DIGITS[rest];
      if (rest < 20) return text + '一' + readBelow10000(rest, false);
      return text + readBelow10000(rest, false);
    }
    let text = digit(Math.floor(n / 1000), liang) + '千';
    const rest = n % 1000;
    if (!rest) return text;
    if (rest < 100) return text + '零' + readBelow10000(rest, false);
    return text + readBelow10000(rest, false);
  }

  function readFullNumber(n, liang) {
    if (n < 10000) return readBelow10000(n, liang);
    if (n >= 100000000) return String(n).split('').map(function (ch) { return CN_DIGITS[Number(ch)]; }).join('');
    const wan = Math.floor(n / 10000);
    const rest = n % 10000;
    let text = readBelow10000(wan, liang) + '万';
    if (!rest) return text;
    if (rest < 1000) text += '零';
    return text + readBelow10000(rest, false);
  }

  function integerHanziVariants(n) {
    if (!Number.isSafeInteger(n) || n < 0) return [];
    const plain = readFullNumber(n, false);
    const withLiang = readFullNumber(n, true);
    const variants = [plain];
    if (withLiang !== plain) variants.push(withLiang);
    if (n >= 1000 && n <= 9999) {
      const digits = String(n).split('').map(function (ch) { return CN_DIGITS[Number(ch)]; }).join('');
      if (variants.indexOf(digits) === -1) variants.push(digits);
    }
    return variants;
  }

  function numberTokenVariants(token) {
    const percent = /%$/.test(token);
    const body = percent ? token.slice(0, -1) : token;
    if (!/^\d+(?:\.\d+)?$/.test(body)) return [token];
    const bits = body.split('.');
    const whole = Number(bits[0]);
    let variants = integerHanziVariants(whole);
    if (!variants.length) return [token];
    if (bits[1]) {
      const fraction = bits[1].split('').map(function (ch) { return CN_DIGITS[Number(ch)]; }).join('');
      variants = variants.map(function (item) { return item + '点' + fraction; });
    }
    if (percent) variants = variants.map(function (item) { return '百分之' + item; });
    if (token === '1') variants.push('幺');
    return variants;
  }

  function expandNumericHanzi(text) {
    const source = asciiNumberText(text);
    if (!/\d/.test(source)) return [source];
    const pieces = [];
    const pattern = /\d+(?:\.\d+)?%?/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(source))) {
      if (match.index > last) pieces.push([source.slice(last, match.index)]);
      pieces.push(numberTokenVariants(match[0]));
      last = match.index + match[0].length;
    }
    if (last < source.length) pieces.push([source.slice(last)]);
    let combined = [''];
    pieces.forEach(function (options) {
      const next = [];
      combined.forEach(function (prefix) {
        options.forEach(function (option) {
          if (next.length < 12) next.push(prefix + option);
        });
      });
      combined = next;
    });
    return combined.length ? combined : [source];
  }

  function pronunciationLenientMatch(item, transcripts, kind, syllablesOf) {
    const list = [];
    (transcripts || []).forEach(function (text) {
      expandNumericHanzi(text).forEach(function (form) { list.push(form); });
    });
    const target = segmentPinyin(kind === 'sentence' ? item.examplePinyin : item.pinyin);
    let sawPinyin = false;
    if (typeof syllablesOf === 'function' && target.length) {
      for (let i = 0; i < list.length; i++) {
        const heard = syllablesOf(list[i]);
        if (!heard || !heard.length) continue;
        sawPinyin = true;
        if (pinyinAlternativeMatches(target, normalizeHeardSyllables(heard), kind)) return true;
      }
    }
    // pinyin-pro missing or unable to read the guess: compare characters instead.
    if (sawPinyin) return false;
    return pronunciationAnyMatch(item, list.length ? list : (transcripts || []), kind);
  }

  const MIC_HELP = '계속 물어보면 주소창 왼쪽 자물쇠(사이트 설정) → 마이크 → 허용으로 바꿔 주세요.';
  const SILENT_AGAIN = '알아듣지 못했습니다. 소리가 안 들리면 페이지를 새로고침해 주세요.';

  function mount(data) {
    const items = (data || []).filter(function (item) { return item && Number.isInteger(item.no); });
    const headerWrap = document.querySelector('header .wrap');
    const top = headerWrap && headerWrap.querySelector('.top');
    const list = document.getElementById('list');
    if (!headerWrap || !top || !list || !items.length || document.getElementById('typing-test')) return;

    const total = items.reduce(function (max, item) { return Math.max(max, item.no); }, 0);

    const switcher = document.createElement('div');
    switcher.className = 'mode-switch';
    switcher.setAttribute('role', 'tablist');
    switcher.innerHTML = [
      '<button type="button" id="mode-listen" role="tab" aria-selected="true">음원 학습</button>',
      '<button type="button" id="mode-word" role="tab" aria-selected="false">단어 시험</button>',
      '<button type="button" id="mode-sentence" role="tab" aria-selected="false">예문 시험</button>',
      '<button type="button" id="mode-pronounce" role="tab" aria-selected="false">발음 시험</button>'
    ].join('');
    top.insertAdjacentElement('afterend', switcher);

    const test = document.createElement('section');
    test.id = 'typing-test';
    test.className = 'wrap';
    test.hidden = true;
    test.innerHTML = [
      '<h2 id="test-title">단어 시험</h2>',
      '<div id="pronounce-kind" class="pronounce-kind" hidden>',
      '<button type="button" id="pronounce-word" aria-pressed="true">단어</button>',
      '<button type="button" id="pronounce-sentence" aria-pressed="false">예문</button>',
      '</div>',
      '<p id="pronounce-support" class="pronounce-support" hidden></p>',
      '<div id="chrome-open" class="pronounce-support" hidden>',
      '<p>음성 인식은 크롬에서 가장 잘 돼요. 아래 버튼으로 크롬에서 열어 주세요.</p>',
      '<a id="chrome-open-link" href="#">크롬으로 열기</a>',
      '</div>',
      '<p id="mic-permission-help" class="mic-hint" hidden>' + MIC_HELP + '</p>',
      '<div id="test-setup">',
      '<p class="test-help" id="test-help"></p>',
      '<p class="range-note" id="range-note"></p>',
      '<div class="range-row">',
      '<label>시작 번호<input id="range-start" inputmode="numeric" type="number" min="1" step="1"></label>',
      '<label>끝 번호<input id="range-end" inputmode="numeric" type="number" min="1" step="1"></label>',
      '</div>',
      '<p class="range-preview" id="range-preview"></p>',
      '<p id="test-message" role="status"></p>',
      '<div class="test-actions"><button type="button" id="test-start">시험 시작</button></div>',
      '</div>',
      '<div id="test-run" hidden>',
      '<p class="last-mark" id="last-mark" role="status"></p>',
      '<div class="question-card">',
      '<p class="q-progress" id="q-progress"></p>',
      '<p class="q-meta" id="q-meta"></p>',
      '<p class="prompt" id="q-prompt"></p>',
      '<label for="typing-answer" id="answer-label">답 입력</label>',
      '<input id="typing-answer" type="text" lang="zh-CN" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">',
      '<p class="tally" id="tally"></p>',
      '<div id="pronounce-panel" hidden>',
      '<p class="repeat-hint" id="repeat-hint" hidden></p>',
      '<p class="try-count" id="try-count"></p>',
      '<p class="mic-status" id="mic-status" aria-live="polite"></p>',
      '<button type="button" id="mic-button">🎤 읽기</button>',
      '<button type="button" id="pronounce-skip" class="secondary">건너뛰기</button>',
      '<p class="heard" id="heard"></p>',
      '<div id="pronounce-fail" class="pronounce-fail" hidden>',
      '<p id="fail-title"></p>',
      '<p id="fail-answer" class="zh" lang="zh-CN"></p>',
      '<p id="fail-pinyin" hidden></p>',
      '<p id="fail-heard"></p>',
      '</div>',
      '<p class="mic-hint" id="mic-hint">마이크 버튼을 누르면 읽기가 시작됩니다. 권한을 물어보면 허용해 주세요. 건너뛰기는 오답으로 남습니다.</p>',
      '</div>',
      '<p class="enter-note" id="enter-note"></p>',
      '<div class="test-actions" id="typing-actions">',
      '<button type="button" id="test-submit">확인</button>',
      '<button type="button" id="test-finish" class="secondary">여기까지 하고 결과 보기</button>',
      '</div>',
      '</div>',
      '</div>',
      '<div id="test-result" hidden>',
      '<div class="score-block">',
      '<p class="score-fraction" id="score-fraction" tabindex="-1"></p>',
      '<p class="score-hundred" id="score-hundred"></p>',
      '<p class="score-note" id="score-note"></p>',
      '</div>',
      '<ol class="result-list" id="result-list"></ol>',
      '<div class="test-actions">',
      '<button type="button" id="test-retry">같은 범위로 다시 하기</button>',
      '<button type="button" id="test-back" class="secondary">범위 다시 고르기</button>',
      '</div>',
      '</div>'
    ].join('');
    list.insertAdjacentElement('beforebegin', test);

    const ui = {
      modeListen: document.getElementById('mode-listen'),
      modeWord: document.getElementById('mode-word'),
      modeSentence: document.getElementById('mode-sentence'),
      modePronounce: document.getElementById('mode-pronounce'),
      pronounceKind: document.getElementById('pronounce-kind'),
      pronounceWord: document.getElementById('pronounce-word'),
      pronounceSentence: document.getElementById('pronounce-sentence'),
      support: document.getElementById('pronounce-support'),
      chromeOpen: document.getElementById('chrome-open'),
      chromeOpenLink: document.getElementById('chrome-open-link'),
      micHelp: document.getElementById('mic-permission-help'),
      pronouncePanel: document.getElementById('pronounce-panel'),
      tryCount: document.getElementById('try-count'),
      repeatHint: document.getElementById('repeat-hint'),
      micStatus: document.getElementById('mic-status'),
      mic: document.getElementById('mic-button'),
      skip: document.getElementById('pronounce-skip'),
      heard: document.getElementById('heard'),
      failBox: document.getElementById('pronounce-fail'),
      failTitle: document.getElementById('fail-title'),
      failAnswer: document.getElementById('fail-answer'),
      failPinyin: document.getElementById('fail-pinyin'),
      failHeard: document.getElementById('fail-heard'),
      typingActions: document.getElementById('typing-actions'),
      setup: document.getElementById('test-setup'),
      run: document.getElementById('test-run'),
      result: document.getElementById('test-result'),
      title: document.getElementById('test-title'),
      help: document.getElementById('test-help'),
      rangeNote: document.getElementById('range-note'),
      startInput: document.getElementById('range-start'),
      endInput: document.getElementById('range-end'),
      preview: document.getElementById('range-preview'),
      message: document.getElementById('test-message'),
      startBtn: document.getElementById('test-start'),
      progress: document.getElementById('q-progress'),
      meta: document.getElementById('q-meta'),
      prompt: document.getElementById('q-prompt'),
      answerLabel: document.getElementById('answer-label'),
      answer: document.getElementById('typing-answer'),
      tally: document.getElementById('tally'),
      enterNote: document.getElementById('enter-note'),
      lastMark: document.getElementById('last-mark'),
      submit: document.getElementById('test-submit'),
      finish: document.getElementById('test-finish'),
      fraction: document.getElementById('score-fraction'),
      hundred: document.getElementById('score-hundred'),
      scoreNote: document.getElementById('score-note'),
      resultList: document.getElementById('result-list'),
      retry: document.getElementById('test-retry'),
      back: document.getElementById('test-back')
    };

    const state = {
      mode: 'listen',
      kind: 'word',
      queue: [],
      skipped: [],
      rangeStart: 1,
      rangeEnd: Math.min(20, total),
      index: 0,
      answers: [],
      phase: 'setup',
      correctCount: 0,
      composing: false,
      blockEnterUntil: 0,
      committing: false,
      speakKind: 'word',
      tries: 0,
      listening: false,
      recognition: null,
      silentStreak: 0,
      answerLocked: false,
      advanceToken: 0,
      advanceTimer: null
    };

    ui.startInput.max = String(total);
    ui.endInput.max = String(total);
    ui.startInput.value = '1';
    ui.endInput.value = String(state.rangeEnd);
    ui.rangeNote.textContent = '시작 번호와 끝 번호는 이 화면과 인쇄 단어장의 항목 번호입니다. 이 단어장은 1번부터 ' + total + '번까지입니다.';

    function quietAudio() {
      const pause = document.getElementById('pauseResume');
      if (pause && !pause.disabled && typeof globalThis.stopPlayback === 'function') globalThis.stopPlayback();
    }

    function setStudyHidden(hidden) {
      document.body.classList.toggle('typing-test-active', hidden);
    }

    function setMode(mode) {
      state.mode = mode;
      const testing = mode !== 'listen';
      ui.modeListen.setAttribute('aria-selected', String(!testing));
      ui.modeWord.setAttribute('aria-selected', String(mode === 'word'));
      ui.modeSentence.setAttribute('aria-selected', String(mode === 'sentence'));
      ui.modePronounce.setAttribute('aria-selected', String(mode === 'pronounce'));
      test.hidden = !testing;
      setStudyHidden(testing);
      updateChromeOffer();
      if (testing) {
        quietAudio();
        state.kind = mode;
        showSetup();
      } else {
        cancelAdvance();
        stopRecognition();
      }
    }

    function rangeLabel(item) {
      if (state.kind === 'word') return item.meaning;
      if (state.kind === 'sentence') return item.translation;
      if (state.speakKind === 'sentence') return item.example;
      return wordForms(item)[0] || item.word;
    }

    function currentBlocker() {
      return pronunciationBlocker({
        secure: typeof window.isSecureContext === 'boolean' ? window.isSecureContext : true,
        hasRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        samsung: typeof navigator !== 'undefined' && /SamsungBrowser/i.test(navigator.userAgent || '')
      });
    }

    function updateChromeOffer() {
      const offer = state.mode === 'pronounce' && shouldOfferChrome(
        (typeof navigator !== 'undefined' && navigator.userAgent) || '',
        !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      );
      if (!ui.chromeOpen) return;
      ui.chromeOpen.hidden = !offer;
      if (offer && ui.chromeOpenLink) {
        const loc = typeof location !== 'undefined' ? location : {pathname: '', search: ''};
        ui.chromeOpenLink.href = chromeIntentHref(loc.pathname, loc.search);
      }
    }

    function updateSupportNotice() {
      const blocker = state.kind === 'pronounce' ? currentBlocker() : '';
      ui.support.hidden = !blocker;
      ui.support.className = 'pronounce-support' + (blocker ? ' is-warn' : '');
      ui.support.textContent = pronunciationSupportMessage(blocker);
      if (ui.micHelp) ui.micHelp.hidden = true;
    }

    function setSpeakKind(kind) {
      state.speakKind = kind;
      ui.pronounceWord.setAttribute('aria-pressed', String(kind === 'word'));
      ui.pronounceSentence.setAttribute('aria-pressed', String(kind === 'sentence'));
      if (state.phase === 'setup') refreshRange();
    }

    function stopRecognition() {
      const recog = state.recognition;
      state.recognition = null;
      state.listening = false;
      if (!recog) return;
      recog.onresult = null;
      recog.onerror = null;
      recog.onend = null;
      try { recog.abort(); } catch (error) {}
    }

      function transcriptsOf(event) {
      const out = [];
      const results = event && event.results;
      if (!results) return out;
      for (let r = 0; r < results.length; r++) {
        const row = results[r];
        const count = row && typeof row.length === 'number' ? row.length : 0;
        for (let i = 0; i < count; i++) {
          const text = row[i] && row[i].transcript ? String(row[i].transcript).trim() : '';
          if (text && out.indexOf(text) === -1) out.push(text);
        }
      }
      return out;
    }

    function showPermissionNotice() {
      ui.support.hidden = false;
      ui.support.className = 'pronounce-support is-warn';
      ui.support.textContent = '마이크 사용을 허용해 주세요. 브라우저에서 마이크를 허용한 뒤 다시 🎤 읽기를 눌러 주세요.';
      if (ui.micHelp) ui.micHelp.hidden = false;
    }

    function cancelAdvance() {
      state.advanceToken += 1;
      clearTimeout(state.advanceTimer);
      state.advanceTimer = null;
    }

    function recordPronounce(ok, heardText, skippedByUser) {
      const item = state.queue[state.index];
      const expected = pronounceAnswerText(item, state.speakKind === 'sentence');
      state.answers[state.index] = {
        item: item,
        given: heardText,
        heard: heardText,
        ok: ok,
        expected: expected,
        skippedByUser: !!skippedByUser,
        heardParts: state.lastHeardParts || null
      };
      if (ok) state.correctCount += 1;
    }

    function goNextPronounce() {
      cancelAdvance();
      if (state.phase !== 'question' || state.kind !== 'pronounce') return;
      if (state.index + 1 < state.queue.length) {
        state.index += 1;
        showQuestion();
        return;
      }
      for (let i = 0; i < state.queue.length; i++) {
        if (!state.answers[i]) {
          const missed = state.queue[i];
          state.answers[i] = {
            item: missed,
            given: '',
            heard: '',
            ok: false,
            expected: pronounceAnswerText(missed, state.speakKind === 'sentence')
          };
        }
      }
      showResults();
    }

    function scheduleAdvance() {
      const token = ++state.advanceToken;
      clearTimeout(state.advanceTimer);
      state.advanceTimer = setTimeout(function () {
        if (token !== state.advanceToken) return;
        goNextPronounce();
      }, 1700);
    }

    function renderHeardLine(node, parts) {
      node.replaceChildren();
      const text = formatHeardList(parts);
      node.appendChild(document.createTextNode('들은 말: ' + (text || '(알아듣지 못함)')));
    }

    function showMissed(item, heardText) {
      const sentence = state.speakKind === 'sentence';
      ui.failBox.hidden = false;
      ui.failTitle.textContent = '틀렸습니다';
      ui.failAnswer.textContent = '정답: ' + pronounceAnswerText(item, sentence);
      ui.failPinyin.hidden = true;
      if (state.lastHeardParts && state.lastHeardParts.length) renderHeardLine(ui.failHeard, state.lastHeardParts);
      else ui.failHeard.textContent = '들은 말: ' + (heardText || '(알아듣지 못함)');
      ui.mic.disabled = true;
    }

    function settlePronounce(ok, heardText, skippedByUser) {
      if (state.answerLocked || state.phase !== 'question' || state.kind !== 'pronounce') return;
      state.answerLocked = true;
      recordPronounce(ok, heardText, skippedByUser);
      stopRecognition();
      if (!ok && !skippedByUser) {
        showMissed(state.queue[state.index], heardText);
        ui.lastMark.textContent = '틀렸습니다 · 들은 말: ' + (heardText || '(알아듣지 못함)');
        ui.lastMark.className = 'last-mark is-wrong';
        scheduleAdvance();
        return;
      }
      ui.failBox.hidden = true;
      ui.lastMark.textContent = (ok ? '맞았습니다' : '건너뜀') + (heardText ? ' · 들은 말: ' + heardText : '');
      ui.lastMark.className = 'last-mark ' + (ok ? 'is-right' : 'is-wrong');
      goNextPronounce();
    }

    function skipPronounce() {
      if (state.phase !== 'question' || state.kind !== 'pronounce') return;
      if (state.answerLocked) {
        cancelAdvance();
        goNextPronounce();
        return;
      }
      const heard = (ui.heard.textContent || '').replace(/^들은 말:\s*/, '');
      settlePronounce(false, heard && heard !== '알아듣지 못했습니다. 다시 읽어 주세요.' ? heard : '', true);
    }

    function judgePronunciation(alts) {
      if (state.answerLocked || state.phase !== 'question' || state.kind !== 'pronounce') return;
      if (!alts.length) {
        ui.heard.textContent = '알아듣지 못했습니다. 다시 읽어 주세요.';
        return;
      }
      const item = state.queue[state.index];
      const parts = alts.map(function (text) {
        return {chars: text, syllables: syllablesOfHeard(text), syllableLists: syllableListsOf(text)};
      });
      const heardText = formatHeardList(parts);
      state.lastHeardParts = parts;
      renderHeardLine(ui.heard, parts);
      if (pronunciationLenientMatch(item, alts, state.speakKind, syllablesOfHeard)) {
        settlePronounce(true, heardText, false);
        return true;
      }
      return false;
    }

    function countPronounceMiss() {
      if (state.answerLocked || state.phase !== 'question') return;
      const heardText = formatHeardList(state.lastHeardParts || []);
      state.tries += 1;
      if (state.tries >= 3) {
        settlePronounce(false, heardText, false);
        return;
      }
      ui.lastMark.textContent = '알아듣지 못했습니다. 다시 읽어 주세요. (' + state.tries + '/3)';
      ui.lastMark.className = 'last-mark is-wrong';
      ui.tryCount.textContent = '남은 기회 ' + (3 - state.tries) + '번';
    }

    function syllableListsOf(text) {
      const api = window.pinyinPro;
      if (!api || typeof api.pinyin !== 'function') return null;
      const lists = [];
      expandNumericHanzi(text).forEach(function (form) {
        try {
          const parts = api.pinyin(form, {toneType: 'none', type: 'array', nonZh: 'removed'});
          const normalized = parts && parts.map(tonelessLetters).filter(Boolean);
          if (normalized && normalized.length) lists.push(normalized);
        } catch (error) {}
      });
      return lists.length ? lists : null;
    }

    function syllablesOfHeard(text) {
      const lists = syllableListsOf(text);
      return lists ? lists[0] : null;
    }

    function loadPinyinPro() {
      if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') return;
      if (document.getElementById('pinyin-pro-lib')) return;
      const script = document.createElement('script');
      script.id = 'pinyin-pro-lib';
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.5/dist/index.js';
      document.head.appendChild(script);
    }

    function startListening() {
      if (state.answerLocked || state.listening || state.phase !== 'question' || state.kind !== 'pronounce') return;
      const blocker = currentBlocker();
      if (blocker) {
        updateSupportNotice();
        return;
      }
      primeReadyBeep();
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new Ctor();
      recog.lang = 'zh-CN';
      recog.interimResults = true;
      recog.maxAlternatives = 5;
      recog.continuous = false;
      state.recognition = recog;
      state.listening = true;
      state.micReady = false;
      state.lastAlts = [];
      ui.mic.disabled = true;
      ui.mic.classList.add('is-arming');
      ui.mic.textContent = '준비 중…';
      ui.micStatus.textContent = '마이크를 준비하는 중입니다. 소리가 난 뒤에 읽어 주세요.';
      let settled = false;
      let ended = false;
      let silenceNoted = false;
      function finish() {
        if (settled) return;
        settled = true;
        state.listening = false;
        if (ui.mic) {
          ui.mic.disabled = false;
          ui.mic.classList.remove('is-arming', 'is-listening');
          ui.mic.textContent = '🎤 읽기';
        }
      }
      function markReady() {
        if (state.micReady || state.answerLocked) return;
        state.micReady = true;
        ui.mic.classList.remove('is-arming');
        ui.mic.classList.add('is-listening');
        ui.mic.textContent = '듣는 중…';
        ui.micStatus.textContent = '지금 읽어 주세요.';
        playReadyBeep();
      }
      function silenceText() {
        if (silenceNoted) return;
        silenceNoted = true;
        state.silentStreak += 1;
        ui.heard.textContent = state.silentStreak >= 2
          ? SILENT_AGAIN
          : '알아듣지 못했습니다. 다시 읽어 주세요.';
      }
      recog.onaudiostart = markReady;
      recog.onstart = markReady;
      recog.onresult = function (event) {
        if (state.answerLocked) return;
        const alts = transcriptsOf(event);
        if (!alts.length) return;
        state.lastAlts = alts;
        state.silentStreak = 0;
        if (judgePronunciation(alts)) stopRecognition();
      };
      recog.onerror = function (event) {
        const code = event && event.error;
        if (code === 'aborted') {
          if (state.listening) finish();
          return;
        }
        finish();
        ui.micStatus.textContent = '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showPermissionNotice();
          return;
        }
        if (code === 'no-speech') {
          silenceText();
          return;
        }
        ui.heard.textContent = '음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.';
      };
      recog.onend = function () {
        if (ended) return;
        ended = true;
        const hadSpeech = state.lastAlts && state.lastAlts.length;
        finish();
        if (state.answerLocked) return;
        ui.micStatus.textContent = '';
        if (!hadSpeech) {
          silenceText();
          return;
        }
        countPronounceMiss();
      };
      try {
        recog.start();
      } catch (error) {
        finish();
        ui.micStatus.textContent = '';
        ui.heard.textContent = '음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.';
      }
    }

    function primeReadyBeep() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        if (!state.audioCtx) state.audioCtx = new Ctx();
        if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
      } catch (error) {}
    }

    function playReadyBeep() {
      const ctx = state.audioCtx;
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch (error) {}
    }

    function showSetup() {
      cancelAdvance();
      stopRecognition();
      state.phase = 'setup';
      ui.setup.hidden = false;
      ui.run.hidden = true;
      ui.result.hidden = true;
      const pronounce = state.kind === 'pronounce';
      ui.pronounceKind.hidden = !pronounce;
      ui.title.textContent = state.kind === 'word' ? '단어 시험' : state.kind === 'sentence' ? '예문 시험' : '발음 시험';
      ui.help.textContent = pronounce
        ? '화면에 나온 한자나 예문을 소리 내어 읽습니다. 글자가 달라도 소리가 같으면 맞습니다. 성조는 채점하지 않습니다. 한 글자는 두 번 읽고, 1이나 10처럼 숫자로 들려도 됩니다. 세 번 모두 틀리면 정답을 잠시 보여 준 뒤 다음 문제로 넘어갑니다.'
        : state.kind === 'word'
          ? '한국어 뜻만 보여 줍니다. 그 번호의 한자를 입력하면 맞았는지 틀렸는지 표시합니다.'
          : '예문의 한국어 해석만 보여 줍니다. 중국어 문장을 입력하세요. 띄어쓰기는 보지 않고, 전각과 반각 문장부호는 같게 봅니다. 끝 문장부호는 빼도 맞습니다. 한국어 해석이 없는 항목은 건너뛰고 알려 줍니다.';
      updateSupportNotice();
      updateChromeOffer();
      refreshRange();
      test.scrollIntoView({block: 'start'});
    }

    function readBound(input) {
      const raw = String(input.value).trim();
      if (!/^\d+$/.test(raw)) return null;
      return Number(raw);
    }

    function currentPlan() {
      const start = readBound(ui.startInput);
      const end = readBound(ui.endInput);
      if (start === null || end === null || start < 1 || end > total || start > end) return null;
      const selected = selectRange(items, start, end);
      if (!selected.length) return null;
      const plan = state.kind === 'sentence' ? sentencePlan(selected) : {queue: selected, skipped: []};
      return {start: start, end: end, selected: selected, queue: plan.queue, skipped: plan.skipped};
    }

    function refreshRange() {
      const plan = currentPlan();
      ui.message.className = '';
      if (!plan) {
        ui.preview.textContent = '1번부터 ' + total + '번까지 고를 수 있습니다. 시작 번호는 끝 번호보다 클 수 없습니다.';
        ui.startBtn.disabled = true;
        ui.message.textContent = '';
        return;
      }
      const first = plan.selected[0];
      const last = plan.selected[plan.selected.length - 1];
      const firstLabel = rangeLabel(first);
      const lastLabel = rangeLabel(last);
      ui.preview.textContent = first.no + '번 ' + shortText(firstLabel) + ' – ' + last.no + '번 ' + shortText(lastLabel) + ' · ' + plan.queue.length + '문제';
      if (state.kind === 'sentence' && plan.skipped.length && !plan.queue.length) {
        ui.startBtn.disabled = true;
        ui.message.className = 'is-warn';
        ui.message.textContent = '이 범위에는 한국어 해석이 있는 예문이 없습니다. 예문 시험을 시작할 수 없습니다.';
        return;
      }
      ui.startBtn.disabled = state.kind === 'pronounce' && !!currentBlocker();
      if (plan.skipped.length) {
        ui.message.className = 'is-warn';
        ui.message.textContent = skipMessage(plan.skipped) + ' 시험 문제는 ' + plan.queue.length + '개입니다.';
      } else {
        ui.message.textContent = '';
      }
    }

    function begin() {
      cancelAdvance();
      stopRecognition();
      const plan = currentPlan();
      if (!plan || !plan.queue.length || ui.startBtn.disabled) {
        refreshRange();
        return;
      }
      state.queue = plan.queue;
      state.skipped = plan.skipped;
      state.rangeStart = plan.start;
      state.rangeEnd = plan.end;
      state.answers = plan.queue.map(function () { return null; });
      state.index = 0;
      state.correctCount = 0;
      state.silentStreak = 0;
      state.phase = 'question';
      ui.setup.hidden = true;
      ui.result.hidden = true;
      ui.run.hidden = false;
      ui.lastMark.textContent = '';
      ui.lastMark.className = 'last-mark';
      showQuestion();
    }

    function showQuestion() {
      const item = state.queue[state.index];
      const last = state.index + 1 === state.queue.length;
      const pronounce = state.kind === 'pronounce';
      cancelAdvance();
      stopRecognition();
      state.answerLocked = false;
      state.tries = 0;
      ui.progress.textContent = '문제 ' + (state.index + 1) + ' / ' + state.queue.length;
      ui.meta.textContent = item.no + '번';
      ui.answerLabel.hidden = pronounce;
      ui.answer.hidden = pronounce;
      ui.enterNote.hidden = pronounce;
      ui.typingActions.hidden = pronounce;
      ui.pronouncePanel.hidden = !pronounce;
      ui.prompt.classList.toggle('zh', pronounce);
      ui.prompt.lang = pronounce ? 'zh-CN' : 'ko';
      if (pronounce) {
        const sentence = state.speakKind === 'sentence';
        ui.prompt.textContent = sentence ? item.example : (wordForms(item)[0] || item.word);
        ui.prompt.classList.toggle('is-sentence', sentence);
        const oneSyllable = !sentence && segmentPinyin(item.pinyin).length === 1;
        ui.repeatHint.hidden = !oneSyllable;
        ui.repeatHint.textContent = oneSyllable
          ? '한 글자 단어는 두 번 연달아 읽어 주세요 (예: ' + ui.prompt.textContent + ui.prompt.textContent + ')'
          : '';
        state.lastHeardParts = null;
        state.lastAlts = [];
        ui.heard.textContent = '';
        ui.micStatus.textContent = '';
        ui.mic.classList.remove('is-arming', 'is-listening');
        ui.failBox.hidden = true;
        ui.tryCount.textContent = '기회 3번';
        ui.mic.disabled = false;
        ui.mic.textContent = '🎤 읽기';
        ui.skip.disabled = false;
        if (ui.micHelp) ui.micHelp.hidden = true;
      } else {
        ui.prompt.textContent = state.kind === 'word' ? item.meaning : item.translation.trim();
        ui.prompt.classList.toggle('is-sentence', state.kind === 'sentence');
        ui.answerLabel.textContent = state.kind === 'word' ? '한자' : '중국어 문장';
        ui.answer.placeholder = state.kind === 'word' ? '한자를 입력하세요' : '중국어 문장을 입력하세요';
        ui.answer.enterKeyHint = last ? 'done' : 'next';
        ui.answer.value = '';
        ui.submit.textContent = last ? '결과 보기' : '확인';
        ui.enterNote.textContent = last
          ? 'Enter 키로 확인하고 결과를 봅니다. 중국어 입력기가 글자를 조합하는 동안에는 넘어가지 않습니다.'
          : 'Enter 키로 확인하고 다음 문제로 넘어갑니다. 중국어 입력기가 글자를 조합하는 동안에는 넘어가지 않습니다.';
        ui.answer.focus();
      }
      ui.tally.textContent = '맞힌 개수 ' + state.correctCount;
    }

    function grade(item, raw) {
      const given = String(raw || '').trim();
      const ok = state.kind === 'word' ? wordMatches(item, given) : sentencesMatch(item.example, given);
      return {
        item: item,
        given: given,
        ok: ok,
        expected: state.kind === 'word' ? wordAnswerText(item) : item.example
      };
    }

    function commit(raw, finishEarly) {
      if (state.kind === 'pronounce' || state.phase !== 'question' || state.committing) return;
      state.committing = true;
      try {
        const current = state.index;
        const item = state.queue[current];
        const typed = String(raw || '').trim();
        if (!finishEarly || typed) {
          const graded = grade(item, raw);
          state.answers[current] = graded;
          if (graded.ok) state.correctCount += 1;
          if (!finishEarly) {
            ui.lastMark.textContent = state.kind === 'word'
              ? (graded.ok ? '맞았습니다' : '틀렸습니다') + ' · 정답: ' + wordAnswerText(item) + ' · 내 답: ' + typedAnswerText(graded.given)
              : (graded.ok ? '맞았습니다' : '틀렸습니다');
            ui.lastMark.className = 'last-mark ' + (graded.ok ? 'is-right' : 'is-wrong');
          }
        }
        if (!finishEarly && current + 1 < state.queue.length) {
          state.index = current + 1;
          showQuestion();
          return;
        }
        for (let i = 0; i < state.queue.length; i++) {
          if (!state.answers[i]) {
            state.answers[i] = {
              item: state.queue[i],
              given: '',
              ok: false,
              expected: state.kind === 'word' ? wordAnswerText(state.queue[i]) : state.queue[i].example,
              skipped: true
            };
          }
        }
        showResults();
      } finally {
        state.committing = false;
      }
    }

    function showResults() {
      cancelAdvance();
      stopRecognition();
      state.phase = 'result';
      ui.run.hidden = true;
      ui.result.hidden = false;
      const correct = state.answers.filter(function (row) { return row && row.ok; }).length;
      const totalCount = state.answers.length;
      ui.fraction.textContent = correct + '/' + totalCount;
      ui.hundred.textContent = '100점 만점에 ' + scoreOutOf100(correct, totalCount) + '점';
      ui.scoreNote.textContent = state.skipped.length
        ? '선택 범위 ' + state.rangeStart + '–' + state.rangeEnd + '번 가운데 한국어 해석이 없는 ' + state.skipped.length + '개는 건너뛰었습니다.'
        : '선택 범위 ' + state.rangeStart + '–' + state.rangeEnd + '번';
      ui.resultList.replaceChildren();
      state.answers.forEach(function (row) {
        const li = document.createElement('li');
        li.className = row.ok ? 'is-right' : 'is-wrong';
        const head = document.createElement('div');
        head.className = 'result-key';
        head.textContent = (row.ok ? '정답' : row.skippedByUser ? '건너뜀' : '오답') + ' · ' + row.item.no + '번';
        const prompt = document.createElement('div');
        prompt.className = 'result-prompt';
        prompt.textContent = state.kind === 'sentence' || (state.kind === 'pronounce' && state.speakKind === 'sentence')
          ? String(row.item.translation || row.item.example || '').trim()
          : row.item.meaning;
        const expected = document.createElement('div');
        expected.className = 'zh';
        expected.lang = 'zh-CN';
        expected.textContent = '정답: ' + row.expected;
        li.append(head, prompt, expected);
        if (state.kind === 'pronounce') {
          const heard = document.createElement('div');
          heard.className = 'result-mine';
          heard.removeAttribute('lang');
          if (row.heardParts && row.heardParts.length) renderHeardLine(heard, row.heardParts);
          else heard.textContent = '들은 말: ' + (row.heard || (row.skippedByUser ? '(건너뜀)' : '(알아듣지 못함)'));
          li.appendChild(heard);
        } else if (!row.ok) {
          const mine = document.createElement('div');
          mine.className = 'zh result-mine';
          mine.lang = 'zh-CN';
          mine.textContent = '내 답: ' + (state.kind === 'word'
            ? typedAnswerText(row.given)
            : (row.given ? row.given : '（입력 없음）'));
          li.appendChild(mine);
        }
        ui.resultList.appendChild(li);
      });
      ui.fraction.focus();
      test.scrollIntoView({block: 'start'});
    }

    ui.modeListen.addEventListener('click', function () { setMode('listen'); });
    ui.modeWord.addEventListener('click', function () { setMode('word'); });
    ui.modeSentence.addEventListener('click', function () { setMode('sentence'); });
    ui.modePronounce.addEventListener('click', function () { setMode('pronounce'); });
    ui.pronounceWord.addEventListener('click', function () { setSpeakKind('word'); });
    ui.pronounceSentence.addEventListener('click', function () { setSpeakKind('sentence'); });
    ui.mic.addEventListener('click', startListening);
    ui.skip.addEventListener('click', skipPronounce);
    loadPinyinPro();
    ui.startInput.addEventListener('input', refreshRange);
    ui.endInput.addEventListener('input', refreshRange);
    ui.startBtn.addEventListener('click', begin);
    ui.submit.addEventListener('click', function () { commit(ui.answer.value, false); });
    ui.finish.addEventListener('click', function () { commit(ui.answer.value, true); });
    ui.retry.addEventListener('click', begin);
    ui.back.addEventListener('click', showSetup);

    ui.answer.addEventListener('compositionstart', function () { state.composing = true; });
    ui.answer.addEventListener('compositionend', function () {
      state.composing = false;
      state.blockEnterUntil = performance.now() + 100;
    });
    ui.answer.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      if (event.isComposing || state.composing || event.keyCode === 229) return;
      event.preventDefault();
    });
    ui.answer.addEventListener('keyup', function (event) {
      if (!shouldSubmitOnEnter(event, {
        composing: state.composing,
        blockEnterUntil: state.blockEnterUntil,
        now: performance.now()
      })) return;
      event.preventDefault();
      commit(ui.answer.value, false);
    });
  }

  return {
    mount: mount,
    normalizeSentence: normalizeSentence,
    sentencesMatch: sentencesMatch,
    wordForms: wordForms,
    wordMatches: wordMatches,
    displayWord: displayWord,
    hasKoreanTranslation: hasKoreanTranslation,
    selectRange: selectRange,
    sentencePlan: sentencePlan,
    shouldSubmitOnEnter: shouldSubmitOnEnter,
    scoreOutOf100: scoreOutOf100,
    normalizeWordAnswer: normalizeWordAnswer,
    normalizePronunciation: normalizePronunciation,
    pronunciationMatches: pronunciationMatches,
    pronunciationAnyMatch: pronunciationAnyMatch,
    pronunciationBlocker: pronunciationBlocker,
    shouldOfferChrome: shouldOfferChrome,
    chromeIntentHref: chromeIntentHref,
    isAndroidChrome: isAndroidChrome,
    pronunciationSupportMessage: pronunciationSupportMessage,
    segmentPinyin: segmentPinyin,
    pinyinResidue: pinyinResidue,
    pronunciationLenientMatch: pronunciationLenientMatch,
    expandNumericHanzi: expandNumericHanzi,
    baseSyllable: baseSyllable
  };
});
