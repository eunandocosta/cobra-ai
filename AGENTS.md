# Diretrizes de Execução e Versionamento

1. **Escopo do Repositório**: Trabalhe exclusivamente no repositório `/Users/nand0c0sta/Projetos/autonomous-agents`.
2. **Sincronização Inicial**: A cada execução, execute `git fetch origin --prune` e compare `HEAD` com `origin/main`.
3. **Preservação de Alterações Locais**: Jamais utilize `git reset`, checkout destrutivo ou `pull` que possa sobrescrever alterações locais.
4. **Commits Locais**:
   - Havendo alterações locais desde o último commit, revise `git diff --stat` e `git diff --check`.
   - Crie um commit local com mensagem em português que destaque de forma objetiva os arquivos e as diferenças funcionais da versão.
   - Não faça commit vazio.
   - Não faça push ao GitHub.
5. **Comportamento em Silêncio**: Se não houver alterações locais, permaneça silencioso (ou emita mensagem mínima se a interface exigir texto).
6. **Leitura Prévia de Código**: Antes de executar código após mais de três horas sem mudanças, leia integralmente os arquivos de código que pretende executar ou modificar.
7. **Notificações**: Notifique apenas quando houver commit, falha ou necessidade de ação do usuário.
