// src/modules/drive/drive.service.js
// Serviço de Integração com Google Drive (MedTutor Brasil)

class DriveService {
  /**
   * Extrai o ID da pasta ou arquivo a partir de URL ou ID cru
   */
  extractId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return null;
    const clean = urlOrId.trim();

    // 1. /folders/<id>
    const mFolder = clean.match(/folders\/([a-zA-Z0-9_-]+)/i);
    if (mFolder) return mFolder[1];

    // 2. /file/d/<id>
    const mFile = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (mFile) return mFile[1];

    // 3. ?id=<id> or &id=<id>
    const mId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (mId) return mId[1];

    // 4. Raw folder/file ID (20 a 55 caracteres)
    if (/^[a-zA-Z0-9_-]{20,55}$/.test(clean)) {
      return clean;
    }

    return null;
  }

  /**
   * Faz a varredura da pasta do Google Drive via HTTP direto (sem bloqueio de CORS do navegador)
   */
  async scanFolder(urlOrId) {
    const folderId = this.extractId(urlOrId);
    if (!folderId) {
      throw new Error('ID ou Link do Google Drive inválido.');
    }

    console.log(`🔍 [DriveService] Varrendo pasta Google Drive: ${folderId}`);

    const targetUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!res.ok && res.status === 404) {
      throw new Error(`Pasta não encontrada (HTTP 404). Verifique se o link possui permissão pública de visualização ("Qualquer pessoa com o link").`);
    }

    const html = await res.text();
    const titleMatch = html.match(/<title>(.*?)(?: - Google Drive)?<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/ - Google Drive$/i, '').trim() : '';
    const title = rawTitle.replace(/^DISCIPLINA:\s*/i, '') || `Pasta Drive: ${folderId.slice(0, 12)}...`;

    const unescaped = html.replace(/\\x22/g, '"').replace(/\\x5b/g, '[').replace(/\\x5d/g, ']');

    const files = [];
    const seen = new Set();

    // Padrão 1: Array estruturado JSON interno do Drive
    const jsonRegex = /\["([a-zA-Z0-9_-]{20,})",\["[a-zA-Z0-9_-]+"\],"([^"]+?\.[a-zA-Z0-9]{2,5})"/g;
    let jm;
    while ((jm = jsonRegex.exec(unescaped)) !== null) {
      const id = jm[1];
      const name = jm[2].trim();
      if (!seen.has(name) && !name.includes('/')) {
        seen.add(name);
        files.push(this._formatFileEntry(id, name));
      }
    }

    // Padrão 2: Atributos aria-label nos elementos HTML renderizados
    const ariaRegex = /aria-label="([^"]+?\.(?:pdf|pptx?|docx?|xlsx?|mp4|txt|md))[^\"]*"[^>]*?ssk='[^']*?:([a-zA-Z0-9_-]{20,})/gi;
    let am;
    while ((am = ariaRegex.exec(html)) !== null) {
      const name = am[1].trim();
      const id = am[2].replace(/-0-16$/, '');
      if (!seen.has(name)) {
        seen.add(name);
        files.push(this._formatFileEntry(id, name));
      }
    }

    // Padrão 3: Extração por regex de extensões de arquivos médicos
    if (files.length === 0) {
      const fileRegex = /"([^"\\]+?\.(?:pdf|pptx?|docx?|xlsx?|mp4|txt|md))"/gi;
      let fm;
      while ((fm = fileRegex.exec(unescaped)) !== null) {
        const name = fm[1].trim();
        if (!seen.has(name) && !name.startsWith('http') && name.length > 4 && !name.includes('/')) {
          seen.add(name);
          files.push(this._formatFileEntry(`file_${files.length + 1}`, name));
        }
      }
    }

    console.log(`✅ [DriveService] ${files.length} arquivos identificados na pasta "${title}"`);

    return {
      success: true,
      folderId,
      title,
      totalFoldersVisited: 1,
      totalFiles: files.length,
      files
    };
  }

  /**
   * Baixa o arquivo bruto do Google Drive para processamento
   */
  async downloadFile(fileId) {
    if (!fileId) throw new Error('ID do arquivo ausente.');
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

    const res = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!res.ok) {
      throw new Error(`Falha ao baixar arquivo do Google Drive (HTTP ${res.status})`);
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await res.arrayBuffer());

    return { buffer, contentType };
  }

  _formatFileEntry(id, name) {
    const low = name.toLowerCase();
    let approxMB = 4.5;
    if (low.includes('tratado') || low.includes('azulay') || low.includes('harrison') || low.includes('cecil')) {
      approxMB = 450.0;
    } else if (low.includes('atlas') || low.includes('netter') || low.includes('sobotta')) {
      approxMB = 140.0;
    }

    let sizeStr = approxMB >= 1 ? `${approxMB.toFixed(1)} MB` : `${Math.round(approxMB * 1024)} KB`;

    return {
      id,
      name,
      sizeMB: approxMB,
      sizeStr,
      date: 'Recente',
      folderPath: ''
    };
  }
}

module.exports = new DriveService();
