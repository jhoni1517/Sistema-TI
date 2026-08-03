-- =====================================================================
-- Sistema TI · CONFERÊNCIA DE COLUNAS
-- ---------------------------------------------------------------------
-- Rode sempre que aparecer um erro do tipo:
--
--   Could not find the 'xxx' column of 'yyy' in the schema cache
--
-- Esse erro significa que o código passou a gravar um campo que a tabela
-- ainda não tem. Foi o que aconteceu com "compraEstoque" em movimentos: a
-- venda simplesmente não era gravada, e antes do tratamento de erro isso
-- acontecia em silêncio — o estoque baixava e o dinheiro não entrava.
--
-- Este arquivo repete TODAS as colunas opcionais que o sistema usa. É
-- seguro rodar quantas vezes quiser: "if not exists" não altera o que já
-- está certo e não apaga nada.
--
-- Ele resolve COLUNA que falta. Não resolve FUNÇÃO desatualizada: se o erro
-- citar situacao_loja, loja_pode_gravar ou registrar_pagamento, rode de novo
-- o supabase-migracao-assinatura.sql inteiro, que também é repetível.
-- =====================================================================

-- ---------- Movimentos de caixa ----------
-- Marca a saída que é reposição de estoque, e não despesa do mês.
alter table movimentos add column if not exists "compraEstoque" boolean default false;
alter table movimentos add column if not exists "custoRelacionado" numeric default 0;
alter table movimentos add column if not exists "sessaoId" text;
alter table movimentos add column if not exists "osId" text;
-- Para quem foi a venda: sai no recibo que o cliente leva.
alter table movimentos add column if not exists "clienteId" text;

-- ---------- Ordens de serviço ----------
alter table ordens add column if not exists "aprovadoEm" text;
alter table ordens add column if not exists "recusadoEm" text;
alter table ordens add column if not exists "assinaturaCliente" text;
alter table ordens add column if not exists "prontaEm" text;
-- Qual dos orçamentos o cliente escolheu, quando a OS oferece mais de um.
alter table ordens add column if not exists "opcaoEscolhida" text;
-- Segredo do link público. O valor padrão e o preenchimento das ordens que
-- já existem estão em supabase-migracao-rastreio-token.sql.
alter table ordens add column if not exists rastreio text;

-- ---------- Checklist diário ----------
-- A tabela inteira nasce em supabase-migracao-checklist.sql; estas linhas
-- existem para o caso de o arquivo antigo já ter rodado sem elas.
alter table tarefas add column if not exists horario text;
alter table tarefas add column if not exists dias jsonb not null default '[]'::jsonb;
alter table tarefas add column if not exists "feitoEm" jsonb not null default '[]'::jsonb;
alter table tarefas add column if not exists avisar boolean not null default false;
alter table tarefas add column if not exists "avisadoEm" text;
alter table tarefas add column if not exists ativo boolean not null default true;
alter table tarefas add column if not exists "atualizadoEm" text;
-- Fotos do aparelho na entrada. Só os endereços; os arquivos ficam no
-- depósito de imagens. É o que encerra discussão de arranhão na retirada.
alter table ordens add column if not exists fotos jsonb default '[]'::jsonb;
alter table ordens add column if not exists "entregueEm" text;

-- ---------- Produtos ----------
alter table produtos add column if not exists "categoriaId" text;
alter table produtos add column if not exists "subcategoriaId" text;
alter table produtos add column if not exists "fornecedorId" text;
alter table produtos add column if not exists servico boolean default false;
-- Frente de caixa: leitor de código de barras, venda por quilo e validade.
alter table produtos add column if not exists "codigoBarras" text;
alter table produtos add column if not exists "porPeso" boolean default false;
alter table produtos add column if not exists validade text;
-- Código curto do produto na balança do balcão: é por ele que a frente de
-- caixa reconhece a etiqueta impressa e já lança o peso.
alter table produtos add column if not exists "codigoBalanca" text;
-- Foto do produto. Só o endereço: o arquivo mora no depósito de imagens,
-- porque "produtos" é lido inteiro em toda carga.
alter table produtos add column if not exists "imagemUrl" text;
-- Promoção com prazo. O preço cheio fica em "preco" e volta sozinho quando o
-- prazo acaba: promover editando o preço na mão dava certo até a hora de
-- destrocar, que ninguém lembrava.
alter table produtos add column if not exists "precoPromocional" numeric;
alter table produtos add column if not exists "promocaoInicio" text;
alter table produtos add column if not exists "promocaoFim" text;

-- ---------- Clientes ----------
alter table clientes add column if not exists "tipoPessoa" text default 'fisica';
alter table clientes add column if not exists "nomeFantasia" text;
alter table clientes add column if not exists "inscricaoEstadual" text;
-- Classificação de risco: normal / atencao / bloqueado (ausente = normal).
alter table clientes add column if not exists classificacao text;
alter table clientes add column if not exists "motivoClassificacao" text;
alter table clientes add column if not exists "classificadoEm" text;
-- Aniversário: a Agenda monta o evento sozinha a partir daqui, todo ano.
alter table clientes add column if not exists nascimento text;
-- Teto do fiado. Vazio = sem teto. Decisão de dono, tomada uma vez, em vez
-- de decisão do atendente no balcão com fila esperando.
alter table clientes add column if not exists "limiteFiado" numeric;

-- ---------- Fiado ----------
alter table fiados add column if not exists vencimento text;
alter table fiados add column if not exists "osId" text;

-- ---------- Vendas (frente de caixa) ----------
-- Devoluções da venda. Ficam na própria venda para que "quanto ainda pode
-- voltar" seja uma conta e não um palpite do atendente.
alter table vendas add column if not exists devolucoes jsonb default '[]'::jsonb;
-- Venda dividida em mais de uma forma de pagamento. Sem isto o atendente
-- lançava tudo como dinheiro e o fechamento acusava sobra no cartão e falta
-- na gaveta todo dia, sem ninguém achar a origem.
alter table vendas add column if not exists pagamentos jsonb default '[]'::jsonb;

-- ---------- Sessões de caixa ----------
alter table sessoes add column if not exists observacoes text;
alter table sessoes add column if not exists "valorFechamento" numeric;
-- Dinheiro contado na gaveta. Sem ele não existe quebra de caixa: o sistema
-- guardava o valor que ele mesmo calculou e concordava consigo para sempre.
alter table sessoes add column if not exists "valorContado" numeric;

-- ---------- Lojas (assinatura) ----------
-- Quem rodou o supabase-migracao-assinatura.sql antes destas colunas
-- existirem cai em "column lojas.isento does not exist" ao abrir Lojas.
alter table lojas add column if not exists "venceEm" timestamptz;
alter table lojas add column if not exists valor_mensal numeric default 0;
alter table lojas add column if not exists bloqueada boolean default false;
alter table lojas add column if not exists "ultimoPagamento" timestamptz;
alter table lojas add column if not exists whatsapp text;
alter table lojas add column if not exists isento boolean default false;
-- Ramo CONTRATADO. Só o administrador do sistema muda; um gatilho recusa a
-- troca vinda da própria loja (ver supabase-migracao-ramo-loja.sql).
alter table lojas add column if not exists ramo text;

-- ---------- Confere o resultado ----------
-- Deve listar compraEstoque, custoRelacionado, osId e sessaoId.
select column_name, data_type
  from information_schema.columns
 where table_name = 'movimentos'
 order by ordinal_position;
