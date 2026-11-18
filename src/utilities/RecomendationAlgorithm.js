// Single-user, on-device hybrid recommender. It does not upload library or
// listening data; it combines local metadata with implicit listening signals.
(() => {
  'use strict';

  const STORAGE_KEY = 'musicListeningStats';
  const TRACK_LIMIT = 1500;
  const RECOMMENDATION_LIMIT = 10;
  const FEATURE_FIELDS = ['artist', 'genre', 'album', 'composer', 'title'];
  const FIELD_WEIGHTS = { artist: 0.34, genre: 0.2, album: 0.18, composer: 0.15, title: 0.08, year: 0.05 };
  const featureCache = new WeakMap();

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const tokens = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const tokenSet = value => new Set(tokens(value).filter(word => word.length > 2));
  const metadataSet = value => /^(unknown(?:\s+(?:artist|album|composer|genre))?|various\s+artists?|n\/?a|none|untitled)$/i.test(String(value || '').trim()) ? new Set() : tokenSet(value);
  const nonnegative = value => Math.max(0, Number(value) || 0);

  function create({ getTracks, getFavorites, getPlaylists, storage = localStorage }) {
    let stats = {};
    let savedAt = 0;
    let activePath = null;
    let listenedSeconds = 0;

    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        stats = Object.fromEntries(Object.entries(saved)
          .sort((a, b) => nonnegative(b[1]?.lastPlayedAt) - nonnegative(a[1]?.lastPlayedAt))
          .slice(0, TRACK_LIMIT)
          .map(([path, value]) => [path.toLocaleLowerCase(), {
            plays: nonnegative(value?.plays),
            completed: nonnegative(value?.completed),
            skipped: nonnegative(value?.skipped),
            listenedSeconds: nonnegative(value?.listenedSeconds),
            listenRatioTotal: nonnegative(value?.listenRatioTotal),
            sessions: nonnegative(value?.sessions),
            lastPlayedAt: nonnegative(value?.lastPlayedAt)
          }]));
      }
    } catch {}

    function save() {
      const entries = Object.entries(stats);
      if (entries.length > TRACK_LIMIT) {
        entries.sort((a, b) => nonnegative(b[1]?.lastPlayedAt) - nonnegative(a[1]?.lastPlayedAt));
        stats = Object.fromEntries(entries.slice(0, TRACK_LIMIT));
      }
      try { storage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch {}
      savedAt = Date.now();
    }

    function stat(path) {
      const key = String(path || '').toLocaleLowerCase();
      return stats[key] || (stats[key] = {
        plays: 0, completed: 0, skipped: 0, listenedSeconds: 0,
        listenRatioTotal: 0, sessions: 0, lastPlayedAt: 0
      });
    }

    function features(track) {
      let value = featureCache.get(track);
      if (value) return value;
      value = {
        artist: metadataSet(track.artist),
        composer: metadataSet(track.composer),
        album: metadataSet(track.album),
        genre: metadataSet(track.genre),
        title: tokenSet(track.title || track.filename),
        year: Number(track.year) || 0
      };
      featureCache.set(track, value);
      return value;
    }

    function weightedOverlap(left, right, weights) {
      if (!left.size || !right.size) return 0;
      let common = 0, total = 0;
      for (const item of left) {
        const weight = weights.get(item) || 0.15;
        total += weight;
        if (right.has(item)) common += weight;
      }
      for (const item of right) if (!left.has(item)) total += weights.get(item) || 0.15;
      return total ? common / total : 0;
    }

    function documentWeights(tracks) {
      const frequencies = Object.fromEntries(FEATURE_FIELDS.map(field => [field, new Map()]));
      const documents = tracks.map(features);
      for (const item of documents) for (const field of FEATURE_FIELDS) {
        for (const token of item[field]) frequencies[field].set(token, (frequencies[field].get(token) || 0) + 1);
      }
      const denominator = Math.log(tracks.length + 1);
      return Object.fromEntries(FEATURE_FIELDS.map(field => [field, new Map([...frequencies[field]].map(([token, count]) => [
        token, clamp(Math.log((tracks.length + 1) / (count + 0.5)) / denominator, 0.15, 1)
      ]))]));
    }

    function similarity(left, right, weights) {
      const a = features(left), b = features(right);
      let score = 0, usedWeight = 0;
      for (const field of FEATURE_FIELDS) {
        if (!a[field].size || !b[field].size) continue;
        const weight = FIELD_WEIGHTS[field];
        score += weightedOverlap(a[field], b[field], weights[field]) * weight;
        usedWeight += weight;
      }
      if (a.year && b.year) {
        score += Math.exp(-Math.abs(a.year - b.year) / 8) * FIELD_WEIGHTS.year;
        usedWeight += FIELD_WEIGHTS.year;
      }
      return usedWeight ? score / usedWeight : 0;
    }

    function historyFor(track) {
      return stats[String(track.path || '').toLocaleLowerCase()] || {};
    }

    function listeningRatio(track, history) {
      if (history.sessions > 0) return clamp(history.listenRatioTotal / history.sessions);
      const duration = Number(track.duration) || 0;
      if (duration > 0 && history.plays > 0) return clamp(history.listenedSeconds / (duration * history.plays));
      return history.plays > 0 ? clamp(history.completed / history.plays) : 0;
    }

    function behavior(track, now, favorites) {
      const history = historyFor(track);
      const plays = nonnegative(history.plays);
      const confidence = plays / (plays + 2);
      const completedRate = plays ? clamp(nonnegative(history.completed) / plays) : 0;
      const skipRate = plays ? clamp(nonnegative(history.skipped) / plays) * confidence : 0;
      const playSignal = clamp(Math.log1p(plays) / Math.log(7));
      const ratio = listeningRatio(track, history);
      const engagement = clamp((completedRate * 0.42 + ratio * 0.38 + playSignal * 0.2) * confidence);
      const favorite = favorites.has(track.path);
      const ageDays = history.lastPlayedAt ? Math.max(0, (now - history.lastPlayedAt) / 86400000) : Infinity;
      const recencyPenalty = Number.isFinite(ageDays) ? 0.34 * Math.exp(-ageDays / 3) : 0;
      return { history, engagement, skipRate, favorite, ageDays, recencyPenalty };
    }

    function playlistCounts() {
      const counts = new Map();
      for (const playlist of getPlaylists() || []) {
        for (const path of Array.isArray(playlist?.tracks) ? playlist.tracks : []) {
          const key = String(path || '').toLocaleLowerCase();
          if (key) counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      return counts;
    }

    function recommend(currentIndex = -1) {
      const tracks = getTracks() || [];
      if (!tracks.length) return [];

      const now = Date.now();
      const favorites = getFavorites() || new Set();
      const playlists = playlistCounts();
      const currentPath = currentIndex >= 0 ? tracks[currentIndex]?.path?.toLocaleLowerCase() : '';
      const candidates = tracks.filter(track => track?.path && track.path.toLocaleLowerCase() !== currentPath);
      if (!candidates.length) return [];
      const weights = documentWeights(tracks);

      const seeds = tracks.map(track => {
        const signals = behavior(track, now, favorites);
        const curated = Math.min(0.45, Math.log1p(playlists.get(track.path.toLocaleLowerCase()) || 0) * 0.2);
        const weight = signals.favorite ? 1.25 : Math.max(0, signals.engagement - signals.skipRate * 0.75) + curated;
        return { track, weight };
      }).filter(item => item.weight >= 0.12).sort((a, b) => b.weight - a.weight).slice(0, 32);

      const profile = Object.fromEntries(FEATURE_FIELDS.map(field => [field, new Map()]));
      const profileMass = Object.fromEntries(FEATURE_FIELDS.map(field => [field, 0]));
      for (const { track, weight } of seeds) {
        const item = features(track);
        for (const field of FEATURE_FIELDS) {
          const values = item[field];
          if (!values.size) continue;
          profileMass[field] += weight;
          const share = weight / values.size;
          for (const value of values) {
            const idf = weights[field].get(value) || 0.15;
            profile[field].set(value, (profile[field].get(value) || 0) + share * idf);
          }
        }
      }

      const affinity = (field, values) => {
        if (!profileMass[field] || !values.size) return null;
        let sum = 0;
        for (const value of values) sum += profile[field].get(value) || 0;
        return clamp(sum / profileMass[field]);
      };
      const profileMassTotal = Math.max(0, ...Object.values(profileMass));
      const profileConfidence = 1 - Math.exp(-profileMassTotal / 4);

      const ranked = candidates.map(track => {
        const item = features(track), signals = behavior(track, now, favorites);
        const matches = FEATURE_FIELDS.map(field => [affinity(field, item[field]), FIELD_WEIGHTS[field]])
          .filter(([score]) => score !== null);
        const content = matches.length
          ? matches.reduce((sum, [score, weight]) => sum + score * weight, 0) / matches.reduce((sum, [, weight]) => sum + weight, 0)
          : 0;
        const neighbors = seeds.map(seed => ({
          score: similarity(seed.track, track, weights), weight: seed.weight
        })).filter(seed => seed.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
        const neighborScore = neighbors.length
          ? neighbors.reduce((sum, seed) => sum + seed.score * seed.weight, 0) / neighbors.reduce((sum, seed) => sum + seed.weight, 0)
          : 0;
        const coverage = (Object.values(item).filter(value => value instanceof Set && value.size).length + (item.year ? 1 : 0)) / 6;
        const curated = Math.min(1, Math.log1p(playlists.get(track.path.toLocaleLowerCase()) || 0) / Math.log(4));
        const freshness = signals.history.lastPlayedAt ? Math.min(1, signals.ageDays / 30) : 1;
        const personalized = content * 0.62 + neighborScore * 0.25 + signals.engagement * 0.13;
        const discovery = coverage * 0.3 + curated * 0.3 + freshness * 0.4;
        const score = profileConfidence * personalized + (1 - profileConfidence) * discovery
          + (signals.favorite ? 0.12 : 0) - signals.skipRate * 0.22 - signals.recencyPenalty;
        return { track, score, artist: [...item.artist].join(' '), album: [...item.album].join(' ') };
      }).sort((a, b) => b.score - a.score || String(a.track.filename || a.track.path).localeCompare(String(b.track.filename || b.track.path), undefined, { numeric: true, sensitivity: 'base' }));

      const selected = [], artistCounts = new Map(), albumCounts = new Set(), remaining = [...ranked];
      const artistCount = new Set(ranked.map(item => item.artist).filter(Boolean)).size;
      const artistLimit = artistCount >= 5 ? 2 : Infinity;
      while (remaining.length && selected.length < Math.min(RECOMMENDATION_LIMIT, candidates.length)) {
        let bestIndex = 0, bestScore = -Infinity;
        const artistEligible = artistCount >= 5
          ? remaining.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => !candidate.artist || (artistCounts.get(candidate.artist) || 0) < artistLimit)
          : remaining.map((candidate, index) => ({ candidate, index }));
        const albumEligible = artistEligible.filter(({ candidate }) => !candidate.album || !albumCounts.has(candidate.album));
        const eligible = albumEligible.length ? albumEligible : artistEligible.length ? artistEligible : remaining.map((candidate, index) => ({ candidate, index }));
        for (const { candidate, index } of eligible) {
          const repeatedArtist = candidate.artist ? artistCounts.get(candidate.artist) || 0 : 0;
          const repeatedAlbum = candidate.album && albumCounts.has(candidate.album);
          const diversityPenalty = repeatedArtist * 0.24 + (repeatedAlbum ? 0.12 : 0);
          const score = candidate.score - diversityPenalty;
          if (score > bestScore) { bestScore = score; bestIndex = index; }
        }
        const [chosen] = remaining.splice(bestIndex, 1);
        selected.push(chosen.track.path);
        if (chosen.artist) artistCounts.set(chosen.artist, (artistCounts.get(chosen.artist) || 0) + 1);
        if (chosen.album) albumCounts.add(chosen.album);
      }
      return selected;
    }

    function start(path) {
      const key = String(path || '').toLocaleLowerCase();
      if (!key || key === activePath) return;
      if (activePath) finish(false, true);
      activePath = key;
      listenedSeconds = 0;
      const item = stat(key);
      item.plays++;
      item.lastPlayedAt = Date.now();
      save();
    }

    function recordProgress(path, elapsed) {
      if (!activePath || String(path || '').toLocaleLowerCase() !== activePath || !(elapsed > 0 && elapsed <= 2.5)) return;
      stat(activePath).listenedSeconds += elapsed;
      listenedSeconds += elapsed;
      if (Date.now() - savedAt >= 20000) save();
    }

    function finish(completed = false, skipped = false, duration = NaN) {
      if (!activePath) return;
      const item = stat(activePath);
      const trackDuration = Number(duration);
      const ratio = Number.isFinite(trackDuration) && trackDuration > 0 ? clamp(listenedSeconds / trackDuration) : (completed ? 1 : 0);
      item.sessions++;
      item.listenRatioTotal += ratio;
      if (completed) item.completed++;
      const threshold = Math.min(30, Math.max(8, Number.isFinite(trackDuration) ? trackDuration * 0.15 : 20));
      if (skipped && listenedSeconds < threshold) item.skipped++;
      activePath = null;
      listenedSeconds = 0;
      save();
    }

    function prune(keepPath) {
      let changed = false;
      for (const path of Object.keys(stats)) {
        if (!keepPath(path)) { delete stats[path]; changed = true; }
      }
      if (changed) save();
    }

    return {
      recommend,
      start,
      recordProgress,
      finish,
      flush: save,
      prune,
      invalidate(track) { if (track && typeof track === 'object') featureCache.delete(track); },
      isTracking(path) { return activePath === String(path || '').toLocaleLowerCase(); }
    };
  }

  window.RecomendationAlgorithm = Object.freeze({ create });
})();
