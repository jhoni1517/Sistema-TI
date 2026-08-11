# Caixa, Contas a Pagar e Fiado — especificação para reimplementar

Isto não é documentação do que existe: é a lista das **decisões que custaram
caro**, escritas para quem vai construir a mesma coisa noutro lugar.

Quase toda regra aqui nasceu de um bug em produção, numa loja de bairro de
verdade, com dinheiro de verdade errado. O valor deste documento está nos
"por quê", não nos "o quê" — a estrutura de dados qualquer um inventa; o que
não se inventa é saber que **contar a gaveta contra o saldo faz o sistema
acusar falta de R$ 3.000 todo santo dia**.

Use como prompt de sistema, como checklist de revisão, ou como base de testes.

---

## Princípios que valem para os três módulos

Estes vêm antes de qualquer campo ou tela. Quebrar um deles produz bug que
não aparece — e é essa a classe que arruina a confiança no sistema.

### 1. Dinheiro primeiro, sempre

Toda gravação que mexe em **caixa E em outra coisa** (estoque, dívida,
pedido) grava o **movimento de dinheiro antes**.

Falhando no meio, sobra lançamento de dinheiro sem a contrapartida — que
salta aos olhos na conferência e se conserta olhando o estoque. Ao
contrário, some a venda, ou aparece mercadoria que ninguém pagou, e **lucro
inflado é invisível: ninguém procura por ele.**

A ordem natural de escrever código é "faz a coisa e depois anota", que é a
errada. Por isso esta regra precisa de teste que leia o código-fonte — foi
quebrada cinco vezes no sistema original mesmo estando escrita.

### 2. Erro engolido é a pior classe de bug

Erro que aparece na tela custa cinco minutos. Erro engolido custa uma semana
e a confiança do cliente. Todo `save` tem `try/catch` que mostra a mensagem
crua. Nada de `.catch(() => {})`.

### 3. Uma fonte com problema não pode zerar a tela

Carregamento é sempre tolerante a falha parcial (`Promise.allSettled`, nunca
`Promise.all`), **e a falha aparece na tela**. Sem isso não há como o usuário
diferenciar "está vazio" de "não carregou" — e as duas telas são idênticas.

**Corolário perigoso:** se a leitura é tolerante, nada que **numere** ou
**calcule total** pode confiar numa lista que pode ter vindo incompleta.
Quem numera pergunta antes se todas as fontes carregaram, e **recusa**
dizendo que nada foi perdido.

### 4. Data é string `AAAA-MM-DD` e a conta é em UTC

Somar hora local desloca o dia inteiro conforme o fuso. Os casos que sempre
quebram, todos com teste obrigatório:

- Dia 31 + 1 mês → 28 em fevereiro, e **volta para 31** em março
- 29/02 anual → 28/02 nos anos comuns, nunca vaza para março
- Virada de ano

**Formato certo não é data válida.** `2026-13-01` e `2026-02-30` passam por
qualquer regex de `AAAA-MM-DD` e não existem; `new Date()` aceita as duas
caladinho e escorrega para outro mês. A verificação é a **ida e volta**: se
`new Date(iso).toISOString().slice(0,10) !== iso`, a data foi "consertada"
pelo JavaScript e não era para consertar.

### 5. Alarme que dispara sempre é alarme que ninguém lê

Vale para diferença de caixa, aviso de vencimento e cobrança de fiado. Uma
diferença que aparece todo dia treina a pessoa a ignorá-la — e aí a
conferência deixa de existir justamente para o dia em que falta dinheiro de
verdade. **Preferir não avisar a avisar errado.**

### 6. Arredondar em centavos, e matar o `-0`

```
centavos(v) = Math.round(v * 100) / 100 + 0
```

O `+ 0` no fim existe porque `-0` imprime como `- R$ 0,00` e faz a pessoa
procurar um erro que não existe. E rejeite não-finito: `Number(v) || 0` cobre
NaN, texto e nulo, mas `Infinity` é verdadeiro e passa inteiro — contaminando
todo o resto, porque toda conta de dinheiro passa por essa função.

### 7. Toda regra de dinheiro mora numa camada pura e testável

Nunca dentro de um componente de tela. É o que permite mexer na interface sem
medo, e é o que torna possível testar as regras deste documento.

---

# MÓDULO 1 — CAIXA

Registro de tudo que entra e sai, organizado em **sessões** (abrir caixa /
fechar caixa), com conferência contra o dinheiro contado na gaveta.

## Modelo de dados

### Movimento

| campo | tipo | observação |
|---|---|---|
| `id` | texto | |
| `tipo` | `entrada` \| `saida` \| `sangria` | |
| `categoria` | texto | Venda, Serviço, Compra de peça, Aluguel, Salário… |
| `descricao` | texto | |
| `valor` | número | sempre positivo; o sinal vem do `tipo` |
| `formaPagamento` | texto | dinheiro, pix, débito, crédito, transferência, vale… |
| `data` | ISO completo | **veja "a data do lançamento" abaixo** |
| `sessaoId` | texto? | a qual fechamento pertence |
| `compraEstoque` | booleano? | reposição, não despesa do mês |
| `custoRelacionado` | número? | CMV embutido nesta entrada |
| `clienteId` | texto? | só em entradas |

### Sessão de caixa

| campo | tipo | observação |
|---|---|---|
| `id` | texto | |
| `abertoEm` | ISO | |
| `fechadoEm` | ISO? | vazio = sessão aberta |
| `valorAbertura` | número | troco inicial |
| `valorContado` | número? | **`undefined` ≠ zero.** Veja abaixo |
| `observacoes` | texto? | |

## As três regras que definem este módulo

### 1.1 — A gaveta se confere contra o PAPEL, nunca contra o saldo

**Esta é a regra mais importante do documento inteiro.**

O saldo soma cartão e Pix, que nunca passaram pela gaveta. Um fechamento que
pede "o saldo contado" numa loja que vendeu R$ 3.000 na maquininha e tem
R$ 200 em papel acusa **"falta R$ 3.000" todo santo dia**.

São dois números diferentes e os dois precisam existir:

```
saldo      = abertura + entradas − saídas − sangrias
emEspecie  = abertura + entradasEmDinheiro − saídasEmDinheiro − sangrias
diferenca  = contado − emEspecie          ← NUNCA contado − saldo
```

A `diferenca` vale na tela, no fechamento impresso **e** no aviso de sangria.
No sistema original o erro foi corrigido no aviso e passou batido no
fechamento, que é onde mais importa.

**Sangria fica de fora da checagem de propósito**: ela é, por definição,
papel saindo da gaveta para o cofre.

### 1.2 — Forma de pagamento vazia é DINHEIRO, nos dois lados

Lançamento antigo, gravado antes de a coluna existir, volta com forma vazia.
A regra tem que ser a mesma para entrada e para saída.

No sistema original a **saída** seguia isso e descontava da gaveta; a
**entrada** caía num balde "outro" e não entrava em `emEspecie`. Resultado: o
sistema esperava menos papel do que a gaveta tinha e o fechamento acusava
**sobra todo dia**.

Da mesma família: normalize a comparação. `"Dinheiro"` com maiúscula virava
um balde separado de `"dinheiro"` e sumia da gaveta do mesmo jeito.

```
ehEspecie(forma) = forma.trim().toLowerCase() === "" || === "dinheiro"
```

O erro seguro é para este lado: mostrar **menos** papel do que tem deixa o
aviso conservador; o contrário esconde falta de caixa.

### 1.3 — "Não conferido" não é "conferido e bateu"

`valorContado` ausente ⇒ `diferenca` é `undefined`, não zero. Zero ali é
mentira, e ela apaga a diferença entre "ninguém contou" e "contou e fechou".

Classificação com tolerância (troco de moeda gera centavo todo dia):

| estado | condição |
|---|---|
| `nao_conferido` | `diferenca === undefined` |
| `certo` | `\|diferenca\| ≤ tolerância` (0,50 é um bom padrão) |
| `sobra` | `diferenca > tolerância` |
| `falta` | `diferenca < −tolerância` |

## A data do lançamento

Todo lançamento manual nascia com "agora", sem escolha. Quem percebia no dia
10 a compra do dia 04 lançava no dia 10 — e ficavam **dois** fechamentos
errados no lugar de um.

Regras do carimbo:

1. **Hoje** guarda a **hora** de agora. É ela que ordena os movimentos do dia.
2. **Dia passado** é carimbado ao **meio-dia UTC**. Não é enfeite: o
   agrupamento por dia corta os dez primeiros caracteres, e madrugada somada a
   fuso negativo escorrega o lançamento para o dia anterior.
3. **Futuro é recusado.** Lançamento adiantado some do fechamento de hoje e
   aparece num dia que ainda não aconteceu.
4. Data que não existe no calendário cai no "agora" — nunca vira
   `2026-13-01T12:00:00Z`.

## Compra de estoque não é despesa do mês

Repor peça é troca de dinheiro por mercadoria; vira custo quando a peça é
**vendida** (CMV). Contar como despesa **e** como custo mostra lucro negativo
numa venda lucrativa.

```
totalDespesas         = todas as saídas          (o que saiu do caixa)
despesasOperacionais  = saídas − compraEstoque − pagamentoDeFatura
```

**Pagamento de fatura de cartão também fica de fora**, pelo mesmo motivo:
cada compra no crédito já virou despesa no dia em que aconteceu. Um mês com
R$ 2.000 no cartão fecharia mostrando R$ 4.000 de despesa.

Marque com um booleano `compraEstoque`, **e** aceite a categoria como
fallback para o histórico que já existe sem a marcação. Normalize a categoria
sem acento na comparação: a lista à mão com `"compra de peça"` e
`"compra de peca"` só cobre as grafias que alguém lembrou de escrever, e
`"Compra de Peças"` no plural ficava de fora.

## Comportamento de lista (não é enfeite)

- **A lista embaixo tem que acompanhar os números de cima.** Mostrar os
  números da sessão no topo e todo o histórico embaixo faz a pessoa supor que
  a lista compõe o número — e não compõe.
- **A busca amplia o escopo sozinha.** "Aquela saída de uns cinquenta de
  terça" não está na sessão de hoje. Busca que não acha o que existe é pior
  que não ter busca: a pessoa conclui que o lançamento sumiu.
- **Rótulo visível do recorte** ("Este caixa" / "Hoje" / "Todo o histórico"),
  para a tela não mentir sobre o que está mostrando.
- **Agrupar por dia com subtotal.** Lista corrida não responde a única
  pergunta que se faz olhando o caixa: "quanto entrou ontem?".
- **Busca sem acento** dos dois lados. O próprio sistema oferece categorias
  como "Salário" e "Serviço"; ninguém acentua com a fila andando.
- **Índice por sessão montado uma vez.** Filtrar a lista inteira dentro do
  laço do histórico é O(n×m) — um ano de fechamentos e dez mil lançamentos dão
  milhões de comparações a cada renderização.

---

# MÓDULO 2 — CONTAS A PAGAR E CONTAS FIXAS

Não são dois módulos: é **um cadastro com recorrência**. Conta fixa é conta a
pagar que se repete. Separar em duas telas duplica a regra de vencimento, que
é a parte difícil.

## Modelo

| campo | tipo | observação |
|---|---|---|
| `id` | texto | |
| `descricao` | texto | |
| `valor` | número | |
| `vencimento` | `AAAA-MM-DD` | **anda sozinho a cada pagamento** |
| `recorrencia` | enum | veja abaixo |
| `lembreteDias` | número? | quantos dias antes avisar (padrão 3) |
| `ativo` | booleano | desligada ≠ apagada |
| `categoria` | texto? | |
| `pagamentos[]` | lista | `{data, valor, formaPagamento, referencia}` |

### Recorrências

| chave | rótulo | meses | dias |
|---|---|---|---|
| `unica` | Uma vez só | 0 | 0 |
| `semanal` | Toda semana | 0 | 7 |
| `mensal` | Todo mês | 1 | 0 |
| `bimestral` | A cada 2 meses | 2 | 0 |
| `trimestral` | A cada 3 meses | 3 | 0 |
| `semestral` | A cada 6 meses | 6 | 0 |
| `anual` | Todo ano | 12 | 0 |

**Não esqueça o semestral.** IPTU, alvará e seguro são de seis em seis meses.
Sem essa opção a conta vira trimestral (cobra o dobro de vezes) ou anual
(some por meio ano). Faltava no sistema original e só apareceu num teste.

## 2.1 — O dia original é guardado separado do vencimento atual

Esta é a regra que quebra todo sistema de contas.

Conta que vence dia 31 passa por fevereiro e cai no dia 28. Se o próximo
vencimento for calculado a partir do **28**, ela fica presa no 28 para
sempre, e a conta de aluguel vai escorregando mês a mês.

```
proximoVencimento(vencimento, recorrencia, diaOriginal):
  se recorrencia tem dias  → soma os dias e devolve
  dia   = diaOriginal ou o dia do vencimento atual
  alvo  = mês do vencimento + meses da recorrência
  ultimo = último dia do mês alvo
  devolve data(ano, alvo, min(dia, ultimo))
```

O `diaOriginal` vem do **primeiro vencimento cadastrado** — na prática, da
`referencia` do primeiro pagamento registrado.

**Invariantes obrigatórias, todas testáveis:**

- devolve sempre data que **existe** no calendário
- **nunca empata nem anda para trás** — se empatar, a conta recorrente para
  de gerar vencimento e some da lista; conta que some não é cobrada, não é
  paga, e ninguém procura por ela
- doze meses depois cai no **mesmo dia**, quando o mês tem esse dia
- 29/02 anual nunca vira março

## 2.2 — Recorrente nunca "fecha", ela anda

Pagar uma conta única marca como paga. Pagar uma recorrente **registra o
pagamento e move o vencimento para o ciclo seguinte**. Ela nunca sai da lista.

```
contaQuitada(c) = c.recorrencia === "unica" && c.pagamentos.length > 0
```

## 2.3 — Situação derivada, nunca gravada

Guardar um campo `status` obriga alguém a atualizá-lo, e ninguém atualiza.

| situação | condição |
|---|---|
| `inativa` | `!ativo` |
| `paga` | `contaQuitada(c)` |
| `atrasada` | dias até vencer < 0 |
| `vence_hoje` | dias == 0 |
| `proxima` | dias ≤ `lembreteDias` (padrão 3) |
| `futura` | o resto |

## 2.4 — Custo fixo mensal normaliza a recorrência

Somar o valor cru de contas com recorrências diferentes dá um número sem
significado. Normalize para o mês:

- semanal → `valor × 52/12` (não × 4: o ano tem 52 semanas, não 48)
- com meses → `valor / meses`
- única → não entra no custo fixo

## 2.5 — Desligar não é apagar

`ativo: false` some da cobrança e **fica no histórico**. Apagar leva junto os
pagamentos já feitos, e aí o mês passado muda de valor sozinho.

---

# MÓDULO 3 — FIADO (a receber)

## Modelo

| campo | tipo | observação |
|---|---|---|
| `id` | texto | |
| `clienteId` | texto | |
| `descricao` | texto | |
| `valor` | número | valor original da dívida |
| `vencimento` | `AAAA-MM-DD`? | **opcional, e é aqui que mora o bug** |
| `pagamentos[]` | lista | pagamento parcial é a regra, não a exceção |
| `quitado` | booleano | |
| `criadoEm` | ISO | **sempre existe — é o que salva o módulo** |

```
saldoFiado(f) = max(0, valor − soma(pagamentos))
```

O `max(0, …)` evita saldo negativo quando alguém paga a mais — o excesso é
outra conversa, não um saldo negativo.

## 3.1 — A dívida SEM vencimento é a maioria, e ela sumia

O caminho mais usado para fiar alguém é entregar o serviço no fiado, e esse
caminho **nunca preenche vencimento**. O campo é opcional, e com fila
esperando ninguém preenche campo opcional.

No sistema original, tudo que cobrava olhava `vencimento`. Consequência: a
dívida entrava no "Total a receber" e **ficava lá para sempre** — nunca
aparecia como atrasada, nunca entrava no aviso semanal. Ninguém procura por
dinheiro que nunca chegou.

**O conserto NÃO é inventar um vencimento.** Prazo é combinado entre a loja e
o cliente; um sistema que inventa "30 dias" passa a cobrar em nome da loja um
acordo que não existiu.

O que dá para afirmar é outra coisa, e basta: **esta dívida está em aberto há
tanto tempo.** A data de criação sempre existe.

## 3.2 — Quatro situações, e "parado" não é "vencido"

| situação | condição |
|---|---|
| `quitado` | `quitado` ou saldo ≤ 0 |
| `vencido` | tem vencimento e ele passou |
| `parado` | **sem** vencimento, aberto há ≥ N dias (30 é bom padrão) |
| `em_dia` | o resto |

**Cor e texto diferentes para vencido e parado.** Um quebrou um prazo
combinado; o outro só está parado. Tratar os dois igual faz a loja cobrar com
a mesma dureza quem nunca prometeu data nenhuma.

Trinta dias é um mês de balcão: quem ia pagar "na semana que vem" já passou
de quatro semanas. Curto demais transforma o aviso em ruído semanal.

## 3.3 — Quitado manda sobre a data

Mesmo com o vencimento vencido, quitado é quitado. Ninguém cobra quem pagou,
e mandar essa mensagem custa o cliente.

## 3.4 — Ordenar por tempo, não por valor

Quem deve há oito meses é quem some, e dívida velha é dívida que vira
prejuízo. O valor aparece do lado, para quem quiser escolher por ele.

---

# Testes obrigatórios

Se você implementar isto noutro projeto, estes são os testes que provam que
as regras acima estão de pé. Sem eles, elas se perdem na primeira refatoração.

## Caixa

- [ ] Loja com R$ 3.000 no cartão e R$ 200 em papel, contando R$ 200: a
      diferença é **zero**, não −3.000
- [ ] Entrada com forma vazia entra em `emEspecie`
- [ ] Saída com forma vazia sai de `emEspecie`
- [ ] `"Dinheiro"` e `"dinheiro"` caem no mesmo balde
- [ ] Estorno em cartão **não** mexe em `emEspecie`
- [ ] Sangria não conta como diferença
- [ ] Sem contagem, `diferenca` é `undefined` (não zero)
- [ ] Compra de peça não entra em `despesasOperacionais`
- [ ] Pagamento de fatura não entra em `despesasOperacionais`
- [ ] `"Compra de Peças"` (plural, com acento) é reconhecida como estoque
- [ ] Lançamento retroativo cai no dia escolhido, não em hoje
- [ ] Lançamento retroativo é carimbado ao meio-dia, não à meia-noite
- [ ] Data no futuro é recusada
- [ ] `2026-13-01` e `2026-02-30` não viram carimbo

## Contas

- [ ] Dia 31 + 1 mês → 28/02, e o seguinte volta para 31/03
- [ ] 29/02 anual → 28/02 em ano comum, nunca março
- [ ] Virada de ano
- [ ] Avançar nunca empata nem retrocede — **para toda recorrência**
- [ ] Doze meses depois cai no mesmo dia
- [ ] Recorrente paga não sai da lista
- [ ] Única paga sai
- [ ] Custo fixo mensal: semanal usa 52/12
- [ ] Conta inativa não aparece na cobrança e continua no histórico

## Fiado

- [ ] Dívida sem vencimento, aberta há 30 dias, é `parado` e cobrável
- [ ] Dívida sem vencimento, aberta há 29 dias, **não** é cobrável
- [ ] Dívida vencida é `vencido`, com rótulo diferente de `parado`
- [ ] Quitado nunca é cobrável, mesmo vencido
- [ ] Pagamento parcial reduz o saldo e mantém em aberto
- [ ] Pagamento a mais não gera saldo negativo
- [ ] A lista de cobrança sai da mais antiga para a mais nova

## Teste por propriedade (vale muito a pena aqui)

Um gerador com **semente fixa** achando o caso que ninguém escreveu:

- `centavos` é idempotente, nunca devolve `-0`, nunca devolve não-finito
- ordem dos lançamentos não muda o total
- troco e falta nunca são ambos > 0
- avançar vencimento sempre gera data que existe, para milhares de datas
- somar N dias e tirar N dias devolve o mesmo dia

Semente **fixa**, não aleatória de verdade: teste que reprova hoje e passa
amanhã treina a pessoa a rodar de novo até passar, o que é pior que não ter
teste.

---

# Anti-padrões — o que NÃO fazer

| tentação | por que dói |
|---|---|
| `Math.max(0, saldo)` para não mostrar negativo | O zero parece proteção e é o contrário: esconde exatamente o que precisa ser achado |
| Conferir a gaveta contra o saldo | Acusa falta do valor do cartão, todo dia |
| `diferenca = 0` quando ninguém contou | Apaga a diferença entre "não conferido" e "bateu" |
| Guardar `status` da conta no banco | Ninguém atualiza; a situação é derivada |
| Inventar vencimento para fiado sem prazo | O sistema passa a cobrar um acordo que não existiu |
| Recalcular o vencimento a partir do último | A conta do dia 31 fica presa no 28 para sempre |
| Somar valores de recorrências diferentes | Número sem significado no custo fixo |
| Compra de estoque como despesa do mês | Custo contado duas vezes; lucro negativo em venda lucrativa |
| Pagamento de fatura como despesa | Dobra a despesa do mês |
| Gravar o estoque antes do movimento | Sobra mercadoria que ninguém pagou, e isso é invisível |
| `.catch(() => {})` | A janela fecha como se tivesse dado certo |
| `Promise.all` na carga | Uma tabela com problema zera a tela inteira |
| Numerar sobre lista que pode ter falhado | Número repetido; no rastreio público, o cliente vê o serviço de outra pessoa |
| Emoji em mensagem que sai do sistema | Em alguns aparelhos chega como `?` e suja o recado |
| Lista que não acompanha os números do topo | A pessoa supõe que uma compõe o outro |
| Busca com acento cru | "salario" não acha "Salário", e ninguém acentua com fila |

---

# Se for construir do zero, nesta ordem

1. `centavos` e as funções de data, com teste. **Nada mais antes disto.**
2. Movimento de caixa + sessão, com `emEspecie` separado do saldo desde o
   primeiro dia. Enfiar isso depois obriga a reescrever tudo que soma.
3. Conferência de fechamento.
4. Contas com recorrência — a regra do `diaOriginal` desde o começo.
5. Fiado, com as quatro situações desde o começo. Nascer só com `vencido` e
   acrescentar `parado` depois é retrabalho e um período cobrando errado.

O item 1 parece o menos urgente e é o único que não dá para consertar depois
sem mexer em tudo.
