'use strict';

const COPY = {};

const SESSION_KEY = 'deunosonho:conversa';
const API_URL = '/api/chat';

let conversa = null;
let aguardando = false;

function _limiteExpirou() {
  if (!conversa || !conversa.limiteAtingidoEm) return false;
  return (Date.now() - new Date(conversa.limiteAtingidoEm).getTime()) >= 24 * 60 * 60 * 1000;
}

function trackEvent(nome, params) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', nome, params || {});
  }
}

function gerarId() {
  try { return crypto.randomUUID(); }
  catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

function lerSessao() {
  try { return localStorage.getItem(SESSION_KEY); }
  catch { return null; }
}

function salvarSessao() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(conversa)); }
  catch { }
}

window.addEventListener('DOMContentLoaded', inicializar);

function inicializar() {
  Object.assign(COPY, window.__COPY || {});
  try {
    const salvo = lerSessao();
    if (salvo) {
      try {
        conversa = JSON.parse(salvo);
        if (typeof conversa.vezesNovoSonho !== 'number') conversa.vezesNovoSonho = 0;
        if (typeof conversa.recusaOfensas !== 'number') conversa.recusaOfensas = 0;
        if (_limiteExpirou()) {
          criarNovaConversa();
        } else {
          renderizarConversa();
        }
      } catch {
        criarNovaConversa();
      }
    } else {
      criarNovaConversa();
    }

    document.getElementById('form-sonho').addEventListener('submit', (e) => {
      e.preventDefault();
      enviarMensagem();
    });
    document.getElementById('btn-novo-sonho').addEventListener('click', novoSonho);
    document.getElementById('btn-recuperar-recusa').addEventListener('click', recuperarAposRecusa);
    document.getElementById('btn-tentar-de-novo').addEventListener('click', tentarDeNovo);
    document.getElementById('input-sonho').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem();
      }
    });

    configurarViewport();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== document.getElementById('input-sonho')) {
        const botoes = ['btn-novo-sonho', 'btn-recuperar-recusa'];
        for (const id of botoes) {
          const btn = document.getElementById(id);
          if (btn && !btn.disabled && btn.offsetParent !== null) {
            btn.click();
            e.preventDefault();
            break;
          }
        }
      }
    });
  } catch (e) {
    console.error('Falha na inicialização', e);
  }
}

function configurarViewport() {
  if (!window.visualViewport) return;
  if (window.innerWidth >= 768) return;
  const app = document.getElementById('app');
  const vv = window.visualViewport;
  let timeout;

  function ajustar() {
    try {
      app.style.top = vv.offsetTop + 'px';
      app.style.height = vv.height + 'px';
    } catch { }
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const chat = document.getElementById('chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }, 120);
  }

  window.visualViewport.addEventListener('resize', ajustar);
  ajustar();
}

function criarNovaConversa() {
  conversa = {
    id: gerarId(),
    criadaEm: new Date().toISOString(),
    mensagens: [
      { autor: 'usuario', tipo: 'sonho', texto: COPY.SAUDACAO_USUARIO, hardcoded: true },
      { autor: 'tio', tipo: 'saudacao', texto: COPY.SAUDACAO_1, hardcoded: true },
      { autor: 'tio', tipo: 'saudacao', texto: COPY.SAUDACAO_2, hardcoded: true },
    ],
    etapa: 'aguardando_sonho',
    vezesNovoSonho: 0,
    recusaOfensas: 0,
  };
  salvarSessao();
  trackEvent('chat_iniciado');
  renderizarConversa();
}

function renderizarConversa() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';

  document.getElementById('botao-recuperar-recusa').classList.add('hidden');
  document.getElementById('botao-novo-sonho').classList.add('hidden');
  document.getElementById('botao-tentar-de-novo').classList.add('hidden');

  conversa.mensagens.forEach((msg) => {
    adicionarBolhaDom(msg, false);
  });

  atualizarUI();
  scrollParaFim();
}

function adicionarBolhaDom(msg, animada = true) {
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.classList.add('bolha', msg.autor);

  if (!animada) {
    div.style.animation = 'none';
  }

  if (msg.tipo === 'veredito' && msg.deve_concatenar_alerta !== false) {
    const textoEl = document.createElement('span');
    textoEl.textContent = msg.texto;
    div.appendChild(textoEl);

    const alerta = document.createElement('span');
    alerta.className = 'alerta-veredito';
    alerta.textContent = COPY.ALERTA_VEREDITO;
    div.appendChild(alerta);
  } else {
    div.textContent = msg.texto;
  }

  chat.appendChild(div);
  return div;
}

function mostrarIndicadorDigitacao() {
  const st = document.getElementById('header-status-texto');
  if (st) st.textContent = 'digitando...';

  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.id = 'indicador-digitacao';
  div.classList.add('bolha', 'tio', 'pensando');
  div.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(div);
  scrollParaFim();
}

function removerIndicadorDigitacao() {
  const el = document.getElementById('indicador-digitacao');
  if (el) el.remove();

  const st = document.getElementById('header-status-texto');
  if (st) st.textContent = 'online';
}

function enviarMensagem() {
  if (aguardando || conversa.recusaBanido) return;

  const input = document.getElementById('input-sonho');
  const texto = input.value.trim();

  if (!texto || texto.length > 500) return;

  input.value = '';

  const msg = {
    autor: 'usuario',
    tipo: conversa.etapa === 'aguardando_sonho' ? 'sonho' : 'resposta',
    texto,
    hardcoded: false,
  };

  conversa.mensagens.push(msg);

  adicionarBolhaDom(msg);
  trackEvent('mensagem_enviada', { tipo: msg.tipo });
  salvarSessao();

  setInputDesabilitado(true);
  mostrarIndicadorDigitacao();
  scrollParaFim();

  chamarAPI();
}

async function chamarAPI() {
  aguardando = true;

  const payload = {
    conversa_id: conversa.id,
    mensagens: conversa.mensagens.filter((m) => !m.hardcoded).map(({ autor, texto }) => ({ autor, texto })),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    removerIndicadorDigitacao();

    if (!res.ok) {
      tratarErro(res.status, data);
    } else {
      tratarResposta(data);
    }
  } catch {
    removerIndicadorDigitacao();
    tratarErro(0, null);
  } finally {
    aguardando = false;
  }
}

function tratarResposta(data) {
  const msg = {
    autor: 'tio',
    tipo: data.tipo,
    texto: data.texto,
    hardcoded: false,
    deve_concatenar_alerta: data.deve_concatenar_alerta,
  };

  if (data.tipo === 'veredito' && data.eh_recusa) {
    conversa.recusaOfensas = (conversa.recusaOfensas || 0) + 1;

    if (conversa.recusaOfensas >= 2) {
      document.getElementById('botao-recuperar-recusa').classList.add('hidden');
      msg.texto = COPY.BAN_APOSTA;
      conversa.mensagens.push(msg);
      adicionarBolhaDom(msg);
      conversa.recusaBanido = true;
      setInputDesabilitado(true, true);
      setStatusOffline();
      salvarSessao();
      scrollParaFim();
      return;
    }

    conversa.mensagens.push(msg);
    conversa.recusaAtiva = true;
    conversa.recusaEtapaAnterior = conversa.etapa;
    adicionarBolhaDom(msg);
    document.getElementById('botao-recuperar-recusa').classList.remove('hidden');
    setInputDesabilitado(true);
    salvarSessao();
    scrollParaFim();
    return;
  }

  conversa.mensagens.push(msg);

  if (data.tipo === 'veredito') {
    conversa.etapa = 'finalizada';
    adicionarBolhaDom(msg);
    trackEvent('veredito_recebido', { eh_ultimo: !!data.eh_ultimo });
    setInputDesabilitado(true);
    if (data.eh_ultimo) {
      conversa.limiteAtingido = true;
      conversa.limiteAtingidoEm = new Date().toISOString();
    }
    document.getElementById('botao-novo-sonho').classList.remove('hidden');
  } else {
    if (conversa.etapa === 'aguardando_sonho') {
      conversa.etapa = 'aguardando_resposta_pergunta_1';
    } else {
      conversa.etapa = 'aguardando_resposta_pergunta_2';
    }
    adicionarBolhaDom(msg);
    setInputDesabilitado(false);
  }

  salvarSessao();
  scrollParaFim();
}

function tratarErro(status, data) {
  let texto = COPY.ERRO_GENERICO;
  let desabilitarPermanente = false;

  if (status === 429) {
    texto = data?.mensagem || COPY.LIMITE;
    desabilitarPermanente = true;
    conversa.limiteAtingidoEm = conversa.limiteAtingidoEm || new Date().toISOString();
  } else if (status === 503) {
    texto = data?.mensagem || COPY.IA_FORA;
    desabilitarPermanente = true;
  }

  const msg = { autor: 'tio', tipo: 'erro', texto, hardcoded: false, erroPermanente: desabilitarPermanente };
  conversa.mensagens.push(msg);
  adicionarBolhaDom(msg);
  salvarSessao();

  setInputDesabilitado(desabilitarPermanente, desabilitarPermanente);
  if (desabilitarPermanente) setStatusOffline();
  scrollParaFim();
}

function recuperarAposRecusa() {
  if (conversa.recusaBanido) return;

  const etapaAnterior = conversa.recusaEtapaAnterior || 'aguardando_sonho';

  delete conversa.recusaAtiva;
  delete conversa.recusaEtapaAnterior;
  document.getElementById('botao-recuperar-recusa').classList.add('hidden');

  const msgBtn = {
    autor: 'usuario',
    tipo: 'resposta',
    texto: COPY.RECUPERACAO_BTN_MENSAGEM,
    hardcoded: true,
  };
  conversa.mensagens.push(msgBtn);
  adicionarBolhaDom(msgBtn);
  salvarSessao();
  scrollParaFim();

  mostrarIndicadorDigitacao();

  setTimeout(() => {
    removerIndicadorDigitacao();

    const msgTio = {
      autor: 'tio',
      tipo: 'saudacao',
      texto: COPY.RECUPERACAO_APOS_RECUSA,
      hardcoded: true,
    };
    conversa.mensagens.push(msgTio);
    adicionarBolhaDom(msgTio);

    conversa.etapa = etapaAnterior;
    salvarSessao();
    setInputDesabilitado(false);
    scrollParaFim();
  }, 1800);
}

function tentarDeNovo() {
  criarNovaConversa();
}

function novoSonho() {
  document.getElementById('botao-novo-sonho').classList.add('hidden');
  document.getElementById('botao-recuperar-recusa').classList.add('hidden');
  delete conversa.recusaAtiva;
  delete conversa.recusaEtapaAnterior;

  const limite = COPY.RATE_LIMIT || 3;
  if (conversa.limiteAtingido || conversa.vezesNovoSonho >= limite - 1) {
    const msgUsuario = {
      autor: 'usuario', tipo: 'sonho',
      texto: 'Quero contar outro sonho', hardcoded: true,
    };
    conversa.mensagens.push(msgUsuario);
    adicionarBolhaDom(msgUsuario);
    salvarSessao();
    scrollParaFim();

    mostrarIndicadorDigitacao();

    setTimeout(() => {
      const el = document.getElementById('indicador-digitacao');
      if (el) el.remove();

      const msgLimite = {
        autor: 'tio', tipo: 'saudacao',
        texto: COPY.LIMITE, hardcoded: true,
      };
      conversa.mensagens.push(msgLimite);
      adicionarBolhaDom(msgLimite);
      setInputDesabilitado(true, true);
      setStatusOffline();
      salvarSessao();
      scrollParaFim();
    }, 1000);
    return;
  }

  const msgTransicao = conversa.vezesNovoSonho >= 1
    ? COPY.TRANSICAO_REPETIDA
    : COPY.TRANSICAO;

  const msgUsuario = {
    autor: 'usuario',
    tipo: 'sonho',
    texto: 'Quero contar outro sonho',
    hardcoded: true,
  };
  const msgTio = {
    autor: 'tio',
    tipo: 'saudacao',
    texto: msgTransicao,
    hardcoded: true,
  };

  conversa.mensagens = [msgUsuario, msgTio];
  conversa.etapa = 'aguardando_sonho';
  conversa.vezesNovoSonho += 1;
  trackEvent('novo_sonho');

  adicionarBolhaDom(msgUsuario);
  adicionarBolhaDom(msgTio);

  salvarSessao();
  setInputDesabilitado(false);
  scrollParaFim();
}

function setStatusOffline() {
  const dot = document.querySelector('.status-dot');
  const texto = document.getElementById('header-status-texto');
  if (dot) dot.classList.add('offline');
  if (texto) texto.textContent = 'offline';
}

function atualizarUI() {
  if (conversa.limiteAtingido) {
    setInputDesabilitado(true, true);
    document.getElementById('botao-novo-sonho').classList.add('hidden');
    document.getElementById('botao-recuperar-recusa').classList.add('hidden');
    document.getElementById('botao-tentar-de-novo').classList.remove('hidden');
    setStatusOffline();
    return;
  }

  if (conversa.recusaBanido) {
    setInputDesabilitado(true, true);
    document.getElementById('botao-novo-sonho').classList.add('hidden');
    document.getElementById('botao-recuperar-recusa').classList.add('hidden');
    setStatusOffline();
    return;
  }

  if (conversa.recusaAtiva) {
    setInputDesabilitado(true);
    document.getElementById('botao-recuperar-recusa').classList.remove('hidden');
    document.getElementById('botao-novo-sonho').classList.add('hidden');
    return;
  }

  if (conversa.etapa === 'finalizada') {
    setInputDesabilitado(true);
    document.getElementById('botao-novo-sonho').classList.remove('hidden');
  } else {
    document.getElementById('botao-novo-sonho').classList.add('hidden');
    setInputDesabilitado(false);
  }

  if (conversa.mensagens.some((m) => m.erroPermanente)) {
    setInputDesabilitado(true, true);
    setStatusOffline();
    document.getElementById('botao-tentar-de-novo').classList.remove('hidden');
  }
}

function setInputDesabilitado(desabilitado, permanente = false) {
  const input = document.getElementById('input-sonho');
  const botao = document.getElementById('botao-enviar');
  input.disabled = desabilitado;
  botao.disabled = desabilitado;
  if (permanente) {
    input.style.cursor = 'not-allowed';
  } else if (!desabilitado) {
    input.style.cursor = '';
    input.focus();
  }
}

function scrollParaFim() {
  const chat = document.getElementById('chat');
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}
