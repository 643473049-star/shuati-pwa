// 数据层：章节 / 题目 / 错题 / 练习记录
// 纯前端 localStorage 持久化（文本数据，体积小，足够用）
(function (global) {
  'use strict';
  const LS = {
    chapters: 'quiz_chapters_v1',
    questions: 'quiz_questions_v1',
    wrong: 'quiz_wrong_v1',
    log: 'quiz_log_v1',
    font: 'quiz_font_v1',
    settings: 'quiz_settings_v1',
    progress: 'quiz_progress_v1',
  };

  function load(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id' + Date.now() + Math.random().toString(16).slice(2);
  }

  let chapters = load(LS.chapters, []);
  let questions = load(LS.questions, []);
  let wrong = load(LS.wrong, []);
  let log = load(LS.log, []);

  function persist() {
    save(LS.chapters, chapters);
    save(LS.questions, questions);
    save(LS.wrong, wrong);
    save(LS.log, log);
  }

  // ---------- 章节 ----------
  function normId(v) {
    return v === undefined || v === null ? null : v;
  }
  function getChapters() {
    return chapters.slice().sort((a, b) => a.order - b.order);
  }
  function getSections(parentId) {
    const pid = normId(parentId);
    return chapters
      .filter((c) => normId(c.parentId) === pid)
      .sort((a, b) => a.order - b.order);
  }
  function findChapter(name, parentId) {
    const pid = normId(parentId);
    return chapters.find(
      (c) => c.name === name && normId(c.parentId) === pid
    );
  }
  function getOrCreateChapter(name, parentId) {
    name = (name || '').trim();
    if (!name) return null;
    let c = findChapter(name, parentId);
    if (c) return c;
    const pid = normId(parentId);
    const sibs = chapters.filter((x) => normId(x.parentId) === pid);
    const order = sibs.length ? Math.max.apply(null, sibs.map((s) => s.order)) + 1 : 1;
    c = { id: uid(), name: name, parentId: pid, order: order };
    chapters.push(c);
    persist();
    return c;
  }
  function chapterName(id) {
    const c = chapters.find((x) => x.id === id);
    if (!c) return '';
    if (c.parentId) {
      const p = chapters.find((x) => x.id === c.parentId);
      return p ? p.name + ' / ' + c.name : c.name;
    }
    return c.name;
  }
  // 删除章（级联删其下所有节、题目、错题、练习记录）；删节只删该节
  function deleteChapter(id) {
    const toDel = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of chapters) {
        if (c.parentId && toDel.has(c.parentId) && !toDel.has(c.id)) {
          toDel.add(c.id);
          changed = true;
        }
      }
    }
    const qids = questions.filter((q) => toDel.has(q.chapterId)).map((q) => q.id);
    questions = questions.filter((q) => !toDel.has(q.chapterId));
    wrong = wrong.filter((w) => qids.indexOf(w.qid) === -1);
    log = log.filter((l) => qids.indexOf(l.qid) === -1);
    chapters = chapters.filter((c) => !toDel.has(c.id));
    persist();
    return { chapters: toDel.size, questions: qids.length };
  }

  // ---------- 题目 ----------
  function maxOrder(chapterId) {
    const qs = questions.filter((q) => q.chapterId === chapterId);
    return qs.length ? Math.max.apply(null, qs.map((q) => q.order)) : 0;
  }
  // 新建章或节（总是创建新的，不重用同名）
  function addChapter(name, parentId) {
    name = (name || '').trim();
    if (!name) return null;
    const pid = normId(parentId);
    const sibs = chapters.filter((c) => normId(c.parentId) === pid);
    const order = sibs.length ? Math.max(...sibs.map((s) => s.order)) + 1 : 1;
    const ch = { id: uid(), name: name, parentId: pid, order: order };
    chapters.push(ch);
    persist();
    return ch;
  }
  function resolveChapter(chapterName, sectionName) {
    const ch = getOrCreateChapter(chapterName, null);
    if (!ch) return null;
    if (sectionName && sectionName.trim()) {
      return getOrCreateChapter(sectionName.trim(), ch.id).id;
    }
    return ch.id;
  }
  function getQuestions(opt) {
    opt = opt || {};
    let qs = questions.slice();
    if (opt.chapterId) {
      if (typeof opt.chapterId === 'string' && opt.chapterId.indexOf('__multi__') === 0) {
        // 多 ID 查询（章+所有子节）
        const ids = opt.chapterId.slice(9).split(',');
        qs = qs.filter((q) => ids.indexOf(q.chapterId) !== -1);
      } else {
        qs = qs.filter((q) => q.chapterId === opt.chapterId);
      }
    }
    if (opt.type) qs = qs.filter((q) => q.type === opt.type);
    if (opt.keyword) {
      const k = opt.keyword.trim().toLowerCase();
      if (k)
        qs = qs.filter(
          (q) =>
            (q.stem || '').toLowerCase().indexOf(k) !== -1 ||
            (q.answer || '').toLowerCase().indexOf(k) !== -1 ||
            (q.explanation || '').toLowerCase().indexOf(k) !== -1
        );
    }
    qs.sort((a, b) => a.order - b.order);
    return qs;
  }
  function getQuestion(id) {
    return questions.find((q) => q.id === id) || null;
  }
  function addQuestion(data) {
    const chapterId = data.chapterId;
    const q = {
      id: uid(),
      chapterId: chapterId,
      knowledge: data.knowledge || '',
      type: data.type || 'single',
      stem: data.stem || '',
      optA: data.optA || '',
      optB: data.optB || '',
      optC: data.optC || '',
      optD: data.optD || '',
      answer: data.answer || '',
      explanation: data.explanation || '',
      order: data.order != null ? data.order : maxOrder(chapterId) + 1,
    };
    questions.push(q);
    persist();
    return q;
  }
  function updateQuestion(qid, patch) {
    const q = questions.find((x) => x.id === qid);
    if (!q) return null;
    Object.assign(q, patch);
    persist();
    return q;
  }
  function deleteQuestion(qid) {
    questions = questions.filter((q) => q.id !== qid);
    wrong = wrong.filter((w) => w.qid !== qid);
    log = log.filter((l) => l.qid !== qid);
    persist();
  }
  function swapOrder(qid1, qid2) {
    const a = questions.find((q) => q.id === qid1);
    const b = questions.find((q) => q.id === qid2);
    if (!a || !b || a.chapterId !== b.chapterId) return;
    const t = a.order;
    a.order = b.order;
    b.order = t;
    persist();
  }
  function updateChapterName(id, newName) {
    const c = chapters.find((x) => x.id === id);
    if (!c || !newName || !newName.trim()) return null;
    c.name = newName.trim();
    persist();
    return c;
  }
  function moveQuestions(qids, targetChapterId) {
    let moved = 0;
    qids.forEach((qid) => {
      const q = questions.find((x) => x.id === qid);
      if (q) { q.chapterId = targetChapterId; q.order = maxOrder(targetChapterId) + 1; moved++; }
    });
    persist();
    return moved;
  }

  // ---------- 错题本 ----------
  function getWrong() {
    return wrong
      .slice()
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((w) => {
        const q = questions.find((x) => x.id === w.qid);
        return { wrong: w, question: q };
      })
      .filter((x) => x.question);
  }
  function addWrong(qid) {
    if (wrong.some((w) => w.qid === qid)) return false;
    wrong.push({ id: uid(), qid: qid, addedAt: Date.now(), note: '' });
    persist();
    return true;
  }
  function removeWrong(wid) {
    wrong = wrong.filter((w) => w.id !== wid);
    persist();
  }
  function wrongCount() {
    return wrong.length;
  }

  // ---------- 练习记录 / 统计 ----------
  function logPractice(qid, correct) {
    log.push({ id: uid(), qid: qid, correct: !!correct, at: Date.now() });
    persist();
  }
  function getStats() {
    const chaptersList = getChapters().filter((c) => !c.parentId); // 仅章
    const total = questions.length;
    const practicedQids = {};
    log.forEach((l) => (practicedQids[l.qid] = true));
    const practiced = Object.keys(practicedQids).length;
    let totalCorrect = 0;
    let totalLog = 0;
    log.forEach((l) => {
      totalLog++;
      if (l.correct) totalCorrect++;
    });
    const overall = totalLog ? Math.round((totalCorrect / totalLog) * 100) : 0;
    const perChapter = chaptersList.map((ch) => {
      const secIds = getSections(ch.id).map((s) => s.id);
      const allIds = [ch.id].concat(secIds);
      const qs = questions.filter((q) => allIds.indexOf(q.chapterId) !== -1);
      const qids = qs.map((q) => q.id);
      const recs = log.filter((l) => qids.indexOf(l.qid) !== -1);
      const c = recs.filter((r) => r.correct).length;
      const n = recs.length;
      return {
        name: ch.name,
        count: qs.length,
        practiced: new Set(recs.map((r) => r.qid)).size,
        correct: c,
        total: n,
        rate: n ? Math.round((c / n) * 100) : 0,
      };
    });
    return {
      total: total,
      practiced: practiced,
      overall: overall,
      perChapter: perChapter,
      wrong: wrong.length,
    };
  }

  // ---------- 字号 ----------
  function getFont() {
    const f = parseInt(localStorage.getItem(LS.font) || '14', 10);
    return isNaN(f) ? 14 : f;
  }
  function setFont(f) {
    localStorage.setItem(LS.font, String(f));
  }

  // ---------- 设置（断点续刷 / 答错自动入错 / 默认模式 / 启动页） ----------
  function getSettings() {
    return load(LS.settings, {});
  }
  function getSetting(key, def) {
    const s = getSettings();
    return s[key] === undefined ? def : s[key];
  }
  function setSetting(key, val) {
    const s = getSettings();
    s[key] = val;
    save(LS.settings, s);
  }

  // ---------- 断点续刷进度 ----------
  function getProgress() {
    return load(LS.progress, null);
  }
  function saveProgress(data) {
    save(LS.progress, data);
  }
  function clearProgress() {
    localStorage.removeItem(LS.progress);
  }
  function makeSessionKey(page, filters) {
    return page + '|' + JSON.stringify(filters || {});
  }

  // ---------- 导出 / 导入（桌面<->手机互转） ----------
  function exportJSON() {
    return JSON.stringify(
      { version: 1, chapters: chapters, questions: questions, wrong: wrong, log: log },
      null, 2
    );
  }
  function exportScoped(chapterId, sectionId) {
    // 按范围导出：都为空=全库；有chapterId=该章+所有节；有sectionId=仅该节
    let targetIds = null;
    if (sectionId) {
      targetIds = [sectionId];
    } else if (chapterId) {
      targetIds = [chapterId];
      const secs = getSections(chapterId);
      secs.forEach((s) => { targetIds.push(s.id); });
    }
    const filtChapters = targetIds
      ? chapters.filter((c) => targetIds.indexOf(c.id) !== -1)
      : chapters.slice();
    const filtQuestions = targetIds
      ? questions.filter((q) => targetIds.indexOf(q.chapterId) !== -1)
      : questions.slice();
    return JSON.stringify(
      { version: 1, chapters: filtChapters, questions: filtQuestions },
      null, 2
    );
  }
  function importJSON(txt, replace, targetChapterId) {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.questions)) throw new Error('格式不正确');
    const mode = replace ? 'replace' : 'merge';
    if (mode === 'replace') {
      if (d.chapters) chapters = d.chapters;
      if (d.questions) {
        // 兼容电脑端导出（蛇形 opt_a~d / knowledge_point）与安卓端导出（驼峰 optA~D / knowledge）
        questions = d.questions.map((q) => ({
          id: q.id || uid(),
          chapterId: q.chapterId,
          knowledge: q.knowledge || q.knowledge_point || '',
          type: q.type || 'single',
          stem: q.stem || '',
          optA: q.optA != null ? q.optA : (q.opt_a || ''),
          optB: q.optB != null ? q.optB : (q.opt_b || ''),
          optC: q.optC != null ? q.optC : (q.opt_c || ''),
          optD: q.optD != null ? q.optD : (q.opt_d || ''),
          answer: q.answer || '',
          explanation: q.explanation || '',
          order: q.order_no != null ? q.order_no : (q.order != null ? q.order : 0),
        }));
      }
      if (d.wrong) wrong = d.wrong;
      if (d.log) log = d.log;
      persist();
      return;
    }
    // merge：按 章/节 名称归位，题目按 题干+题型+答案 去重，避免越导越多
    const idMap = {}; // 旧 chapter.id -> 新 chapter.id
    let newChap = 0;
    // 如果指定了目标章节，直接用目标章节，不创建新章节
    const useTarget = !!targetChapterId;
    (d.chapters || []).forEach((c) => {
      if (useTarget) {
        idMap[c.id] = targetChapterId;
        return; // 不创建新章/节
      }
      const ex = getOrCreateChapter(c.name, c.parentId ? idMap[c.parentId] || null : null);
      idMap[c.id] = ex.id;
      if (ex.id.indexOf('id') === 0 && !chapters.find((x) => x.id === ex.id)) newChap++;
    });
    let added = 0;
    (d.questions || []).forEach((q) => {
      const cid = useTarget ? targetChapterId : (idMap[q.chapterId] || q.chapterId);
      const kp = q.knowledge_point || q.knowledge || '';
      // 去重：优先按知识标识(knowledge_point)——唯一且不因题干重复误删复习重复题；
      //       无标识时兜底按 题干+题型+答案（兼容安卓端自导题库）
      const exists = questions.find(
        (x) =>
          (kp && x.knowledge === kp) ||
          (!kp && x.chapterId === cid && x.stem === q.stem && x.type === q.type && x.answer === q.answer)
      );
      if (exists) return;
      addQuestion({
        chapterId: cid,
        knowledge: kp,
        type: q.type || 'single',
        stem: q.stem || '',
        optA: q.optA != null ? q.optA : (q.opt_a || ''),
        optB: q.optB != null ? q.optB : (q.opt_b || ''),
        optC: q.optC != null ? q.optC : (q.opt_c || ''),
        optD: q.optD != null ? q.optD : (q.opt_d || ''),
        answer: q.answer || '',
        explanation: q.explanation || '',
      });
      added++;
    });
    // 错题 / 记录：仅补充当前库里存在的题
    if (d.wrong) {
      d.wrong.forEach((w) => { if (questions.find((q) => q.id === w.qid)) addWrong(w.qid); });
    }
    if (d.log) {
      d.log.forEach((l) => {
        if (questions.find((q) => q.id === l.qid)) {
          log.push({ id: uid(), qid: l.qid, correct: !!l.correct, at: l.at || Date.now() });
        }
      });
      persist();
    }
    return { added: added };
  }

  const API = {
    LS: LS,
    getChapters: getChapters,
    getSections: getSections,
    getOrCreateChapter: getOrCreateChapter,
    addChapter: addChapter,
    chapterName: chapterName,
    deleteChapter: deleteChapter,
    resolveChapter: resolveChapter,
    getQuestions: getQuestions,
    getQuestion: getQuestion,
    addQuestion: addQuestion,
    updateQuestion: updateQuestion,
    deleteQuestion: deleteQuestion,
    swapOrder: swapOrder,
    updateChapterName: updateChapterName,
    moveQuestions: moveQuestions,
    getWrong: getWrong,
    addWrong: addWrong,
    removeWrong: removeWrong,
    wrongCount: wrongCount,
    logPractice: logPractice,
    getStats: getStats,
    getFont: getFont,
    setFont: setFont,
    getSettings: getSettings,
    getSetting: getSetting,
    setSetting: setSetting,
    getProgress: getProgress,
    saveProgress: saveProgress,
    clearProgress: clearProgress,
    makeSessionKey: makeSessionKey,
    exportJSON: exportJSON,
    exportScoped: exportScoped,
    importJSON: importJSON,
  };

  global.Store = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
