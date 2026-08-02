# Sistema TI

Sistema de gestão alugado para lojas de bairro. Nasceu para assistência
técnica de informática e celulares; hoje atende também mercearia, pizzaria e
loja de bebidas pelo mesmo código (ver "Ramos").

Quem mantém isto é **uma pessoa só**, que também atende no balcão. Toda
decisão de arquitetura aqui pesa mais a manutenção do que a elegância.

- Produção: https://sistema-ti-caixa.vercel.app
- Banco: Supabase, projeto `nviagibefxqtognowqwe`
- Configuração fora do código: `app/CONFIGURACAO.md`

## Como rodar

```bash
cd app
npm install
npm test         # vitest
npm run build    # tsc -b && vite build
npm run dev
npm run icones   # regenera os ícones do PWA
```

## Arquitetura

React 19 + TypeScript + Vite + Tailwind. Supabase (Postgres + Auth + RLS).
Vercel para o site estático, as funções `/api` e o cron diário.

```
app/src/lib/      regras de negócio puras, testáveis, sem React
app/src/pages/    telas
app/src/store/    AppStore: estado global e as ações de gravação
app/api/          funções da Vercel (JavaScript puro, sem TypeScript)
app/*.sql         migrações do Supabase, na ordem de CONFIGURACAO.md
```

**Toda conta que importa mora em `lib/`, com teste.** Dinheiro, data e
estoque nunca são calculados dentro de um componente. É o que permite mexer
na tela sem medo.

### Multi-loja

Cada tabela tem `lojaId`. As políticas do banco (RLS) só deixam ler e gravar
linhas da própria loja, e a gravação ainda exige assinatura em dia
(`loja_pode_gravar()`). A trava é no banco, não na tela: não adianta mexer
no navegador.

### Ramos

`lib/ramos.ts` é o único lugar onde a diferença entre os nichos existe.

**A regra que segura isto de pé: módulo é TELA, recurso é CAMPO.**

Módulo custa caro — tela nova para escrever, testar e manter, e que precisa
funcionar em qualquer combinação com as outras. Recurso custa quase nada —
um campo a mais numa tela que já existe.

IMEI, garantia, peso e validade parecem módulos e não são. Na dúvida: se não
tem endereço próprio no menu, é recurso.

`app/NICHOS.md` tem o levantamento do que os sistemas líderes de cada ramo
fazem, o que já está feito aqui e em que ordem vale atacar o resto.

**O ramo é o que a loja CONTRATOU, não uma preferência dela.** Mora em
`lojas.ramo`, e um gatilho no banco recusa a troca vinda da própria loja —
quando morava no JSON de configurações, quem comprou mercearia podia se
virar pizzaria sozinho e usar o que não pagou. Módulo fora do plano mostra
uma tela explicando, em vez de redirecionar calado: quem cai lá é cliente
pagante que abriu a porta errada.

## As regras que vieram de bug, não de livro

Cada uma destas custou uma tarde. Não são preferências.

### Campo novo no TypeScript exige coluna nova no banco

O erro `Could not find the 'x' column of 'y' in the schema cache` derrubava
**toda** a gravação daquela tabela. Uma venda baixava o estoque e não entrava
no caixa, em silêncio, porque ninguém tratava o erro.

Ao acrescentar um campo opcional num tipo: acrescente a coluna em
`supabase-corrigir-colunas.sql` no mesmo commit. O `esquema.test.ts` lê os
tipos e o SQL e falha dizendo qual coluna falta.

### Uma tabela com problema não pode zerar a tela

A carga usava `Promise.all`, que rejeita no primeiro erro e descarta todos
os outros resultados. Uma migração nova ainda não rodada apagava clientes,
estoque, caixa e o nome da loja da tela ao mesmo tempo — e o `catch` só
escrevia no console. A tela ficava idêntica à de um sistema que perdeu os
dados.

Leitura é sempre `Promise.allSettled`, e falha de carga aparece na tela.
Sem isso não há como o usuário diferenciar "está vazio" de "não carregou".
Ver `carga.test.ts`.

### Numerar em cima de lista que não carregou repete número

A leitura é tolerante a falha parcial de propósito. Mas `max(numero) + 1`
sobre uma lista vazia POR ERRO devolve 1, colidindo com o primeiro registro
da história da loja.

Na venda, o cupom sai com número repetido e a conferência passa a casar a
venda com o movimento errado. Na OS é pior: o rastreio público procura a
ordem PELO NÚMERO, e o cliente abre o link e vê o conserto de outra pessoa,
com nome e valor.

`fontesComFalha` diz quais tabelas não carregaram. Quem numera pergunta
antes e RECUSA, dizendo que nada foi perdido — senão a pessoa refaz a venda
inteira achando que sumiu.

Continua faltando resolver dois aparelhos vendendo ao mesmo tempo: isso o
banco resolveria com uma sequência. Enquanto não existe, pelo menos não se
erra sozinho.

### Gravação sem tratamento de erro é a pior classe de bug

Erro que aparece na tela custa cinco minutos. Erro engolido custa uma
semana e a confiança do cliente. Todo `save` de tela tem `try/catch` que
mostra a mensagem crua.

### Data é string `AAAA-MM-DD`, e a conta é em UTC

Somar hora local desloca o dia inteiro conforme o fuso. Já aconteceu aqui.
Ver `lib/contas.ts` e `lib/agenda.ts`.

Os três casos que sempre quebram, todos com teste:
- Dia 31 + 1 mês → 28 em fevereiro, e **volta para 31** em março
- 29/02 anual → 28/02 nos anos comuns
- Virada de ano

### A gaveta se confere contra o papel, nunca contra o saldo

O saldo soma cartão e Pix, que nunca passaram pela gaveta. O fechamento
pedia o saldo contado e acusava falta: numa loja que vendeu R$ 3.000 na
maquininha e tem R$ 200 em papel, aparecia "falta R$ 3.000" todo santo dia.

Diferença que aparece sempre é diferença que a pessoa aprende a ignorar — e
aí a conferência deixa de existir justamente para o dia em que falta
dinheiro de verdade.

`resumoCaixa.diferenca` é contado menos `emEspecie`. Vale na tela, no
fechamento impresso e no aviso de sangria. O mesmo erro já tinha sido
consertado no aviso e passou batido no fechamento, que é onde mais importa.

### Compra de estoque não é despesa do mês

Repor peça é troca de dinheiro por mercadoria; vira custo quando a peça é
vendida (CMV). Contar como despesa **e** como custo mostrava lucro negativo
numa venda lucrativa. Ver `ehCompraEstoque` em `lib/calc.ts`.

### Orçamentos alternativos nunca somam

"Fonte de 500W mais SSD" ou "só a fonte de 200W" é uma escolha, não uma lista
de compras. Tudo na mesma lista fazia o sistema somar tudo: o cliente recebia
um orçamento cobrando as duas fontes, e a loja parecia empurrar o dobro.

A unidade de escolha é o **orçamento inteiro**, não a peça — cada caminho
costuma ter mais de uma peça. Peça com `opcao` vazia entra em qualquer
cenário; peça com `opcao` preenchida pertence àquele orçamento;
`OrdemServico.opcaoEscolhida` guarda a decisão, e sem decisão vale o
primeiro, que é a sugestão da loja (total zerado seria menor que qualquer
cenário real).

A mesma conta existe em SQL — a página pública do cliente calcula o total
sozinha, e duas regras diferentes mostrariam dois valores para o mesmo
orçamento. Ver `lib/orcamento.ts` e `supabase-migracao-opcoes-os.sql`.

Antes de cobrar, o sistema pergunta se a escolha não foi confirmada: cobrar
pela sugestão achando que é decisão do cliente só aparece no fechamento.

### Imagem não mora no banco

`produtos` é lido inteiro em toda carga. Cem produtos com foto em base64
viram dezenas de MB a cada F5, no 4G do balcão. No banco fica só o endereço;
o arquivo vai para o Storage, encolhido para 800px e JPEG **antes** de subir
— a foto sai do celular com 4000px e 5 MB.

O caminho é `<lojaId>/pasta/arquivo.jpg` e a política do Storage só deixa
escrever na pasta da própria loja, com assinatura em dia. Caminho montado na
tela não protege nada. Ver `lib/imagens.ts` e `supabase-migracao-imagens.sql`.

### O que a vitrine pública mostra é decidido no banco

O catálogo e o rastreio abrem sem login. Filtrar campo na tela não esconde
nada de quem abre o painel do navegador: o corte é feito na função SQL, que
é a única porta — as políticas de leitura das tabelas continuam exigindo
login.

Do catálogo saem nome, foto, preço e "tem ou não tem". Nunca custo, margem,
fornecedor nem quantidade exata: concorrente também abre o link.

O catálogo nasce desligado em toda loja (`lojas.catalogo_ativo`). Ninguém
publica preço sem escolher publicar.

### Regra de preço é uma só, e ela vive em dois lugares

`precoEfetivo` (promoção com prazo) manda no PDV, na etiqueta da balança, na
etiqueta de prateleira e no catálogo. A mesma conta está em SQL, porque a
página pública calcula sozinha.

Tela que lê `produto.preco` direto faz a gôndola dizer um valor e o caixa
cobrar outro — e quem aparece como mentiroso é a loja, não o sistema.

Foi quebrada na entrada manual do Caixa, que lia `p.preco` direto. Virou
`preco-unico.test.ts`: ele varre as telas procurando conta feita com o preço
cru. Cadastro e a própria promoção marcam a linha com `preco-cru-proposital`.

### Dinheiro primeiro, sempre

Toda gravação que mexe em caixa E em estoque grava o **movimento antes**.

Falhando no meio, sobra lançamento de dinheiro sem a baixa correspondente —
que salta aos olhos na conferência e se conserta olhando o estoque. Ao
contrário, some a venda (ou aparece mercadoria que ninguém pagou), e **lucro
inflado é invisível: ninguém procura por ele**.

Vale para venda, devolução e entrada de mercadoria. A entrada nasceu ao
contrário e foi corrigida na revisão.

### Estoque negativo é informação, não erro

Quatro telas desciam estoque com `Math.max(0, ...)`. O zero parece
proteção e é o contrário: vender 3 de um item que o sistema acha que tem 1
deixava o saldo em 0 em vez de -2, e as duas unidades que saíram sem nunca
ter entrado sumiam do mapa. Nada para procurar, nada para a contagem achar
— e o detector de estoque negativo da conferência nunca disparava numa
venda, que é justamente onde o problema nasce. O PDV ainda avisava "a
venda passa, mas o saldo fica negativo", mentindo.

Estoque sobe e desce só por `lib/estoque.ts`. Negativo é o sistema
dizendo que falta lançar uma entrada; quem conserta é a contagem.

### Gravação sem tratamento de erro é a pior classe de bug (de novo)

A regra já estava escrita e mesmo assim OS, status da OS, abertura de
caixa, lançamento de fiado e conta a pagar gravavam sem `try/catch`. A
janela fechava como se tivesse dado certo.

O mesmo vale para a ordem: "dinheiro primeiro" foi quebrada cinco vezes
pelo mesmo motivo — a ordem natural de escrever é "faz a coisa e depois
anota", que é a errada.

**Regra escrita não segura nada.** As duas viraram teste que lê o código
do disco: `dinheiro-primeiro.test.ts` e `sem-emoji.test.ts`. Quando
descobrir uma regra dessas quebrada pela terceira vez, o conserto não é
consertar — é escrever o teste que reprova.

### Serviço não tem estoque

`Produto.servico` existe porque o atendente digitava 99999999999 na
quantidade para o item não ficar vermelho — e o valor do estoque foi para a
casa dos trilhões.

### O service worker nunca serve HTML do cache primeiro

Rede primeiro para navegação; cache primeiro só para arquivo com hash no
nome. Sem isso o usuário fica preso numa versão antiga depois do deploy — o
que já segurou uma tela de login velha na frente dele.

Trocou arquivo estático sem hash (ícone, manifest)? Suba a versão do cache
em `public/sw.js`.

### Formulário que não acompanha a nuvem apaga a loja inteira

O pior bug desta base até hoje, e o único que apagou dado de verdade.

`useState(config)` no formulário de Configurações só vale na PRIMEIRA
renderização. A configuração da loja chega da nuvem um instante depois, e a
tela continuava mostrando o padrão: "Minha Assistência TI", telefone em
branco, sem logo, sem chat do Telegram.

Isso sozinho seria só confuso. O grave é o passo seguinte: clicar em Salvar
subia esse formulário em branco por cima do que estava gravado, apagando
para TODOS os aparelhos de uma vez. O celular abriu vazio, o dono salvou, e
o computador perdeu junto.

Duas travas, e as duas são necessárias:

1. O formulário acompanha a nuvem enquanto ninguém mexeu num campo. Depois
   que mexeu, para — recarregar por cima de quem está digitando é o outro
   jeito de perder o que a pessoa escreveu.
2. `saveConfig` RECUSA antes de a leitura da nuvem terminar, e diz por quê.
   Falha de leitura não libera: o que está na tela pode ser o padrão.

Vale para qualquer tela que edite algo que veio da nuvem.

### Lista do que sobe para a nuvem envelhece; lista do que fica, não

`saveConfig` gravava na nuvem uma lista de campos escrita à mão. Oito
configurações criadas depois daquele dia ficaram de fora sem ninguém
perceber: logo, papel da impressora, limite da gaveta, chat do Telegram,
ramo, formato da balança, link de avaliação e limpar senha na entrega.
Salvavam no aparelho, a tela dizia "salvo", e na máquina seguinte estava
tudo em branco. O robô diário respondia "nenhuma loja com Telegram
configurado" para uma loja que tinha preenchido o campo.

Sobe TUDO menos o que está em `SO_NO_APARELHO` (aparência e credencial).
Esquecer uma exceção deixa um campo a mais na nuvem; esquecer na lista
antiga perdia o campo. Entre dois erros, escolhe-se o que dói menos —
e `config.test.ts` lê a interface do disco e cobra campo por campo.

O erro também caía num `.catch(() => {})`, a mesma regra de sempre.

### Limpar o localStorage no logout apaga as credenciais da nuvem

`limparCacheLocal` preserva `supabaseUrl`, `supabaseKey`, `tema` e
`corDestaque`. Sem isso o login quebrava na máquina seguinte.

### Mensagem de erro precisa dizer qual é a saída

"E-mail ou senha incorretos" para qualquer falha esconde os casos que a
pessoa não tem como adivinhar: e-mail sem confirmar, chave rotacionada,
projeto pausado. Cada um tem uma saída diferente, e o texto tem que dizer
qual é. Ver `traduzErro` em `lib/auth.ts`.

### Sem emoji nas mensagens que saem do sistema

Em alguns aparelhos chegam como `?` e sujam o recado. Vale para WhatsApp,
Telegram e recibo.

A cobrança de fiado saiu com três emojis por meses. `sem-emoji.test.ts`
varre `src` e `api`; emoji que fica só na tela é permitido marcando a
linha com `// emoji-na-tela`, porque a marca é a diferença entre decisão
e descuido.

### Segredo não passa por conversa

Se o valor tem "secret" no nome ou aparece escondido com bolinhas, ele vai
de um lugar para o outro e nunca por uma conversa, print ou commit. Chave
que apareceu é chave queimada: gere a nova, publique, e só então revogue a
velha.

### Página de diagnóstico é porta dos fundos

`/api/status` era aberta e mostrava os últimos lançamentos do caixa. Hoje
exige `?chave=<CRON_SECRET>`.

### Lógica duplicada em `api/` precisa de teste de paridade

Função da Vercel não importa TypeScript, então algumas contas existem duas
vezes. O teste **lê o arquivo `api/*.js` do disco e extrai a função de lá**
— não recopia o código, porque cópia dentro de teste envelhece igual e os
dois passam a mentir juntos. Ver `agenda.cron.test.ts`.

### A trava do sistema nunca sequestra dado

Loja com assinatura vencida continua consultando e imprimindo tudo; só não
grava. Além de ser o certo, segurar dado de cliente é o caminho mais curto
para um processo.

## Como trabalhar aqui

- **Português do Brasil** em tudo: código, comentário, commit, PR, tela.
- **Comentário explica o porquê**, não o quê. De preferência o porquê que
  veio de um bug real.
- Antes de qualquer push: `npm test` **e** `npm run build`. O `tsc --noEmit`
  já passou enquanto o build quebrava — não é o mesmo comando.
- Uma mudança, um PR, com o problema descrito antes da solução.
- Migração de banco é sempre repetível: `if not exists`, `create or
  replace`, `drop policy if exists` antes de criar.

### Falar com o dono do sistema

Ele atende no balcão e lê no celular. Seja direto e sem enfeite. Diga o que
quebrou antes de dizer o que foi feito. Erro seu, assuma sem rodeio. Link
sempre clicável e completo. Passo a passo numerado quando for mexer em
painel de terceiro (Vercel, Supabase, Telegram).
