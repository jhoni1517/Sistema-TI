# 🔧 Sistema TI — Caixa & Ordens de Serviço

Sistema completo de gestão para **assistência técnica de informática e celulares**:
ordens de serviço, caixa, estoque, clientes e relatórios com gráficos.

Feito em **React + TypeScript + Vite + TailwindCSS**. Funciona no **navegador do PC e do celular**,
pode ser **instalado como aplicativo** (PWA) e opcionalmente sincroniza os dados na **nuvem (Supabase)**.

---

## ✨ Funcionalidades

| Módulo | O que faz |
|---|---|
| **Painel** | Números do dia: OS abertas, prontas, recebido hoje, lucro do mês, alertas de estoque |
| **Ordens de Serviço** | Dados completos do aparelho (marca, modelo, IMEI, cor, acessórios), **senhas/padrão de desbloqueio**, defeito relatado x laudo técnico, checklist de entrada, peças, mão de obra, desconto, garantia |
| **Estado do equipamento** | Fluxo de status (aberta → análise → orçamento → reparo → pronta → entregue) com **histórico** |
| **Avisar cliente** | Botão que abre o **WhatsApp** com mensagem pronta do status atual da OS |
| **Recibo / Impressão** | Impressão da OS com termo de garantia e dados da loja |
| **Clientes** | Cadastro e gestão, histórico de OS por cliente, WhatsApp direto |
| **Estoque** | Peças e produtos, custo x venda, margem, **alerta de estoque baixo**, baixa automática ao usar em uma OS |
| **Caixa** | Entradas, saídas/despesas, **sangria**, abertura/fechamento de caixa, formas de pagamento, saldo em tempo real |
| **Relatórios** | Gráficos de evolução de faturamento, **lucro bruto x líquido**, margem, OS por status, recebimentos por forma de pagamento |
| **Configurações** | Dados da loja, senha de acesso, nuvem, **backup/exportação** dos dados em JSON |

### 💡 Ideias já incluídas
- Notificação do cliente por **WhatsApp** com mensagem automática por status
- **Código de acompanhamento** por OS (ex: `OS00042`)
- **Impressão de recibo** com termo de garantia
- **Baixa automática de estoque** ao entregar uma OS
- **Backup** manual em arquivo (exportar/importar)
- Controle de **garantia** (dias) por OS

---

## 🚀 Como rodar (desenvolvimento)

```bash
cd app
npm install
npm run dev
```
Abra o endereço mostrado (ex: `http://localhost:5173`).
**Senha inicial:** `1234` (altere em *Configurações*).

## 🏗️ Gerar a versão de produção

```bash
cd app
npm run build      # gera a pasta app/dist
npm run preview    # testa a versão de produção localmente
```

---

## 📱 Instalar como aplicativo (PC e celular) — sem programar

A forma mais simples de ter o sistema "como um app" no PC e no celular é o **PWA**:

1. Publique a pasta `app/dist` (veja "Publicar na web" abaixo) **ou** rode `npm run preview`.
2. **No PC (Chrome/Edge):** abra o site → ícone de **instalar** na barra de endereço → *Instalar*.
   Vira uma janela própria, com atalho na área de trabalho, igual a um `.exe`.
3. **No celular (Android/Chrome):** menu ⋮ → *Adicionar à tela inicial*.
   No iPhone (Safari): *Compartilhar* → *Adicionar à Tela de Início*.

> Funciona **offline** depois do primeiro acesso.

### 🖥️ Gerar um instalador `.exe` nativo (opcional, avançado)

Para um instalador Windows de verdade, use o **[Tauri](https://tauri.app)** (app leve, ~5 MB):

```bash
# pré-requisitos: Rust (rustup) e as build tools do Windows
cd app
npm install -D @tauri-apps/cli
npx tauri init          # frontendDist = ../dist ; devUrl = http://localhost:5173
npm run build
npx tauri build         # gera o instalador .msi/.exe em src-tauri/target/release/bundle
```

---

## 🌐 Publicar na web (para acessar do celular de qualquer lugar)

Qualquer hospedagem de site estático serve (Vercel, Netlify, GitHub Pages). Ex. Vercel:
- Diretório do projeto: `app`
- Comando de build: `npm run build`
- Pasta de saída: `dist`

---

## ☁️ Ativar a nuvem (mesmos dados no PC e no celular)

Por padrão o sistema salva **localmente** no dispositivo. Para compartilhar os dados entre
aparelhos, ative o Supabase (grátis):

1. Crie uma conta e um projeto em **[supabase.com](https://supabase.com)**.
2. No projeto, abra **SQL Editor** e rode o conteúdo de [`app/supabase-schema.sql`](app/supabase-schema.sql).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. No sistema, vá em **Configurações → Sincronização na nuvem**, cole os dois valores, salve e **recarregue a página**.

O rodapé do menu passará a mostrar **"Nuvem"** no lugar de "Local".

> Alternativa para produção: defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
> no arquivo `app/.env` (veja `app/.env.example`).

---

## 🗂️ Estrutura do projeto

```
app/
├── src/
│   ├── lib/          # tipos, cálculos, formatação, acesso a dados (local + nuvem)
│   ├── store/        # estado global (React Context)
│   ├── components/   # Layout e componentes de UI
│   ├── pages/        # Painel, Ordens, Clientes, Estoque, Caixa, Relatórios, Config
│   └── App.tsx       # rotas e login
├── supabase-schema.sql
└── public/           # ícone, manifest e service worker (PWA)
```

---

## 🔒 Sobre os dados sensíveis
As senhas de aparelhos ficam guardadas junto da OS e são exibidas apenas dentro do sistema
(protegido pela senha de acesso). Ao usar a nuvem, prefira ativar o **Auth do Supabase** e
ajustar as *policies* para uso multiusuário. Faça **backups** periódicos em *Configurações*.
