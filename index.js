import http from "http";
import { URL } from "url";
import "dotenv/config";

const API_KEY = process.env.YOUTUBE_API_KEY;

// ISO8601 → 秒
const isoToSec = iso => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, mnt, s] = m.map(x => parseInt(x, 10) || 0);
  return h * 3600 + mnt * 60 + s;
};

// 1) 人気動画取得
async function fetchPopular() {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet,contentDetails",
    chart: "mostPopular",
    regionCode: "JP",     // 日本寄せ
    maxResults: "50"
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
  const j = await r.json();
  return j.items || [];
}

// 2) ランキング処理
function rank(details, targetSec) {
  return details
    .filter(v => v?.contentDetails?.duration)
    .map(v => {
      const dur = isoToSec(v.contentDetails.duration);
      return {
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        duration_seconds: dur,
        difference_seconds: Math.abs(dur - targetSec),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url
      };
    })
    .sort((a, b) => a.difference_seconds - b.difference_seconds)
    .slice(0, 10);
}

// 3) サーバ
http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname !== "/") { res.writeHead(404); return res.end('{"error":"Not Found"}'); }

    const seconds = Number(u.searchParams.get("seconds"));
    if (!seconds || seconds <= 0) {
      res.writeHead(400);
      return res.end('{"error":"seconds パラメータ必須"}');
    }

    // 人気動画取得
    const popular = await fetchPopular();

    // 時間でランク付け
    const ranked = rank(popular, seconds);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      target_duration_seconds: seconds,
      closest_videos: ranked
    }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(5000, () => console.log("http://localhost:5000/?seconds=300"));