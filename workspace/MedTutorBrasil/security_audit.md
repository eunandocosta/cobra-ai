# Relatório de Auditoria de Segurança e Diretrizes de Conformidade (LGPD/Saúde)

**Projeto:** MedTutorBrasil  
**Documento:** `security_audit.md`  
**Classificação:** Confidencial / Uso Interno  
**Versão:** 1.0  
**Status:** Aprovado com Recomendações Técnicas Obrigatórias  

---

## 1. Sumário Executivo e Escopo de Conformidade

O **MedTutorBrasil** é uma solução de suporte à formação médica que processa inputs conversacionais, resumos contextuais, flashcards com repetição espaçada e dados de desempenho acadêmico baseados nas Diretrizes Curriculares Nacionais (DCNs). 

A presença de estudantes em estágio de internato e ciclo clínico introduz risco crítico de vazamento não intencional de **Dados Pessoais Sensíveis** (Art. 5º, II, LGPD / Art. 11, LGPD) referentes a pacientes reais inseridos como "casos clínicos de estudo". 

Este documento estabelece a arquitetura de segurança, vetores de mitigação e requisitos mandatórios de criptografia, anonimização e governança de dados.

---

## 2. Pipeline de Anonimização e Desidentificação de Casos Clínicos

Estudantes frequentemente copiam trechos de prontuários ou descrevem casos reais de enfermarias/ambulatórios. Nenhuma informação de identificação direta ou indireta de pacientes deve atingir os modelos de linguagem (LLMs) ou a camada de persistência em nuvem.

```
[Input do Estudante] 
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Camada 1 (Client-Side): Sanitização Regex Heurística     │ -> Remove CPF, CNS, Telefones, Datas, Nomes
└──────────────────────────────┬───────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│ Camada 2 (BFF Gateway): NER Clínico (Named Entity Rec.)  │ -> Mascaramento: [NOME_PACIENTE], [HOSPITAL]
└──────────────────────────────┬───────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│ Camada 3: Validação de Zero-Leakage & Injeção de Contexto│ -> Roteamento para LLM / Memória Compacta
└──────────────────────────────────────────────────────────┘
```

### 2.1. Regras de Sanitização Pré-Processamento (Client-Side + Edge Gateway)
1. **Identificadores Diretos:**
   - **Documentos Brasileiros:** Regex estrita para validação e mascaramento de CPF, RG, CNS (Cartão Nacional de Saúde) e números de prontuário hospitalar.
   - **Nomes Próprios e Topônimos:** Execução de modelo local/BFF leve de *Named Entity Recognition* (spaCy PT / BioBERTpt) para substituição de entidades (`PER` $\to$ `[PACIENTE_A]`, `LOC` $\to$ `[INSTITUIÇÃO_X]`).
2. **Quase-Identificadores (k-Anonimato):**
   - **Idades Extensas:** Agrupamento etário automático para extremos (ex.: idades $> 89$ anos convertidas para "$\ge 90$ anos").
   - **Datas:** Transformação de datas exatas de internação/atendimento em marcações temporais relativas (ex.: "12/03/2023" $\to$ "Dia D").
   - **Condições Raras:** Truncamento de cruzamento geográfico associado a doenças ultrarraras.
3. **Bloqueio Ativo de Mídia:** Rejeição ou sanitização com strip total de metadados EXIF/DICOM caso ocorra upload de exames e laudos complementares.

---

## 3. Arquitetura Criptográfica e Armazenamento Local (Mobile)

O ecossistema mobile (Flutter) deve garantir que a persistência da memória contextual ultra-eficiente, dados de flashcards (SRS), quizzes e cache de matérias permaneçam indecifráveis em cenários de *device loss*, *device theft*, extrações forenses ou dispositivos com *root/jailbreak*.

### 3.1. Matriz de Persistência Segura

| Tipo de Dado | Mecanismo de Armazenamento | Algoritmo Criptográfico | Ciclo de Vida da Chave |
| :--- | :--- | :--- | :--- |
| **Tokens de Sessão / API Keys Locais** | `flutter_secure_storage` | Keystore (Android) / KeyChain (iOS) | Por instalação / Revogação remota |
| **Memória Contextual Resumida** | SQLCipher / Isar Encrypted | AES-256-GCM | Chave mestra derivada no Secure Storage |
| **Flashcards (SRS) & Quizzes** | SQLite criptografado (SQLCipher) | AES-256-CBC com HMAC-SHA256 | Derivação via PBKDF2 (100k+ iterações) |
| **Vetores de Embeddings Locais** | Flatbuffers cifrados em disco | AES-256-GCM | Destruição ao resetar matéria |

### 3.2. Implementação do Flutter Secure Storage & SQLCipher
- **Key Derivation Function (KDF):** Proibido o hardcoding de chaves ou seeds na base de código Dart/C++. A chave mestra deve ser gerada via `java.security.SecureRandom` (Android) e `SecRandomCopyBytes` (iOS) e selada no hardware seguro (TEE/Secure Enclave).
- **Prevenção de Memory Dumps:**
  - Desativação explícita de backups automáticos no Android (`android:allowBackup="false"` no `AndroidManifest.xml`).
  - Flag de exclusão de backup no iCloud para diretórios do app no iOS (`NSURLIsExcludedFromBackupKey`).
- **Validação de Integridade em Runtime:**
  - Detecção ativa de *Root/Jailbreak* via integridade de chamadas nativas (ex.: verificação de binários `su`, `Frida`, ganchos de `Substrate`).
  - Ativação de `FLAG_SECURE` nas janelas do Android para impedir screenshots e visualização em task switchers de dados clínicos expostos na aba de chat.

---

## 4. Governança LGPD, Telemetria e Ciclo de Vida de Modelos (LLMs)

O processamento de dados educacionais que tangenciam o ambiente hospitalar impõe restrições sob a LGPD (Lei nº 13.709/2018).

```
                                    LGPD COMPLIANCE BOUNDARY
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Estudante] ──(TLS 1.3 / Cert Pinning)──> [Backend MedTutorBrasil (BFF)]               │
│                                                   │                                    │
│       ┌───────────────────────────────────────────┴─────────────────────────────┐      │
│       ▼                                                                         ▼      │
│ ┌───────────────────────────┐                         ┌──────────────────────────────┐ │
│ │ Telemetria de Aprendizado │                         │ Gateway de Inferência LLM    │ │
│ │ (Sem PII / Sem Casos)     │                         │ (Zero-Data-Retention Policy) │ │
│ └─────────────┬─────────────┘                         └──────────────┬───────────────┘ │
│               │                                                      │                 │
│               ▼                                                      ▼                 │
│    [Analytics Agregado]                                    [API LLM Enterprise]        │
│    (Retenção: 12 meses)                                   (Opt-Out de Treinamento)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1. Uso de Dados e Treinamento de Modelos (Art. 11 e Art. 7º, LGPD)
1. **Cláusula de Treinamento Zero (Zero-Retention / No-Training SLA):**
   - Os contratos com provedores de LLMs (OpenAI Enterprise, Anthropic, AWS Bedrock, etc.) devem conter aditivos vinculantes que proíbam explicitamente o uso de prompts, outputs e memórias contextuais para re-treinamento, fine-tuning ou melhoria contínua dos modelos públicos dos provedores.
2. **Bases Legais Aplicáveis:**
   - **Execução de Contrato (Art. 7º, V):** Para a entrega da experiência pedagógica personalizada, tracking de matérias (Ciclo Básico, Clínico e Internato) e repetição espaçada.
   - **Consentimento Expresso e Destacado (Art. 11, I):** Exigido no onboarding para o processamento de notas de estágio e feedbacks clínicos reflexivos.
3. **Minimização da Memória Contextual Compacta:**
   - O sistema de memória resumida entre chats deve armazenar exclusivamente **conceitos pedagógicos consolidados** (ex.: *"Estudante apresenta dúvidas recorrentes no diagnóstico diferencial de insuficiência cardíaca com fração de ejeção preservada"*), expurgando quaisquer detalhes fáticos que descrevam o paciente do caso gerador.

### 4.2. Telemetria e Logs
- **Proibição de Payload Logging:** Logs de erros (Sentry/Datadog) e telemetria comportamental (PostHog/Mixpanel) devem aplicar filtros no client-side para sanitizar o campo de texto livre do chat, termos de flashcards e respostas reflexivas.
- **Rastreabilidade de Consentimento:** Armazenamento imutável de logs de aceite de Termos de Uso e Políticas de Privacidade com carimbo de tempo (*timestamp* UTC) e versão do documento.

---

## 5. Práticas de Segurança na Integração com APIs Científicas Externas

A integridade do raciocínio socrático depende da confiabilidade das fontes consultadas (PubMed/NCBI, SciELO, UpToDate). A adulteração das respostas pode induzir o estudante a erros propedêuticos graves.

### 5.1. Vetores de Ameaça e Mitigações

```
[BFF MedTutorBrasil] ──(mTLS / Egress Firewall)──> [APIs Científicas: PubMed / SciELO / UpToDate]
        │
        ├──> [Validação de Schema JSON / XML contra XSS/Injeção]
        ├──> [Verificação Criptográfica de Origem & Rate Limiting]
        └──> [Sanitização Semântica contra Prompt Injection Indireto]
```

1. **Arquitetura Backend-For-Frontend (BFF):**
   - O aplicativo móvel **nunca** deve se comunicar diretamente com as APIs do PubMed, SciELO ou UpToDate utilizando chaves de API embutidas no binário.
   - Todas as requisições devem passar pelo BFF do MedTutorBrasil, que gerencia as credenciais em um cofre de segredos (*HashiCorp Vault* ou *AWS Secrets Manager*).
2. **Defesa contra Injeção Indireta de Prompt (Indirect Prompt Injection):**
   - Textos recuperados das APIs científicas devem ser tratados como entradas não confiáveis (*untrusted data*). 
   - Devem ser encapsulados em tags de isolamento semântico delimitadas (ex.: `<academic_reference> ... </academic_reference>`) antes de serem injetados no contexto da LLM, evitando que abstracts maliciosos sequestrem o comportamento do Tutor Socrático.
3. **Resiliência e Cache Criptografado de Evidências:**
   - Implementação de cache das revisões bibliográficas com validação de hash SHA-256 das fontes científicas.
   - Rate limiting agressivo no gateway e circuit breaker para mitigar ataques de negação de serviço (DoS) ou scraping massivo que possam esgotar as quotas de consulta institucional.
4. **Transporte Seguro:**
   - **TLS 1.3** obrigatório em todas as comunicações.
   - **SSL/TLS Pinning** implementado no aplicativo Flutter (via `HttpCertificatePinning` ou validação customizada em `SecurityContext`) para anular ataques de Man-in-the-Middle (MitM) em redes corporativas/acadêmicas desprotegidas.

---

## 6. Matriz de Ações Corretivas e Checklist de Engenharia

| ID | Domínio | Vulnerabilidade / Risco | Ação Corretiva Mandatória | Prioridade |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Anonimização | Entrada de nomes/CPFs reais no Chat | Implantar pipeline client/server com Regex e NER antes do envio ao LLM | **Crítica** |
| **SEC-02** | Local Storage | Extração de flashcards e resumos de chat via ADB Backup | Forçar `SQLCipher` com AES-256 e `android:allowBackup="false"` | **Alta** |
| **SEC-03** | LLM Privacy | Vazamento de dados para treino de modelos | Assinar aditivo Enterprise BAA/Zero Data Retention com provedores de IA | **Crítica** |
| **SEC-04** | API Security | Chaves de APIs científicas expostas via engenharia reversa do APK | Migrar chamadas para BFF; implementar Certificate Pinning no app | **Alta** |
| **SEC-05** | LGPD | Falta de rastreabilidade de exclusão de dados | Implementar endpoint DSR (*Data Subject Request*) para eliminação total de dados (Art. 18, LGPD) | **Alta** |
| **SEC-06** | UI Security | Captura de tela com dados clínicos confidenciais | Ativar `FLAG_SECURE` nas views de chat e revisão de flashcards | **Média** |

---

## 7. Parecer Conclusivo

A arquitetura do **MedTutorBrasil** é viável sob a perspectiva de segurança da informação e privacidade médica, desde que as defesas em camadas (*Defense-in-Depth*) descritas neste relatório sejam aplicadas integralmente antes do lançamento em ambiente de produção (Beta/App Stores). 

A conformidade com a LGPD e a proteção contra vazamentos de dados clínicos de pacientes em treinamento acadêmico dependem estritamente do isolamento de contexto e do pipeline de anonimização prévia.