# Configuração e segurança

Checklist do que precisa estar configurado fora do código. Cada item diz o
que quebra quando ele falta — porque a maioria dessas falhas é silenciosa, e
silêncio parece "está tudo bem".

Confira tudo de uma vez em
**https://sistema-ti-caixa.vercel.app/api/status?chave=SEU_CRON_SECRET**
(troque pelo valor que você pôs em `CRON_SECRET`). O campo `pendencias`
lista em português o que ainda falta.

Sem a chave a página só confirma que a função está publicada. Ela mostra os
últimos lançamentos do caixa e os identificadores dos robôs — não é coisa
para ficar aberta na internet.

---

## 1. Rotacionar as chaves

Chave que apareceu em conversa, print, e-mail ou commit é chave queimada.
Não existe "mas ninguém viu" — o certo é trocar e seguir a vida.

### Supabase

1. Abra https://supabase.com/dashboard/project/nviagibefxqtognowqwe/settings/api-keys
2. Em **Secret keys**, revogue a chave antiga e crie outra.
3. Em **Publishable / anon key**, gere a nova.
4. Leve as duas para o Vercel (passo 2 abaixo) e publique de novo.

Ordem importa: publique o Vercel com a chave nova **antes** de revogar a
velha, senão o sistema fica fora do ar entre os dois passos.

### Telegram

1. Fale com o [@BotFather](https://t.me/BotFather) → `/mybots` → seu bot →
   **API Token** → **Revoke current token**.
2. Copie o token novo para `TELEGRAM_TOKEN` no Vercel.
3. Reaponte o webhook:
   `https://api.telegram.org/bot<TOKEN_NOVO>/setWebhook?url=https://sistema-ti-caixa.vercel.app/api/telegram`

---

## 2. Variáveis no Vercel

https://vercel.com/dashboard → projeto → **Settings** → **Environment
Variables**. Marque **Production**, **Preview** e **Development** em todas.

| Nome | Para que serve | O que quebra sem ela |
|---|---|---|
| `VITE_SUPABASE_URL` | Endereço do banco | Cada máquina tem que digitar isso na mão em Configurações |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do banco | Idem — e rotacionar vira um trabalho por máquina |
| `SUPABASE_URL` | Mesmo endereço, para as funções do servidor | Cron e "Liberar senha" não sobem |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço | Aviso diário de mensalidade e de contas não dispara; "Liberar senha" não funciona |
| `CRON_SECRET` | Senha do robô diário | `/api/cobranca` fica aberto para qualquer um chamar |
| `TELEGRAM_TOKEN` | Robô do Telegram | Nenhuma notificação chega no celular |
| `TELEGRAM_CHAT_ID` | Para quem mandar | O aviso não sabe o destino |

Depois de salvar, vá em **Deployments** e clique em **Redeploy** no item
mais recente. Variável nova só entra em build novo — salvar sem publicar não
muda nada, e esse é o erro mais comum.

Definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` é o que transforma
rotação de chave em "mexe em um lugar" em vez de "avisa cada loja para
digitar de novo".

---

## 3. E-mail (SMTP)

Sem SMTP próprio, o Supabase usa um servidor de teste que praticamente não
entrega. Na prática: **"esqueci minha senha" não funciona** e o e-mail de
confirmação de conta nova não chega.

### Enquanto não configurar

Existe a saída de emergência: **Lojas → Liberar senha**. Você digita o
e-mail da conta, o sistema gera o link oficial do Supabase e você manda pelo
WhatsApp. O link vale uma vez e expira em 1 hora.

Isso resolve o caso urgente, mas não substitui o SMTP: com dez lojas, você
não quer ser o servidor de e-mail delas.

### Configurando com Resend

1. Crie a conta em https://resend.com e valide um domínio seu em
   https://resend.com/domains (com domínio validado a entrega para em spam
   muito menos; sem domínio próprio dá para testar com o remetente de teste).
2. Gere uma chave em https://resend.com/api-keys.
3. Abra https://supabase.com/dashboard/project/nviagibefxqtognowqwe/settings/auth
   → **SMTP Settings** → **Enable Custom SMTP** e preencha:

   | Campo | Valor |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a chave gerada no passo 2 |
   | Sender email | um endereço do domínio validado |
   | Sender name | Sistema TI |

4. Salve e teste com "esqueci minha senha" numa conta de verdade.

Confira também **URL Configuration** → **Redirect URLs**: precisa conter
`https://sistema-ti-caixa.vercel.app/**`, senão o link abre e volta para a
home sem deixar trocar a senha.

---

## 4. Banco de dados

Rode na ordem, uma vez cada, em
https://supabase.com/dashboard/project/nviagibefxqtognowqwe/sql/new:

1. `supabase-schema.sql`
2. `supabase-migracao-seguranca.sql`
3. `supabase-migracao-convites.sql`
4. `supabase-migracao-cripto.sql`
5. `supabase-migracao-cotacoes.sql`
6. `supabase-migracao-assinatura.sql`
7. `supabase-migracao-contas.sql`
8. `supabase-migracao-agenda.sql`
9. `supabase-migracao-pdv.sql`
10. `supabase-corrigir-colunas.sql`

O último é seguro rodar quantas vezes quiser e é o primeiro lugar a olhar
quando aparecer `Could not find the 'xxx' column of 'yyy' in the schema
cache`. Esse erro já derrubou venda inteira em silêncio: o estoque baixava e
o dinheiro não entrava.
