# Qual intermediário de nota escolher

Pesquisa feita em **agosto de 2026** para decidir por quem o sistema vai
emitir NFC-e. Preço muda; confira antes de assinar. O raciocínio é o que
envelhece devagar.

Se você só quer a resposta: **Focus NFe, plano Retail**. O porquê está
abaixo.

---

## O que estamos comprando

Não estamos comprando "emissão de nota". Estamos comprando **não ter que
manter um webservice por estado, não guardar certificado digital de
cliente, e não ser o responsável legal quando a SEFAZ mudar um layout num
sábado.**

Isso é o que justifica pagar. Emitir direto é possível e é o caminho mais
caro que existe para quem mantém isto sozinho e também atende no balcão.

---

## Os candidatos, e por que sobraram estes

| | Preço | NFC-e | Como se contrata |
|---|---|---|---|
| **Focus NFe** — Retail | **R$ 59,90/mês** — 500 NFC-e + 100 NF-e; R$ 0,05 por NFC-e a mais | sim, plano próprio | assina no site |
| **Webmania** | a partir de R$ 69,90/mês | sim | assina no site |
| **PlugNotas / TecnoSpeed** | só falando com consultor | sim | proposta comercial |
| ~~Nuvem Fiscal~~ | — | — | **desativada em 31/07/2026** |

Três observações que valem mais do que a tabela:

**A Nuvem Fiscal fechou.** Era a mais barata e a mais citada em fórum de
desenvolvedor. Encerrou o serviço em 31 de julho de 2026. Serve de aviso:
esta é uma dependência que pode sumir, e a escolha tem que levar em conta
quanto custa trocar depois.

**Preço fechado é informação.** Focus e Webmania publicam preço; a
TecnoSpeed manda falar com consultor. Consultor significa proposta por
volume, negociação e provavelmente contrato — coisas que fazem sentido para
uma software house com trezentos clientes e não para a primeira pizzaria.

**Os planos comuns não incluem NFC-e.** Na Focus, os planos Solo, Start e
Growth são de NF-e e NFS-e; NFC-e só nos planos Retail. É o erro fácil de
cometer: assinar o de R$ 89,90 e descobrir que o que a pizzaria precisa não
está nele. O Retail é mais barato E é o certo.

---

## A recomendação, e o que ela custa por loja

**Focus NFe, plano Retail — R$ 59,90/mês por CNPJ**, 500 NFC-e inclusas,
R$ 0,05 por nota a mais, sem taxa de instalação e sem fidelidade.

Para dimensionar: 500 notas é cerca de **17 por dia**. Uma pizzaria de
bairro que emite nota em toda venda passa disso num fim de semana movimentado
e cai no excedente — R$ 0,05 por nota, ou seja, mil notas a mais custam
R$ 50. Ainda barato, mas é conta a fazer antes de prometer preço ao cliente.

O que pesou:

- **Preço público, sem setup e sem fidelidade.** Dá para começar com uma
  loja e parar se não der certo, sem contrato preso.
- **Plano de varejo com NFC-e por R$ 59,90** é o mais barato dos que
  publicam preço.
- **API REST, sem SDK obrigatório.** Importa porque a emissão vai rodar numa
  função da Vercel, em JavaScript puro — as funções da Vercel não importam
  TypeScript nem carregam biblioteca pesada com conforto.

O que fica de ressalva, honestamente:

- **Um CNPJ por assinatura no plano Retail.** Com a segunda loja emitindo
  nota, ou se assina outra, ou se sobe para o Retail+ (R$ 629,90 com CNPJ
  ilimitado), que só compensa a partir de mais ou menos dez lojas.
- **Não testei a API.** A recomendação é de contrato e preço, não de
  experiência de uso. O teste de verdade é emitir uma nota em homologação
  antes de prometer qualquer coisa ao restaurante.

---

## O que vem antes de assinar qualquer coisa

Nada disso adianta enquanto o restaurante não tiver, e **só ele pode
providenciar** (o passo a passo está em `NOTA-FISCAL.md`):

1. **CNPJ com Inscrição Estadual ativa.** NFC-e é ICMS.
2. **Certificado digital A1.** É ele que assina a nota. Vai para o
   intermediário, **nunca para este sistema**.
3. **Credenciamento na SEFAZ-PR + CSC.** Feito no portal do estado.

Assinar o intermediário antes disso é pagar mensalidade parada.

---

## Onde o token vai morar (a decisão que já está tomada)

O token do intermediário e o CSC da SEFAZ **não entram em `Config`**.

`configuracoes` sobe para a nuvem, entra no backup e sai no arquivo de
exportação — que circula por WhatsApp e e-mail. Token ali é token queimado,
e o CSC junto com o certificado é a chave da casa.

Eles moram numa tabela própria que o navegador não lê e o backup não leva, e
a emissão roda numa função da Vercel (`api/`) que é a única a enxergá-los. O
cabeçalho de `src/lib/fiscal.ts` já diz isso, e é por isso que aquele arquivo
não tem nenhum campo de credencial.

---

## Como testar antes de valer

O intermediário tem ambiente de homologação. Antes de emitir a primeira nota
de verdade:

1. Emitir em **homologação** uma venda com dois produtos.
2. Conferir se o cupom sai com o nome certo da loja, o CNPJ e o QR Code.
3. **Cancelar** essa nota, dentro dos 30 minutos, para ver o caminho de
   cancelamento funcionando.
4. Só então virar a chave para produção.

O passo 3 é o que ninguém faz e é o que dá problema depois: o cancelamento
tem relógio de 30 minutos no Paraná, e descobrir que ele não funciona com o
cliente na frente é o pior momento possível.

---

## Fontes

- [Focus NFe — preços](https://focusnfe.com.br/precos/)
- [Focus NFe](https://focusnfe.com.br/)
- [Webmania — planos](https://webmania.com.br/planos/)
- [PlugNotas / TecnoSpeed](https://tecnospeed.com.br/plugdfe/nfce/)
- [Nuvem Fiscal — aviso de desativação](https://www.nuvemfiscal.com.br/)
