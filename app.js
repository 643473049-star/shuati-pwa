(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[c]));
  }
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  const TITLES = { entry: '录入题库', bank: '题库管理', practice: '开始刷题', wrong: '错题本', settings: '设置' };
  const TYPES = { single: '单选', multiple: '多选', short: '简答' };
  let font = Store.getFont();
  const state = { page: 'entry', practice: null, entryCards: [] };

  function applyFont() {
    document.documentElement.style.setProperty('--fs', font + 'px');
    Store.setFont(font);
  }

  // ---------------- 弹窗 ----------------
  function modal(html, opts) {
    opts = opts || {};
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask && !opts.noClose) closeModal(mask); });
    return mask;
  }
  function closeModal(mask) { if (mask && mask.parentNode) mask.parentNode.removeChild(mask); }

  // ---------------- 导航 ----------------
  function go(page) {
    state.page = page;
    $('#pageTitle').textContent = TITLES[page] || '';
    $$('#nav .tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
    const v = $('#view');
    v.innerHTML = '';
    if (page === 'entry') renderEntry(v);
    else if (page === 'bank') renderBank(v);
    else if (page === 'practice') renderPractice(v);
    else if (page === 'wrong') renderWrong(v);
    else if (page === 'settings') renderSettings(v);
    window.scrollTo(0, 0);
  }

  function datalistHtml() {
    const chaps = Store.getChapters();
    const kps = {};
    Store.getQuestions({}).forEach((q) => { if (q.knowledge) kps[q.knowledge] = 1; });
    const ch = chaps.map((c) => `<option value="${esc(c.name)}">`).join('');
    const kp = Object.keys(kps).map((k) => `<option value="${esc(k)}">`).join('');
    return `<datalist id="dlChap">${ch}</datalist><datalist id="dlKp">${kp}</datalist>`;
  }

  // ================= 录入 =================
  function renderEntry(v) {
    v.innerHTML = `
      ${datalistHtml()}
      <div class="card">
        <label class="fld">粘贴题目文字（支持整段；用【答案】【解析】标记；选择和简答可混排）</label>
        <textarea id="paste" rows="6" placeholder="1．题目……
A．选项  B．选项
【答案】B
【解析】……"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="btnParse">解析</button>
          <button class="btn ghost" id="btnClear2">清空</button>
          <span class="spacer"></span>
          <span class="muted small" id="parseInfo"></span>
        </div>
      </div>
      <div class="card" id="batchBar" style="display:none">
        <div class="row">
          <input type="text" id="bChap" list="dlChap" placeholder="章（如 第一章）" style="flex:1">
          <input type="text" id="bSec" placeholder="节（可空）" style="flex:1">
        </div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="bKp" list="dlKp" placeholder="知识点（可空）" style="flex:1">
          <button class="btn sm" id="bApply">应用到全部</button>
        </div>
      </div>
      <div id="entryList"></div>
      <button class="btn block" id="btnSave" style="display:none">保存到题库</button>
    `;
    $('#btnParse').onclick = () => {
      const txt = $('#paste').value;
      const cards = QParser.parseQuestions(txt);
      state.entryCards = cards.map((c) => ({
        seq: c.seq, type: c.type, stem: c.stem,
        options: Object.assign({ A: '', B: '', C: '', D: '' }, c.options),
        answer: c.answer, explanation: c.explanation, knowledge: '', chapter: '', section: '',
        warnEmpty: c.warnEmpty,
      }));
      $('#batchBar').style.display = cards.length ? 'block' : 'none';
      $('#btnSave').style.display = cards.length ? 'block' : 'none';
      $('#parseInfo').textContent = `识别到 ${cards.length} 道题`;
      renderEntryCards();
    };
    $('#btnClear2').onclick = () => { $('#paste').value = ''; state.entryCards = []; $('#entryList').innerHTML = ''; $('#batchBar').style.display = 'none'; $('#btnSave').style.display = 'none'; $('#parseInfo').textContent = ''; };
    $('#bApply').onclick = () => {
      const ch = $('#bChap').value.trim(), sec = $('#bSec').value.trim(), kp = $('#bKp').value.trim();
      state.entryCards.forEach((c) => { c.chapter = ch; c.section = sec; c.knowledge = kp; });
      renderEntryCards();
    };
    $('#btnSave').onclick = saveEntryCards;
  }

  function renderEntryCards() {
    const box = $('#entryList');
    box.innerHTML = '';
    state.entryCards.forEach((c, i) => {
      const isChoice = c.type !== 'short';
      const warn = c.warnEmpty ? `<span class="tag warn">选项为空·可能原题是图片</span>` : '';
      const optInputs = ['A', 'B', 'C', 'D'].map((k) =>
        `<label class="fld">${k}</label><input type="text" data-i="${i}" data-f="opt${k}" value="${esc(c.options[k])}" ${isChoice ? '' : 'disabled'}>`
      ).join('');
      const ansLabel = c.type === 'multiple' ? '正确答案（如 B,C）' : (c.type === 'single' ? '正确答案（如 B）' : '参考答案');
      box.appendChild(el(`
        <div class="card">
          <div class="row">
            <b>题${esc(c.seq || i + 1)}</b>
            <span class="spacer"></span>
            ${warn}
          </div>
          <div class="row" style="margin:6px 0">
            ${['single', 'multiple', 'short'].map((t) =>
              `<label class="row" style="gap:4px"><input type="radio" name="t${i}" value="${t}" data-i="${i}" data-f="type" ${c.type === t ? 'checked' : ''}>${TYPES[t]}</label>`
            ).join('')}
          </div>
          <label class="fld">章 / 节 / 知识点</label>
          <div class="row">
            <input type="text" data-i="${i}" data-f="chapter" list="dlChap" value="${esc(c.chapter)}" placeholder="章">
            <input type="text" data-i="${i}" data-f="section" value="${esc(c.section)}" placeholder="节">
            <input type="text" data-i="${i}" data-f="knowledge" list="dlKp" value="${esc(c.knowledge)}" placeholder="知识点">
          </div>
          <label class="fld">题干</label>
          <textarea data-i="${i}" data-f="stem" rows="3">${esc(c.stem)}</textarea>
          ${isChoice ? `<label class="fld">选项</label>${optInputs}` : ''}
          <label class="fld">${ansLabel}</label>
          <textarea data-i="${i}" data-f="answer" rows="2">${esc(c.answer)}</textarea>
          <label class="fld">解析</label>
          <textarea data-i="${i}" data-f="explanation" rows="2">${esc(c.explanation)}</textarea>
        </div>
      `));
    });
    // 绑定输入
    $$('#entryList [data-f]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = +inp.dataset.i, f = inp.dataset.f;
        if (f === 'type') {
          if (inp.checked) state.entryCards[i].type = inp.value;
          renderEntryCards();
        } else if (f.startsWith('opt')) {
          state.entryCards[i].options[f.slice(3)] = inp.value;
        } else {
          state.entryCards[i][f] = inp.value;
        }
      });
    });
  }

  function saveEntryCards() {
    let n = 0;
    state.entryCards.forEach((c) => {
      const chap = c.chapter.trim() || '未分类';
      const cid = Store.resolveChapter(chap, c.section.trim());
      if (!cid) return;
      Store.addQuestion({
        chapterId: cid,
        knowledge: c.knowledge.trim(),
        type: c.type,
        stem: c.stem.trim(),
        optA: c.type === 'short' ? '' : c.options.A.trim(),
        optB: c.type === 'short' ? '' : c.options.B.trim(),
        optC: c.type === 'short' ? '' : c.options.C.trim(),
        optD: c.type === 'short' ? '' : c.options.D.trim(),
        answer: c.answer.trim(),
        explanation: c.explanation.trim(),
      });
      n++;
    });
    state.entryCards = [];
    $('#entryList').innerHTML = '';
    $('#batchBar').style.display = 'none';
    $('#btnSave').style.display = 'none';
    $('#paste').value = '';
    alert(`已保存 ${n} 道题`);
    go('bank');
  }

  // ================= 题库管理 =================
  let bankMultiSel = new Set(); // 题库多选 ID 集合
  function renderBank(v) {
    try {
      bankMultiSel = new Set();
      const tree = Store.getChapters().filter((c) => !c.parentId);
    const chapOpts = `<option value="">（全部章节）</option>` +
      tree.map((ch) => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('');
    v.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:center">
          <label style="font-size:var(--fs);margin-right:4px">章</label>
          <select id="fChap" style="flex:2;font-size:var(--fs)">${chapOpts}</select>
          <label style="font-size:var(--fs);margin:0 4px">节</label>
          <select id="fSec" style="flex:2;font-size:var(--fs)" disabled><option value="">（全部节）</option></select>
        </div>
        <div class="row" style="margin-top:8px">
          <select id="fType" style="flex:1;font-size:var(--fs)">
            <option value="">全部题型</option>
            <option value="single">单选</option>
            <option value="multiple">多选</option>
            <option value="short">简答</option>
          </select>
        </div>
        <input type="text" id="fKw" placeholder="搜索题干/答案/解析…" style="margin-top:8px;font-size:var(--fs)">
        <div class="row" style="margin-top:8px">
          <button class="btn sm" id="btnNew">+ 新建题目</button>
          <button class="btn sm ghost" id="btnNewChap">📁 新建章节</button>
          <button class="btn sm ghost" id="btnEditTitle">✏️ 改名</button>
          <span class="spacer"></span>
          <button class="btn sm danger" id="btnDelChap" disabled>删除此章节</button>
        </div>
        <!-- 多选操作栏 -->
        <div id="bankMultiBar" class="bank-multi-bar" style="display:none">
          <span class="muted small">已选 <strong id="bankMultiCount">0</strong> 题</span>
          <span class="spacer"></span>
          <button class="btn sm" id="btnMoveQs">📦 移动到…</button>
          <button class="btn sm danger" id="btnDelQs">🗑️ 删除</button>
          <button class="btn sm ghost" id="btnCancelSel">取消</button>
        </div>
        <div class="row" style="margin-top:6px"><span class="muted small" id="bankInfo"></span></div>
        <div id="bankDebug" style="margin-top:4px"></div>
      </div>
      <div id="bankList"></div>
    `;

    // 章联动更新节
    const updateSecs = () => {
      const chId = $('#fChap').value;
      const secSel = $('#fSec');
      if (!chId) {
        secSel.innerHTML = '<option value="">（全部节）</option>';
        secSel.disabled = true;
      } else {
        const secs = Store.getSections(chId);
        secSel.innerHTML = '<option value="">（全部节）</option>' +
          secs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
        secSel.disabled = false;
      }
      refresh();
    };
    $('#fChap').onchange = updateSecs;
    $('#fSec').onchange = refresh;
    $('#fType').onchange = refresh;
    $('#fKw').addEventListener('input', refresh);

    // 初始化节下拉
    updateSecs();

    // ---- 改名按钮 ----
    $('#btnEditTitle').onclick = () => {
      const chId = $('#fChap').value;
      const secId = $('#fSec').value;
      const targetId = secId || chId;
      if (!targetId) { alert('请先选择要改名的章或节'); return; }
      const isSec = !!secId;
      const kind = isSec ? '节' : '章';
      const oldName = Store.chapterName(targetId);
      const m = modal(`
        <h3>修改${kind}名称</h3>
        <label class="fld">${kind}名称</label>
        <input type="text" id="editTitleInput" value="${esc(oldName)}" style="font-size:var(--fs)">
        <div class="row" style="margin-top:14px">
          <button class="btn" id="editTitleSave">保存</button>
          <button class="btn ghost" id="editTitleCancel">取消</button>
        </div>
      `);
      $('#editTitleSave', m).onclick = () => {
        const newName = $('#editTitleInput', m).value.trim();
        if (!newName) { alert('名称不能为空'); return; }
        const r = Store.updateChapterName(targetId, newName);
        if (r) { closeModal(m); go('bank'); }
        else alert('保存失败');
      };
      $('#editTitleCancel', m).onclick = () => closeModal(m);
    };

    // ---- 新建章节按钮 ----
    $('#btnNewChap').onclick = () => {
      const curChId = $('#fChap').value;
      const tree = Store.getChapters().filter((c) => !c.parentId);
      const chapOpts = '<option value="">（新建章）</option>' +
        tree.map((ch) => `<option value="${ch.id}" ${ch.id === curChId ? 'selected' : ''}>${esc(ch.name)}</option>`).join('');
      const m = modal(`
        <h3>📁 新建章节</h3>
        <label class="fld">所属章</label>
        <select id="ncChap" style="font-size:var(--fs)">${chapOpts}</select>
        <label class="fld">章名称 <span class="muted small">（选「新建章」时填写）</span></label>
        <input type="text" id="ncChapName" placeholder="如：物理、数学…" style="font-size:var(--fs)">
        <label class="fld">节名称 <span class="muted small">（可选，不填则只建章）</span></label>
        <input type="text" id="ncSecName" placeholder="如：力学、电学…（留空则不建节）" style="font-size:var(--fs)">
        <div class="row" style="margin-top:14px">
          <button class="btn" id="ncSave">创建</button>
          <button class="btn ghost" id="ncCancel">取消</button>
        </div>
      `);
      // 选已有章时，禁用章名称输入并自动填充
      const chapSel = $('#ncChap', m);
      const chapNameInput = $('#ncChapName', m);
      const syncChapName = () => {
        if (chapSel.value) {
          // 选中已有章 → 章名称禁用（用已有的）
          chapNameInput.value = '';
          chapNameInput.disabled = true;
          chapNameInput.placeholder = '将使用已选的「' + chapSel.options[chapSel.selectedIndex].text + '」';
        } else {
          // 新建章 → 需要输入章名
          chapNameInput.disabled = false;
          chapNameInput.placeholder = '如：物理、数学…';
        }
      };
      chapSel.onchange = syncChapName;
      syncChapName(); // 初始化
      $('#ncCancel', m).onclick = () => closeModal(m);
      $('#ncSave', m).onclick = () => {
        const existingChapId = chapSel.value;           // 选了已有章 → 用它的ID
        const newChapName = chapNameInput.value.trim();   // 新建章的名称
        const secName = ($('#ncSecName', m).value || '').trim(); // 节名称
        // 校验
        if (!existingChapId && !newChapName) { alert('请选择已有章，或填写新章名称'); return; }
        let chapterId = existingChapId;
        // 如果是新建章
        if (!existingChapId && newChapName) {
          const ch = Store.addChapter(newChapName, null);
          if (!ch) { alert('创建章失败'); return; }
          chapterId = ch.id;
        }
        // 如果要建节
        if (secName) {
          const sec = Store.addChapter(secName, chapterId);
          if (!sec) { alert('创建节失败'); return; }
        }
        closeModal(m);
        go('bank');
      };
    };

    // ---- 多选操作栏事件 ----
    $('#btnCancelSel').onclick = () => { bankMultiSel.clear(); refresh(); };
    $('#btnDelQs').onclick = () => {
      if (bankMultiSel.size === 0) return;
      const n = bankMultiSel.size;
      if (!confirm(`确定删除选中的 ${n} 道题？此操作不可撤销！`)) return;
      bankMultiSel.forEach((qid) => Store.deleteQuestion(qid));
      bankMultiSel.clear(); refresh();
    };
    $('#btnMoveQs').onclick = () => {
      if (bankMultiSel.size === 0) return;
      openMoveDialog(Array.from(bankMultiSel), () => { bankMultiSel.clear(); refresh(); });
    };

    function refresh() {
      const chId = $('#fChap').value;
      const secId = $('#fSec').value;
      const type = $('#fType').value;
      const kw = $('#fKw').value;

      // 判断删除/改名按钮状态
      const hasSelection = chId || secId;
      $('#btnDelChap').disabled = !hasSelection;
      $('#btnEditTitle').disabled = !hasSelection;

      // ---- 调试信息（方便排查）----
      const dbg = $('#bankDebug');
      if (dbg) {
        const totalQs = Store.getQuestions({}).length;
        const totalChaps = Store.getChapters().length;
        const secs = chId ? Store.getSections(chId) : [];
        const hasData = totalQs > 0;
        dbg.innerHTML = `<div style="padding:6px 10px;border-radius:6px;font-size:12px;${hasData ? 'background:#e8f5e9;color:#2e7d32' : 'background:#ffebee;color:#c62828'}"><b>[v3]</b> 总题<strong>${totalQs}</strong> | 章/节<strong>${totalChaps}</strong> | ${chId ? '章ID='+chId.slice(0,8)+'..' : '未选章'} | 节数=${secs.length}${!hasData ? ' ⚠️ 请先导入题库数据！' : ''}</div>`;
      }

      // 查询题目：直接按 ID 列表逐个查再合并（比 __multi__ 前缀更可靠）
      let qs;
      try {
        if (secId) {
          // 选了具体节 → 只查该节
          qs = Store.getQuestions({ chapterId: secId, type: type || null, keyword: kw });
        } else if (chId) {
          // 选了章没选节 → 查该章 + 所有子节
          const secs = Store.getSections(chId);
          const allIds = [chId].concat(secs.map((s) => s.id));
          qs = [];
          const seen = new Set();
          allIds.forEach((id) => {
            const sub = Store.getQuestions({ chapterId: id, type: type || null, keyword: kw });
            sub.forEach((q) => { if (!seen.has(q.id)) { seen.add(q.id); qs.push(q); } });
          });
        } else {
          // 都没选 → 查全部
          qs = Store.getQuestions({ type: type || null, keyword: kw });
        }
      } catch(e) {
        console.error('[bank refresh] error:', e);
        $('#bankList').innerHTML = '<div class="center-msg" style="color:red">查询出错: ' + esc(e.message) + '</div>';
        return;
      }
      $('#bankInfo').textContent = `共 ${qs.length} 道题`;
      const box = $('#bankList');
      box.innerHTML = '';
      if (!qs.length) { box.appendChild(el(`<div class="center-msg">暂无题目</div>`)); return; }

      // 多选模式
      const multiMode = bankMultiSel.size > 0;
      const multiBar = $('#bankMultiBar');
      multiBar.style.display = multiMode ? 'flex' : 'none';
      $('#bankMultiCount').textContent = bankMultiSel.size;

      qs.forEach((q, idx) => {
        const isFirst = idx === 0, isLast = idx === qs.length - 1;
        const checked = bankMultiSel.has(q.id) ? 'checked' : '';
        box.appendChild(el(`
          <div class="card ${checked ? 'bank-sel-card' : ''}" data-qid="${q.id}">
            <div class="row">
              <label class="bank-chk-wrap"><input type="checkbox" class="bank-chk" data-qid="${q.id}" ${checked}></label>
              <span class="tag ${q.type}">${TYPES[q.type]}</span>
              <span class="muted small">${esc(Store.chapterName(q.chapterId))}</span>
              <span class="spacer"></span>
              <button class="btn sm ghost" data-act="up" data-id="${q.id}" ${isFirst ? 'disabled' : ''}>↑</button>
              <button class="btn sm ghost" data-act="down" data-id="${q.id}" ${isLast ? 'disabled' : ''}>↓</button>
            </div>
            <div style="margin:8px 0; white-space:pre-wrap">${esc(q.stem).slice(0, 160)}${q.stem.length > 160 ? '…' : ''}</div>
            ${q.type !== 'short' ? `<div class="bank-q-opts">${['A','B','C','D'].filter(k => q['opt'+k]).map(k => `<span class="bank-q-opt"><b>${k}.</b> ${esc(q['opt'+k]).slice(0,60)}${(q['opt'+k]||'').length > 60 ? '…' : ''}</span>`).join('')}</div>` : ''}
            <div class="row">
              <button class="btn sm ghost" data-act="view" data-id="${q.id}">查看</button>
              <button class="btn sm ghost" data-act="edit" data-id="${q.id}">编辑</button>
              <button class="btn sm danger" data-act="del" data-id="${q.id}">删除</button>
            </div>
          </div>
        `));
      });
      // 多选 checkbox 事件
      $$('#bankList .bank-chk').forEach((cb) => {
        cb.onchange = () => {
          const qid = cb.dataset.qid;
          if (cb.checked) bankMultiSel.add(qid); else bankMultiSel.delete(qid);
          refresh();
        };
      });
      // 卡片长按/点击进入多选模式（移动端友好）
      $$('#bankList .card[data-qid]').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
          const qid = card.dataset.qid;
          if (!bankMultiSel.has(qid)) bankMultiSel.add(qid); else bankMultiSel.delete(qid);
          refresh();
        });
      });
      $$('#bankList [data-act]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.id, act = b.dataset.act;
          // 通过 ID 查找题目对象（不用 idx，因为此回调在 forEach 外层）
          const qi = qs.findIndex((x) => x.id === id);
          const qItem = qs[qi];
          if (!qItem) return;
          if (act === 'up') { const prev = qs[qi - 1]; if (prev) { Store.swapOrder(id, prev.id); refresh(); } }
          else if (act === 'down') { const next = qs[qi + 1]; if (next) { Store.swapOrder(id, next.id); refresh(); } }
          else if (act === 'view') openView(qItem);
          else if (act === 'edit') openEdit(qItem);
          else if (act === 'del') {
            if (confirm('确定删除这道题？关联的错题和练习记录也会删除。')) { Store.deleteQuestion(id); refresh(); }
          }
        };
      });
    };
    $('#btnNew').onclick = () => openEdit(null);
    $('#btnDelChap').onclick = () => {
      const secId = $('#fSec').value;
      const chId = $('#fChap').value;
      const targetId = secId || chId;
      if (!targetId) return;
      const info = Store.chapterName(targetId);
      const isSec = !!secId;
      const kind = isSec ? '节' : '章';
      let msg = `确定删除「${info}」这个${kind}吗？\n`;
      if (isSec) msg += '该节下所有题目将被删除。';
      else msg += '⚠ 将同时删除该章下所有节、所有题目，以及相关的错题和练习记录！';
      msg += '\n此操作不可撤销！';
      if (confirm(msg)) {
        const r = Store.deleteChapter(targetId);
        alert(`已删除 ${r.chapters} 个${kind}、${r.questions} 道题`);
        go('bank');
      }
    };
    } catch(e) {
      console.error('[renderBank] error:', e);
      v.innerHTML = `<div style="padding:20px;text-align:center;color:red"><h3>题库管理加载出错</h3><pre>${esc(e.stack || e.message)}</pre><button class="btn" onclick="location.reload()">刷新页面</button></div>`;
    }
  }

  function openView(q) {
    const optHtml = q.type === 'short' ? '' :
      ['A', 'B', 'C', 'D'].filter((k) => q['opt' + k]).map((k) =>
        `<div style="margin:4px 0"><b>${k}．</b>${esc(q['opt' + k])}</div>`).join('');
    const m = modal(`
      <h3>题目详情</h3>
      <div class="row"><span class="tag ${q.type}">${TYPES[q.type]}</span>
      <span class="muted small">${esc(Store.chapterName(q.chapterId))} · ${esc(q.knowledge)}</span></div>
      <div style="margin:10px 0; white-space:pre-wrap">${esc(q.stem)}</div>
      ${optHtml}
      <hr class="sep">
      <div><b>答案：</b><span style="white-space:pre-wrap">${esc(q.answer)}</span></div>
      <div style="margin-top:8px"><b>解析：</b><span style="white-space:pre-wrap">${esc(q.explanation) || '（无）'}</span></div>
      <button class="btn block" style="margin-top:14px" id="mVclose">关闭</button>
    `);
    $('#mVclose', m).onclick = () => closeModal(m);
  }

  function openEdit(q) {
    const isNew = !q;
    const q0 = q || { type: 'single', stem: '', optA: '', optB: '', optC: '', optD: '', answer: '', explanation: '', knowledge: '', chapterId: '' };
    const chapName = q ? Store.chapterName(q.chapterId) : '';
    const m = modal(`
      <h3>${isNew ? '新建题目' : '编辑题目'}</h3>
      <div class="row">
        ${['single', 'multiple', 'short'].map((t) => `<label class="row" style="gap:4px"><input type="radio" name="et" value="${t}" ${q0.type === t ? 'checked' : ''}>${TYPES[t]}</label>`).join('')}
      </div>
      <div class="row" style="margin-top:8px">
        <input type="text" id="eChap" list="dlChap" value="${esc(chapName.split(' / ')[0] || '')}" placeholder="章">
        <input type="text" id="eSec" value="${esc(chapName.split(' / ')[1] || '')}" placeholder="节">
        <input type="text" id="eKp" list="dlKp" value="${esc(q0.knowledge)}" placeholder="知识点">
      </div>
      <label class="fld">题干</label>
      <textarea id="eStem" rows="3">${esc(q0.stem)}</textarea>
      <div id="eOpts">
        ${['A', 'B', 'C', 'D'].map((k) => `<label class="fld">${k}</label><input type="text" id="eOpt${k}" value="${esc(q0['opt' + k] || '')}">`).join('')}
      </div>
      <label class="fld" id="eAnsLabel">答案</label>
      <textarea id="eAns" rows="2">${esc(q0.answer)}</textarea>
      <label class="fld">解析</label>
      <textarea id="eExp" rows="2">${esc(q0.explanation)}</textarea>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="eSave">保存</button>
        <button class="btn ghost" id="eCancel">取消</button>
      </div>
    `);
    const syncType = () => {
      const t = $('input[name=et]:checked', m).value;
      $('#eOpts', m).style.display = t === 'short' ? 'none' : 'block';
      $('#eAnsLabel', m).textContent = t === 'multiple' ? '正确答案（如 B,C）' : (t === 'single' ? '正确答案' : '参考答案');
    };
    $$('input[name=et]', m).forEach((r) => (r.onchange = syncType));
    syncType();
    $('#eCancel', m).onclick = () => closeModal(m);
    $('#eSave', m).onclick = () => {
      const t = $('input[name=et]:checked', m).value;
      const chap = $('#eChap', m).value.trim() || '未分类';
      const cid = Store.resolveChapter(chap, $('#eSec', m).value.trim());
      if (!cid) { alert('章节无效'); return; }
      const data = {
        chapterId: cid, knowledge: $('#eKp', m).value.trim(), type: t, stem: $('#eStem', m).value.trim(),
        answer: $('#eAns', m).value.trim(), explanation: $('#eExp', m).value.trim(),
        optA: t === 'short' ? '' : $('#eOptA', m).value.trim(),
        optB: t === 'short' ? '' : $('#eOptB', m).value.trim(),
        optC: t === 'short' ? '' : $('#eOptC', m).value.trim(),
        optD: t === 'short' ? '' : $('#eOptD', m).value.trim(),
      };
      if (isNew) Store.addQuestion(data); else Store.updateQuestion(q.id, data);
      closeModal(m);
      go('bank');
    };
  }

  /** 移动题目弹窗 */
  function openMoveDialog(qids, onDone) {
    const tree = Store.getChapters().filter((c) => !c.parentId);
    const chapOpts = tree.map((ch) => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('');
    const m = modal(`
      <h3>📦 移动题目</h3>
      <div class="muted small">将选中的 ${qids.length} 道题移动到：</div>
      <label class="fld" style="margin-top:10px">目标章</label>
      <select id="moveChap" style="font-size:var(--fs)"><option value="">请选择章</option>${chapOpts}</select>
      <label class="fld" style="margin-top:8px">目标节（可选，不选则归入章下）</label>
      <select id="moveSec" style="font-size:var(--fs)" disabled><option value="">（无/直接归章）</option></select>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="moveDo">确认移动</button>
        <button class="btn ghost" id="moveCancel">取消</button>
      </div>
    `);
    const chapSel = $('#moveChap', m), secSel = $('#moveSec', m);
    chapSel.onchange = () => {
      if (!chapSel.value) { secSel.disabled = true; secSel.innerHTML = '<option value="">（无/直接归章）</option>'; return; }
      const secs = Store.getSections(chapSel.value);
      secSel.innerHTML = '<option value="">（无/直接归章）</option>' +
        secs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      secSel.disabled = false;
    };
    $('#moveCancel', m).onclick = () => closeModal(m);
    $('#moveDo', m).onclick = () => {
      let targetId = secSel.value || chapSel.value;
      if (!targetId) { alert('请选择目标章节'); return; }
      const moved = Store.moveQuestions(qids, targetId);
      closeModal(m);
      alert(`已移动 ${moved} 道题`);
      if (onDone) onDone();
    };
  }

  // ================= 刷题 =================
  function renderPractice(v) {
    const chaps = Store.getChapters().filter((c) => !c.parentId);
    const tree = chaps.map((ch) => {
      const secs = Store.getSections(ch.id);
      const secHtml = secs.map((s) =>
        `<label class="sec"><input type="checkbox" class="secChk" value="${s.id}"><span>${esc(s.name)}</span></label>`
      ).join('');
      return `<div class="chap"><div class="head">📖 ${esc(ch.name)} <span class="spacer"></span><span class="muted small">${secs.length}节</span></div>${secHtml}</div>`;
    }).join('') || `<div class="center-msg">还没有章节，先去录入题库</div>`;
    v.innerHTML = `
      <div class="card">
        <label class="fld">选择章节（可多选；不选则刷全部）</label>
        <div id="chapTree">${tree}</div>
      </div>
      <div class="card">
        <label class="fld">题型</label>
        <div class="row">
          ${['single', 'multiple', 'short'].map((t, i) => `<label class="row" style="gap:4px"><input type="checkbox" class="typeChk" value="${t}" checked>${TYPES[t]}</label>`).join('')}
        </div>
        <label class="fld">顺序 / 随机</label>
        <div class="row">
          <label class="row" style="gap:4px"><input type="radio" name="mode" value="sequence" checked>顺序</label>
          <label class="row" style="gap:4px"><input type="radio" name="mode" value="random">随机</label>
        </div>
        <button class="btn block" id="btnStart" style="margin-top:10px">开始刷题</button>
        <button class="btn block ghost" id="btnResume" style="margin-top:8px;display:none">📚 继续刷题（上次进度）</button>
      </div>
      <div id="practiceArea"></div>
    `;
    $('#btnStart').onclick = () => {
      const secIds = $$('.secChk:checked').map((c) => c.value);
      const types = $$('.typeChk:checked').map((c) => c.value);
      let base = [];
      if (secIds.length) secIds.forEach((id) => { base = base.concat(Store.getQuestions({ chapterId: id })); });
      else base = Store.getQuestions({});
      base = base.filter((q) => types.indexOf(q.type) !== -1);
      if (!base.length) { alert('没有符合条件的题目'); return; }
      const mode = $('input[name=mode]:checked').value;
      if (mode === 'random') base = base.slice().sort(() => Math.random() - 0.5);
      const key = Store.makeSessionKey('practice', { mode: mode, secIds: secIds, types: types });
      Store.setSetting('defaultMode', mode);
      quizFrom = 'practice';
      startPractice(base, $('#practiceArea'), key, 0, 0);
    };

    // 继续刷题按钮（有未完成会话时显示）
    const saved = Store.getProgress();
    const btnResume = $('#btnResume');
    if (Store.getSetting('resume', '1') === '1' && saved && saved.key && saved.key.indexOf('practice|') === 0 && saved.idx < saved.qids.length) {
      btnResume.style.display = '';
      const total = saved.qids.length;
      btnResume.textContent = `📚 继续刷题（第 ${saved.idx + 1}/${total} 题，已对 ${saved.correct} 题）`;
      btnResume.onclick = () => {
        quizFrom = 'practice';
        const resumed = saved.qids.map((id) => Store.getQuestion(id)).filter(Boolean);
        startPractice(resumed, null, saved.key, saved.idx, saved.correct);
      };
    }
  }

  function offerResume(saved, onContinue) {
    const total = saved.qids.length;
    const m = modal(`
      <h3>继续上次练习</h3>
      <div class="muted" style="margin-bottom:6px">上次刷到 ${Math.min(saved.idx + 1, total)} / ${total} 题，已对 ${saved.correct} 题。</div>
      <button class="btn block" id="rContinue" style="margin-top:12px">继续上次</button>
      <button class="btn ghost block" id="rRestart" style="margin-top:8px">重新开始</button>
    `);
    $('#rContinue', m).onclick = () => { closeModal(m); onContinue(); };
    $('#rRestart', m).onclick = () => { Store.clearProgress(); closeModal(m); };
  }

  // ================= 全屏刷题/背题页面 =================
  let quizPage = null;   // 当前全屏页面 DOM
  let quizMode = 'practice';
  let quizFrom = 'practice'; // 进入全屏前的页面：'practice' | 'wrong'

  function startPractice(list, area, sessionKey, startIdx, startCorrect) {
    quizFrom = 'practice';
    const ids = list.map((q) => (typeof q === 'object' ? q.id : q));
    state.practice = {
      list: ids,
      idx: startIdx || 0,
      correct: startCorrect || 0,
      total: ids.length,
      graded: false,
      sessionKey: sessionKey || null,
    };
    quizMode = 'practice';
    openQuizPage();
    savePracticeProgress();
  }
  function savePracticeProgress() {
    const p = state.practice;
    if (!p || !p.sessionKey) return;
    Store.saveProgress({ key: p.sessionKey, qids: p.list, idx: p.idx, correct: p.correct, graded: false });
  }

  /** 打开/刷新全屏刷题页面 */
  function openQuizPage() {
    closeQuizPage();
    document.body.classList.add('quiz-active');
    quizPage = el('<div class="quiz-page"></div>');
    document.body.appendChild(quizPage);
    renderQuizHeader();
    renderQuizBody();
    renderQuizFooter();
  }

  function closeQuizPage() {
    if (quizPage && quizPage.parentNode) quizPage.parentNode.removeChild(quizPage);
    quizPage = null;
    document.body.classList.remove('quiz-active');
  }

  /* ---- 顶部栏 ---- */
  function renderQuizHeader() {
    quizPage.appendChild(el(`
      <div class="qz-header">
        <button class="qz-back" id="qzBack">‹</button>
        <div class="qz-tabs"><button class="qz-tab active">答题</button></div>
        <button class="qz-settings" id="qzSett">⚙</button>
      </div>
    `));
    $('#qzBack', quizPage).onclick = () => {
      if (confirm('确认退出当前练习？进度已保存。')) {
        closeQuizPage();
        go(quizFrom);
      }
    };
    $('#qzSett', quizPage).onclick = () => {
      // 简单设置浮层：字体 / 自动错题
      const m = modal(`
        <h3>刷题设置</h3>
        <label class="row" style="justify-content:space-between;margin-top:8px">
          <span>答错自动加入错题本</span>
          <input type="checkbox" id="qzAutoW" ${Store.getSetting('autoWrong','0')==='1'?'checked':''}>
        </label>
        <label class="row" style="justify-content:space-between;margin-top:8px">
          <span>字体大小</span>
          <span>${font}px</span>
        </label>
        <button class="btn block" style="margin-top:12px" id="qzSetClose">关闭</button>
      `);
      $('#qzSetClose', m).onclick = () => closeModal(m);
      $('#qzAutoW', m).onchange = (e) => Store.setSetting('autoWrong', e.target.checked ? '1' : '0');
    };
  }

  /* ---- 底部统计栏 ---- */
  function renderQuizFooter() {
    const p = state.practice || {};
    const correct = p.correct || 0;
    const total = p.total || 0;
    const done = Math.min((p.idx || 0), total);
    const wrong = done - correct;
    quizPage.appendChild(el(`
      <div class="qz-footer">
        <button class="qz-fbtn yellow" id="qzFavBtn">收藏本题</button>
        <div class="qz-stat"><span class="qz-stat-num ok">${correct}</span><span class="qz-stat-lbl">答对</span></div>
        <div class="qz-stat"><span class="qz-stat-num err">${wrong}</span><span class="qz-stat-lbl">答错</span></div>
        <div class="qz-stat"><span class="qz-stat-num">${done}/${total}</span><span class="qz-stat-lbl">已做题</span></div>
      </div>
    `));
    $('#qzFavBtn', quizPage).onclick = () => {
      const p = state.practice;
      const qid = p.list[p.idx];
      const q = Store.getQuestion(qid);
      if (!q) return;
      const added = Store.addWrong(q.id);
      $('#qzFavBtn', quizPage).textContent = added ? '✓ 已收藏' : '已收藏';
      setTimeout(() => { $('#qzFavBtn', quizPage).textContent = '收藏本题'; }, 1200);
    };
  }

  /* ---- 主体内容区 ---- */
  function renderQuizBody() {
    // 关键修复：先移除旧的内容区，避免多题堆叠
    const oldBody = $('.qz-body', quizPage);
    if (oldBody) oldBody.remove();

    const body = el('<div class="qz-body"></div>');
    quizPage.appendChild(body);

    renderPracticeQuestion(body);
  }

  /* ========== 答题模式渲染 ========== */
  function renderPracticeQuestion(body) {
    const p = state.practice;
    savePracticeProgress();

    // 完成
    if (p.idx >= p.list.length) { renderQuizSummary(body); return; }

    const q = Store.getQuestion(p.list[p.idx]);
    if (!q) { p.idx++; renderPracticeQuestion(body); return; }
    p.graded = false;

    body.innerHTML = '';

    // 题目卡片
    const card = el('<div class="qz-qcard"></div>');
    body.appendChild(card);

    // 题头：题型标签 + 读题按钮
    const qhead = el('<div class="qz-qhead"></div>');
    card.appendChild(qhead);
    qhead.appendChild(el(`<span class="qz-type-tag ${q.type}">${TYPES[q.type]}</span>`));
    qhead.appendChild(el(`<button class="qz-read-btn" id="qzReadAloud">▶ 读题</button>`));

    // 题干
    card.appendChild(el(`<div class="qz-stem">${esc(q.stem)}</div>`));

    // 选项区域
    const optsWrap = el('<div class="qz-opts"></div>');
    card.appendChild(optsWrap);

    // 判分后答案展示区
    const answerBox = el('<div id="qzAnswerBox"></div>');
    card.appendChild(answerBox);

    // 确认按钮
    const confirmWrap = el('<div class="qz-confirm-wrap"></div>');
    card.appendChild(confirmWrap);

    if (q.type === 'short') {
      // 简答题：显示答案按钮
      confirmWrap.appendChild(el(`<button class="qz-show-ans-btn" id="qzShowAns">显示答案</button>`));
      $('#qzShowAns', card).onclick = () => {
        p.graded = true;
        showPracticeAnswer(card, q, null);
        updateQuizFooter();
      };
    } else {
      const keys = ['A', 'B', 'C', 'D'].filter((k) => q['opt' + k]);
      const sel = {}; // 多选暂存

      keys.forEach((k) => {
        const optEl = el(`
          <div class="qz-opt" data-k="${k}">
            <span class="qz-k">${k}</span>
            <span class="qz-txt">${esc(q['opt' + k]) || '（图片选项）'}</span>
          </div>
        `);
        optsWrap.appendChild(optEl);

        optEl.onclick = () => {
          if (p.graded) return;
          if (q.type === 'single') {
            // 单选：点即提交
            $$('.qz-opt', optsWrap).forEach((o) => o.classList.remove('selected'));
            optEl.classList.add('selected');
            p.graded = true;
            const ok = k === (q.answer || '').toUpperCase();
            if (ok) p.correct++;
            showPracticeAnswer(card, q, ok, k);
            updateQuizFooter();
          } else {
            // 多选：切换选中状态
            sel[k] = !sel[k];
            optEl.classList.toggle('checked', sel[k]);
          }
        };
      });

      // 多选确认按钮
      if (q.type === 'multiple') {
        confirmWrap.appendChild(el(`<button class="qz-confirm primary" id="qzConfirm">确定</button>`));
        $('#qzConfirm', card).onclick = () => {
          if (p.graded) return;
          const chosen = keys.filter((k) => sel[k]).sort();
          if (!chosen.length) return;
          const ans = (q.answer || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).sort();
          p.graded = true;
          const ok = chosen.length === ans.length && chosen.every((k, i) => k === ans[i]);
          if (ok) p.correct++;
          showPracticeAnswer(card, q, ok, chosen.join(''));
          updateQuizFooter();
        };
      }
    }

    // 读题功能（TTS）
    $('#qzReadAloud', card).onclick = () => {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(q.stem);
        u.lang = 'zh-CN'; u.rate = 0.9;
        speechSynthesis.speak(u);
      }
    };

    // 更新底部统计
    updateQuizFooter();
  }

  /** 显示判分结果（答题模式） */
  function showPracticeAnswer(card, q, ok, chosenKey) {
    const box = $('#qzAnswerBox', card);
    box.innerHTML = '';

    // 错题自动收录
    if (ok === false && Store.getSetting('autoWrong', '0') === '1') {
      Store.addWrong(q.id);
    }
    savePracticeProgress();

    // 结果标签
    let resultTag = '';
    if (ok === true) resultTag = '<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:#e8f5e9;color:#2e7d32;font-size:12px;font-weight:700">✅ 回答正确</span>';
    else if (ok === false) resultTag = '<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:#ffebee;color:#c62828;font-size:12px;font-weight:700">❌ 回答错误</span>';
    else resultTag = '<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:#fff3e0;color:#e65100;font-size:12px;font-weight:700">简答题（不判分）</span>';

    // 答案框
    box.appendChild(el(`
      <div class="qz-answer-box">
        <div class="row" style="align-items:center;margin-bottom:8px">
          ${resultTag}
          <span class="spacer"></span>
        </div>
        <div class="qz-answer-label">✅ 正确答案</div>
        <div class="qz-answer-text">${esc(q.answer)}</div>
      </div>
    `));

    // 高亮选项对错
    if (chosenKey) {
      $$('.qz-opt', card).forEach((o) => {
        const k = o.dataset.k;
        if (!k) return;
        const ans = (q.answer || '').split(',').map((s) => s.trim().toUpperCase());
        o.classList.remove('selected','checked');
        if (ans.indexOf(k) !== -1) o.classList.add('correct');
        else if (chosenKey.indexOf(k) !== -1) o.classList.add('wrong');
      });
    }

    // 解析
    if (q.explanation) {
      box.appendChild(el(`
        <div class="qz-explain">
          <span class="qz-explain-label">解析：</span>${esc(q.explanation)}
        </div>
      `));
    }

    // 隐藏确认按钮，显示下一题
    const cw = $('.qz-confirm-wrap', card);
    if (cw) {
      cw.innerHTML = '';
      const nextBtn = el(`<button class="qz-confirm primary" id="qzNextQ">下一题 →</button>`);
      cw.appendChild(nextBtn);
      nextBtn.onclick = () => { state.practice.idx++; renderQuizBody(); };
    }
  }

  /** 更新底部统计数字 */
  function updateQuizFooter() {
    if (!quizPage) return;
    const p = state.practice || {};
    const correct = p.correct || 0;
    const done = Math.min((p.idx || 0) + (p.graded ? 1 : 0), p.total || 0);
    const wrong = done - correct;
    const stats = $$('.qz-stat', quizPage);
    if (stats.length >= 3) {
      stats[0].querySelector('.qz-stat-num').textContent = correct;
      stats[1].querySelector('.qz-stat-num').textContent = wrong;
      stats[2].querySelector('.qz-stat-num').textContent = `${done}/${p.total || 0}`;
    }
  }

  /** 完成总结 */
  function renderQuizSummary(body) {
    const p = state.practice;
    Store.clearProgress();
    const rate = p.total ? Math.round((p.correct / p.total) * 100) : 0;
    body.innerHTML = `
      <div class="qz-summary">
        <h2>🎉 本次完成</h2>
        <div class="qz-summary-rate">${rate}<small style="font-size:20px;color:var(--muted)">%</small></div>
        <div class="qz-summary-info">共 ${p.total} 题 · 正确 ${p.correct} 题 · 错误 ${p.total - p.correct} 题</div>
        <button class="qz-confirm primary" id="qzAgain" style="max-width:260px;margin:0 auto;display:block">再刷一次</button>
        <button class="qz-nav-btns" style="max-width:260px;margin:14px auto 0"><button id="qzBackHome">返回首页</button></button>
      </div>
    `;
    $('#qzAgain', body).onclick = () => {
      const list = p.list.slice();
      state.practice = { list: list, idx: 0, correct: 0, total: list.length, graded: false, sessionKey: null };
      quizMode = 'practice';
      openQuizPage();
    };
    $('#qzBackHome', body).onclick = () => { closeQuizPage(); go('practice'); };
  }

  // ================= 错题本 =================
  function renderWrong(v) {
    const allItems = Store.getWrong();

    // 章节筛选器
    const tree = Store.getChapters().filter((c) => !c.parentId);
    const chapOpts = `<option value="">（全部错题）</option>` +
      tree.map((ch) => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('');

    v.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:center">
          <label style="font-size:var(--fs);margin-right:4px">章</label>
          <select id="wFChap" style="flex:2;font-size:var(--fs)">${chapOpts}</select>
          <label style="font-size:var(--fs);margin:0 4px">节</label>
          <select id="wFSec" style="flex:2;font-size:var(--fs)" disabled><option value="">（全部节）</option></select>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn sm" id="wSeq">顺序刷错题</button>
          <button class="btn sm" id="wRand">随机刷错题</button>
          <button class="btn sm ghost" id="wResume" style="display:none">📚 继续刷错题</button>
          <span class="spacer"></span>
          <span class="muted small" id="wCount">共 ${allItems.length} 道</span>
        </div>
      </div>
      <div id="wrongList"></div>
    `;

    // 章联动节
    const updateWSecs = () => {
      const chId = $('#wFChap').value;
      const secSel = $('#wFSec');
      if (!chId) {
        secSel.innerHTML = '<option value="">（全部节）</option>';
        secSel.disabled = true;
      } else {
        const secs = Store.getSections(chId);
        secSel.innerHTML = '<option value="">（全部节）</option>' +
          secs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
        secSel.disabled = false;
      }
      refreshWrongList();
    };
    $('#wFChap').onchange = updateWSecs;
    $('#wFSec').onchange = refreshWrongList;

    // 初始化节下拉
    updateWSecs();

    // 刷新错题列表（按章/节筛选）
    function refreshWrongList() {
      const chId = $('#wFChap').value;
      const secId = $('#wFSec').value;

      // 筛选错题：按章节过滤
      let items = allItems;
      if (secId) {
        // 选了具体节 → 只显示该节下的错题
        items = items.filter((it) => it.question.chapterId === secId);
      } else if (chId) {
        // 选了章没选节 → 显示该章+所有子节的错题
        const secs = Store.getSections(chId);
        const allIds = [chId].concat(secs.map((s) => s.id));
        items = items.filter((it) => allIds.indexOf(it.question.chapterId) !== -1);
      }

      $('#wCount').textContent = `共 ${items.length} 道`;
      const box = $('#wrongList');
      box.innerHTML = '';

      if (!items.length) { box.appendChild(el(`<div class="center-msg">该范围下暂无错题</div>`)); return; }

      items.forEach((it) => {
        const q = it.question;
        // 选择题显示选项
        let optHtml = '';
        if (q.type !== 'short') {
          optHtml = `<div class="wrong-q-opts">${['A','B','C','D'].filter(k => q['opt'+k]).map(k =>
            `<span class="wrong-q-opt"><b>${k}.</b> ${esc(q['opt'+k])}</span>`
          ).join('')}</div>`;
        }
        box.appendChild(el(`
          <div class="card">
            <div class="row"><span class="tag ${q.type}">${TYPES[q.type]}</span>
              <span class="muted small">${esc(Store.chapterName(q.chapterId))}</span><span class="spacer"></span>
              <button class="btn sm ghost" data-act="redo" data-id="${q.id}">重做</button>
              <button class="btn sm danger" data-act="rm" data-wid="${it.wrong.id}">移除</button></div>
            <div style="margin:8px 0; white-space:pre-wrap">${esc(q.stem).slice(0, 120)}${q.stem.length > 120 ? '…' : ''}</div>
            ${optHtml}
          </div>
        `));
      });

      // 绑定事件
      $$('#wrongList [data-act]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.act === 'rm') { Store.removeWrong(b.dataset.wid); go('wrong'); }
          else if (b.dataset.act === 'redo') {
            const q = Store.getQuestion(b.dataset.id);
            startPractice([q], null, null, 0, 0);
          }
        };
      });
    }

    // 刷错题按钮
    const startWrong = (mode) => {
      // 根据当前筛选范围获取错题
      const chId = $('#wFChap').value;
      const secId = $('#wFSec').value;
      let items = allItems;
      if (secId) {
        items = items.filter((it) => it.question.chapterId === secId);
      } else if (chId) {
        const secs = Store.getSections(chId);
        const allIds = [chId].concat(secs.map((s) => s.id));
        items = items.filter((it) => allIds.indexOf(it.question.chapterId) !== -1);
      }
      if (!items.length) { alert('该范围内没有错题'); return; }
      const list = items.map((i) => i.question);
      if (mode === 'random') list.sort(() => Math.random() - 0.5);
      startPractice(list, null, Store.makeSessionKey('wrong', { mode: mode, ch: chId || '', sec: secId || '' }), 0, 0);
    };
    $('#wSeq').onclick = () => startWrong('sequence');
    $('#wRand').onclick = () => startWrong('random');

    // 继续刷错题按钮（有未完成的错题练习会话时显示）
    const saved = Store.getProgress();
    const btnResume = $('#wResume');
    if (Store.getSetting('resume', '1') === '1' && saved && saved.key && saved.key.indexOf('wrong|') === 0 && saved.idx < saved.qids.length) {
      btnResume.style.display = '';
      const total = saved.qids.length;
      btnResume.textContent = `📚 继续刷错题（第 ${saved.idx + 1}/${total} 题，已对 ${saved.correct} 题）`;
      btnResume.onclick = () => {
        const resumed = saved.qids.map((id) => Store.getQuestion(id)).filter(Boolean);
        startPractice(resumed, null, saved.key, saved.idx, saved.correct);
      };
    }
  }

  // ================= 设置 =================
  function openExportScope() {
    const chaps = Store.getChapters().filter((c) => !c.parentId);
    const chapOpts = `<option value="">（全部章节）</option>` +
      chaps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    const m = modal(`
      <h3>导出题库</h3>
      <label class="fld">导出范围</label>
      <select id="exScope" style="font-size:var(--fs)">
        <option value="all">全部数据</option>
        <option value="chap">仅某一章（含其下所有节）</option>
        <option value="sec">仅某一章的某一节</option>
      </select>
      <div id="exChapWrap" style="margin-top:8px;display:none">
        <label class="fld">章</label>
        <select id="exChap" style="font-size:var(--fs)">${chapOpts}</select>
      </div>
      <div id="exSecWrap" style="margin-top:8px;display:none">
        <label class="fld">节</label>
        <select id="exSec" style="font-size:var(--fs)"></select>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="exDo">确定导出</button>
        <button class="btn ghost" id="exCancel">取消</button>
      </div>
    `);
    const scopeSel = $('#exScope', m);
    const chapWrap = $('#exChapWrap', m), secWrap = $('#exSecWrap', m);
    const chapSel = $('#exChap', m), secSel = $('#exSec', m);
    const updateExSecs = () => {
      const secs = Store.getSections(chapSel.value);
      secSel.innerHTML = secs.length
        ? secs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
        : `<option value="">（该章暂无节）</option>`;
    };
    scopeSel.onchange = () => {
      const v = scopeSel.value;
      chapWrap.style.display = (v === 'chap' || v === 'sec') ? 'block' : 'none';
      secWrap.style.display = v === 'sec' ? 'block' : 'none';
      if (v !== 'all') updateExSecs();
    };
    chapSel.onchange = updateExSecs;
    $('#exCancel', m).onclick = () => closeModal(m);
    $('#exDo', m).onclick = () => {
      const scope = scopeSel.value;
      let data;
      if (scope === 'all') data = Store.exportJSON();
      else if (scope === 'chap') { if (!chapSel.value) { alert('请选择章'); return; } data = Store.exportScoped(chapSel.value, null); }
      else { if (!secSel.value) { alert('请选择节'); return; } data = Store.exportScoped(null, secSel.value); }
      closeModal(m);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quiz_export.json';
      a.click();
    };
  }

  function openImport() {
    const ta = el(`<textarea rows="6" placeholder="粘贴之前导出的 JSON"></textarea>`);
    const fileInput = el(`<input type="file" id="impFile" accept=".json,application/json,application/octet-stream,text/plain" style="display:none">`);
    // 章节选择器
    const tree = Store.getChapters().filter((c) => !c.parentId);
    const chapOpts = tree.map((ch) => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('');
    const m = modal(`
      <h3>导入题库</h3>
      <div class="muted small">默认合并：按章/节名称归位；题目按唯一标识去重（兼容电脑端导出格式，不丢复习重复题），可反复导入不翻倍。</div>
      <label class="fld" style="margin-top:10px">导入到（可选，不选则按原数据中的章节名自动归位）</label>
      <select id="impTargetChap" style="font-size:var(--fs)">
        <option value="">（按原章节名自动归位）</option>${chapOpts}
      </select>
      <select id="impTargetSec" style="font-size:var(--fs);margin-top:6px" disabled><option value="">（未分类（自动新建））</option></select>
      <div class="row" style="gap:14px;margin-top:10px">
        <label class="row" style="gap:5px;cursor:pointer"><input type="radio" name="impMode" value="text" checked> 文字导入</label>
        <label class="row" style="gap:5px;cursor:pointer"><input type="radio" name="impMode" value="file"> 文件导入</label>
      </div>
      <label class="row" style="gap:6px;margin-top:8px"><input type="checkbox" id="impReplace"> 覆盖现有数据（清空后导入）</label>
      <div id="impWrap" style="margin-top:8px"></div>
      <button class="btn block" id="impDo" style="margin-top:10px">确认导入</button>
      <button class="btn ghost block" id="impCancel" style="margin-top:8px">取消</button>
    `);
    const wrap = $('#impWrap', m);
    wrap.appendChild(ta);
    wrap.appendChild(fileInput);
    wrap.insertAdjacentHTML('beforeend',
      `<button class="btn block" id="impPickFile" style="display:none;margin-top:6px">📂 选择文件（微信 / QQ / 下载）</button>
       <div id="impFileName" class="muted small" style="display:none;margin-top:6px"></div>`);
    let fileText = null;

    // 目标章节联动
    const impChapSel = $('#impTargetChap', m), impSecSel = $('#impTargetSec', m);
    impChapSel.onchange = () => {
      if (!impChapSel.value) { impSecSel.disabled = true; impSecSel.innerHTML = '<option value="">（未分类（自动新建））</option>'; return; }
      const secs = Store.getSections(impChapSel.value);
      impSecSel.innerHTML = '<option value="">（未分类（自动新建））</option>' +
        secs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      impSecSel.disabled = false;
    };

    const syncMode = () => {
      const isFile = $('input[name=impMode]:checked', m).value === 'file';
      ta.style.display = isFile ? 'none' : '';
      $('#impPickFile', m).style.display = isFile ? '' : 'none';
      $('#impFileName', m).style.display = isFile ? '' : 'none';
    };
    m.querySelectorAll('input[name=impMode]').forEach(r => r.onchange = syncMode);

    $('#impPickFile', m).onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      $('#impFileName', m).textContent = '已选：' + f.name + '（' + (f.size / 1024).toFixed(1) + ' KB）';
      const reader = new FileReader();
      reader.onload = () => { fileText = reader.result; };
      reader.onerror = () => { fileText = null; $('#impFileName', m).textContent = '读取失败，请重试'; };
      reader.readAsText(f, 'utf-8');
    };

    $('#impCancel', m).onclick = () => closeModal(m);
    $('#impDo', m).onclick = () => {
      try {
        const isFile = $('input[name=impMode]:checked', m).value === 'file';
        const content = isFile ? (fileText || '') : ta.value;
        if (!content || !content.trim()) { alert(isFile ? '请先选择文件' : '请先粘贴 JSON 文本'); return; }
        // 检查是否指定了目标章节
        const targetChapId = impChapSel.value;
        let targetSecId = impSecSel.value;
        if (!targetSecId && targetChapId) {
          // 选了章但没选节：自动建一个「未分类」的节归位
          const sec = Store.getOrCreateChapter('未分类', targetChapId);
          targetSecId = sec ? sec.id : targetChapId;
        }
        const r = Store.importJSON(content, $('#impReplace', m).checked, targetSecId || targetChapId || null);
        closeModal(m);
        alert('导入成功' + (r && r.added != null ? `，新增 ${r.added} 道题` : ''));
        go('settings');
      } catch (e) { alert('导入失败：' + e.message); }
    };
  }

  function renderSettings(v) {
    const fs0 = Store.getFont();
    const resume = Store.getSetting('resume', '1') === '1';
    const autoWrong = Store.getSetting('autoWrong', '0') === '1';
    const defMode = Store.getSetting('defaultMode', 'sequence');
    const startPage = Store.getSetting('startPage', 'entry');
    const pages = [['entry', '录入'], ['practice', '刷题'], ['bank', '题库'], ['wrong', '错题'], ['stats', '统计'], ['settings', '设置']];
    v.innerHTML = `
      <div class="card">
        <b>显示</b>
        <div class="row" style="margin-top:10px;align-items:center">
          <label style="font-size:var(--fs)">字体大小</label>
          <span class="spacer"></span>
          <button class="fbtn" id="sFontMinus">A−</button>
          <input type="text" id="sFont" value="${fs0}" style="width:54px;text-align:center">
          <button class="fbtn" id="sFontPlus">A+</button>
        </div>
        <div class="muted small">也可用顶部的 A− / A+ 调整</div>
      </div>
      <div class="card">
        <b>刷题</b>
        <label class="row" style="justify-content:space-between;margin-top:8px"><span>断点续刷（刷一半下次可继续）</span><input type="checkbox" id="sResume" ${resume ? 'checked' : ''}></label>
        <label class="row" style="justify-content:space-between;margin-top:8px"><span>答错自动加入错题本</span><input type="checkbox" id="sAutoWrong" ${autoWrong ? 'checked' : ''}></label>
        <label class="fld">默认刷题模式</label>
        <select id="sMode" style="font-size:var(--fs)">
          <option value="sequence" ${defMode === 'sequence' ? 'selected' : ''}>顺序</option>
          <option value="random" ${defMode === 'random' ? 'selected' : ''}>随机</option>
        </select>
      </div>
      <div class="card">
        <b>启动</b>
        <label class="fld">打开应用时默认进入</label>
        <select id="sStart" style="font-size:var(--fs)">
          ${pages.map((p) => `<option value="${p[0]}" ${startPage === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <b>数据</b>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" id="sExport">导出题库</button>
          <button class="btn sm" id="sImport">导入题库</button>
        </div>
        <div class="muted small" style="margin-top:8px">导出/导入为 JSON：可备份，也可与电脑版互传（按章/节名称自动归位）。</div>
      </div>
      <div class="card">
        <b>关于</b>
        <div class="muted small" style="margin-top:8px">刷题软件 · 安卓版 v1.1<br>纯本地存储，数据不上传。</div>
        <div class="row" style="margin-top:10px"><button class="btn sm danger" id="sClear">清空全部数据</button></div>
      </div>
    `;
    const setF = (val) => {
      let f = parseInt(val, 10);
      if (isNaN(f)) f = fs0;
      f = Math.max(10, Math.min(28, f));
      font = f; applyFont(); $('#sFont').value = f;
    };
    $('#sFontMinus').onclick = () => setF(font - 1);
    $('#sFontPlus').onclick = () => setF(font + 1);
    $('#sFont').addEventListener('input', () => { const n = parseInt($('#sFont').value, 10); if (!isNaN(n)) { font = n; applyFont(); } });
    $('#sFont').addEventListener('blur', () => setF($('#sFont').value));
    $('#sResume').onchange = (e) => { Store.setSetting('resume', e.target.checked ? '1' : '0'); if (!e.target.checked) Store.clearProgress(); };
    $('#sAutoWrong').onchange = (e) => Store.setSetting('autoWrong', e.target.checked ? '1' : '0');
    $('#sMode').onchange = (e) => Store.setSetting('defaultMode', e.target.value);
    $('#sStart').onchange = (e) => Store.setSetting('startPage', e.target.value);
    $('#sExport').onclick = openExportScope;
    $('#sImport').onclick = openImport;
    $('#sClear').onclick = () => {
      if (confirm('确定清空全部数据？此操作不可恢复！')) {
        Store.clearProgress();
        ['questions', 'chapters', 'wrong', 'log'].forEach((k) => localStorage.removeItem(Store.LS[k]));
        alert('已清空，应用将重启');
        location.reload();
      }
    };
  }

  // ---------------- 初始化 ----------------
  function init() {
    applyFont();
    $$('#nav .tab').forEach((t) => (t.onclick = () => go(t.dataset.page)));
    $('#fontPlus').onclick = () => { font = Math.min(28, font + 1); applyFont(); };
    $('#fontMinus').onclick = () => { font = Math.max(10, font - 1); applyFont(); };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const start = Store.getSetting('startPage', 'entry');
    go(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
