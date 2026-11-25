/* 통학버스: 시간표로 버스 위치를 계산하고, 실제 지도(MapLibre + OpenFreeMap) 위에 3D 버스로 그린다.
   실제 차량 GPS를 붙이면 BusLogic.position()만 바꾸면 된다. */
(function () {
  'use strict';
  const hm2s = s => { const [h, m] = s.split(':').map(Number); return h * 3600 + m * 60; };
  const s2hm = s => { s = Math.round(s / 60); return String(Math.floor(s / 60) % 24).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const M_PER_DEG = 111320;
  const toXY = (p, lat0) => [p[0] * M_PER_DEG * Math.cos(lat0 * Math.PI / 180), p[1] * M_PER_DEG];
  function segLen(a, b, lat0) { const A = toXY(a, lat0), Bb = toXY(b, lat0); return Math.hypot(Bb[0] - A[0], Bb[1] - A[1]); }

  window.makeBusLogic = function () {
    const GEO_VER = 'v1';
    const geom = {};   // routeId -> { coords, cum, total, stopAt[] }

    function buildGeom(route, coords) {
      const lat0 = route.stops[0].lat;
      const cum = [0];
      for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + segLen(coords[i - 1], coords[i], lat0));
      // 각 정류장을 선 위의 가장 가까운 점(순서 유지)에 맞춘다
      const stopAt = []; let from = 0;
      route.stops.forEach((s, si) => {
        let best = from, bd = Infinity;
        for (let i = from; i < coords.length; i++) { const d = segLen(coords[i], [s.lng, s.lat], lat0); if (d < bd) { bd = d; best = i; } }
        if (si === 0) best = 0;
        if (si === route.stops.length - 1) best = coords.length - 1;
        stopAt.push(cum[best]); from = best;
      });
      geom[route.id] = { coords, cum, total: cum[cum.length - 1], stopAt, lat0 };
    }
    BUS_ROUTES.forEach(r => buildGeom(r, r.stops.map(s => [s.lng, s.lat])));

    async function loadRoads(onDone) {
      for (const r of BUS_ROUTES) {
        if (r.straight) continue;
        const key = 'kpool:geo:' + GEO_VER + ':' + r.id;
        let coords = null;
        try { coords = JSON.parse(localStorage.getItem(key)); } catch (e) { coords = null; }
        if (!coords) {
          try {
            const q = r.stops.map(s => `${s.lng},${s.lat}`).join(';');
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${q}?overview=full&geometries=geojson`);
            const j = await res.json();
            if (j.code === 'Ok') { coords = j.routes[0].geometry.coordinates; try { localStorage.setItem(key, JSON.stringify(coords)); } catch (e) { /* 무시 */ } }
          } catch (e) { console.warn('[bus] 도로 경로를 못 불러와 직선으로 그려요', r.id); }
        }
        if (coords && coords.length > 1) { buildGeom(r, coords); onDone && onDone(r.id); }
      }
    }

    function tripsOf(route) {
      let list = [];
      if (route.every) {
        const e = route.every;
        for (let t = hm2s(e.first); t <= hm2s(e.last); t += e.min * 60) list.push({ start: t, dir: e.dir });
      } else list = route.trips.map(t => ({ start: hm2s(t.at), dir: t.dir }));
      const last = route.stops[route.stops.length - 1].min;
      return list.map(t => ({ ...t, end: t.start + last * 60, route }));
    }
    const TRIPS = Object.fromEntries(BUS_ROUTES.map(r => [r.id, tripsOf(r)]));

    /* 이번 운행에서 정류장 순서와 도착 분 (방향 반영) */
    function orderedStops(route, dir) {
      if (dir === 'to') return route.stops.map((s, i) => ({ ...s, idx: i }));
      const last = route.stops[route.stops.length - 1].min;
      return route.stops.slice().reverse().map((s, k) => ({ ...s, min: last - s.min, idx: route.stops.length - 1 - k }));
    }
    function pointAt(g, d) {
      d = Math.max(0, Math.min(g.total, d));
      let i = 1; while (i < g.cum.length - 1 && g.cum[i] < d) i++;
      const a = g.coords[i - 1], b = g.coords[i], seg = g.cum[i] - g.cum[i - 1] || 1, f = (d - g.cum[i - 1]) / seg;
      const A = toXY(a, g.lat0), Bb = toXY(b, g.lat0);
      const bearing = (Math.atan2(Bb[0] - A[0], Bb[1] - A[1]) * 180 / Math.PI + 360) % 360;
      return { lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, bearing };
    }
    /* 운행 중인 버스의 위치 */
    function position(trip, nowS) {
      const r = trip.route, g = geom[r.id];
      const el = (nowS - trip.start) / 60;
      const st = r.stops; const lastMin = st[st.length - 1].min;
      if (el < 0 || el > lastMin) return null;
      // 'to' 기준 시간으로 바꿔 계산
      const t = trip.dir === 'to' ? el : lastMin - el;
      let i = 0; while (i < st.length - 2 && st[i + 1].min <= t) i++;
      const f = (t - st[i].min) / ((st[i + 1].min - st[i].min) || 1);
      const d = g.stopAt[i] + (g.stopAt[i + 1] - g.stopAt[i]) * Math.max(0, Math.min(1, f));
      const p = pointAt(g, d);
      if (trip.dir === 'from') p.bearing = (p.bearing + 180) % 360;
      return p;
    }
    function running(route, nowS) { return TRIPS[route.id].filter(t => nowS >= t.start && nowS <= t.end); }
    function focusTrip(route, nowS) {
      const tr = TRIPS[route.id];
      const run = tr.filter(t => nowS >= t.start && nowS <= t.end);
      if (run.length) return { trip: run[0], state: 'running' };
      const next = tr.find(t => t.start > nowS);
      if (next) return { trip: next, state: 'next' };
      return { trip: tr[0], state: 'tomorrow' };
    }
    const dirLabel = (route, dir) => (route.kind === 'campus' ? '순환' : dir === 'to' ? '등교 · 군산대 방향' : `하교 · ${route.stops[0].name} 방향`);
    function summary(nowS) {
      return BUS_ROUTES.map(route => {
        const f = focusTrip(route, nowS);
        if (f.state === 'tomorrow') return { route, remain: null };
        const os = orderedStops(route, f.trip.dir);
        if (f.state === 'running') {
          const last = os[os.length - 1];
          return { route, remain: f.trip.start + last.min * 60 - nowS, label: dirLabel(route, f.trip.dir), stop: last.name, running: true };
        }
        return { route, remain: f.trip.start - nowS, label: dirLabel(route, f.trip.dir), stop: os[0].name, running: false };
      });
    }
    function activeSoon(nowS) { return BUS_ROUTES.some(r => TRIPS[r.id].some(t => t.end >= nowS && t.start <= nowS + 30 * 60)); }
    return { geom, loadRoads, TRIPS, orderedStops, position, running, focusTrip, summary, dirLabel, anyRunningToday: activeSoon, s2hm, hm2s };
  };

  /* =========================================================
     통학버스 화면
     ========================================================= */
  window.makeBusScreen = function (H) {
    const { $, $$, esc, toast, secOfDay, BusLogic, MAP_STYLE } = H;
    const L = BusLogic;
    const getRoute = () => BUS_ROUTES.find(r => r.id === (localStorage.getItem('kpool:ui:busRoute') || '').replace(/"/g, '')) || BUS_ROUTES[2];
    const setRoute = id => { try { localStorage.setItem('kpool:ui:busRoute', JSON.stringify(id)); } catch (e) { /* 무시 */ } };

    function boxFeature(p, scale, color, id) {
      const len = 12 * scale, wid = 2.8 * scale, hgt = 3.4 * scale;
      const rad = p.bearing * Math.PI / 180;
      const fx = Math.sin(rad), fy = Math.cos(rad), rx = Math.cos(rad), ry = -Math.sin(rad);
      const mx = 1 / (M_PER_DEG * Math.cos(p.lat * Math.PI / 180)), my = 1 / M_PER_DEG;
      const pt = (a, b) => [p.lng + (fx * a + rx * b) * mx, p.lat + (fy * a + ry * b) * my];
      const ring = (l, w) => [pt(l / 2, -w / 2), pt(l / 2, w / 2), pt(-l / 2, w / 2), pt(-l / 2, -w / 2), pt(l / 2, -w / 2)];
      const f = (coords, base, h, c) => ({ type: 'Feature', properties: { base, h, c, id }, geometry: { type: 'Polygon', coordinates: [coords] } });
      return [
        f(ring(len, wid), hgt * 0.08, hgt * 0.55, color),
        f(ring(len * 0.96, wid * 0.96), hgt * 0.55, hgt * 0.86, '#1c2440'),
        f(ring(len, wid), hgt * 0.86, hgt, '#f4f6fb'),
        f(ring(len * 0.2, wid * 0.9).map(([x, y]) => [x + (fx * len * 0.42) * mx, y + (fy * len * 0.42) * my]), hgt * 0.55, hgt * 0.9, '#f5a524'),
      ];
    }

    const Bus = {
      name: 'bus', title: null,
      render() {
        const r = getRoute();
        return `
          <div class="bus-wrap">
            <div class="bus-map" id="bus-map"></div>
            <div class="map-fallback" id="bus-fallback" hidden style="position:absolute;inset:0;display:grid;place-items:center;color:#6b7290;font-size:14px;text-align:center;padding:30px;line-height:1.6">지도를 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.<br>아래에서 도착 예정 시간은 볼 수 있어요.</div>
            <div class="bus-top">
              <div class="bus-routes">${BUS_ROUTES.map(x => `<button data-route="${x.id}" class="${x.id === r.id ? 'on' : ''}" style="${x.id === r.id ? `background:${x.color}` : ''}"><i style="background:${x.id === r.id ? '#fff' : x.color}"></i>${esc(x.name)}</button>`).join('')}</div>
            </div>
            <div class="map-ctrls">
              <button data-3d class="on" aria-label="3D 보기">3D</button>
              <button data-follow aria-label="버스 따라가기"><svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></button>
              <button data-fit aria-label="노선 전체 보기"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
            </div>
            <section class="bus-sheet" id="bus-sheet">
              <button class="grip" data-grip aria-label="펼치기/접기"></button>
              <div class="bus-head" data-head></div>
              <div class="bus-trips" data-trips></div>
              <div class="bus-stops" data-stops></div>
              <p class="demo-note" style="margin-top:8px;flex:none">시간표로 계산한 위치예요. 정류장 좌표와 시간은 프로토타입용이에요.</p>
            </section>
          </div>`;
      },
      mount(root) {
        this.root = root; this.follow = false; this.is3d = true; this.labels = {};
        const r = getRoute();
        $$('[data-route]', root).forEach(b => b.onclick = () => { setRoute(b.dataset.route); this.follow = false; this.switchRoute(); });
        $('[data-grip]', root).onclick = () => $('#bus-sheet', root).classList.toggle('min');
        $('[data-3d]', root).onclick = e => {
          this.is3d = !this.is3d; e.currentTarget.classList.toggle('on', this.is3d);
          if (this.map) this.map.easeTo({ pitch: this.is3d ? 58 : 0, bearing: this.is3d ? this.map.getBearing() : 0, duration: 700 });
        };
        $('[data-follow]', root).onclick = e => {
          const run = L.running(getRoute(), secOfDay());
          if (!run.length) { toast('지금 운행 중인 버스가 없어요'); return; }
          this.follow = !this.follow; e.currentTarget.classList.toggle('on', this.follow);
          if (this.follow) { this.lastFollow = 0; $('#bus-sheet', root).classList.add('min'); }
        };
        $('[data-fit]', root).onclick = () => { this.setFollow(false); this.fit(); };
        this.paintSheet();
        if (!window.maplibregl) { $('#bus-fallback', root).hidden = false; return; }
        let map;
        try {
          map = new maplibregl.Map({
            container: $('#bus-map', root), style: MAP_STYLE, center: [r.stops[r.stops.length - 1].lng, r.stops[r.stops.length - 1].lat],
            zoom: 13, pitch: 58, bearing: -18, maxPitch: 75, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
          });
        } catch (e) { $('#bus-fallback', root).hidden = false; return; }
        this.map = map;
        map.on('error', e => console.warn('[bus map]', e && e.error && e.error.message));
        ['dragstart', 'zoomstart', 'rotatestart'].forEach(ev => map.on(ev, e => { if (e.originalEvent) this.setFollow(false); }));
        map.on('load', () => {
          this.ready = true;
          if (!map.getLayer('building-3d')) {
            try {
              map.addLayer({ id: 'bus-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
                paint: { 'fill-extrusion-color': '#dfe3ee', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.8 } });
            } catch (e) { /* 무시 */ }
          }
          map.addSource('routes', { type: 'geojson', data: this.routesGeo() });
          map.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'sel'], true], 9, 0], 'line-opacity': 0.9 } });
          map.addLayer({ id: 'route-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'sel'], true], 5.5, 2.5], 'line-opacity': ['case', ['==', ['get', 'sel'], true], 1, 0.35] } });
          map.addSource('stops', { type: 'geojson', data: this.stopsGeo() });
          map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 3.5, 'circle-stroke-color': ['get', 'color'] } });
          this.paintStopLabels();
          map.addSource('buses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'buses', type: 'fill-extrusion', source: 'buses', paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1 } });
          this.fit(true);
          this.drawBuses();
          L.loadRoads(() => { if (this.map && this.ready) { this.map.getSource('routes').setData(this.routesGeo()); } });
        });
        let lastT = 0;
        const loop = t => { if (!this.map) return; if (t - lastT > 90) { lastT = t; this.drawBuses(); } this.raf = requestAnimationFrame(loop); };
        this.raf = requestAnimationFrame(loop);
      },
      unmount() {
        cancelAnimationFrame(this.raf);
        Object.values(this.labels || {}).forEach(m => m.remove()); this.labels = {};
        (this.stopMarkers || []).forEach(m => m.remove()); this.stopMarkers = [];
        if (this.map) { try { this.map.remove(); } catch (e) { /* 무시 */ } }
        this.map = null; this.ready = false; this.root = null;
      },
      setFollow(v) { this.follow = v; const b = this.root && $('[data-follow]', this.root); if (b) b.classList.toggle('on', v); },
      switchRoute() {
        const root = this.root, r = getRoute();
        $$('[data-route]', root).forEach(b => {
          const on = b.dataset.route === r.id, c = BUS_ROUTES.find(x => x.id === b.dataset.route).color;
          b.classList.toggle('on', on); b.style.background = on ? c : ''; $('i', b).style.background = on ? '#fff' : c;
        });
        this.setFollow(false);
        this.paintSheet(true);
        if (this.ready) { this.map.getSource('routes').setData(this.routesGeo()); this.map.getSource('stops').setData(this.stopsGeo()); this.paintStopLabels(); this.fit(); }
      },
      paintStopLabels() {
        (this.stopMarkers || []).forEach(m => m.remove());
        this.stopMarkers = getRoute().stops.map(s => {
          const el = document.createElement('div'); el.className = 'stop-label'; el.textContent = s.name;
          return new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 10] }).setLngLat([s.lng, s.lat]).addTo(this.map);
        });
      },
      routesGeo() {
        const sel = getRoute().id;
        return { type: 'FeatureCollection', features: BUS_ROUTES.slice().sort((a, b) => (a.id === sel) - (b.id === sel)).map(r => ({ type: 'Feature', properties: { color: r.color, sel: r.id === sel }, geometry: { type: 'LineString', coordinates: L.geom[r.id].coords } })) };
      },
      stopsGeo() {
        const r = getRoute();
        return { type: 'FeatureCollection', features: r.stops.map(s => ({ type: 'Feature', properties: { name: s.name, color: r.color }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) };
      },
      fit(instant) {
        if (!this.map) return;
        const r = getRoute();
        const b = new maplibregl.LngLatBounds();
        L.geom[r.id].coords.forEach(c => b.extend(c));
        const sheetH = this.root ? $('#bus-sheet', this.root).offsetHeight : 200;
        this.map.fitBounds(b, { padding: { top: 120, bottom: Math.min(sheetH, 320) + 30, left: 40, right: 70 }, pitch: this.is3d ? 50 : 0, bearing: this.is3d ? -15 : 0, maxZoom: r.kind === 'campus' ? 16.3 : 15, duration: instant ? 0 : 900 });
      },
      drawBuses() {
        if (!this.ready) return;
        const m = this.map, nowS = secOfDay();
        const z = m.getZoom(), scale = Math.max(1, Math.min(40, Math.pow(2, 16.2 - z)));
        const feats = [], want = {}; const sel = getRoute();
        let followP = null;
        BUS_ROUTES.forEach(r => {
          L.running(r, nowS).forEach(t => {
            const p = L.position(t, nowS); if (!p) return;
            const id = r.id + '@' + t.start;
            feats.push(...boxFeature(p, r.id === sel.id ? scale : scale * 0.8, r.color, id));
            if (r.id === sel.id) {
              want[id] = 1;
              if (!followP) followP = p;
              const os = L.orderedStops(r, t.dir), last = os[os.length - 1];
              const remain = Math.max(0, Math.ceil((t.start + last.min * 60 - nowS) / 60));
              const text = `${r.name} ${L.s2hm(t.start)} · ${last.name} ${remain ? remain + '분' : '곧 도착'}`;
              if (!this.labels[id]) {
                const el = document.createElement('div'); el.className = 'bus-label'; el.style.setProperty('--c', r.color);
                this.labels[id] = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -Math.min(60, 10 + scale * 1.2)] }).setLngLat([p.lng, p.lat]).addTo(m);
              }
              const mk = this.labels[id];
              mk.setLngLat([p.lng, p.lat]); mk.setOffset([0, -Math.min(70, 14 + scale * 1.4)]);
              if (mk.getElement().textContent !== text) mk.getElement().textContent = text;
            }
          });
        });
        Object.keys(this.labels).forEach(k => { if (!want[k]) { this.labels[k].remove(); delete this.labels[k]; } });
        const key = feats.length ? feats.map(f => f.geometry.coordinates[0][0].join()).join('|') + scale.toFixed(2) : '0';
        if (key !== this._lastKey) { m.getSource('buses').setData({ type: 'FeatureCollection', features: feats }); this._lastKey = key; }
        if (this.follow && followP && Date.now() - (this.lastFollow || 0) > 900) {
          this.lastFollow = Date.now();
          m.easeTo({ center: [followP.lng, followP.lat], bearing: followP.bearing, pitch: 64, zoom: Math.max(15.5, Math.min(17, m.getZoom())), duration: 900, easing: x => x });
        } else if (this.follow && !followP) this.setFollow(false);
      },
      paintSheet(force) {
        const root = this.root; if (!root) return;
        const r = getRoute(), nowS = secOfDay();
        const f = L.focusTrip(r, nowS), t = f.trip;
        const os = L.orderedStops(r, t.dir);
        const head = $('[data-head]', root), trips = $('[data-trips]', root), stops = $('[data-stops]', root);
        let right;
        if (f.state === 'running') { const last = os[os.length - 1]; const rem = t.start + last.min * 60 - nowS; right = `<b>${rem < 60 ? '곧' : Math.ceil(rem / 60) + '분'}</b><small>${esc(last.name)} 도착까지</small>`; }
        else if (f.state === 'next') { const rem = t.start - nowS; right = `<b>${rem < 60 ? '곧' : rem >= 3600 ? L.s2hm(t.start) : Math.ceil(rem / 60) + '분'}</b><small>${rem >= 3600 ? '다음 출발' : '뒤 출발'}</small>`; }
        else right = `<span class="off">오늘 운행 끝</span><small>내일 첫차 ${L.s2hm(t.start)}</small>`;
        const hh = `<div class="l"><small>${esc(L.dirLabel(r, t.dir))}</small><strong style="color:${r.color}">${esc(r.name)} ${r.kind === 'campus' ? '' : '통학버스'}</strong></div><div class="r">${right}</div>`;
        if (force || head.dataset.h !== hh) { head.innerHTML = hh; head.dataset.h = hh; }
        const all = L.TRIPS[r.id];
        const th = all.map(x => `<span class="${x.end < nowS ? 'past' : ''} ${nowS >= x.start && nowS <= x.end ? 'live' : ''}">${L.s2hm(x.start)} ${r.kind === 'campus' ? '' : x.dir === 'to' ? '등교' : '하교'}</span>`).join('');
        if (force || trips.dataset.h !== th) { trips.innerHTML = th; trips.dataset.h = th; const live = $('.live', trips) || [...trips.children].find(c => !c.classList.contains('past')); if (live && force) trips.scrollLeft = live.offsetLeft - 16; }
        const sh = os.map(s => {
          const at = t.start + s.min * 60, e = at - nowS;
          let txt, past = false;
          if (f.state === 'tomorrow') txt = L.s2hm(at);
          else if (f.state === 'next') txt = L.s2hm(at);
          else if (e < -30) { txt = '통과'; past = true; } else if (e < 60) txt = '곧 도착'; else txt = Math.ceil(e / 60) + '분';
          return `<button class="bus-stop" data-stop="${s.idx}" style="--c:${r.color}"><i></i><strong>${esc(s.name)}</strong><span class="${past ? 'past' : ''}">${txt}</span></button>`;
        }).join('');
        if (force || stops.dataset.h !== sh) {
          stops.innerHTML = sh; stops.dataset.h = sh;
          $$('[data-stop]', stops).forEach(b => b.onclick = () => {
            const s = r.stops[+b.dataset.stop]; this.setFollow(false);
            if (this.map) this.map.flyTo({ center: [s.lng, s.lat], zoom: 16.5, pitch: this.is3d ? 60 : 0, duration: 1000 });
          });
        }
      },
      update() { this.paintSheet(); },
    };
    return Bus;
  };
})();
