// cropFigure.js
import sharp from 'sharp';

export async function cropFigure(pageImageBuffer, box_2d, outputPath) {
  const [ymin, xmin, ymax, xmax] = box_2d; // Ex: [150, 400, 850, 950]
  
  const metadata = await sharp(pageImageBuffer).metadata();
  
  // Converte as coordenadas 0-1000 para pixels reais da imagem
  const top = Math.round((ymin / 1000) * metadata.height);
  const left = Math.round((xmin / 1000) * metadata.width);
  const height = Math.round(((ymax - ymin) / 1000) * metadata.height);
  const width = Math.round(((xmax - xmin) / 1000) * metadata.width);

  await sharp(pageImageBuffer)
    .extract({ top, left, width, height })
    .webp({ quality: 85 })
    .toFile(outputPath);
}