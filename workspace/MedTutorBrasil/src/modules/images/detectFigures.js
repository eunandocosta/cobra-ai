// detectFigures.js
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runWithAiLimit } = require('../../shared/ai-limiter.js');

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  return new GoogleGenerativeAI(apiKey);
}

const figureDetectionSchema = {
  type: SchemaType.ARRAY,
  description: "Lista de ilustrações, gráficos, esquemas anatômicos ou tabelas visuais encontradas",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      descricao: { type: SchemaType.STRING, description: "O que a ilustração mostra (ex: corte axial do bulbo, ECG)" },
      box_2d: {
        type: SchemaType.ARRAY,
        description: "Coordenadas normalizadas [ymin, xmin, ymax, xmax] de 0 a 1000",
        items: { type: SchemaType.INTEGER }
      }
    },
    required: ["descricao", "box_2d"]
  }
};

export async function detectFiguresOnSlide(pageImageBuffer) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: process.env.MODEL_FAST || "gemini-3.5-flash-lite",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: figureDetectionSchema
    }
  });

  const prompt = `
Identifique APENAS ilustrações clínicas, anatômicas, esquemas fisiopatológicos, gráficos ou fotos médicas presentes nesta imagem.
IGNORE: títulos de slides, textos explicativos, cabeçalhos, rodapés e logotipos.
Retorne as coordenadas normalizadas de 0 a 1000 da região onde está a figura.
`;

  const result = await runWithAiLimit(() => model.generateContent([
    prompt,
    { inlineData: { data: pageImageBuffer.toString("base64"), mimeType: "image/webp" } }
  ]));

  return JSON.parse(result.response.text());
}
