// Cross-device sync through a private GitHub Gist.
// Loaded in the browser as a plain script (window.GolfSync) and in Node for
// tests (module.exports).
(function (root) {
  'use strict';

  const FILE_NAME = 'golf-tracker.json';
  const API = 'https://api.github.com';
  // Tombstones older than this are dropped; a device offline longer than this
  // could resurrect something deleted elsewhere.
  const TOMBSTONE_TTL = 365 * 24 * 3600 * 1000;

  function normalize(d) {
    return {
      version: 1,
      courses: Array.isArray(d && d.courses) ? d.courses : [],
      rounds: Array.isArray(d && d.rounds) ? d.rounds : [],
      deleted: d && d.deleted && typeof d.deleted === 'object' ? d.deleted : {},
    };
  }

  // Merge two copies of the data. Each course/round carries `updatedAt`
  // (ms); the newer copy of a record wins. `deleted` maps id -> deletion time
  // and removes any copy of the record that is not newer than the deletion.
  function mergeData(localIn, remoteIn, now = Date.now()) {
    const local = normalize(localIn);
    const remote = normalize(remoteIn);
    const deleted = {};
    for (const src of [remote.deleted, local.deleted]) {
      for (const [id, t] of Object.entries(src)) {
        if (now - t < TOMBSTONE_TTL) deleted[id] = Math.max(deleted[id] || 0, t);
      }
    }
    const mergeList = (a, b) => {
      const byId = new Map();
      for (const rec of b.concat(a)) {
        // local (a) is added last so it wins ties
        const cur = byId.get(rec.id);
        if (!cur || (rec.updatedAt || 0) >= (cur.updatedAt || 0)) byId.set(rec.id, rec);
      }
      return [...byId.values()].filter((r) => !(deleted[r.id] && deleted[r.id] >= (r.updatedAt || 0)));
    };
    return {
      version: 1,
      courses: mergeList(local.courses, remote.courses),
      rounds: mergeList(local.rounds, remote.rounds),
      deleted,
    };
  }

  // Stable string for change detection (key order independent of merge order).
  function fingerprint(d) {
    const n = normalize(d);
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return JSON.stringify({
      c: n.courses.slice().sort(byId),
      r: n.rounds.slice().sort(byId),
      d: Object.keys(n.deleted).sort().map((k) => [k, n.deleted[k]]),
    });
  }

  class GistClient {
    constructor(token, fetchImpl) {
      this.token = token;
      this.fetch = fetchImpl || root.fetch.bind(root);
    }
    async req(method, path, body) {
      const res = await this.fetch(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + this.token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      if (res.status === 401) throw new Error('GitHub rejected the token (expired or revoked?)');
      if (res.status === 403 || res.status === 404) {
        throw new Error('GitHub refused access – check the token has the "gist" permission');
      }
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      return res.json();
    }
    // Find the user's existing Golf Tracker gist, or null.
    async find() {
      for (let page = 1; page <= 10; page++) {
        const list = await this.req('GET', `/gists?per_page=100&page=${page}`);
        const hit = list.find((g) => g.files && g.files[FILE_NAME]);
        if (hit) return hit.id;
        if (list.length < 100) return null;
      }
      return null;
    }
    async create(data) {
      const g = await this.req('POST', '/gists', {
        description: 'Golf Tracker data (synced automatically, do not edit)',
        public: false,
        files: { [FILE_NAME]: { content: JSON.stringify(data) } },
      });
      return g.id;
    }
    async pull(gistId) {
      const g = await this.req('GET', '/gists/' + gistId);
      const f = g.files && g.files[FILE_NAME];
      if (!f) return normalize(null);
      let content = f.content;
      if (f.truncated) {
        const res = await this.fetch(f.raw_url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not download synced data');
        content = await res.text();
      }
      try {
        return normalize(JSON.parse(content));
      } catch (e) {
        throw new Error('Synced data on GitHub is not valid JSON');
      }
    }
    async push(gistId, data) {
      await this.req('PATCH', '/gists/' + gistId, {
        files: { [FILE_NAME]: { content: JSON.stringify(data) } },
      });
    }
  }

  const api = { FILE_NAME, mergeData, fingerprint, normalize, GistClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GolfSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
