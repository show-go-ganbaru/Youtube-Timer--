import http from "http";
import { URL } from "url";
import "dotenv/config";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const API_KEY = process.env.YOUTUBE_API_KEY;


//ISO8601を秒に変換

const isoToSec = iso => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, mnt, s] = m.map(x => parseInt(x, 10) || 0);
  return h * 3600 + mnt * 60 + s;
};

///動画時間をフィルタ
const bucket = secs => (secs < 240 ? "short" : secs <= 1200 ? "medium" : "long");


///検索ID取得

async function searchIds(q, durationBucket) {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    type: "video",
    maxResults: "50",
    q,
    regionCode: "JP",
    relevanceLanguage: "ja",
    order: "viewCount",
    videoDuration: durationBucket,
  });

  const r = await fetch("https://www.googleapis.com/youtube/v3/search?" + params);
  const j = await r.json();
  return (j.items || []).map(it => it?.id?.videoId).filter(Boolean);
}

///動画詳細取ってくる

async function fetchDetails(idsCsv) {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet,contentDetails",
    id: idsCsv,
    // 帯域節約したいなら fields 指定も可（返却項目を絞る）
    // fields: "items(id,snippet(title,channelTitle),contentDetails(duration))"
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
  const j = await r.json();
  return j.items || [];
}
function rankByDifference(details, seconds) {
  return details
    .filter(v => v?.contentDetails?.duration)
    .filter(v => !/timer/i.test(v.snippet?.title || ""))  // "timer" 除外
    .map(v => {
      const durSec = isoToSec(v.contentDetails.duration);
      return {
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        duration_seconds: durSec,
        difference_seconds: Math.abs(durSec - seconds),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url
      };
    })
    .sort((a, b) => a.difference_seconds - b.difference_seconds)
    .slice(0, 10);
}

// サーバ（1本に統合）
http.createServer(async (req, res) => {
  // CORSプリフライト
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/") {
      res.writeHead(404, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Not Found" }));
    }

    const seconds = Number(url.searchParams.get("seconds"));
    if (!seconds || seconds <= 0) {
      res.writeHead(400, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "seconds は正の数で。例: /?seconds=300" }));
    }

    const ids = await searchIds("timer", bucket(seconds));
    if (!ids.length) {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "条件に合う動画なし" }));
    }

    const details = await fetchDetails(ids.join(","));
    const ranked = rankByDifference(details,seconds);
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      target_duration_seconds: seconds,
      closest_videos: ranked
    }));
  } catch (e) {
    res.writeHead(500, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: e.message }));
  }
}).listen(5000, () => {
  console.log("JSON: http://localhost:5000/?seconds=300");
});