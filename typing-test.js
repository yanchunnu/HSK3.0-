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
      '<button type="button" id="mode-sentence" role="tab" aria-selected="false">예문 시험</button>'
    ].join('');
    top.insertAdjacentElement('afterend', switcher);

    const test = document.createElement('section');
    test.id = 'typing-test';
    test.className = 'wrap';
    test.hidden = true;
    test.innerHTML = [
      '<h2 id="test-title">단어 시험</h2>',
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
      '<p class="enter-note" id="enter-note"></p>',
      '<div class="test-actions">',
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
      committing: false
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
      test.hidden = !testing;
      setStudyHidden(testing);
      if (testing) {
        quietAudio();
        state.kind = mode;
        showSetup();
      }
    }

    function showSetup() {
      state.phase = 'setup';
      ui.setup.hidden = false;
      ui.run.hidden = true;
      ui.result.hidden = true;
      ui.title.textContent = state.kind === 'word' ? '단어 시험' : '예문 시험';
      ui.help.textContent = state.kind === 'word'
        ? '한국어 뜻만 보여 줍니다. 그 번호의 한자를 입력하면 맞았는지 틀렸는지 표시합니다.'
        : '예문의 한국어 해석만 보여 줍니다. 중국어 문장을 입력하세요. 띄어쓰기는 보지 않고, 전각과 반각 문장부호는 같게 봅니다. 끝 문장부호는 빼도 맞습니다. 한국어 해석이 없는 항목은 건너뛰고 알려 줍니다.';
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
      const firstLabel = state.kind === 'word' ? first.meaning : first.translation;
      const lastLabel = state.kind === 'word' ? last.meaning : last.translation;
      ui.preview.textContent = first.no + '번 ' + shortText(firstLabel) + ' – ' + last.no + '번 ' + shortText(lastLabel) + ' · ' + plan.queue.length + '문제';
      if (state.kind === 'sentence' && plan.skipped.length && !plan.queue.length) {
        ui.startBtn.disabled = true;
        ui.message.className = 'is-warn';
        ui.message.textContent = '이 범위에는 한국어 해석이 있는 예문이 없습니다. 예문 시험을 시작할 수 없습니다.';
        return;
      }
      ui.startBtn.disabled = false;
      if (plan.skipped.length) {
        ui.message.className = 'is-warn';
        ui.message.textContent = skipMessage(plan.skipped) + ' 시험 문제는 ' + plan.queue.length + '개입니다.';
      } else {
        ui.message.textContent = '';
      }
    }

    function begin() {
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
      ui.progress.textContent = '문제 ' + (state.index + 1) + ' / ' + state.queue.length;
      ui.meta.textContent = item.no + '번';
      ui.prompt.textContent = state.kind === 'word' ? item.meaning : item.translation.trim();
      ui.prompt.classList.toggle('is-sentence', state.kind === 'sentence');
      ui.answerLabel.textContent = state.kind === 'word' ? '한자' : '중국어 문장';
      ui.answer.placeholder = state.kind === 'word' ? '한자를 입력하세요' : '중국어 문장을 입력하세요';
      ui.answer.enterKeyHint = last ? 'done' : 'next';
      ui.answer.value = '';
      ui.tally.textContent = '맞힌 개수 ' + state.correctCount;
      ui.submit.textContent = last ? '결과 보기' : '확인';
      ui.enterNote.textContent = last
        ? 'Enter 키로 확인하고 결과를 봅니다. 중국어 입력기가 글자를 조합하는 동안에는 넘어가지 않습니다.'
        : 'Enter 키로 확인하고 다음 문제로 넘어갑니다. 중국어 입력기가 글자를 조합하는 동안에는 넘어가지 않습니다.';
      ui.answer.focus();
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
      if (state.phase !== 'question' || state.committing) return;
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
        prompt.textContent = state.kind === 'word' ? row.item.meaning : String(row.item.translation || '').trim();
        const expected = document.createElement('div');
        expected.className = 'zh';
        expected.lang = 'zh-CN';
        expected.textContent = '정답: ' + row.expected;
        li.append(head, prompt, expected);
        if (!row.ok) {
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
    normalizeWordAnswer: normalizeWordAnswer
  };
});
