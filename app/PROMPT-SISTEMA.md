# Sistema TI — especificação completa para reconstruir

Sistema de gestão alugado para lojas de bairro. Nasceu para assistência
técnica de informática e celulares; hoje atende mercearia, pizzaria e loja de
bebidas pelo mesmo código, e uma pessoa física que só quer controlar salário
e auxílio.

**Quem mantém é uma pessoa só, que também atende no balcão.** Toda decisão de
arquitetura aqui pesa mais a manutenção do que a elegância. É por isso que
não há microserviço, fila, cache distribuído nem camada de abstração
"para o futuro": cada peça a mais é uma peça que alguém precisa consertar
entre um cliente e outro.

Este documento serve para reconstruir o sistema noutra tecnologia, ou como
prompt de sistema para um agente trabalhar nele. A **Parte III** é a parte
que não se inventa: cada regra ali custou uma tarde ou uma semana, e está
escrita com o estrago que ela evita.

---

# PARTE I — O QUE O SISTEMA FAZ

## Números atuais

22 telas · 23 componentes · 56 módulos de regra · 76 arquivos de teste ·
1414 testes · 22 migrações de banco · 8 funções de servidor.

## Arquitetura

React 19 + TypeScript + Vite + Tailwind. Supabase (Postgres + Auth + RLS).
Vercel para o site estático, funções `/api` e o cron diário. PWA com service
worker.

```
src/lib/      regras de negócio puras, testáveis, sem React
src/pages/    telas
src/store/    estado global e as ações de gravação
api/          funções de servidor (JavaScript puro)
*.sql         migrações, rodadas na ordem documentada
```

**Toda conta que importa mora em `lib/`, com teste.** Dinheiro, data e
estoque nunca são calculados dentro de um componente. É o que permite mexer
na tela sem medo.

## Multi-loja e cobrança

Cada tabela tem `lojaId`. As políticas do banco (RLS) só deixam ler e gravar
linhas da própria loja, e a gravação ainda exige assinatura em dia. **A trava
é no banco, não na tela**: não adianta mexer no navegador.

Estados da loja: `ativa` → `tolerancia` (5 dias de atraso) → `leitura`.

**Loja vencida continua consultando e imprimindo tudo; só não grava.** Além
de ser o certo, segurar dado de cliente é o caminho mais curto para um
processo.

Teste grátis com prazo, motivo de não conversão, contagem de cortesias já
dadas e reabertura com prazo menor. A tolerância **não** vale durante o
teste: sete dias combinados não podem virar doze sem ninguém decidir.

## Ramos: um código, vários nichos

`lib/ramos.ts` é o único lugar onde a diferença entre nichos existe.

**A regra que segura isto de pé: módulo é TELA, recurso é CAMPO.**

Módulo custa caro — tela nova para escrever, testar e manter, que precisa
funcionar em qualquer combinação com as outras. Recurso custa quase nada —
um campo a mais numa tela que já existe.

IMEI, garantia, peso e validade parecem módulos e não são. Na dúvida: se não
tem endereço próprio no menu, é recurso.

| ramo | módulos | recursos |
|---|---|---|
| Assistência técnica | os, rastreio | imei, garantia |
| Mercearia | pdv | peso, validade |
| Pizzaria | pdv, delivery, mesas, producao | meioAMeio, observacaoItem |
| Bebidas | pdv, delivery | validade, idadeMinima |

**O ramo é o que a loja CONTRATOU, não uma preferência dela.** Mora em
`lojas.ramo`, e um gatilho no banco recusa a troca vinda da própria loja —
quando morava no JSON de configurações, quem comprou mercearia podia se
virar pizzaria sozinho e usar o que não pagou.

Módulo fora do plano mostra uma tela explicando, em vez de redirecionar
calado: quem cai lá é cliente pagante que abriu a porta errada.

O vocabulário muda com o ramo: "Ordem de Serviço" na assistência, "Pedido"
na pizzaria, "Venda" na mercearia.

## As telas

### Frente de caixa (PDV)
Venda de balcão sem abrir cadastro. Leitor de código de barras, busca sem
acento, atalhos de teclado (F2 fecha, F3 consulta preço, F4 limpa, Esc),
venda dividida em várias formas de pagamento, pizza meio a meio, produto por
peso lido da etiqueta da balança, venda em espera, devolução parcial,
consulta de preço sem mexer no carrinho, cupom impresso.

### Caixa
Sessões de abertura e fechamento com conferência contra a gaveta. Entradas,
saídas, sangrias. Lançamento com **data retroativa**. Agrupamento por dia
com subtotal, filtro por tipo e período, busca que amplia o escopo sozinha.
Fechamento impresso.

### Ordens de Serviço (assistência)
Aparelho, defeito relatado, laudo técnico, orçamento com **cenários
alternativos** (não somam entre si), aprovação do cliente, peças, status com
histórico, garantia, fotos do aparelho, senha de desbloqueio com registro de
quem consultou, comprovante impresso e **página pública de rastreio**.

### Estoque
Produtos, categorias em árvore, fornecedores, entrada de nota com custo
médio ponderado e rateio de frete, inventário (contagem cega), sugestão de
reposição pelo consumo real, cotação com fornecedores, etiquetas de
prateleira e de balança, controle de validade, giro e curva ABC.

### Clientes e A Receber (fiado)
Cadastro, histórico, aniversários, relacionamento (quem sumiu). Fiado com
pagamento parcial, **situação por tempo em aberto** mesmo sem vencimento
combinado, e lista de cobrança ordenada por urgência.

### Contas a Pagar
Contas únicas e fixas, recorrência de semanal a anual, pagamento que lança no
caixa, custo fixo mensal normalizado, metas e gastos por categoria.

### Renda fixa
Salários, auxílios do governo, aposentadoria, aluguel recebido. Quatro
números: entra por mês, já caiu, ainda vem, não caiu.

### Comandas, Cozinha e Entrega (pizzaria)
Comanda por mesa que vive uma hora e muda de mão entre garçons. Fila de
preparo. Entrega com endereço, taxa e fechamento do entregador.

### Painel, Relatórios, Agenda, Checklist
Resumo do dia respeitando o ramo, conferência de integridade, DRE
simplificado, desempenho por técnico, agenda com recorrência, rotina diária.

### Nota fiscal
Fila de emissão de NFC-e/NFS-e por intermediário, com credencial que o
navegador nunca lê, tradução de erro da SEFAZ para português de balcão, e
emissão disparada na hora da venda.

### Catálogo público
Vitrine sem login, desligada por padrão, com corte feito no banco.

---

# PARTE II — OS DIFERENCIAIS

O que este sistema faz e os concorrentes de mercado não fazem. Cada um
nasceu de um problema real de loja de bairro.

## 1. Conferência de integridade: o sistema aponta o próprio buraco

Um botão no Painel varre os dados procurando o que **não dá erro na hora** e
só aparece no fechamento do mês, quando ninguém lembra mais:

- mesa aberta de ontem (o vazamento invisível do restaurante)
- venda sem movimento de caixa correspondente
- estoque negativo sem entrada que justifique
- fiado sem cobrança há meses
- caixa aberto há dias

E soma **quanto dinheiro está em risco**. A maioria dos sistemas mostra o que
aconteceu; este mostra o que está errado.

## 2. A gaveta se confere contra o papel, nunca contra o saldo

O saldo soma cartão e Pix, que nunca passaram pela gaveta. Sistema que pede
"o saldo contado" acusa falta do valor do cartão **todo santo dia**.

Aqui existem dois números separados desde o primeiro dia: `saldo` e
`emEspecie`. A diferença é sempre contra o papel.

## 3. Orçamento com cenários alternativos

"Fonte de 500W mais SSD" ou "só a fonte de 200W" é uma **escolha**, não uma
lista de compras. Sistemas que só têm lista somam tudo, e o cliente recebe um
orçamento cobrando as duas fontes.

A unidade de escolha é o orçamento inteiro, não a peça. E antes de cobrar, o
sistema pergunta se a escolha foi confirmada pelo cliente.

## 4. Fiado que cobra mesmo sem vencimento combinado

O caminho mais usado para fiar alguém nunca preenche vencimento — o campo é
opcional e com fila esperando ninguém preenche.

Este sistema não inventa um prazo (isso seria cobrar em nome da loja um
acordo que não existiu). Ele usa o que sabe: **há quanto tempo a dívida está
aberta**. Passado o limite, vira "parado" — palavra e cor diferentes de
"vencido", porque um quebrou prazo e o outro não prometeu nada.

## 5. Robô diário que fala pelo Telegram e WhatsApp

Cobrança de fiado, contas a vencer, aniversários de clientes, mensalidade da
própria loja, rotina do dia. Sai de graça, sem app extra.

## 6. Página pública de rastreio

O cliente acompanha o conserto por link, sem login, sem ligar para a loja.
Com token, não pelo número da OS — o corte é feito no banco.

## 7. Etiqueta de balança lida no PDV

O peso vem por divisão do preço impresso, e o sistema **não recalcula**: o
total tem que bater com a etiqueta colada no pacote.

## 8. Entrada de nota com custo médio ponderado

Sobraram 10 peças a R$ 20 e chegaram 10 a R$ 30: o custo passa a R$ 25, não
R$ 30. Frete e desconto entram rateados pelo valor. A maioria dos sistemas
pequenos simplesmente sobrescreve o custo — e a margem do relatório vira
ficção.

## 9. Funciona offline e sincroniza depois

PWA com fila de gravação. O balcão não para quando a internet cai.

## 10. Multi-ramo de verdade

O mesmo código atende quatro nichos sem virar um monstro configurável,
porque a diferença mora num arquivo só e a régua "módulo é tela, recurso é
campo" impede a explosão combinatória.

## 11. Testes que leem o código-fonte

Quinze testes não testam funções: **varrem os arquivos do disco** procurando
a regra quebrada. É a resposta para a descoberta de que regra escrita em
documento não segura nada. Ver Parte IV.

---

# PARTE III — AS REGRAS QUE VIERAM DE BUG

Cada uma custou pelo menos uma tarde. Não são preferências. Estão em ordem de
quanto dinheiro elas evitam perder.

## O princípio que organiza tudo

> **Erro que salta aos olhos custa cinco minutos. Erro invisível custa o mês.**

Sempre que houver escolha entre duas formas de falhar, escolha a que deixa
rastro. Lucro inflado é invisível: ninguém procura por dinheiro a mais.

---

## Dinheiro

### Dinheiro primeiro, sempre

Toda gravação que mexe em caixa **e** em outra coisa grava o movimento de
dinheiro **antes**.

Falhando no meio, sobra lançamento de dinheiro sem a contrapartida — que
salta aos olhos na conferência e se conserta olhando o estoque. Ao
contrário, some a venda ou aparece mercadoria que ninguém pagou.

**Foi quebrada cinco vezes** mesmo estando escrita, porque a ordem natural de
escrever código é "faz a coisa e depois anota", que é a errada. Virou teste
que lê o código-fonte.

### A gaveta se confere contra o papel

Já explicado na Parte II. O detalhe que quase passou: o erro foi corrigido no
aviso de sangria e **passou batido no fechamento**, que é onde mais importa.
Ao consertar uma conta de dinheiro, procure todos os lugares que a usam.

### Forma de pagamento vazia é dinheiro, nos dois lados

Lançamento antigo volta do banco sem a coluna. A **saída** seguia a regra e a
**entrada** não: o sistema esperava menos papel do que a gaveta tinha e
acusava sobra todo dia.

Da mesma família: normalize antes de comparar. `"Dinheiro"` com maiúscula
virava um balde separado de `"dinheiro"`.

### Compra de estoque não é despesa do mês

Repor peça é troca de dinheiro por mercadoria; vira custo quando a peça é
vendida. Contar como despesa **e** como custo mostrava lucro negativo numa
venda lucrativa.

**Pagamento de fatura de cartão também fica de fora**: cada compra no crédito
já virou despesa no dia. Um mês com R$ 2.000 no cartão fecharia com R$ 4.000
de despesa.

A lista de categorias que contam como estoque é comparada **sem acento**: a
lista à mão com "compra de peça" e "compra de peca" só cobria as grafias que
alguém lembrou, e "Compra de Peças" no plural ficava de fora.

### Salário não é custo fixo

Receita fixa e despesa fixa moram na mesma tabela, separadas por um campo. Se
o filtro faltar, um salário de R$ 3.000 vira R$ 3.000 de custo e o número de
"quanto preciso faturar" mostra o dobro.

**Campo ausente significa "pagar"**, nunca "receber": toda linha gravada
antes do campo existir voltaria como receita da noite para o dia.

### `centavos` é a base de tudo, e ela rejeita o infinito

```
centavos(v) = Number.isFinite(n) ? Math.round(n * 100) / 100 + 0 : 0
```

O `+ 0` mata o `-0`, que imprime como `- R$ 0,00` e faz procurar um erro que
não existe. O `isFinite` foi achado por teste de propriedade: `Number(v) || 0`
cobre NaN e texto, mas `Infinity` é verdadeiro e passava inteiro —
contaminando tudo, porque toda conta de dinheiro passa por ali.

### Estoque negativo é informação, não erro

Quatro telas desciam estoque com `Math.max(0, ...)`. O zero parece proteção e
é o contrário: vender 3 de um item que o sistema acha que tem 1 deixava o
saldo em 0 em vez de -2, e as duas unidades que saíram sumiam do mapa.

Nada para procurar, nada para a contagem achar — e o detector de estoque
negativo nunca disparava numa venda, que é justamente onde o problema nasce.

### Estoque que sobe no cadastro não encosta no caixa

Editar a quantidade no cadastro do produto é o gesto mais natural do mundo
depois de comprar uma peça, e ele **não tira dinheiro do caixa**. Não é bug
do salvamento — é o cadastro fazendo o que faz, e é o certo para corrigir
contagem. O bug é fazer isso **calado**.

As duas intenções são opostas e só quem digitou sabe qual era. Então
pergunte, e ofereça o caminho certo (entrada de nota, que tem caixa, custo
médio e frete).

### Orçamentos alternativos nunca somam

Peça com `opcao` vazia entra em qualquer cenário; peça com `opcao` preenchida
pertence àquele orçamento. Sem decisão do cliente, vale o primeiro — total
zerado seria menor que qualquer cenário real.

A mesma conta existe em SQL, porque a página pública calcula sozinha. Duas
regras diferentes mostrariam dois valores para o mesmo orçamento.

### Regra de preço é uma só, e vive em dois lugares

`precoEfetivo` (promoção com prazo) manda no PDV, na etiqueta da balança, na
etiqueta de prateleira e no catálogo. Tela que lê `produto.preco` direto faz
a gôndola dizer um valor e o caixa cobrar outro — e quem aparece como
mentiroso é a loja.

Foi quebrada na entrada manual do Caixa. Virou teste que varre as telas
procurando conta feita com preço cru.

---

## Data

### Data é string `AAAA-MM-DD` e a conta é em UTC

Somar hora local desloca o dia inteiro conforme o fuso. Os três casos que
sempre quebram, todos com teste obrigatório:

- Dia 31 + 1 mês → 28 em fevereiro, e **volta para 31** em março
- 29/02 anual → 28/02 nos anos comuns, nunca vaza para março
- Virada de ano

### O dia original é guardado separado do vencimento atual

É a regra que quebra todo sistema de contas. Se o próximo vencimento for
calculado a partir do 28 de fevereiro, a conta fica presa no 28 para sempre.

Invariantes obrigatórias: sempre gera data que existe; **nunca empata nem
anda para trás** (conta que para de gerar vencimento some da lista, e conta
que some não é cobrada nem paga).

### Formato certo não é data válida

`2026-13-01` e `2026-02-30` passam por qualquer regex de `AAAA-MM-DD` e não
existem. `new Date()` aceita as duas caladinho e escorrega para outro mês.

A verificação é a **ida e volta**: se `new Date(iso).toISOString().slice(0,10)
!== iso`, a data foi "consertada" e não era para consertar.

Este bug apareceu na primeira função que escrevi **depois** de aprender a
lição, num teste escrito no mesmo dia.

### Lançamento retroativo é carimbado ao meio-dia

O agrupamento por dia corta os dez primeiros caracteres. Madrugada somada a
fuso negativo escorrega o lançamento para o dia anterior.

E sem campo de data, quem percebe no dia 10 a compra do dia 04 estraga
**dois** fechamentos no lugar de um.

---

## Dados e carregamento

### Uma tabela com problema não pode zerar a tela

`Promise.all` rejeita no primeiro erro e descarta os outros resultados. Uma
migração não rodada apagava clientes, estoque, caixa e o nome da loja da tela
ao mesmo tempo — e o `catch` só escrevia no console. **A tela ficava idêntica
à de um sistema que perdeu os dados.**

Leitura é sempre `allSettled`, e falha de carga **aparece na tela**. Sem isso
não há como diferenciar "está vazio" de "não carregou".

### Numerar em cima de lista que não carregou repete número

A leitura é tolerante a falha parcial de propósito. Mas `max(numero) + 1`
sobre uma lista vazia POR ERRO devolve 1, colidindo com o primeiro registro
da história da loja.

Na venda, o cupom sai com número repetido. Na OS é pior: o rastreio público
procura pelo número, e **o cliente abre o link e vê o conserto de outra
pessoa**, com nome e valor.

Quem numera pergunta antes quais fontes falharam e RECUSA, dizendo que nada
foi perdido — senão a pessoa refaz a venda inteira achando que sumiu.

### Campo novo no TypeScript exige coluna nova no banco

O erro `Could not find the 'x' column of 'y' in the schema cache` derrubava
**toda** a gravação daquela tabela. Uma venda baixava o estoque e não entrava
no caixa, em silêncio.

Acrescente a coluna no mesmo commit. Um teste lê os tipos e o SQL e falha
dizendo qual coluna falta.

### O que o banco preenche precisa voltar para a tela

Valor com default no banco, gatilho que preenche campo: se a tela não relê o
que foi gravado, ela mostra o que mandou, não o que ficou.

### Lista do que sobe para a nuvem envelhece; lista do que fica, não

Gravar na nuvem uma lista de campos escrita à mão deixou **oito**
configurações de fora sem ninguém perceber. Salvavam no aparelho, a tela
dizia "salvo", e na máquina seguinte estava tudo em branco.

Sobe TUDO menos o que está numa lista de exceções curta. Esquecer uma exceção
deixa um campo a mais na nuvem; esquecer na lista antiga perdia o campo.
**Entre dois erros, escolha o que dói menos.**

O mesmo vale para a lista de migrações do documento de instalação: quatro
ficaram de fora, e quem monta uma loja nova seguia a lista até o fim achando
que tinha terminado.

### Formulário que não acompanha a nuvem apaga tudo

O pior bug desta base, e o único que apagou dado de verdade.

`useState(config)` só vale na primeira renderização. A configuração chega da
nuvem um instante depois e a tela continua mostrando o padrão. Clicar em
Salvar subia esse formulário em branco por cima do que estava gravado,
**apagando para todos os aparelhos de uma vez**.

Duas travas, e as duas são necessárias:

1. O formulário acompanha a nuvem **enquanto ninguém mexeu num campo**.
   Depois que mexeu, para — recarregar por cima de quem está digitando é o
   outro jeito de perder o que a pessoa escreveu.
2. Salvar **recusa** antes de a leitura da nuvem terminar, e diz por quê.
   Falha de leitura não libera: o que está na tela pode ser o padrão.

---

## Gravação e erro

### Gravação sem tratamento de erro é a pior classe de bug

Erro que aparece na tela custa cinco minutos. Erro engolido custa uma semana
e a confiança do cliente. Todo `save` tem `try/catch` que mostra a mensagem
crua. Nada de `.catch(() => {})`.

A regra já estava escrita e mesmo assim cinco telas gravavam sem tratamento.
A janela fechava como se tivesse dado certo.

### Clique duplo no balcão acontece o tempo todo

E vira dinheiro lançado duas vezes, conta paga em dobro, recorrente pulando
dois meses. Toda ação que grava dinheiro tem trava de reentrada.

### Mensagem de erro precisa dizer qual é a saída

"E-mail ou senha incorretos" para qualquer falha esconde os casos que a
pessoa não tem como adivinhar: e-mail sem confirmar, chave rotacionada,
projeto pausado. Cada um tem uma saída diferente, e o texto tem que dizer
qual é.

---

## Segurança

### O que a vitrine pública mostra é decidido no banco

Filtrar campo na tela não esconde nada de quem abre o painel do navegador. O
corte é feito na função SQL, que é a única porta.

Do catálogo saem nome, foto, preço e "tem ou não tem". Nunca custo, margem,
fornecedor nem quantidade exata: concorrente também abre o link.

Nasce **desligado** em toda loja. Ninguém publica preço sem escolher publicar.

### Segredo não passa por conversa

Se o valor tem "secret" no nome ou aparece escondido com bolinhas, ele vai de
um lugar para o outro e nunca por uma conversa, print ou commit. Chave que
apareceu é chave queimada: gere a nova, publique, e só então revogue a velha.

O token do emissor fiscal mora numa tabela **sem policy de select**: o
navegador não lê nem com o login do dono. Quem lê é a função de servidor.

### Página de diagnóstico é porta dos fundos

`/api/status` era aberta e mostrava os últimos lançamentos do caixa. Hoje
exige a chave.

### Imagem não mora no banco

A tabela de produtos é lida inteira em toda carga. Cem produtos com foto em
base64 viram dezenas de MB a cada F5, no 4G do balcão.

No banco fica só o endereço; o arquivo vai para o Storage, encolhido para
800px e JPEG **antes** de subir — a foto sai do celular com 4000px e 5 MB. O
caminho é `<lojaId>/pasta/arquivo.jpg` e a política do Storage só deixa
escrever na pasta da própria loja.

### Limpar o localStorage no logout apaga as credenciais

A limpeza preserva as chaves de conexão e a aparência. Sem isso o login
quebrava na máquina seguinte.

---

## Interface

### O service worker nunca serve HTML do cache primeiro

Rede primeiro para navegação; cache primeiro só para arquivo com hash no
nome. Sem isso o usuário fica preso numa versão antiga depois do deploy — o
que já segurou uma tela de login velha na frente dele.

Trocou arquivo estático sem hash? Suba a versão do cache.

### Sem emoji nas mensagens que saem do sistema

Em alguns aparelhos chegam como `?` e sujam o recado. Vale para WhatsApp,
Telegram e recibo. Emoji que fica só na tela é permitido **marcando a linha**
— a marca é a diferença entre decisão e descuido.

### Busca sem acento, dos dois lados

Quem atende digita rápido, no celular, sem acentuar: "acucar", "pao",
"agua". O cadastro tem "Açúcar", "Pão", "Água". Comparar com
`toLowerCase()` resolve a maiúscula e deixa o acento: a busca volta vazia e a
conclusão é sempre a mesma e sempre errada, "não está cadastrado".

O estrago não para na busca vazia: sem achar o produto, a peça vira item
avulso digitado na mão, a venda sai sem baixa de estoque e o saldo passa a
mentir em silêncio.

Apareceu **três vezes**. Na terceira virou teste que varre o código.

### A lista embaixo tem que acompanhar os números de cima

Mostrar os números da sessão no topo e todo o histórico embaixo faz a pessoa
supor que a lista compõe o número. E a busca **amplia o escopo sozinha**:
busca que não acha o que existe é pior que não ter busca.

### Alarme que dispara sempre é alarme que ninguém lê

Vale para diferença de caixa, aviso de vencimento e cobrança de fiado. Uma
diferença que aparece todo dia treina a pessoa a ignorá-la — e aí a
conferência deixa de existir justamente para o dia em que falta dinheiro de
verdade.

### Nome cortado é pior que nome pequeno

Ao aumentar a fonte, aumente o espaço junto. "Salário meio per…" e "Salário
da fáb…" ficam idênticos na pressa.

### Serviço não tem estoque

Existe porque o atendente digitava 99999999999 na quantidade para o item não
ficar vermelho — e o valor do estoque foi para a casa dos trilhões.

---

## Infraestrutura

### Cron mais fino que diário para o deploy inteiro

No plano gratuito da Vercel, cron só dispara uma vez por dia. Um
`*/10 * * * *` torna a configuração inválida e a plataforma **recusa a
implantação na validação** — sem build vermelho, sem aviso, sem e-mail.

Quatro pull requests ficaram mesclados sem nunca chegar ao ar. O sintoma é
idêntico a um webhook quebrado.

### Depois de mesclar, não empurre o merge de volta para a branch

A plataforma não constrói o mesmo commit duas vezes: decide pelo SHA, e a
primeira referência que chega leva o build. Sincronizar a branch logo depois
do merge faz o aviso da branch chegar primeiro, e **a produção continua na
versão anterior com o deploy verde**.

Conferir se subiu é olhar o pacote no ar, não a tela da plataforma.

### Lógica duplicada em funções de servidor precisa de teste de paridade

Função de servidor não importa TypeScript, então algumas contas existem duas
vezes. O teste **lê o arquivo do disco e extrai a função de lá** — não
recopia o código, porque cópia dentro de teste envelhece igual e os dois
passam a mentir juntos.

### O e-mail de confirmação precisa saber para onde voltar

Sem `emailRedirectTo`, o Supabase usa a "Site URL" do projeto, que nasce
valendo `localhost:3000`. O convidado recebia o e-mail e o link mandava para
o **localhost dele**.

E o código do convite não pode morar só no `localStorage`: o e-mail costuma
abrir no navegador embutido do aplicativo de e-mail, que tem outro
`localStorage`. O código viaja na URL.

---

# PARTE IV — COMO A LIÇÃO VIRA TRAVA

> **Regra escrita não segura nada.**

"Dinheiro primeiro" e "sem emoji" estavam escritas no documento do projeto e
foram quebradas assim mesmo. A conclusão:

> **Quando descobrir uma regra dessas quebrada pela terceira vez, o conserto
> não é consertar — é escrever o teste que reprova.**

## Os testes que leem o código-fonte

Quinze testes não testam funções: varrem os arquivos do disco procurando a
regra quebrada.

| teste | o que reprova |
|---|---|
| `dinheiro-primeiro` | gravação de estoque antes do movimento de caixa |
| `sem-emoji` | emoji em mensagem que sai do sistema, sem marca |
| `preco-unico` | conta feita com preço cru em vez do preço efetivo |
| `busca-sem-acento` | `toLowerCase()` sem normalizar, sem marca |
| `esquema` | campo no TypeScript sem coluna no SQL |
| `carga` | `Promise.all` na leitura |
| `salvar-com-erro` | `save` sem `try/catch` |
| `clique-duplo` | ação que grava dinheiro sem trava de reentrada |
| `modulo-tem-tela` | módulo declarado num ramo sem tela de verdade |
| `migracoes` | SQL no disco fora da lista de instalação; migração não repetível |
| `vercel` | cron mais fino que diário |
| `volta-do-banco` | tela que não relê o que o banco preencheu |
| `hoje` | conta de data fora do padrão UTC |
| `comissao-unica` | conta de comissão fora do módulo dela |
| `nota-empurrao` / `receita-fixa` / `renda` | as telas mostrando o dado uma da outra |

## A marca é a diferença entre decisão e descuido

Quando a regra tem exceção legítima, a exceção é **marcada no código com o
motivo ao lado**: `// texto-cru-proposital`, `// emoji-na-tela`,
`// preco-cru-proposital`.

Sem a marca, o teste reprova. Com a marca, alguém decidiu — e a próxima
pessoa lê por quê.

## Teste por propriedade

Todo teste escrito à mão testa o caso que quem escreveu **pensou**. O que
sobra é o que ninguém pensou.

Um gerador com **semente fixa** inventa milhares de entradas e o teste cobra
uma verdade que vale sempre. A semente é fixa porque teste aleatório de
verdade reprova hoje e passa amanhã, e a pessoa aprende a rodar de novo até
passar — pior que não ter teste.

Invariantes que valem a pena:

- `centavos` é idempotente, nunca devolve `-0` nem não-finito
- a ordem dos itens não muda o total
- troco e falta nunca são ambos maiores que zero
- baixa seguida de retorno volta ao saldo original (conservação)
- avançar vencimento sempre gera data que existe, e sempre para frente
- somar N dias e tirar N dias devolve o mesmo dia

## Provar que o teste reprova

**Teste que você não viu reprovando é teste que você não sabe se funciona.**

Ao escrever um teste de regra, quebre o código de propósito e confirme que
ele reprova. Duas vezes nesta base o teste tinha exatamente o furo que
deveria pegar:

- um comparava o arquivo cortado num marcador que sumia junto com a regra
- outro usava `findIndex`, que devolve `-1` quando a guarda é apagada — e daí
  todas as linhas passavam por "protegidas"

Os dois só apareceram porque a quebra proposital foi feita.

---

# PARTE V — COMO TRABALHAR NESTE SISTEMA

- **Português do Brasil** em tudo: código, comentário, commit, PR, tela.
- **Comentário explica o porquê**, não o quê. De preferência o porquê que
  veio de um bug real.
- Antes de qualquer entrega: rodar os testes **e** o build. O verificador de
  tipos sozinho não é o mesmo comando que o build.
- Uma mudança, um pull request, com **o problema descrito antes da solução**.
- Migração de banco é sempre repetível: `if not exists`, `create or replace`,
  `drop policy if exists` antes de criar.

## Falar com o dono do sistema

Ele atende no balcão e lê no celular.

- Seja direto e sem enfeite
- **Diga o que quebrou antes de dizer o que foi feito**
- Erro seu, assuma sem rodeio
- Link sempre clicável e completo — caminho de arquivo não abre no celular
- Passo a passo numerado quando for mexer em painel de terceiro
- Bloco de código quando for para copiar; texto puro no celular não tem botão
  de copiar

## Se for construir do zero, nesta ordem

1. `centavos` e as funções de data, com teste. **Nada mais antes disto.**
2. Movimento de caixa e sessão, com `emEspecie` separado do saldo desde o
   primeiro dia. Enfiar isso depois obriga a reescrever tudo que soma.
3. Carregamento tolerante a falha parcial, com aviso na tela.
4. Produtos e estoque, com o negativo preservado desde o começo.
5. Venda, com dinheiro primeiro.
6. O resto.

O item 1 parece o menos urgente e é o único que não dá para consertar depois
sem mexer em tudo.
