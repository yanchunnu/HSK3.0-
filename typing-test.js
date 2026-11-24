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

  function pronunciationBlocker(env) {
    if (!env || !env.hasRecognition) return 'unsupported';
    if (!env.secure) return 'insecure';
    return '';
  }

  function pronunciationSupportMessage(blocker) {
    if (blocker === 'insecure') return '음성 인식은 보안 연결(HTTPS)에서만 동작합니다. GitHub Pages 주소(https)로 열어 주세요.';
    if (blocker === 'unsupported') return '이 브라우저는 음성 인식을 지원하지 않습니다. 안드로이드에서는 Chrome, 아이폰에서는 Safari 또는 Chrome을 사용해 주세요. 카카오톡처럼 앱 안에서 열면 마이크가 막히는 경우가 많습니다.';
    return '';
  }

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
      '<p class="try-count" id="try-count"></p>',
      '<button type="button" id="mic-button">🎤 읽기</button>',
      '<p class="heard" id="heard"></p>',
      '<p class="mic-hint" id="mic-hint">마이크 버튼을 누르면 읽기가 시작됩니다. 권한을 물어보면 허용해 주세요.</p>',
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
      pronouncePanel: document.getElementById('pronounce-panel'),
      tryCount: document.getElementById('try-count'),
      mic: document.getElementById('mic-button'),
      heard: document.getElementById('heard'),
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
      recognition: null
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
      if (testing) {
        quietAudio();
        state.kind = mode;
        showSetup();
      } else {
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
        hasRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      });
    }

    function updateSupportNotice() {
      const blocker = state.kind === 'pronounce' ? currentBlocker() : '';
      ui.support.hidden = !blocker;
      ui.support.className = 'pronounce-support' + (blocker ? ' is-warn' : '');
      ui.support.textContent = pronunciationSupportMessage(blocker);
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
      if (!results || !results.length) return out;
      const row = results[0];
      const count = typeof row.length === 'number' ? row.length : 0;
      for (let i = 0; i < count; i++) {
        const text = row[i] && row[i].transcript ? String(row[i].transcript).trim() : '';
        if (text) out.push(text);
      }
      return out;
    }

    function showPermissionNotice() {
      ui.support.hidden = false;
      ui.support.className = 'pronounce-support is-warn';
      ui.support.textContent = '마이크 사용을 허용해 주세요. 브라우저에서 마이크를 허용한 뒤 다시 🎤 읽기를 눌러 주세요.';
    }

    function settlePronounce(ok, heardText) {
      const item = state.queue[state.index];
      const expected = state.speakKind === 'sentence' ? item.example : displayWord(item);
      state.answers[state.index] = {item: item, given: heardText, heard: heardText, ok: ok, expected: expected};
      if (ok) state.correctCount += 1;
      ui.lastMark.textContent = (ok ? '맞았습니다' : '틀렸습니다') + ' · 들은 말: ' + (heardText || '(알아듣지 못함)');
      ui.lastMark.className = 'last-mark ' + (ok ? 'is-right' : 'is-wrong');
      stopRecognition();
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
            expected: state.speakKind === 'sentence' ? missed.example : displayWord(missed),
            skipped: true
          };
        }
      }
      showResults();
    }

    function judgePronunciation(alts) {
      if (state.phase !== 'question' || state.kind !== 'pronounce') return;
      if (!alts.length) {
        ui.heard.textContent = '알아듣지 못했습니다. 다시 읽어 주세요.';
        return;
      }
      const item = state.queue[state.index];
      const heardText = alts.join(' / ');
      const ok = pronunciationAnyMatch(item, alts, state.speakKind);
      state.tries += 1;
      ui.heard.textContent = '들은 말: ' + heardText;
      if (ok || state.tries >= 3) {
        settlePronounce(ok, heardText);
        return;
      }
      ui.lastMark.textContent = '알아듣지 못했습니다. 다시 읽어 주세요. (' + state.tries + '/3)';
      ui.lastMark.className = 'last-mark is-wrong';
      ui.tryCount.textContent = '남은 기회 ' + (3 - state.tries) + '번';
    }

    function startListening() {
      if (state.listening || state.phase !== 'question' || state.kind !== 'pronounce') return;
      const blocker = currentBlocker();
      if (blocker) {
        updateSupportNotice();
        return;
      }
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new Ctor();
      recog.lang = 'zh-CN';
      recog.interimResults = false;
      recog.maxAlternatives = 3;
      recog.continuous = false;
      state.recognition = recog;
      state.listening = true;
      ui.mic.disabled = true;
      ui.mic.textContent = '듣는 중…';
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        state.listening = false;
        if (ui.mic) {
          ui.mic.disabled = false;
          ui.mic.textContent = '🎤 읽기';
        }
      }
      recog.onresult = function (event) {
        const alts = transcriptsOf(event);
        finish();
        judgePronunciation(alts);
      };
      recog.onerror = function (event) {
        const code = event && event.error;
        if (code === 'aborted') {
          if (state.listening) finish();
          return;
        }
        finish();
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showPermissionNotice();
          return;
        }
        ui.heard.textContent = code === 'no-speech'
          ? '알아듣지 못했습니다. 다시 읽어 주세요.'
          : '음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.';
      };
      recog.onend = function () {
        if (state.listening) finish();
      };
      try {
        recog.start();
      } catch (error) {
        finish();
        ui.heard.textContent = '음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.';
      }
    }

    function showSetup() {
      stopRecognition();
      state.phase = 'setup';
      ui.setup.hidden = false;
      ui.run.hidden = true;
      ui.result.hidden = true;
      const pronounce = state.kind === 'pronounce';
      ui.pronounceKind.hidden = !pronounce;
      ui.title.textContent = state.kind === 'word' ? '단어 시험' : state.kind === 'sentence' ? '예문 시험' : '발음 시험';
      ui.help.textContent = pronounce
        ? '화면에 나온 한자나 예문을 소리 내어 읽습니다. 채점은 느슨합니다. 인공지능이 알아들었는지만 확인하며, 성조를 정확하게 채점하지 않습니다. 한 문제당 3번까지 다시 읽을 수 있습니다.'
        : state.kind === 'word'
          ? '한국어 뜻만 보여 줍니다. 그 번호의 한자를 입력하면 맞았는지 틀렸는지 표시합니다.'
          : '예문의 한국어 해석만 보여 줍니다. 중국어 문장을 입력하세요. 띄어쓰기는 보지 않고, 전각과 반각 문장부호는 같게 봅니다. 끝 문장부호는 빼도 맞습니다. 한국어 해석이 없는 항목은 건너뛰고 알려 줍니다.';
      updateSupportNotice();
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
      stopRecognition();
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
        ui.heard.textContent = '';
        ui.tryCount.textContent = '기회 3번';
        ui.mic.disabled = false;
        ui.mic.textContent = '🎤 읽기';
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
        expected: state.kind === 'word' ? displayWord(item) : item.example
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
            ui.lastMark.textContent = graded.ok ? '맞았습니다' : '틀렸습니다';
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
              expected: state.kind === 'word' ? displayWord(state.queue[i]) : state.queue[i].example,
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
        head.textContent = (row.ok ? '정답' : '오답') + ' · ' + row.item.no + '번';
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
          heard.className = 'zh result-mine';
          heard.lang = 'zh-CN';
          heard.textContent = '들은 말: ' + (row.heard || row.given || '(알아듣지 못함)');
          li.appendChild(heard);
        } else if (!row.ok) {
          const mine = document.createElement('div');
          mine.className = 'zh result-mine';
          mine.lang = 'zh-CN';
          mine.textContent = '내 답: ' + (row.given ? row.given : '（입력 없음）');
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
    pronunciationSupportMessage: pronunciationSupportMessage
  };
});
