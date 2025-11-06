import http from "http";
import { URL } from "url";
import "dotenv/config";

const API_KEY = process.env.YOUTUBE_API_KEY;
const PORT = process.env.PORT || 5000;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const API_BASE = "https://youtube-timer-backend-xxxxx.onrender.com/api";

const cache = new Map();
const TTL_MS = 10 * 60 * 1000; // 10分キャッシュ

// ISO8601 → 秒
const isoToSec = iso => {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, mnt, s] = m.map(x => parseInt(x, 10) || 0);
  return h * 3600 + mnt * 60 + s;
};

// 共通: videos.list(ids...) を詳細取得（duration 等）
async function fetchVideosByIds(ids) {
  if (!ids.length) return [];
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet,contentDetails",
    id: ids.join(","),
    maxResults: "50"
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
  if (!r.ok) throw new Error(`YouTube videos error: ${r.status}`);
  const j = await r.json();
  return j.items || [];
}

// 1) トレンド取得
async function fetchPopular() {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet,contentDetails",
    chart: "mostPopular",
    regionCode: "JP",
    maxResults: "50"
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
  if (!r.ok) throw new Error(`YouTube popular error: ${r.status}`);
  const j = await r.json();
  return j.items || [];
}

// 2) 関連動画（seed 1本につき最大20件）
async function fetchRelated(videoId) {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    type: "video",
    relatedToVideoId: videoId,
    maxResults: "20"
    // NOTE: regionCode は relatedToVideoId と併用不可
  });

  const r = await fetch("https://www.googleapis.com/youtube/v3/search?" + params);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`YouTube related error: ${r.status} ${body}`);
  }

  const j = await r.json();
  const ids = (j.items || []).map(x => x.id?.videoId).filter(Boolean);
  return await fetchVideosByIds(ids);
}


// 3) ランダム時間窓で検索
// 例: 過去2年のどこか7日間をランダム、viewCount順で拾う
async function fetchRandomWindow({ days = 7, yearsBack = 2 }) {
  const now = new Date();
  const start = new Date(
    now.getFullYear() - Math.floor(Math.random() * yearsBack) - 1, // ゆるめに2〜3年バック
    Math.floor(Math.random() * 12),
    Math.floor(Math.random() * 28) + 1
  );
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    type: "video",
    regionCode: "JP",
    order: "viewCount",
    publishedAfter: start.toISOString(),
    publishedBefore: end.toISOString(),
    maxResults: "50",
    videoEmbeddable: "true"
  });

  const r = await fetch("https://www.googleapis.com/youtube/v3/search?" + params);
  if (!r.ok) throw new Error(`YouTube search error: ${r.status}`);
  const j = await r.json();
  const ids = (j.items || []).map(x => x.id?.videoId).filter(Boolean);
  const details = await fetchVideosByIds(ids);
  return { details, window: { start, end } };
}

// ユーティリティ: 配列をランダムに n 個サンプル（重複なし）
function sample(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

// ランキング処理
function rank(details, targetSec) {
  return details
    .filter(v => v?.contentDetails?.duration && v?.snippet?.title)
    .map(v => {
      const dur = isoToSec(v.contentDetails.duration);
      return {
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        duration_seconds: dur,
        difference_seconds: Math.abs(dur - targetSec),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail:
          v.snippet.thumbnails?.medium?.url ||
          v.snippet.thumbnails?.default?.url ||
          null
      };
    })
    .sort((a, b) => a.difference_seconds - b.difference_seconds)
    .slice(0, 10);
}

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }
    if (u.pathname !== "/") {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end('{"error":"Not Found"}');
    }

    const seconds = Number(u.searchParams.get("seconds"));
    const mode = (u.searchParams.get("mode") || "popular").toLowerCase();
    if (!seconds || seconds <= 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end('{"error":"seconds パラメータ必須"}');
    }

    const cacheKey = `${mode}:${seconds}`;
    const now = Date.now();
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < TTL_MS) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" });
      return res.end(JSON.stringify(hit.data));
    }

    let universe = [];
    let meta = {};

    if (mode === "popular") {
      universe = await fetchPopular();
      meta.source = "popular";
    } else if (mode === "related") {
      // まず人気からランダムに3本ほど seed
      const popular = await fetchPopular();
      const seeds = sample(popular, 3);
      const relatedLists = await Promise.all(
        seeds.map(v => fetchRelated(v.id))
      );
      universe = [...seeds, ...relatedLists.flat()];
      // 重複排除（id ベース）
      const map = new Map();
      for (const v of universe) map.set(v.id, v);
      universe = [...map.values()];
      meta.source = "related_from_trending";
      meta.seed_ids = seeds.map(s => s.id);
    } else if (mode === "window") {
      const { details, window } = await fetchRandomWindow({ days: 7, yearsBack: 2 });
      universe = details;
      meta.source = "random_window";
      meta.window = {
        start: window.start.toISOString(),
        end: window.end.toISOString()
      };
    } else {
      // 未知のモードは popular 扱いにフォールバック
      universe = await fetchPopular();
      meta.source = "popular_fallback";
    }

    const ranked = rank(universe, seconds);
    const payload = {
      mode,
      target_duration_seconds: seconds,
      meta,
      closest_videos: ranked
    };

    cache.set(cacheKey, { ts: now, data: payload });
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" });
    res.end(JSON.stringify(payload));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message || "internal error" }));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/?seconds=300&mode=related`));
