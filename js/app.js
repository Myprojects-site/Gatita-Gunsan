(() => {
  'use strict';
  const B = window.Backend;

  /* =========================================================
     작은 도구들
     ========================================================= */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const won = n => Math.round(n || 0).toLocaleString('ko-KR') + '원';
  const DAY = 86400000;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kpool:ui:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kpool:ui:' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
    del(k) { try { localStorage.removeItem('kpool:ui:' + k); } catch (e) { /* 무시 */ } },
  };
  function kmBetween(a, b) {
    const R = 6371, t = x => x * Math.PI / 180;
    const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = k => (k < 1 ? Math.round(k * 1000) + 'm' : k.toFixed(1) + 'km');
  function nearestDong(p) {
    let best = null;
    for (const d of DONGS) { const k = kmBetween(p, d); if (!best || k < best.km) best = { ...d, km: k }; }
    return best;
  }
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  function fmtWhen(ms) {
    const d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.floor((new Date(d).setHours(0, 0, 0, 0) - t) / DAY);
    const day = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === -1 ? '어제' : `${d.getMonth() + 1}/${d.getDate()}`;
    return { day, time: hm(ms) };
  }
  const initial = n => esc((n || '?').trim().charAt(0));
  const ceil100 = n => Math.ceil(n / 100) * 100;
  const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));
  const errMsg = e => ({
    'sid-taken': '이미 가입된 학번이에요. 로그인해 주세요.',
    'bad-login': '학번이나 비밀번호가 맞지 않아요.',
    full: '자리가 다 찼어요.', already: '이미 신청한 카풀이에요.', closed: '이미 출발했거나 끝난 카풀이에요.',
    own: '내가 올린 카풀이에요.', 'bad-code': '탑승 코드가 맞지 않아요. 운전자의 QR을 다시 찍어 주세요.',
    'not-boarded': 'QR로 탑승 인증을 한 사람끼리만 평가할 수 있어요.', 'not-done': '카풀이 끝난 뒤에 평가할 수 있어요.',
    denied: '권한이 없어요.', 'no-auth': '로그인이 필요해요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜 주세요.',
  }[e && e.code] || (e && e.message) || '잠시 후 다시 시도해 주세요.');

  /* ---------- 위치 ---------- */
  function fakeLoc() {
    const name = store.get('fakeLoc', null);
    const d = name && DONGS.find(x => x.name === name);
    if (!d) return null;
    const j = () => (Math.random() - 0.5) * 0.003;
    return { lat: d.lat + j(), lng: d.lng + j(), fake: true };
  }
  function getPos() {
    const f = fakeLoc();
    if (f) return Promise.resolve(f);
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej(new Error('이 브라우저는 위치를 지원하지 않아요')); return; }
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        e => rej(new Error(e.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용해 주세요.' : '위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }

  /* ---------- 아이콘 ---------- */
  const ICONS = {
    car: '<path class="a" d="M11 4.5l1.2 2.2M21 4.5l-1.2 2.2M16 3.5V6"/><path class="s" d="M5 21v-4.5L8.5 10h15l3.5 6.5V21a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path class="s" d="M5 16.5h22"/><circle class="f a" cx="10" cy="19.5" r="1.5"/><circle class="f a" cx="22" cy="19.5" r="1.5"/><path class="s" d="M8.5 23v3M23.5 23v3"/>',
    shuttle: '<rect class="s" x="6.5" y="4" width="19" height="20" rx="4"/><rect class="f" x="9" y="8" width="14" height="7" rx="1.5"/><path class="s" d="M6.5 15.5h19"/><circle class="n" cx="11" cy="19.5" r="1.4"/><circle class="n" cx="21" cy="19.5" r="1.4"/><path class="s" d="M9.5 24v3M22.5 24v3"/>',
  };
  const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const UI = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    won: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 3 10 3-8 2 0 3 8 3-10M3 11h18M3 14h18"/></svg>',
  };

  /* ---------- 알림 띠 / 위에서 내려오는 알림 / 아래 창 ---------- */
  let toastTimer = null;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.className = 'toast show ' + kind; t.textContent = msg;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }
  const bannerQ = []; let bannerBusy = false;
  function banner(title, body = '', opts = {}) {
    bannerQ.push({ title, body, ...opts });
    if (!bannerBusy) nextBanner();
    try { navigator.vibrate && navigator.vibrate(opts.money ? [80, 50, 80] : 60); } catch (e) { /* 무시 */ }
  }
  function nextBanner() {
    const b = bannerQ.shift(); const el = $('#banner');
    if (!b) { bannerBusy = false; return; }
    bannerBusy = true;
    el.className = 'banner' + (b.money ? ' money' : '');
    el.innerHTML = `<span class="app-ic">${b.money ? UI.won.replace('<svg', '<svg style="width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2"') : '같이'}</span>
      <span class="t"><small>같이타 · 지금</small><strong>${esc(b.title)}</strong>${b.body ? `<span>${esc(b.body)}</span>` : ''}</span>`;
    el.onclick = () => { if (b.go) navigate(b.go); hide(); };
    requestAnimationFrame(() => el.classList.add('show'));
    let done = false;
    const hide = () => { if (done) return; done = true; el.classList.remove('show'); setTimeout(nextBanner, 380); };
    setTimeout(hide, 3200);
  }
  function openSheet(html, onMount) {
    const sh = $('#sheet'), bd = $('#sheet-backdrop');
    sh.innerHTML = `<div class="sheet-grip"></div>${html}`;
    sh.hidden = false; bd.hidden = false;
    requestAnimationFrame(() => { sh.classList.add('open'); bd.classList.add('open'); });
    $$('[data-close]', sh).forEach(b => b.addEventListener('click', closeSheet));
    sheetCleanup = null;
    onMount && onMount(sh);
  }
  let sheetCleanup = null;
  function closeSheet() {
    const sh = $('#sheet'), bd = $('#sheet-backdrop');
    if (sheetCleanup) { try { sheetCleanup(); } catch (e) { /* 무시 */ } sheetCleanup = null; }
    sh.classList.remove('open'); bd.classList.remove('open');
    setTimeout(() => { if (!sh.classList.contains('open')) { sh.hidden = true; bd.hidden = true; } }, 220);
  }
  function confirmSheet({ title, text, ok = '확인', cancel = '취소', danger = false }) {
    return new Promise(res => {
      let answered = false;
      openSheet(`<h3>${esc(title)}</h3>${text ? `<p class="sheet-text">${text}</p>` : ''}
        <div class="sheet-actions"><button class="btn btn-ghost" data-no>${esc(cancel)}</button><button class="btn ${danger ? 'btn-red' : 'btn-navy'}" data-yes>${esc(ok)}</button></div>`,
      sh => {
        $('[data-no]', sh).onclick = () => { answered = true; closeSheet(); res(false); };
        $('[data-yes]', sh).onclick = () => { answered = true; closeSheet(); res(true); };
        sheetCleanup = () => { if (!answered) res(false); };
      });
    });
  }
  const header = (title, right = '') => `<header class="bar"><button class="bar-back" data-back aria-label="뒤로">${UI.back}</button><h1>${esc(title)}</h1>${right}</header>`;

  function qrSvg(text) {
    if (!window.qrcode) return '<p class="muted" style="padding:80px 10px;text-align:center">QR 라이브러리를 불러오지 못했어요. 아래 코드를 대신 쓰세요.</p>';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* 무시 */ }
      a.remove(); return ok;
    }
  }

  /* ---------- 지도 (작은 지도) ---------- */
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  function miniMap(box, center, zoom = 14) {
    const el = $('.map', box);
    if (!window.maplibregl) { $('.map-fallback', box).hidden = false; return null; }
    try {
      const m = new maplibregl.Map({ container: el, style: MAP_STYLE, center: [center.lng, center.lat], zoom, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
      m.on('error', e => console.warn('[map]', e && e.error && e.error.message));
      return m;
    } catch (e) { $('.map-fallback', box).hidden = false; return null; }
  }
  const mapBox = (h = 190) => `<div class="map-box" style="height:${h}px"><div class="map"></div><div class="map-fallback" hidden>지도를 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.</div></div>`;
  function markerEl(cls, text = '') { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; }
  function fitTo(map, pts, pad0 = 50) {
    if (!map || !pts.length) return;
    if (pts.length === 1) { map.jumpTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 }); return; }
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: pad0, maxZoom: 16, duration: 0 });
  }

  /* =========================================================
     통학버스용 시계 (실제 시각 / 원하는 시각, 배속)
     ========================================================= */
  const CLOCK_PRESETS = { real: null, morning: [7, 38], noon: [12, 8], evening: [17, 8] };
  const CLOCK_LABEL = { real: '실제 시각', morning: '등교 07:38', noon: '점심 12:08', evening: '하교 17:08' };
  let clock = null;
  function setClock(mode, speed, { keep = false, persist = true } = {}) {
    const real = Date.now();
    let virt;
    if (keep && clock) virt = now().getTime();
    else if (mode === 'real') virt = real;
    else { const d = new Date(real); d.setHours(CLOCK_PRESETS[mode][0], CLOCK_PRESETS[mode][1], 0, 0); virt = d.getTime(); }
    clock = { real, virt, mode, speed };
    if (persist) store.set('clock', { mode, speed });
  }
  function now() { return new Date(clock.virt + (Date.now() - clock.real) * clock.speed); }
  const secOfDay = (d = now()) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;

  /* =========================================================
     상태
     ========================================================= */
  const S = { uid: null, me: null, rides: [], myRides: [], loaded: false };
  const isDriverOf = r => r && r.driverUid === S.uid;
  const isMemberOf = r => r && (r.members || []).includes(S.uid);
  const isIn = r => isDriverOf(r) || isMemberOf(r);
  const dongValid = me => !!(me && me.dong && Date.now() - me.dong.verifiedAt < DONG_VALID_DAYS * DAY);
  const ACTIVE = ['open', 'full', 'riding', 'arrived'];
  const STATUS = { open: '모집 중', full: '모집 완료', riding: '운행 중', arrived: '도착', done: '완료', canceled: '취소됨' };
  const findRide = id => S.myRides.find(r => r.id === id) || S.rides.find(r => r.id === id) || null;

  /* ---------- 사람 정보 / 매너온도 ---------- */
  const userCache = new Map();
  function getUserCached(uid) {
    if (!userCache.has(uid)) userCache.set(uid, B.getUser(uid).catch(() => null));
    return userCache.get(uid);
  }
  function calcTemp(list, raters) {
    const byFrom = new Map();
    list.slice().sort((a, b) => a.at - b.at).forEach(r => { if (!byFrom.has(r.from)) byFrom.set(r.from, []); byFrom.get(r.from).push(r); });
    let total = 0, good = 0, bad = 0, normal = 0; const tags = {};
    for (const [from, rs] of byFrom) {
      const kept = [];
      for (const r of rs) {
        const last = kept[kept.length - 1];
        if (last && r.at - last.at < MANNER.perPairDays * DAY) kept[kept.length - 1] = r; else kept.push(r);
      }
      const rater = raters[from];
      let sum = 0;
      for (const r of kept) {
        const w = rater && r.at - rater.createdAt < MANNER.newbieDays * DAY ? 0.5 : 1;
        sum += (r.score > 0 ? MANNER.good : r.score < 0 ? MANNER.bad : 0) * w;
      }
      total += clamp(sum, -MANNER.perPairCap, MANNER.perPairCap);
    }
    list.forEach(r => { r.score > 0 ? good++ : r.score < 0 ? bad++ : normal++; (r.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; }); });
    return { temp: clamp(Math.round((MANNER.base + total) * 10) / 10, 0, 99), count: list.length, good, bad, normal, tags };
  }
  const temps = new Map();
  function tempInfo(uid) {
    let t = temps.get(uid);
    if (!t) {
      t = { value: null };
      temps.set(uid, t);
      t.unsub = B.watchRatingsFor(uid, async list => {
        const raters = {};
        for (const f of new Set(list.map(r => r.from))) raters[f] = await getUserCached(f);
        t.value = calcTemp(list, raters);
        refreshTemps(uid);
      });
    }
    return t.value;
  }
  const tempCls = v => (v < 36 ? 't0' : v < 37 ? 't1' : v < 40 ? 't2' : 't3');
  function tempText(uid) { const v = tempInfo(uid); const t = v ? v.temp : MANNER.base; return { t, html: `<i></i>${t.toFixed(1)}°C` }; }
  function tempHTML(uid) { const { t, html } = tempText(uid); return `<span class="temp ${tempCls(t)}" data-temp="${esc(uid)}">${html}</span>`; }
  function refreshTemps(uid) {
    $$(`[data-temp="${CSS.escape(uid)}"]`).forEach(el => { const { t, html } = tempText(uid); el.className = 'temp ' + tempCls(t); el.innerHTML = html; });
    if (current && current.onTemp) current.onTemp(uid);
  }

  /* =========================================================
     로그인 / 회원가입
     ========================================================= */
  const Auth = {
    name: 'auth', noTab: true, mode: 'login',
    render() {
      const login = this.mode === 'login';
      return `
        <section class="auth-hero">
          <p class="logo">같이타<span>.</span></p>
          <p>군산대 학생끼리 함께 타는 카풀 · 통학버스</p>
        </section>
        <section class="auth-card">
          <div class="segs"><button class="seg ${login ? 'on' : ''}" data-mode="login">로그인</button><button class="seg ${!login ? 'on' : ''}" data-mode="signup">회원가입</button></div>
          <form data-form novalidate>
            <label class="field"><span>학번</span><input class="input" name="sid" inputmode="numeric" autocomplete="username" placeholder="예) 202412345" maxlength="10"></label>
            ${login ? '' : `
            <label class="field"><span>이름</span><input class="input" name="name" autocomplete="name" placeholder="홍길동" maxlength="10"></label>
            <label class="field"><span>학과</span><input class="input" name="dept" placeholder="예) 컴퓨터정보공학과" maxlength="20"></label>`}
            <label class="field"><span>비밀번호 ${login ? '' : '<small>6자 이상</small>'}</span><input class="input" name="pw" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="비밀번호"></label>
            ${login ? '' : `
            <label class="field"><span>비밀번호 확인</span><input class="input" name="pw2" type="password" autocomplete="new-password" placeholder="한 번 더"></label>
            <label class="check"><input type="checkbox" name="agree"><span>이름·학과·동네는 카풀 상대에게 보이고, 위치는 카풀 중 내가 켰을 때만 같은 카풀 사람에게 보인다는 데 동의해요.</span></label>`}
            <p class="hint bad" data-err hidden></p>
            <button class="btn btn-navy" data-submit>${login ? '로그인' : '가입하고 시작하기'}</button>
          </form>
        </section>
        <p class="auth-foot">학생이 만든 프로토타입이에요. 학교 학사 시스템과 연결되지 않아 학번은 본인이 입력한 대로 저장돼요.<br>${B.mode === 'local' ? '지금은 데모 모드라 이 브라우저에만 저장돼요.' : '계정은 Firebase에 안전하게 저장돼요.'}</p>`;
    },
    mount(root) {
      $$('[data-mode]', root).forEach(b => b.onclick = () => { this.mode = b.dataset.mode; rerender(); });
      const f = $('[data-form]', root), errEl = $('[data-err]', root);
      const fail = m => { errEl.textContent = m; errEl.hidden = false; };
      f.addEventListener('submit', async e => {
        e.preventDefault(); errEl.hidden = true;
        const v = Object.fromEntries(new FormData(f)); v.sid = (v.sid || '').trim();
        if (!/^\d{8,10}$/.test(v.sid)) return fail('학번은 숫자 8~10자리로 입력해 주세요.');
        if (!v.pw) return fail('비밀번호를 입력해 주세요.');
        const btn = $('[data-submit]', root); btn.disabled = true;
        try {
          if (this.mode === 'login') {
            await B.signIn(v.sid, v.pw);
            toast('다시 만나서 반가워요');
          } else {
            v.name = (v.name || '').trim(); v.dept = (v.dept || '').trim();
            if (v.name.length < 2) throw { message: '이름을 2자 이상 입력해 주세요.' };
            if (!v.dept) throw { message: '학과를 입력해 주세요.' };
            if (v.pw.length < 6) throw { message: '비밀번호는 6자 이상이어야 해요.' };
            if (v.pw !== v.pw2) throw { message: '비밀번호 확인이 달라요.' };
            if (!v.agree) throw { message: '안내에 동의해야 가입할 수 있어요.' };
            pendingRoute = 'verify';
            try { await B.signUp({ sid: v.sid, pw: v.pw, name: v.name, dept: v.dept }); }
            catch (x2) { pendingRoute = null; throw x2; }
            banner('가입을 환영해요!', '먼저 동네 인증을 해 주세요');
          }
        } catch (x) { fail(errMsg(x)); btn.disabled = false; }
      });
    },
  };

  /* =========================================================
     홈
     ========================================================= */
  const Home = {
    name: 'home',
    render() {
      const me = S.me || {};
      const near = nearbyRides(3).filter(r => r.status === 'open').length;
      const act = S.myRides.filter(r => ACTIVE.includes(r.status)).sort((a, b) => a.departAt - b.departAt);
      return `
        <section class="home-hero">
          <svg class="hero-wave" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 120 C 90 70, 170 160, 260 110 S 400 80, 400 80 V0 H0z" fill="rgba(255,255,255,.06)"/>
            <path d="M0 150 C 110 100, 200 190, 300 130 S 400 120, 400 120 V0 H0z" fill="rgba(255,255,255,.05)"/>
          </svg>
          <div class="wordmark"><span class="wm-en">KSNU</span><span class="wm-ko">같이타<small>RIDE TOGETHER · PROTOTYPE</small></span></div>
          <span class="demo-badge">${B.mode === 'local' ? '데모 모드 · 이 브라우저에만 저장' : '프로토타입'}</span>
        </section>
        <section class="profile-card">
          <div class="avatar">${initial(me.name)}</div>
          <p class="profile-name">${esc(me.name || '')} 님</p>
          <p class="profile-dept">${esc(me.dept || '')} · ${esc(me.sid || '')}</p>
          <div class="profile-tags">
            ${dongValid(me) ? `<span class="chip chip-navy">${esc(me.dong.name)} 인증</span>` : '<button class="chip chip-red" data-go="verify">동네 인증 필요</button>'}
            ${me.driver ? '<span class="chip">운전자</span>' : ''}
            ${S.uid ? tempHTML(S.uid) : ''}
          </div>
          <div class="home-tiles">
            <button class="tile orange" data-go="carpool">${icon('car')}<strong>카풀</strong><small>${dongValid(me) ? `내 주변 3km 모집 중 ${near}건` : '동네 인증 후 이용'}</small></button>
            <button class="tile" data-go="bus">${icon('shuttle')}<strong>통학버스</strong><small data-home-bus>지도에서 버스 위치 보기</small></button>
          </div>
        </section>
        ${act.length ? `<section class="home-sec"><h2>진행 중인 내 카풀</h2><div class="ride-list">${act.map(rideCard).join('')}</div></section>` : ''}
        <section class="home-sec"><h2>다음 통학버스 <button data-go="bus">지도 ›</button></h2><div class="card" data-home-next></div></section>
        <section class="home-sec"><h2>알림</h2><div class="notice-row">${NOTICES.map((n, i) => `
          <button class="notice" data-notice="${i}"><span class="notice-tag">${esc(n.tag)}</span><strong>${esc(n.title)}</strong><span class="notice-body">${esc(n.body)}</span></button>`).join('')}</div></section>`;
    },
    mount(root) {
      bindRideCards(root);
      $$('[data-notice]', root).forEach(b => b.onclick = () => {
        const n = NOTICES[+b.dataset.notice];
        openSheet(`<p class="sheet-eyebrow">${esc(n.tag)}</p><h3>${esc(n.title)}</h3><p class="sheet-text">${esc(n.body)}</p><button class="btn btn-navy" data-close>확인</button>`);
      });
    },
    update(root) {
      const el = $('[data-home-next]', root); if (!el) return;
      const list = BusLogic.summary(secOfDay());
      const best = list.filter(x => x.remain != null).sort((a, b) => a.remain - b.remain)[0];
      const html = best ? `<button class="mini-bus" data-go="bus"><span class="no" style="background:${best.route.color}">${esc(best.route.name.slice(0, 2))}</span>
          <span class="t"><strong>${esc(best.route.name)} · ${esc(best.label)}</strong><small>${esc(best.stop)} ${best.running ? '도착 예정' : '출발 예정'}</small></span>
          <span class="m">${best.remain < 60 ? '곧' : Math.ceil(best.remain / 60)}<small>${best.remain < 60 ? '' : '분'}</small></span></button>`
        : '<p class="muted" style="font-size:14px">오늘 남은 통학버스가 없어요.</p>';
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; $$('[data-go]', el).forEach(b => b.onclick = () => navigate(b.dataset.go)); }
      const hb = $('[data-home-bus]', root);
      if (hb) hb.textContent = best ? `${best.route.name} ${best.remain < 60 ? '곧' : Math.ceil(best.remain / 60) + '분 뒤'} · 3D 지도` : '지도에서 버스 위치 보기';
    },
  };

  /* =========================================================
     카풀 목록
     ========================================================= */
  function myPoint() { const d = S.me && S.me.dong; return d ? { lat: d.lat, lng: d.lng } : null; }
  function nearbyRides(range) {
    const p = myPoint(); if (!p) return [];
    const t = Date.now() - 30 * 60000;
    return S.rides.filter(r => ['open', 'full'].includes(r.status) && r.departAt > t)
      .map(r => ({ ...r, _km: kmBetween(p, r.from) }))
      .filter(r => range === 'all' || r._km <= range)
      .sort((a, b) => a.departAt - b.departAt);
  }
  function rideCard(r) {
    const w = fmtWhen(r.departAt);
    const left = r.seats - (r.members || []).length;
    const mine = isIn(r);
    const st = mine ? `<span class="chip ${r.status === 'done' ? 'chip-gray' : 'chip-green'}">${isDriverOf(r) ? '내가 운전' : '신청함'} · ${STATUS[r.status]}</span>`
      : r.status === 'full' || left <= 0 ? '<span class="chip chip-gray">마감</span>' : `<span class="chip">잔여 ${left}석</span>`;
    return `
      <button class="ride-card ${mine ? 'mine' : ''}" data-ride="${esc(r.id)}">
        <span class="ride-time"><b>${w.time}</b><small>${w.day}</small></span>
        <span class="ride-info">
          <strong>${esc(r.from.label)}<br>→ ${esc(r.to.label)}</strong>
          <span class="meta">${esc(r.driverName)} ${tempHTML(r.driverUid)}${r._km != null ? ` · 나와 ${fmtKm(r._km)}` : ''}</span>
          <span class="tags">${st}<span class="chip chip-navy">${r.distanceKm}km</span></span>
        </span>
        <span class="ride-fare"><b>${won(r.fare)}</b><small>1인 편도</small></span>
      </button>`;
  }
  function bindRideCards(root) {
    $$('[data-ride]', root).forEach(b => b.onclick = () => {
      const r = findRide(b.dataset.ride);
      navigate((r && isIn(r) ? 'room/' : 'ride/') + b.dataset.ride);
    });
  }

  const Carpool = {
    name: 'carpool', title: '카풀', tab: 'near',
    render() {
      const me = S.me || {};
      const range = store.get('range', 3);
      const mineCount = S.myRides.filter(r => ACTIVE.includes(r.status)).length;
      const tabs = `<div class="segs"><button class="seg ${this.tab === 'near' ? 'on' : ''}" data-tab="near">내 주변 카풀</button><button class="seg ${this.tab === 'mine' ? 'on' : ''}" data-tab="mine">내 카풀 ${mineCount ? `<span class="chip">${mineCount}</span>` : ''}</button></div>`;
      let body;
      if (this.tab === 'mine') {
        const list = S.myRides.slice().sort((a, b) => (ACTIVE.includes(b.status) - ACTIVE.includes(a.status)) || (b.departAt - a.departAt));
        body = list.length ? `<div class="ride-list">${list.map(rideCard).join('')}</div>` : '<p class="empty">아직 함께 탄 카풀이 없어요.</p>';
      } else if (!dongValid(me)) {
        body = `<div class="card" style="text-align:center"><h3 style="font-size:17px;margin-bottom:6px">동네 인증이 필요해요</h3><p class="muted" style="font-size:14px;line-height:1.6;margin-bottom:14px">${me.dong ? '동네 인증 기간(30일)이 지났어요. ' : ''}지금 있는 동네를 인증하면<br>가까운 거리의 카풀만 보여 드려요.</p><button class="btn btn-orange" data-go="verify">동네 인증하기</button></div>`;
      } else {
        const list = nearbyRides(range);
        body = `
          <div class="dong-bar"><strong>${esc(me.dong.name)}</strong><span class="muted" style="font-size:14px">근처</span><span class="spacer"></span><button class="link" data-go="verify" style="font-size:13px">동네 다시 인증</button></div>
          <div class="segs small">${[1, 3, 5, 'all'].map(v => `<button class="seg ${range === v ? 'on' : ''}" data-range="${v}">${v === 'all' ? '전체' : v + 'km'}</button>`).join('')}</div>
          ${list.length ? `<div class="ride-list">${list.map(rideCard).join('')}</div>` : `<p class="empty">${range === 'all' ? '지금 모집 중인 카풀이 없어요.' : `${range}km 안에 모집 중인 카풀이 없어요.<br>범위를 넓혀 보세요.`}</p>`}`;
      }
      const fab = me.driver ? `<button class="fab" data-go="create">${UI.plus}카풀 올리기</button>` : `<button class="fab" data-go="driver">${UI.plus}운전자 등록</button>`;
      return `${tabs}${body}${fab}`;
    },
    mount(root) {
      $$('[data-tab]', root).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; rerender(); });
      $$('[data-range]', root).forEach(b => b.onclick = () => { store.set('range', b.dataset.range === 'all' ? 'all' : +b.dataset.range); rerender(); });
      bindRideCards(root);
    },
    onData() { rerender(); },
  };

  /* =========================================================
     동네 인증
     ========================================================= */
  const Verify = {
    name: 'verify', title: '동네 인증', result: null, busy: false, errText: '',
    render() {
      const me = S.me || {};
      const cur = me.dong;
      const r = this.result;
      return `
        <div class="card">
          <p class="sheet-eyebrow">내 동네</p>
          <h3 style="font-size:22px;font-weight:900">${cur ? esc(cur.name) : '아직 인증 전'}</h3>
          <p class="muted" style="font-size:13.5px;margin-top:4px">${cur ? `${new Date(cur.verifiedAt).toLocaleDateString('ko-KR')} 인증 · ${dongValid(me) ? `${Math.max(0, Math.ceil(DONG_VALID_DAYS - (Date.now() - cur.verifiedAt) / DAY))}일 남음` : '기간 만료'}${cur.by === 'manual' ? ' · 테스트용 직접 선택' : ''}` : '지금 있는 곳의 위치로 동네를 인증해요.'}</p>
        </div>
        <div class="card">
          ${r ? `
            <p class="sheet-eyebrow">현재 위치</p>
            <h3 style="font-size:20px;font-weight:900">${r.ok ? `${esc(r.dong.name)}에 있어요` : '군산 밖이거나 동네를 찾지 못했어요'}</h3>
            <p class="muted" style="font-size:13.5px;margin:6px 0 14px">${r.ok ? `${esc(r.dong.name)} 중심에서 ${fmtKm(r.dong.km)}${r.pos.fake ? ' · 테스트용 위치' : ''}` : `가장 가까운 ${esc(r.dong.name)}까지 ${fmtKm(r.dong.km)}예요. 카풀은 군산 안에서만 인증할 수 있어요.`}</p>
            ${r.ok ? `<button class="btn btn-orange" data-confirm>${esc(r.dong.name)}로 인증하기</button>` : ''}
          ` : `
            <p style="font-size:14.5px;line-height:1.65">당근마켓처럼 <b>지금 그 동네에 있어야</b> 인증돼요. 인증하면 내 동네 근처 카풀만 보이고, 30일 동안 유지돼요.</p>
          `}
          <p class="hint bad" ${this.errText ? '' : 'hidden'}>${esc(this.errText)}</p>
          <button class="btn ${r && r.ok ? 'btn-ghost' : 'btn-navy'}" data-gps style="margin-top:10px" ${this.busy ? 'disabled' : ''}>${UI.pin}${this.busy ? '위치 찾는 중...' : r ? '위치 다시 찾기' : '현재 위치로 동네 찾기'}</button>
        </div>
        <details class="card" style="margin-top:12px">
          <summary style="font-weight:800;font-size:14px;cursor:pointer">GPS가 안 될 때 (테스트용)</summary>
          <p class="hint" style="margin:8px 0 10px">PC나 군산 밖에서 시연할 때만 쓰세요. 직접 고른 동네는 '테스트용'으로 표시돼요.</p>
          <div class="chips">${DONGS.map(d => `<button class="chip-btn" data-manual="${esc(d.name)}">${esc(d.name)}</button>`).join('')}</div>
        </details>`;
    },
    mount(root) {
      $('[data-gps]', root).onclick = async () => {
        this.busy = true; this.errText = ''; rerender();
        try {
          const pos = await getPos();
          const d = nearestDong(pos);
          this.result = { ok: d.km <= DONG_MAX_KM, dong: d, pos };
        } catch (e) { this.errText = e.message; }
        this.busy = false; rerender();
      };
      const c = $('[data-confirm]', root);
      if (c) c.onclick = async () => {
        const r = this.result;
        await B.updateMe({ dong: { name: r.dong.name, lat: r.pos.lat, lng: r.pos.lng, verifiedAt: Date.now(), by: r.pos.fake ? 'manual' : 'gps' } });
        banner('동네 인증 완료', `${r.dong.name} 근처 카풀을 보여 드릴게요`);
        this.result = null; navigate('carpool');
      };
      $$('[data-manual]', root).forEach(b => b.onclick = async () => {
        const d = DONGS.find(x => x.name === b.dataset.manual);
        await B.updateMe({ dong: { name: d.name, lat: d.lat, lng: d.lng, verifiedAt: Date.now(), by: 'manual' } });
        toast(`${d.name}(테스트용)으로 설정했어요`);
        this.result = null; navigate('carpool');
      });
    },
    onData() { },
    leave() { this.result = null; this.errText = ''; },
  };

  /* =========================================================
     운전자 등록
     ========================================================= */
  const BANKS = ['카카오뱅크', '토스뱅크', 'KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '전북은행', '새마을금고', '우체국'];
  const Driver = {
    name: 'driver', title: '운전자 등록',
    render() {
      const d = (S.me && S.me.driver) || {};
      return `
        <p class="muted" style="font-size:14px;line-height:1.6;margin:2px 2px 14px">차량 정보는 신청한 탑승자에게, 계좌는 <b>함께 탄 사람이 정산할 때만</b> 보여요.</p>
        <form data-form novalidate>
          <div class="card">
            <label class="field"><span>차량 번호</span><input class="input" name="carNo" value="${esc(d.carNo || '')}" placeholder="예) 12가 3456" maxlength="12"></label>
            <div class="inline">
              <label class="field"><span>차종</span><input class="input" name="carModel" value="${esc(d.carModel || '')}" placeholder="아반떼" maxlength="12"></label>
              <label class="field"><span>색상</span><input class="input" name="carColor" value="${esc(d.carColor || '')}" placeholder="흰색" maxlength="8"></label>
            </div>
          </div>
          <div class="card">
            <label class="field"><span>은행</span><select class="input" name="bank">${BANKS.map(b => `<option>${b}</option>`).join('')}</select></label>
            <label class="field"><span>계좌번호</span><input class="input" name="account" inputmode="numeric" placeholder="숫자와 - 만" maxlength="20"></label>
            <label class="field"><span>예금주</span><input class="input" name="holder" value="${esc((S.me && S.me.name) || '')}" maxlength="10"></label>
            <label class="check"><input type="checkbox" name="ok"><span>운전면허가 있고, 차량 보험에 가입되어 있어요. 카풀 중 사고 책임은 운전자와 탑승자 사이에 있다는 걸 알아요.</span></label>
          </div>
          <p class="hint bad" data-err hidden></p>
          <div class="sticky-cta"><button class="btn btn-orange">${d.carNo ? '운전자 정보 저장' : '운전자로 등록하기'}</button></div>
        </form>`;
    },
    async mount(root) {
      const f = $('[data-form]', root);
      try {
        const s = await B.getDriverSecret();
        if (s) { f.bank.value = s.bank; f.account.value = s.account; f.holder.value = s.holder; }
      } catch (e) { /* 무시 */ }
      f.onsubmit = async e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f));
        const err = $('[data-err]', root), fail = m => { err.textContent = m; err.hidden = false; };
        v.carNo = v.carNo.replace(/\s+/g, ' ').trim();
        if (!/^\d{2,3}\s?[가-힣]\s?\d{4}$/.test(v.carNo)) return fail('차량 번호를 "12가 3456" 형식으로 입력해 주세요.');
        if (!v.carModel.trim()) return fail('차종을 입력해 주세요.');
        if (!/^[\d-]{8,20}$/.test(v.account)) return fail('계좌번호를 숫자로 입력해 주세요.');
        if (!v.holder.trim()) return fail('예금주를 입력해 주세요.');
        if (!v.ok) return fail('면허·보험 확인에 체크해 주세요.');
        await B.setDriverSecret({ bank: v.bank, account: v.account, holder: v.holder.trim() });
        await B.updateMe({ driver: { carNo: v.carNo, carModel: v.carModel.trim(), carColor: v.carColor.trim(), registeredAt: Date.now() } });
        banner('운전자 등록 완료', '이제 카풀을 올릴 수 있어요');
        navigate('create', true);
      };
    },
    onData() { },
  };

  /* =========================================================
     카풀 올리기
     ========================================================= */
  const Create = {
    name: 'create', title: '카풀 올리기',
    f: null,
    defaults() {
      const d = S.me && S.me.dong;
      const t = new Date(Date.now() + 60 * 60000); t.setMinutes(Math.ceil(t.getMinutes() / 10) * 10, 0, 0);
      return {
        from: d ? { label: `${d.name} 근처`, lat: d.lat, lng: d.lng } : null,
        to: PLACES[0], day: t.getDate() === new Date().getDate() ? 0 : 1, time: hm(t.getTime()),
        seats: 3, distance: null, fare: null, fareTouched: false, distTouched: false, deposit: FARE.defaultDeposit, memo: '',
      };
    },
    calc() {
      const f = this.f;
      if (!f.distTouched && f.from && f.to) f.distance = Math.max(0.5, Math.round(kmBetween(f.from, f.to) * FARE.roadFactor * 10) / 10);
      if (!f.distance) f.distance = 1;
      const sug = Math.max(FARE.minFare, ceil100(f.distance * FARE.fuelPerKm / (f.seats + 1)));
      if (!f.fareTouched) f.fare = sug;
      f.sug = sug;
    },
    render() {
      if (!this.f) this.f = this.defaults();
      this.calc();
      const f = this.f;
      const toOpts = [...PLACES.map(p => ({ ...p, k: 'p:' + p.label })), ...DONGS.map(d => ({ label: d.name, lat: d.lat, lng: d.lng, k: 'd:' + d.name }))];
      return `
        <form data-form novalidate>
          <div class="card">
            <label class="field"><span>출발 <small>탑승자는 이 근처에서 모여요</small></span><input class="input" name="fromLabel" value="${esc(f.from ? f.from.label : '')}" placeholder="예) 나운동 롯데마트 앞" maxlength="24"></label>
            <button type="button" class="btn btn-ghost btn-sm" data-here>${UI.pin}현재 위치를 출발지로</button>
            <p class="hint" data-from-hint>${f.from ? `${esc(nearestDong(f.from).name)} · 좌표가 잡혀 있어요` : '출발 위치가 필요해요'}</p>
            <label class="field" style="margin-top:14px"><span>도착</span>
              <select class="input" name="to">${toOpts.map(o => `<option value="${esc(o.k)}" ${f.to && f.to.label === o.label ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
            <div class="inline">
              <label class="field"><span>날짜</span><select class="input" name="day"><option value="0" ${f.day === 0 ? 'selected' : ''}>오늘</option><option value="1" ${f.day === 1 ? 'selected' : ''}>내일</option></select></label>
              <label class="field"><span>출발 시간</span><input class="input" type="time" name="time" value="${f.time}"></label>
            </div>
            <div class="field"><span>태울 수 있는 자리</span><div class="stepper"><button type="button" data-seat="-1">−</button><b>${f.seats}</b><button type="button" data-seat="1">+</button><span class="muted" style="font-size:13px">명</span></div></div>
          </div>
          <div class="card">
            <label class="field"><span>운전 거리 <small>편도, 직접 고칠 수 있어요</small></span><input class="input" name="distance" type="number" step="0.1" min="0.5" max="200" value="${f.distance}"></label>
            <label class="field"><span>1인 편도 금액</span><input class="input" name="fare" type="number" step="100" min="0" value="${f.fare}"></label>
            <p class="hint">추천 ${won(f.sug)} · 편도 ${f.distance}km × 기름값 ${FARE.fuelPerKm}원/km ÷ ${f.seats + 1}명(운전자 포함), 최소 ${won(FARE.minFare)}</p>
            <div class="field" style="margin-top:14px"><span>예약금 <small>요금에 포함, 노쇼 대비</small></span>
              <div class="segs small">${[500, 1000, 1500].map(v => `<button type="button" class="seg ${f.deposit === v ? 'on' : ''}" data-dep="${v}">${won(v)}</button>`).join('')}</div>
              <p class="hint">신청할 때 예약금을 먼저 보내고, 도착하면 나머지 ${won(Math.max(0, f.fare - f.deposit))}을 보내요. 출발 ${FARE.cancelFreeMin}분 전까지 취소하면 돌려받아요.</p></div>
            <label class="field"><span>한마디 <small>선택</small></span><input class="input" name="memo" value="${esc(f.memo)}" placeholder="예) 트렁크 짐 가능, 조용히 가요" maxlength="40"></label>
          </div>
          <p class="hint bad" data-err hidden></p>
          <div class="sticky-cta"><button class="btn btn-orange">카풀 올리기</button></div>
        </form>`;
    },
    mount(root) {
      if (!S.me || !S.me.driver) { navigate('driver', true); return; }
      const form = $('[data-form]', root), f = this.f;
      const sync = () => {
        f.memo = form.memo.value; f.time = form.time.value; f.day = +form.day.value;
        if (f.from) f.from.label = form.fromLabel.value.trim() || f.from.label;
      };
      form.addEventListener('input', e => {
        sync();
        if (e.target.name === 'distance') { f.distTouched = true; f.distance = Math.max(0.5, +e.target.value || 0.5); if (!f.fareTouched) { this.calc(); form.fare.value = f.fare; } }
        if (e.target.name === 'fare') { f.fareTouched = true; f.fare = Math.max(0, +e.target.value || 0); }
      });
      form.to.onchange = () => {
        sync();
        const [k, n] = form.to.value.split(/:(.+)/);
        const o = k === 'p' ? PLACES.find(p => p.label === n) : DONGS.find(d => d.name === n);
        f.to = { label: o.label || o.name, lat: o.lat, lng: o.lng }; f.distTouched = false; rerender();
      };
      $$('[data-seat]', root).forEach(b => b.onclick = () => { sync(); f.seats = clamp(f.seats + +b.dataset.seat, 1, 4); rerender(); });
      $$('[data-dep]', root).forEach(b => b.onclick = () => { sync(); f.deposit = +b.dataset.dep; rerender(); });
      $('[data-here]', root).onclick = async () => {
        sync();
        try { const p = await getPos(); f.from = { label: `${nearestDong(p).name} 근처`, lat: p.lat, lng: p.lng }; f.distTouched = false; rerender(); toast('현재 위치로 잡았어요'); }
        catch (e) { toast(e.message, 'bad'); }
      };
      form.onsubmit = async e => {
        e.preventDefault(); sync();
        const err = $('[data-err]', root), fail = m => { err.textContent = m; err.hidden = false; };
        if (!f.from) return fail('출발 위치를 잡아 주세요.');
        const [H, M] = (f.time || '').split(':').map(Number);
        if (isNaN(H)) return fail('출발 시간을 골라 주세요.');
        const d = new Date(); d.setDate(d.getDate() + f.day); d.setHours(H, M, 0, 0);
        if (d.getTime() < Date.now() - 5 * 60000) return fail('지난 시간이에요. 날짜나 시간을 바꿔 주세요.');
        if (f.fare <= f.deposit) return fail('1인 금액은 예약금보다 커야 해요.');
        let secret;
        try { secret = await B.getDriverSecret(); } catch (x) { secret = null; }
        if (!secret) { navigate('driver'); return; }
        const me = S.me;
        try {
          const id = await B.createRide({
            driverName: me.name, driverDept: me.dept, carNo: me.driver.carNo, carModel: me.driver.carModel, carColor: me.driver.carColor,
            dong: me.dong ? me.dong.name : nearestDong(f.from).name,
            from: { label: f.from.label, lat: f.from.lat, lng: f.from.lng }, to: { label: f.to.label, lat: f.to.lat, lng: f.to.lng },
            departAt: d.getTime(), seats: f.seats, distanceKm: f.distance, fare: f.fare, deposit: f.deposit, memo: f.memo.trim(), pickup: null, noShow: [],
          }, secret);
          await B.sendMessage(id, { type: 'system', text: `카풀이 열렸어요. ${fmtWhen(d.getTime()).day} ${hm(d.getTime())} 출발 · ${f.seats}자리 모집 중` });
          this.f = null;
          banner('카풀을 올렸어요', `${f.from.label} → ${f.to.label}`);
          navigate('room/' + id, true);
        } catch (x) { fail(errMsg(x)); }
      };
    },
    onData() { },
  };

  /* =========================================================
     카풀 상세 (신청 전)
     ========================================================= */
  const Ride = {
    name: 'ride', title: '카풀 정보',
    render(id) {
      const r = findRide(id);
      if (!r) return '<p class="empty">카풀을 찾을 수 없어요.<br>이미 끝났거나 취소됐을 수 있어요.</p>';
      const w = fmtWhen(r.departAt), left = r.seats - r.members.length;
      const p = myPoint();
      const joined = isIn(r);
      let cta;
      if (joined) cta = '<button class="btn btn-navy" data-room>단톡방으로 가기</button>';
      else if (!dongValid(S.me)) cta = '<button class="btn btn-orange" data-go="verify">동네 인증하고 신청하기</button>';
      else if (!['open', 'full'].includes(r.status)) cta = `<button class="btn btn-gray" disabled>${STATUS[r.status]}</button>`;
      else if (left <= 0) cta = '<button class="btn btn-gray" disabled>자리가 다 찼어요</button>';
      else cta = `<button class="btn btn-orange" data-join>카풀 타기 · 예약금 ${won(r.deposit)}</button>`;
      return `
        ${mapBox(180)}
        <div class="card" style="margin-top:12px">
          <div class="row"><span class="chip ${r.status === 'open' ? '' : 'chip-gray'}">${STATUS[r.status]}</span><span class="chip chip-navy">${esc(r.dong)}</span>${p ? `<span class="muted" style="font-size:12.5px">나와 ${fmtKm(kmBetween(p, r.from))}</span>` : ''}</div>
          <div class="route-line"><i></i><strong>${esc(r.from.label)}</strong><span class="v"></span><span></span><i class="end"></i><strong>${esc(r.to.label)}</strong></div>
          <dl class="kv"><dt>출발</dt><dd>${w.day} ${w.time}</dd><dt>자리</dt><dd>${r.members.length}/${r.seats}명 · 잔여 ${Math.max(0, left)}석</dd><dt>운전 거리</dt><dd>편도 약 ${r.distanceKm}km</dd></dl>
          <div class="fare-box"><span>1인 편도 금액</span><b class="total">${won(r.fare)}</b><span class="muted">신청할 때 예약금</span><b>${won(r.deposit)}</b><span class="muted">도착 후 보낼 돈</span><b>${won(r.fare - r.deposit)}</b></div>
          ${r.memo ? `<p style="font-size:14px;margin-top:12px;line-height:1.55">"${esc(r.memo)}"</p>` : ''}
        </div>
        <div class="card">
          <div class="person"><span class="pav">${initial(r.driverName)}</span><span class="t"><strong>${esc(r.driverName)} <small class="muted">${esc(r.driverDept || '')}</small></strong><small>${esc(r.carColor)} ${esc(r.carModel)} · ${joined ? esc(r.carNo) : esc(r.carNo.replace(/\d{4}$/, '****'))}</small></span>${tempHTML(r.driverUid)}</div>
          <p class="hint" style="margin-top:10px">차량 번호 전체는 신청한 뒤에 보여요.</p>
        </div>
        <p class="demo-note">예약금은 시간 약속과 노쇼를 대비해 먼저 보내는 돈이에요. 출발 ${FARE.cancelFreeMin}분 전까지 취소하면 돌려받고, 그 뒤에 취소하거나 나오지 않으면 운전자에게 가요.</p>
        <div class="sticky-cta">${cta}</div>`;
    },
    mount(root, id) {
      const r = findRide(id);
      if (!r) return;
      const box = $('.map-box', root);
      const m = miniMap(box, r.from, 13);
      if (m) m.on('load', () => {
        new maplibregl.Marker({ element: markerEl('map-pin navy') }).setLngLat([r.from.lng, r.from.lat]).addTo(m);
        new maplibregl.Marker({ element: markerEl('map-pin') }).setLngLat([r.to.lng, r.to.lat]).addTo(m);
        m.addSource('l', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[r.from.lng, r.from.lat], [r.to.lng, r.to.lat]] } } });
        m.addLayer({ id: 'l', type: 'line', source: 'l', paint: { 'line-color': '#24318f', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
        fitTo(m, [r.from, r.to], 40);
      });
      this.map = m;
      const room = $('[data-room]', root); if (room) room.onclick = () => navigate('room/' + id, true);
      const j = $('[data-join]', root);
      if (j) j.onclick = () => openSheet(`
        <p class="sheet-eyebrow">카풀 신청</p>
        <h3>예약금 ${won(r.deposit)}을 운전자에게 보낼까요?</h3>
        <p class="sheet-text">${fmtWhen(r.departAt).day} ${hm(r.departAt)} · ${esc(r.from.label)} → ${esc(r.to.label)}<br>예약금은 요금 ${won(r.fare)}에 포함돼요. 신청하면 단톡방에서 어디서 탈지 정해요.<br><small>프로토타입이라 실제 돈은 나가지 않아요.</small></p>
        <div class="sheet-actions"><button class="btn btn-ghost" data-close>다음에</button><button class="btn btn-orange" data-ok>보내고 신청</button></div>`,
      sh => {
        $('[data-ok]', sh).onclick = async () => {
          $('[data-ok]', sh).disabled = true;
          try {
            await B.joinRide(id, S.me.name);
            await B.pay(id, 'deposit', r.deposit, S.me.name);
            const after = r.members.length + 1;
            await B.sendMessage(id, { type: 'system', text: `${S.me.name}님이 들어왔어요 · 예약금 ${won(r.deposit)} 보냄` });
            if (after >= r.seats) await B.sendMessage(id, { type: 'system', text: '모두 모였어요! 어디서 탈지 정해 주세요. + 버튼으로 탑승 장소를 제안할 수 있어요.' });
            closeSheet();
            banner('운전자에게 예약금을 보냈어요!', `${r.driverName}님 · ${won(r.deposit)}`, { money: true });
            navigate('room/' + id, true);
          } catch (e) { closeSheet(); toast(errMsg(e), 'bad'); }
        };
      });
    },
    unmount() { if (this.map) { try { this.map.remove(); } catch (e) { /* 무시 */ } this.map = null; } },
    onData() { if (!$('#sheet').classList.contains('open')) rerender(); },
  };

  /* =========================================================
     단톡방
     ========================================================= */
  const Room = {
    name: 'room', title: '카풀 단톡방',
    render(id) {
      this.id = id;
      const r = findRide(id);
      if (!r) return '<p class="empty">카풀을 불러오는 중이에요...</p>';
      if (!isIn(r)) return '<p class="empty">이 카풀의 단톡방에 들어갈 수 없어요.</p>';
      this.tab = this.tab || 'chat';
      return `
        <section class="card" data-sum></section>
        <div class="room-tabs"><div class="segs small">
          <button class="seg ${this.tab === 'chat' ? 'on' : ''}" data-rtab="chat">대화</button>
          <button class="seg ${this.tab === 'people' ? 'on' : ''}" data-rtab="people">함께 타는 사람</button>
          <button class="seg ${this.tab === 'map' ? 'on' : ''}" data-rtab="map">위치</button></div></div>
        <div data-panel-chat ${this.tab === 'chat' ? '' : 'hidden'}><div class="chat" data-chat></div></div>
        <div data-panel-people ${this.tab === 'people' ? '' : 'hidden'}></div>
        <div data-panel-map ${this.tab === 'map' ? '' : 'hidden'}>
          ${mapBox(300)}
          <div class="card" style="margin-top:12px">
            <div class="share-row"><button class="switch" data-share aria-label="내 위치 공유"></button><span style="flex:1"><b>내 위치 공유</b><br><small class="muted">같은 카풀 사람에게만 보이고, 카풀이 끝나면 자동으로 꺼져요.</small></span></div>
            <p class="hint" data-locinfo></p>
          </div>
        </div>
        <div class="composer" data-composer ${this.tab === 'chat' ? '' : 'hidden'}>
          <button class="plus" data-plus aria-label="더보기">${UI.plus}</button>
          <input data-input placeholder="메시지 보내기" maxlength="300" enterkeyhint="send">
          <button class="send" data-send aria-label="보내기">${UI.send}</button>
        </div>`;
    },
    mount(root, id) {
      const r = findRide(id);
      if (!r || !isIn(r)) return;
      this.root = root; this.mounted = true;
      this.d = { checkins: {}, payments: [], messages: [], locs: {} };
      this.subs = [
        B.watchCheckins(id, v => { const prev = Object.keys(this.d.checkins).length; this.d.checkins = v; this.onCheckins(prev); this.paintSum(); this.paintPeople(); }),
        B.watchPayments(id, v => { this.d.payments = v; this.paintSum(); this.paintPeople(); }),
        B.watchMessages(id, v => { this.d.messages = v; this.paintChat(); markRead(id, v); }),
        B.watchLocs(id, v => { this.d.locs = v; this.paintMap(); this.paintPeople(); }),
      ];
      $$('[data-rtab]', root).forEach(b => b.onclick = () => {
        this.tab = b.dataset.rtab;
        $$('[data-rtab]', root).forEach(x => x.classList.toggle('on', x === b));
        ['chat', 'people', 'map'].forEach(t => { $(`[data-panel-${t}]`, root).hidden = t !== this.tab; });
        $('[data-composer]', root).hidden = this.tab !== 'chat';
        if (this.tab === 'map') this.ensureMap();
        if (this.tab === 'chat') this.scrollBottom(true);
      });
      const input = $('[data-input]', root);
      const send = async () => {
        const t = input.value.trim(); if (!t) return;
        input.value = '';
        try { await B.sendMessage(id, { type: 'text', text: t, name: S.me.name }); } catch (e) { toast(errMsg(e), 'bad'); }
      };
      $('[data-send]', root).onclick = send;
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
      $('[data-plus]', root).onclick = () => this.plusSheet();
      $('[data-share]', root).onclick = () => { LocShare.toggle(id); this.paintShare(); };
      this.paintSum(); this.paintPeople(); this.paintShare();
      if (this.tab === 'map') this.ensureMap();
    },
    unmount() {
      this.mounted = false; this.root = null; this.mapReady = false; this.loadedCi = false; this.codeSynced = false;
      (this.subs || []).forEach(u => u()); this.subs = [];
      if (this.map) { try { this.map.remove(); } catch (e) { /* 무시 */ } this.map = null; }
      this.markers = {};
    },
    leave() { this.tab = null; },
    onData() {
      const r = findRide(this.id);
      if (!r || !isIn(r) || !this.mounted) { if (!$('#sheet').classList.contains('open')) rerender(); return; }
      this.paintSum(); this.paintPeople(); this.paintMap();
    },
    ride() { return findRide(this.id); },
    me() { return S.me; },

    /* ---- 요약 + 행동 버튼 ---- */
    paintSum() {
      const root = this.root, r = this.ride(); if (!root || !r) return;
      const el = $('[data-sum]', root); if (!el) return;
      const w = fmtWhen(r.departAt), drv = isDriverOf(r);
      const order = ['open', 'riding', 'arrived', 'done'];
      const idx = r.status === 'full' ? 0 : order.indexOf(r.status);
      const steps = ['모집', '출발', '도착', '정산 완료'].map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${s}</span>`).join('');
      const ci = this.d.checkins, pays = this.d.payments;
      const myCi = !!ci[S.uid];
      const paidFare = pays.some(p => p.uid === S.uid && p.kind === 'fare');
      let acts = '';
      if (r.status === 'canceled') acts = '<p class="hint bad">운전자가 취소한 카풀이에요.</p>';
      else if (drv) {
        if (['open', 'full'].includes(r.status)) acts = `<div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="boardqr">${UI.qr}탑승 QR</button><button class="btn btn-navy btn-sm" data-act="depart">출발하기</button></div><button class="link" style="font-size:13px;justify-self:center" data-act="cancel">카풀 취소하기</button>`;
        else if (r.status === 'riding') acts = `<div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="boardqr">${UI.qr}탑승 QR</button><button class="btn btn-orange btn-sm" data-act="arrive">도착했어요</button></div>`;
        else if (r.status === 'arrived') {
          const waiting = r.members.filter(u => !pays.some(p => p.uid === u && p.kind === 'fare'));
          acts = `<button class="btn btn-orange" data-act="payqr">${UI.qr}정산 QR 보여주기</button><p class="hint" style="text-align:center">${waiting.length ? `송금 기다리는 중 ${waiting.length}명` : '모두 송금했어요'}</p><button class="btn btn-ghost btn-sm" data-act="finish">카풀 마치기</button>`;
        } else if (r.status === 'done') acts = '<button class="btn btn-navy" data-go="rate/' + esc(r.id) + '">매너 평가하기</button>';
      } else {
        if (['open', 'full', 'riding'].includes(r.status)) {
          acts = myCi ? '<button class="btn btn-green btn-sm" disabled>' + UI.check + '탑승 인증 완료</button>' : `<button class="btn btn-orange" data-act="scanboard">${UI.qr}QR로 탑승 인증</button>`;
          if (r.status !== 'riding' && !myCi) acts += '<button class="link" style="font-size:13px;justify-self:center" data-act="leave">카풀 나가기</button>';
        } else if (r.status === 'arrived') {
          acts = paidFare ? `<button class="btn btn-green" disabled>${UI.check}송금 완료</button>` : `<button class="btn btn-orange" data-act="sendmoney">${UI.won}돈 보내기 · ${won(this.remainFor(r))}</button>`;
        } else if (r.status === 'done') acts = '<button class="btn btn-navy" data-go="rate/' + esc(r.id) + '">매너 평가하기</button>';
      }
      el.innerHTML = `
        <div class="row"><span class="chip ${['done', 'canceled'].includes(r.status) ? 'chip-gray' : 'chip-green'}">${STATUS[r.status]}</span><span class="muted" style="font-size:13px">${w.day} ${w.time} 출발</span><span class="spacer"></span><b style="color:var(--orange-ink)">${won(r.fare)}</b></div>
        <div class="route-line"><i></i><strong>${esc(r.from.label)}</strong><span class="v"></span><span></span><i class="end"></i><strong>${esc(r.to.label)}</strong></div>
        ${r.pickup ? `<p class="hint" style="margin-top:8px"><b style="color:var(--orange-ink)">탑승 장소</b> ${esc(r.pickup.label)}</p>` : ''}
        <p class="hint">${esc(r.carColor)} ${esc(r.carModel)} · <b>${esc(r.carNo)}</b> · ${esc(r.driverName)}${drv ? ' (나)' : ''}</p>
        <div class="steps">${steps}</div>
        <div class="room-actions">${acts}</div>`;
      $$('[data-act]', el).forEach(b => b.onclick = () => this.action(b.dataset.act));
      $$('[data-go]', el).forEach(b => b.onclick = () => navigate(b.dataset.go));
    },
    remainFor(r) {
      const dep = this.d.payments.some(p => p.uid === S.uid && p.kind === 'deposit') ? r.deposit : 0;
      return Math.max(0, r.fare - dep);
    },
    async action(a) {
      const r = this.ride(), id = r.id, sys = text => B.sendMessage(id, { type: 'system', text });
      try {
        if (a === 'boardqr') return this.boardQR();
        if (a === 'payqr') return this.payQR();
        if (a === 'scanboard') return this.scanBoard();
        if (a === 'sendmoney') return this.sendMoney();
        if (a === 'depart') {
          const not = r.members.filter(u => !this.d.checkins[u]);
          if (!r.members.length && !await confirmSheet({ title: '아직 탄 사람이 없어요', text: '그래도 출발할까요?', ok: '출발' })) return;
          if (not.length && !await confirmSheet({ title: '아직 QR 인증을 안 한 사람이 있어요', text: `${not.map(u => esc(r.memberNames[u])).join(', ')}님<br>QR로 탑승 인증을 하지 않으면 서로 매너 평가를 할 수 없어요.`, ok: '그래도 출발' })) return;
          await B.updateRide(id, { status: 'riding', departedAt: Date.now() });
          await sys('출발했어요! 안전하게 가요.');
        }
        if (a === 'arrive') {
          await B.updateRide(id, { status: 'arrived', arrivedAt: Date.now() });
          await sys('도착했어요! 탑승자는 [돈 보내기]를 누르고 운전자의 정산 QR을 찍어 주세요.');
        }
        if (a === 'finish') {
          const unpaid = r.members.filter(u => !this.d.payments.some(p => p.uid === u && p.kind === 'fare'));
          if (unpaid.length && !await confirmSheet({ title: '아직 송금 안 한 사람이 있어요', text: `${unpaid.map(u => esc(r.memberNames[u])).join(', ')}님<br>그래도 카풀을 마칠까요?`, ok: '마치기' })) return;
          await B.updateRide(id, { status: 'done', doneAt: Date.now() });
          await sys('카풀이 끝났어요. 함께 탄 사람에게 매너 평가를 남겨 주세요.');
          LocShare.stop(id);
        }
        if (a === 'cancel') {
          if (!await confirmSheet({ title: '카풀을 취소할까요?', text: '신청한 사람들의 예약금은 모두 돌려줘요.', ok: '취소하기', cancel: '그대로 둘게요', danger: true })) return;
          await B.updateRide(id, { status: 'canceled' });
          await sys('운전자가 카풀을 취소했어요. 예약금은 모두 돌려드려요.');
          LocShare.stop(id);
        }
        if (a === 'leave') {
          const free = r.departAt - Date.now() > FARE.cancelFreeMin * 60000;
          if (!await confirmSheet({ title: '카풀에서 나갈까요?', text: free ? `출발 ${FARE.cancelFreeMin}분 전이라 예약금 ${won(r.deposit)}은 돌려받아요.` : `출발 ${FARE.cancelFreeMin}분 이내라 예약금 ${won(r.deposit)}은 운전자에게 가요.`, ok: '나가기', cancel: '그대로 있을게요', danger: true })) return;
          await sys(`${S.me.name}님이 나갔어요 · 예약금 ${free ? '돌려받음' : '운전자에게 지급'}`);
          LocShare.stop(id);
          await B.leaveRide(id);
          toast('카풀에서 나왔어요');
          navigate('carpool', true);
        }
      } catch (e) { toast(errMsg(e), 'bad'); }
    },

    /* ---- 탑승 QR (운전자) ---- */
    async ensureCode(rotate) {
      const key = 'board:' + this.id;
      let code = store.get(key, null);
      if (!code || rotate) { code = sixDigits(); store.set(key, code); await B.setBoardCode(this.id, code); }
      else if (!this.codeSynced) await B.setBoardCode(this.id, code);
      this.codeSynced = true;
      return code;
    },
    onCheckins(prev) {
      const r = this.ride(); if (!r || !isDriverOf(r)) return;
      if (Object.keys(this.d.checkins).length > prev && this.loadedCi) {
        this.ensureCode(true).then(() => { if (this.qrOpen === 'board') this.paintBoardQR(); });
      }
      this.loadedCi = true;
      if (this.qrOpen === 'board') this.paintBoardQR();
    },
    async boardQR() {
      const code = await this.ensureCode(false);
      this.qrOpen = 'board';
      openSheet('<div data-qr></div><button class="btn btn-navy" data-close>닫기</button>', () => { this.paintBoardQR(code); });
      sheetCleanup = () => { this.qrOpen = null; };
    },
    paintBoardQR() {
      const box = $('#sheet [data-qr]'); if (!box) return;
      const r = this.ride(); const code = store.get('board:' + this.id, '');
      box.innerHTML = `<p class="sheet-eyebrow">탑승 인증</p><h3>탑승자가 이 QR을 찍어요</h3>
        <div class="qr-wrap">${qrSvg(`KSNUPOOL|BOARD|${this.id}|${code}`)}</div>
        <p class="qr-code">${code}</p>
        <p class="hint" style="text-align:center;margin-bottom:12px">카메라가 안 되면 이 6자리 코드를 입력해요. 한 명이 인증할 때마다 코드가 바뀌어요.</p>
        <div class="card" style="box-shadow:none;background:#f7f8fc;margin-bottom:14px">${r.members.length ? r.members.map(u => `<div class="row" style="justify-content:space-between;padding:4px 0"><b>${esc(r.memberNames[u])}</b>${this.d.checkins[u] ? '<span class="chip chip-green">탑승 인증</span>' : '<span class="chip chip-gray">대기</span>'}</div>`).join('') : '<p class="muted" style="font-size:13.5px">아직 신청한 사람이 없어요.</p>'}</div>`;
    },

    /* ---- 정산 QR (운전자) ---- */
    payQR() {
      this.qrOpen = 'pay';
      openSheet('<div data-qr></div><button class="btn btn-navy" data-close>닫기</button>', () => this.paintPayQR());
      sheetCleanup = () => { this.qrOpen = null; };
    },
    paintPayQR() {
      const box = $('#sheet [data-qr]'); if (!box) return;
      const r = this.ride();
      box.innerHTML = `<p class="sheet-eyebrow">정산</p><h3>탑승자가 이 QR을 찍으면 내 계좌가 보여요</h3>
        <div class="qr-wrap">${qrSvg(`KSNUPOOL|PAY|${this.id}`)}</div>
        <div class="card" style="box-shadow:none;background:#f7f8fc;margin-bottom:14px">${r.members.map(u => { const p = this.d.payments.find(x => x.uid === u && x.kind === 'fare'); return `<div class="row" style="justify-content:space-between;padding:4px 0"><b>${esc(r.memberNames[u])}</b>${p ? `<span class="chip chip-green">${won(p.amount)} 받음</span>` : '<span class="chip chip-gray">대기</span>'}</div>`; }).join('')}</div>`;
    },

    /* ---- 탑승자: QR 찍기 ---- */
    scanBoard() {
      const r = this.ride();
      Scanner.open({
        title: '탑승 QR 찍기', hint: '운전자 화면의 QR을 네모 안에 맞춰 주세요', manual: '운전자 화면의 6자리 코드',
        onResult: async (text) => {
          let code = text.trim();
          if (code.startsWith('KSNUPOOL|')) {
            const [, kind, rideId, c] = code.split('|');
            if (kind !== 'BOARD') throw new Error('탑승 QR이 아니에요. 운전자에게 탑승 QR을 보여 달라고 해 주세요.');
            if (rideId !== r.id) throw new Error('다른 카풀의 QR이에요.');
            code = c;
          }
          if (!/^\d{6}$/.test(code)) throw new Error('6자리 숫자 코드를 입력해 주세요.');
          await B.checkIn(r.id, code);
          await B.sendMessage(r.id, { type: 'system', text: `${S.me.name}님이 탔어요 · QR 탑승 인증` });
          banner('탑승 인증 완료', `${r.driverName}님 차에 탔어요`);
        },
      });
    },
    sendMoney() {
      const r = this.ride();
      Scanner.open({
        title: '정산 QR 찍기', hint: '운전자 화면의 정산 QR을 찍으면 계좌가 보여요', manual: null,
        extra: '<button class="btn btn-ghost" data-noqr>QR 없이 계좌 보기</button>',
        onExtra: () => this.paySheet(),
        onResult: async (text) => {
          const [, kind, rideId] = text.trim().split('|');
          if (!text.startsWith('KSNUPOOL|') || kind !== 'PAY') throw new Error('정산 QR이 아니에요. 운전자에게 정산 QR을 보여 달라고 해 주세요.');
          if (rideId !== r.id) throw new Error('다른 카풀의 QR이에요.');
          setTimeout(() => this.paySheet(), 50);
        },
      });
    },
    async paySheet() {
      const r = this.ride();
      let pay = null;
      try { pay = await B.getPay(r.id); } catch (e) { /* 무시 */ }
      const amount = this.remainFor(r);
      openSheet(`
        <p class="sheet-eyebrow">${esc(r.driverName)}님에게 보내기</p>
        <div class="amount"><b>${won(amount)}</b><small>${amount ? `요금 ${won(r.fare)} − 예약금 ${won(r.fare - amount)}` : '예약금으로 요금을 모두 냈어요'}</small></div>
        ${pay ? `<div class="account"><small>${esc(pay.bank)} · 예금주 ${esc(pay.holder)}</small><b>${esc(pay.account)}</b><button class="link" data-copy style="font-size:13px">계좌번호 복사</button></div>` : '<p class="hint bad">계좌를 불러오지 못했어요.</p>'}
        <p class="sheet-text" style="margin-bottom:14px">은행 앱에서 이 계좌로 보낸 뒤 아래 버튼을 눌러 주세요. 운전자에게 바로 알림이 가요.</p>
        <div class="sheet-actions"><button class="btn btn-ghost" data-close>나중에</button><button class="btn btn-orange" data-sent>돈 보내기</button></div>`,
      sh => {
        const c = $('[data-copy]', sh);
        if (c) c.onclick = async () => toast(await copyText(pay.account.replace(/-/g, '')) ? '계좌번호를 복사했어요' : '복사하지 못했어요');
        $('[data-sent]', sh).onclick = async () => {
          $('[data-sent]', sh).disabled = true;
          try {
            await B.pay(r.id, 'fare', amount, S.me.name);
            await B.sendMessage(r.id, { type: 'system', text: `${S.me.name}님이 ${won(amount)}을 보냈어요` });
            closeSheet();
            banner('돈을 보냈어요!', `${r.driverName}님에게 ${won(amount)}`, { money: true });
          } catch (e) { closeSheet(); toast(errMsg(e), 'bad'); }
        };
      });
    },

    /* ---- + 버튼: 탑승 장소 제안, 빠른 말 ---- */
    plusSheet() {
      const r = this.ride();
      openSheet(`
        <h3>탑승 장소 제안</h3>
        <label class="field"><span>장소 이름</span><input class="input" data-plabel placeholder="예) 나운동 롯데마트 정문" maxlength="24" value="${esc(r.pickup ? r.pickup.label : '')}"></label>
        <div class="btn-col">
          <button class="btn btn-orange btn-sm" data-pk="here">${UI.pin}지금 내 위치로 제안</button>
          <button class="btn btn-ghost btn-sm" data-pk="from">운전자 출발지(${esc(r.from.label)})로 제안</button>
        </div>
        <h3 style="margin-top:20px">빠른 메시지</h3>
        <div class="chips">${['5분 정도 늦어요', '도착했어요', '어디쯤이세요?', '조금 일찍 출발해도 될까요?', '감사합니다!'].map(t => `<button class="chip-btn" data-quick="${esc(t)}">${esc(t)}</button>`).join('')}</div>`,
      sh => {
        $$('[data-quick]', sh).forEach(b => b.onclick = async () => { closeSheet(); await B.sendMessage(r.id, { type: 'text', text: b.dataset.quick, name: S.me.name }); });
        $$('[data-pk]', sh).forEach(b => b.onclick = async () => {
          let p;
          try { p = b.dataset.pk === 'here' ? await getPos() : r.from; } catch (e) { toast(e.message, 'bad'); return; }
          const label = $('[data-plabel]', sh).value.trim() || (b.dataset.pk === 'here' ? `${S.me.name}님 위치 (${nearestDong(p).name})` : r.from.label);
          closeSheet();
          await B.sendMessage(r.id, { type: 'pickup', name: S.me.name, text: label, lat: p.lat, lng: p.lng });
        });
      });
    },

    /* ---- 대화 ---- */
    nearBottom() { const s = $('#screen'); return s.scrollHeight - s.scrollTop - s.clientHeight < 120; },
    scrollBottom(force) { const s = $('#screen'); if (force || this._stick) requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); },
    paintChat() {
      const root = this.root; if (!root) return;
      const el = $('[data-chat]', root); if (!el) return;
      const r = this.ride(); const drv = isDriverOf(r);
      this._stick = this.nearBottom() || !el.children.length;
      el.innerHTML = this.d.messages.map(m => {
        const t = hm(m.at);
        if (m.type === 'system') return `<div class="msg sys"><div class="bub">${esc(m.text)}</div></div>`;
        const mine = m.uid === S.uid;
        const who = m.uid === r.driverUid ? `${m.name || r.driverName} · 운전자` : (m.name || (r.memberNames || {})[m.uid] || '탑승자');
        let body = esc(m.text);
        if (m.type === 'pickup') {
          const chosen = r.pickup && r.pickup.lat === m.lat && r.pickup.lng === m.lng;
          body = `<div class="pick"><span class="muted" style="font-size:11.5px">${mine ? '내가 제안한' : ''} 탑승 장소</span><b>${esc(m.text)}</b>
            <button class="btn btn-ghost btn-xs" data-showpk="${m.lat},${m.lng}">지도에서 보기</button>
            ${drv && !chosen && ACTIVE.includes(r.status) ? `<button class="btn btn-orange btn-xs" data-setpk="${esc(m.id)}">여기로 확정</button>` : ''}${chosen ? '<span class="chip chip-green">확정된 장소</span>' : ''}</div>`;
        }
        return `<div class="msg ${mine ? 'me' : ''}"><div>${mine ? '' : `<p class="who">${esc(who)}</p>`}<div class="bub">${body}</div></div><time>${t}</time></div>`;
      }).join('');
      $$('[data-setpk]', el).forEach(b => b.onclick = async () => {
        const m = this.d.messages.find(x => x.id === b.dataset.setpk);
        await B.updateRide(r.id, { pickup: { label: m.text, lat: m.lat, lng: m.lng } });
        await B.sendMessage(r.id, { type: 'system', text: `탑승 장소가 정해졌어요: ${m.text}` });
      });
      $$('[data-showpk]', el).forEach(b => b.onclick = () => {
        const [lat, lng] = b.dataset.showpk.split(',').map(Number);
        $('[data-rtab="map"]', root).click();
        setTimeout(() => { if (this.map) this.map.flyTo({ center: [lng, lat], zoom: 16 }); }, 300);
      });
      this.scrollBottom();
    },

    /* ---- 함께 타는 사람 ---- */
    paintPeople() {
      const root = this.root, r = this.ride(); if (!root || !r) return;
      const el = $('[data-panel-people]', root); if (!el) return;
      const drv = isDriverOf(r), pk = r.pickup;
      const locs = this.d.locs;
      const dist = u => (pk && locs[u] ? ` · 탑승 장소까지 ${fmtKm(kmBetween(locs[u], pk))}` : '');
      const rows = r.members.map(u => {
        const dep = this.d.payments.some(p => p.uid === u && p.kind === 'deposit');
        const fare = this.d.payments.find(p => p.uid === u && p.kind === 'fare');
        const ci = this.d.checkins[u];
        const ns = (r.noShow || []).includes(u);
        return `<div class="person"><span class="pav p">${initial(r.memberNames[u])}</span><span class="t"><strong>${esc(r.memberNames[u])}${u === S.uid ? ' (나)' : ''}</strong>
          <small>${dep ? '예약금 보냄' : '예약금 대기'}${ci ? ` · ${hm(ci.at)} 탑승` : ''}${fare ? ` · ${won(fare.amount)} 송금` : ''}${dist(u)}</small>
          <span class="tags" style="display:flex;gap:4px;margin-top:4px">${ci ? '<span class="chip chip-green">QR 탑승</span>' : '<span class="chip chip-gray">탑승 전</span>'}${fare ? '<span class="chip chip-navy">정산 완료</span>' : ''}${ns ? '<span class="chip chip-red">노쇼</span>' : ''}</span></span>
          ${tempHTML(u)}${drv && !ci && !ns && ['riding', 'arrived'].includes(r.status) ? `<button class="btn btn-red btn-xs" data-noshow="${esc(u)}">안 나왔어요</button>` : ''}</div>`;
      }).join('');
      el.innerHTML = `
        <div class="card"><p class="sheet-eyebrow">운전자</p>
          <div class="person"><span class="pav">${initial(r.driverName)}</span><span class="t"><strong>${esc(r.driverName)}${drv ? ' (나)' : ''}</strong><small>${esc(r.carColor)} ${esc(r.carModel)} · ${esc(r.carNo)}${dist(r.driverUid)}</small></span>${tempHTML(r.driverUid)}</div></div>
        <div class="card"><p class="sheet-eyebrow">탑승자 ${r.members.length}/${r.seats}</p>${rows || '<p class="muted" style="font-size:14px">아직 신청한 사람이 없어요.</p>'}</div>
        <p class="demo-note">탑승 인증(QR)을 한 사람만 카풀이 끝난 뒤 서로 매너 평가를 할 수 있어요.</p>`;
      $$('[data-noshow]', el).forEach(b => b.onclick = async () => {
        const u = b.dataset.noshow;
        if (!await confirmSheet({ title: `${r.memberNames[u]}님이 안 나왔나요?`, text: `노쇼로 기록되고 예약금 ${won(r.deposit)}은 운전자에게 가요.`, ok: '노쇼 처리', danger: true })) return;
        await B.updateRide(r.id, { noShow: [...(r.noShow || []), u] });
        await B.sendMessage(r.id, { type: 'system', text: `${r.memberNames[u]}님이 나오지 않아 노쇼로 기록했어요. 예약금은 운전자에게 가요.` });
      });
    },

    /* ---- 위치 ---- */
    paintShare() {
      const root = this.root; if (!root) return;
      const on = LocShare.isOn(this.id);
      const sw = $('[data-share]', root); if (sw) sw.classList.toggle('on', on);
      const info = $('[data-locinfo]', root);
      if (info) info.textContent = on ? (LocShare.lastErr || (LocShare.lastAt ? `${hm(LocShare.lastAt)}에 위치를 보냈어요` : '위치를 찾는 중이에요...')) : '';
    },
    ensureMap() {
      if (this.map) { this.map.resize(); return; }
      const r = this.ride(), box = $('[data-panel-map] .map-box', this.root);
      this.map = miniMap(box, r.pickup || r.from, 14);
      this.markers = {};
      if (this.map) this.map.on('load', () => { this.mapReady = true; this.paintMap(true); });
    },
    paintMap(fit) {
      const m = this.map, r = this.ride(); if (!m || !this.mapReady || !r) return;
      const want = {};
      const add = (key, p, el) => { want[key] = 1; if (!this.markers[key]) this.markers[key] = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m); else this.markers[key].setLngLat([p.lng, p.lat]); };
      add('from', r.from, markerEl('map-pin navy'));
      if (r.pickup) { if (this.markers.pk && this._pk !== r.pickup.label) { this.markers.pk.remove(); delete this.markers.pk; } this._pk = r.pickup.label; add('pk', r.pickup, markerEl('map-pin')); }
      Object.entries(this.d.locs).forEach(([u, p]) => {
        if (Date.now() - p.at > 30 * 60000) return;
        const isDrv = u === r.driverUid;
        add('u:' + u, p, markerEl('map-dot' + (isDrv ? ' drv' : '') + (u === S.uid ? ' me' : ''), (p.name || '?').charAt(0)));
      });
      Object.keys(this.markers).forEach(k => { if (!want[k]) { this.markers[k].remove(); delete this.markers[k]; } });
      if (fit) fitTo(m, [r.from, r.pickup, ...Object.values(this.d.locs)].filter(Boolean), 50);
      this.paintShare();
    },
  };

  /* 읽지 않은 단톡 표시 */
  function markRead(id, msgs) { if (msgs.length) store.set('read:' + id, msgs[msgs.length - 1].at); unread[id] = false; paintDot(); }

  /* =========================================================
     매너 평가
     ========================================================= */
  const Rate = {
    name: 'rate', title: '매너 평가',
    sel: {},
    render(id) {
      const r = findRide(id);
      if (!r || !isIn(r)) return '<p class="empty">평가할 카풀을 찾을 수 없어요.</p>';
      if (r.status !== 'done') return '<p class="empty">카풀이 끝난 뒤에 평가할 수 있어요.</p>';
      this.id = id;
      const targets = isDriverOf(r) ? r.members.map(u => ({ uid: u, name: r.memberNames[u], role: '탑승자' })) : [{ uid: r.driverUid, name: r.driverName, role: '운전자' }];
      return `
        <p class="muted" style="font-size:14px;line-height:1.6;margin:2px 2px 14px">${fmtWhen(r.departAt).day} ${hm(r.departAt)} · ${esc(r.from.label)} → ${esc(r.to.label)}</p>
        ${targets.map(t => `<div class="card rate-card" data-target="${esc(t.uid)}"></div>`).join('')}
        <details class="card" style="margin-top:12px"><summary style="font-weight:800;font-size:14px;cursor:pointer">매너온도는 이렇게 지켜져요</summary>${mannerRules()}</details>`;
    },
    async mount(root, id) {
      const r = findRide(id); if (!r || r.status !== 'done') return;
      for (const card of $$('[data-target]', root)) {
        const uid = card.dataset.target;
        const name = uid === r.driverUid ? r.driverName : r.memberNames[uid];
        let done = false; try { done = await B.hasRated(id, uid); } catch (e) { /* 무시 */ }
        this.paintCard(card, r, uid, name, done);
      }
    },
    paintCard(card, r, uid, name, done) {
      const key = uid, s = this.sel[key] || { score: null, tags: [] };
      const tags = s.score === 1 ? MANNER.goodTags : s.score === -1 ? MANNER.badTags : [];
      card.innerHTML = `
        <div class="person"><span class="pav ${uid === r.driverUid ? '' : 'p'}">${initial(name)}</span><span class="t"><strong>${esc(name)}</strong><small>${uid === r.driverUid ? '운전자' : '탑승자'}</small></span>${tempHTML(uid)}</div>
        ${done ? '<p class="hint" style="margin-top:12px"><span class="chip chip-green">평가 완료</span> 평가는 고칠 수 없어요.</p>' : `
        <div class="rate-choice">
          <button data-score="1" class="${s.score === 1 ? 'on' : ''}">좋았어요<small>+${MANNER.good}°C</small></button>
          <button data-score="0" class="${s.score === 0 ? 'on' : ''}">보통이에요<small>변화 없음</small></button>
          <button data-score="-1" class="${s.score === -1 ? 'on' : ''}">별로예요<small>${MANNER.bad}°C</small></button>
        </div>
        ${tags.length ? `<div class="chips" style="margin-bottom:12px">${tags.map(t => `<button class="chip-btn ${s.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
        <p class="hint bad" data-err hidden></p>
        <button class="btn btn-navy btn-sm" data-submit ${s.score == null || (s.score === -1 && !s.tags.length) ? 'disabled' : ''}>${s.score === -1 && !s.tags.length ? '이유를 하나 이상 골라 주세요' : '평가 보내기'}</button>`}`;
      if (done) return;
      $$('[data-score]', card).forEach(b => b.onclick = () => { this.sel[key] = { score: +b.dataset.score, tags: [] }; this.paintCard(card, r, uid, name, false); });
      $$('[data-tag]', card).forEach(b => b.onclick = () => {
        const t = b.dataset.tag; s.tags = s.tags.includes(t) ? s.tags.filter(x => x !== t) : [...s.tags, t]; this.sel[key] = s; this.paintCard(card, r, uid, name, false);
      });
      $('[data-submit]', card).onclick = async () => {
        try {
          await B.rate(r.id, uid, s.score, s.tags);
          delete this.sel[key];
          toast(`${name}님에게 평가를 보냈어요`);
          this.paintCard(card, r, uid, name, true);
        } catch (e) { const er = $('[data-err]', card); er.textContent = errMsg(e); er.hidden = false; }
      };
    },
    onData() { },
  };
  function mannerRules() {
    return `<ul class="rule-list">
      <li>처음 가입하면 누구나 ${MANNER.base}°C에서 시작해요.</li>
      <li><b>QR로 탑승 인증을 한</b> 운전자와 탑승자 사이에서만, 카풀이 <b>끝난 뒤</b>에 평가할 수 있어요. 타지 않은 사람은 평가할 수 없어요.</li>
      <li>같은 카풀에서 같은 사람에게는 한 번만, 보낸 평가는 고치거나 지울 수 없어요.</li>
      <li>같은 사람끼리 ${MANNER.perPairDays}일 안에 여러 번 평가하면 마지막 한 번만 반영돼요. 친구끼리 반복해서 올리는 걸 막아요.</li>
      <li>한 사람이 다른 한 사람의 온도를 바꿀 수 있는 양은 최대 ±${MANNER.perPairCap.toFixed(1)}°C예요.</li>
      <li>가입한 지 ${MANNER.newbieDays}일이 안 된 계정의 평가는 절반만 반영돼요.</li>
      <li>'별로예요'는 이유를 꼭 골라야 보낼 수 있어요.</li>
    </ul>`;
  }

  /* =========================================================
     내 정보
     ========================================================= */
  const Me = {
    name: 'me', title: '내 정보',
    render() {
      const me = S.me || {};
      const t = tempInfo(S.uid) || { temp: MANNER.base, count: 0, good: 0, bad: 0, tags: {} };
      const topTags = Object.entries(t.tags).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const pos = clamp((t.temp - 30) / 15 * 100, 0, 100);
      const hist = S.myRides.filter(r => !ACTIVE.includes(r.status)).sort((a, b) => b.departAt - a.departAt).slice(0, 5);
      const seg = (name, cur, opts) => `<div class="segs small">${opts.map(([v, l]) => `<button class="seg ${String(cur) === String(v) ? 'on' : ''}" data-${name}="${v}">${l}</button>`).join('')}</div>`;
      return `
        <div class="card">
          <div class="person"><span class="pav" style="width:52px;height:52px;font-size:20px">${initial(me.name)}</span><span class="t"><strong style="font-size:18px">${esc(me.name)}</strong><small>${esc(me.dept)} · 학번 ${esc(me.sid)}</small></span></div>
        </div>
        <div class="card">
          <div class="row"><b>매너온도</b><span class="spacer"></span><span class="temp temp-big ${tempCls(t.temp)}" data-temp="${esc(S.uid)}"><i></i>${t.temp.toFixed(1)}°C</span></div>
          <div class="temp-bar"><b style="left:${pos}%"></b></div>
          <p class="hint">받은 평가 ${t.count}건 · 좋아요 ${t.good} · 별로 ${t.bad}</p>
          ${topTags.length ? `<div class="chips" style="margin-top:8px">${topTags.map(([k, v]) => `<span class="chip ${MANNER.badTags.includes(k) ? 'chip-red' : 'chip-green'}">${esc(k)} ${v}</span>`).join('')}</div>` : ''}
          <details style="margin-top:10px"><summary style="font-weight:800;font-size:13.5px;cursor:pointer;color:var(--navy)">함부로 바꿀 수 없게 이렇게 지켜요</summary>${mannerRules()}</details>
        </div>
        <h2 class="list-h">내 설정</h2>
        <ul class="link-list">
          <li><button data-go="verify"><span><strong>동네 인증</strong><small>${dongValid(me) ? `${esc(me.dong.name)} · ${me.dong.by === 'gps' ? 'GPS 인증' : '테스트용 선택'}` : '인증 필요'}</small></span><i>›</i></button></li>
          <li><button data-go="driver"><span><strong>운전자 정보</strong><small>${me.driver ? `${esc(me.driver.carColor)} ${esc(me.driver.carModel)} · ${esc(me.driver.carNo)}` : '등록하면 카풀을 올릴 수 있어요'}</small></span><i>›</i></button></li>
        </ul>
        <h2 class="list-h">지난 카풀</h2>
        ${hist.length ? `<div class="ride-list">${hist.map(rideCard).join('')}</div>` : '<p class="empty" style="padding:8px">아직 없어요.</p>'}
        <h2 class="list-h">시연 설정</h2>
        <section class="card settings">
          <p class="set-label">통학버스 기준 시각 <span style="color:var(--navy)" data-clock></span></p>
          ${seg('clock', clock.mode, Object.entries(CLOCK_LABEL))}
          ${seg('speed', clock.speed, [[1, '실제 속도'], [10, '10배'], [30, '30배']])}
          <p class="set-help">버스가 안 다니는 시간에도 등교·하교 시간으로 바꿔 버스가 움직이는 모습을 보여 줄 수 있어요.</p>
          <p class="set-label">테스트용 위치</p>
          <select class="input" data-fake><option value="">실제 GPS 사용</option>${DONGS.map(d => `<option ${store.get('fakeLoc', '') === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
          <p class="set-help" style="margin-top:6px">PC처럼 GPS가 없을 때 고른 동네 근처를 내 위치로 써요. 동네 인증은 '테스트용'으로 표시돼요.</p>
          <p class="set-label">저장 방식</p>
          <p style="margin-bottom:6px">${B.mode === 'local' ? '<span class="mode-pill local"><i></i>데모 모드</span>' : '<span class="mode-pill fb"><i></i>Firebase 연결됨</span>'}</p>
          <p class="set-help">${B.mode === 'local' ? '이 브라우저에만 저장돼요. 같은 브라우저에서 탭을 하나 더 열고 다른 학번으로 가입하면 운전자와 탑승자를 동시에 시연할 수 있어요.' : '여러 기기에서 같은 데이터를 함께 써요.'}</p>
          <div class="btn-col">
            <button class="btn btn-ghost btn-sm" data-logout>로그아웃</button>
            ${B.mode === 'local' ? '<button class="btn btn-red btn-sm" data-reset>데모 기록 모두 지우기</button>' : ''}
          </div>
        </section>`;
    },
    mount(root) {
      bindRideCards(root);
      $$('button[data-clock]', root).forEach(b => b.onclick = () => { setClock(b.dataset.clock, clock.speed); toast(`통학버스 기준 시각: ${CLOCK_LABEL[b.dataset.clock]}`); rerender(); });
      $$('button[data-speed]', root).forEach(b => b.onclick = () => { setClock(clock.mode, +b.dataset.speed, { keep: true }); rerender(); });
      $('[data-fake]', root).onchange = e => { e.target.value ? store.set('fakeLoc', e.target.value) : store.del('fakeLoc'); toast(e.target.value ? `테스트 위치: ${e.target.value}` : '실제 GPS를 써요'); };
      $('[data-logout]', root).onclick = async () => { if (await confirmSheet({ title: '로그아웃할까요?', ok: '로그아웃' })) { LocShare.stopAll(); await B.signOut(); } };
      const rs = $('[data-reset]', root);
      if (rs) rs.onclick = async () => {
        if (!await confirmSheet({ title: '데모 기록을 모두 지울까요?', text: '이 브라우저의 모든 계정, 카풀, 대화, 평가가 지워져요.', ok: '모두 지우기', danger: true })) return;
        LocShare.stopAll(); await B.resetAll(); Object.keys(localStorage).filter(k => k.startsWith('kpool:ui:')).forEach(k => localStorage.removeItem(k));
        location.hash = '#/home'; location.reload();
      };
    },
    update(root) { const c = $('span[data-clock]', root); if (c) c.textContent = hm(now().getTime()); },
    onData() { rerender(); },
    onTemp(uid) { if (uid === S.uid && current === Me) rerender(); },
  };

  /* =========================================================
     위치 공유 (카풀 중, 켠 사람만)
     ========================================================= */
  const LocShare = {
    watchers: {}, lastAt: 0, lastErr: '',
    isOn(id) { return !!store.get('share:' + id, false); },
    toggle(id) { this.isOn(id) ? this.stop(id) : this.start(id); },
    start(id) {
      store.set('share:' + id, true);
      if (this.watchers[id]) return;
      const send = (lat, lng) => {
        if (!this.watchers[id] || Date.now() - this.watchers[id].sentAt < 8000) return;
        this.watchers[id].sentAt = Date.now();
        B.setLoc(id, lat, lng, S.me ? S.me.name : '').then(() => { this.lastAt = Date.now(); this.lastErr = ''; if (current === Room) Room.paintShare(); }).catch(() => { });
      };
      this.watchers[id] = { sentAt: 0 };
      if (fakeLoc()) {
        const tick = () => { const p = fakeLoc(); if (p) send(p.lat, p.lng); };
        tick(); this.watchers[id].timer = setInterval(tick, 15000);
      } else if (navigator.geolocation) {
        this.watchers[id].wid = navigator.geolocation.watchPosition(
          p => send(p.coords.latitude, p.coords.longitude),
          e => { this.lastErr = e.code === 1 ? '위치 권한이 꺼져 있어요.' : '위치를 찾지 못했어요.'; if (current === Room) Room.paintShare(); },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
      } else this.lastErr = '이 브라우저는 위치를 지원하지 않아요.';
    },
    stop(id) {
      store.del('share:' + id);
      const w = this.watchers[id];
      if (w) { if (w.wid != null) navigator.geolocation.clearWatch(w.wid); if (w.timer) clearInterval(w.timer); delete this.watchers[id]; B.clearLoc(id).catch(() => { }); }
    },
    stopAll() { Object.keys(this.watchers).forEach(id => this.stop(id)); },
    sync() {
      const act = new Set(S.myRides.filter(r => ACTIVE.includes(r.status)).map(r => r.id));
      Object.keys(this.watchers).forEach(id => { if (!act.has(id)) this.stop(id); });
      act.forEach(id => { if (this.isOn(id) && !this.watchers[id]) this.start(id); });
    },
  };

  /* =========================================================
     QR 스캐너
     ========================================================= */
  const Scanner = {
    open({ title, hint, manual, extra = '', onExtra, onResult }) {
      this.close();
      const el = document.createElement('div');
      el.className = 'scanner';
      el.innerHTML = `
        <header><h2>${esc(title)}</h2><button data-x aria-label="닫기">×</button></header>
        <div class="view"><video playsinline muted></video><div class="frame"></div><p class="msg-cam" data-cam style="position:absolute;bottom:24px">${esc(hint)}</p></div>
        <div class="manual">
          ${manual ? `<p>${esc(manual)}</p><div class="row"><input class="input" data-code inputmode="numeric" maxlength="6" placeholder="000000"><button class="btn btn-navy" data-ok>확인</button></div>` : ''}
          ${extra}
          <p class="hint bad" data-err hidden></p>
        </div>`;
      $('#app').appendChild(el);
      this.el = el;
      const errEl = $('[data-err]', el);
      let busy = false;
      const handle = async text => {
        if (busy) return; busy = true;
        try { await onResult(text); this.close(); }
        catch (e) { errEl.textContent = e.code ? errMsg(e) : e.message; errEl.hidden = false; setTimeout(() => { busy = false; }, 1500); }
      };
      $('[data-x]', el).onclick = () => this.close();
      const ok = $('[data-ok]', el);
      if (ok) { ok.onclick = () => handle($('[data-code]', el).value); $('[data-code]', el).addEventListener('keydown', e => { if (e.key === 'Enter') handle(e.target.value); }); }
      const nq = $('[data-noqr]', el); if (nq) nq.onclick = () => { this.close(); onExtra && onExtra(); };
      this.startCam(el, handle);
    },
    async startCam(el, handle) {
      const video = $('video', el), msg = $('[data-cam]', el);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = '이 브라우저에서는 카메라를 쓸 수 없어요. 아래에 직접 입력해 주세요.'; return; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!this.el) { this.stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = this.stream; await video.play();
      } catch (e) { msg.textContent = '카메라를 켜지 못했어요. 권한을 허용하거나 아래에 직접 입력해 주세요.'; return; }
      let detector = null;
      try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
      const jsqr = window.jsQR && (window.jsQR.default || window.jsQR);
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      const loop = async () => {
        if (!this.el || !video.videoWidth) { if (this.el) this.raf = setTimeout(loop, 250); return; }
        try {
          let text = null;
          if (detector) { const r = await detector.detect(video); if (r[0]) text = r[0].rawValue; }
          else if (jsqr) {
            const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w);
            canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
            const c = jsqr(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (c) text = c.data;
          }
          if (text) handle(text);
        } catch (e) { /* 다음 프레임 */ }
        if (this.el) this.raf = setTimeout(loop, 250);
      };
      loop();
    },
    close() {
      clearTimeout(this.raf);
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.el) { this.el.remove(); this.el = null; }
    },
  };

  /* =========================================================
     통학버스 화면 (bus.js)
     ========================================================= */
  const BusLogic = window.makeBusLogic();
  const BusScreen = window.makeBusScreen({ $, $$, esc, pad, hm, toast, secOfDay, now, BusLogic, MAP_STYLE, UI });

  /* =========================================================
     알림 (내 카풀의 변화)
     ========================================================= */
  const watchers = {}; // rideId -> { pay, msg }
  let prevMine = null;
  function onMyRides(list) {
    const prev = prevMine; prevMine = new Map(list.map(r => [r.id, r]));
    if (prev) for (const r of list) {
      const o = prev.get(r.id);
      if (!o) continue;
      if (!isDriverOf(r) && o.status !== r.status) {
        const msg = { riding: ['카풀이 출발했어요', `${r.driverName}님 차 · 안전하게 가요`], arrived: ['도착했어요! 요금을 보내 주세요', `[돈 보내기]를 누르고 정산 QR을 찍어요`], done: ['카풀이 끝났어요', '매너 평가를 남겨 주세요'], canceled: ['카풀이 취소됐어요', '예약금은 돌려드려요'] }[r.status];
        if (msg) banner(msg[0], msg[1], { go: r.status === 'done' ? 'rate/' + r.id : 'room/' + r.id });
      }
      if (!isDriverOf(r) && !o.pickup && r.pickup) banner('탑승 장소가 정해졌어요', r.pickup.label, { go: 'room/' + r.id });
    }
    const act = new Set(list.filter(r => ACTIVE.includes(r.status)).map(r => r.id));
    for (const id of Object.keys(watchers)) if (!act.has(id)) { watchers[id].forEach(u => u()); delete watchers[id]; }
    for (const r of list) {
      if (!act.has(r.id) || watchers[r.id]) continue;
      const subs = [];
      if (isDriverOf(r)) {
        let seen = null;
        subs.push(B.watchPayments(r.id, ps => {
          const keys = new Set(ps.map(p => p.uid + '_' + p.kind));
          if (seen) ps.forEach(p => {
            if (seen.has(p.uid + '_' + p.kind)) return;
            if (p.kind === 'fare') banner('돈을 받았어요!', `${p.name}님이 ${won(p.amount)}을 보냈어요`, { money: true, go: 'room/' + r.id });
            else banner('예약금을 받았어요!', `${p.name}님이 카풀을 신청했어요 · ${won(p.amount)}`, { money: true, go: 'room/' + r.id });
          });
          seen = keys;
        }));
      }
      let first = true;
      subs.push(B.watchMessages(r.id, ms => {
        if (!first && !(current === Room && Room.id === r.id)) {
          const last = ms[ms.length - 1];
          if (last && last.uid !== S.uid && last.type !== 'system') banner(`단톡방 · ${last.name || ''}`, last.type === 'pickup' ? `탑승 장소 제안: ${last.text}` : last.text, { go: 'room/' + r.id });
        }
        first = false;
        unread[r.id] = ms.length && ms[ms.length - 1].at > store.get('read:' + r.id, 0) && ms[ms.length - 1].uid !== S.uid;
        paintDot();
      }));
      watchers[r.id] = subs;
    }
    LocShare.sync();
  }
  const unread = {};
  function paintDot() {
    const d = $('#dot-carpool'); if (!d) return;
    const cur = current === Room ? Room.id : null;
    d.hidden = !Object.entries(unread).some(([id, v]) => v && id !== cur);
  }

  /* =========================================================
     화면 이동
     ========================================================= */
  const SCREENS = { auth: Auth, home: Home, carpool: Carpool, verify: Verify, driver: Driver, create: Create, ride: Ride, room: Room, rate: Rate, me: Me, bus: BusScreen };
  const PUBLIC = ['auth', 'bus'];
  const TAB_OF = { home: 'home', carpool: 'carpool', ride: 'carpool', room: 'carpool', create: 'carpool', driver: 'carpool', verify: 'carpool', rate: 'carpool', bus: 'bus', me: 'me' };
  let current = null, currentKey = '', pendingRoute = null;
  const stack = [];
  const parse = () => { const [n, ...rest] = location.hash.replace(/^#\/?/, '').split('/'); return { name: SCREENS[n] ? n : 'home', param: rest.join('/') || null }; };
  function navigate(to, replace) {
    const h = '#/' + to;
    if (location.hash === h) { rerender(true); return; }
    if (replace) { history.replaceState(null, '', h); stack[Math.max(0, stack.length - 1)] = h; onRoute(); }
    else location.hash = h;
  }
  function onRoute() {
    const h = location.hash;
    if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
    else if (stack[stack.length - 1] !== h) stack.push(h);
    if (parse().name === 'home') stack.splice(0, stack.length, h);
    closeSheet(); Scanner.close(); rerender(true);
  }
  function goBack() { if (stack.length > 1) history.back(); else navigate('home'); }
  function rerender(fresh) {
    let { name, param } = parse();
    if (!S.uid && !PUBLIC.includes(name)) { if (name !== 'home') pendingRoute = name + (param ? '/' + param : ''); name = 'auth'; }
    if (S.uid && name === 'auth') name = 'home';
    const root = $('#screen');
    if (S.uid && !S.me && !PUBLIC.includes(name)) {
      if (current) { current.unmount && current.unmount(); current.leave && current.leave(); }
      current = null; currentKey = '';
      root.innerHTML = '<p class="empty" style="margin-top:120px">불러오는 중...</p>';
      return;
    }
    const scr = SCREENS[name];
    const key = name + ':' + param;
    const same = key === currentKey && !fresh;
    const keepScroll = same ? root.scrollTop : 0;
    if (current) { current.unmount && current.unmount(); if (current !== scr && current.leave) current.leave(); }
    current = scr; currentKey = key;
    root.dataset.screen = name; $('#app').dataset.screen = name;
    const title = scr.title;
    root.innerHTML = (title ? header(title) : '') + `<div class="content">${scr.render(param)}</div>`;
    root.scrollTop = keepScroll;
    if (fresh) { root.classList.remove('enter'); void root.offsetWidth; root.classList.add('enter'); }
    $$('[data-back]', root).forEach(b => b.onclick = goBack);
    $$('[data-go]', root).forEach(b => { if (!b.onclick) b.onclick = () => navigate(b.dataset.go); });
    scr.mount && scr.mount(root, param);
    scr.update && scr.update(root);
    $('#tabbar').hidden = !!scr.noTab;
    $$('#tabbar [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === TAB_OF[name]));
    document.title = (title ? title + ' · ' : '') + '같이타 KSNU';
    paintDot();
  }
  function dataChanged() {
    if (!current) { rerender(true); return; }
    if (current.onData) current.onData(); else rerender();
  }

  $$('#tabbar [data-nav]').forEach(b => b.onclick = () => navigate(b.dataset.nav));
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); Scanner.close(); } });
  window.addEventListener('hashchange', onRoute);

  /* =========================================================
     시작
     ========================================================= */
  let globalSubs = [];
  async function start() {
    const saved = store.get('clock', null);
    setClock(saved ? saved.mode : 'real', saved ? saved.speed : 1, { persist: false });
    let shifted = false;
    if (clock.mode === 'real' && !BusLogic.anyRunningToday(secOfDay())) { setClock('morning', clock.speed, { persist: false }); shifted = true; }

    const sb = document.createElement('div');
    sb.className = 'statusbar';
    sb.innerHTML = '<span id="sb-time"></span><span class="sb-icons"><i></i><i></i><i></i><b>5G</b><em></em></span>';
    $('#app').prepend(sb);
    const tip = $('#intro-tip');
    if (tip) tip.innerHTML = B.mode === 'local'
      ? '<b>데모 모드</b> · 이 브라우저에서 탭을 하나 더 열고 다른 학번으로 가입하면, 한쪽은 운전자 한쪽은 탑승자로 카풀 전체 흐름을 시연할 수 있어요.'
      : '<b>Firebase 연결됨</b> · 각자 폰으로 접속해 실제로 함께 쓸 수 있어요.';

    try { await B.init(); }
    catch (e) { console.error(e); toast('서버에 연결하지 못했어요. 인터넷을 확인해 주세요.', 'bad'); }

    B.onAuth(uid => {
      globalSubs.forEach(u => u()); globalSubs = [];
      Object.values(watchers).forEach(s => s.forEach(u => u())); Object.keys(watchers).forEach(k => delete watchers[k]);
      prevMine = null;
      S.uid = uid; S.me = null; S.rides = []; S.myRides = [];
      if (uid) {
        globalSubs.push(B.watchUser(uid, me => { S.me = me; dataChanged(); }));
        globalSubs.push(B.watchActiveRides(list => { S.rides = list; dataChanged(); }));
        globalSubs.push(B.watchMyRides(list => { S.myRides = list; onMyRides(list); dataChanged(); }));
        if (pendingRoute) { const p = pendingRoute; pendingRoute = null; setTimeout(() => navigate(p, true), 0); }
      }
      rerender(true);
    });

    setInterval(() => {
      if (current && current.update) current.update($('#screen'));
      const t = $('#sb-time'); if (t) t.textContent = hm(Date.now());
    }, 500);

    const splash = $('#splash');
    let seen = false;
    try { seen = sessionStorage.getItem('kpool:splash') === '1'; sessionStorage.setItem('kpool:splash', '1'); } catch (e) { /* 무시 */ }
    const after = () => { if (shifted) toast('지금은 통학버스 운행 시간이 아니라 등교 시간(07:38) 기준으로 보여 드려요'); };
    if (seen) { splash.remove(); after(); }
    else setTimeout(() => { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500); after(); }, 1300);
  }
  if (!location.hash) history.replaceState(null, '', '#/home');
  stack.push(location.hash);
  start();

  window.__app = { S, navigate, B };
})();
