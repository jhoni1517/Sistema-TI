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

**Dois destinos, e a diferença não é detalhe.** `TELEGRAM_CHAT_ID` é o SEU
chat e recebe só a cobrança de mensalidade — nome da loja e quanto ela deve,
que é da sua relação comercial com ela.

Contas a pagar, agenda, aniversário de cliente, fiado vencido e lembrete de
backup vão para o Telegram **de cada loja**, que o dono preenche em
**Configurações → Avisos no Telegram (chat id)**. Ele descobre o número dele
mandando `/start` para o robô.

Loja sem chat preenchido não recebe nada, e nada dela sai. Era o contrário:
tudo caía no seu chat, inclusive nome e dívida de cliente de outra loja.
Isso é dado pessoal de terceiro, e o dono que precisava do lembrete não
recebia nada.

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
| `TELEGRAM_CHAT_ID` | Seu chat, **só para a cobrança de mensalidade** | Você não recebe o resumo de quem está devendo |

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
10. `supabase-migracao-ramo-loja.sql`
11. `supabase-migracao-opcoes-os.sql`
12. `supabase-migracao-imagens.sql`
13. `supabase-migracao-catalogo.sql`
14. `supabase-migracao-ramo-email.sql`
15. `supabase-migracao-rastreio-token.sql`
16. `supabase-corrigir-colunas.sql`

O de número 15 fecha o rastreio público. A consulta pedia só a loja e o
número da OS, e o número é sequencial: quem recebia um link de rastreio
trocava o número e lia — ou CANCELAVA — a fila inteira da loja. Ele cria o
segredo por ordem, preenche as ordens que já existem e derruba as versões
antigas das funções públicas. **Depois de rodar, os links de rastreio já
enviados param de funcionar**; o cliente que abrir um deles lê um aviso
pedindo o link novo, e o botão de WhatsApp da OS já manda o link certo.

O de número 11 é o que faz a página do cliente entender mais de um orçamento
na mesma OS ("fonte de 500W mais SSD" contra "só a fonte de 200W"). Sem ele,
a página soma tudo e mostra um valor maior do que o da tela da loja. Ele
também guarda as funções
`consultar_os` e `responder_orcamento`, que saíram do
`supabase-migracao-seguranca.sql` justamente para não voltarem à versão
antiga quando aquele arquivo for rodado de novo.

O de número 12 cria o depósito de imagens (logo da loja e foto de produto) e
as regras de quem pode escrever nele. Não precisa mexer no painel de Storage
na mão. As imagens ficam abertas para quem tiver o endereço — elas aparecem
no recibo impresso e na página que o cliente abre sem login.

O de número 13 cria o catálogo público. Ele nasce DESLIGADO em toda loja:
ninguém publica preço sem escolher publicar.

Quem liga é **o dono da loja**, em Configurações → Catálogo público, no
próprio sistema. Deixar isso só no SQL entregava a decisão a quem não é dono
do preço e transformava um interruptor em chamado de suporte.

Pelo banco, se precisar (o recado do topo da página ainda só se muda aqui):

```sql
update lojas set catalogo_ativo = true,
       catalogo_recado = 'Entrega no bairro. Chame no WhatsApp.'
 where nome = 'NOME DA LOJA';
```

O de número 14 faz a tela de entrada reconhecer o tipo de loja ao digitar o
e-mail. Ele responde **sem senha**, então quem já sabe o endereço exato de
alguém descobre o ramo do negócio dele — é uma troca consciente, porque sem
ele o reconhecimento só funcionaria em aparelho onde a conta já entrou uma
vez. Para desligar depois, sem quebrar nada:

```sql
revoke execute on function ramo_do_email(text) from anon;
```

O último é seguro rodar quantas vezes quiser e é o primeiro lugar a olhar
quando aparecer `Could not find the 'xxx' column of 'yyy' in the schema
cache`. Esse erro já derrubou venda inteira em silêncio: o estoque baixava e
o dinheiro não entrava.
