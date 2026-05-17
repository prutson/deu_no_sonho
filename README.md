# Deu no Sonho

Um site que interpreta seus sonhos no bicho. Você conta o sonho, o tio faz umas perguntas, e no final ele te dá o palpite — que bicho que deu.

Feito com FastAPI, Redis, e a API da DeepSeek (ou qualquer provedor compatível com OpenAI SDK). Sem framework JS, sem firula. Vanilla JS, CSS na unha, e muito carinho.

**Acesse em:** [deunosonho.com.br](https://deunosonho.com.br)

## Como funciona

1. Você chega e conta um sonho
2. O tio faz 1 ou 2 perguntas pra entender melhor
3. O tio dá o veredito — qual animal da tabela do jogo do bicho representa seu sonho
4. O tio avisa: é brincadeira, não é pra apostar
5. Se você insistir em aposta, o tio te corta. Na segunda vez, ele te dá um gelo

Cada IP tem direito a 3 vereditos por dia (configurável). Depois disso, só amanhã.

## Tecnologias

| Camada | Stack |
|--------|-------|
| Backend | Python + FastAPI + Jinja2 |
| IA | OpenAI SDK (compatível com DeepSeek, OpenAI, Groq, etc.) |
| Cache/Rate Limit | Redis |
| Frontend | Vanilla JS + CSS |
| Infra | Docker + Docker Compose + Gunicorn + Uvicorn |

## Rodando o projeto

### Com Docker (recomendado)

```bash
docker compose up -d
```

Vai subir o app na porta 8000 e um Redis do lado.

### Manual

```bash
# cria ambiente virtual
python -m venv .venv && source .venv/bin/activate

# instala dependências
pip install -r requirements.txt

# copia e configura as variáveis
cp .env.example .env
# edita o .env com sua chave de IA

# roda
uvicorn app.main:app --reload
```

### Variáveis de ambiente

Tudo configurável via `.env`. Use o `.env.example` como base:

| Variável | O que faz | Exemplo |
|----------|-----------|---------|
| `AI_API_KEY` | Chave da API de IA | `sk-...` |
| `AI_BASE_URL` | URL do provedor | `https://api.deepseek.com` |
| `AI_MODEL` | Modelo | `deepseek-chat` |
| `REDIS_URL` | Conexão com Redis | `redis://redis:6379` |
| `RATE_LIMIT_POR_DIA` | Limite diário de vereditos por IP | `3` |

Pode usar DeepSeek, OpenAI, Groq — qualquer provedor que fale OpenAI SDK.

## Estrutura do código

```
app/
├── main.py          # FastAPI app, rotas, middlewares
├── ia.py            # Lógica de conversa com a IA + validação
├── prompt.py        # System prompt + montagem das mensagens
├── copy.py          # Todos os textos do site num lugar só
├── config.py        # Config via pydantic-settings
├── rate_limit.py    # Rate limiter com Redis
├── schemas.py       # Models Pydantic
└── security.py      # Security headers (CSP, etc.)
static/
├── css/style.css
├── js/app.js
└── images/
templates/
└── index.html
```

## O tom da conversa

Essa é a parte mais importante. O "tio" não é um chatbot genérico — é um personagem:

- **Brasileiro raiz**, coloquial, fala como se tivesse na esquina da feira
- **Auto-depreciação afetuosa**: "rapaz, sei lá", "não tenho mestrado nisso não"
- **Sempre na dúvida**: mostra incerteza genuína, pondera entre dois animais ("isso aí é porco ou galo... acho que porco mas pode ser galo também")
- **Nunca dá números**: não fala dezena, centena, milhar, grupo — só o nome do animal
- **Nunca incentiva aposta**: no final de cada veredito, o frontend concatena um alerta: "Mas não joga não, é contravenção e não quero que você arrume problema"
- **Curto e direto**: frase curta, sem enrolação
- **Corta qualquer papo de aposta**: se o usuário tentar, o tio recusa na hora; na segunda vez, bloqueia

### Exemplo de boa resposta do tio

> "Cê falou que os gatos tavam correndo quietinhos, sem miar, um preto e um laranja. Gato é bicho que faz a própria sorte, e preto com laranja é equilíbrio. Então pode ficar tranquilo, isso aí é Gato."

### Exemplo de resposta ruim (o que evitar)

> "Gato preto e laranja é Gato. Vai de Gato." — seco, dá número (implícito), parece incentivo.

## Aviso

Esse site é uma **brincadeira sobre folclore brasileiro**. O jogo do bicho existe desde 1892, é tradição centenária, mas também é contravenção. O site não incentiva, não dá números, não recomenda aposta. É diversão, cultura popular, causo de boteco. Se você levar a sério, o tio fica triste.
