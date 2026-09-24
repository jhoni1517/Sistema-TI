# Roadmap — assistência técnica

Auditoria feita em 23/09/2026 lendo o código, não a memória. Cada item diz
onde está o que já existe, para ninguém refazer o que está pronto.

Legenda: **[JÁ EXISTE]**, **[PARCIAL — o que falta]**, **[NÃO EXISTE]**.

---

### 1. Página pública de rastreio da OS com linha do tempo, fotos de entrada, previsão e marca da loja

**[JÁ EXISTE — feito em 23/09/2026, migração 25]** Linha do tempo com data,
previsão, marca da loja, fotos do laudo com hora e botão de WhatsApp. O
texto abaixo é a auditoria de antes.

**[era PARCIAL — faltava linha do tempo com data, previsão, marca da loja e contato]**

Existe (`pages/Rastreio.tsx`, `lib/rastreio.ts`, função `consultar_os` em
`supabase-migracao-video-laudo.sql`):
- Link com segredo por OS (`rastreio`), conferido dentro da função SQL
- Situação em destaque, aparelho, primeiro nome, valor
- Fotos e vídeos **do laudo** (até 6 e 3), com o corte feito no banco

Falta:
- **Linha do tempo com data/hora.** A tela desenha um fluxo fixo de etapas,
  não o `historico` real da OS. A função não devolve o histórico.
- **Previsão de entrega.** Não existe campo na OS.
- **Marca da loja.** A função não devolve nome, logo nem cor da loja; o topo
  mostra a chave inglesa do sistema.
- **Botão "Falar com a loja".** A página não tem telefone da loja.
- "Aguardando peça" não aparece no fluxo desenhado (a etapa existe no tipo).

Atenção: **fotos de ENTRADA não devem ir para o cliente.** Isso é decisão
registrada em `types.ts` (`fotosLaudo`) e em `supabase-migracao-fotos-laudo.sql`:
as de entrada são a prova da loja e pegam tela de bloqueio e papel de
parede. O que vai para a página são as do laudo.

### 2. Aprovação de orçamento pelo link

**[JÁ EXISTE]**

`responder_orcamento` (exige o segredo do link), com escolha entre
orçamentos alternativos e o total de cada um calculado no banco pela mesma
regra de `lib/orcamento.ts`.

### 3. Pagamento Pix pelo link com baixa automática no caixa

**[JÁ EXISTE — feito em 23/09/2026, Mercado Pago, migração 26]** `api/pix.js`,
`lib/pix.ts`, `CredencialPix` em Configurações. Antes: **[NÃO EXISTE]**

E não há provedor para reaproveitar: a mensalidade é cobrada com **chave Pix
estática** digitada pelo operador (`chave_pix` em `lib/assinatura.ts`,
texto em `lib/cobranca.ts`). Não existe integração com banco/PSP, QR
dinâmico nem webhook de pagamento em `api/`. Ver a etapa 4 do plano: antes
de codar é preciso escolher o provedor.

### 4. Prazo legal de 30 dias (CDC) para conserto contado da abertura, com alertas

**[JÁ EXISTE — feito em 23/09/2026]** `lib/prazos.ts`, marca "Retorno em
garantia" na OS, selo na lista/detalhe e card no painel. Antes: **[NÃO EXISTE]**

Existe só a garantia contada da entrega (`lib/garantia.ts`). Nada conta prazo
de conserto a partir da abertura.

### 5. Alerta de aparelho abandonado (pronto e não retirado)

**[JÁ EXISTE — feito em 23/09/2026]** Marcos de 30/60/90 dias com mensagem
pronta (`lib/prazos.ts`). Antes: **[PARCIAL — faltavam os alertas escalonados e a mensagem pronta]**

Existe:
- Taxa de guarda por dia depois de `diasAbandono` (`taxaArmazenamento` em
  `lib/calc.ts`), mostrada na lista e no detalhe da OS
- Prazo de abandono no termo impresso (`lib/recibo.ts`)
- Risco do cliente com aparelho pronto há 60+ dias (`lib/clientes.ts`)
- "OS parada há muito tempo" na conferência (`lib/integridade.ts`)

Falta: avisos em 30, 60 e 90 dias, e a mensagem de WhatsApp pronta para
cada um.

### 6. Pedido de avaliação no Google após entrega

**[JÁ EXISTE — feito em 23/09/2026]** Botão "Pedir avaliação" e trava de 90
dias por cliente (`lib/avaliacao.ts`). Antes: **[PARCIAL — faltava o botão e o controle de 90 dias]**

Existe: campo `linkAvaliacao` em Configurações; o pedido entra na mensagem
de entrega e no recibo (`pedidoDeAvaliacao` em `lib/mensagens.ts` e
`lib/recibo.ts`), só com a OS entregue.

Falta: botão "Pedir avaliação" separado e o registro de que já foi pedido,
para não pedir de novo ao mesmo cliente em 90 dias.

### 7. Painel de TV da bancada com a fila de OS

**[JÁ EXISTE — feito em 23/09/2026]** Rota `/painel` (`lib/painel.ts`). Antes: **[NÃO EXISTE]**

`pages/Cozinha.tsx` (fila de preparo da pizzaria) é o modelo mais próximo:
tela cheia com atualização periódica. Não há realtime do Supabase no
projeto.

### 8. Leitura de nota fiscal por foto com IA

**[JÁ EXISTE — feito em 23/09/2026]** "Ler por foto" na Entrada de mercadoria (`lib/leitura-nota.ts`, `api/ia.js`). Antes: **[NÃO EXISTE]**

A entrada de mercadoria (`components/EntradaNota.tsx`, `lib/entrada.ts`) é
digitada item a item. Não há leitura de XML, de chave de acesso nem de foto.
Nenhuma integração com IA no projeto.

### 9. Sugestão de diagnóstico e orçamento por modelo+defeito

**[JÁ EXISTE — feito em 23/09/2026]** Painel Sugestão na OS (`lib/sugestao.ts`) e "Perguntar à IA". Antes: **[NÃO EXISTE]**

O mais próximo: histórico do mesmo aparelho (reincidência) e a detecção de
peça repetida entre orçamentos (`orcamento-repetido`). Nada sugere preço ou
diagnóstico a partir de OS anteriores.

### 10. Abrir OS por voz

**[JÁ EXISTE — feito em 23/09/2026]** "Ditar a OS" (`lib/voz-os.ts`). Antes: **[NÃO EXISTE]**

### 11. Avisos de status por WhatsApp Cloud API

**[PARCIAL — a Cloud API existe só para o robô do caixa]**

Foi feito e **tirado em 23/09/2026**, por decisão do dono: tem custo por
mensagem na Meta, e vai ser refeito do zero quando fizer sentido.

`api/whatsapp.js` usa a Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`)
para **receber** lançamentos de caixa e responder a quem digitou. Os avisos
ao cliente saem por link `wa.me` aberto à mão (`linkWhats` em
`lib/format.ts`). Mandar aviso automático para o cliente exige modelo de
mensagem aprovado pela Meta, número por loja e opt-in do cliente — não
existe nada disso.

---

## Ordem sugerida

1. Identidade visual (`docs/DESIGN.md`) — base para as telas novas
2. Rastreio estilo delivery (itens 1)
3. Prazos legais e abandono (itens 4 e 5) — só `lib/` e tela, sem banco novo
4. Avaliação (item 6)
5. Painel de TV (item 7)
6. Pix pelo link (item 3) — depende de escolher o provedor
7. IA (itens 8 a 10) pronta: liga sozinha com a chave do Gemini (plano
   grátis). WhatsApp automático (item 11) fica para depois, por ter custo
   por mensagem.

Identidade visual aplicada em todas as telas em 24/09/2026 (a ponte do
`index.css`, ver `docs/DESIGN.md`). Rastreio, lista e detalhe da OS,
Painel e as telas novas usam os tokens direto.
