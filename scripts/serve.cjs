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

function parseFolderAndSubfolders(html, currentPath) {
  const files = [];
  const subfolders = [];
  const seenFiles = new Set();
  const seenFolders = new Set();

  const titleM = html.match(/<title>(.*?)<\/title>/i);
  let title = titleM ? titleM[1].trim() : "Google Drive";
  title = title.replace(/\s*-\s*Google Drive$/i, "").replace(/^DISCIPLINA:\s*/i, "").trim();

  const unescaped = html.replace(/\\x22/g, "\"").replace(/\\x5b/g, "[").replace(/\\x5d/g, "]");

  // 1. Extração estruturada de pastas (MIME application/vnd.google-apps.folder)
  const folderJsonRegex = /\["([a-zA-Z0-9_-]{15,})",\["application\/vnd\.google-apps\.folder"\],"([^"]+)"/g;
  let fjm;
  while ((fjm = folderJsonRegex.exec(unescaped)) !== null) {
    const id = fjm[1];
    const name = fjm[2].trim();
    if (!seenFolders.has(id) && name.length > 0) {
      seenFolders.add(id);
      subfolders.push({ id, name });
    }
  }

  // 2. Extração de links de pastas em embeddedfolderview
  const folderLinkRegex = /(?:folders\/|embeddedfolderview\?id=)([a-zA-Z0-9_-]{15,})[^>]*?>([^<]+)<\/(?:a|div|span)>/gi;
  let flm;
  while ((flm = folderLinkRegex.exec(html)) !== null) {
    const id = flm[1];
    let name = flm[2].trim();
    if (!seenFolders.has(id) && name.length > 0 && !name.includes("Google") && !name.includes("Drive")) {
      if (!name.match(/\.(pdf|pptx?|docx?|xlsx?|mp4|txt|zip|rar)$/i)) {
        seenFolders.add(id);
        subfolders.push({ id, name });
      }
    }
  }

  // 3. Extração de arquivos flip-entry
  const entryRegex = /<div class="flip-entry" id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>[\s\S]*?<div class="flip-entry-last-modified"><div>([^<]+)<\/div>/g;
  let em;
  while ((em = entryRegex.exec(html)) !== null) {
    const id = em[1];
    const name = em[2].trim();
    const date = em[3].trim();
    if (name.match(/\.(pdf|pptx?|docx?|xlsx?|mp4|txt|zip|rar)$/i) && !seenFiles.has(name)) {
      seenFiles.add(name);
      files.push({ id, name, date, folderPath: currentPath || "Pasta Raiz" });
    } else if (!seenFolders.has(id) && !name.includes(".")) {
      seenFolders.add(id);
      subfolders.push({ id, name });
    }
  }

  // 4. Extração estruturada de arquivos do payload JSON
  const driveItemRegex = /\["([a-zA-Z0-9_-]{20,})",\["[a-zA-Z0-9_-]+"\],"([^"]+\.[a-zA-Z0-9]{2,5})","([^"]+)",\d+,[^,]+,\d+,\d+,\d+,\d+,\d+,[^,]+,[^,]+,(\d+)/g;
  let dm;
  while ((dm = driveItemRegex.exec(unescaped)) !== null) {
    const id = dm[1];
    const name = dm[2].trim();
    const bytes = parseInt(dm[4], 10) || 0;
    if (!seenFiles.has(name)) {
      seenFiles.add(name);
      const sizeMB = bytes > 0 ? (bytes / (1024 * 1024)) : null;
      files.push({
        id,
        name,
        date: "Recente",
        folderPath: currentPath || "Pasta Raiz",
        sizeMB: sizeMB ? parseFloat(sizeMB.toFixed(1)) : undefined,
        sizeStr: sizeMB ? (sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${Math.round(sizeMB * 1024)} KB`) : undefined
      });
    }
  }

  // 5. Fallback por extensão de arquivo
  if (files.length === 0) {
    const fileRegex = /"([^"\\]+?\.(?:pdf|pptx?|docx?|xlsx?|mp4|mov|txt|md|zip|rar))"/gi;
    let fm;
    let count = 1;
    while ((fm = fileRegex.exec(unescaped)) !== null) {
      const name = fm[1].trim();
      if (!seenFiles.has(name) && !name.startsWith("http") && name.length > 3 && !name.includes("/")) {
        seenFiles.add(name);
        files.push({ id: "file-" + count++, name, date: "Recente", folderPath: currentPath || "Pasta Raiz" });
      }
    }
  }

  return { title, files, subfolders };
}

async function fetchSingleFolderHtml(folderId) {
  try {
    const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
    const res1 = await httpGetWithRedirect(embeddedUrl);
    if (res1.html && res1.html.length > 200) {
      return { html: res1.html };
    }
  } catch (e) {}

  try {
    const folderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
    const res2 = await httpGetWithRedirect(folderUrl);
    if (res2.html && res2.html.length > 200) {
      return { html: res2.html };
    }
  } catch (e) {}

  return null;
}

async function crawlDriveFolderRecursively(folderId, currentPath = "", visitedFolders = new Set(), depth = 0, maxDepth = 6) {
  if (!folderId || visitedFolders.has(folderId) || depth > maxDepth) {
    return { title: "", files: [], totalFoldersVisited: visitedFolders.size };
  }
  visitedFolders.add(folderId);

  const rawData = await fetchSingleFolderHtml(folderId);
  if (!rawData || !rawData.html) {
    return { title: "", files: [], totalFoldersVisited: visitedFolders.size };
  }

  const { title, files, subfolders } = parseFolderAndSubfolders(rawData.html, currentPath || "Pasta Raiz");
  const folderTitle = currentPath ? currentPath : title;

  console.log(`[DriveCrawler] 📁 Visitando pasta (nível ${depth}): "${folderTitle}" - ${files.length} arquivo(s), ${subfolders.length} subpasta(s)`);

  let allFiles = [...files];

  for (const sub of subfolders) {
    if (!visitedFolders.has(sub.id)) {
      const nextPath = currentPath ? `${currentPath} > ${sub.name}` : sub.name;
      console.log(`[DriveCrawler] ⬇️ Entrando recursivamente na subpasta: "${sub.name}" (ID: ${sub.id})`);
      const childResult = await crawlDriveFolderRecursively(sub.id, nextPath, visitedFolders, depth + 1, maxDepth);
      if (childResult.files && childResult.files.length > 0) {
        allFiles.push(...childResult.files);
      }
      console.log(`[DriveCrawler] 🔙 Retornando para "${folderTitle}" após concluir "${sub.name}"`);
    }
  }

  return { title: title || folderTitle, files: allFiles, totalFoldersVisited: visitedFolders.size };
}

async function fetchDriveFolder(folderId) {
  try {
    console.log(`[DriveProxy] 🚀 Iniciando varredura recursiva completa da pasta: ${folderId}`);
    const result = await crawlDriveFolderRecursively(folderId, "");
    if (result.files.length > 0) {
      return {
        success: true,
        folderId,
        title: result.title || "Google Drive",
        totalFiles: result.files.length,
        foldersVisited: result.totalFoldersVisited || 1,
        files: result.files
      };
    }
  } catch (err) {
    console.warn("[DriveProxy] Erro na varredura recursiva:", err.message);
  }

  return { 
    success: false, 
    folderId, 
    error: "Nenhum arquivo público pôde ser extraído diretamente desta pasta ou de suas subpastas (possível pasta privada ou restrita por login institucional).",
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
