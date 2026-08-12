// ===== STATE =====
// データ構造: sessions[menuId][sessionId] = { date:'YYYY-MM-DD', sets:[{w,r}] }
const S = {
  menus:    JSON.parse(localStorage.getItem('gl_menus')    || '[]'),
  sessions: JSON.parse(localStorage.getItem('gl_sessions') || '{}'),
  menuSets: JSON.parse(localStorage.getItem('gl_menusets') || '[]'),
  menu: null, sessionId: null, editingSetIdx: null, showArchived: false,
  fromCalendar: false, // カレンダーから遷移したかどうか
};

const persist = () => {
  localStorage.setItem('gl_menus',    JSON.stringify(S.menus));
  localStorage.setItem('gl_sessions', JSON.stringify(S.sessions));
  localStorage.setItem('gl_menusets', JSON.stringify(S.menuSets));
};

// 旧形式(gl_history)からの自動マイグレーション
(function migrate() {
  const old = localStorage.getItem('gl_history');
  if (!old) return;
  try {
    const hist = JSON.parse(old);
    for (const [menuId, dateMap] of Object.entries(hist)) {
      if (!S.sessions[menuId]) S.sessions[menuId] = {};
      for (const [date, sets] of Object.entries(dateMap)) {
        const sid = 'sess_migrated_' + menuId.slice(-6) + '_' + date;
        if (!S.sessions[menuId][sid]) S.sessions[menuId][sid] = { date, time:'00:00', sets };
      }
    }
    localStorage.removeItem('gl_history');
    persist();
  } catch(e) {}
})();

// B-05: 既存セッションにtimeフィールドがなければ'00:00'でマイグレーション
(function migrateTime() {
  let changed = false;
  for (const sessMap of Object.values(S.sessions)) {
    for (const sess of Object.values(sessMap)) {
      if (sess.time === undefined) { sess.time = '00:00'; changed = true; }
    }
  }
  if (changed) persist();
})();

// ===== UTILS =====
const orm = (w,r) => r===1 ? w : +(w*(1+r/40)).toFixed(1);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const fmtDate = d => {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${y}年${parseInt(m)}月${parseInt(day)}日`;
};
const toast = msg => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
};
const tagClass = t => ({マシン:'tag-machine',フリーウェイト:'tag-free',自重運動:'tag-body',有酸素運動:'tag-cardio'}[t]||'');
const dotColor = c => ({胸:'#f87171',背中:'#fb923c',肩:'#facc15',足:'#4ade80',腕:'#60a5fa',有酸素運動:'#c084fc'}[c]||'#9ca3af');

const isCardioMenu = m => m && m.category === '有酸素運動';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function menuStats(menuId) {
  const menu = S.menus.find(m=>m.id===menuId);
  if (isCardioMenu(menu)) {
    // 有酸素：最大距離・最大消費カロリー・最終日
    let maxDist=0, maxCal=0, lastDate=null;
    for (const sess of Object.values(S.sessions[menuId]||{})) {
      if (sess.cardio) {
        if((sess.cardio.dist||0)>maxDist) maxDist=sess.cardio.dist||0;
        if((sess.cardio.cal||0)>maxCal)   maxCal=sess.cardio.cal||0;
      }
      if(!lastDate||sess.date>lastDate) lastDate=sess.date;
    }
    return {maxDist, maxCal, lastDate, isCardio:true};
  }
  let maxOrm=0, maxVol=0, lastDate=null;
  for (const sess of Object.values(S.sessions[menuId]||{})) {
    let vol=0, mxO=0;
    (sess.sets||[]).forEach(s=>{ const o=orm(s.w,s.r); if(o>mxO) mxO=o; vol+=s.w*s.r; });
    if(mxO>maxOrm) maxOrm=mxO;
    if(vol>maxVol) maxVol=+vol.toFixed(1);
    if(!lastDate||sess.date>lastDate) lastDate=sess.date;
  }
  return {maxOrm, maxVol, lastDate, isCardio:false};
}

function onNameInput(el) {
  if([...el.value].length>30) el.value=[...el.value].slice(0,30).join('');
}

// ===== SIDEBAR =====
const toggleSidebar = () => {
  const open = !document.getElementById('sidebar').classList.contains('show');
  document.getElementById('sidebar').classList.toggle('show', open);
  document.getElementById('overlay').classList.toggle('show', open);
  document.getElementById('hamburger').classList.toggle('open', open);
};
const closeSidebar = () => {
  ['sidebar','overlay'].forEach(id=>document.getElementById(id).classList.remove('show'));
  document.getElementById('hamburger').classList.remove('open');
};

// ===== NAVIGATION =====
const TITLES = {'add-menu':'メニューの追加','menu-list':'メニュー一覧','menu-detail':'メニュー詳細','menuset-list':'メニューセット','set-edit':'セット記録','csv':'CSV出力 / 入力','analysis':'メニュー分析','analysis-detail':'分析詳細','rm':'RM換算表'};
function go(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.getElementById('page-title').textContent = TITLES[page]||page;
  document.querySelectorAll('.sb-item[data-page]').forEach(i=>i.classList.toggle('active',i.dataset.page===page));
  closeSidebar();
  if(page==='menu-list')    renderList();
  if(page==='menu-detail')  renderDetail();
  if(page==='menuset-list') renderMenuSetList();
  if(page==='set-edit')     renderSetEdit();
  if(page==='analysis')     renderAnalysis();
  if(page==='analysis-detail') renderAnalysisDetail();
  if(page==='rm')           initRMPage();
}

// ===== ADD MENU =====
let selTypeVal = null;
function onCatChange() {
  const cat = document.getElementById('sel-cat').value;
  document.getElementById('type-section').style.display = cat==='有酸素運動'?'none':'block';
  selTypeVal = cat==='有酸素運動'?'有酸素運動':null;
  if(cat!=='有酸素運動') document.querySelectorAll('.type-chip').forEach(c=>c.classList.remove('sel'));
  validateAdd();
}
function selType(el) {
  document.querySelectorAll('.type-chip').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel'); selTypeVal=el.dataset.type; validateAdd();
}
function validateAdd() {
  const cat=document.getElementById('sel-cat').value;
  const name=document.getElementById('inp-name').value.trim();
  document.getElementById('btn-add').disabled=!(cat&&name&&selTypeVal);
}
function addMenu() {
  const cat=document.getElementById('sel-cat').value;
  const name=document.getElementById('inp-name').value.trim();
  if(!cat||!name||!selTypeVal) return;
  if(S.menus.find(m=>m.name===name&&m.category===cat&&!m.archived)){toast('同じ部位に同名のメニューがあります');return;}
  S.menus.push({id:'menu_'+Date.now(),name,category:cat,type:selTypeVal,archived:false});
  persist(); toast(`「${name}」を追加しました`);
  document.getElementById('sel-cat').value='';
  document.getElementById('inp-name').value='';
  document.getElementById('type-section').style.display='block';
  document.querySelectorAll('.type-chip').forEach(c=>c.classList.remove('sel'));
  selTypeVal=null; document.getElementById('btn-add').disabled=true;
}

// ===== MENU LIST =====
const CATS=['胸','背中','肩','足','腕','有酸素運動'];
function toggleShowArchived() {
  S.showArchived=!S.showArchived;
  const btn=document.getElementById('toggle-archive-btn');
  btn.classList.toggle('on',S.showArchived);
  // テキストノード更新
  const nodes=[...btn.childNodes].filter(n=>n.nodeType===3);
  if(nodes.length) nodes[nodes.length-1].textContent=S.showArchived?' アーカイブを非表示':' アーカイブを表示';
  renderList();
}
function renderList() {
  const el=document.getElementById('list-body');
  const visible=S.menus.filter(m=>S.showArchived?true:!m.archived);
  if(!visible.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🏋️</div><div class="empty-title">まだメニューがありません</div><div class="empty-desc">「メニューの追加」からトレーニングメニューを登録してください</div></div>`;
    return;
  }
  let html='';
  for(const cat of CATS){
    const items=visible.filter(m=>m.category===cat);
    if(!items.length) continue;
    html+=`<div class="group-block"><div class="group-head"><div class="group-dot" style="background:${dotColor(cat)}"></div><div class="group-name">${cat}</div><div class="group-cnt">${items.length}件</div></div><div class="menu-list">`;
    for(const m of items){
      const st=menuStats(m.id);
      html+=`<div class="menu-row${m.archived?' archived':''}" onclick="openDetail('${m.id}')">
        <div class="menu-row-left">
          <div class="menu-row-name">${esc(m.name)}</div>
          <div class="menu-row-tags">
            <span class="tag ${tagClass(m.type)}">${esc(m.type)}</span>
            ${m.archived?'<span class="tag tag-archived">アーカイブ済</span>':''}
            ${st.lastDate?`<span style="font-size:11px;color:var(--text3)">最終: ${fmtDate(st.lastDate)}</span>`:''}
          </div>
        </div>
        <div class="menu-row-right">
          ${isCardioMenu(m)
            ? ''
            : st.maxOrm>0
              ? `<div class="row-1rm">${st.maxOrm}<span class="row-1rm-unit"> kg</span></div><div class="row-1rm-label">最大1RM</div>`
              : '<div style="font-size:12px;color:var(--text3)">未記録</div>'
          }
        </div>
        <span class="row-chevron">›</span>
      </div>`;
    }
    html+=`</div></div>`;
  }
  el.innerHTML=html;
}
function openDetail(id){S.menu=S.menus.find(m=>m.id===id);go('menu-detail');}

// ===== MENU DETAIL =====
function renderDetail(){
  if(!S.menu) return;
  const m=S.menu;
  const sessMap=S.sessions[m.id]||{};
  const st=menuStats(m.id);
  const sessList=Object.entries(sessMap)
    .map(([id,s])=>({id,...s}))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));

  let rows='';
  if(isCardioMenu(m)){
    for(const sess of sessList){
      const c=sess.cardio||{};
      const timeLabel=sess.time&&sess.time!=='00:00'?`<div style="font-size:10px;color:var(--text3)">${sess.time}</div>`:'';
      rows+=`<tr class="clickable" onclick="openSetEdit('${sess.id}')">
        <td class="td-date">${fmtDate(sess.date)}${timeLabel}</td>
        <td>${c.time!=null?c.time+' 分':'—'}</td>
        <td>${c.dist!=null?c.dist+' km':'—'}</td>
        <td class="td-vol">${c.cal!=null?c.cal+' kcal':'—'}</td>
        <td class="td-1rm">${c.hr!=null?c.hr+' bpm':'—'}</td>
        <td><button class="btn-del" style="font-size:11px;padding:4px 7px" onclick="event.stopPropagation();deleteSession('${sess.id}')">✕</button></td>
      </tr>`;
    }
  } else {
    const isBodyweight = m.type === '自重運動';
    for(const sess of sessList){
      let mxO=0,vol=0,mxW=0,totalReps=0;
      (sess.sets||[]).forEach(s=>{const o=orm(s.w,s.r);if(o>mxO)mxO=o;vol+=s.w*s.r;if(s.w>mxW)mxW=s.w;totalReps+=s.r;});
      const cnt=(sess.sets||[]).length;
      const timeLabel=sess.time&&sess.time!=='00:00'?`<div style="font-size:10px;color:var(--text3)">${sess.time}</div>`:'';
      if(isBodyweight){
        rows+=`<tr class="clickable" onclick="openSetEdit('${sess.id}')">
          <td class="td-date">${fmtDate(sess.date)}${timeLabel}</td>
          <td style="color:var(--text3)">${cnt}セット</td>
          <td class="td-vol">${totalReps>0?totalReps+' 回':'—'}</td>
          <td><button class="btn-del" style="font-size:11px;padding:4px 7px" onclick="event.stopPropagation();deleteSession('${sess.id}')">✕</button></td>
        </tr>`;
      } else {
        rows+=`<tr class="clickable" onclick="openSetEdit('${sess.id}')">
          <td class="td-date">${fmtDate(sess.date)}${timeLabel}</td>
          <td style="color:var(--text3)">${cnt}セット</td>
          <td>${mxW>0?mxW+' kg':'—'}</td>
          <td class="td-vol">${vol>0?vol.toFixed(0)+' kg':'—'}</td>
          <td class="td-1rm">${mxO>0?mxO.toFixed(1)+' kg':'—'}</td>
          <td><button class="btn-del" style="font-size:11px;padding:4px 7px" onclick="event.stopPropagation();deleteSession('${sess.id}')">✕</button></td>
        </tr>`;
      }
    }
  }

  const archBtn=m.archived
    ?`<button class="btn-action unarchive" onclick="unarchiveMenu()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12h10M8 9V3M5 6l3-3 3 3"/></svg>解除</button>`
    :`<button class="btn-action archive" onclick="archiveMenu()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12v2H2zM3 6l1 8h8l1-8"/><path d="M6 9h4"/></svg>アーカイブ</button>`;

  document.getElementById('detail-body').innerHTML=`
    <div class="detail-hero${m.archived?' archived-hero':''}">
      <div class="detail-name">${esc(m.name)}</div>
      <div class="detail-tags">
        <span class="tag ${tagClass(m.type)}">${esc(m.type)}</span>
        ${m.type !== m.category ? `<span class="tag" style="background:var(--bg3);color:var(--text3)">${esc(m.category)}</span>` : ''}
        ${m.archived?'<span class="tag tag-archived">アーカイブ済</span>':''}
      </div>
      <div class="stats-grid">
        ${st.isCardio ? `
        <div class="stat-box"><div class="stat-val">${st.maxDist||'—'}</div><div class="stat-unit">${st.maxDist?'km':''}</div><div class="stat-label">最大距離</div></div>
        <div class="stat-box"><div class="stat-val">${st.maxCal||'—'}</div><div class="stat-unit">${st.maxCal?'kcal':''}</div><div class="stat-label">最大消費カロリー</div></div>
        <div class="stat-box"><div class="stat-val">${sessList.length}</div><div class="stat-unit">回</div><div class="stat-label">セッション数</div></div>
        ` : m.type==='自重運動' ? `
        <div class="stat-box"><div class="stat-val">${sessList.length}</div><div class="stat-unit">回</div><div class="stat-label">セッション数</div></div>
        ` : `
        <div class="stat-box"><div class="stat-val">${st.maxOrm||'—'}</div><div class="stat-unit">${st.maxOrm?'kg':''}</div><div class="stat-label">最大1RM</div></div>
        <div class="stat-box"><div class="stat-val">${st.maxVol||'—'}</div><div class="stat-unit">${st.maxVol?'kg':''}</div><div class="stat-label">最大ボリューム</div></div>
        <div class="stat-box"><div class="stat-val">${sessList.length}</div><div class="stat-unit">回</div><div class="stat-label">セッション数</div></div>
        `}
      </div>
    </div>
    <div class="menu-actions">
      ${!m.archived?`<button class="btn-action new-sess" onclick="openSetEdit(null)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>新規セッション</button>`:''}
      <button class="btn-action edit-menu" onclick="openEditMenu()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>編集</button>
      ${archBtn}
      <button class="btn-action" style="border-color:var(--green);color:var(--green-t);background:var(--green-bg)" onclick="exportMenuCSV('${m.id}')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M8 3v8M5 8l3 3 3-3"/><path d="M3 13h10"/></svg>CSV出力</button>
      <button class="btn-action delete" onclick="deleteMenu()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9"/></svg>完全削除</button>
    </div>
    ${sessList.length?`
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="hist-table">
          <thead><tr>${isCardioMenu(m)?'<th>日付</th><th>時間</th><th>距離</th><th>消費Cal</th><th>平均心拍</th><th></th>':m.type==='自重運動'?'<th>日付</th><th>セット数</th><th>総回数</th><th></th>':'<th>日付</th><th>セット数</th><th>最大重量</th><th>ボリューム</th><th>1RM</th><th></th>'}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`:`
    <div class="empty-state" style="padding:32px 16px">
      <div class="empty-icon">📋</div>
      <div class="empty-title">記録がありません</div>
      <div class="empty-desc">「新規セッション」からトレーニングを記録しましょう</div>
    </div>`}`;
}

// ④ アーカイブ・削除
function archiveMenu(){
  if(!confirm(`「${S.menu.name}」をアーカイブしますか？\n一覧には表示されなくなりますが記録は保持されます。`)) return;
  S.menu.archived=true; persist(); toast('アーカイブしました'); renderDetail();
}
function unarchiveMenu(){
  S.menu.archived=false; persist(); toast('アーカイブを解除しました'); renderDetail();
}
function deleteMenu(){
  if(!confirm(`「${S.menu.name}」を完全に削除しますか？\n⚠️ この操作は取り消せません。全記録も削除されます。`)) return;
  S.menus=S.menus.filter(m=>m.id!==S.menu.id);
  delete S.sessions[S.menu.id];
  persist(); toast('削除しました'); S.menu=null; go('menu-list');
}

// ===== EDIT MENU =====
let editMenuTypeVal = null;
function openEditMenu() {
  const m = S.menu;
  document.getElementById('edit-inp-name').value = m.name;
  document.getElementById('edit-sel-cat').value = m.category;
  const isCardio = m.category === '有酸素運動';
  document.getElementById('edit-type-section').style.display = isCardio ? 'none' : 'block';
  editMenuTypeVal = m.type;
  document.querySelectorAll('#edit-type-section .type-chip').forEach(c => {
    c.classList.toggle('sel', c.dataset.type === m.type);
  });
  document.getElementById('edit-menu-modal').classList.add('show');
}
function onEditCatChange() {
  const cat = document.getElementById('edit-sel-cat').value;
  const isCardio = cat === '有酸素運動';
  document.getElementById('edit-type-section').style.display = isCardio ? 'none' : 'block';
  if(isCardio) {
    editMenuTypeVal = '有酸素運動';
  } else if(editMenuTypeVal === '有酸素運動') {
    editMenuTypeVal = null;
    document.querySelectorAll('#edit-type-section .type-chip').forEach(c=>c.classList.remove('sel'));
  }
}
function selEditType(el) {
  document.querySelectorAll('#edit-type-section .type-chip').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  editMenuTypeVal = el.dataset.type;
}
function saveEditMenu() {
  const name = document.getElementById('edit-inp-name').value.trim();
  const cat = document.getElementById('edit-sel-cat').value;
  if(!name) { toast('メニュー名を入力してください'); return; }
  if(!editMenuTypeVal) { toast('種別を選択してください'); return; }
  if(S.menus.find(m=>m.id!==S.menu.id&&m.name===name&&m.category===cat&&!m.archived)) {
    toast('同じ部位に同名のメニューがあります'); return;
  }
  S.menu.name = name;
  S.menu.category = cat;
  S.menu.type = editMenuTypeVal;
  persist();
  closeEditMenu();
  toast(`「${name}」を更新しました`);
  renderDetail();
}
function closeEditMenu() {
  document.getElementById('edit-menu-modal').classList.remove('show');
}

// ===== DELETE SESSION =====
function deleteSession(sessId) {
  if(!confirm('このセッションを削除しますか？\n⚠️ この操作は取り消せません。')) return;
  delete S.sessions[S.menu.id][sessId];
  persist();
  toast('セッションを削除しました');
  renderDetail();
}

// ===== MENU SET MANAGEMENT =====
let menuSetModalMode = null; // 'new' | 'edit'
let editingMenuSetId = null;

function renderMenuSetList() {
  const el = document.getElementById('menuset-list-body');
  if (!S.menuSets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">メニューセットがありません</div><div class="empty-desc">「新規セットを作成」からよく使うメニューの組み合わせを登録してください</div></div>`;
    return;
  }
  el.innerHTML = S.menuSets.map(set => {
    const memberMenus = set.menuIds.map(id => S.menus.find(m=>m.id===id)).filter(Boolean);
    const memberHtml = memberMenus.length
      ? memberMenus.map(m => `<div class="menuset-member">
          <span class="tag ${tagClass(m.type)}">${esc(m.type)}</span>
          <span class="menuset-member-name">${esc(m.name)}</span>
          <span class="menuset-member-cat">${esc(m.category)}</span>
        </div>`).join('')
      : `<div style="font-size:12px;color:var(--text3);padding:8px 0">メニューがありません（削除されたか未選択）</div>`;
    return `<div class="prog-card">
      <div class="prog-card-head">
        <div>
          <div class="prog-card-name">${esc(set.name)}</div>
          <div class="prog-card-meta">${memberMenus.length}件のメニュー</div>
        </div>
      </div>
      <div class="menuset-members">${memberHtml}</div>
      <div class="menu-actions" style="margin-top:10px;margin-bottom:0">
        <button class="btn-mini" onclick="openEditMenuSet('${set.id}')">編集</button>
        <button class="btn-mini" style="border-color:var(--red);color:var(--red-t)" onclick="deleteMenuSet('${set.id}')">削除</button>
      </div>
    </div>`;
  }).join('');
}

function populateMenuSetChecklist(selectedIds) {
  const el = document.getElementById('menuset-menu-checklist');
  const sel = new Set(selectedIds || []);
  if (!S.menus.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3)">先に「メニューの追加」からメニューを登録してください</div>`;
    return;
  }
  el.innerHTML = S.menus.filter(m=>!m.archived).map(m => `
    <label class="menuset-check-row">
      <input type="checkbox" value="${m.id}" ${sel.has(m.id)?'checked':''}>
      <span class="tag ${tagClass(m.type)}">${esc(m.type)}</span>
      <span>${esc(m.name)}</span>
      <span style="color:var(--text3);font-size:11px">（${esc(m.category)}）</span>
    </label>`).join('');
}

function openNewMenuSet() {
  menuSetModalMode = 'new';
  editingMenuSetId = null;
  document.getElementById('menuset-modal-title').textContent = 'セットを作成';
  document.getElementById('menuset-inp-name').value = '';
  populateMenuSetChecklist([]);
  document.getElementById('menuset-modal').classList.add('show');
}
function openEditMenuSet(setId) {
  const set = S.menuSets.find(s=>s.id===setId);
  if (!set) return;
  menuSetModalMode = 'edit';
  editingMenuSetId = setId;
  document.getElementById('menuset-modal-title').textContent = 'セットを編集';
  document.getElementById('menuset-inp-name').value = set.name;
  populateMenuSetChecklist(set.menuIds);
  document.getElementById('menuset-modal').classList.add('show');
}
function closeMenuSetModal() {
  document.getElementById('menuset-modal').classList.remove('show');
}
function saveMenuSetModal() {
  const name = document.getElementById('menuset-inp-name').value.trim();
  if (!name) { toast('セット名を入力してください'); return; }
  const menuIds = [...document.querySelectorAll('#menuset-menu-checklist input[type=checkbox]:checked')].map(el=>el.value);
  if (!menuIds.length) { toast('メニューを1つ以上選択してください'); return; }

  if (menuSetModalMode === 'new') {
    S.menuSets.push({ id:'mset_'+Date.now(), name, menuIds });
    toast(`「${name}」を作成しました`);
  } else {
    const set = S.menuSets.find(s=>s.id===editingMenuSetId);
    set.name = name;
    set.menuIds = menuIds;
    toast(`「${name}」を更新しました`);
  }
  persist();
  closeMenuSetModal();
  renderMenuSetList();
}
function deleteMenuSet(setId) {
  const set = S.menuSets.find(s=>s.id===setId);
  if (!set) return;
  if (!confirm(`「${set.name}」を削除しますか？`)) return;
  S.menuSets = S.menuSets.filter(s=>s.id!==setId);
  persist();
  toast('削除しました');
  renderMenuSetList();
}

// ===== SET EDIT =====
function openSetEdit(sid){
  if(sid){
    S.sessionId=sid;
  } else {
    const newId='sess_'+Date.now();
    if(!S.sessions[S.menu.id]) S.sessions[S.menu.id]={};
    // 有酸素は cardio オブジェクト、筋トレは sets 配列で初期化
    const init = isCardioMenu(S.menu)
      ? {date:today(), time:'00:00', cardio:{time:null,dist:null,cal:null,hr:null,maxSpd:null,avgSpd:null}}
      : {date:today(), time:'00:00', sets:[]};
    S.sessions[S.menu.id][newId]=init;
    persist();
    S.sessionId=newId;
  }
  S.editingSetIdx=null;
  S.fromCalendar=false;
  document.getElementById('set-back').onclick=()=>go('menu-detail');
  go('set-edit');
}

function renderSetEdit(){
  if(!S.menu||!S.sessionId) return;
  const sess=S.sessions[S.menu.id]?.[S.sessionId];
  if(!sess) return;

  const dateRow=`
    <div class="date-row">
      <label>記録日</label>
      <input type="date" class="date-input" id="sess-date" value="${esc(sess.date)}" onchange="updateSessionDateTime()">
      <input type="time" class="date-input time-input" id="sess-time" value="${esc(sess.time||'00:00')}" onchange="updateSessionDateTime()">
    </div>`;

  if(isCardioMenu(S.menu)){
    const c=sess.cardio||{};
    document.getElementById('set-edit-body').innerHTML=`
      <div class="set-session-bar">📋 <strong>${esc(S.menu.name)}</strong>${sess.time&&sess.time!=='00:00'?` <span style="font-size:11px;color:var(--nav-text)">· ${sess.time}</span>`:''}</div>
      ${dateRow}
      <div class="card">
        <div class="card-label">有酸素記録</div>

        <div class="cardio-grid">
          <div class="cardio-field">
            <label>合計時間 <span style="color:var(--red);font-size:10px">必須</span></label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-time" placeholder="30"
                inputmode="numeric" min="0" step="1" value="${c.time??''}" oninput="saveCardio()">
              <span class="cardio-unit">分</span>
            </div>
          </div>
          <div class="cardio-field">
            <label>合計距離 <span style="color:var(--red);font-size:10px">必須</span></label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-dist" placeholder="5.0"
                inputmode="decimal" min="0" step="0.1" value="${c.dist??''}" oninput="saveCardio()">
              <span class="cardio-unit">km</span>
            </div>
          </div>
          <div class="cardio-field">
            <label>消費カロリー <span style="color:var(--red);font-size:10px">必須</span></label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-cal" placeholder="300"
                inputmode="numeric" min="0" step="1" value="${c.cal??''}" oninput="saveCardio()">
              <span class="cardio-unit">kcal</span>
            </div>
          </div>
          <div class="cardio-field">
            <label>平均心拍数 <span style="color:var(--red);font-size:10px">必須</span></label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-hr" placeholder="140"
                inputmode="numeric" min="0" step="1" value="${c.hr??''}" oninput="saveCardio()">
              <span class="cardio-unit">bpm</span>
            </div>
          </div>
        </div>

        <div class="cardio-optional-label">任意項目</div>

        <div class="cardio-grid">
          <div class="cardio-field">
            <label>最大速度</label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-maxspd" placeholder="12.0"
                inputmode="decimal" min="0" step="0.1" value="${c.maxSpd??''}" oninput="saveCardio()">
              <span class="cardio-unit">km/h</span>
            </div>
          </div>
          <div class="cardio-field">
            <label>平均速度</label>
            <div class="cardio-input-wrap">
              <input type="number" class="cardio-input" id="c-avgspd" placeholder="8.0"
                inputmode="decimal" min="0" step="0.1" value="${c.avgSpd??''}" oninput="saveCardio()">
              <span class="cardio-unit">km/h</span>
            </div>
          </div>
        </div>

        <button class="btn-primary" id="btn-save-cardio" onclick="saveCardioFinal()" style="margin-top:4px">記録を保存</button>
      </div>

      <div id="cardio-preview"></div>`;

    renderCardioPreview();
    return;
  }

  // 筋トレ
  const isBodyweight = S.menu.type === '自重運動';
  document.getElementById('set-edit-body').innerHTML=`
    <div class="set-session-bar">📋 <strong>${esc(S.menu.name)}</strong>${sess.time&&sess.time!=='00:00'?` <span style="font-size:11px;color:var(--nav-text)">· ${sess.time}</span>`:''}</div>
    ${dateRow}
    <div class="card">
      <div class="card-label" id="form-label">セットを追加</div>
      <div class="set-input-grid">
        ${!isBodyweight?`
        <div class="input-box">
          <label>重量</label>
          <div class="big-wrap">
            <input type="number" class="big-input" id="inp-w" placeholder="60"
              inputmode="decimal" min="0" step="0.5" oninput="updatePreview()">
            <span class="big-unit">kg</span>
          </div>
        </div>`:''}
        <div class="input-box">
          <label>回数</label>
          <div class="big-wrap">
            <input type="number" class="big-input" id="inp-r" placeholder="10"
              inputmode="numeric" min="1" step="1" oninput="updatePreview()">
            <span class="big-unit">回</span>
          </div>
        </div>
      </div>
      <div class="orm-preview" id="orm-prev">${isBodyweight?'回数を入力してください':'重量と回数を入力すると 1RM を表示します'}</div>
      <button class="btn-primary" id="btn-add-set" onclick="commitSet()" disabled>セットを追加</button>
    </div>
    <div class="card-label" id="set-count-label" style="padding:0 2px;margin-bottom:8px">記録済みセット</div>
    <div class="set-list" id="set-list"></div>`;

  renderSets();
}

// ===== CARDIO =====
function saveCardio(){
  // 入力のたびにリアルタイム保存
  const sess=S.sessions[S.menu.id][S.sessionId];
  if(!sess.cardio) sess.cardio={};
  // 空文字・0以下はnull扱い（0分・0km等は無効値として扱う）
  const v=id=>{ const el=document.getElementById(id); if(!el||el.value==='') return null; const n=parseFloat(el.value); return n>0?n:null; };
  sess.cardio={
    time:   v('c-time'),
    dist:   v('c-dist'),
    cal:    v('c-cal'),
    hr:     v('c-hr'),
    maxSpd: v('c-maxspd'),
    avgSpd: v('c-avgspd'),
  };
  persist();
  renderCardioPreview();
}

function saveCardioFinal(){
  saveCardio();
  const c=S.sessions[S.menu.id][S.sessionId].cardio||{};
  const missing=[];
  if(c.time==null)  missing.push('合計時間');
  if(c.dist==null)  missing.push('合計距離');
  if(c.cal==null)   missing.push('消費カロリー');
  if(c.hr==null)    missing.push('平均心拍数');
  if(missing.length){ toast(`未入力項目: ${missing.join('・')}`); return; }
  toast('記録を保存しました');
  // F-04: カレンダー経由の場合は画面を移動しない（set-editにとどまる）
  if(!S.fromCalendar) go('menu-detail');
}

function renderCardioPreview(){
  const el=document.getElementById('cardio-preview');
  if(!el) return;
  const c=S.sessions[S.menu.id]?.[S.sessionId]?.cardio||{};
  const hasAny=[c.time,c.dist,c.cal,c.hr].some(v=>v!=null);
  if(!hasAny){ el.innerHTML=''; return; }
  el.innerHTML=`
    <div class="card-label" style="padding:0 2px;margin-bottom:8px">入力中のプレビュー</div>
    <div class="cardio-record">
      <div class="cardio-record-head">
        <div class="cardio-record-title">${esc(S.menu.name)}</div>
      </div>
      <div class="cardio-stats">
        ${c.time!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.time}<span style="font-size:12px;font-weight:400;color:var(--text3)"> 分</span></div><div class="cardio-stat-label">合計時間</div></div>`:''}
        ${c.dist!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.dist}<span style="font-size:12px;font-weight:400;color:var(--text3)"> km</span></div><div class="cardio-stat-label">合計距離</div></div>`:''}
        ${c.cal!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.cal}<span style="font-size:12px;font-weight:400;color:var(--text3)"> kcal</span></div><div class="cardio-stat-label">消費カロリー</div></div>`:''}
        ${c.hr!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.hr}<span style="font-size:12px;font-weight:400;color:var(--text3)"> bpm</span></div><div class="cardio-stat-label">平均心拍数</div></div>`:''}
        ${c.maxSpd!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.maxSpd}<span style="font-size:12px;font-weight:400;color:var(--text3)"> km/h</span></div><div class="cardio-stat-label">最大速度</div></div>`:''}
        ${c.avgSpd!=null?`<div class="cardio-stat"><div class="cardio-stat-val">${c.avgSpd}<span style="font-size:12px;font-weight:400;color:var(--text3)"> km/h</span></div><div class="cardio-stat-label">平均速度</div></div>`:''}
      </div>
    </div>`;
}

// ===== SET EDIT (筋トレ) =====
function updateSessionDateTime(){
  if(!S.sessionId) return;
  const date = document.getElementById('sess-date')?.value;
  const time = document.getElementById('sess-time')?.value;
  if(date) S.sessions[S.menu.id][S.sessionId].date=date;
  if(time!==undefined) S.sessions[S.menu.id][S.sessionId].time=time||'00:00';
  persist();
}

function updatePreview(){
  const isBodyweight = S.menu && S.menu.type === '自重運動';
  const wEl = document.getElementById('inp-w');
  const w = isBodyweight ? 0 : parseFloat(wEl ? wEl.value : '');
  const r = parseInt(document.getElementById('inp-r').value);
  const prev = document.getElementById('orm-prev');
  const btn = document.getElementById('btn-add-set');
  if(isBodyweight){
    if(r>0){ prev.textContent=`${r}回`; btn.disabled=false; }
    else{ prev.textContent='回数を入力してください'; btn.disabled=true; }
  } else {
    if(w>0&&r>0){ prev.textContent=`推定1RM：${orm(w,r)} kg（${w}kg × ${r}回）`; btn.disabled=false; }
    else{ prev.textContent='重量と回数を入力すると 1RM を表示します'; btn.disabled=true; }
  }
}

function commitSet(){
  const isBodyweight = S.menu && S.menu.type === '自重運動';
  const wEl = document.getElementById('inp-w');
  const w = isBodyweight ? 0 : parseFloat(wEl ? wEl.value : '');
  const r = parseInt(document.getElementById('inp-r').value);
  if(isBodyweight ? !r : (!w||!r)) return;
  const sets=S.sessions[S.menu.id][S.sessionId].sets;
  if(S.editingSetIdx!==null){
    sets[S.editingSetIdx]={w,r};
    S.editingSetIdx=null;
    document.getElementById('form-label').textContent='セットを追加';
    document.getElementById('btn-add-set').textContent='セットを追加';
    toast('セットを更新しました');
  } else {
    sets.push({w,r});
    toast('セットを追加しました');
  }
  persist();
  if(wEl) wEl.value='';
  document.getElementById('inp-r').value='';
  document.getElementById('orm-prev').textContent=isBodyweight?'回数を入力してください':'重量と回数を入力すると 1RM を表示します';
  document.getElementById('btn-add-set').disabled=true;
  updateSetCountLabel(); renderSets();
}

function editSet(idx){
  const isBodyweight = S.menu && S.menu.type === '自重運動';
  const s=S.sessions[S.menu.id][S.sessionId].sets[idx];
  S.editingSetIdx=idx;
  const wEl = document.getElementById('inp-w');
  if(wEl) wEl.value=s.w;
  document.getElementById('inp-r').value=s.r;
  document.getElementById('form-label').textContent=`セット${idx+1}を編集中`;
  document.getElementById('btn-add-set').textContent='変更を保存';
  document.getElementById('btn-add-set').disabled=false;
  updatePreview();
  if(wEl) wEl.focus(); else document.getElementById('inp-r').focus();
  document.getElementById('content').scrollTo({top:0,behavior:'smooth'});
  renderSets();
}

function cancelEdit(){
  const isBodyweight = S.menu && S.menu.type === '自重運動';
  S.editingSetIdx=null;
  const wEl = document.getElementById('inp-w');
  if(wEl) wEl.value='';
  document.getElementById('inp-r').value='';
  document.getElementById('form-label').textContent='セットを追加';
  document.getElementById('btn-add-set').textContent='セットを追加';
  document.getElementById('btn-add-set').disabled=true;
  document.getElementById('orm-prev').textContent=isBodyweight?'回数を入力してください':'重量と回数を入力すると 1RM を表示します';
  renderSets();
}

function deleteSet(idx){
  if(!confirm(`セット${idx+1}を削除しますか？`)) return;
  if(S.editingSetIdx===idx) cancelEdit();
  S.sessions[S.menu.id][S.sessionId].sets.splice(idx,1);
  persist(); updateSetCountLabel(); renderSets(); toast('セットを削除しました');
}

function updateSetCountLabel(){
  const sets=S.sessions[S.menu.id]?.[S.sessionId]?.sets||[];
  const el=document.getElementById('set-count-label');
  if(el) el.textContent=`記録済みセット（${sets.length}セット）`;
}

function renderSets(){
  const sets=S.sessions[S.menu.id]?.[S.sessionId]?.sets||[];
  updateSetCountLabel();
  const el=document.getElementById('set-list');
  if(!el) return;
  if(!sets.length){
    el.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">まだセットが追加されていません</div>`;
    return;
  }
  const isBodyweight = S.menu && S.menu.type === '自重運動';
  el.innerHTML=sets.map((s,i)=>{
    const isEditing=S.editingSetIdx===i;
    const mainText = isBodyweight ? `${s.r} 回` : `${s.w} kg × ${s.r} 回`;
    const subText = isBodyweight ? '' : `<div class="set-sub">1RM：${orm(s.w,s.r)} kg</div>`;
    return `<div class="set-row${isEditing?' editing':''}" onclick="editSet(${i})">
      <div class="set-num">${i+1}</div>
      <div class="set-info">
        <div class="set-main">${mainText}</div>
        ${subText}
        <div class="set-edit-hint">${isEditing?'✏️ 編集中 — 上のフォームで変更できます':'タップして編集'}</div>
      </div>
      <button class="btn-del" onclick="event.stopPropagation();deleteSet(${i})">✕</button>
    </div>`;
  }).join('');
}

// ===== ANALYSIS =====
let anaState = {
  tab: 'cal',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calSelectedDate: null,
  analysisMenuId: null,
  volChart: null,
  ormChart: null,
};

function renderAnalysis() {
  switchAnaTab(anaState.tab);
}

function switchAnaTab(tab) {
  anaState.tab = tab;
  document.getElementById('ana-tab-cal').classList.toggle('active', tab==='cal');
  document.getElementById('ana-tab-menu').classList.toggle('active', tab==='menu');
  document.getElementById('ana-cal-view').style.display  = tab==='cal'  ? 'block' : 'none';
  document.getElementById('ana-menu-view').style.display = tab==='menu' ? 'block' : 'none';
  if (tab==='cal')  renderCalendar();
  if (tab==='menu') renderAnaMenuList();
}

// ===== CALENDAR =====
function renderCalendar() {
  const y = anaState.calYear, m = anaState.calMonth;
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  // 記録がある日付セットを構築
  const recordDates = new Set();
  for (const menu of S.menus) {
    for (const sess of Object.values(S.sessions[menu.id]||{})) {
      if (sess.date && sess.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)) {
        recordDates.add(sess.date);
      }
    }
  }

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const todayStr = today();

  let cells = '';
  for (let i=0; i<firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasRec = recordDates.has(dateStr);
    const isToday = dateStr === todayStr;
    const isSel = dateStr === anaState.calSelectedDate;
    cells += `<div class="cal-cell${hasRec?' has-record':''}${isToday?' today':''}${isSel?' has-record':''}"
      ${hasRec ? `onclick="selectCalDate('${dateStr}')"` : ''}>
      <div class="cal-day-num">${d}</div>
      ${hasRec ? '<div class="cal-dot"></div>' : ''}
    </div>`;
  }

  const DOW = ['日','月','火','水','木','金','土'];
  document.getElementById('ana-cal-view').innerHTML = `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="moveMonth(-1)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10 3L5 8l5 5"/></svg>
      </button>
      <div class="cal-title">${y}年 ${monthNames[m]}</div>
      <button class="cal-nav-btn" onclick="moveMonth(1)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 3l5 5-5 5"/></svg>
      </button>
    </div>
    <div class="cal-grid">
      <div class="cal-dow">${DOW.map(d=>`<div class="cal-dow-cell">${d}</div>`).join('')}</div>
      <div class="cal-days">${cells}</div>
    </div>
    <div id="cal-detail-area">${anaState.calSelectedDate ? '' : ''}</div>`;

  if (anaState.calSelectedDate) renderCalDetail(anaState.calSelectedDate);
}

function moveMonth(dir) {
  anaState.calMonth += dir;
  if (anaState.calMonth < 0)  { anaState.calMonth=11; anaState.calYear--; }
  if (anaState.calMonth > 11) { anaState.calMonth=0;  anaState.calYear++; }
  anaState.calSelectedDate = null;
  renderCalendar();
}

function selectCalDate(dateStr) {
  anaState.calSelectedDate = anaState.calSelectedDate === dateStr ? null : dateStr;
  renderCalendar();
}

function renderCalDetail(dateStr) {
  const el = document.getElementById('cal-detail-area');
  if (!el) return;

  // その日のセッションを全メニューから収集
  const sessions = [];
  for (const menu of S.menus) {
    for (const [sessId, sess] of Object.entries(S.sessions[menu.id]||{})) {
      if (sess.date !== dateStr) continue;
      if (isCardioMenu(menu)) {
        const c = sess.cardio||{};
        sessions.push({ menu, sessId, type:'cardio',
          summary: `${c.time!=null?c.time+'分 ':''} ${c.dist!=null?c.dist+'km ':''} ${c.cal!=null?c.cal+'kcal':''}`.trim()
        });
      } else {
        const sets = sess.sets||[];
        let maxOrm=0, vol=0;
        sets.forEach(s=>{ const o=orm(s.w,s.r); if(o>maxOrm) maxOrm=o; vol+=s.w*s.r; });
        sessions.push({ menu, sessId, type:'strength',
          sets: sets.length, maxOrm: maxOrm.toFixed(1), vol: vol.toFixed(0)
        });
      }
    }
  }

  if (!sessions.length) { el.innerHTML=''; return; }

  el.innerHTML = `<div class="cal-detail">
    <div class="cal-detail-title">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v4M11 1v4M2 7h12"/></svg>
      ${fmtDate(dateStr)}の記録
    </div>
    ${sessions.map(s => `
    <div class="cal-sess-row" onclick="goToSessionFromCalendar('${s.menu.id}','${s.sessId}')">
      <div class="cal-sess-name">${esc(s.menu.name)}</div>
      <div class="cal-sess-stats">
        ${s.type==='strength' ? `
          <div class="cal-sess-stat">セット数<span>${s.sets}</span></div>
          <div class="cal-sess-stat">最大1RM<span>${s.maxOrm} kg</span></div>
          <div class="cal-sess-stat">ボリューム<span>${s.vol} kg</span></div>
        ` : `
          <div class="cal-sess-stat">有酸素<span>${s.summary||'—'}</span></div>
        `}
      </div>
    </div>`).join('')}
  </div>`;
}

// F-02: カレンダーから該当セッションへ直接遷移
// F-03: 戻るボタンをanalysisに設定
// F-04: 保存後もset-editにとどまる
function goToSessionFromCalendar(menuId, sessId) {
  S.menu = S.menus.find(m=>m.id===menuId);
  S.sessionId = sessId;
  S.editingSetIdx = null;
  S.fromCalendar = true;
  document.getElementById('set-back').onclick = () => go('analysis');
  go('set-edit');
}

function goToMenuDetail(menuId) {
  S.menu = S.menus.find(m=>m.id===menuId);
  go('menu-detail');
}

// ===== ANALYSIS MENU VIEW =====
const ANA_CATS = ['胸','背中','肩','足','腕'];
function renderAnaMenuList() {
  const el = document.getElementById('ana-menu-view');
  const menus = S.menus.filter(m => m.category !== '有酸素運動');
  if (!menus.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">分析できるメニューがありません</div><div class="empty-desc">メニューを追加して記録を付けると分析できます</div></div>`;
    return;
  }
  let html = '';
  for (const cat of ANA_CATS) {
    const items = menus.filter(m=>m.category===cat);
    if (!items.length) continue;
    html += `<div class="group-block"><div class="group-head"><div class="group-dot" style="background:${dotColor(cat)}"></div><div class="group-name">${cat}</div><div class="group-cnt">${items.length}件</div></div>`;
    for (const m of items) {
      const sessCount = Object.keys(S.sessions[m.id]||{}).length;
      const st = menuStats(m.id);
      html += `<div class="ana-menu-row" onclick="openAnalysisDetail('${m.id}')">
        <div style="flex:1">
          <div class="ana-menu-name">${esc(m.name)}</div>
          <div class="ana-menu-meta">${sessCount}セッション${st.maxOrm>0?' · 最大1RM '+st.maxOrm+' kg':''}</div>
        </div>
        <span style="color:var(--text3);font-size:16px">›</span>
      </div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

function openAnalysisDetail(menuId) {
  anaState.analysisMenuId = menuId;
  go('analysis-detail');
}

// ===== ANALYSIS DETAIL =====
function renderAnalysisDetail() {
  const m = S.menus.find(x=>x.id===anaState.analysisMenuId);
  if (!m) return;

  const sessMap = S.sessions[m.id]||{};
  const sessList = Object.entries(sessMap)
    .map(([id,s])=>({id,...s}))
    .filter(s=>s.sets&&s.sets.length>0)
    .sort((a,b)=>a.date.localeCompare(b.date));

  const labels = sessList.map(s=>fmtDate(s.date).replace(/\d{4}年/,''));
  const volData = sessList.map(s=>{
    let v=0; (s.sets||[]).forEach(x=>v+=x.w*x.r); return +v.toFixed(0);
  });
  const ormData = sessList.map(s=>{
    let mx=0; (s.sets||[]).forEach(x=>{ const o=orm(x.w,x.r); if(o>mx) mx=o; }); return +mx.toFixed(1);
  });

  document.getElementById('analysis-detail-body').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px">${esc(m.name)}</div>
      <div style="display:flex;gap:6px">
        <span class="tag ${tagClass(m.type)}">${esc(m.type)}</span>
        <span class="tag" style="background:var(--bg3);color:var(--text3)">${esc(m.category)}</span>
      </div>
    </div>

    ${sessList.length === 0 ? `
    <div class="empty-state" style="padding:32px 16px">
      <div class="empty-icon">📊</div>
      <div class="empty-title">記録がありません</div>
      <div class="empty-desc">セットを記録するとグラフが表示されます</div>
    </div>` : `

    <div class="chart-card">
      <div class="chart-head">
        <div class="chart-title">ボリューム推移 (kg)</div>
      </div>
      <div class="chart-wrap"><canvas id="chart-vol"></canvas></div>
    </div>

    <div class="chart-card">
      <div class="chart-head">
        <div class="chart-title">最大1RM推移 (kg)</div>
      </div>
      <div class="chart-wrap"><canvas id="chart-orm"></canvas></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="hist-table">
          <thead><tr><th>日付</th><th>ボリューム</th><th>最大1RM</th></tr></thead>
          <tbody>${sessList.map((s,i)=>`
            <tr>
              <td class="td-date">${fmtDate(s.date)}</td>
              <td class="td-vol">${volData[i]} kg</td>
              <td class="td-1rm">${ormData[i]} kg</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`}`;

  if (sessList.length > 0) {
    waitForChartJs(() => {
      drawChart('vol', labels, volData);
      drawChart('orm', labels, ormData);
    });
  }
}

function waitForChartJs(cb) {
  if (window.Chart) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  // SRI: cdnjsの公開ハッシュ(sha512)。バージョンを上げる際はハッシュも更新すること
  s.integrity = 'sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==';
  s.crossOrigin = 'anonymous';
  s.onload = cb;
  document.head.appendChild(s);
}

function drawChart(key, labels, data) {
  const canvasId = key==='vol' ? 'chart-vol' : 'chart-orm';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (key==='vol' && anaState.volChart) { anaState.volChart.destroy(); anaState.volChart=null; }
  if (key==='orm' && anaState.ormChart) { anaState.ormChart.destroy(); anaState.ormChart=null; }

  const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  const accentColor = isDark ? '#38bdf8' : '#0ea5e9';
  const gridColor   = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const tickColor   = isDark ? '#6b7280' : '#9ca3af';

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets:[{
        label: key==='vol' ? 'ボリューム (kg)' : '最大1RM (kg)',
        data,
        borderColor: accentColor,
        backgroundColor: isDark ? 'rgba(56,189,248,.1)' : 'rgba(14,165,233,.08)',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{
        label: ctx => ` ${ctx.parsed.y} kg`
      }}},
      scales:{
        x:{ grid:{ color:gridColor }, ticks:{ color:tickColor, font:{size:11}, maxRotation:45 }},
        y:{ grid:{ color:gridColor }, ticks:{ color:tickColor, font:{size:11} }, beginAtZero:false }
      }
    }
  });

  if (key==='vol') anaState.volChart=chart;
  if (key==='orm') anaState.ormChart=chart;
}

// ===== RM CALCULATOR =====

// ページ遷移時にフォームをリセット
function initRMPage() {
  document.getElementById('rm-inp-w').value = '';
  document.getElementById('rm-inp-r').value = '';
  document.getElementById('rm-inp-max').value = '';
  document.getElementById('rm-orm-result').style.display = 'none';
  document.getElementById('rm-table-wrap').innerHTML = `
    <div class="empty-state" style="padding:20px 0">
      <div class="empty-icon" style="font-size:24px">🔢</div>
      <div class="empty-title">最大RMを入力してください</div>
      <div class="empty-desc">重量と回数を入力するか、最大RMを直接入力してください</div>
    </div>`;
}

// 推定1RM計算（ベンチプレス）: w × r ÷ 40 + w
function rmBP(w, r) { return w * r / 40 + w; }

// 推定1RM計算（スクワット・デッドリフト）: w × r ÷ 33.3 + w
function rmSQ(w, r) { return w * r / 33.3 + w; }

// 逆算: Nrepで扱える重量 = 1RM ÷ (r ÷ divisor + 1)
function rmWeightFromMax(max, r, divisor) { return max / (r / divisor + 1); }

// 小数部 >= 0.5 → 切り上げ、< 0.5 → 切り捨て（参考表と同一ロジック）
function rmRound(n) {
  const dec = n - Math.floor(n);
  return dec >= 0.5 ? Math.ceil(n) : Math.floor(n);
}

// 推定1RM計算（入力ごとに呼ばれる）
function calcRM() {
  const w = parseFloat(document.getElementById('rm-inp-w').value);
  const r = parseInt(document.getElementById('rm-inp-r').value);
  const resultEl = document.getElementById('rm-orm-result');

  if (w > 0 && r >= 1) {
    const bp = rmRound(rmBP(w, r));
    const sq = rmRound(rmSQ(w, r));
    document.getElementById('rm-bp-val').textContent = bp;
    document.getElementById('rm-sq-val').textContent = sq;
    resultEl.style.display = 'block';
    // 最大RM欄に自動連動（ベンチプレスの値をデフォルトに）
    document.getElementById('rm-inp-max').value = bp;
    calcRMTable();
  } else {
    resultEl.style.display = 'none';
  }
}

// 1〜10rep 換算テーブル描画
function calcRMTable() {
  const maxVal = parseFloat(document.getElementById('rm-inp-max').value);
  const wrap = document.getElementById('rm-table-wrap');

  if (!maxVal || maxVal <= 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:20px 0">
        <div class="empty-icon" style="font-size:24px">🔢</div>
        <div class="empty-title">最大RMを入力してください</div>
        <div class="empty-desc">重量と回数を入力するか、最大RMを直接入力してください</div>
      </div>`;
    return;
  }

  const inputReps = parseInt(document.getElementById('rm-inp-r').value) || 0;
  let rows = '';
  for (let rep = 1; rep <= 10; rep++) {
    // 1repは最大RM自体
    const bpW = rep === 1 ? maxVal : rmRound(rmWeightFromMax(maxVal, rep, 40));
    const sqW = rep === 1 ? maxVal : rmRound(rmWeightFromMax(maxVal, rep, 33.3));
    const isHL = rep === inputReps;
    rows += `<tr class="${isHL ? 'rm-highlight' : ''}">
      <td><span class="rm-rep-badge">${rep}</span></td>
      <td>${bpW} kg</td>
      <td>${sqW} kg</td>
    </tr>`;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rm-rep-table">
        <thead>
          <tr>
            <th>rep</th>
            <th>ベンチプレス</th>
            <th>スクワット / DL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ===== CSV =====

// CSVダウンロード共通
function downloadCSV(filename, content) {
  const bom = '\uFEFF'; // Excel用BOM
  const blob = new Blob([bom + content], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ① 筋トレCSV行生成（推定1RM・ボリューム列追加）
function buildStrengthRows(menus) {
  const rows = ['menu_name,category,type,date,session_id,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg'];
  for (const m of menus) {
    const sessMap = S.sessions[m.id] || {};
    const sessList = Object.entries(sessMap)
      .map(([id,s])=>({id,...s}))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    for (const sess of sessList) {
      (sess.sets||[]).forEach((s,i) => {
        const e1rm = orm(s.w, s.r);
        const vol  = +(s.w * s.r).toFixed(1);
        rows.push([
          `"${m.name}"`, m.category, m.type,
          sess.date, sess.id, i+1, s.w, s.r, e1rm, vol
        ].join(','));
      });
    }
  }
  return rows.join('\r\n');
}

// 有酸素CSVの行生成（変更なし）
function buildCardioRows(menus) {
  const rows = ['menu_name,category,date,session_id,time_min,dist_km,cal_kcal,hr_bpm,max_spd_kmh,avg_spd_kmh'];
  for (const m of menus) {
    const sessMap = S.sessions[m.id] || {};
    const sessList = Object.entries(sessMap)
      .map(([id,s])=>({id,...s}))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    for (const sess of sessList) {
      const c = sess.cardio || {};
      rows.push([
        `"${m.name}"`, m.category,
        sess.date, sess.id,
        c.time??'', c.dist??'', c.cal??'', c.hr??'',
        c.maxSpd??'', c.avgSpd??''
      ].join(','));
    }
  }
  return rows.join('\r\n');
}

// 全体エクスポート
function exportCSV(type) {
  const d = today();
  if (type === 'strength') {
    const menus = S.menus.filter(m => m.category !== '有酸素運動');
    if (!menus.length) { toast('筋トレメニューがありません'); return; }
    downloadCSV(`gymlog_strength_${d}.csv`, buildStrengthRows(menus));
    toast('筋トレCSVをエクスポートしました');
  } else {
    const menus = S.menus.filter(m => m.category === '有酸素運動');
    if (!menus.length) { toast('有酸素運動メニューがありません'); return; }
    downloadCSV(`gymlog_cardio_${d}.csv`, buildCardioRows(menus));
    toast('有酸素運動CSVをエクスポートしました');
  }
}

// 個別メニューエクスポート
function exportMenuCSV(menuId) {
  const m = S.menus.find(x => x.id === menuId);
  if (!m) return;
  const d = today();
  const safeName = m.name.replace(/[\\/:*?"<>|]/g, '_');
  if (isCardioMenu(m)) {
    downloadCSV(`gymlog_${safeName}_${d}.csv`, buildCardioRows([m]));
  } else {
    downloadCSV(`gymlog_${safeName}_${d}.csv`, buildStrengthRows([m]));
  }
  toast(`「${m.name}」のCSVをエクスポートしました`);
}

// CSVパース（引用符対応）
function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  return lines.map(line => {
    const cols = []; let cur = ''; let inQ = false;
    for (let i=0; i<line.length; i++) {
      const c = line[i];
      if (c==='"') { inQ=!inQ; }
      else if (c===',' && !inQ) { cols.push(cur.trim()); cur=''; }
      else { cur+=c; }
    }
    cols.push(cur.trim());
    return cols;
  });
}

// ④ インポート：session_id空欄時は日付+メニューIDで自動発行
function importCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    try {
      const rows = parseCSV(text);
      if (rows.length < 2) { showImportResult('err','データが空です'); return; }
      const header = rows[0].map(h=>h.toLowerCase().replace(/"/g,'').trim());
      const isCardio = header.includes('time_min') || header.includes('dist_km');
      let imported=0, skipped=0, menuCreated=0;
      const col = k => header.indexOf(k);

      // ④ session_id空欄時の自動割当: "日付_メニューID" をキーにセッションを一意化
      const autoSessMap = {}; // key: `${menuId}_${date}` → sessId

      for (let i=1; i<rows.length; i++) {
        const r = rows[i];
        if (r.length < 4) continue;
        const menuName = r[col('menu_name')]?.replace(/^"|"$/g,'').trim();
        const category = r[col('category')]?.trim();
        const date     = r[col('date')]?.trim();
        const rawSessId = col('session_id') >= 0 ? r[col('session_id')]?.trim() : '';
        if (!menuName||!category||!date) continue;

        // ③ メニュー存在確認・アプリ未登録なら自動新規登録
        let menu = S.menus.find(m=>m.name===menuName&&m.category===category);
        if (!menu) {
          const type = isCardio ? '有酸素運動' : (col('type')>=0 ? r[col('type')]?.trim()||'マシン' : 'マシン');
          menu = {id:'menu_imp_'+Date.now()+'_'+i, name:menuName, category, type, archived:false};
          S.menus.push(menu);
          menuCreated++;
        }
        if (!S.sessions[menu.id]) S.sessions[menu.id] = {};

        // ④ session_id決定ロジック
        let sessId = rawSessId;
        if (!sessId) {
          // 空欄の場合：同日同メニューを同一セッションにまとめる
          const autoKey = `${menu.id}_${date}`;
          if (!autoSessMap[autoKey]) {
            autoSessMap[autoKey] = 'sess_imp_' + Date.now() + '_' + i;
          }
          sessId = autoSessMap[autoKey];
        }

        if (isCardio) {
          // 有酸素：sessId重複はスキップ
          if (S.sessions[menu.id][sessId]) { skipped++; continue; }
          S.sessions[menu.id][sessId] = {
            date,
            cardio: {
              time:   r[col('time_min')]!==''    ? +r[col('time_min')]    : null,
              dist:   r[col('dist_km')]!==''     ? +r[col('dist_km')]     : null,
              cal:    r[col('cal_kcal')]!==''    ? +r[col('cal_kcal')]    : null,
              hr:     r[col('hr_bpm')]!==''      ? +r[col('hr_bpm')]      : null,
              maxSpd: col('max_spd_kmh')>=0&&r[col('max_spd_kmh')]!=='' ? +r[col('max_spd_kmh')] : null,
              avgSpd: col('avg_spd_kmh')>=0&&r[col('avg_spd_kmh')]!=='' ? +r[col('avg_spd_kmh')] : null,
            }
          };
          imported++;
        } else {
          // 筋トレ：同sessIdで複数行 → setsに追加（重複sessIdはINSERT継続）
          if (!S.sessions[menu.id][sessId]) {
            S.sessions[menu.id][sessId] = {date, sets:[]};
          }
          const w   = parseFloat(r[col('weight_kg')]);
          const rep = parseInt(r[col('reps')]);
          if (!isNaN(w) && !isNaN(rep)) {
            S.sessions[menu.id][sessId].sets.push({w, r:rep});
            imported++;
          }
        }
      }

      persist();
      const msgs = [`${imported}件をインポートしました`];
      if (menuCreated) msgs.push(`未登録メニュー ${menuCreated}件を新規登録`);
      if (skipped)     msgs.push(`重複 ${skipped}件をスキップ`);
      showImportResult('ok', msgs.join('\n'));
    } catch(err) {
      showImportResult('err', 'CSVの読み込みに失敗しました\n'+err.message);
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

function showImportResult(type, msg) {
  const el = document.getElementById('import-result');
  if (!el) return;
  el.className = `csv-import-result ${type}`;
  el.textContent = msg;
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

// 初期表示：メニュー一覧
renderList();
