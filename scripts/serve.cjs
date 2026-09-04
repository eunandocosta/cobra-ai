const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const WEB_DIR = path.join(__dirname, "..", "workspace", "MedTutorBrasil", "web");

function httpGetWithRedirect(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error("Muitos redirecionamentos ao acessar o Google Drive."));
    }
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "http:" ? http : https;

    const req = client.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectTarget = res.headers.location;
        if (redirectTarget.startsWith("/")) {
          redirectTarget = parsed.origin + redirectTarget;
        }
        res.resume();
        return resolve(httpGetWithRedirect(redirectTarget, maxRedirects - 1));
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, html: data });
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Timeout ao conectar ao Google Drive"));
    });
  });
}

function parseFilesFromHtml(html) {
  const files = [];
  const seen = new Set();

  const titleM = html.match(/<title>(.*?)<\/title>/i);
  let title = titleM ? titleM[1].trim() : "Google Drive";
  title = title.replace(/\s*-\s*Google Drive$/i, "").replace(/^DISCIPLINA:\s*/i, "").trim();

  // 1. Tags flip-entry do embeddedfolderview
  const entryRegex = /<div class="flip-entry" id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>[\s\S]*?<div class="flip-entry-last-modified"><div>([^<]+)<\/div>/g;
  let m;
  while ((m = entryRegex.exec(html)) !== null) {
    const id = m[1];
    const name = m[2].trim();
    const date = m[3].trim();
    if (!seen.has(name)) {
      seen.add(name);
      files.push({ id, name, date });
    }
  }

  // 2. Payload estruturado interno
  const unescaped = html.replace(/\\x22/g, "\"").replace(/\\x5b/g, "[").replace(/\\x5d/g, "]");
  const driveItemRegex = /\["([a-zA-Z0-9_-]{20,})",\["[a-zA-Z0-9_-]+"\],"([^"]+\.[a-zA-Z0-9]{2,5})","([^"]+)",\d+,[^,]+,\d+,\d+,\d+,\d+,\d+,[^,]+,[^,]+,(\d+)/g;
  let dm;
  while ((dm = driveItemRegex.exec(unescaped)) !== null) {
    const id = dm[1];
    const name = dm[2].trim();
    const bytes = parseInt(dm[4], 10) || 0;
    if (!seen.has(name)) {
      seen.add(name);
      const sizeMB = bytes > 0 ? (bytes / (1024 * 1024)) : null;
      files.push({
        id,
        name,
        date: "Recente",
        sizeMB: sizeMB ? parseFloat(sizeMB.toFixed(1)) : undefined,
        sizeStr: sizeMB ? (sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${Math.round(sizeMB * 1024)} KB`) : undefined
      });
    }
  }

  // 3. Fallback regex de nomes de arquivos
  if (files.length === 0) {
    const fileRegex = /"([^"\\]+?\.(?:pdf|pptx?|docx?|xlsx?|mp4|mov|txt|md|zip|rar))"/gi;
    let fm;
    let count = 1;
    while ((fm = fileRegex.exec(unescaped)) !== null) {
      const name = fm[1].trim();
      if (!seen.has(name) && !name.startsWith("http") && name.length > 3 && !name.includes("/")) {
        seen.add(name);
        files.push({ id: "file-" + count++, name, date: "Recente" });
      }
    }
  }

  return { title, files };
}

async function fetchDriveFolder(folderId) {
  try {
    const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
    const res1 = await httpGetWithRedirect(embeddedUrl);
    if (res1.html) {
      const parsed1 = parseFilesFromHtml(res1.html);
      if (parsed1.files.length > 0) {
        return { success: true, folderId, title: parsed1.title, files: parsed1.files };
      }
    }
  } catch (err1) {
    console.warn("[DriveProxy] Erro tentativa 1:", err1.message);
  }

  try {
    const folderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
    const res2 = await httpGetWithRedirect(folderUrl);
    if (res2.html) {
      const parsed2 = parseFilesFromHtml(res2.html);
      if (parsed2.files.length > 0) {
        return { success: true, folderId, title: parsed2.title, files: parsed2.files };
      }
    }
  } catch (err2) {
    console.warn("[DriveProxy] Erro tentativa 2:", err2.message);
  }

  return { 
    success: false, 
    folderId, 
    error: "Nenhum arquivo público pôde ser extraído diretamente desta pasta (possível pasta privada ou restrita por login institucional).",
    files: [] 
  };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === "/api/drive") {
    const folderId = parsedUrl.query.id;
    if (!folderId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "folder id required" }));
      return;
    }

    try {
      const data = await fetchDriveFolder(folderId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  let reqPath = parsedUrl.pathname;
  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";
  const filePath = path.join(WEB_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log("🚀 MedTutorBrasil Web & Drive Proxy Server rodando em http://localhost:" + PORT);
});
