/* ============================================================
   FASTMOVIE — APP.JS
   Logika utama + UI rendering
   ============================================================ */

(function () {
  'use strict';

  /* ---------------- STATE ---------------- */
  const state = {
    page: 'home',
    lib: 'watchlist',
    watchlist: loadJSON('fm_watchlist', []),
    history: loadJSON('fm_history', []),
    currentDetail: null,
    currentSeason: 1,
    currentServers: [],
    currentServerIdx: 0,
    searchTimer: null,
    heroTimer: null,
    heroIndex: 0,
    loadedHome: false
  };

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------------- STORAGE ---------------- */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  /* ---------------- UTIL ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  let toastTimer = null;
  function toast(msg, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function isInWatchlist(slug) {
    return state.watchlist.some(w => w.slug === slug);
  }
  function toggleWatchlist(normalized) {
    const idx = state.watchlist.findIndex(w => w.slug === normalized.slug);
    if (idx >= 0) { state.watchlist.splice(idx, 1); saveJSON('fm_watchlist', state.watchlist); return false; }
    state.watchlist.unshift(normalized);
    saveJSON('fm_watchlist', state.watchlist);
    return true;
  }
  function addHistory(normalized) {
    const idx = state.history.findIndex(w => w.slug === normalized.slug);
    if (idx >= 0) state.history.splice(idx, 1);
    state.history.unshift({ ...normalized, watchedAt: Date.now() });
    if (state.history.length > 60) state.history.pop();
    saveJSON('fm_history', state.history);
  }

  /* ---------------- NORMALIZE ITEM ---------------- */
  function normalizeItem(item) {
    if (!item) return null;
    const isTv = item.media_type === 'tv'
      || !!item.first_air_date
      || !!item.name
      || item.type === 'Series';
    const title = item.title || item.name || 'Untitled';
    const poster = FastMovieAPI.posterUrl(item.poster_path || item.poster);
    const backdrop = FastMovieAPI.posterUrl(
      item.backdrop_path || item.backdrop || item.poster_path || item.poster,
      'w780'
    );
    const dateStr = item.release_date || item.first_air_date || item.air_date || '';
    const year = dateStr ? String(dateStr).slice(0, 4) : '';
    const rating = item.vote_average || item.rating
      ? Number(item.vote_average || item.rating).toFixed(1)
      : '—';
    const slug = FastMovieAPI.slugFor(item);
    return {
      raw: item,
      id: item.id,
      slug,
      isTv,
      title,
      poster,
      backdrop,
      year,
      rating,
      overview: item.overview || ''
    };
  }

  /* ---------------- RENDER MOVIE CARD ---------------- */
  function createMovieCard(item) {
    const n = normalizeItem(item);
    if (!n) return null;

    const card = document.createElement('div');
    card.className = 'movie-card';

    const initial = n.title.charAt(0).toUpperCase();
    const posterHTML = n.poster
      ? `<img src="${esc(n.poster)}" alt="${esc(n.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
         <div class="fallback" style="display:none">${esc(initial)}</div>`
      : `<div class="fallback">${esc(initial)}</div>`;

    card.innerHTML = `
      <div class="movie-card-poster">
        ${posterHTML}
        <div class="movie-card-type">${n.isTv ? 'Series' : 'Film'}</div>
        <div class="movie-card-rating">${esc(n.rating)}</div>
      </div>
      <div class="movie-card-info">
        <div class="movie-card-title">${esc(n.title)}</div>
        <div class="movie-card-year">${esc(n.year || '—')}</div>
      </div>
    `;

    card.addEventListener('click', () => openDetail(n.slug, n));
    return card;
  }

  /* ---------------- RENDER ROW ---------------- */
  function renderRow(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!items || !items.length) {
      container.innerHTML = `
        <div class="empty-state" style="width:100%;padding:30px 12px">
          <div class="empty-title">Belum ada data</div>
          <div class="empty-desc">Coba lagi nanti</div>
        </div>`;
      return;
    }

    items.forEach(item => {
      const card = createMovieCard(item);
      if (card) container.appendChild(card);
    });
  }

  function renderRowSkeleton(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="skeleton-row">
        ${'<div class="skeleton-card"></div>'.repeat(5)}
      </div>`;
  }

  /* ---------------- HERO ---------------- */
  function renderHero(items) {
    const track = $('#heroTrack');
    const dots = $('#heroDots');
    track.innerHTML = '';
    dots.innerHTML = '';

    if (!items || !items.length) return;

    items.slice(0, 6).forEach((item, i) => {
      const n = normalizeItem(item);
      if (!n) return;

      const card = document.createElement('div');
      card.className = 'hero-card';
      const img = n.backdrop || n.poster;
      card.innerHTML = `
        ${img ? `<img src="${esc(img)}" alt="${esc(n.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        <div class="hero-card-grad"></div>
        <div class="hero-card-content">
          <div class="hero-card-badge">Featured</div>
          <div class="hero-card-title">${esc(n.title)}</div>
          <div class="hero-card-meta">
            <span>${esc(n.year || '—')}</span>
            <span class="dot">•</span>
            <span>${n.isTv ? 'Series' : 'Film'}</span>
            <span class="dot">•</span>
            <span>★ ${esc(n.rating)}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => openDetail(n.slug, n));
      track.appendChild(card);

      const dot = document.createElement('div');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => scrollHeroTo(i));
      dots.appendChild(dot);
    });

    // Update dots on scroll
    let scrollTimer = null;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const cards = track.querySelectorAll('.hero-card');
        if (!cards.length) return;
        const center = track.scrollLeft + track.clientWidth / 2;
        let closest = 0, min = Infinity;
        cards.forEach((c, idx) => {
          const cc = c.offsetLeft + c.offsetWidth / 2;
          const d = Math.abs(cc - center);
          if (d < min) { min = d; closest = idx; }
        });
        state.heroIndex = closest;
        dots.querySelectorAll('.hero-dot').forEach((d, idx) => {
          d.classList.toggle('active', idx === closest);
        });
      }, 80);
    }, { passive: true });

    startHeroAuto();
  }

  function scrollHeroTo(idx) {
    const track = $('#heroTrack');
    const cards = track.querySelectorAll('.hero-card');
    if (!cards[idx]) return;
    const c = cards[idx];
    const target = c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2;
    track.scrollTo({ left: target, behavior: 'smooth' });
  }

  function startHeroAuto() {
    stopHeroAuto();
    state.heroTimer = setInterval(() => {
      if (state.page !== 'home') return;
      const cards = $$('#heroTrack .hero-card');
      if (cards.length < 2) return;
      state.heroIndex = (state.heroIndex + 1) % cards.length;
      scrollHeroTo(state.heroIndex);
    }, 5000);
  }
  function stopHeroAuto() {
    if (state.heroTimer) { clearInterval(state.heroTimer); state.heroTimer = null; }
  }

  /* ---------------- HOME LOADER ---------------- */
  async function loadHome() {
    if (state.loadedHome) return;
    state.loadedHome = true;

    renderRowSkeleton('rowTrending');
    renderRowSkeleton('rowLatest');
    renderRowSkeleton('rowToprated');
    renderRowSkeleton('rowUpcoming');

    // Trending (isi hero + row)
    try {
      const trending = await FastMovieAPI.list('trending', 'all');
      const items = trending.results || [];
      renderHero(items);
      renderRow('rowTrending', items);
    } catch (e) {
      console.error('Trending error:', e);
      $('#heroTrack').innerHTML = '';
      renderRow('rowTrending', []);
      toast('Gagal memuat trending');
    }

    // Latest
    try {
      const latest = await FastMovieAPI.list('latest', 'all');
      renderRow('rowLatest', latest.results || []);
    } catch (e) {
      renderRow('rowLatest', []);
    }

    // Top Rated
    try {
      const top = await FastMovieAPI.list('toprated', 'all');
      renderRow('rowToprated', top.results || []);
    } catch (e) {
      renderRow('rowToprated', []);
    }

    // Upcoming
    try {
      const up = await FastMovieAPI.list('upcoming', 'all');
      renderRow('rowUpcoming', up.results || []);
    } catch (e) {
      renderRow('rowUpcoming', []);
    }
  }

  /* ---------------- NAV ---------------- */
  function initNav() {
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nav;
        if (target === state.page) return;
        switchPage(target);
      });
    });
  }

  function switchPage(name) {
    state.page = name;
    stopHeroAuto();
    $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === name));

    if (name === 'home') {
      startHeroAuto();
      if (!state.loadedHome) loadHome();
    }
    if (name === 'library') renderLibrary();
    if (name === 'search') setTimeout(() => $('#searchInput').focus(), 100);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshStats();
  }

  /* ---------------- SEARCH ---------------- */
  function initSearch() {
    const input = $('#searchInput');
    const clear = $('#searchClear');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clear.classList.toggle('show', q.length > 0);
      clearTimeout(state.searchTimer);
      if (!q) { renderSearchEmpty(true); return; }
      state.searchTimer = setTimeout(() => doSearch(q), 450);
    });

    clear.addEventListener('click', () => {
      input.value = '';
      clear.classList.remove('show');
      renderSearchEmpty(true);
      input.focus();
    });

    renderSearchEmpty(true);
  }

  function renderSearchEmpty(isInitial) {
    const el = $('#searchResults');
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <div class="empty-title">${isInitial ? 'Cari film favoritmu' : 'Tidak ada hasil'}</div>
        <div class="empty-desc">${isInitial ? 'Ketik judul film atau serial di atas' : 'Coba kata kunci lain'}</div>
      </div>`;
  }

  async function doSearch(q) {
    const el = $('#searchResults');
    el.innerHTML = `
      <div class="skeleton-row">
        ${'<div class="skeleton-card"></div>'.repeat(6)}
      </div>`;

    try {
      const res = await FastMovieAPI.search(q, 1);
      const items = res.results || [];
      if (!items.length) { renderSearchEmpty(false); return; }

      const grid = document.createElement('div');
      grid.className = 'search-results-grid';
      items.forEach(item => {
        const card = createMovieCard(item);
        if (card) grid.appendChild(card);
      });
      el.innerHTML = '';
      el.appendChild(grid);
    } catch (e) {
      console.error('Search error:', e);
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Gagal mencari</div>
          <div class="empty-desc">Periksa koneksi atau coba lagi</div>
        </div>`;
    }
  }

  /* ---------------- LIBRARY ---------------- */
  function initLibTabs() {
    $$('.lib-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.lib = tab.dataset.lib;
        $$('.lib-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderLibrary();
      });
    });
  }

  function renderLibrary() {
    const el = $('#libBody');
    const list = state.lib === 'watchlist' ? state.watchlist : state.history;

    if (!list.length) {
      const msg = state.lib === 'watchlist'
        ? { title: 'Watchlist kosong', desc: 'Tambahkan film ke watchlist dari halaman detail' }
        : { title: 'Belum ada riwayat', desc: 'Film yang kamu tonton akan muncul di sini' };
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <div class="empty-title">${msg.title}</div>
          <div class="empty-desc">${msg.desc}</div>
        </div>`;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'lib-grid';
    list.forEach(n => {
      const card = createMovieCard({ ...n.raw });
      if (card) grid.appendChild(card);
    });
    el.innerHTML = '';
    el.appendChild(grid);
  }

  /* ---------------- PROFILE STATS ---------------- */
  function refreshStats() {
    $('#statWatched').textContent = state.history.length;
    $('#statList').textContent = state.watchlist.length;
    const hours = Math.round(state.history.length * 1.8);
    $('#statHours').textContent = hours + 'j';
  }

  /* ---------------- DETAIL ---------------- */
  function openDetail(slug, preview = null) {
    if (!slug) { toast('Data tidak lengkap'); return; }

    const sheet = $('#detailSheet');
    const scroll = $('#detailScroll');
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Skeleton
    scroll.innerHTML = `
      <div class="detail-hero"><div class="skeleton-card" style="border-radius:0;width:100%;height:100%"></div></div>
      <div class="detail-content" style="margin-top:20px">
        <div class="empty-title" style="margin-bottom:8px">Memuat…</div>
      </div>`;

    // Set preview sementara
    if (preview) {
      state.currentDetail = preview;
    }

    loadDetail(slug);
  }

  async function loadDetail(slug) {
    try {
      const res = await FastMovieAPI.detail(slug);
      if (!res || !res.status || !res.data) {
        throw new Error(res && res.message || 'Data tidak ditemukan');
      }
      const data = res.data;
      const isTv = data.type === 'Series' || slug.startsWith('tv-');
      const tmdbId = data.id || (slug.match(/\d+/) || [])[0];
      const imdbId = data.imdb_id || data.imdbId || '';

      const normalized = {
        raw: data,
        slug,
        id: data.id,
        tmdbId,
        imdbId,
        isTv,
        title: data.title || data.name || 'Untitled',
        poster: FastMovieAPI.posterUrl(data.poster_path || data.poster),
        backdrop: FastMovieAPI.posterUrl(
          data.backdrop_path || data.backdrop || data.poster_path,
          'w1280'
        ),
        year: (data.release_date || data.first_air_date || '').slice(0, 4),
        rating: data.vote_average ? Number(data.vote_average).toFixed(1) : '—',
        runtime: data.runtime
          ? data.runtime + 'm'
          : (data.episode_run_time && data.episode_run_time[0]
              ? data.episode_run_time[0] + 'm' : ''),
        genres: (data.genres || [])
          .map(g => typeof g === 'string' ? g : g.name)
          .filter(Boolean),
        overview: data.overview || data.description || '',
        seasons: data.number_of_seasons
          || (Array.isArray(data.seasons) ? data.seasons.filter(s => s.season_number > 0).length : (isTv ? 1 : 0))
      };

      state.currentDetail = normalized;
      state.currentSeason = 1;

      renderDetail(normalized);
    } catch (e) {
      console.error('Detail error:', e);
      $('#detailScroll').innerHTML = `
        <div class="empty-state" style="padding-top:120px">
          <div class="empty-title">Gagal memuat detail</div>
          <div class="empty-desc">${esc(e.message || 'Coba lagi')}</div>
        </div>`;
    }
  }

  function renderDetail(n) {
    const scroll = $('#detailScroll');
    const initial = n.title.charAt(0).toUpperCase();

    const backdropHTML = n.backdrop
      ? `<img src="${esc(n.backdrop)}" alt="${esc(n.title)}" onerror="this.style.display='none'">`
      : '';

    const genresHTML = n.genres.length
      ? `<div class="detail-genres">${n.genres.map(g => `<span class="genre-chip">${esc(g)}</span>`).join('')}</div>`
      : '';

    const runtimeHTML = n.runtime ? `<span class="dot">•</span><span>${esc(n.runtime)}</span>` : '';
    const yearHTML = n.year ? `<span>${esc(n.year)}</span>` : '';
    const inList = isInWatchlist(n.slug);

    scroll.innerHTML = `
      <div class="detail-hero">
        ${backdropHTML}
        <div class="detail-hero-grad"></div>
      </div>
      <div class="detail-content">
        <h1 class="detail-title">${esc(n.title)}</h1>
        <div class="detail-meta">
          ${yearHTML}
          ${runtimeHTML}
          <span class="dot">•</span>
          <span class="rating-pill">${esc(n.rating)}</span>
          <span class="dot">•</span>
          <span>${n.isTv ? 'Series' : 'Film'}</span>
        </div>
        ${genresHTML}
        ${n.overview ? `<p class="detail-desc">${esc(n.overview)}</p>` : ''}
        <div class="detail-actions">
          <button class="btn-primary clay" id="btnPlayDetail">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>Tonton</span>
          </button>
          <button class="btn-ghost glass clay ${inList ? 'added' : ''}" id="btnWatchlistDetail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${inList ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'}
            </svg>
            <span>${inList ? 'Tersimpan' : 'Watchlist'}</span>
          </button>
        </div>

        ${n.isTv ? `
          <div id="tvEpisodesBlock">
            <h3 class="detail-sub">Episode</h3>
            <div class="season-tabs" id="seasonTabs"></div>
            <div class="episode-list" id="episodeList">
              <div class="empty-desc" style="padding:20px 0">Memuat episode…</div>
            </div>
          </div>
        ` : ''}

        <h3 class="detail-sub">Server Streaming</h3>
        <div class="server-list" id="serverList"></div>

        <div id="similarBlock">
          <h3 class="detail-sub">Mirip dengan ini</h3>
          <div class="similar-grid" id="similarGrid"></div>
        </div>
      </div>
    `;

    // Server list (film)
    renderServerChips(n, 1, 1);

    // Actions
    $('#btnPlayDetail').addEventListener('click', () => playMovie(n, 1, 1));
    $('#btnWatchlistDetail').addEventListener('click', () => {
      const added = toggleWatchlist(n);
      const btn = $('#btnWatchlistDetail');
      btn.classList.toggle('added', added);
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${added ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'}
        </svg>
        <span>${added ? 'Tersimpan' : 'Watchlist'}</span>`;
      toast(added ? 'Ditambahkan ke Watchlist' : 'Dihapus dari Watchlist');
      refreshStats();
      if (state.page === 'library') renderLibrary();
    });

    // TV episodes
    if (n.isTv) {
      renderSeasonTabs(n);
      loadEpisodes(n, 1);
    }

    // Similar
    loadSimilar(n);
  }

  function renderServerChips(n, season, episode) {
    const list = $('#serverList');
    if (!list) return;

    const servers = FastMovieAPI.embedServers(n.tmdbId, n.isTv, season, episode, n.imdbId);
    state.currentServers = servers;

    list.innerHTML = servers.map((s, i) => `
      <button class="server-chip ${i === 0 ? 'active' : ''}" data-idx="${i}">${esc(s.server)}</button>
    `).join('');

    list.querySelectorAll('.server-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        list.querySelectorAll('.server-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentServerIdx = parseInt(chip.dataset.idx, 10);
      });
    });
  }

  function renderSeasonTabs(n) {
    const el = $('#seasonTabs');
    if (!el) return;
    const total = Math.max(1, n.seasons || 1);
    el.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const btn = document.createElement('button');
      btn.className = 'season-tab' + (i === 1 ? ' active' : '');
      btn.textContent = 'Season ' + i;
      btn.addEventListener('click', () => {
        el.querySelectorAll('.season-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentSeason = i;
        loadEpisodes(n, i);
      });
      el.appendChild(btn);
    }
  }

  async function loadEpisodes(n, season) {
    const listEl = $('#episodeList');
    if (!listEl) return;
    listEl.innerHTML = `<div class="empty-desc" style="padding:20px 0">Memuat episode…</div>`;

    try {
      const res = await FastMovieAPI.episodes(n.slug, season);
      if (!res || !res.status || !res.results || !res.results.length) {
        listEl.innerHTML = `<div class="empty-desc" style="padding:20px 0">Episode tidak tersedia</div>`;
        return;
      }

      listEl.innerHTML = '';
      res.results.forEach((ep, idx) => {
        const epNum = ep.episode || ep.episode_number || (idx + 1);
        const epName = ep.name || ep.title || ('Episode ' + epNum);
        const still = FastMovieAPI.posterUrl(ep.still_path || ep.still, 'w300');
        const runtime = ep.runtime ? ep.runtime + 'm' : '';
        const airDate = (ep.air_date || '').slice(0, 10);

        const item = document.createElement('button');
        item.className = 'episode-item';
        item.innerHTML = `
          <div class="episode-thumb">
            ${still ? `<img src="${esc(still)}" alt="${esc(epName)}" loading="lazy">` : ''}
          </div>
          <div class="episode-info">
            <div class="episode-num">E${epNum}</div>
            <div class="episode-name">${esc(epName)}</div>
            <div class="episode-meta">${esc([airDate, runtime].filter(Boolean).join(' • '))}</div>
          </div>
        `;
        item.addEventListener('click', () => playMovie(n, season, epNum));
        listEl.appendChild(item);
      });
    } catch (e) {
      console.error('Episodes error:', e);
      listEl.innerHTML = `<div class="empty-desc" style="padding:20px 0">Gagal memuat episode</div>`;
    }
  }

  async function loadSimilar(n) {
    const grid = $('#similarGrid');
    if (!grid) return;
    try {
      // Gunakan judul -> search untuk rekomendasi sederhana
      const keyword = (n.title.split(' ').slice(0, 3).join(' ')) || n.title;
      const res = await FastMovieAPI.search(keyword, 1);
      const items = (res.results || []).filter(r => String(r.id) !== String(n.id)).slice(0, 6);
      grid.innerHTML = '';
      items.forEach(item => {
        const card = createMovieCard(item);
        if (card) grid.appendChild(card);
      });
      if (!items.length) {
        grid.innerHTML = `<div class="empty-desc" style="grid-column:1/-1;padding:20px 0">Belum ada rekomendasi</div>`;
      }
    } catch (e) {
      grid.innerHTML = `<div class="empty-desc" style="grid-column:1/-1;padding:20px 0">—</div>`;
    }
  }

  function closeDetail() {
    $('#detailSheet').classList.remove('open');
    document.body.style.overflow = '';
    state.currentDetail = null;
  }

  /* ---------------- PLAYER ---------------- */
  function playMovie(n, season = 1, episode = 1) {
    const servers = FastMovieAPI.embedServers(n.tmdbId, n.isTv, season, episode, n.imdbId);
    if (!servers.length) { toast('Server tidak tersedia'); return; }

    state.currentServers = servers;
    state.currentServerIdx = 0;

    const title = n.isTv
      ? `${n.title} — S${season}E${episode}`
      : n.title;
    $('#playerTitle').textContent = title;

    // Server chips
    const serverBar = $('#playerServers');
    serverBar.innerHTML = servers.map((s, i) => `
      <button class="server-chip ${i === 0 ? 'active' : ''}" data-idx="${i}">${esc(s.server)}</button>
    `).join('');
    serverBar.querySelectorAll('.server-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        serverBar.querySelectorAll('.server-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentServerIdx = parseInt(chip.dataset.idx, 10);
        loadServerFrame();
      });
    });

    // Buka player
    const player = $('#player');
    player.classList.add('open');
    document.body.style.overflow = 'hidden';

    loadServerFrame();

    // History
    addHistory(n);
    refreshStats();
  }

  function loadServerFrame() {
    const iframe = $('#playerFrame');
    const loading = $('#playerLoading');
    const s = state.currentServers[state.currentServerIdx];
    if (!s) return;

    loading.classList.remove('hide');
    iframe.src = s.url;

    // Timer fallback kalau load terlalu lama
    const timer = setTimeout(() => loading.classList.add('hide'), 6000);
    iframe.onload = () => {
      clearTimeout(timer);
      loading.classList.add('hide');
    };
  }

  function closePlayer() {
    const player = $('#player');
    player.classList.remove('open');
    const iframe = $('#playerFrame');
    iframe.src = 'about:blank';
    document.body.style.overflow = '';
  }

  /* ---------------- REFRESH ---------------- */
  async function refreshHome() {
    state.loadedHome = false;
    $('#heroTrack').innerHTML = '';
    $('#heroDots').innerHTML = '';
    ['rowTrending', 'rowLatest', 'rowToprated', 'rowUpcoming'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    await loadHome();
    toast('Diperbarui');
  }

  /* ---------------- INIT ---------------- */
  function init() {
    // Splash
    setTimeout(() => {
      $('#splash').classList.add('hide');
      $('#app').hidden = false;
      setTimeout(() => {
        $('#splash').style.display = 'none';
        loadHome();
        refreshStats();
      }, 400);
    }, 1200);

    initNav();
    initSearch();
    initLibTabs();

    // Refresh button
    $('#btnRefresh').addEventListener('click', refreshHome);

    // Detail close
    $('#detailClose').addEventListener('click', closeDetail);

    // Player controls
    $('#playerBack').addEventListener('click', closePlayer);
    $('#playerExternal').addEventListener('click', () => {
      const s = state.currentServers[state.currentServerIdx];
      if (s) window.open(s.url, '_blank', 'noopener');
    });

    // Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('#player').classList.contains('open')) closePlayer();
        else if ($('#detailSheet').classList.contains('open')) closeDetail();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();