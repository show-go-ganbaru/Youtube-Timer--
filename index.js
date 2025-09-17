import http from "http";
import fetch from "node-fetch";  // npm install node-fetch
import "dotenv/config";          // .env 読み込み

const API_KEY = process.env.YOUTUBE_API_KEY;

http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });

    try {
      // YouTube API にリクエスト
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=timer&key=${API_KEY}`
      );

      console.log("API Key:", API_KEY
      );
      const data = await response.json();

      res.end(JSON.stringify(data, null, 2)); // 整形して返す
    } catch (error) {
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
}).listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
