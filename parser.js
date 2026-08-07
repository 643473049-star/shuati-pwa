// 文本解析器：把大段题目文字拆成结构化题目
// 移植自桌面版 quiz_parser.py 的核心逻辑（按题号切块，避免解析/题干粘连）
(function (global) {
  'use strict';

  // 选项标签：可选全角/半角括号 + A~D + 可选 ．（全角）./、 分隔
  const OPT_RE = /[（(]?[A-Da-d][）)]?[．.\u3001]?/g;

  // 在一段文本里抽取选项，返回 {stem, options:{A,B,C,D}, empty}
  function extractOptions(text) {
    const found = [];
    let m;
    OPT_RE.lastIndex = 0;
    while ((m = OPT_RE.exec(text)) !== null) {
      const li = m[0].search(/[A-Da-d]/);
      if (li === -1) continue;
      const key = m[0][li].toUpperCase();
      found.push({ idx: m.index + li, key: key });
    }
    const keys = ['A', 'B', 'C', 'D'];
    const used = [];
    const pos = [];
    found.forEach((mk) => {
      if (keys.indexOf(mk.key) !== -1 && used.indexOf(mk.key) === -1) {
        used.push(mk.key);
        pos.push(mk);
      }
    });
    if (used.length < 2) {
      return { stem: text.trim(), options: {}, empty: false };
    }
    const stem = text.slice(0, pos[0].idx).trim();
    const options = {};
    let allEmpty = true;
    for (let k = 0; k < used.length; k++) {
      const start = pos[k].idx + 1;
      const end = k + 1 < used.length ? pos[k + 1].idx : text.length;
      let body = text.slice(start, end);
      body = body.replace(/^[）)\uFF0E.\u3001\s]+/, '').replace(/[（(\uFF0E.\u3001\s]+$/, '').trim();
      options[used[k]] = body;
      if (body) allEmpty = false;
    }
    return { stem: stem, options: options, empty: allEmpty };
  }

  // 答案标准化：支持 "B" / "B,C" / "BC" / "B，C" / "B、C"
  function parseLetters(s) {
    s = (s || '').replace(/\s/g, '');
    let parts;
    if (/[，,]/.test(s) || /[、]/.test(s)) parts = s.split(/[，,、]/);
    else parts = s.split('');
    return parts.map((x) => x.toUpperCase()).filter((x) => /^[A-D]$/.test(x));
  }

  function parseQuestions(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let cur = null;
    let curSeq = '';
    const seqRe = /^\s*(\d+)[．.\u3001]\s*(.*)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(seqRe);
      if (m) {
        if (cur !== null) blocks.push({ seq: curSeq, text: cur });
        curSeq = m[1];
        cur = m[2] ? m[2] + '\n' : '';
      } else {
        if (cur !== null) cur += lines[i] + '\n';
      }
    }
    if (cur !== null) blocks.push({ seq: curSeq, text: cur });

    const result = [];
    for (const blk of blocks) {
      const raw = blk.text || '';
      const ansIdx = raw.indexOf('【答案】');
      const expIdx = raw.indexOf('【解析】');
      let stem = '';
      let answerRaw = '';
      let explanation = '';
      if (ansIdx === -1) {
        stem = raw.trim();
      } else {
        stem = raw.slice(0, ansIdx).trim();
        const afterAns = expIdx === -1 ? raw.length : expIdx;
        answerRaw = raw.slice(ansIdx + 4, afterAns).trim();
        if (expIdx !== -1) explanation = raw.slice(expIdx + 4).trim();
      }

      const optInfo = extractOptions(stem);
      const hasOpt = Object.keys(optInfo.options).length >= 2;
      const letters = parseLetters(answerRaw);

      let type;
      if (hasOpt) type = letters.length > 1 ? 'multiple' : 'single';
      else type = 'short';

      const answer = type === 'short' ? answerRaw : letters.join(',');

      const q = {
        seq: blk.seq,
        type: type,
        stem: optInfo.stem,
        options: optInfo.options,
        answer: answer,
        explanation: explanation,
        warnEmpty: false,
      };
      if ((type === 'single' || type === 'multiple') && optInfo.empty) {
        q.warnEmpty = true;
      }
      result.push(q);
    }
    return result;
  }

  const API = { parseQuestions: parseQuestions, extractOptions: extractOptions, parseLetters: parseLetters };
  global.QParser = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
