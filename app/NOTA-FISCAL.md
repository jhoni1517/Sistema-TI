# Nota fiscal, explicada para quem vai atender o cliente

Este arquivo é para **você**, na hora de colocar um restaurante (ou mercado,
ou adega) para emitir nota. Não precisa entender de tributação. Precisa
seguir a ordem e saber o que responder quando o cliente perguntar.

Leia uma vez inteiro antes do primeiro atendimento. Depois use só o
"Roteiro" e a "Cola de respostas".

---

## Em uma frase

O restaurante vende, o sistema registra a venda, e **outra empresa emite a
nota** por nós. Essa empresa é o "intermediário". Nós mandamos os dados da
venda, ela conversa com a Receita e devolve a nota pronta.

---

## As três coisas que só o cliente pode providenciar

Nada funciona sem isto, e **nada disso depende de nós**. Comece por aqui,
porque leva dias.

### 1. CNPJ com Inscrição Estadual ativa

Nota fiscal de venda não sai no CPF. O restaurante precisa de CNPJ **e** de
Inscrição Estadual (a "IE"), que é o registro dele na Receita do estado.

Muita gente tem CNPJ e não tem IE — quem só prestava serviço, por exemplo.
Se for o caso, o contador resolve.

**O que perguntar:** *"Você tem Inscrição Estadual ativa? Está no cartão do
CNPJ ou o contador te diz."*

### 2. Certificado digital A1

É um arquivo (`.pfx`) com senha. Funciona como a assinatura da empresa: quem
tem o arquivo e a senha assina documento no nome do restaurante.

- Custa por volta de **R$ 150 a R$ 250 por ano**
- Vale **12 meses** e depois tem que renovar
- Compra-se em qualquer certificadora (Serasa, Certisign, Soluti, e outras)
- Tem que ser **A1**, que é arquivo. O A3 é cartão ou token físico e **não
  serve** para emissão automática

**Atenção ao que vence.** Certificado vencido para de emitir nota do dia
para a noite. Anote a data e avise o cliente com um mês de antecedência.

### 3. Credenciamento na Receita do Paraná, e o CSC

Duas coisas na mesma visita ao site do estado:

**Credenciamento** — autorização para emitir NFC-e:
https://sped.fazenda.pr.gov.br

**CSC** — um código que assina o QR Code da nota. Gera-se em:
Portal RECEITA/PR → Menu **DF-e / NFC-e / CSC / Controle**
(precisa do código de acesso e da senha de representante legal)

**O que perguntar:** *"Seu contador já fez o credenciamento de NFC-e e gerou
o CSC?"* Se ele não souber o que é, mande este parágrafo para o contador.

---

## Onde entra o certificado (a pergunta que todo mundo faz)

**O certificado NÃO vai no nosso sistema.** Não procure o campo, ele não
existe — e isso é de propósito.

O `.pfx` é a identidade jurídica da empresa. Se ele passasse pelo nosso
sistema, passaria pelo navegador, pelo banco de dados e — no primeiro
descuido — pelo arquivo de backup que se manda por WhatsApp.

**O certificado é enviado no painel do intermediário**, pelo contador ou
pelo dono. Nosso sistema guarda só uma chave de acesso à API, do lado do
servidor, que o navegador nunca vê.

Se o cliente estranhar, a resposta é: *"O certificado fica na empresa que
emite a nota, não no sistema de caixa. É mais seguro assim — se o seu
sistema for roubado, ninguém assina nada no seu nome."*

---

## Roteiro de instalação

Siga na ordem. Cada passo depende do anterior.

### Passo 1 — Confirmar os três pré-requisitos

CNPJ com IE, certificado A1 comprado, credenciamento e CSC feitos.
**Se faltar um, pare aqui.** O resto não adianta.

### Passo 2 — Cadastrar o restaurante no intermediário

Criar a conta, subir o certificado A1 e informar o CSC.

### Passo 3 — Preencher os dados da loja no sistema

Em **Configurações → Dados da loja**:

| campo | onde achar |
|---|---|
| CNPJ | cartão do CNPJ |
| Inscrição Estadual | cartão do CNPJ ou com o contador |
| Regime tributário | com o contador (quase sempre Simples Nacional) |
| CNAE principal | cartão do CNPJ (restaurante costuma ser 5611-2/01) |
| CFOP padrão | deixe 5102, que serve para a maioria |
| CSOSN padrão | deixe 102, ou pergunte ao contador |
| Endereço para a nota | rua, número, bairro, CEP, cidade, UF |
| Código IBGE | 7 dígitos, **da cidade** |

**Código IBGE de São José dos Pinhais: 4125506.**
Outras cidades: procure em https://cidades.ibge.gov.br

O sistema mostra, embaixo do campo de Inscrição Estadual, **a lista do que
ainda falta**. Enquanto tiver item nessa lista, nota nenhuma sai.

### Passo 4 — Preencher o NCM dos produtos

Em **Estoque**, cada produto tem um campo **NCM** (8 dígitos). É ele que diz
à Receita o que a mercadoria é.

**Só o NCM é por produto.** O resto (CFOP, CSOSN, origem) vem do padrão da
loja e você não precisa repetir em cada item.

Quem informa os NCMs é o **contador do restaurante**. Não invente: NCM
errado é declaração errada à Receita.

Para agilizar, peça ao contador uma lista assim:

```
Pizza          -> 1905.90.90
Refrigerante   -> 2202.10.00
Cerveja        -> 2203.00.00
Água           -> 2201.10.00
```

### Passo 5 — Testar antes de valer

Todo intermediário tem ambiente de **homologação** (teste). Emita duas ou
três notas ali primeiro. Nota de homologação não vale nada fiscalmente e
serve exatamente para errar sem consequência.

Só depois vire a chave para **produção**.

---

## Como funciona no dia a dia

### A venda nunca espera a nota

Essa é a regra mais importante do desenho.

O caixa fecha a venda **na hora**, e a nota entra numa fila que é enviada
sozinha. Se a Receita estiver fora do ar, se a internet cair, se o
intermediário demorar — **a venda acontece igual**.

Um caixa de restaurante que trava porque a Receita caiu é um caixa que a
casa desliga na primeira sexta-feira cheia.

### As quatro situações de uma nota

| situação | o que significa | o que fazer |
|---|---|---|
| **Aguardando envio** | normal, a fila ainda não rodou | esperar |
| **Autorizada** | a Receita aceitou, a nota vale | nada |
| **Recusada** | tem dado errado, o motivo aparece na venda | corrigir e reenviar |
| **Cancelada** | foi cancelada dentro do prazo | nada |

### Cancelamento: 30 minutos e acabou

Depois de autorizada, dá para cancelar em **30 minutos**. Passou disso,
**não é mais cancelamento** — o caminho vira nota de devolução, que é outro
documento e quem faz é o contador.

Por isso o sistema mostra o tempo que resta. Não deixe o cliente descobrir
o prazo tentando.

### Quando a internet cai (contingência)

O sistema segue vendendo. Quando a conexão volta, a fila envia o que ficou.

Se a loja emitir em contingência offline de verdade, existem duas
obrigações legais: **imprimir o cupom** e guardar uma **segunda via** na
loja até a nota ser transmitida. O prazo para transmitir é de até 24 horas.

---

## Cola de respostas

**"Preciso de impressora fiscal?"**
Não. NFC-e usa impressora comum, térmica ou de folha. O que era obrigatório
com impressora fiscal ficou no passado.

**"Preciso emitir nota de tudo?"**
Sim, toda venda a consumidor. O cliente pode dispensar o papel, mas a nota
tem que ser emitida do mesmo jeito.

**"O cliente precisa dar CPF?"**
Não. NFC-e sai sem CPF. Só coloque quando o cliente pedir.

**"Quanto custa?"**
Certificado A1: R$ 150 a R$ 250 por ano. Intermediário: mensalidade ou
valor por nota, depende do plano. Credenciamento e CSC: de graça.

**"A nota saiu errada, e agora?"**
Menos de 30 minutos: cancele pelo sistema. Mais de 30 minutos: fale com o
contador, é nota de devolução.

**"Vendi e a nota está 'Aguardando envio' há muito tempo."**
Confira nesta ordem: internet da loja, se o certificado não venceu, e o
painel do intermediário (ele mostra o motivo real).

**"Trocamos o certificado. Precisa mexer no sistema?"**
Não. O certificado fica no intermediário. Sobe o novo lá e pronto.

---

## O que ainda NÃO está pronto no sistema

Seja honesto com o cliente sobre isto:

- **A emissão em si.** Os campos e a conferência estão prontos; o envio ao
  intermediário ainda não foi escrito. Falta escolher qual intermediário.
- **Vale-refeição** como forma de pagamento. Num restaurante é comum, e o
  sistema ainda não tem. A nota exige o código 11 para ele.
- **Comanda de mesa, fila da cozinha e delivery.** Não existem ainda.

---

## Para quem for mexer no código

- A regra do que falta para emitir está em `src/lib/fiscal.ts`, com teste.
- **Nenhuma credencial entra em `Config`.** A configuração sobe para a nuvem,
  entra no backup e sai no arquivo de exportação, que circula por WhatsApp.
  Token ali é token queimado.
- Emissão tem que rodar em função da Vercel (`api/`), nunca no navegador.
- Endereço da nota é PARTIDO em campos de propósito: `enderecoLoja` é uma
  linha só e não dá para partir depois com segurança ("Rua 15 de Novembro,
  1500" tem número no nome da rua).

## Links

- Credenciamento NFC-e Paraná — https://sped.fazenda.pr.gov.br
- CSC no Paraná — https://sped.fazenda.pr.gov.br/NFCe/Pagina/Codigo-de-Seguranca-do-Contribuinte-CSC
- Contingência NFC-e Paraná — http://moc.sped.fazenda.pr.gov.br/ContingenciaNFCe.html
- Código IBGE das cidades — https://cidades.ibge.gov.br
