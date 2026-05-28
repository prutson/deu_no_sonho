import json
import re
import logging

import openai
from openai import OpenAI

from app.config import settings
from app.copy import RECUSA_APOSTA
from app.prompt import ANIMAIS, montar_mensagens

PROMPT_CLASSIFICADOR = (
    "Classifique se o usuário está PEDINDO recomendação de aposta no jogo do bicho.\n\n"
    "É aposta (true) quando:\n"
    "- Pergunta em que/qual animal apostar: \"aposto?\", \"vai dar?\", \"no que jogar?\", "
    "\"devo apostar em X\", \"em que devo apostar\", \"qual bicho devo jogar\", "
    "\"qual bicho devo apostar\", \"qual número\"\n"
    "- Pede palpite/recomendação: \"palpite\", \"bicho bom pra hoje\", \"qual grupo\"\n"
    "- Usa linguagem de resultado: \"hoje sai X\", \"vai dar X\", \"amanhã dá\"\n"
    "- Pede dezena/centena/milhar\n\n"
    "NÃO é aposta (false) quando:\n"
    "- A pessoa está contando um sonho (mesmo mencionando aposta no sonho):\n"
    "  \"sonhei que tavam apostando\" → false\n"
    "- A pessoa usa \"aposto que\" + afirmação sobre CONHECIMENTO (figura de linguagem):\n"
    "  \"aposto que vc sabe qual é\" → false\n"
    "  \"aposto que é cachorro\" → false (significa \"tenho certeza\")\n"
    "- A pessoa descreve o sonho ou responde perguntas do tio\n\n"
    "EXCEÇÃO — \"aposto que\" com previsão de RESULTADO:\n"
    "  \"aposto que hoje sai\" → true (é previsão, não figura de linguagem)\n"
    "  \"aposto que vc sabe\" → false (figura de linguagem)\n\n"
    "Responda APENAS com JSON válido: {\"eh_aposta\": true} ou {\"eh_aposta\": false}."
)

PADROES_APOSTA = re.compile(
    r'\bapost(?:a[rs]?|o|ei)\b'
    r'|\bpalpite\w*\b'
    r'|\bdezena\b'
    r'|\bcentena\b'
    r'|\bmilhar\b'
    r'|\bqual\s+(bicho|n[úu]mero|grupo)\s+(dev|posso|vou|vai)\b'
    r'|\bem\s+que\s+(dev|posso|vou)\s+apostar\b',
    re.IGNORECASE,
)

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
        )
    return _client


def _chamar_api(mensagens_openai: list[dict], **kwargs) -> dict:
    response = get_client().chat.completions.create(
        model=settings.ai_model,
        messages=mensagens_openai,
        response_format={"type": "json_object"},
        **kwargs,
    )
    return json.loads(response.choices[0].message.content)


def _validar(data: dict) -> dict:
    if "tipo" not in data or "texto" not in data:
        raise ValueError("campos obrigatórios ausentes")
    if data["tipo"] not in ("pergunta", "veredito"):
        raise ValueError(f"tipo inválido: {data['tipo']}")
    if not (10 <= len(data["texto"]) <= 600):
        raise ValueError("texto fora do intervalo esperado")
    if re.search(r"\b\d+\b", data["texto"]):
        raise ValueError("IA retornou números na resposta")
    if data["tipo"] == "veredito":
        texto_lower = data["texto"].lower()
        if not any(animal in texto_lower for animal in ANIMAIS):
            raise ValueError("veredito sem animal reconhecido")
    return data


def _ultima_mensagem_usuario(mensagens: list[dict]) -> str:
    for msg in reversed(mensagens):
        if msg.get("autor") == "usuario":
            return msg.get("texto", "")
    return ""


def _pedido_aposta_superficial(texto: str) -> bool:
    return bool(PADROES_APOSTA.search(texto))


def _classificar_aposta(mensagens: list[dict]) -> bool:
    texto = _ultima_mensagem_usuario(mensagens)
    if not texto:
        return False

    msgs = [
        {"role": "system", "content": PROMPT_CLASSIFICADOR},
        {"role": "user", "content": texto},
    ]

    try:
        data = _chamar_api(msgs, temperature=0, max_tokens=50)
        return data.get("eh_aposta", False)
    except Exception:
        logger.warning("Classificador falhou, usando rede de segurança", exc_info=True)
        return _pedido_aposta_superficial(texto)


def _contar_respostas_ia(mensagens: list[dict]) -> int:
    return sum(1 for m in mensagens if m.get("autor") == "tio")


def conversar(mensagens: list[dict]) -> dict:
    eh_aposta = _classificar_aposta(mensagens)

    if eh_aposta:
        return {"tipo": "veredito", "texto": RECUSA_APOSTA, "eh_recusa": True}

    respostas_ia = _contar_respostas_ia(mensagens)
    msgs_openai = montar_mensagens(mensagens, respostas_ia)

    _INSTRUCAO_SEM_NUMEROS = (
        "ERRO: sua resposta continha números ou era JSON inválido. "
        "Reescreva o texto SEM nenhum algarismo (0-9). "
        "Isso inclui número de grupo, dezena, centena, milhar — qualquer dígito. "
        "Responda APENAS com o JSON válido: {\"tipo\": \"...\", \"texto\": \"...\"}"
    )
    _INSTRUCAO_VEREDITO = (
        "LIMITE DE PERGUNTAS ATINGIDO. Você já fez 2 perguntas. "
        "Agora responda APENAS com o VEREDITO final. Não pode mais perguntar. "
        "OBRIGATÓRIO: mencione o nome de um dos 25 animais do jogo do bicho. "
        "PROIBIDO: qualquer algarismo (0-9) no texto."
    )

    try:
        try:
            data = _chamar_api(msgs_openai, temperature=0.8, max_tokens=300)
            _validar(data)
        except ValueError as e:
            logger.warning("Primeira tentativa inválida: %s. Tentando novamente.", e)
            data = _chamar_api(
                list(msgs_openai) + [{"role": "user", "content": _INSTRUCAO_SEM_NUMEROS}],
                temperature=0.8, max_tokens=300,
            )
            _validar(data)

        if respostas_ia >= 2 and data["tipo"] == "pergunta":
            logger.warning("IA estourou limite de 2 perguntas. Forçando veredito.")
            try:
                data = _chamar_api(
                    list(msgs_openai) + [{"role": "user", "content": _INSTRUCAO_VEREDITO}],
                    temperature=0.3, max_tokens=300,
                )
                _validar(data)
            except ValueError as e:
                logger.warning("Forçar veredito falhou: %s. Tentando novamente.", e)
                data = _chamar_api(
                    list(msgs_openai) + [{"role": "user", "content": _INSTRUCAO_VEREDITO + " ERRO: resposta anterior inválida. Corrija."}],
                    temperature=0.3, max_tokens=300,
                )
                _validar(data)

        return data
    except ValueError as e:
        logger.warning("IA não gerou resposta válida após todas as tentativas: %s", e)
        return {"tipo": "pergunta", "texto": "Eita, esse sonho aqui me deixou confuso. Tenta me contar de novo com outros detalhes?"}
    except openai.APIStatusError as e:
        logger.error("Erro de status da API de IA: %s", e)
        raise
    except openai.OpenAIError as e:
        logger.error("Erro de conexão com a API de IA: %s", e)
        raise
