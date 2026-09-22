# Liberação de acesso por cupom

O fluxo de cupom é independente de cobrança: toda conta Firebase, antiga ou nova, precisa informar o código antes de acessar o espaço de estudos. A conta é validada por UID e pela versão da concessão. A versão atual é `2026-09-22-v1`; concessões anteriores, inclusive as que não registravam versão, voltam a exigir o cupom uma vez. Depois do resgate, a pessoa recebe liberação permanente (ou pelo prazo opcional configurado). O código é validado somente no servidor, nunca enviado no bundle web.

## Configuração necessária no Render

Configure estes Environment Variables no serviço web:

- `ACCESS_GATE_ENABLED=true` para exigir cupom.
- `ACCESS_COUPON_CODE` com um código longo e aleatório; não reutilize senha ou credencial de outro serviço.
- `ACCESS_COUPON_MAX_REDEMPTIONS=0` para permitir que todas as contas que tenham o cupom o ativem; cada conta só pode resgatar uma vez. Um inteiro positivo impõe um limite global de contas.
- `ACCESS_COUPON_ACCESS_DAYS=0` para acesso sem vencimento; um inteiro positivo define o número de dias.
- `FIREBASE_PROJECT_ID=cobra-ai-6549d`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` com a chave JSON de uma conta de serviço do Firebase Admin. No Render, marque-a como secreta; não a coloque em `.env.example`, no navegador ou no GitHub.

O usuário precisa estar autenticado antes de resgatar. O resgate é atômico no Firestore: evita ultrapassar um limite positivo de ativações, impede reutilização do mesmo cupom pela mesma conta e persiste o direito em `access_grants` antes de liberar as custom claims do Firebase.

## Regras do Firestore

`firestore.rules` exige as custom claims `medtutorAccess` e `medtutorAccessVersion` para as operações de estudo. Publique as regras atualizadas no Firebase Console para que concessões antigas também sejam invalidadas no acesso direto. Os endpoints de IA verificam as duas claims no servidor; versões antigas são bloqueadas. O endpoint de status registra a versão necessária para a conta autenticada e sincroniza a concessão persistida. O armazenamento de arquivos é feito pelo Supabase e não é controlado por `storage.rules` do Firebase.

Antes de ativar em produção, confirme que a conta de serviço tem acesso de escrita ao Firestore e que o serviço está apontando para o projeto `cobra-ai-6549d`. Se o segredo Admin ou o cupom não estiver configurado, o app falha fechado quando `ACCESS_GATE_ENABLED=true`, em vez de liberar acesso por erro.

## Desativar

Para voltar ao acesso sem cupom, defina `ACCESS_GATE_ENABLED=false` no Render e publique regras do Firestore compatíveis com a política desejada. Não apague `access_grants` sem decidir se pretende revogar as concessões já dadas.

Os eventos de ativação não registram o código em logs. A coleção `access_coupon_usage` contém apenas hash e contador; `access_coupon_redemptions` associa a ativação ao UID do Firebase.
