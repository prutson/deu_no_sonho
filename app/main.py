import json
import logging
import time
from contextlib import asynccontextmanager

import openai
import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app import copy as c
from app.config import settings
from app.ia import conversar
from app.rate_limit import checar_limite_veredito, incrementar_veredito, limiter
from app.schemas import ChatRequest, ChatResponse
from app.security import SecurityHeadersMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    yield
    await app.state.redis.aclose()


app = FastAPI(docs_url=None, redoc_url=None, lifespan=lifespan)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
if settings.allow_localhost:
    origins = ["*"]
else:
    origins = [
        f"https://{settings.app_domain}",
        f"https://www.{settings.app_domain}",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.add_middleware(SecurityHeadersMiddleware)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


COPY_DATA = {
    "SAUDACAO_USUARIO": c.SAUDACAO_USUARIO,
    "SAUDACAO_1": c.SAUDACAO_1,
    "SAUDACAO_2": c.SAUDACAO_2,
    "TRANSICAO": c.TRANSICAO_NOVO_SONHO,
    "TRANSICAO_REPETIDA": c.TRANSICAO_REPETIDA,
    "ALERTA_VEREDITO": c.ALERTA_VEREDITO,
    "ERRO_GENERICO": c.ERRO_GENERICO,
    "LIMITE": c.LIMITE_DIARIO,
    "IA_FORA": c.IA_FORA,
    "AVISO_FOLCLORE": c.AVISO_FOLCLORE,
    "RECUSA_APOSTA": c.RECUSA_APOSTA,
    "RECUPERACAO_BTN_MENSAGEM": c.RECUPERACAO_BTN_MENSAGEM,
    "RECUPERACAO_APOS_RECUSA": c.RECUPERACAO_APOS_RECUSA,
    "BAN_APOSTA": c.BAN_APOSTA,
    "DESPEDIDA_ULTIMO": c.DESPEDIDA_ULTIMO,
    "RATE_LIMIT": settings.rate_limit_por_dia,
}


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "v": int(time.time()),
        "copy_json": json.dumps(COPY_DATA),
        "copy": COPY_DATA,
    })


@app.get("/sobre")
async def sobre(request: Request):
    return templates.TemplateResponse("sobre.html", {"request": request, "v": int(time.time())})


@app.get("/api/copy")
async def get_copy():
    return COPY_DATA


@app.post("/api/chat", response_model=ChatResponse)
@limiter.limit("30/hour")
async def chat(request: Request, body: ChatRequest):
    ip = request.client.host
    redis = request.app.state.redis

    count = await checar_limite_veredito(redis, ip)
    if count >= settings.rate_limit_por_dia:
        return JSONResponse(
            status_code=429,
            content={"erro": "limite_diario", "mensagem": c.LIMITE_DIARIO},
        )

    try:
        mensagens = [m.model_dump() for m in body.mensagens]
        resultado = conversar(mensagens)
    except (openai.APIStatusError, openai.OpenAIError) as e:
        logger.error("IA indisponível: %s", e)
        return JSONResponse(
            status_code=503,
            content={"erro": "ia_indisponivel", "mensagem": c.IA_FORA},
        )
    except Exception as e:
        logger.error("Erro interno inesperado: %s", e)
        return JSONResponse(
            status_code=500,
            content={"erro": "erro_interno", "mensagem": c.ERRO_GENERICO},
        )

    tipo = resultado["tipo"]
    texto = resultado["texto"]
    eh_recusa = resultado.get("eh_recusa", False)

    eh_ultimo = False
    if tipo == "veredito" and not eh_recusa:
        await incrementar_veredito(redis, ip)
        novo_count = count + 1
        eh_ultimo = novo_count >= settings.rate_limit_por_dia

    return ChatResponse(
        tipo=tipo,
        texto=texto,
        deve_concatenar_alerta=(tipo == "veredito" and not eh_recusa),
        eh_recusa=eh_recusa,
        eh_ultimo=eh_ultimo,
    )
