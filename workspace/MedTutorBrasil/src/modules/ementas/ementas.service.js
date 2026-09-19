// Serviço Universal de Ementas & Sequenciamento Cognitivo (MedTutor Brasil)
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { runWithAiLimit } = require('../../shared/ai-limiter');

const universalCurriculumSchema = {
  type: SchemaType.OBJECT,
  properties: {
    institutionName: {
      type: SchemaType.STRING,
      description: "Nome da instituição ou universidade identificada no documento (se houver)"
    },
    curriculumModel: {
      type: SchemaType.STRING,
      description: "Modelo pedagógico identificado (ex: 'Modular / Integrado', 'Tradicional / Disciplinar', 'PBL / Espiral')"
    },
    periods: {
      type: SchemaType.ARRAY,
      description: "Lista ordenada de divisões cronológicas ou blocos curriculares",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          period: {
            type: SchemaType.STRING,
            description: "Nome do período, ano, bloco ou semestre (ex: '1º Período', 'Módulo Integrado 2', 'Internato')"
          },
          cycleName: {
            type: SchemaType.STRING,
            description: "Classificação: 'Ciclo Básico', 'Ciclo Clínico', 'Internato Médico' ou 'Eletivo'"
          },
          subjects: {
            type: SchemaType.ARRAY,
            description: "Lista de disciplinas ou módulos exatamente como descritos no documento",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                code: {
                  type: SchemaType.STRING,
                  description: "Código do módulo se existir (ex: 'M001', 'M011', ou null)"
                },
                name: {
                  type: SchemaType.STRING,
                  description: "Nome formal completo do módulo ou disciplina"
                },
                description: {
                  type: SchemaType.STRING,
                  description: "Resumo em 1-2 linhas dos tópicos da unidade curricular"
                }
              },
              required: ["name"]
            }
          }
        },
        required: ["period", "cycleName", "subjects"]
      }
    }
  },
  required: ["periods"]
};

const materialClassificationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    pedagogicalPhase: {
      type: SchemaType.INTEGER,
      description: "Fase pedagógica recomendada (1 a 9)"
    },
    targetSubject: {
      type: SchemaType.STRING,
      description: "Disciplina da matriz do estudante que melhor acolhe este material, exatamente como consta no catálogo recebido"
    },
    refinedTitle: {
      type: SchemaType.STRING,
      description: "Título curto, específico e fiel ao conteúdo real do material, sem nome de arquivo, extensão ou metadados administrativos"
    },
    diseaseTopic: {
      type: SchemaType.STRING,
      description: "Tema biomédico central do material; pode ser conceito, estrutura, processo ou doença"
    },
    confidencePercent: {
      type: SchemaType.INTEGER,
      description: "Confiança da classificação entre 0 e 100"
    },
    justification: {
      type: SchemaType.STRING,
      description: "Justificativa clínica da alocação"
    }
  },
  required: ["pedagogicalPhase", "targetSubject", "refinedTitle", "diseaseTopic", "justification", "confidencePercent"]
};

const SYSTEM_CURRICULUM_PROMPT = `
Você é o auditor acadêmico e estruturador pedagógico universal do MedTutor Brasil.
Sua missão é extrair ESTRITAMENTE a matriz curricular médica contida no documento enviado pelo estudante, sem impor modelos pré-fabricados.

DIRETRIZES FUNDAMENTAIS:
1. FIDELIDADE ESTRITA: Use os nomes de disciplinas e módulos exatamente como constam no texto (se a faculdade usa 'M011 Integração de Sistemas Humanos III (Sistema Nervoso)', extraia dessa forma; não substitua por 'Neuroanatomia').
2. CÓDIGOS E IDENTIFICADORES: Preserve códigos como M001, M005, MED101 no campo 'code'.
3. DESCARTE DE RUÍDO: Ignore datas de calendário, nomes de professores, turmas, horários e cargas horárias avulsas (ex: 60h).
4. PERIODIZAÇÃO: Mapeie todos os períodos que existirem no documento (do 1º ao 12º período, incluindo Internato).
`;

class EmentasService {
  constructor() {
    this.currentCurriculum = [];
    this.institutionMetadata = null;

    this.pedagogicalPhases = [
      { phase: 1, name: 'Morfologia, Anatomia & Histologia', icon: '🏛️' },
      { phase: 2, name: 'Fisiologia & Biofísica', icon: '⚡' },
      { phase: 3, name: 'Patologia Geral & Imunologia', icon: '🛡️' },
      { phase: 4, name: 'Semiologia & Propedêutica Clínica', icon: '🩺' },
      { phase: 5, name: 'Fisiopatologia & Doenças Específicas', icon: '🔬' },
      { phase: 6, name: 'Métodos Diagnósticos & Propedêutica Armada', icon: '📊' },
      { phase: 7, name: 'Farmacologia & Terapêutica Racional', icon: '💊' },
      { phase: 8, name: 'Casos Clínicos & Condutas de Emergência', icon: '🚨' },
      { phase: 9, name: 'Tratados & Sínteses de Revisão Geral', icon: '📚' }
    ];
  }

  _getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada no servidor backend.");
    }
    return new GoogleGenerativeAI(apiKey);
  }

  async parseAndHarmonizeSyllabus(rawText) {
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 20) {
      throw new Error("Texto insuficiente para extração da ementa.");
    }

    const genAI = this._getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_BALANCED || "gemini-3.5-flash",
      systemInstruction: SYSTEM_CURRICULUM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: universalCurriculumSchema,
      }
    });

    const prompt = `Analise o documento e estruture a matriz curricular exata desta faculdade de Medicina:\n\n"""\n${rawText.slice(0, 150000)}\n"""`;
    const result = await runWithAiLimit(() => model.generateContent(prompt));
    const parsed = JSON.parse(result.response.text());

    if (!parsed || !Array.isArray(parsed.periods) || parsed.periods.length === 0) {
      throw new Error("A IA não conseguiu identificar períodos ou matérias no texto enviado.");
    }

    this.institutionMetadata = {
      institutionName: parsed.institutionName || 'Instituição de Ensino Superior',
      curriculumModel: parsed.curriculumModel || 'Integrado/Modular'
    };

    this.currentCurriculum = parsed.periods.map(p => ({
      period: p.period,
      cycleName: p.cycleName,
      subjects: p.subjects
        .filter(s => s && typeof s.name === 'string' && s.name.trim())
        .map(s => ({
          code: typeof s.code === 'string' ? s.code.trim() : '',
          name: s.code ? `${s.code} ${s.name}` : s.name.trim(),
          description: typeof s.description === 'string' ? s.description.trim() : '',
          isUser: true
        })),
      details: p.subjects
    })).filter(p => p.subjects.length > 0);

    if (this.currentCurriculum.length === 0) {
      throw new Error("A IA não encontrou disciplinas válidas no texto enviado.");
    }

    return {
      metadata: this.institutionMetadata,
      curriculum: this.currentCurriculum
    };
  }

  async classifyMaterialSemantically(materialContent, materialName, suppliedCurriculum = [], targetSemester = '') {
    const sourceCurriculum = Array.isArray(suppliedCurriculum) && suppliedCurriculum.length
      ? suppliedCurriculum
      : this.currentCurriculum;
    if (sourceCurriculum.length === 0) {
      throw new Error('Importe a ementa oficial antes de classificar materiais.');
    }

    const normalizedSubjects = [];
    sourceCurriculum.forEach(p => {
      if (p?.name && !Array.isArray(p?.subjects)) {
        normalizedSubjects.push({
          name: String(p.name).trim(),
          period: String(p.period || p.fullPeriod || '').trim(),
          cycleName: String(p.cycleName || p.cycle || '').trim(),
          description: String(p.description || '').trim()
        });
        return;
      }
      p.subjects.forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name) normalizedSubjects.push({
          name: String(name).trim(),
          period: String(p.period || '').trim(),
          cycleName: String(p.cycleName || p.cycle || '').trim(),
          description: String(typeof s === 'object' ? s.description || '' : '').trim()
        });
      });
    });
    const semester = String(targetSemester || '').trim().toLowerCase();
    const eligibleSubjects = semester
      ? normalizedSubjects.filter(subject => String(subject.period || '').toLowerCase().includes(semester))
      : normalizedSubjects;
    const candidates = eligibleSubjects.length ? eligibleSubjects : normalizedSubjects;
    if (!candidates.length) throw new Error('A grade curricular não possui disciplinas válidas para classificar o material.');
    const flatSubjects = candidates.map(subject => `[${subject.period || 'Período não informado'}] ${subject.name}${subject.description ? ` — ${subject.description}` : ''}`);

    const genAI = this._getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.MODEL_BALANCED || "gemini-3.5-flash",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: materialClassificationSchema,
      }
    });

    const prompt = `
Alinhe o material "${materialName}" com a matriz curricular e a escala de 9 fases pedagógicas:

ESCALA PEDAGÓGICA (1 a 9):
1: Morfologia, Anatomia & Histologia
2: Fisiologia & Biofísica
3: Patologia Geral & Imunologia
4: Semiologia & Propedêutica Clínica
5: Fisiopatologia & Doenças Específicas
6: Métodos Diagnósticos & Exames
7: Farmacologia & Terapêutica Racional
8: Casos Clínicos & Emergências
9: Tratados & Revisões Gerais

MATRIZ DO ESTUDANTE (CATÁLOGO FECHADO):
${JSON.stringify(flatSubjects, null, 2)}

TRECHO DO ARQUIVO:
"""
${(materialContent || materialName).slice(0, 60000)}
"""

REGRAS ABSOLUTAS:
- targetSubject deve ser EXATAMENTE um dos nomes do catálogo fechado.
- refinedTitle descreve o assunto realmente ensinado, não o nome do arquivo, a disciplina, professor, data, "aula" ou "slide".
- Se o material for visual ou curto, seja conservador e use apenas evidências disponíveis.
`;

    const res = await runWithAiLimit(() => model.generateContent(prompt));
    const parsed = JSON.parse(res.response.text());
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const rawTarget = normalize(parsed.targetSubject);
    const matchedSubject = candidates.find(subject => normalize(subject.name) === rawTarget)
      || candidates.find(subject => rawTarget.includes(normalize(subject.name)) || normalize(subject.name).includes(rawTarget));
    if (!matchedSubject) {
      throw new Error('A IA retornou uma disciplina fora da grade curricular autorizada.');
    }

    return {
      pedagogicalPhase: Math.min(9, Math.max(1, Number(parsed.pedagogicalPhase) || 5)),
      targetSubject: matchedSubject.name,
      period: matchedSubject.period,
      cycleName: matchedSubject.cycleName,
      refinedTitle: String(parsed.refinedTitle || '').trim().slice(0, 220),
      diseaseTopic: String(parsed.diseaseTopic || '').trim().slice(0, 220),
      justification: String(parsed.justification || '').trim().slice(0, 1000),
      confidencePercent: Math.min(99, Math.max(0, Number(parsed.confidencePercent) || 0))
    };
  }

  async getCurriculum() {
    return {
      metadata: this.institutionMetadata,
      curriculo: this.currentCurriculum,
      totalDisciplinas: this.currentCurriculum.reduce((acc, p) => acc + (p.subjects ? p.subjects.length : 0), 0),
      fasesPedagogicas: this.pedagogicalPhases
    };
  }

  async getSubjectDetails(subjectIdOrName) {
    const raw = String(subjectIdOrName || '').trim().toLowerCase();

    for (const p of this.currentCurriculum) {
      for (const s of p.subjects) {
        const name = typeof s === 'string' ? s : s.name;
        const normalized = String(name || '').toLowerCase();
        if (normalized && (normalized === raw || normalized.includes(raw) || raw.includes(normalized))) {
          return { nome: name, periodo: p.period, ciclo: p.cycleName, status: 'Ativa na Ementa' };
        }
      }
    }

    return {
      nome: subjectIdOrName,
      periodo: 'Não Especificado',
      ciclo: 'Personalizado',
      status: 'Customizada'
    };
  }

  orderMaterialsByPedagogicalFlow(materials = []) {
    if (!Array.isArray(materials)) return [];
    return materials.sort((a, b) => (a.pedagogicalPhase || 5) - (b.pedagogicalPhase || 5));
  }

  allocateMaterial(materialName, targetSubject, existingMaterials = []) {
    const cleanSubject = String(targetSubject || 'Geral').trim();
    const updated = existingMaterials.map(m => ({
      ...m,
      selected: (m.subject || m.disciplina) === cleanSubject
    }));

    const newMaterial = {
      id: `mat_${Date.now()}`,
      name: String(materialName || 'Material Sem Título').trim(),
      subject: cleanSubject,
      selected: true,
      createdAt: new Date().toISOString()
    };

    return {
      novoMaterial: newMaterial,
      materiaisAtualizados: [...updated, newMaterial]
    };
  }
}

module.exports = new EmentasService();
