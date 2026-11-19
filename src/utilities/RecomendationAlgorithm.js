// Single-user, on-device hybrid recommender for MyMusic.
//
// The pipeline follows the same shape as the offline scaled down to one person's local library:
//
//   1. Implicit feedback - plays, completion, skips, favorites and playlists,
//      each decayed over time so taste is allowed to drift.
//   2. Content model     - TF-IDF over artist / album / genre / composer /
//      title / era, L2-normalised so a dot product is cosine similarity.
//   3. Collaborative     - playlist co-occurrence plus first-order listening
//      transitions (a Markov chain recorded from real playback sessions).
//   4. Taste profile     - engagement/recency weighted centroid of the tracks
//      that best represent what the listener likes right now.
//   5. Scoring           - adaptive mixture of content, collaborative,
//      transition and affinity, blended with cold-start discovery/popularity.
//   6. Diversification   - MMR plus artist/album caps, a duplicate guard and a
//      single exploration slot so the list never turns into one artist.
//
// Nothing here is uploaded; all state lives in localStorage on this machine.
(() => {
  'use strict';

  const STORAGE_KEY = 'musicListeningStats';
  const TRANSITION_KEY = 'musicListeningTransitions';

  const TRACK_LIMIT = 3000;
  const TRANSITION_LIMIT = 4000;
  const RESULT_LIMIT = 10;
  const MAX_SEEDS = 30;
  const MAX_POOL = 120;
  const MAX_PLAYLIST_TRACKS = 80;

  const DAY = 86400000;
  const HALF_LIFE_DAYS = 21;
  const EDGE_HALF_LIFE_DAYS = 90;
  const SESSION_GAP_MS = 30 * 60 * 1000;
  const RECENT_REPEAT_MS = 20 * 60 * 1000;
  const MMR_LAMBDA = 0.72;

  const FIELD_WEIGHT = { artist: 3, album: 1.6, genre: 1.35, composer: 1, title: 0.5, era: 0.7 };
  const BASE_WEIGHT = { content: 0.3, collaborative: 0.2, transition: 0.17, affinity: 0.2, discovery: 0.08, popularity: 0.05 };
  const TITLE_NOISE = new Set([
    'the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'for', 'with', 'feat', 'ft',
    'remaster', 'remastered', 'version', 'edit', 'mix', 'live', 'from', 'official',
    'audio', 'video', 'lyrics', 'explicit'
  ]);
  const UNKNOWN = /^(unknown(?:\s+(?:artist|album|composer|genre))?|various artists?|n\/a|na|none|null|untitled)?$/i;

  const clamp01 = value => value < 0 ? 0 : value > 1 ? 1 : value;
  const safe = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const keyOf = value => String(value || '').toLocaleLowerCase();
  const norm = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const words = value => norm(value).match(/[\p{L}\p{N}]+/gu) || [];

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function artistNames(value) {
    const raw = norm(value);
    if (!raw || UNKNOWN.test(raw)) return [];
    const names = new Set([raw]);
    for (const part of raw.split(/\s*(?:,|&|;|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/)) {
      const name = part.trim();
      if (name.length > 1 && name !== raw) names.add(name);
    }
    return [...names];
  }

  function genreNames(value) {
    if (Array.isArray(value)) return [...new Set(value.flatMap(genreNames))];
    const raw = norm(value);
    if (!raw || UNKNOWN.test(raw)) return [];
    const names = new Set();
    for (const part of raw.split(/[,/;&|]+/)) {
      const phrase = part.replace(/\s+/g, ' ').trim();
      if (!phrase) continue;
      names.add(phrase);
      for (const word of words(phrase)) if (word.length > 2) names.add(word);
    }
    return [...names];
  }

  function titleNames(value) {
    const names = new Set();
    for (const word of words(value)) if (word.length > 2 && !TITLE_NOISE.has(word)) names.add(word);
    return [...names];
  }

  function eraNames(year) {
    const value = Number(year);
    if (!Number.isFinite(value) || value < 1900 || value > 2100) return [];
    return [String(Math.floor(value / 10) * 10)];
  }

  function artistKey(track) {
    const raw = norm(track?.artist);
    if (!raw || UNKNOWN.test(raw)) return '';
    return raw.split(/\s*(?:,|&|;|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/)[0] || raw;
  }

  function titleKey(track) {
    return norm(track?.title || track?.filename || '').replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function dot(left, right) {
    if (!left?.size || !right?.size) return 0;
    if (left.size > right.size) { const swap = left; left = right; right = swap; }
    let sum = 0;
    for (const [key, value] of left) {
      const other = right.get(key);
      if (other) sum += value * other;
    }
    return sum;
  }

  function normalise(values) {
    if (!values.length) return values;
    let min = Infinity, max = -Infinity;
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const span = max - min;
    if (!(span > 1e-9)) return values.map(() => 0);
    return values.map(value => (value - min) / span);
  }

  function create({ getTracks, getFavorites, getPlaylists, storage = localStorage }) {
    const statMap = new Map();            // path key -> lifetime counters
    const transitions = new Map();        // path key -> Map<path key, { n, t }>
    const recentSession = [];             // last played paths, newest last
    const rawCache = new WeakMap();       // track object -> extracted raw tokens

    let activePath = null;
    let listenedSeconds = 0;
    let savedAt = 0;
    let dataVersion = 0;         // bumps on any feedback change (cache busting)
    let modelVersion = 0;        // bumps only when track metadata changes
    let transitionVersion = 0;

    let lastFinishedPath = null;
    let lastFinishedAt = 0;
    let lastFinishedSkipped = false;

    let modelCache = null;
    let playlistCache = null;
    let transitionCache = null;
    let resultCache = { key: '', paths: [] };

    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [pathKey, value] of Object.entries(saved)) {
          if (!pathKey) continue;
          statMap.set(keyOf(pathKey), {
            plays: safe(value?.plays),
            completed: safe(value?.completed),
            skipped: safe(value?.skipped),
            listenedSeconds: safe(value?.listenedSeconds),
            listenRatioTotal: safe(value?.listenRatioTotal),
            sessions: safe(value?.sessions),
            lastPlayedAt: safe(value?.lastPlayedAt),
            lastSkippedAt: safe(value?.lastSkippedAt)
          });
        }
      }
    } catch {}

    try {
      const saved = JSON.parse(storage.getItem(TRANSITION_KEY) || '[]');
      if (Array.isArray(saved)) {
        for (const row of saved) {
          if (!Array.isArray(row) || row.length < 4) continue;
          const [from, to, count, at] = row;
          if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to) continue;
          addEdge(keyOf(from), keyOf(to), Math.max(0, safe(count)), safe(at), false);
        }
      }
    } catch {}

    function statOf(pathKey) {
      let item = statMap.get(pathKey);
      if (!item) {
        item = {
          plays: 0, completed: 0, skipped: 0, listenedSeconds: 0,
          listenRatioTotal: 0, sessions: 0, lastPlayedAt: 0, lastSkippedAt: 0
        };
        statMap.set(pathKey, item);
      }
      return item;
    }

    function addEdge(from, to, count = 1, at = Date.now(), bump = true) {
      if (!from || !to || from === to || !(count > 0)) return;
      let map = transitions.get(from);
      if (!map) { map = new Map(); transitions.set(from, map); }
      const edge = map.get(to) || { n: 0, t: 0 };
      edge.n += count;
      edge.t = Math.max(edge.t, at);
      map.set(to, edge);
      if (bump) transitionVersion++;
    }

    function edgeWeight(edge, now) {
      const age = Math.max(0, now - safe(edge.t));
      return safe(edge.n) * Math.pow(0.5, age / (EDGE_HALF_LIFE_DAYS * DAY));
    }

    function trimTransitions() {
      let count = 0;
      for (const map of transitions.values()) count += map.size;
      if (count <= TRANSITION_LIMIT) return;
      const now = Date.now();
      const rows = [];
      for (const [from, map] of transitions) for (const [to, edge] of map) rows.push([from, to, edge]);
      rows.sort((a, b) => edgeWeight(b[2], now) - edgeWeight(a[2], now));
      transitions.clear();
      for (const [from, to, edge] of rows.slice(0, TRANSITION_LIMIT)) {
        let map = transitions.get(from);
        if (!map) { map = new Map(); transitions.set(from, map); }
        map.set(to, edge);
      }
      transitionVersion++;
    }

    function save() {
      if (statMap.size > TRACK_LIMIT) {
        const sorted = [...statMap.entries()].sort((a, b) => safe(b[1].lastPlayedAt) - safe(a[1].lastPlayedAt));
        statMap.clear();
        for (const [pathKey, value] of sorted.slice(0, TRACK_LIMIT)) statMap.set(pathKey, value);
      }
      const stats = {};
      for (const [pathKey, value] of statMap) stats[pathKey] = value;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch {}
      trimTransitions();
      const rows = [];
      for (const [from, map] of transitions) {
        for (const [to, edge] of map) rows.push([from, to, Math.round(edge.n * 1000) / 1000, Math.round(edge.t)]);
      }
      try { storage.setItem(TRANSITION_KEY, JSON.stringify(rows)); } catch {}
      savedAt = Date.now();
    }

    function rawFeatures(track) {
      const cached = rawCache.get(track);
      if (cached) return cached;
      const album = norm(track?.album);
      const features = {
        artist: artistNames(track?.artist),
        album: album && !UNKNOWN.test(album) ? [album] : [],
        genre: genreNames(track?.genre),
        composer: artistNames(track?.composer),
        title: titleNames(track?.title || track?.filename),
        era: eraNames(track?.year)
      };
      rawCache.set(track, features);
      return features;
    }

    function featureCoverage(features) {
      let count = 0;
      for (const field of ['artist', 'album', 'genre', 'composer', 'title', 'era']) if (features[field].length) count++;
      return count / 6;
    }

    function buildModel(tracks) {
      const raw = tracks.map(rawFeatures);
      const documentFrequency = new Map();
      const tokenDocs = raw.map(features => {
        const tokens = new Map();
        const add = (token, weight) => {
          const current = tokens.get(token);
          if (current === undefined || weight > current) tokens.set(token, weight);
        };
        for (const value of features.artist) add('ar:' + value, FIELD_WEIGHT.artist);
        for (const value of features.album) add('al:' + value, FIELD_WEIGHT.album);
        for (const value of features.genre) add('ge:' + value, FIELD_WEIGHT.genre * (value.includes(' ') ? 1.25 : 0.8));
        for (const value of features.composer) add('co:' + value, FIELD_WEIGHT.composer);
        for (const value of features.title) add('ti:' + value, FIELD_WEIGHT.title);
        for (const value of features.era) add('er:' + value, FIELD_WEIGHT.era);
        for (const token of tokens.keys()) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
        return tokens;
      });

      const total = Math.max(1, tracks.length);
      const logTotal = Math.log(total + 1);
      const vectors = tokenDocs.map(tokens => {
        const vector = new Map();
        let square = 0;
        for (const [token, base] of tokens) {
          const frequency = documentFrequency.get(token) || 0;
          const idf = clamp01(0.4 + 0.6 * (Math.log((total + 1) / (frequency + 0.5)) / logTotal));
          const weight = base * Math.max(0.35, idf);
          vector.set(token, weight);
          square += weight * weight;
        }
        if (square > 0) {
          const scale = 1 / Math.sqrt(square);
          for (const [token, value] of vector) vector.set(token, value * scale);
        }
        return vector;
      });

      const index = new Map();
      const keys = tracks.map((track, position) => {
        const key = keyOf(track?.path);
        if (key && !index.has(key)) index.set(key, position);
        return key;
      });
      // These string normalisations are the hot path when ranking, so they are
      // computed once per model build instead of once per candidate per call.
      const artists = tracks.map(artistKey);
      const titles = tracks.map(titleKey);
      const albums = tracks.map(track => {
        const album = norm(track?.album);
        const artist = artistKey(track);
        return artist && album && !UNKNOWN.test(album) ? `${artist}|${album}` : '';
      });
      return { tracks, raw, keys, vectors, index, artists, titles, albums, coverage: raw.map(featureCoverage) };
    }

    function buildPlaylistModel(model) {
      const membership = new Map();
      const pairs = new Map();
      const addPair = (from, to) => {
        let map = pairs.get(from);
        if (!map) { map = new Map(); pairs.set(from, map); }
        map.set(to, (map.get(to) || 0) + 1);
      };

      for (const playlist of getPlaylists() || []) {
        const paths = [];
        const seen = new Set();
        for (const value of Array.isArray(playlist?.tracks) ? playlist.tracks : []) {
          const key = keyOf(value);
          if (!key || seen.has(key) || !model.index.has(key)) continue;
          seen.add(key);
          paths.push(key);
          if (paths.length >= MAX_PLAYLIST_TRACKS) break;
        }
        for (const key of paths) membership.set(key, (membership.get(key) || 0) + 1);
        for (let left = 0; left < paths.length; left++) {
          for (let right = left + 1; right < paths.length; right++) {
            addPair(paths[left], paths[right]);
            addPair(paths[right], paths[left]);
          }
        }
      }

      // Cosine over playlist membership vectors: two songs that share many
      // playlists (relative to how often each is curated) are neighbours.
      const cf = new Map();
      for (const [from, map] of pairs) {
        const normalised = new Map();
        for (const [to, count] of map) {
          const denominator = Math.sqrt((membership.get(from) || 0) * (membership.get(to) || 0));
          if (denominator > 0) normalised.set(to, Math.min(1, count / denominator));
        }
        cf.set(from, normalised);
      }
      return { membership, cf };
    }

    function buildTransitionModel() {
      const now = Date.now();
      const rows = new Map();
      const inbound = new Map();
      let total = 0;
      for (const [from, map] of transitions) {
        const weights = [];
        let sum = 0;
        for (const [to, edge] of map) {
          const weight = Math.max(1e-4, edgeWeight(edge, now));
          weights.push([to, weight]);
          sum += weight;
        }
        if (sum <= 0) continue;
        const row = new Map();
        for (const [to, weight] of weights) {
          row.set(to, weight / sum);
          inbound.set(to, (inbound.get(to) || 0) + weight);
          total += weight;
        }
        rows.set(from, row);
      }
      return {
        total,
        probability(source, target) { return rows.get(source)?.get(target) || 0; },
        popularity(target) { return total > 0 ? (inbound.get(target) || 0) / total : 0; }
      };
    }

    function behaviorFor(track, now, favoriteSet) {
      const item = statMap.get(keyOf(track?.path));
      const plays = item ? safe(item.plays) : 0;
      const heard = Boolean(item && (plays > 0 || safe(item.listenedSeconds) > 0));
      const sessions = item ? safe(item.sessions) : 0;
      const ratio = sessions > 0 ? clamp01(safe(item.listenRatioTotal) / sessions) : 0;
      const completedRate = plays > 0 ? clamp01(safe(item.completed) / plays) : 0;
      const skipRate = plays > 0 ? clamp01(safe(item.skipped) / plays) * Math.min(1, plays / 3) : 0;
      const frequency = clamp01(Math.log1p(plays) / Math.log1p(12));
      const confidence = plays / (plays + 1.5);
      const lastPlayedAt = item ? safe(item.lastPlayedAt) : 0;
      const ageDays = lastPlayedAt > 0 ? Math.max(0, (now - lastPlayedAt) / DAY) : Infinity;
      const recency = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / HALF_LIFE_DAYS) : 0;
      const engagement = clamp01(
        (0.45 * ratio + 0.3 * completedRate + 0.25 * frequency)
        * (0.4 + 0.6 * confidence)
        * (0.55 + 0.45 * recency)
      );
      return {
        key: keyOf(track?.path), plays, heard, ratio, skipRate, engagement, recency,
        ageDays, lastPlayedAt, favorite: Boolean(track?.path && favoriteSet.has(track.path))
      };
    }

    function buildProfile(model, behaviors, membership, currentIndex) {
      const weights = behaviors.map((behavior, index) => {
        let weight = 0;
        if (behavior.favorite) weight += 1.15;
        weight += behavior.engagement * 1.3;
        if (behavior.heard) weight += 0.08;
        weight += Math.min(0.55, Math.log1p(membership.get(behavior.key) || 0) * 0.28);
        weight -= behavior.skipRate * 1.1;
        return { index, weight: Math.max(0, weight) };
      });
      if (currentIndex >= 0 && weights[currentIndex]) weights[currentIndex].weight += 1.5;
      for (let position = recentSession.length - 1, boost = 0.85; position >= 0 && boost > 0.15; position--, boost *= 0.55) {
        const index = model.index.get(recentSession[position].key);
        if (index !== undefined) weights[index].weight += boost;
      }

      const seeds = weights.filter(item => item.weight >= 0.15)
        .sort((a, b) => b.weight - a.weight || a.index - b.index)
        .slice(0, MAX_SEEDS);
      const vector = new Map();
      let mass = 0;
      for (const seed of seeds) {
        mass += seed.weight;
        for (const [token, value] of model.vectors[seed.index]) {
          vector.set(token, (vector.get(token) || 0) + value * seed.weight);
        }
      }
      let square = 0;
      for (const value of vector.values()) square += value * value;
      if (square > 0) {
        const scale = 1 / Math.sqrt(square);
        for (const [token, value] of vector) vector.set(token, value * scale);
      }
      return { vector, mass, seeds, confidence: clamp01(1 - Math.exp(-mass / 3)) };
    }

    function recommend(currentIndex = -1) {
      const tracks = Array.isArray(getTracks()) ? getTracks() : [];
      if (!tracks.length) return [];

      const now = Date.now();
      const daySalt = Math.floor(now / DAY);
      const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;
      const currentKey = currentTrack ? keyOf(currentTrack.path) : '';
      const currentArtist = currentTrack ? artistKey(currentTrack) : '';
      const currentTitle = currentTrack ? titleKey(currentTrack) : '';

      const libraryFingerprint = `${tracks.length}|${tracks[0]?.path || ''}|${tracks[tracks.length - 1]?.path || ''}|${modelVersion}`;
      const playlists = Array.isArray(getPlaylists()) ? getPlaylists() : [];
      // Playlist edits do not touch the library array, so the cache has to be
      // keyed on the visible shape of every playlist as well.
      const playlistFingerprint = playlists.map(item => {
        const paths = Array.isArray(item?.tracks) ? item.tracks : [];
        return `${item?.id || ''}:${paths.length}:${paths[0] || ''}:${paths[paths.length - 1] || ''}`;
      }).join('|');
      const cacheKey = `${libraryFingerprint}/${playlistFingerprint}/${transitionVersion}/${dataVersion}/${daySalt}/${currentKey}`;
      if (resultCache.key === cacheKey) return resultCache.paths;

      if (!modelCache || modelCache.fingerprint !== libraryFingerprint) {
        const first = tracks[0]?.path || '';
        const last = tracks[tracks.length - 1]?.path || '';
        // Metadata enrichment calls invalidate() for every track; rebuilding the
        // whole TF-IDF model that often would stutter the UI, so a stale model
        // is reused briefly while the library is still being indexed.
        const reusable = modelCache
          && modelCache.source === tracks
          && modelCache.size === tracks.length
          && modelCache.first === first
          && modelCache.last === last
          && Date.now() - modelCache.builtAt < 400;
        if (!reusable) {
          modelCache = {
            fingerprint: libraryFingerprint,
            source: tracks,
            size: tracks.length,
            first,
            last,
            builtAt: Date.now(),
            value: buildModel(tracks)
          };
        }
      }
      const model = modelCache.value;

      if (!playlistCache || playlistCache.fingerprint !== playlistFingerprint) {
        playlistCache = { fingerprint: playlistFingerprint, value: buildPlaylistModel(model) };
      }
      const playlist = playlistCache.value;

      const transitionKey = `${transitionVersion}/${daySalt}`;
      if (!transitionCache || transitionCache.key !== transitionKey) {
        transitionCache = { key: transitionKey, value: buildTransitionModel() };
      }
      const markov = transitionCache.value;

      const favorites = getFavorites();
      const favoriteSet = favorites instanceof Set ? favorites : new Set(Array.isArray(favorites) ? favorites : []);
      const behaviors = tracks.map(track => behaviorFor(track, now, favoriteSet));
      const profile = buildProfile(model, behaviors, playlist.membership, currentIndex);

      const content = new Float64Array(tracks.length);
      if (profile.vector.size) {
        for (let index = 0; index < model.vectors.length; index++) content[index] = dot(profile.vector, model.vectors[index]);
      }

      // Radio context: the current song first, then the last few played ones
      // with a decaying weight, so autoplay keeps the thread of the session.
      const transitionSources = [];
      if (currentKey) transitionSources.push(currentKey);
      for (let position = recentSession.length - 1; position >= 0 && transitionSources.length < 4; position--) {
        const key = recentSession[position].key;
        if (key && key !== currentKey && !transitionSources.includes(key)) transitionSources.push(key);
      }
      const seedKeys = profile.seeds.slice(0, 12).map(seed => model.keys[seed.index]).filter(Boolean);

      const rows = [];
      const seenTitles = new Set();
      if (currentArtist && currentTitle) seenTitles.add(`${currentArtist}|${currentTitle}`);

      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index];
        const key = model.keys[index];
        if (!track?.path || !key) continue;
        if (key === currentKey) continue;
        if (model.index.get(key) !== index) continue;
        const behavior = behaviors[index];
        const artist = model.artists[index];
        const title = model.titles[index];
        if (artist && title) {
          const identity = `${artist}|${title}`;
          // The same song often exists twice in a local library (copies, two
          // albums, remasters). Keep the first copy only.
          if (seenTitles.has(identity)) continue;
          seenTitles.add(identity);
        }
        if (behavior.lastPlayedAt && now - behavior.lastPlayedAt < RECENT_REPEAT_MS && tracks.length > RESULT_LIMIT * 4) continue;

        let collaborative = 0;
        if (seedKeys.length && playlist.cf.size) {
          for (const seedKey of seedKeys) {
            const value = playlist.cf.get(seedKey)?.get(key);
            if (value && value > collaborative) collaborative = value;
          }
        }

        let transition = 0;
        if (markov.total > 0) {
          let best = 0;
          for (let position = 0; position < transitionSources.length; position++) {
            const value = markov.probability(transitionSources[position], key) * Math.pow(0.55, position);
            if (value > best) best = value;
          }
          transition = best * 0.8 + markov.popularity(key) * 0.2;
        }

        const discovery = (behavior.heard ? clamp01((behavior.ageDays || 0) / 45) : 1) * 0.8 + model.coverage[index] * 0.2;
        const popularity = clamp01(Math.log1p(behavior.plays + 2 * (playlist.membership.get(key) || 0)) / Math.log1p(30));
        rows.push({
          index, key, artist, title,
          album: model.albums[index],
          content: content[index],
          collaborative,
          transition,
          affinity: behavior.engagement,
          discovery,
          popularity,
          skip: behavior.skipRate,
          plays: behavior.plays,
          favorite: behavior.favorite,
          score: 0
        });
      }

      if (!rows.length) {
        resultCache = { key: cacheKey, paths: [] };
        return [];
      }

      const components = {
        content: normalise(rows.map(row => row.content)),
        collaborative: normalise(rows.map(row => row.collaborative)),
        transition: normalise(rows.map(row => row.transition)),
        affinity: normalise(rows.map(row => row.affinity)),
        discovery: normalise(rows.map(row => row.discovery)),
        popularity: normalise(rows.map(row => row.popularity))
      };
      const available = {
        content: profile.vector.size > 0,
        collaborative: playlist.cf.size > 0,
        transition: markov.total > 0,
        affinity: behaviors.some(behavior => behavior.heard),
        discovery: true,
        popularity: true
      };

      // Adaptive mixture: a brand-new listener has no content or collaborative
      // signal, so those weights are redistributed and discovery is boosted.
      const weights = {};
      let weightSum = 0;
      for (const name of Object.keys(BASE_WEIGHT)) {
        if (!available[name]) { weights[name] = 0; continue; }
        let value = BASE_WEIGHT[name];
        const cold = 1 - profile.confidence;
        if (name === 'discovery') value *= 1 + 2 * cold;
        if (name === 'popularity') value *= 1 + 0.5 * cold;
        weights[name] = value;
        weightSum += value;
      }
      if (weightSum <= 0) weightSum = 1;
      for (const name of Object.keys(weights)) weights[name] /= weightSum;

      rows.forEach((row, position) => {
        const score = components.content[position] * weights.content
          + components.collaborative[position] * weights.collaborative
          + components.transition[position] * weights.transition
          + components.affinity[position] * weights.affinity
          + components.discovery[position] * weights.discovery
          + components.popularity[position] * weights.popularity;
        // Deterministic daily jitter only breaks exact ties; it keeps the
        // home rail stable within a day without an alphabetical tail.
        row.score = score - row.skip * 0.16 + (row.favorite ? 0.03 : 0) + (hashString(`${row.key}:${daySalt}`) / 4294967296) * 1e-4;
      });
      rows.sort((left, right) => right.score - left.score);

      const similarity = (left, right) => {
        if (!left || !right) return 0;
        if (left.index === right.index) return 1;
        let value = dot(model.vectors[left.index], model.vectors[right.index]);
        if (available.collaborative) {
          value = value * 0.75 + (playlist.cf.get(left.key)?.get(right.key) || 0) * 0.25;
        }
        return clamp01(value);
      };

      const pool = rows.slice(0, Math.min(rows.length, MAX_POOL));
      const artists = new Set(pool.map(row => row.artist).filter(Boolean));
      const artistLimit = artists.size >= 6 ? 2 : Infinity;
      const selected = [];
      const artistCounts = new Map();
      const albums = new Set();
      const limit = Math.min(RESULT_LIMIT, pool.length);

      while (selected.length < limit) {
        let best = null, bestValue = -Infinity;
        let fallback = null, fallbackValue = -Infinity;
        const wantsDiscovery = selected.length > 0
          && selected.length >= limit - 1
          && selected.every(row => row.plays > 0);

        for (const row of pool) {
          if (selected.includes(row)) continue;
          const artistCount = row.artist ? artistCounts.get(row.artist) || 0 : 0;
          const blocked = artistCount >= artistLimit || Boolean(row.album && albums.has(row.album));
          let maxSimilarity = 0;
          for (const chosen of selected) {
            const value = similarity(row, chosen);
            if (value > maxSimilarity) maxSimilarity = value;
          }
          const value = MMR_LAMBDA * row.score - (1 - MMR_LAMBDA) * maxSimilarity;
          if (blocked) {
            if (value > fallbackValue) { fallbackValue = value; fallback = row; }
          } else if (value > bestValue) {
            bestValue = value;
            best = row;
          }
        }

        let chosen = best || fallback;
        if (!chosen) break;
        if (wantsDiscovery) {
          // One slot per list is reserved for something never played, so the
          // queue teaches the model instead of only replaying old favourites.
          const lastArtist = selected[selected.length - 1]?.artist;
          const allowed = row => !selected.includes(row)
            && row.plays === 0
            && (!row.artist || (artistCounts.get(row.artist) || 0) < artistLimit)
            && !(row.album && albums.has(row.album));
          const unknown = pool.find(row => allowed(row) && row.artist !== lastArtist)
            || pool.find(allowed);
          if (unknown) chosen = unknown;
        }
        selected.push(chosen);
        if (chosen.artist) artistCounts.set(chosen.artist, (artistCounts.get(chosen.artist) || 0) + 1);
        if (chosen.album) albums.add(chosen.album);
      }

      const paths = selected.map(row => tracks[row.index]?.path).filter(Boolean);
      resultCache = { key: cacheKey, paths };
      return paths;
    }

    function start(path) {
      const key = keyOf(path);
      if (!key || key === activePath) return;
      const now = Date.now();
      if (activePath) finish(false, true);
      if (lastFinishedPath && lastFinishedPath !== key && now - lastFinishedAt <= SESSION_GAP_MS) {
        addEdge(lastFinishedPath, key, lastFinishedSkipped ? 0.5 : 1, now);
      }
      lastFinishedPath = null;
      activePath = key;
      listenedSeconds = 0;
      const item = statOf(key);
      item.plays += 1;
      item.lastPlayedAt = now;
      recentSession.push({ key, at: now });
      if (recentSession.length > 24) recentSession.shift();
      dataVersion++;
      save();
    }

    function recordProgress(path, elapsed) {
      if (!activePath || keyOf(path) !== activePath) return;
      const seconds = safe(elapsed);
      if (!(seconds > 0 && seconds <= 2.5)) return;
      statOf(activePath).listenedSeconds += seconds;
      listenedSeconds += seconds;
      if (Date.now() - savedAt >= 20000) save();
    }

    function finish(completed = false, skipped = false, duration = NaN) {
      if (!activePath) return;
      const key = activePath;
      activePath = null;
      const item = statOf(key);
      const length = safe(duration);
      const ratio = length > 0 ? clamp01(listenedSeconds / length) : (completed ? 1 : 0);
      item.sessions += 1;
      item.listenRatioTotal += ratio;
      if (completed) item.completed += 1;
      const threshold = Math.min(30, Math.max(8, length > 0 ? length * 0.15 : 20));
      const isSkip = Boolean(skipped) && listenedSeconds < threshold && ratio < 0.3;
      if (isSkip) {
        item.skipped += 1;
        item.lastSkippedAt = Date.now();
      }
      lastFinishedPath = key;
      lastFinishedAt = Date.now();
      lastFinishedSkipped = isSkip;
      listenedSeconds = 0;
      dataVersion++;
      save();
    }

    function prune(keepPath) {
      let changed = false;
      for (const key of [...statMap.keys()]) {
        if (!keepPath(key)) { statMap.delete(key); changed = true; }
      }
      for (const [from, map] of [...transitions]) {
        if (!keepPath(from)) { transitions.delete(from); changed = true; continue; }
        for (const to of [...map.keys()]) {
          if (!keepPath(to)) { map.delete(to); changed = true; }
        }
        if (!map.size) { transitions.delete(from); changed = true; }
      }
      if (changed) {
        dataVersion++;
        transitionVersion++;
        save();
      }
    }

    function invalidate(track) {
      if (track && typeof track === 'object') rawCache.delete(track);
      // Metadata changed (title/artist/genre/year...), so the TF-IDF vectors
      // are stale even though nothing about the feedback history moved.
      modelVersion++;
      dataVersion++;
      playlistCache = null;
      resultCache = { key: '', paths: [] };
    }

    return {
      recommend,
      start,
      recordProgress,
      finish,
      flush: save,
      prune,
      invalidate,
      isTracking(path) { return Boolean(activePath) && activePath === keyOf(path); }
    };



  }

  window.RecomendationAlgorithm = Object.freeze({ create });
})();
