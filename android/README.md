# Verificador Acadêmico (Android)

Aplicativo Android para verificar semelhança de textos acadêmicos com fontes da internet,
inspirado nas funções de ferramentas de verificação de cópia como o CopySpider, voltado a
uso acadêmico (alunos, orientadores e bancas).

## Funcionalidades

| Função | Descrição |
|---|---|
| Verificar na web | Escolhe frases representativas do texto, pesquisa cada uma entre aspas, baixa as páginas encontradas e calcula quantas palavras coincidem. |
| Percentual geral | Porcentagem de palavras do texto cobertas por trechos idênticos em alguma fonte. |
| Trechos destacados | O texto original aparece com os trechos coincidentes em destaque. |
| Lista de fontes | Cada fonte com seu percentual, título e link para abrir no navegador. |
| Comparar dois textos | Compara dois documentos entre si, sem internet (ex.: trabalho de dupla, versões do mesmo texto). |
| Relatório | Gera texto com data, fontes e aviso, compartilhável por e-mail, Drive, WhatsApp etc. |
| Abrir .txt | Importa arquivos de texto simples. |

### Como o cálculo funciona
1. O texto é normalizado (minúsculas, sem acentos, sem pontuação).
2. Usa-se uma janela de **6 palavras consecutivas** (k-grama). Se uma sequência de 6 palavras
   aparece igual na fonte, as palavras dela são marcadas como coincidentes.
3. O percentual é `palavras marcadas / total de palavras`. Sequências de 6 palavras evitam
   falsos positivos por expressões comuns.

## Estrutura

```
android/
├── core/   # Lógica pura Kotlin (sem Android): tokenização, similaridade, orquestração, testes
└── app/    # Aplicativo Jetpack Compose: telas, configurações e acesso à web
```

## Configuração da busca na web

O app usa a **Google Programmable Search (API oficial)**. Não há raspagem da página de
resultados do Google.

1. Crie um projeto no Google Cloud e gere uma **chave de API** (Custom Search API).
2. Crie um **mecanismo de busca programável** em `programmablesearchengine.google.com` e
   copie o **ID do mecanismo (cx)**. Marque a opção de pesquisar na web inteira.
3. No app, aba **Ajustes**, informe a chave e o cx. Ficam salvos somente no aparelho.

A API tem cota gratuita diária; cada verificação consome uma consulta por frase pesquisada
(até 8 por padrão).

## Como compilar

Requisitos: Android Studio Ladybug (ou mais novo), JDK 17, Android SDK 35.

```bash
cd android
./gradlew :core:test        # testes da lógica (JVM)
./gradlew :app:assembleDebug  # APK de depuração em app/build/outputs/apk/debug/
```

Ou abra a pasta `android/` no Android Studio e clique em **Run**.

> Observação: o repositório não inclui o `gradlew` gerado; o Android Studio cria-o ao abrir o
> projeto (ou rode `gradle wrapper` com Gradle instalado).

## Limitações conhecidas

- Importa apenas `.txt`. PDF e DOCX exigem bibliotecas extras (ex.: PdfBox-Android, POI) e
  ainda não foram implementados.
- A busca depende das fontes indexadas pelo Google. Trabalhos impressos ou em bases
  fechadas (Scielo restrito, bases pagas, bibliotecas) não são encontrados.
- Textos muito curtos (menos de 8 palavras por frase) são ignorados na busca.
- Sinônimos e paráfrases não são detectados; só cópia literal de sequências.

## Uso responsável

- O percentual mede **coincidência textual**, não prova plágio. Trechos citados
  corretamente (aspas, recuo e referência, ABNT) não configuram plágio.
- A análise final cabe ao professor ou à banca.
- Os dados enviados à busca são as frases pesquisadas. Não envie dados pessoais de terceiros
  sem autorização.
