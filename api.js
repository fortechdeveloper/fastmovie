/* ============================================================
   FASTMOVIE — API.JS (Perbaikan CORS Proxy)
   Wrapper rizky.web.id + auto CORS fallback
   ============================================================ */

const FastMovieAPI = (function () {
  'use strict';

  const BASE = 'https://www.rizky.web.id';
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';

  // CORS proxy fallback (diurutkan dari yang paling andal)
  // Format: proxyPrefix + encodeURIComponent(targetUrl)
  const PROXIES = [
    null, // 1. Coba direct dulu (siapa tahu CORS sudah dibuka)
    'https://corsproxy.io/?url=', // 2. Proxy andal
    'https://api.codetabs.com/v1/proxy?quest=', // 3. Alternatif
    'https://api.allorigins.win/raw?url=' // 4. Fallback terakhir
  ];

  let workingProxy = null;
  let proxyTested = false;

  /* ---------- HTTP JSON GET ---------- */
  async function requestJson(url) {
    const opts = {
      headers: { 'Accept': 'application/json' },
      credentials: 'omit',
      mode: 'cors'
    };

    // Jika sudah ada proxy yang bekerja, langsung pakai
    if (proxyTested && workingProxy !== undefined) {
      const target = workingProxy ? workingProxy + encodeURIComponent(url) : url;
      const res = await fetch(target, opts);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    // Coba berurutan
    let lastErr = null;
    for (const proxy of PROXIES) {
      try {
        const target = proxy ? proxy + encodeURIComponent(url) : url;
        const res = await fetch(target, opts);
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        const data = await res.json();
        
        // Validasi apakah respons berisi data yang diharapkan
        if (data && (data.results || data.status || data.data)) {
            workingProxy = proxy;
            proxyTested = true;
            console.log('API Proxy bekerja:', proxy || 'Direct');
            return data;
        }
      } catch (e) {
        lastErr = e;
        // Lanjut ke proxy berikutnya
      }
    }
    proxyTested = true;
    throw lastErr || new Error('Gagal terhubung ke server API (CORS/Network)');
  }

  /* ---------- IMAGE URL ---------- */
  function posterUrl(path, size = 'w500') {
    if (!path) return '';
    if (typeof path !== 'string') return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return TMDB_IMG + size + path;
    return TMDB_IMG + size + '/' + path;
  }

  /* ---------- SLUG BUILDER ---------- */
  function slugFor(item) {
    if (!item) return null;
    if (item.slug) return item.slug;
    if (item.url && typeof item.url === 'string') {
      const m = item.url.match(/(movie|tv)-\d+/);
      if (m) return m[0];
    }
    const type = item.media_type
      || (item.first_air_date || item.name ? 'tv' : 'movie');
    if (item.id) return type + '-' + item.id;
    return null;
  }

  /* ---------- API ENDPOINTS ---------- */
  async function search(query, page = 1) {
    const url = `${BASE}/api/search?q=${encodeURIComponent(query)}&page=${page}`;
    return requestJson(url);
  }

  async function list(kind = 'trending', type = 'all') {
    const url = `${BASE}/api/list?kind=${encodeURIComponent(kind)}&type=${encodeURIComponent(type)}`;
    return requestJson(url);
  }

  async function detail(slug) {
    const url = `${BASE}/api/detail?slug=${encodeURIComponent(slug)}`;
    return requestJson(url);
  }

  async function episodes(slug, season = 1) {
    const url = `${BASE}/api/episodes?slug=${encodeURIComponent(slug)}&season=${season}`;
    return requestJson(url);
  }

  /* ---------- EMBED SERVER GENERATOR ---------- */
  function embedServers(tmdbId, isTv, season = 1, episode = 1, imdbId = '') {
    const S = season || 1, E = episode || 1;
    if (isTv) {
      return [
        { server: 'VidSrcWiki', url: `https://vidsrc.wiki/embed/tv/${tmdbId}/${S}/${E}` },
        { server: 'SuperEmbed', url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${S}&e=${E}` },
        { server: 'VidSrc', url: `https://vidsrc.to/embed/tv/${tmdbId}/${S}/${E}` },
        { server: 'VidLink', url: `https://vidlink.pro/tv/${tmdbId}/${S}/${E}` },
        { server: '2Embed', url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${S}&e=${E}` },
        { server: 'VidFast', url: `https://vidfast.vc/tv/${tmdbId}/${S}/${E}` }
      ];
    }
    return [
      { server: 'VidSrcWiki', url: `https://vidsrc.wiki/embed/movie/${tmdbId}` },
      { server: 'SuperEmbed', url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` },
      { server: 'VidSrc', url: `https://vidsrc.to/embed/movie/${tmdbId}` },
      { server: 'VidLink', url: `https://vidlink.pro/movie/${tmdbId}` },
      { server: '2Embed', url: `https://www.2embed.cc/embed/${tmdbId}` },
      { server: 'VidFast', url: `https://vidfast.vc/movie/${tmdbId}` }
    ];
  }

  return { search, list, detail, episodes, embedServers, posterUrl, slugFor, BASE };
})();