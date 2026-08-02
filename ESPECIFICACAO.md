# Sistema TI — especificação funcional completa

Documento para reconstruir o sistema do zero. Descreve **o que cada parte
faz e por quê**, não como está escrito hoje.

Cada regra marcada com **[BUG]** custou pelo menos uma tarde de conserto num
sistema em produção. Elas não são preferência de estilo — são o que separa um
sistema que fecha o mês de um que não fecha.

---

## 1. O que é

Sistema de gestão alugado (SaaS) para lojas de bairro. Nasceu para assistência
técnica de informática e celulares; hoje atende também mercearia, pizzaria e
loja de bebidas **pelo mesmo código**.

**Quem usa:** dono de loja de bairro, uma a três pessoas, atendendo no balcão
com fila. Lê no celular. Não tem TI, não tem paciência para treinamento.

**Quem mantém:** uma pessoa só, que também atende no balcão. Toda decisão de
arquitetura pesa mais a manutenção do que a elegância.

### Pilha técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | React + TypeScript + Vite + TailwindCSS | Build rápido, um arquivo por tela |
| Roteamento | HashRouter | Funciona em hospedagem estática sem configurar servidor |
| Banco | Postgres (Supabase) | RLS resolve multi-loja no banco, não na tela |
| Autenticação | Supabase Auth | E-mail e senha, com recuperação |
| Arquivos | Supabase Storage | Foto de produto e logo não podem morar no banco |
| Servidor | Funções serverless + cron diário | Robôs de mensagem e cobrança |
| App | PWA instalável | Balcão instala na tela inicial |

### Organização das pastas

```
src/lib/        regras de negócio puras, testáveis, SEM React
src/pages/      telas
src/components/ pedaços reaproveitados
src/store/      estado global e as ações de gravação
api/            funções do servidor (JavaScript puro)
*.sql           migrações do banco, na ordem
```

**Regra que segura isto de pé: toda conta que importa mora em `lib/`, com
teste.** Dinheiro, data e estoque nunca são calculados dentro de um
componente. É o que permite mexer na tela sem medo.

---

## 2. Multi-loja

Cada tabela tem `lojaId`. As políticas do banco só deixam ler e gravar linhas
da própria loja, e a gravação ainda exige assinatura em dia.

**A trava é no banco, não na tela.** Filtrar no JavaScript não protege nada
de quem abre o painel do navegador.

### Papéis

| Papel | Pode |
|---|---|
| **dono** | Tudo da loja, inclusive configurações e equipe |
| **funcionário** | Operação do dia a dia; não mexe em configuração |
| **administrador do sistema** | Enxerga todas as lojas, cobra mensalidade, define o ramo contratado |

**[BUG] Zero linhas alteradas não é erro para o Postgres.** Quando a política
recusa, a chamada volta bem-sucedida com nada dentro. Toda gravação que
depende de permissão precisa conferir quantas linhas voltaram — senão o
funcionário clica, lê "salvo" e nada mudou.

### Assinatura

Loja tem vencimento, valor mensal, tolerância e trava.

**A trava nunca sequestra dado.** Loja vencida continua consultando e
imprimindo tudo; só não grava. Além de ser o certo, segurar dado de cliente é
o caminho mais curto para um processo.

---

## 3. Ramos (nichos)

Um único lugar no código concentra a diferença entre os nichos.

**A regra: módulo é TELA, recurso é CAMPO.**

Módulo custa caro — tela nova para escrever, testar e manter, que precisa
funcionar em qualquer combinação com as outras. Recurso custa quase nada — um
campo a mais numa tela que já existe.

IMEI, garantia, peso e validade parecem módulos e não são. Na dúvida: **se não
tem endereço próprio no menu, é recurso.**

| Ramo | Módulos | Recursos | Vocabulário |
|---|---|---|---|
| Assistência técnica | Ordens de serviço, rastreio público | IMEI, garantia | "Ordem de Serviço", "Peça" |
| Mercearia / mercado | PDV | peso, validade | "Venda", "Produto" |
| Pizzaria / lanchonete | PDV, delivery, mesas, produção | — | "Pedido", "Item" |
| Loja de bebidas / adega | PDV, delivery | validade, idade mínima | "Venda", "Produto" |

**O ramo é o que a loja CONTRATOU, não uma preferência dela.** Mora na tabela
de lojas, e um gatilho no banco recusa a troca vinda da própria loja — quando
morava no JSON de configurações, quem comprou mercearia podia se virar
pizzaria sozinho e usar o que não pagou.

Módulo fora do plano mostra uma tela explicando, em vez de redirecionar
calado: quem cai lá é cliente pagante que abriu a porta errada.

---

## 4. As telas

### 4.1 Painel

Resumo do dia e da semana. Faturamento, lucro, ticket médio, comparativo com
os 7 dias anteriores, aparelhos na bancada, contas vencendo, quem chamar hoje.

Roda a **conferência de integridade** (seção 6) e mostra o que precisa de
ação, com o dinheiro em risco somado.

### 4.2 Frente de caixa (PDV)

**A regra de ouro: tem gente na fila.** Nada de janela entre o produto e o
troco. O foco vive na busca, o leitor de código de barras digita e dá Enter
sozinho, o item cai no carrinho sem confirmação.

- Busca por nome, código interno ou código de barras
- Leitor de código de barras funciona sem configuração
- **Etiqueta de balança**: código de barras que traz peso ou preço dentro; o
  sistema reconhece, identifica o produto e lança a quantidade
- Venda por peso (quilo) com quantidade editável na linha
- Desconto no total
- **Pagamento dividido**: parte no cartão, parte em dinheiro. Cada forma vira
  um lançamento próprio no caixa
- Troco calculado a partir do valor entregue
- Cliente é **opcional**: parar a fila para cadastrar quem quer um pão é o
  caminho mais curto para o sistema não ser usado
- Atalhos de teclado: fechar venda, limpar carrinho, consultar preço
- Devolução total ou parcial de venda anterior
- Recibo impresso ou enviado
- Aviso de validade vencida ou próxima ao adicionar o item

**[BUG] Venda dividida cobrando a mais.** Numa venda de R$ 100 paga com R$ 60
no cartão e R$ 50 em dinheiro entregue (troco de R$ 10), o sistema registrava
R$ 110 de receita. O valor **entregue** em espécie precisa ser separado do
valor **lançado**: troco não é faturamento.

**[BUG] Somar linhas do mesmo produto.** O aviso de estoque insuficiente
conferia item a item. Duas linhas de 3 unidades num estoque de 5 passavam
individualmente e estouravam no total.

### 4.3 Ordens de serviço

Para assistência técnica. O aparelho entra, é orçado, aprovado, consertado e
entregue.

- Cadastro do aparelho: tipo, marca, modelo, número de série / IMEI
- Defeito relatado pelo cliente e laudo técnico do balcão
- **Checklist de entrada**: liga, tela, botões, câmera, molhado, etc.
- **Fotos do estado de entrada** — encerra discussão de arranhão na retirada
- Senha do aparelho, inclusive **padrão de desenho** (grade de 9 pontos)
- Peças (do estoque ou digitadas) e mão de obra
- Desconto
- Status: orçamento, aguardando aprovação, em reparo, pronta, entregue, cancelada
- Garantia em dias, contada a partir da entrega
- Taxa de armazenamento por dia parado após ficar pronta
- Histórico de mudanças de status
- Histórico do mesmo aparelho (reincidência)
- Impressão da OS e do recibo
- Mensagem pronta para o cliente em cada etapa

**Orçamentos alternativos** — a parte mais delicada:

> "Fonte de 500W mais SSD" ou "só a fonte de 200W" é uma **escolha**, não uma
> lista de compras. Tudo na mesma lista fazia o sistema somar tudo: o cliente
> recebia um orçamento cobrando as duas fontes, e a loja parecia empurrar o
> dobro.

- A unidade de escolha é o **orçamento inteiro**, não a peça — cada caminho
  costuma ter mais de uma peça
- Peça sem nome de opção entra em **qualquer** cenário (é item fixo)
- Peça com nome de opção pertence àquele orçamento
- Sem decisão do cliente, vale o **primeiro** — é a sugestão da loja. Total
  zerado seria menor que qualquer cenário real
- **A mesma conta existe no banco**, porque a página pública do cliente
  calcula o total sozinha. Duas regras diferentes mostrariam dois valores
- Antes de cobrar, o sistema pergunta se a escolha não foi confirmada

**Entrega**: só por "Receber" (dinheiro entra no caixa) ou "Fiado" (vai para
contas a receber). Marcar "entregue" no seletor pulava o caixa E o estoque —
o aparelho saía da loja e nada era registrado.

### 4.4 Caixa

Sessões de caixa: abre com valor inicial, registra tudo, fecha com conferência.

- Abertura com valor em gaveta
- Entradas, saídas e **sangrias** (retirada para o cofre ou banco)
- Categorias de entrada e de saída
- Baixa de estoque opcional junto com a entrada
- **Entradas separadas por forma de pagamento** na tela: dinheiro, Pix,
  débito, crédito
- **"Na gaveta"** em destaque, separado do saldo
- Aviso de sangria quando passa do limite de dinheiro em espécie
- Busca por descrição, categoria ou forma de pagamento
- Filtro por tipo
- Lista agrupada por dia, com subtotal de cada dia
- Fechamento com **contagem da gaveta** e diferença apurada
- Histórico de fechamentos anteriores
- Recibo de venda, comprovante de sangria e resumo de fechamento impressos

**[BUG] O saldo não é o que está na gaveta.** O saldo soma cartão e Pix, que
nunca passaram por ali. Um dia com R$ 3.000 no cartão disparava o aviso de
sangria sem ter um centavo a mais em papel — e aviso que dispara sem motivo é
aviso que a pessoa aprende a ignorar.

**[BUG] Fechar gravando o valor calculado.** O sistema guardava o valor que
ele mesmo calculou como "contado" e concordava consigo para sempre. A quebra
de caixa nunca aparecia. Só grava a contagem se a pessoa realmente contou.

### 4.5 Estoque

- Cadastro com nome, categoria, subcategoria, fornecedor, custo, preço
- Estoque mínimo com destaque visual
- **Serviço** (item sem estoque)
- Produto **por peso**
- Código de barras e código de balança
- Validade
- **Promoção com prazo**: preço cheio fica guardado e volta sozinho quando o
  prazo acaba
- Foto do produto
- Busca com tolerância a erro de digitação
- Curva ABC / giro
- **Entrada de mercadoria** (nota do fornecedor) com custo médio
- **Contagem de inventário** com apuração de perda
- **Sugestão de compra** baseada na velocidade de venda
- **Etiquetas de prateleira** e de código de barras
- **Cotações** com fornecedores, virando compra e entrada de estoque
- **Catálogo público** (liga/desliga aqui)

**[BUG] Serviço com estoque.** O atendente digitava 99999999999 na quantidade
para o item não ficar vermelho, e o valor do estoque foi para a casa dos
trilhões.

**[BUG] Estoque negativo é informação, não erro.** Quatro telas desciam
estoque limitando em zero. O zero parece proteção e é o contrário: vender 3 de
um item que o sistema acha que tem 1 deixava o saldo em 0 em vez de -2, e as
duas unidades que saíram sem nunca ter entrado sumiam do mapa. Nada para
procurar, nada para a contagem achar.

Estoque sobe e desce por **um lugar só**. Negativo é o sistema dizendo que
falta lançar uma entrada.

**[BUG] Descontar linha a linha lê o saldo velho.** O laço buscava o produto
na lista da tela a cada volta, e a tela só atualiza no fim. Com o mesmo
produto em duas linhas, a segunda gravação sobrescrevia a primeira: saíam duas
fontes, descia uma. Some as linhas por produto e grave **uma vez** por produto.

### 4.6 Clientes

- Pessoa física ou jurídica
- Telefone, e-mail, endereço, documento
- Aniversário (a agenda monta o evento sozinha, todo ano)
- **Classificação de risco**: normal, atenção, bloqueado, com motivo e data
- **Teto de fiado** por cliente — decisão do dono, tomada uma vez, em vez de
  decisão do atendente com fila esperando
- Histórico de compras e de ordens
- Mensagem pronta no WhatsApp
- Clientes sumidos há X dias (reativação)

### 4.7 Contas a receber (fiado)

- Lançamento manual ou vindo de uma OS
- Pagamento parcial com histórico
- Vencimento e destaque do que venceu
- Cobrança pronta no WhatsApp
- Baixa automática quando quita

### 4.8 Contas a pagar

- Recorrência: única, mensal, anual
- Lembrete X dias antes
- Marca **compra de estoque** (não é despesa do resultado)
- Baixa lança a saída no caixa
- Metas e objetivos de economia

### 4.9 Agenda

Compromissos com repetição (semanal, mensal, anual) e antecedência de aviso.
Aniversários de clientes entram sozinhos.

### 4.10 Relatórios

Faturamento, lucro, CMV, despesas, ticket médio, horários de pico, curva ABC,
comissão por técnico, DRE simplificado, livro-caixa.

**Comissão é sobre o LUCRO, não sobre o faturamento**, e só do que foi
entregue. Comissão sobre faturamento paga o técnico por vender peça cara com
margem zero.

### 4.11 Página pública de acompanhamento

O cliente abre **sem login**, com o código da OS.

Vê: status, aparelho, valor e — quando há mais de um orçamento — **escolhe** o
caminho e só então aprova ou recusa, com assinatura.

Nunca vê: senha do aparelho, custo, margem, nem dado de outro cliente.

### 4.12 Catálogo público

Página com foto e preço dos produtos, para mandar no WhatsApp em vez de mandar
foto por foto.

- **Nasce desligado em toda loja.** Ninguém publica preço sem escolher publicar
- Quem liga é o dono da loja, com um interruptor
- Saem: nome, foto, preço e "tem ou não tem"
- **Nunca saem**: custo, margem, fornecedor, quantidade exata — concorrente
  também abre o link
- **O corte é feito no banco**, não na tela: filtrar campo no JavaScript não
  esconde nada de quem abre o painel do navegador

### 4.13 Configurações

Dados da loja, logo, papel da impressora, limite da gaveta, comissão padrão,
taxa de armazenamento, dias para considerar cliente sumido, tema e cor,
equipe, exportar e importar backup, chat de avisos no Telegram.

**[BUG] O formulário em branco apagava a loja inteira.** O formulário nascia
com o que o aparelho tinha e nunca era atualizado. A configuração da loja
chega da nuvem um instante depois; num celular novo, a tela mostrava o padrão.
Clicar em Salvar subia o padrão por cima do que estava gravado, apagando para
**todos** os aparelhos.

Três travas:
1. O formulário acompanha a nuvem **enquanto ninguém mexeu num campo**
2. Gravar é **recusado** antes de a leitura da nuvem terminar, e diz por quê
3. Falha de leitura **não** libera a gravação

---

## 5. Robôs e automação

### Lançamento por mensagem

Manda "café 5" no Telegram ou WhatsApp e vira despesa no caixa. "+100 venda de
película" vira entrada. "sangria 200" vira sangria. Comando de saldo responde
o caixa do dia.

**[BUG] O robô gravava e não respondia.** O envio da resposta engolia toda
falha em silêncio. Sem o token configurado, a mensagem chegava, o gasto
entrava no caixa e nada era respondido — e quem não recebe confirmação
**repete**, então o mesmo gasto entrava duas ou três vezes.

Falha de envio vai para o registro do servidor, que é o único canal que sobra
quando o canal de resposta é o que está quebrado.

### Rotina diária

Roda uma vez por dia e manda avisos. **Dois destinos, e a diferença não é
detalhe:**

| Vai para | O quê |
|---|---|
| **Operador do sistema** | Só a cobrança de mensalidade: nome da loja e quanto ela deve |
| **Cada loja, no chat dela** | Contas a pagar, agenda, aniversários, fiado vencido, lembrete de backup |

**[BUG] Vazamento entre lojas.** A rotina roda com credencial de serviço e
enxerga TODAS as lojas. Ela juntava tudo e mandava para um chat só, o do
operador: nome e dívida de cliente de uma loja indo para o celular de outra
pessoa. E sem serventia — quem precisa do lembrete é o dono da loja.

Loja sem chat configurado **não recebe nada, e nada dela sai**. Silêncio é o
padrão certo: o contrário vaza por omissão.

---

## 6. Conferência de integridade

O sistema se conferindo. Cada achado **diz o que fazer** — lista de problemas
sem saída vira tela que a pessoa aprende a fechar sem ler.

| Achado | Gravidade | O que significa |
|---|---|---|
| Venda sem lançamento no caixa | Erro | O cupom existe, a mercadoria saiu, o dinheiro não foi registrado |
| OS entregue sem pagamento | Erro | O aparelho saiu da loja e não há registro de pagamento |
| OS cobrada duas vezes | Erro | Os lançamentos somam mais do que a ordem vale. É o espelho do de cima, e o mais caro: receita a menos aparece na gaveta, receita a mais não aparece em lugar nenhum |
| Estoque negativo | Alerta | Saiu mercadoria que o sistema não sabia que tinha |
| Fiado sem cliente | Alerta | O cliente foi apagado com dívida em aberto |
| Caixa aberto há dias | Alerta | O fechamento deixou de ser "o dia" |
| Item vendido a preço zero | Informação | Brinde, ou preço esquecido em branco |
| OS parada há muito tempo | Informação | Aparelho ocupando bancada |

Ordenado por gravidade e, dentro dela, **por valor em dinheiro**: com vinte
achados na tela, o que decide é qual custa mais.

**[BUG] A conferência travava o painel.** A primeira versão varria a lista de
movimentos para cada venda. Com 3.000 de cada eram nove milhões de comparações
de texto — meio segundo travando a tela a cada venda registrada. Monte um
índice uma vez.

---

## 7. As regras que vieram de bug

Cada uma custou uma tarde. Não são preferências.

### Campo novo no código exige coluna nova no banco

O erro de coluna inexistente derrubava **toda** a gravação daquela tabela. Uma
venda baixava o estoque e não entrava no caixa, em silêncio.

Ao acrescentar um campo, acrescente a coluna no mesmo commit. **Um teste lê os
tipos e o SQL e falha dizendo qual coluna falta.**

### Uma tabela com problema não pode zerar a tela

A carga rejeitava no primeiro erro e descartava todos os outros resultados.
Uma migração ainda não rodada apagava clientes, estoque, caixa e o nome da
loja da tela ao mesmo tempo. A tela ficava idêntica à de um sistema que perdeu
os dados.

**Leitura é sempre tolerante a falha parcial, e falha de carga aparece na
tela.** Sem isso não há como o usuário diferenciar "está vazio" de "não
carregou".

### Gravação sem tratamento de erro é a pior classe de bug

Erro que aparece na tela custa cinco minutos. Erro engolido custa uma semana e
a confiança do cliente. **Todo salvamento mostra a mensagem crua.**

Esta regra foi quebrada seis vezes na mesma base, sempre em tela nova.

### Dinheiro primeiro, sempre

Toda gravação que mexe em caixa E em outra coisa grava o **movimento antes**.

Falhando no meio, sobra lançamento de dinheiro sem a baixa correspondente —
que salta aos olhos na conferência. Ao contrário, some a venda (ou aparece
mercadoria que ninguém pagou), e **lucro inflado é invisível: ninguém procura
por ele.**

Quebrada cinco vezes, sempre pelo mesmo motivo: a ordem natural de escrever é
"faz a coisa e depois anota", que é a errada.

### Data é texto AAAA-MM-DD, e a conta é em UTC

Somar hora local desloca o dia inteiro conforme o fuso.

Os três casos que sempre quebram: dia 31 + 1 mês (28 em fevereiro e **volta
para 31** em março), 29/02 anual, virada de ano.

### Compra de estoque não é despesa do mês

Repor peça é troca de dinheiro por mercadoria; vira custo quando a peça é
vendida. Contar como despesa **e** como custo mostrava lucro negativo numa
venda lucrativa.

### Imagem não mora no banco

A tabela de produtos é lida inteira em toda carga. Cem produtos com foto
embutida viram dezenas de MB a cada atualização, no 4G do balcão.

No banco fica só o endereço. O arquivo vai para o depósito, **encolhido e
recomprimido antes de subir** — a foto sai do celular com 4000px e 5 MB.

O caminho do arquivo é montado no servidor: caminho montado na tela não
protege nada.

### Regra de preço é uma só, e ela vive em dois lugares

Promoção com prazo manda no PDV, na etiqueta da balança, na etiqueta de
prateleira e no catálogo. A mesma conta existe no banco, porque a página
pública calcula sozinha.

Tela que lê o preço cheio direto faz a gôndola dizer um valor e o caixa cobrar
outro — e quem aparece como mentiroso é a loja.

### Lista do que sobe envelhece; lista do que fica, não

A sincronização das configurações tinha uma lista de campos escrita à mão.
Oito configurações criadas depois ficaram de fora sem ninguém perceber.
Salvavam no aparelho, a tela dizia "salvo", e na máquina seguinte estava tudo
em branco.

**Sobe tudo menos as exceções.** Esquecer uma exceção deixa um campo a mais na
nuvem; esquecer na lista antiga perdia o campo. Entre dois erros, escolhe-se o
que dói menos.

### Nunca serve HTML do cache primeiro

Rede primeiro para navegação; cache primeiro só para arquivo com hash no nome.
Sem isso o usuário fica preso numa versão antiga depois de publicar.

### Mensagem de erro precisa dizer qual é a saída

"E-mail ou senha incorretos" para qualquer falha esconde os casos que a pessoa
não tem como adivinhar: e-mail sem confirmar, chave trocada, projeto pausado.
Cada um tem uma saída diferente, e o texto tem que dizer qual é.

### Sem emoji nas mensagens que saem do sistema

Em alguns aparelhos chegam como `?` e sujam o recado. Vale para WhatsApp,
Telegram e recibo. Emoji que fica só na tela é permitido, **marcado
explicitamente** — a marca é a diferença entre decisão e descuido.

### Segredo não passa por conversa

Chave de API vai de um lugar para o outro e nunca por uma conversa, print ou
commit. **Chave que apareceu é chave queimada**: gere a nova, publique, e só
então revogue a velha.

Campo de configuração que aceita texto livre precisa **recusar** o que tem
cara de segredo: um token colado ali sobe para o banco e sai no primeiro
backup.

### Apagar cadastro não pode levar dívida junto

"Excluir Fulano?" não é pergunta, é armadilha. Quem responde sim não sabe que
aquele Fulano deve R$ 340 e tem um notebook na bancada.

- **Diz o que some junto**, em dinheiro e em quantidade
- **Algumas coisas não se apaga**: cliente devendo, produto já vendido e OS
  com dinheiro lançado não são cadastro, são histórico contábil

### Página de diagnóstico é porta dos fundos

Endpoint de status precisa de senha, e não imprime lançamento nem número de
chat. O que prova que a segurança está funcionando é o zero, não o conteúdo.

---

## 8. Fila offline

O balcão perde internet. A gravação que falha por rede entra numa fila local e
sobe quando volta.

- Só falha de **rede** entra na fila. Erro do banco (coluna faltando,
  permissão, assinatura vencida) **não** entra — seguraria os outros para
  sempre tentando o impossível
- Registro recusado sai da fila e vira aviso
- A tela mostra quantos estão presos. Descarregar em silêncio repetiria o erro
  que a fila veio consertar

---

## 9. Impressão

Papel configurável: folha comum ou bobina térmica de 58mm e 80mm.

**[BUG]** A configuração de papel valia só para o cupom do PDV. Recibo de OS,
recibo de venda e fechamento de caixa continuavam saindo em folha comum, e a
bobina cortava a metade direita de tudo — inclusive do total.

Documentos: cupom de venda, recibo de OS, ordem de serviço completa,
comprovante de sangria, fechamento de caixa, etiqueta de prateleira, etiqueta
de código de barras.

---

## 10. Como testar

- **Regra escrita não segura nada.** Quando uma regra da casa é quebrada pela
  terceira vez, o conserto não é consertar: é escrever o teste que reprova
- Testes que **leem o código do disco** pegam o que o compilador não vê: ordem
  de gravação, emoji em mensagem, campo esquecido na sincronização
- Lógica duplicada no servidor precisa de teste de paridade que **extrai a
  função do arquivo real** — recopiar dentro do teste faz as duas cópias
  envelhecerem juntas e mentirem em coordenação
- Teste de desempenho **não mede tempo**: conta operações. Cronômetro falha
  sozinho em máquina ocupada, e teste que falha à toa é teste que se ignora
- Antes de publicar: rodar os testes **e** o build completo

---

## 11. Como falar com o usuário

Ele atende no balcão e lê no celular.

- Direto e sem enfeite
- Diga o que quebrou **antes** de dizer o que foi feito
- Erro seu, assuma sem rodeio
- Link sempre clicável e completo
- Passo a passo numerado quando for mexer em painel de terceiro
- Português do Brasil em tudo: código, comentário, commit, tela

---

## 12. Ordem sugerida de construção

1. Autenticação, multi-loja e as políticas do banco
2. Cadastros: clientes, produtos, categorias, fornecedores
3. Caixa com sessões e fechamento
4. Ordens de serviço **ou** PDV, conforme o nicho alvo
5. Contas a receber e a pagar
6. Relatórios
7. Páginas públicas (acompanhamento e catálogo)
8. Robôs de mensagem e rotina diária
9. Conferência de integridade
10. Fila offline e PWA

**Não pule o passo 1.** Multi-loja enxertado depois vira vazamento entre
clientes, e o vazamento você descobre pelo cliente errado.
