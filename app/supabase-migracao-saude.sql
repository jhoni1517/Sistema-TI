/*
 * Saúde das lojas — o painel do administrador que diz quem está sumindo.
 *
 * Loja que cancela avisa semanas antes, pelo uso: as OS rareiam, o caixa
 * para de abrir. Quando o recado chega em forma de "quero cancelar", já não
 * tem conversa. Esta função entrega a contagem para a tela fazer a conta
 * (lib/saude.ts), e só a contagem: nome de cliente, valor de venda e o que
 * foi vendido não saem daqui.
 *
 * Só o super admin recebe linhas. Para qualquer outro, volta vazio.
 *
 * Repetível: create or replace.
 */

create or replace function saude_das_lojas()
returns table (
  loja uuid,
  ultimo_uso text,
  os_recentes bigint,
  os_anteriores bigint,
  vendas_recentes bigint,
  vendas_anteriores bigint,
  caixa_recentes bigint,
  funcoes text[]
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_loja uuid;
  v_hoje text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_28 text := to_char((now() at time zone 'utc') - interval '28 days', 'YYYY-MM-DD');
  v_56 text := to_char((now() at time zone 'utc') - interval '56 days', 'YYYY-MM-DD');
  v_tem boolean;
  v_f record;
begin
  if not sou_super_admin() then return; end if;

  for v_loja in select id from lojas loop
    loja := v_loja;

    -- Datas são texto ISO: comparar como texto é comparar como data.
    select count(*) filter (where "criadoEm" >= v_28 and "criadoEm" <= v_hoje || 'T99'),
           count(*) filter (where "criadoEm" >= v_56 and "criadoEm" < v_28)
      into os_recentes, os_anteriores
      from ordens where "lojaId" = v_loja;

    select count(*) filter (where "criadoEm" >= v_28 and "criadoEm" <= v_hoje || 'T99'),
           count(*) filter (where "criadoEm" >= v_56 and "criadoEm" < v_28)
      into vendas_recentes, vendas_anteriores
      from vendas where "lojaId" = v_loja;

    select count(*) into caixa_recentes
      from movimentos where "lojaId" = v_loja and data >= v_28 and data <= v_hoje || 'T99';

    -- Último sinal de vida: a data mais nova entre OS mexida, venda e caixa.
    -- Data no futuro (relógio errado do aparelho) não conta como uso de hoje.
    select max(d) into ultimo_uso from (
      select max(greatest("criadoEm", "atualizadoEm")) as d from ordens
       where "lojaId" = v_loja and greatest("criadoEm", "atualizadoEm") <= v_hoje || 'T99'
      union all
      select max("criadoEm") from vendas where "lojaId" = v_loja and "criadoEm" <= v_hoje || 'T99'
      union all
      select max(data) from movimentos where "lojaId" = v_loja and data <= v_hoje || 'T99'
    ) x;

    -- Funções usadas: a tabela tem alguma linha da loja. Tabela que ainda
    -- não existe (migração não rodada) só fica de fora, sem derrubar a lista.
    funcoes := array[]::text[];
    for v_f in
      select * from (values
        ('os', 'ordens'), ('pdv', 'vendas'), ('caixa', 'movimentos'),
        ('estoque', 'produtos'), ('clientes', 'clientes'), ('fiado', 'fiados'),
        ('contas', 'contas_pagar'), ('comandas', 'comandas'), ('notas', 'notas'),
        ('agenda', 'eventos'), ('site', 'pedidos_site'), ('trocas', 'rmas'),
        ('metas', 'metas'), ('tarefas', 'tarefas')
      ) as t(nome, tabela)
    loop
      if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = v_f.tabela and column_name = 'lojaId'
      ) then
        execute format('select exists (select 1 from %I where "lojaId" = $1)', v_f.tabela)
          into v_tem using v_loja;
        if v_tem then funcoes := funcoes || v_f.nome; end if;
      end if;
    end loop;

    return next;
  end loop;
end $$;

grant execute on function saude_das_lojas() to authenticated;

/* ---------- Confere ---------- */

-- Deve aparecer uma linha: saude_das_lojas | 0
select proname, pronargs from pg_proc where proname = 'saude_das_lojas';
