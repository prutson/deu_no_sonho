from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal
import bleach
import re

from app.config import settings


class Mensagem(BaseModel):
    autor: Literal["tio", "usuario"]
    texto: str = Field(min_length=1, max_length=settings.max_chars_sonho)

    @field_validator("texto")
    @classmethod
    def sanitizar(cls, v: str) -> str:
        return bleach.clean(v, tags=[], strip=True).strip()


class ChatRequest(BaseModel):
    conversa_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    mensagens: list[Mensagem] = Field(min_length=1, max_length=settings.max_mensagens_historico)

    @field_validator("mensagens")
    @classmethod
    def ultima_eh_usuario(cls, v: list) -> list:
        if v[-1].autor != "usuario":
            raise ValueError("última mensagem deve ser do usuário")
        return v

    @model_validator(mode="after")
    def total_chars_ok(self) -> "ChatRequest":
        total = sum(len(m.texto) for m in self.mensagens)
        if total > settings.max_chars_total:
            raise ValueError(f"total de caracteres excede {settings.max_chars_total}")
        return self


class ChatResponse(BaseModel):
    tipo: Literal["pergunta", "veredito"]
    texto: str
    deve_concatenar_alerta: bool = False
    eh_recusa: bool = False
    eh_ultimo: bool = False



