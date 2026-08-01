-- =====================================================================
-- Sistema TI · A TELA DE ENTRADA RECONHECE A CONTA
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- Ao digitar o e-mail, a tela de entrada já se apresenta como a loja daquela
-- conta. Antes os quatro botões de tipo de loja apareciam para todo mundo e,
-- para o cliente, não faziam nada — só o administrador muda de ramo. Clicar
-- e nada acontecer parece defeito.
--
-- O QUE ESTA FUNÇÃO ENTREGA, E O PREÇO DISSO
--
-- Ela responde, SEM SENHA, "que tipo de loja usa este e-mail?". Quem já sabe
-- o endereço exato de alguém descobre o ramo do negócio dele. É uma troca
-- consciente: sem ela, o reconhecimento só funciona em aparelho onde a conta
-- já entrou uma vez, e o aparelho novo — que é justamente onde a pessoa mais
-- precisa de ajuda — continuaria mostrando os quatro botões inúteis.
--
-- O que ela NUNCA devolve: se o e-mail existe (some junto com o resto),
-- nome, telefone, loja, papel ou qualquer outro dado. Só a palavra do ramo.
--
-- Para desligar depois:
--   revoke execute on function ramo_do_email(text) from anon;
-- A tela volta a se apoiar só na memória do aparelho, sem quebrar nada.
-- =====================================================================

drop function if exists ramo_do_email(text);
create function ramo_do_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select l.ramo
    from auth.users u
    join perfis p on p.id = u.id
    join lojas l on l.id = p.loja_id
   -- Comparação exata e normalizada: sem isto, "Dona@Mercearia.COM " seria
   -- outra conta e a tela esqueceria à toa. Prefixo não serve — deixaria a
   -- função virar um varredor de e-mails.
   where lower(u.email) = lower(trim(coalesce(p_email, '')))
     and coalesce(p.ativo, true)
     -- Loja desligada não se apresenta: quem foi bloqueado não vira vitrine.
     and coalesce(l.ativa, true)
     and not coalesce(l.bloqueada, false)
     -- E-mail vazio nunca casa, nem por acidente com um usuário sem e-mail.
     and length(trim(coalesce(p_email, ''))) > 3
   limit 1;
$$;

revoke all on function ramo_do_email(text) from public;
grant execute on function ramo_do_email(text) to anon, authenticated;

-- ---------- Confere ----------
-- Troque pelo e-mail da conta de teste. Deve voltar 'mercearia'.
-- select ramo_do_email('teste.mercearia@exemplo.com');
select u.email, l.nome, l.ramo
  from auth.users u
  join perfis p on p.id = u.id
  join lojas l on l.id = p.loja_id
 order by l.nome;
