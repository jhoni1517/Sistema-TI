# Identidade visual — Balcão

Toda tela nova segue este documento. Tela antiga passa a seguir quando for
mexida (ordem em `docs/ROADMAP.md`).

## Conceito: bancada de técnico, balcão de loja brasileira

O sistema mora do lado da caneta, da bobina térmica e do carimbo. As
referências são objetos que o cliente já conhece e em que confia:

- **Papel de OS** — a via amarelada, o número no canto, o campo de assinatura.
  Base quente, linha fina separando campos, nada flutuando.
- **Etiqueta térmica** — letra monoespaçada, código, valor. É onde aparece
  IMEI, número de OS e preço.
- **Carimbo "PRONTO"** — a única coisa que grita. Cor cheia, maiúscula,
  levemente torto. Status é carimbo, não crachá pastel.

A pergunta para qualquer decisão visual: *isso existiria num balcão de verdade?*
Gradiente roxo não existe em balcão. Papel, fita crepe e carimbo existem.

## Proibido

| Não faça | Por quê |
|---|---|
| Gradiente roxo/azul | É a cara de "template de SaaS"; nada na loja tem essa cor |
| Indigo (ou violeta) como cor principal | Mesmo motivo. Indigo só sobra em código legado |
| Glassmorphism (`backdrop-blur` + fundo translúcido) | Some no sol do balcão e no celular barato |
| Emoji como ícone | Chega como `?` em aparelho velho. Ícone é `lucide-react` |
| `rounded-2xl` + `shadow-lg` em todo card | Card flutuando não é papel. Papel encosta na mesa |
| Copy genérica ("Eleve seu negócio", "Solução completa") | Ninguém fala assim no balcão |

## Cores

A paleta tem três camadas: **base neutra quente**, **uma cor de marca** e
**cores de status**. Não existe quarta camada — cor nova é pergunta, não
decisão de quem está escrevendo a tela.

### Base neutra quente

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `papel` | `#F4EFE4` | `#171411` | Fundo da página |
| `cartao` | `#FFFDF8` | `#211D18` | Superfície (card, modal, via da OS) |
| `concreto` | `#E6E0D3` | `#2C2721` | Superfície secundária, faixa, cabeçalho de tabela |
| `linha` | `#D6CFBF` | `#3A342C` | Borda e divisória (1px, sempre) |
| `tinta` | `#1C1914` | `#EDE6D8` | Texto principal — 15,3:1 no papel |
| `tinta-suave` | `#5E574B` | `#A69C8A` | Texto secundário — 6,2:1 no papel, 6,8:1 no escuro |

### Cor de marca — duas opções

| | Opção A: **laranja-sinal** (adotada) | Opção B: amarelo-etiqueta |
|---|---|---|
| Hex (claro) | `#BF3F0B` | `#FFC21A` |
| Hex (escuro) | `#F08A4B` | `#FFC21A` |
| Texto por cima | branco — **5,34:1** (AA) | tinta `#1C1914` — **10,83:1** (AAA) |
| Como texto no papel | **4,66:1** (AA) | 1,41:1 — **reprovado** |
| Como texto no escuro | `#F08A4B` — 7,38:1 | 11,34:1 |
| Lembra | cone de obra, placa de atenção, fita de "frágil" | etiqueta de preço, post-it, fita de lacre |

**Adotada: A.** O amarelo só funciona como fundo — não serve para link, nem
para número em destaque sobre o papel, e obrigaria uma segunda cor para
esses casos. O laranja serve para os dois papéis com uma cor só.

O amarelo-etiqueta continua útil como **realce pontual** (marca-texto em
valor, fita de "novo") com texto em `tinta` por cima — nunca como texto.

Tokens: `sinal` (a cor) e `sinal-tinta` (o texto por cima dela).

Onde vai a cor de marca: botão principal, link, foco, o número que a pessoa
veio ver. **Um elemento de marca por área da tela.** Se tudo é laranja, nada
é.

> A escolha de cor de destaque em Configurações (`lib/themes.ts`) continua
> existindo para as telas antigas. Quando elas migrarem, o seletor sai ou
> fica restrito às cores que passam neste documento — o preset "Violeta"
> contraria a regra acima.

### Status da OS — a paleta nasce daqui

Cada status é um **carimbo**: fundo cheio com texto branco. Todos passam AA
(4,5:1) com branco, e também como texto sobre o papel claro — mas não sobre
o fundo escuro, então **status é sempre fundo cheio**, nunca letra colorida.

| Status | Token | Hex | Branco por cima | Por que essa cor |
|---|---|---|---|---|
| Aberta / recebido | `status-aberta` | `#5E574B` | 7,1:1 | Neutro: ainda ninguém olhou |
| Em análise | `status-analise` | `#3E5C76` | 7,0:1 | Azul-ardósia: trabalho de cabeça, sem pressa |
| Aguardando aprovação | `status-aprovacao` | `#8F5F00` | 5,5:1 | Mostarda: a bola está com o **cliente** |
| Aprovada | `status-aprovada` | `#2B6E62` | 6,0:1 | Verde-petróleo: sinal verde, mas ainda não é o fim |
| Em reparo | `status-reparo` | `#1F4FA3` | 7,8:1 | Azul-caneta: mão na massa |
| Aguardando peça | `status-peca` | `#9C3A0A` | 7,0:1 | Ferrugem: parado por fora da loja |
| Pronta | `status-pronta` | `#1B7A36` | 5,4:1 | Verde-carimbo: o "PRONTO" |
| Entregue | `status-entregue` | `#4B5B45` | 7,3:1 | Verde apagado: terminou, sai de cena |
| Cancelada | `status-cancelada` | `#B42318` | 6,6:1 | Vermelho-carimbo |

"Aguardando peça" e "sinal" são parentes de propósito (os dois são
"atenção"), mas não se confundem: a ferrugem é mais escura e sempre vem com
o texto do status.

Nunca status só por cor: o carimbo sempre leva a palavra. Daltônico lê o
texto.

## Tipografia

| Papel | Fonte | Token Tailwind | Onde |
|---|---|---|---|
| Texto e títulos | **Bricolage Grotesque** (Google Fonts, OFL) | `font-grotesca` | Tudo que não é código |
| Códigos e valores | **IBM Plex Mono** (Google Fonts, OFL) | `font-codigo` | IMEI, nº de OS, valores em R$, código de barras, chave Pix |

Por que Bricolage: grotesca com tinta presa nos cantos, cara de impresso de
gráfica de bairro, e legível em corpo pequeno (tem eixo óptico). Inter é a
fonte de todo painel de SaaS — exatamente o que este sistema não é.

Por que Plex Mono: é a letra da etiqueta térmica, e zero cortado não se
confunde com O num IMEI.

**A monoespaçada é SÓ para código e valor.** Parágrafo em mono vira tela de
terminal.

**Valor sempre com `tabular-nums`.** Coluna de preço com algarismo
proporcional dança: R$ 111,11 fica mais estreito que R$ 888,88 e a vírgula
não alinha. A classe `.valor` já aplica mono + tabular.

Escala (celular primeiro):

| Uso | Tamanho | Peso |
|---|---|---|
| Carimbo de status | 1.5rem–2rem, maiúsculas, `tracking-wide` | 800 |
| Título de tela | 1.25rem | 700 |
| Texto | 0.9375rem (15px) | 400 |
| Rótulo de campo | 0.75rem, maiúsculas, `tracking-wider` | 600 |
| Valor em destaque | 1.75rem, `font-codigo` | 600 |

## Forma

- **Raio**: `rounded-md` (6px) em card e botão; `rounded` (4px) em etiqueta
  e carimbo. Papel não tem canto de pílula.
- **Sombra**: nenhuma no card comum — borda `linha` de 1px. Sombra só em
  camada que de fato flutua (modal, menu aberto).
- **Linha tracejada** (`border-dashed`) separa "via do cliente" de "via da
  loja", e o total do resto. É o picote do papel.
- **Carimbo**: `.carimbo` — fundo cheio na cor do status, texto branco,
  contorno duplo na mesma cor (`outline-status-*`), maiúsculas, rotação de
  -2°. Nunca letra na cor do status sobre o papel: no modo escuro ela não
  passa contraste. Só para o estado final que importa (PRONTO, ENTREGUE,
  CANCELADO). Rodar texto em todo lugar vira bagunça.

## Tom de voz: voz de balcão

Escreva como quem atende no balcão fala com o cliente: curto, direto, na
segunda pessoa, sem jargão de sistema. O cliente não "visualiza o status da
ordem"; ele quer saber se tá pronto.

Regras:
1. **Diga o que a pessoa faz agora.** "Pode buscar" em vez de "Disponível
   para retirada".
2. **Verbo antes de substantivo.** "Aprovar orçamento", não "Aprovação".
3. **Sem "por favor" em botão.** Botão é ordem curta.
4. **Erro diz o que houve e a saída** (regra antiga, `CLAUDE.md`).
5. **Nada de "Olá! Seja bem-vindo(a)"**, "solução", "experiência",
   "eleve", "potencialize".
6. **Informal, não errado.** "Tá pronto" na tela do cliente sim; "tá" em
   documento impresso que vai para o Procon, não.
7. **Sem emoji em mensagem que sai do sistema** (regra antiga).

### 15 textos atuais e a versão de balcão

| # | Onde | Hoje | Voz de balcão |
|---|---|---|---|
| 1 | Rastreio, título | Acompanhe seu aparelho | Seu aparelho na bancada |
| 2 | Rastreio, subtítulo | Consulte pelo código da ordem de serviço | Tudo o que rolou com ele, sem precisar ligar |
| 3 | Rastreio, status pronta | Pronta para retirada | Tá pronto, pode buscar |
| 4 | Rastreio, texto pronta | Pode vir buscar dentro do nosso horário de atendimento. | Pode vir buscar no nosso horário. |
| 5 | Rastreio, aguardando aprovação | Podemos executar o serviço? | Pode fazer o conserto? |
| 6 | Rastreio, botões | Aprovar / Não quero | Pode fazer / Não, obrigado |
| 7 | Rastreio, confirmação | Confirma que NÃO deseja realizar o serviço? | Certeza que não quer o conserto? O aparelho fica esperando você buscar. |
| 8 | Rastreio, erro | Não foi possível consultar agora. Tente novamente em instantes. | Não deu para abrir agora. Tenta de novo daqui a pouco. |
| 9 | Rastreio, sem OS | Não encontramos esta ordem de serviço. | Não achamos essa OS. Pede o link de novo pra loja. |
| 10 | Rastreio, rodapé | Esta página mostra apenas o andamento do seu serviço | Este link é só seu. A página não mostra senha nem dado pessoal. |
| 11 | Status em reparo (cliente) | Estamos trabalhando no seu aparelho. | Tá na bancada, com o técnico. |
| 12 | Status aguardando peça (cliente) | Aguardando a chegada de uma peça para continuar. | Esperando a peça chegar. A gente avisa quando ela chegar. |
| 13 | OS, lista vazia | Nenhuma ordem de serviço / Clique em 'Nova OS' para começar. | Bancada vazia. Chegou aparelho? Toque em Nova OS. |
| 14 | Painel, card | Prontas p/ entrega | Pronto, esperando o dono |
| 15 | PDV, venda fechada | Venda registrada. | Venda feita. Próximo! |

Os de número 11 e 12 moram em `OS_STATUS_META` (`lib/types.ts`) e saem
também no WhatsApp: trocar lá muda os dois lugares de uma vez, que é o
certo.

## Tokens no código

- Variáveis CSS em `app/src/index.css` (`:root` e `:root.dark`), no formato
  `R G B` para o Tailwind aplicar opacidade (`bg-sinal/10`).
- Nomes no `app/tailwind.config.js` em `theme.extend`: `papel`, `cartao`,
  `concreto`, `linha`, `tinta`, `tinta-suave`, `sinal`, `sinal-tinta`,
  `status-*`, `font-grotesca`, `font-codigo`.
- Classes prontas: `.valor` (mono + tabular) e `.carimbo`.

Use só os tokens. `bg-slate-100`, `text-indigo-600` e hex solto em tela nova
é descuido.

**A ponte.** As telas antigas foram escritas com `bg-white` e os cinzas
`slate`. Dentro de `.ponte` (a moldura do sistema, em `Layout.tsx`), o
`index.css` faz esses neutros apontarem para os tokens — branco vira
`cartao`, `slate-50` vira `papel`, letra cinza vira `tinta`/`tinta-suave` —
e `.card`, `.btn-*`, `.input` e `.label` já nascem no papel. Assim as vinte
telas mudaram juntas sem reescrever nenhuma. A tela de entrada é escura de
propósito e fica fora da ponte. A cor de destaque escolhida pela loja
(Configurações) continua mandando no botão principal e no menu.
