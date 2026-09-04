/**
 * MedTutor Brasil - Validador e Conector de Google Drive
 * Extrai IDs de pastas e valida URLs de compartilhamento da turma
 */

export interface DriveConnectionResult {
  isValid: boolean;
  folderId?: string;
  sanitizedUrl: string;
  message: string;
}

export function validateDriveFolderUrl(url: string): DriveConnectionResult {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return {
      isValid: false,
      sanitizedUrl: '',
      message: 'O link do Google Drive não pode estar vazio.'
    };
  }

  // Valida se o domínio pertence ao Google Drive
  const isGoogleDrive = cleanUrl.includes('drive.google.com');
  if (!isGoogleDrive) {
    return {
      isValid: false,
      sanitizedUrl: cleanUrl,
      message: 'Link inválido. Insira uma URL oficial do Google Drive (ex: https://drive.google.com/drive/folders/...)'
    };
  }

  // Extrai ID da pasta caso esteja no formato padrão
  const folderMatch = cleanUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const idParamMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const folderId = folderMatch ? folderMatch[1] : (idParamMatch ? idParamMatch[1] : undefined);

  return {
    isValid: true,
    folderId,
    sanitizedUrl: cleanUrl,
    message: folderId 
      ? `Pasta do Google Drive reconhecida (ID: ${folderId.slice(0, 10)}...).`
      : 'Link do Google Drive conectado com sucesso.'
  };
}
