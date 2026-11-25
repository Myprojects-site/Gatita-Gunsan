/* 데이터 저장소
   - 데모 모드: 이 브라우저의 localStorage에 저장. 같은 브라우저의 다른 탭과 실시간으로 공유된다.
     (탭마다 따로 로그인되므로 탭 두 개로 운전자/탑승자를 동시에 시연할 수 있다)
   - Firebase 모드: js/config.js에 설정을 넣으면 Firestore + Firebase Auth로 여러 기기가 함께 쓴다.
   두 모드 모두 아래의 같은 함수들을 제공한다. */
(function () {
  'use strict';
  const SID_DOMAIN = 'ksnu-carpool.app';
  const ACTIVE = ['open', 'full', 'riding', 'arrived'];
  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function sha256(s) {
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return 'x' + (h >>> 0).toString(16);
    }
  }

  /* =========================================================
     데모 모드
     ========================================================= */
  function createLocal() {
    const KEY = 'kpool:db';
    let mem = null;
    const TABLES = ['users', 'creds', 'secrets', 'rides', 'priv', 'board', 'checkins', 'payments', 'messages', 'locs', 'ratings'];
    function read() {
      let d;
      try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { d = mem || {}; }
      TABLES.forEach(k => { d[k] = d[k] || {}; });
      return d;
    }
    function write(d) {
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { mem = d; }
      emit();
    }
    const subs = new Set();
    function emit() { subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
    window.addEventListener('storage', e => { if (e.key === KEY) emit(); });
    function watch(compute, cb) {
      let last;
      const f = () => { const v = compute(read()); const s = JSON.stringify(v); if (s !== last) { last = s; cb(v); } };
      subs.add(f); setTimeout(f, 0);
      return () => subs.delete(f);
    }
    function mutate(fn) { const d = read(); const r = fn(d); write(d); return r; }

    /* 로그인 상태는 탭마다 따로 */
    const SKEY = 'kpool:session';
    let session = null;
    try { session = sessionStorage.getItem(SKEY); } catch (e) { /* 무시 */ }
    const authSubs = new Set();
    function setSession(uid) {
      session = uid;
      try { uid ? sessionStorage.setItem(SKEY, uid) : sessionStorage.removeItem(SKEY); } catch (e) { /* 무시 */ }
      authSubs.forEach(f => f(uid));
    }
    const me = () => { if (!session) throw err('no-auth', '로그인이 필요해요'); return session; };
    const isParticipant = (r, uid) => r && (r.driverUid === uid || (r.members || []).includes(uid));

    return {
      mode: 'local',
      async init() { const d = read(); if (session && !d.users[session]) session = null; },
      onAuth(cb) { authSubs.add(cb); setTimeout(() => cb(session), 0); return () => authSubs.delete(cb); },
      uid: () => session,
      async signUp({ sid, pw, name, dept }) {
        const hash = await sha256(sid + ':' + pw);
        const uid = mutate(d => {
          if (d.creds[sid]) throw err('sid-taken');
          const uid = rid('u_');
          d.creds[sid] = { uid, hash };
          d.users[uid] = { uid, sid, name, dept, createdAt: Date.now(), dong: null, driver: null };
          return uid;
        });
        setSession(uid);
        return uid;
      },
      async signIn(sid, pw) {
        const d = read(); const c = d.creds[sid];
        if (!c || c.hash !== await sha256(sid + ':' + pw)) throw err('bad-login');
        setSession(c.uid);
      },
      async signOut() { setSession(null); },
      async getUser(uid) { return read().users[uid] || null; },
      watchUser(uid, cb) { return watch(d => d.users[uid] || null, cb); },
      async updateMe(patch) { mutate(d => { Object.assign(d.users[me()], patch); }); },
      async setDriverSecret(s) { mutate(d => { d.secrets[me()] = s; }); },
      async getDriverSecret() { return read().secrets[me()] || null; },

      async createRide(ride, pay) {
        return mutate(d => {
          const id = rid('r_');
          d.rides[id] = { ...ride, id, driverUid: me(), members: [], memberNames: {}, status: 'open', createdAt: Date.now() };
          d.priv[id] = pay;
          return id;
        });
      },
      watchActiveRides(cb) {
        return watch(d => Object.values(d.rides).filter(r => ACTIVE.includes(r.status)), cb);
      },
      watchMyRides(cb) {
        const u = session;
        return watch(d => Object.values(d.rides).filter(r => isParticipant(r, u)), cb);
      },
      watchRide(id, cb) { return watch(d => d.rides[id] || null, cb); },
      async updateRide(id, patch) {
        mutate(d => { const r = d.rides[id]; if (!r || r.driverUid !== me()) throw err('denied'); Object.assign(r, patch); });
      },
      async joinRide(id, name) {
        mutate(d => {
          const r = d.rides[id], u = me();
          if (!r || !['open', 'full'].includes(r.status)) throw err('closed');
          if (r.driverUid === u) throw err('own');
          if (r.members.includes(u)) throw err('already');
          if (r.members.length >= r.seats) throw err('full');
          r.members.push(u); r.memberNames[u] = name;
          r.status = r.members.length >= r.seats ? 'full' : 'open';
        });
      },
      async leaveRide(id) {
        mutate(d => {
          const r = d.rides[id], u = me();
          if (!r || !['open', 'full'].includes(r.status)) throw err('closed');
          r.members = r.members.filter(x => x !== u); delete r.memberNames[u];
          r.status = 'open';
        });
      },
      async getPay(id) { const d = read(); if (!isParticipant(d.rides[id], me())) throw err('denied'); return d.priv[id] || null; },
      async setBoardCode(id, code) { mutate(d => { if (d.rides[id].driverUid !== me()) throw err('denied'); d.board[id] = code; }); },
      async checkIn(id, code) {
        mutate(d => {
          const r = d.rides[id], u = me();
          if (!r || !r.members.includes(u)) throw err('denied');
          if (!d.board[id] || d.board[id] !== code) throw err('bad-code');
          d.checkins[id] = d.checkins[id] || {};
          d.checkins[id][u] = { at: Date.now(), code };
        });
      },
      watchCheckins(id, cb) { return watch(d => d.checkins[id] || {}, cb); },
      async pay(id, kind, amount, name) {
        mutate(d => {
          const u = me();
          if (!d.rides[id].members.includes(u)) throw err('denied');
          d.payments[id] = d.payments[id] || {};
          d.payments[id][u + '_' + kind] = { uid: u, name, kind, amount, at: Date.now() };
        });
      },
      watchPayments(id, cb) { return watch(d => Object.values(d.payments[id] || {}), cb); },
      async sendMessage(id, msg) {
        mutate(d => {
          const u = me();
          if (!isParticipant(d.rides[id], u)) throw err('denied');
          d.messages[id] = d.messages[id] || [];
          d.messages[id].push({ ...msg, id: rid('m_'), uid: u, at: Date.now() });
        });
      },
      watchMessages(id, cb) { return watch(d => (d.messages[id] || []).slice().sort((a, b) => a.at - b.at), cb); },
      async setLoc(id, lat, lng, name) {
        mutate(d => { d.locs[id] = d.locs[id] || {}; d.locs[id][me()] = { lat, lng, name, at: Date.now() }; });
      },
      async clearLoc(id) { mutate(d => { if (d.locs[id]) delete d.locs[id][me()]; }); },
      watchLocs(id, cb) { return watch(d => d.locs[id] || {}, cb); },
      async rate(rideId, to, score, tags) {
        mutate(d => {
          const u = me(), r = d.rides[rideId];
          const key = `${rideId}_${u}_${to}`;
          if (d.ratings[key]) throw err('already');
          if (!r || r.status !== 'done') throw err('not-done');
          const ci = d.checkins[rideId] || {};
          const ok = u !== to && ((r.driverUid === u && ci[to]) || (r.driverUid === to && ci[u]));
          if (!ok) throw err('not-boarded');
          d.ratings[key] = { rideId, from: u, to, score, tags, at: Date.now() };
        });
      },
      async hasRated(rideId, to) { return !!read().ratings[`${rideId}_${session}_${to}`]; },
      watchRatingsFor(uid, cb) { return watch(d => Object.values(d.ratings).filter(x => x.to === uid), cb); },
      async resetAll() { try { localStorage.removeItem(KEY); } catch (e) { mem = null; } setSession(null); emit(); },
    };
  }

  /* =========================================================
     Firebase 모드
     ========================================================= */
  function createFirebase(config) {
    const V = '13.2.0';
    let fs, au, db, auth, user = null;
    const authSubs = new Set();
    const me = () => { if (!user) throw err('no-auth', '로그인이 필요해요'); return user.uid; };
    const mapErr = e => {
      const c = e && e.code || '';
      if (c === 'auth/email-already-in-use') return err('sid-taken');
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return err('bad-login');
      if (c === 'permission-denied') return err('denied', '권한이 없어요');
      return e;
    };
    const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw mapErr(e); } };
    const snapList = (q, cb, map = s => s.docs.map(x => ({ id: x.id, ...x.data() }))) =>
      fs.onSnapshot(q, s => cb(map(s)), e => console.warn('[firestore]', e.code || e));

    const api = {
      mode: 'firebase',
      async init() {
        const [appM, authM, fsM] = await Promise.all([
          import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
          import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
          import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
        ]);
        fs = fsM; au = authM;
        const app = appM.initializeApp(config);
        auth = au.getAuth(app);
        db = fs.getFirestore(app);
        await new Promise(res => {
          let first = true;
          au.onAuthStateChanged(auth, u => { user = u; authSubs.forEach(f => f(u ? u.uid : null)); if (first) { first = false; res(); } });
        });
      },
      onAuth(cb) { authSubs.add(cb); setTimeout(() => cb(user ? user.uid : null), 0); return () => authSubs.delete(cb); },
      uid: () => (user ? user.uid : null),
      signUp: wrap(async ({ sid, pw, name, dept }) => {
        const c = await au.createUserWithEmailAndPassword(auth, `${sid}@${SID_DOMAIN}`, pw);
        await fs.setDoc(fs.doc(db, 'users', c.user.uid), { uid: c.user.uid, sid, name, dept, createdAt: Date.now(), dong: null, driver: null });
        return c.user.uid;
      }),
      signIn: wrap(async (sid, pw) => { await au.signInWithEmailAndPassword(auth, `${sid}@${SID_DOMAIN}`, pw); }),
      signOut: wrap(async () => { await au.signOut(auth); }),
      getUser: wrap(async uid => { const s = await fs.getDoc(fs.doc(db, 'users', uid)); return s.exists() ? s.data() : null; }),
      watchUser(uid, cb) { return fs.onSnapshot(fs.doc(db, 'users', uid), s => cb(s.exists() ? s.data() : null), e => console.warn(e)); },
      updateMe: wrap(async patch => { await fs.updateDoc(fs.doc(db, 'users', me()), patch); }),
      setDriverSecret: wrap(async s => { await fs.setDoc(fs.doc(db, 'users', me(), 'secret', 'driver'), s); }),
      getDriverSecret: wrap(async () => { const s = await fs.getDoc(fs.doc(db, 'users', me(), 'secret', 'driver')); return s.exists() ? s.data() : null; }),

      createRide: wrap(async (ride, pay) => {
        const ref = fs.doc(fs.collection(db, 'rides'));
        await fs.setDoc(ref, { ...ride, id: ref.id, driverUid: me(), members: [], memberNames: {}, status: 'open', createdAt: Date.now() });
        await fs.setDoc(fs.doc(db, 'rides', ref.id, 'private', 'pay'), pay);
        return ref.id;
      }),
      watchActiveRides(cb) { return snapList(fs.query(fs.collection(db, 'rides'), fs.where('status', 'in', ACTIVE)), cb); },
      watchMyRides(cb) {
        const u = me(); let a = [], b = [];
        const out = () => { const m = new Map(); [...a, ...b].forEach(r => m.set(r.id, r)); cb([...m.values()]); };
        const u1 = snapList(fs.query(fs.collection(db, 'rides'), fs.where('driverUid', '==', u)), v => { a = v; out(); });
        const u2 = snapList(fs.query(fs.collection(db, 'rides'), fs.where('members', 'array-contains', u)), v => { b = v; out(); });
        return () => { u1(); u2(); };
      },
      watchRide(id, cb) { return fs.onSnapshot(fs.doc(db, 'rides', id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), e => console.warn(e)); },
      updateRide: wrap(async (id, patch) => { await fs.updateDoc(fs.doc(db, 'rides', id), patch); }),
      joinRide: wrap(async (id, name) => {
        const u = me();
        await fs.runTransaction(db, async t => {
          const ref = fs.doc(db, 'rides', id); const s = await t.get(ref);
          const r = s.data();
          if (!r || !['open', 'full'].includes(r.status)) throw err('closed');
          if (r.driverUid === u) throw err('own');
          if (r.members.includes(u)) throw err('already');
          if (r.members.length >= r.seats) throw err('full');
          const members = [...r.members, u];
          t.update(ref, { members, [`memberNames.${u}`]: name, status: members.length >= r.seats ? 'full' : 'open' });
        });
      }),
      leaveRide: wrap(async id => {
        const u = me();
        await fs.runTransaction(db, async t => {
          const ref = fs.doc(db, 'rides', id); const s = await t.get(ref); const r = s.data();
          if (!r || !['open', 'full'].includes(r.status)) throw err('closed');
          t.update(ref, { members: r.members.filter(x => x !== u), [`memberNames.${u}`]: fs.deleteField(), status: 'open' });
        });
      }),
      getPay: wrap(async id => { const s = await fs.getDoc(fs.doc(db, 'rides', id, 'private', 'pay')); return s.exists() ? s.data() : null; }),
      setBoardCode: wrap(async (id, code) => { await fs.setDoc(fs.doc(db, 'rides', id, 'driverOnly', 'board'), { code }); }),
      checkIn: wrap(async (id, code) => {
        try { await fs.setDoc(fs.doc(db, 'rides', id, 'checkins', me()), { at: Date.now(), code }); }
        catch (e) { if (e.code === 'permission-denied') throw err('bad-code'); throw e; }
      }),
      watchCheckins(id, cb) {
        return snapList(fs.collection(db, 'rides', id, 'checkins'), cb, s => Object.fromEntries(s.docs.map(x => [x.id, x.data()])));
      },
      pay: wrap(async (id, kind, amount, name) => {
        const u = me();
        await fs.setDoc(fs.doc(db, 'rides', id, 'payments', u + '_' + kind), { uid: u, name, kind, amount, at: Date.now() });
      }),
      watchPayments(id, cb) { return snapList(fs.collection(db, 'rides', id, 'payments'), cb); },
      sendMessage: wrap(async (id, msg) => { await fs.addDoc(fs.collection(db, 'rides', id, 'messages'), { ...msg, uid: me(), at: Date.now() }); }),
      watchMessages(id, cb) {
        return snapList(fs.collection(db, 'rides', id, 'messages'), cb, s => s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.at - b.at));
      },
      setLoc: wrap(async (id, lat, lng, name) => { await fs.setDoc(fs.doc(db, 'rides', id, 'locs', me()), { lat, lng, name, at: Date.now() }); }),
      clearLoc: wrap(async id => { await fs.deleteDoc(fs.doc(db, 'rides', id, 'locs', me())); }),
      watchLocs(id, cb) { return snapList(fs.collection(db, 'rides', id, 'locs'), cb, s => Object.fromEntries(s.docs.map(x => [x.id, x.data()]))); },
      rate: wrap(async (rideId, to, score, tags) => {
        const u = me();
        try { await fs.setDoc(fs.doc(db, 'ratings', `${rideId}_${u}_${to}`), { rideId, from: u, to, score, tags, at: Date.now() }); }
        catch (e) { if (e.code === 'permission-denied') throw err('not-boarded'); throw e; }
      }),
      hasRated: wrap(async (rideId, to) => (await fs.getDoc(fs.doc(db, 'ratings', `${rideId}_${me()}_${to}`))).exists()),
      watchRatingsFor(uid, cb) { return snapList(fs.query(fs.collection(db, 'ratings'), fs.where('to', '==', uid)), cb); },
      async resetAll() { await api.signOut(); },
    };
    return api;
  }

  window.Backend = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey)
    ? createFirebase(window.FIREBASE_CONFIG)
    : createLocal();
})();
