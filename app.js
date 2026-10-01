'use strict';
(function () {
  const CFG = window.CT_CONFIG || {};
  const ES_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const DEMO = !CFG.API_URL && ES_LOCAL;   // datos ficticios en memoria, solo al abrir desde la propia máquina

  const ROL = { operario: 'Operario de campo', encargado: 'Encargado', lider: 'Líder de servicio', admin: 'Administrador de sistema' };
  const ESTADO = { pendiente: 'Pendiente', en_curso: 'En curso', completado: 'Completado', aprobado_supervisor: 'Aprobado por supervisor' };
  const MESES = 'ene feb mar abr may jun jul ago sep oct nov dic'.split(' ');
  const MAX_ADJUNTO = 5 * 1024 * 1024;

  /* ================= Estado ================= */

  // Lo que se guarda en el teléfono (IndexedDB) para trabajar sin señal.
  const S = { sesion: null, usuario: null, cat: null, trabajos: [], pozos: [], cola: [], desde: null, ultimaCuadrilla: '' };
  // Estado de pantalla; no se guarda.
  const U = {
    tab: 'inicio', vista: 'lista', filtro: 'todos', buscar: '', selId: null, pozoSel: null, form: null, parte: null,
    gestion: null, usuarios: null, agrupar: 'cuadrilla', desde: primerDiaMes(), hasta: hoy(), dia: hoy(),
    avisos: [], sincronizando: false, ocupado: false, sesionVencida: false, errorIngreso: ''
  };

  const esValidador = () => ['encargado', 'lider', 'admin'].includes(S.usuario.rol);
  const esCertificador = () => ['lider', 'admin'].includes(S.usuario.rol);
  const esAdmin = () => S.usuario.rol === 'admin';

  /* ================= Utilidades ================= */

  function hoy() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function primerDiaMes() { return hoy().slice(0, 8) + '01'; }
  function fechaCorta(iso, conAnio) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1]}` + (conAnio ? ` ${a}` : '');
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  function iniciales(nombre) { return String(nombre).split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase(); }

  // Crea nodos del DOM. Los textos entran siempre como texto, nunca como HTML.
  function h(tag, props, ...hijos) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const hijo of hijos.flat(Infinity)) {
      if (hijo == null || hijo === false) continue;
      el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
    }
    if (tag === 'select' && props && props.value != null) el.value = props.value;
    return el;
  }
  const boton = (clase, texto, onclick, extra) => h('button', Object.assign({ type: 'button', class: clase, onclick }, extra), texto);

  const ICONOS = {
    atras: '<svg width="9" height="15" viewBox="0 0 8 14"><path d="M7 1L1 7l6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ir: '<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="oklch(55% 0.006 90)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lupa: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.5" fill="none" stroke="oklch(45% 0.006 90)" stroke-width="1.8"/><line x1="11" y1="11" x2="15" y2="15" stroke="oklch(45% 0.006 90)" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mas: '<svg width="20" height="20" viewBox="0 0 20 20"><line x1="10" y1="3" x2="10" y2="17" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><line x1="3" y1="10" x2="17" y2="10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    mic: '<svg width="13" height="13" viewBox="0 0 14 14"><rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor"/><path d="M2.5 7.5a4.5 4.5 0 009 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="7" y1="12" x2="7" y2="13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    escudo: '<svg width="14" height="16" viewBox="0 0 14 16"><path d="M7 1l6 2.2v4.6C13 12 10.4 14.6 7 15.5C3.6 14.6 1 12 1 7.8V3.2L7 1z" fill="none" stroke="oklch(45% 0.16 80)" stroke-width="1.6"/></svg>',
    pin: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5c-3 0-5.5 2.4-5.5 5.6C3.5 11.1 9 16.5 9 16.5s5.5-5.4 5.5-9.4C14.5 3.9 12 1.5 9 1.5z" fill="none" stroke="oklch(45% 0.006 90)" stroke-width="1.4"/></svg>',
    hoja: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="1.5" width="12" height="15" rx="1.5" fill="none" stroke="oklch(45% 0.006 90)" stroke-width="1.4"/><path d="M6 6h6M6 9h6M6 12h4" stroke="oklch(45% 0.006 90)" stroke-width="1.3" stroke-linecap="round"/></svg>',
    bajar: '<svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 1v9M8 10l-3-3M8 10l3-3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    imprimir: '<svg width="15" height="15" viewBox="0 0 16 16"><path d="M4.5 6V2h7v4M4.5 12H3V7h10v5h-1.5M4.5 10h7v4h-7z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    t_inicio: '<svg width="21" height="21" viewBox="0 0 20 20"><path d="M3 9l7-6 7 6v9a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1V9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    t_pozos: '<svg width="21" height="21" viewBox="0 0 20 20"><path d="M10 2c-3 0-5.5 2.4-5.5 5.6C4.5 11.6 10 18 10 18s5.5-6.4 5.5-10.4C15.5 4.4 13 2 10 2z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="7.6" r="2" fill="currentColor"/></svg>',
    t_dashboard: '<svg width="21" height="21" viewBox="0 0 20 20"><rect x="3" y="10" width="4" height="7" rx="1" fill="currentColor"/><rect x="8" y="5" width="4" height="12" rx="1" fill="currentColor"/><rect x="13" y="8" width="4" height="9" rx="1" fill="currentColor"/></svg>',
    t_reportes: '<svg width="21" height="21" viewBox="0 0 20 20"><rect x="4" y="2.5" width="12" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 8h6M7 11h6M7 14h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    t_perfil: '<svg width="21" height="21" viewBox="0 0 20 20"><circle cx="10" cy="6.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 18c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };
  function icono(nombre) {   // solo marcado fijo de la tabla de arriba
    const t = document.createElement('template');
    t.innerHTML = ICONOS[nombre];
    const svg = t.content.firstChild;
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }

  /* ================= Guardado local ================= */

  let dbPromesa = null;
  function db() {
    if (!dbPromesa) {
      dbPromesa = new Promise((ok, mal) => {
        const r = indexedDB.open('seaveapp', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
      });
    }
    return dbPromesa;
  }
  async function leerLocal() {
    try {
      const d = await db();
      return await new Promise((ok, mal) => {
        const r = d.transaction('kv').objectStore('kv').get('estado');
        r.onsuccess = () => ok(r.result || null);
        r.onerror = () => mal(r.error);
      });
    } catch (e) { return null; }
  }
  async function guardarLocal() {
    try {
      const d = await db();
      await new Promise((ok, mal) => {
        const tx = d.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(JSON.parse(JSON.stringify(S)), 'estado');
        tx.oncomplete = ok;
        tx.onerror = () => mal(tx.error);
      });
    } catch (e) {
      avisar('No se pudo guardar en el teléfono. Sincronizá antes de cerrar la app.');
    }
  }
  async function borrarLocal() {
    try {
      const d = await db();
      await new Promise((ok) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = ok; tx.onerror = ok; });
    } catch (e) { /* nada que borrar */ }
  }

  /* ================= Servidor ================= */

  async function api(accion, datos, extra) {
    if (DEMO) return window.CT_MOCK(accion, datos || {}, extra || {});
    let resp;
    try {
      resp = await fetch(CFG.API_URL, {
        method: 'POST', redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita el pedido previo de CORS, que Apps Script no responde
        body: JSON.stringify(Object.assign({ sesion: S.sesion, accion, datos: datos || {} }, extra))
      });
    } catch (e) {
      throw { codigo: 'red', mensaje: 'Sin conexión con el servidor' };
    }
    let j;
    try { j = await resp.json(); } catch (e) { throw { codigo: 'red', mensaje: 'El servidor no respondió correctamente' }; }
    if (!j || !j.ok) throw (j && j.error) || { codigo: 'interno', mensaje: 'Error interno' };
    return j.datos;
  }

  function avisar(texto) {
    if (!U.avisos.includes(texto)) U.avisos.push(texto);
    pintar();
  }
  const mensajeDe = (e) => (e && e.mensaje) || 'Ocurrió un error inesperado';

  function recibirTodo(d) {
    S.usuario = d.usuario; S.cat = d.catalogos; S.trabajos = d.trabajos; S.pozos = d.pozos; S.desde = d.desde;
    if (d.sesion) S.sesion = d.sesion;
    S.cola.forEach(aplicarLocal);
  }

  async function refrescar() {
    const pedir = U.desde < (S.desde || '9') ? U.desde : undefined;
    recibirTodo(await api('datos.todo', pedir ? { desde: pedir } : {}));
    await guardarLocal();
  }

  /* ---------- Cola de cambios sin sincronizar ---------- */

  const trabajoPorId = (id) => S.trabajos.find((t) => t.id === id);

  function derivados(datos) {
    const servicio = ctServicioDe(datos.cuadrilla, S.cat);
    return Object.assign({}, datos, { servicio, horas: ctHoras(datos.inicio, datos.fin, ctEs24h(servicio, S.cat)) });
  }

  // Refleja en pantalla un cambio que todavía no llegó al servidor.
  function aplicarLocal(op) {
    const t = trabajoPorId(op.id);
    if (op.k === 'guardar') {
      if (t) Object.assign(t, derivados(op.trabajo));
      else S.trabajos.unshift(Object.assign({ id: op.id, version: 0, estado: 'pendiente', aprobado: false, aprobadoMensual: false,
        fotos: [], documentos: [], creadoPor: S.usuario.email }, derivados(op.trabajo)));
    } else if (op.k === 'estado' && t) {
      if (op.cambio === 'iniciar') t.estado = 'en_curso';
      else if (op.cambio === 'completar') t.estado = 'completado';
      else if (op.cambio === 'aprobar') t.aprobado = true;
      else if (op.cambio === 'aprobar_mensual') t.aprobadoMensual = true;
      else if (op.cambio === 'anular') S.trabajos = S.trabajos.filter((x) => x.id !== op.id);
    }
  }

  async function encolar(op) {
    op.opId = uuid();
    const previa = op.k === 'guardar' ? S.cola.find((o) => o.k === 'guardar' && o.id === op.id) : null;
    if (previa) previa.trabajo = op.trabajo; else S.cola.push(op);
    aplicarLocal(op);
    await guardarLocal();
    pintar();
    sincronizar();
  }

  const pendientesDe = (id) => S.cola.some((o) => o.id === id || o.trabajoId === id);

  async function enviar(op) {
    if (op.k === 'guardar') {
      const t = trabajoPorId(op.id);
      return api('trabajos.guardar', { id: op.id, version: t ? t.version : 0, trabajo: op.trabajo });
    }
    if (op.k === 'estado') return api('trabajos.estado', { id: op.id, cambio: op.cambio });
    return api('adjuntos.subir', { trabajoId: op.trabajoId, clase: op.clase, localId: op.localId, mime: op.mime, base64: op.base64 });
  }

  const REINTENTAR = ['red', 'ocupado', 'demasiados_pedidos', 'interno', 'config'];

  async function sincronizar() {
    if (U.sincronizando || !S.sesion || !navigator.onLine) return;
    U.sincronizando = true;
    pintar();
    try {
      while (S.cola.length) {
        const op = S.cola[0];
        try {
          const r = await enviar(op);
          if (op.k !== 'adjunto' && r && r.id) {
            const t = trabajoPorId(r.id);
            if (t) t.version = r.version;
          }
        } catch (e) {
          if (e.codigo === 'no_autenticado' || e.codigo === 'no_autorizado') { U.sesionVencida = true; U.errorIngreso = mensajeDe(e); return; }
          if (REINTENTAR.includes(e.codigo)) return;
          // El servidor rechazó el cambio (conflicto, bloqueo, datos inválidos): no se reintenta.
          const t = trabajoPorId(op.id || op.trabajoId);
          U.avisos.push(`No se pudo sincronizar un cambio${t ? ' en ' + t.pozo : ''}: ${mensajeDe(e)}`);
        }
        S.cola.shift();
        await guardarLocal();
      }
      await refrescar();
    } catch (e) {
      if (e.codigo === 'no_autenticado' || e.codigo === 'no_autorizado') { U.sesionVencida = true; U.errorIngreso = mensajeDe(e); }
    } finally {
      U.sincronizando = false;
      pintar();
    }
  }

  /* ---------- Archivos ---------- */

  const archivos = new Map();   // id de Drive → promesa de { url, mime, nombre }
  function b64ABlob(base64, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  function cargarArchivo(id) {
    if (!archivos.has(id)) {
      archivos.set(id, api('adjuntos.ver', { id })
        .then((r) => ({ url: URL.createObjectURL(b64ABlob(r.base64, r.mime)), mime: r.mime, nombre: r.nombre }))
        .catch((e) => { archivos.delete(id); throw e; }));
    }
    return archivos.get(id);
  }
  async function abrirArchivo(id, descargarComo) {
    try {
      const a = await cargarArchivo(id);
      const enlace = h('a', { href: a.url, target: '_blank', rel: 'noopener', download: descargarComo || null });
      document.body.append(enlace); enlace.click(); enlace.remove();
    } catch (e) { avisar('No se pudo abrir el archivo: ' + mensajeDe(e)); }
  }
  function leerBase64(blob) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = () => mal(r.error);
      r.readAsDataURL(blob);
    });
  }
  // Las fotos se achican antes de guardarlas: pesan menos en el teléfono y suben más rápido con poca señal.
  async function prepararFoto(archivo) {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const lienzo = h('canvas', { width: Math.round(bmp.width * escala), height: Math.round(bmp.height * escala) });
    lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.8));
    return { localId: uuid(), mime: 'image/jpeg', base64: await leerBase64(blob) };
  }

  /* ================= Piezas de pantalla ================= */

  const estadoDe = (t) => (t.aprobado ? 'aprobado_supervisor' : t.estado);
  const chipEstado = (t) => h('div', { class: 'estado ' + estadoDe(t) }, ESTADO[estadoDe(t)]);
  const horario = (t) => `${t.inicio}–${t.fin} (${t.horas} h)`;
  function requiereMiAccion(t) {
    if (S.usuario.rol === 'encargado') return t.estado === 'completado' && !t.aprobado;
    if (esCertificador()) return t.aprobado && !t.aprobadoMensual;
    return false;
  }
  const barraAtras = (titulo, volver) => h('div', { class: 'barra-atras' },
    h('button', { type: 'button', class: 'btn-atras', 'aria-label': 'Volver', onclick: volver }, icono('atras')),
    h('div', { class: 'nombre' }, titulo));
  const cabecera = (titulo, sub, derecha) => h('div', { class: 'cabecera' },
    h('div', { class: 'fila' }, h('h1', { class: 'titulo' }, titulo), derecha), sub && h('div', { class: 'subtitulo' }, sub));

  function abrirTrabajo(id) { U.vista = 'detalle'; U.selId = id; pintar(true); }

  function tarjetaTrabajo(t) {
    const accion = requiereMiAccion(t);
    return h('button', { type: 'button', class: 'tarjeta trabajo' + (accion ? ' accion' : ''), onclick: () => abrirTrabajo(t.id) },
      accion && h('div', { class: 'requiere' }, 'Requiere tu acción'),
      h('div', { class: 'arriba' },
        h('div', null, h('div', { class: 'pozo' }, t.pozo), h('div', { class: 'tipo' }, t.tipo), t.detalle && h('div', { class: 'detalle' }, t.detalle)),
        h('div', { class: 'derecha' }, chipEstado(t), h('div', { class: 'cuadrilla' }, t.cuadrilla))),
      h('div', { class: 'meta' }, h('span', null, fechaCorta(t.fecha)), h('span', null, horario(t))),
      pendientesDe(t.id) && h('div', { class: 'pendiente-sync' }, '● Pendiente de sincronizar'));
  }

  /* ================= Pantallas ================= */

  function vistaIngreso() {
    const caja = h('div', { class: 'ingreso' },
      h('img', { src: './assets/logo-seave.png', alt: 'Seave S.A.' }),
      h('div', null, h('h1', { class: 'titulo' }, 'SeaveApp'),
        h('p', null, U.sesionVencida ? 'Volvé a ingresar para seguir sincronizando. Lo que cargaste sigue guardado en este teléfono.'
          : 'Ingresá con tu cuenta de Google habilitada')),
      U.errorIngreso && h('div', { class: 'error-campo' }, U.errorIngreso));

    if (DEMO) {
      caja.append(h('div', { class: 'demo' }, Object.keys(ROL).map((rol) => boton('btn borde', 'Demo: ' + ROL[rol], () => ingresar({ rolDemo: rol })))),
        h('p', null, 'Modo demostración con datos ficticios. Falta configurar config.js.'));
    } else if (!CFG.API_URL || !CFG.GOOGLE_CLIENT_ID) {
      caja.append(h('p', null, 'La app todavía no está configurada. Avisale al administrador.'));
    } else if (!navigator.onLine) {
      caja.append(h('p', null, 'Necesitás conexión para ingresar.'));
    } else {
      const lugar = h('div');
      caja.append(lugar);
      const montar = () => {
        if (!window.google || !google.accounts) { setTimeout(montar, 300); return; }
        google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: (r) => ingresar({ idToken: r.credential }) });
        google.accounts.id.renderButton(lugar, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'es' });
      };
      montar();
    }
    return caja;
  }

  async function ingresar(credencial) {
    U.errorIngreso = '';
    try {
      const d = await api('sesion.iniciar', {}, Object.assign({ accion: 'sesion.iniciar' }, credencial));
      if (S.usuario && S.usuario.email !== d.usuario.email && S.cola.length) {
        // Los cambios pendientes son de otra persona: no se pueden enviar a nombre de quien ingresa ahora.
        if (!confirm(`Hay ${S.cola.length} cambio(s) sin sincronizar de ${S.usuario.email}. Si continuás se descartan. ¿Continuar?`)) return;
        S.cola = [];
      }
      recibirTodo(d);
      U.sesionVencida = false;
      await guardarLocal();
      pintar(true);
      sincronizar();
    } catch (e) {
      U.errorIngreso = mensajeDe(e);
      pintar();
    }
  }

  async function salir() {
    if (S.cola.length && !confirm(`Hay ${S.cola.length} cambio(s) sin sincronizar que se van a perder. ¿Cerrar sesión igual?`)) return;
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    Object.assign(S, { sesion: null, usuario: null, cat: null, trabajos: [], pozos: [], cola: [], desde: null });
    Object.assign(U, { tab: 'inicio', vista: 'lista', gestion: null, usuarios: null, avisos: [], sesionVencida: false });
    archivos.forEach((p) => p.then((a) => URL.revokeObjectURL(a.url)).catch(() => {}));
    archivos.clear();
    await borrarLocal();
    pintar(true);
  }

  /* ---------- Inicio ---------- */

  function vistaInicio() {
    const sinSenal = !navigator.onLine;
    const pill = h('div', { class: 'pill' + (sinSenal || S.cola.length ? ' aviso' : '') },
      sinSenal ? 'Sin conexión' : U.sincronizando ? 'Sincronizando…' : S.cola.length ? `${S.cola.length} pendiente(s)` : 'Sincronizado');
    const lista = h('div', { class: 'lista', style: { padding: '10px 20px 24px' } });
    const nAccion = S.trabajos.filter(requiereMiAccion).length;

    function pintarLista() {
      const q = U.buscar.trim().toLowerCase();
      const rango = (t) => (requiereMiAccion(t) ? 0 : t.estado === 'en_curso' ? 1 : 2);
      const visibles = S.trabajos
        .filter((t) => U.filtro === 'todos' || estadoDe(t) === U.filtro)
        .filter((t) => !q || [t.pozo, t.tipo, t.cuadrilla, t.ot, t.detalle].some((v) => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => rango(a) - rango(b) || b.fecha.localeCompare(a.fecha) || b.inicio.localeCompare(a.inicio));
      lista.replaceChildren(...visibles.slice(0, 200).map(tarjetaTrabajo));
      if (!visibles.length) lista.append(h('div', { class: 'vacio centro' }, q ? 'Sin resultados para la búsqueda' : 'Sin trabajos en esta categoría'));
    }
    pintarLista();

    return [
      cabecera('SeaveApp', 'Yacimiento ' + CFG.YACIMIENTO, pill),
      S.cola.length > 0 && boton('banda sync', [h('span', null, `${S.cola.length} cambio(s) pendiente(s) de sincronizar`), h('b', null, 'Sincronizar')], sincronizar),
      U.avisos.map((a, i) => h('div', { class: 'banda error', role: 'alert' }, h('span', null, a),
        boton('x', '✕', () => { U.avisos.splice(i, 1); pintar(); }, { 'aria-label': 'Descartar aviso' }))),
      nAccion > 0 && h('div', { class: 'banda accion' },
        S.usuario.rol === 'encargado' ? `${nAccion} trabajo(s) esperando tu aprobación` : `${nAccion} trabajo(s) esperando aprobación mensual`),
      h('label', { class: 'buscar' }, icono('lupa'),
        h('input', { type: 'search', placeholder: 'Buscar pozo o trabajo', 'aria-label': 'Buscar pozo o trabajo', value: U.buscar,
          oninput: (e) => { U.buscar = e.target.value; pintarLista(); } })),
      h('div', { class: 'filtros' }, ['todos', 'pendiente', 'en_curso', 'completado', 'aprobado_supervisor'].map((f) =>
        boton('filtro' + (U.filtro === f ? ' activo' : ''), f === 'todos' ? 'Todos' : f === 'aprobado_supervisor' ? 'Aprobados' : ESTADO[f],
          () => { U.filtro = f; pintar(); }))),
      lista
    ];
  }

  /* ---------- Detalle ---------- */

  function volverDeDetalle() { U.vista = U.tab === 'pozos' ? 'trabajos' : 'lista'; U.selId = null; pintar(true); }

  function miniatura(id) {
    const caja = h('button', { type: 'button', class: 'foto', 'aria-label': 'Ver foto', onclick: () => abrirArchivo(id) }, 'cargando…');
    cargarArchivo(id).then((a) => caja.replaceChildren(h('img', { src: a.url, alt: 'Foto del trabajo' })))
      .catch(() => caja.replaceChildren(navigator.onLine ? 'no disponible' : 'sin conexión'));
    return caja;
  }

  function vistaDetalle() {
    const t = trabajoPorId(U.selId);
    if (!t) return [barraAtras('Detalle de trabajo', volverDeDetalle), h('div', { class: 'vacio centro' }, 'Este trabajo ya no está disponible.')];
    const kml = S.pozos.find((p) => p.pozo === t.pozo);
    const editable = !t.aprobado || esCertificador();
    const fotosCola = S.cola.filter((o) => o.k === 'adjunto' && o.trabajoId === t.id && o.clase === 'foto');
    const docsCola = S.cola.filter((o) => o.k === 'adjunto' && o.trabajoId === t.id && o.clase === 'documento');
    const dato = (k, v) => h('div', { class: 'dato' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
    const cambiar = (cambio) => () => encolar({ k: 'estado', id: t.id, cambio });

    return [
      barraAtras('Detalle de trabajo', volverDeDetalle),
      h('div', { class: 'seccion' },
        h('div', { class: 'tarjeta' },
          h('div', { class: 'trabajo', style: { padding: 0 } }, h('div', { class: 'arriba' },
            h('div', null, h('div', { style: { fontSize: '19px', fontWeight: 800 } }, t.pozo), h('div', { class: 'tipo', style: { fontSize: '14px' } }, t.tipo)),
            h('div', { class: 'derecha' }, chipEstado(t), h('div', { class: 'cuadrilla' }, t.cuadrilla)))),
          h('div', { class: 'datos' }, dato('Fecha', fechaCorta(t.fecha, true)), dato('Horario', horario(t)), dato('Cuadrilla', t.cuadrilla), dato('Servicio', t.servicio))),
        pendientesDe(t.id) && h('div', { class: 'nota' }, '● Tiene cambios pendientes de sincronizar'),
        t.integrantes.length > 0 && h('div', { class: 'tarjeta' }, h('div', { class: 'rotulo' }, 'Integrantes en el turno'), h('div', { class: 'parrafo' }, t.integrantes.join(', '))),
        kml && h('button', { type: 'button', class: 'tarjeta fila', onclick: () => abrirArchivo(kml.kmlId, kml.kmlNombre) },
          h('div', null, h('div', { class: 'rotulo' }, 'Ubicación (KML)'), h('div', { class: 'fuerte', style: { marginTop: '3px' } }, kml.kmlNombre)), icono('pin')),
        t.ot && h('div', { class: 'tarjeta fila' },
          h('div', null, h('div', { class: 'rotulo' }, 'Orden de trabajo operadora'), h('div', { class: 'fuerte mono', style: { marginTop: '3px', fontSize: '15px' } }, t.ot)), icono('hoja')),
        t.detalle && h('div', { class: 'tarjeta' }, h('div', { class: 'rotulo' }, 'Detalle del trabajo'), h('div', { class: 'parrafo' }, t.detalle)),
        h('div', { class: 'tarjeta' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, icono('escudo'), h('div', { class: 'rotulo' }, 'Notas HSE')),
          h('div', { class: 'parrafo' }, t.notas || 'Sin observaciones.')),
        h('div', { class: 'tarjeta' }, h('div', { class: 'rotulo', style: { marginBottom: '10px' } }, 'Fotos'),
          t.fotos.length + fotosCola.length === 0 ? h('div', { class: 'vacio' }, 'Sin fotos cargadas.')
            : h('div', { class: 'fotos' }, t.fotos.map(miniatura),
              fotosCola.map((o) => h('div', { class: 'foto' }, h('img', { src: `data:${o.mime};base64,${o.base64}`, alt: 'Foto pendiente de sincronizar' }))))),
        (t.documentos.length + docsCola.length > 0) && h('div', { class: 'tarjeta' }, h('div', { class: 'rotulo', style: { marginBottom: '10px' } }, 'OT / documentos de respaldo'),
          h('div', { class: 'lista junta' },
            t.documentos.map((id, i) => boton('btn gris chico', `Abrir documento ${i + 1}`, () => abrirArchivo(id))),
            docsCola.map(() => h('div', { class: 'vacio' }, '● Documento pendiente de sincronizar')))),

        editable && boton('btn borde', 'Editar trabajo', () => abrirFormulario(t)),
        !editable && h('div', { class: 'sello gris' }, 'Registro bloqueado — aprobado por supervisión'),
        editable && t.estado === 'pendiente' && boton('btn borde-verde', 'Iniciar trabajo', cambiar('iniciar')),
        editable && t.estado !== 'completado' && boton('btn verde', 'Marcar como completado', cambiar('completar')),
        t.estado === 'completado' && !t.aprobado && esValidador() && boton('btn borde-verde', 'Aprobar trabajo (supervisor)', cambiar('aprobar')),
        t.aprobado && h('div', { class: 'sello verde' }, '✓ Aprobado por supervisor'),
        t.aprobado && !t.aprobadoMensual && esCertificador() && boton('btn oscuro', 'Aprobar para detalle mensual', cambiar('aprobar_mensual')),
        t.aprobadoMensual && h('div', { class: 'sello oscuro' }, '✓ Sumado al detalle mensual del servicio'),
        esCertificador() && boton('btn peligro', 'Anular trabajo', () => {
          if (!confirm('¿Anular este trabajo? Deja de aparecer en la app y en los partes. Queda registrado en la planilla.')) return;
          volverDeDetalle();
          encolar({ k: 'estado', id: t.id, cambio: 'anular' });
        }))
    ];
  }

  /* ---------- Formulario ---------- */

  function integrantesDe(cuadrilla) {
    const c = S.cat.cuadrillas.find((x) => x.nombre === cuadrilla);
    return c ? [...c.integrantes] : [];
  }

  function abrirFormulario(t) {
    const cuadrilla = t ? t.cuadrilla : (S.cat.cuadrillas.some((c) => c.nombre === S.ultimaCuadrilla) ? S.ultimaCuadrilla : S.cat.cuadrillas[0].nombre);
    U.form = t
      ? { id: t.id, pozo: t.pozo, tipo: t.tipo, tipoOtro: '', fecha: t.fecha, inicio: t.inicio, fin: t.fin, cuadrilla, ot: t.ot || '',
        integrantes: [...t.integrantes], nuevo: '', detalle: t.detalle || '', notas: t.notas || '', fotos: [], docs: [], solape: false, error: '' }
      : { id: null, pozo: '', tipo: S.cat.tipos[0].tipo, tipoOtro: '', fecha: hoy(), inicio: '08:00', fin: '17:00', cuadrilla, ot: '',
        integrantes: integrantesDe(cuadrilla), nuevo: '', detalle: '', notas: '', fotos: [], docs: [], solape: false, error: '' };
    U.form.plantelDe = t ? '' : cuadrilla;
    U.tab = U.tab === 'pozos' ? 'pozos' : 'inicio';
    U.vista = 'form';
    pintar(true);
  }

  function solapeDe(f) {
    return S.trabajos.find((t) => t.id !== f.id && t.cuadrilla === f.cuadrilla && t.fecha === f.fecha && ctSeSuperponen(f.inicio, f.fin, t.inicio, t.fin)) || null;
  }

  let reconocimiento = null;
  function dictar(campo, btn, area) {
    if (reconocimiento) { reconocimiento.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { avisar('El dictado por voz no está disponible en este navegador.'); return; }
    const rec = new SR();
    rec.lang = 'es-AR'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => { U.form[campo] = (U.form[campo] ? U.form[campo] + ' ' : '') + e.results[0][0].transcript; area.value = U.form[campo]; };
    rec.onend = rec.onerror = () => { reconocimiento = null; btn.classList.remove('activo'); btn.lastChild.textContent = 'Dictar'; };
    reconocimiento = rec;
    btn.classList.add('activo'); btn.lastChild.textContent = 'Escuchando…';
    rec.start();
  }

  function vistaFormulario() {
    const f = U.form;
    const tiposBase = S.cat.tipos.map((x) => x.tipo);
    const tipos = [...new Set([...tiposBase, ...S.trabajos.map((t) => t.tipo), f.tipo].filter((x) => x && x !== '__otro__'))];
    const pozosConocidos = [...new Set([...S.trabajos.map((t) => t.pozo), ...S.pozos.map((p) => p.pozo)])].sort();
    const campo = (rotulo, control, extra) => h('label', { class: 'campo' }, h('div', { class: 'cab' }, h('span', { class: 'rotulo' }, rotulo), extra), control);
    const entrada = (clave, props) => h('input', Object.assign({ class: 'entrada', value: f[clave], oninput: (e) => { f[clave] = e.target.value; f.solape = false; pintarDerivados(); } }, props));

    const cajaDerivados = h('div', { class: 'lista' });
    const guardar = boton('btn verde', '', guardarFormulario);
    function pintarDerivados() {
      const servicio = ctServicioDe(f.cuadrilla, S.cat);
      const horas = ctHoras(f.inicio, f.fin, ctEs24h(servicio, S.cat));
      const ex = f.fecha ? ctExtras({ horas, servicio, fecha: f.fecha, inicio: f.inicio, fin: f.fin }, S.cat) : { normales: 0, extra50: 0, extra100: 0 };
      const choque = f.fecha ? solapeDe(f) : null;
      const kml = S.pozos.find((p) => p.pozo === f.pozo.trim());
      cajaDerivados.replaceChildren(
        h('div', { class: 'nota' }, `Horas computadas: ${horas} h · normales ${ex.normales} h · HE 50%: ${ex.extra50} h · HE 100%: ${ex.extra100} h`),
        ...(kml ? [h('div', { class: 'nota' }, 'Ubicación (KML): ' + kml.kmlNombre)] : []),
        ...(choque ? [h('div', { class: 'alerta', role: 'alert' }, h('div', { class: 'rotulo' }, '⚠ Superposición de horario'),
          h('p', null, `La cuadrilla ${choque.cuadrilla} ya tiene un trabajo cargado ese día en ${choque.pozo} de ${choque.inicio}–${choque.fin}. Revisá antes de guardar.`))] : []));
      guardar.textContent = f.solape ? 'Confirmar y guardar igual' : f.id ? 'Guardar cambios' : 'Guardar trabajo';
    }
    pintarDerivados();

    const areaDetalle = h('textarea', { class: 'entrada', rows: 3, maxlength: 1000, placeholder: 'Describí las particularidades de esta tarea', value: f.detalle, oninput: (e) => { f.detalle = e.target.value; } });
    const areaNotas = h('textarea', { class: 'entrada', rows: 3, maxlength: 1000, placeholder: 'Incidentes, observaciones de seguridad', value: f.notas, oninput: (e) => { f.notas = e.target.value; } });
    const btnDictar = (clave, area) => { const b = h('button', { type: 'button', class: 'dictar', onclick: (e) => { e.preventDefault(); dictar(clave, b, area); } }, icono('mic'), h('span', null, 'Dictar')); return b; };

    async function agregarArchivos(e, clase) {
      const elegidos = [...e.target.files];
      e.target.value = '';
      for (const a of elegidos) {
        try {
          if (clase === 'foto') f.fotos.push(await prepararFoto(a));
          else if (a.size > MAX_ADJUNTO) f.error = `"${a.name}" supera los 5 MB.`;
          else if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(a.type)) f.error = `"${a.name}" no es un PDF ni una imagen.`;
          else f.docs.push({ localId: uuid(), mime: a.type, base64: await leerBase64(a), nombre: a.name });
        } catch (err) { f.error = `No se pudo leer "${a.name}".`; }
      }
      pintar();
    }

    return [
      barraAtras(f.id ? 'Editar trabajo' : 'Nuevo trabajo', () => { U.vista = f.id ? 'detalle' : 'lista'; pintar(true); }),
      h('div', { class: 'seccion' },
        campo('Pozo / ubicación', entrada('pozo', { placeholder: 'ej. Pozo LL-14', maxlength: 80, list: 'pozos-conocidos', autocomplete: 'off' })),
        h('datalist', { id: 'pozos-conocidos' }, pozosConocidos.map((p) => h('option', { value: p }))),
        campo('Tipo de trabajo', h('select', { class: 'entrada', value: f.tipo, onchange: (e) => { f.tipo = e.target.value; pintar(); } },
          tipos.map((x) => h('option', { value: x }, x)), h('option', { value: '__otro__' }, '+ Otro (especificar)'))),
        f.tipo === '__otro__' && entrada('tipoOtro', { placeholder: 'Escribí el nuevo tipo de trabajo', maxlength: 80, 'aria-label': 'Nuevo tipo de trabajo' }),
        h('div', { class: 'fila-campos' },
          campo('Fecha', entrada('fecha', { type: 'date' })), campo('Inicio', entrada('inicio', { type: 'time' })), campo('Fin', entrada('fin', { type: 'time' }))),
        cajaDerivados,
        campo('Orden de trabajo operadora (opcional)', entrada('ot', { placeholder: 'ej. OT-88213', maxlength: 40 })),
        campo('Cuadrilla/operación', h('select', { class: 'entrada', value: f.cuadrilla, onchange: (e) => {
          f.cuadrilla = e.target.value; f.solape = false;
          // Si nadie tocó la lista, se reemplaza por el plantel de la cuadrilla elegida; si la editaron a mano, se respeta.
          if (!f.integrantes.length || f.integrantes.join('|') === integrantesDe(f.plantelDe).join('|')) {
            f.integrantes = integrantesDe(f.cuadrilla); f.plantelDe = f.cuadrilla;
          }
          pintar();
        } }, S.cat.cuadrillas.map((c) => h('option', { value: c.nombre }, c.nombre)))),
        h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Integrantes en este turno'),
          h('div', { class: 'integrantes' }, f.integrantes.map((n, i) => h('div', { class: 'integrante' }, n,
            boton('', '✕', () => { f.integrantes.splice(i, 1); pintar(); }, { 'aria-label': 'Quitar a ' + n })))),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('input', { class: 'entrada', style: { padding: '12px 14px', fontSize: '15px' }, placeholder: 'Agregar integrante', 'aria-label': 'Agregar integrante', maxlength: 60, value: f.nuevo,
              oninput: (e) => { f.nuevo = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarIntegrante(); } } }),
            boton('mini oscuro', 'Agregar', agregarIntegrante, { style: { padding: '12px 16px', borderRadius: '12px', fontSize: '13px' } }))),
        campo('Detalle del trabajo', areaDetalle, btnDictar('detalle', areaDetalle)),
        campo('Notas HSE', areaNotas, btnDictar('notas', areaNotas)),
        f.fotos.length > 0 && h('div', { class: 'fotos' }, f.fotos.map((foto, i) => h('div', { class: 'foto' },
          h('img', { src: `data:${foto.mime};base64,${foto.base64}`, alt: 'Foto a adjuntar' }),
          boton('quitar', '✕', () => { f.fotos.splice(i, 1); pintar(); }, { 'aria-label': 'Quitar foto' })))),
        h('label', { class: 'soltar' }, '+ Agregar foto', h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => agregarArchivos(e, 'foto') })),
        f.docs.map((d, i) => h('div', { class: 'tarjeta chica fila' }, h('span', { class: 'menor', style: { margin: 0, overflowWrap: 'anywhere' } }, d.nombre),
          boton('quitar-redondo', '✕', () => { f.docs.splice(i, 1); pintar(); }, { 'aria-label': 'Quitar documento' }))),
        h('label', { class: 'soltar' }, '+ Adjuntar OT / documento de respaldo', h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, onchange: (e) => agregarArchivos(e, 'documento') })),
        f.error && h('div', { class: 'error-campo', role: 'alert' }, f.error)),
      h('div', { class: 'pie' }, guardar)
    ];
  }

  function agregarIntegrante() {
    const n = U.form.nuevo.trim();
    if (!n) return;
    U.form.integrantes.push(n); U.form.nuevo = '';
    pintar();
  }

  async function guardarFormulario() {
    const f = U.form;
    const tipo = f.tipo === '__otro__' ? (f.tipoOtro.trim() || 'Otros') : f.tipo;
    f.error = !f.pozo.trim() ? 'Completá el pozo o la ubicación.' : !f.fecha ? 'Elegí la fecha.' : (!f.inicio || !f.fin) ? 'Completá el horario de inicio y de fin.' : '';
    if (f.error) { pintar(); return; }
    if (solapeDe(f) && !f.solape) { f.solape = true; pintar(); return; }
    if (f.nuevo.trim()) { f.integrantes.push(f.nuevo.trim()); f.nuevo = ''; }

    const id = f.id || uuid();
    S.ultimaCuadrilla = f.cuadrilla;
    U.selId = id; U.vista = f.id ? 'detalle' : 'lista'; U.form = null;
    await encolar({ k: 'guardar', id, trabajo: { pozo: f.pozo.trim(), tipo, fecha: f.fecha, inicio: f.inicio, fin: f.fin, cuadrilla: f.cuadrilla,
      ot: f.ot.trim(), integrantes: f.integrantes, detalle: f.detalle.trim(), notas: f.notas.trim() || 'Sin observaciones.' } });
    for (const a of [...f.fotos.map((x) => ['foto', x]), ...f.docs.map((x) => ['documento', x])]) {
      await encolar({ k: 'adjunto', trabajoId: id, clase: a[0], localId: a[1].localId, mime: a[1].mime, base64: a[1].base64 });
    }
    pintar(true);
  }

  /* ---------- Pozos ---------- */

  function vistaPozos() {
    const mapa = new Map();
    S.trabajos.forEach((t) => {
      const p = mapa.get(t.pozo) || { pozo: t.pozo, n: 0, ultima: '' };
      p.n += 1; if (t.fecha > p.ultima) p.ultima = t.fecha;
      mapa.set(t.pozo, p);
    });
    const pozos = [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
    return [
      cabecera('Historial por pozo', `${pozos.length} ubicaciones registradas`),
      h('div', { class: 'lista', style: { padding: '14px 20px 24px' } },
        pozos.map((p) => h('button', { type: 'button', class: 'tarjeta fila', style: { borderRadius: '14px', padding: '14px' }, onclick: () => { U.vista = 'trabajos'; U.pozoSel = p.pozo; pintar(true); } },
          h('div', null, h('div', { class: 'trabajo' , style: { padding: 0 } }, h('div', { class: 'pozo' }, p.pozo)), h('div', { class: 'menor', style: { fontWeight: 600 } }, `${p.n} trabajos · último ${fechaCorta(p.ultima)}`)),
          icono('ir'))),
        !pozos.length && h('div', { class: 'vacio centro' }, 'Todavía no hay trabajos cargados.'))
    ];
  }

  function vistaPozoTrabajos() {
    const lista = S.trabajos.filter((t) => t.pozo === U.pozoSel).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return [
      barraAtras(U.pozoSel, () => { U.vista = 'pozos'; U.pozoSel = null; pintar(true); }),
      h('div', { class: 'seccion', style: { gap: '10px' } }, lista.map((t) =>
        h('button', { type: 'button', class: 'tarjeta trabajo', onclick: () => abrirTrabajo(t.id) },
          h('div', { class: 'arriba' }, h('div', { class: 'pozo', style: { fontSize: '14.5px' } }, t.tipo), chipEstado(t)),
          h('div', { class: 'meta' }, h('span', null, fechaCorta(t.fecha)), h('span', null, `${t.horas} h`), h('span', null, t.cuadrilla)))))
    ];
  }

  /* ---------- Dashboard ---------- */

  function vistaDashboard() {
    const lunes = ctSumarDias(hoy(), -((ctDiaSemana(hoy()) + 6) % 7));
    const semana = S.trabajos.filter((t) => t.fecha >= lunes && t.fecha <= ctSumarDias(lunes, 6));
    const n = (estado) => semana.filter((t) => t.estado === estado).length;
    const horas = ctRedondear(semana.reduce((a, t) => a + t.horas, 0));
    const kpi = (valor, texto, color) => h('div', { class: 'kpi' }, h('div', { class: 'n', style: { color } }, valor), h('div', { class: 't' }, texto));
    const tramo = (cant, color) => cant > 0 && h('div', { style: { flex: String(cant), background: color } });
    const recientes = [...S.trabajos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.inicio.localeCompare(a.inicio)).slice(0, 4);
    return [
      cabecera('Dashboard', `Resumen de la semana · ${fechaCorta(lunes)} al ${fechaCorta(ctSumarDias(lunes, 6))}`),
      h('div', { class: 'kpis' }, kpi(n('completado'), 'Completados', 'var(--verde)'), kpi(n('en_curso'), 'En curso', 'var(--ambar)'), kpi(horas + 'h', 'Horas totales', 'var(--tinta-2)')),
      h('div', { style: { padding: '14px 20px' } }, h('div', { class: 'tarjeta' },
        h('div', { class: 'rotulo', style: { marginBottom: '12px' } }, 'Estado de trabajos'),
        h('div', { class: 'barra' }, tramo(n('completado'), 'var(--verde)'), tramo(n('en_curso'), 'oklch(60% 0.16 80)'), tramo(n('pendiente'), 'var(--linea)')),
        h('div', { class: 'leyenda' },
          h('span', null, h('i', { style: { background: 'var(--verde)' } }), `Completado (${n('completado')})`),
          h('span', null, h('i', { style: { background: 'oklch(60% 0.16 80)' } }), `En curso (${n('en_curso')})`),
          h('span', null, h('i', { style: { background: 'var(--linea)' } }), `Pendiente (${n('pendiente')})`)))),
      h('div', { style: { padding: '4px 20px 24px' } },
        h('div', { class: 'rotulo', style: { marginBottom: '8px' } }, 'Actividad reciente'),
        h('div', { class: 'lista junta' }, recientes.map((t) => h('button', { type: 'button', class: 'tarjeta chica fila', style: { padding: '11px 14px' }, onclick: () => abrirTrabajo(t.id) },
          h('div', null, h('div', { style: { fontSize: '13.5px', fontWeight: 700 } }, t.pozo), h('div', { class: 'menor', style: { marginTop: '1px' } }, t.tipo)), chipEstado(t))),
          !recientes.length && h('div', { class: 'vacio' }, 'Sin actividad todavía.')))
    ];
  }

  /* ---------- Reportes ---------- */

  async function emitir(tipo, clave) {
    if (U.ocupado) return;
    if (S.cola.length) { avisar('Sincronizá los cambios pendientes antes de emitir un parte.'); return; }
    U.ocupado = true;
    try {
      U.parte = await api('partes.emitir', tipo === 'mensual' ? { tipo, clave, desde: U.desde, hasta: U.hasta } : { tipo, clave, desde: U.dia });
      U.vista = 'parte';
    } catch (e) {
      avisar('No se pudo emitir el parte: ' + mensajeDe(e));
    } finally {
      U.ocupado = false;
      pintar(true);
    }
  }

  function exportarCsv() {
    // Un texto que empieza con = + - @ se abriría como fórmula en Excel: se neutraliza con un apóstrofo.
    const celda = (v) => { const s = String(v == null ? '' : v); return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; };
    const filas = [['Pozo', 'Tipo', 'Cuadrilla', 'Servicio', 'Fecha', 'Inicio', 'Fin', 'Horas', 'HE 50%', 'HE 100%', 'OT', 'Estado', 'Aprobado supervisor', 'Aprobado mensual']];
    S.trabajos.filter((t) => t.fecha >= U.desde && t.fecha <= U.hasta).forEach((t) => {
      const ex = ctExtras(t, S.cat);
      filas.push([t.pozo, t.tipo, t.cuadrilla, t.servicio, t.fecha, t.inicio, t.fin, String(t.horas).replace('.', ','), String(ex.extra50).replace('.', ','),
        String(ex.extra100).replace('.', ','), t.ot, ESTADO[t.estado], t.aprobado ? 'Sí' : 'No', t.aprobadoMensual ? 'Sí' : 'No']);
    });
    const blob = new Blob(['﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `seaveapp_${U.desde}_${U.hasta}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function cambiarPeriodo(clave, valor) {
    if (!valor) return;
    U[clave] = valor;
    pintar();
    if (U.desde < S.desde && navigator.onLine) {   // el período pedido es anterior a lo que hay en el teléfono
      try { await refrescar(); pintar(); } catch (e) { avisar('No se pudieron traer los trabajos de ese período: ' + mensajeDe(e)); }
    }
  }

  function vistaReportes() {
    const fechaChica = (clave) => h('input', { type: 'date', class: 'entrada chica', 'aria-label': clave, value: U[clave], onchange: (e) => cambiarPeriodo(clave, e.target.value) });
    const delDia = S.trabajos.filter((t) => t.fecha === U.dia && t.aprobado);
    const cuadrillasDia = [...new Set(delDia.map((t) => t.cuadrilla))];
    const mensuales = S.trabajos.filter((t) => t.aprobadoMensual && t.fecha >= U.desde && t.fecha <= U.hasta);
    const servicios = [...new Set(mensuales.map((t) => t.servicio))];
    const listos = S.trabajos.filter((t) => t.aprobado && !t.aprobadoMensual);
    const resumen = ctResumenMensual(S.trabajos, U.agrupar, U.desde, U.hasta, S.cat);
    const filaEmitir = (titulo, sub, mono, accion) => h('button', { type: 'button', class: 'tarjeta chica fila', onclick: accion, disabled: U.ocupado },
      h('div', { style: { minWidth: 0 } }, h('div', { style: { fontSize: '13.5px', fontWeight: 700 } }, titulo), h('div', { class: 'menor' + (mono ? ' mono' : ''), style: { fontSize: '11.5px' } }, sub)),
      h('span', { class: 'mini' }, 'Emitir parte'));

    return [
      cabecera('Reportes', 'Validación y cierre con operadora'),
      U.avisos.map((a, i) => h('div', { class: 'banda error', role: 'alert' }, h('span', null, a), boton('x', '✕', () => { U.avisos.splice(i, 1); pintar(); }, { 'aria-label': 'Descartar aviso' }))),
      esCertificador() && h('div', { style: { padding: '12px 20px 0' } },
        h('div', { class: 'rotulo', style: { marginBottom: '8px' } }, 'Parte diario por cuadrilla'),
        h('div', { class: 'tarjeta chica', style: { marginBottom: '10px' } }, fechaChica('dia')),
        h('div', { class: 'lista junta', style: { marginBottom: '14px' } },
          cuadrillasDia.map((c) => filaEmitir(c, `${delDia.filter((t) => t.cuadrilla === c).length} trabajo(s) aprobados ese día`, false, () => emitir('diario', c))),
          !cuadrillasDia.length && h('div', { class: 'vacio' }, 'Sin trabajos aprobados esa fecha.')),
        h('div', { class: 'rotulo', style: { marginBottom: '8px' } }, 'Parte mensual por servicio'),
        h('div', { class: 'tarjeta chica', style: { marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' } },
          fechaChica('desde'), h('span', { class: 'menor', style: { margin: 0, fontWeight: 700 } }, 'a'), fechaChica('hasta')),
        h('div', { class: 'lista junta', style: { marginBottom: '10px' } },
          servicios.map((s) => filaEmitir(s, 'Item ' + (ctCodigos(s, S.cat).normal || 'sin código'), true, () => emitir('mensual', s))),
          !servicios.length && h('div', { class: 'vacio' }, 'Sin trabajos con aprobación mensual en ese período.')),
        boton('btn oscuro', [icono('bajar'), 'Exportar reporte / KPIs'], exportarCsv)),

      h('div', { style: { padding: '14px 20px 6px' } },
        h('div', { class: 'rotulo', style: { marginBottom: '8px' } }, 'Listos para aprobación mensual'),
        h('div', { class: 'lista junta' },
          listos.map((t) => h('div', { class: 'tarjeta chica fila' },
            h('div', null, h('div', { style: { fontSize: '13.5px', fontWeight: 700 } }, t.pozo), h('div', { class: 'menor', style: { margin: 0 } }, `${t.tipo} · ${t.cuadrilla} · ${fechaCorta(t.fecha)}`)),
            esCertificador() && boton('mini oscuro', 'Aprobar', () => encolar({ k: 'estado', id: t.id, cambio: 'aprobar_mensual' })))),
          !listos.length && h('div', { class: 'vacio' }, 'Nada pendiente de aprobación mensual.'))),

      h('div', { style: { padding: '10px 20px 24px' } },
        h('div', { class: 'rotulo', style: { marginBottom: '8px' } }, `Detalle general del servicio · ${fechaCorta(U.desde)} al ${fechaCorta(U.hasta)}`),
        !esCertificador() && h('div', { class: 'tarjeta chica', style: { marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' } },
          fechaChica('desde'), h('span', { class: 'menor', style: { margin: 0, fontWeight: 700 } }, 'a'), fechaChica('hasta')),
        h('div', { class: 'segmentos', style: { marginBottom: '10px' } },
          [['cuadrilla', 'Por cuadrilla'], ['servicio', 'Por servicio']].map(([k, texto]) => boton(U.agrupar === k ? 'activo' : '', texto, () => { U.agrupar = k; pintar(); }))),
        h('div', { class: 'lista junta' },
          resumen.map((r) => h('div', { class: 'tarjeta chica', style: { display: 'flex', flexDirection: 'column', gap: '9px', padding: '13px 14px' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
              h('span', { style: { fontSize: '13.5px', fontWeight: 700 } }, r.key),
              h('span', { style: { flexShrink: 0, fontSize: '12px', fontWeight: 700, color: 'oklch(42% 0.006 90)' } }, `${r.horas} / ${r.optimas} h`)),
            h('div', { class: 'barra fina' },
              h('div', { style: { flex: String(Math.min(r.horas / (r.optimas || 1), 1)), background: r.desvio <= 0 ? 'var(--verde)' : 'oklch(60% 0.16 80)' } }),
              h('div', { style: { flex: String(Math.max(1 - r.horas / (r.optimas || 1), 0)) } })),
            h('div', { style: { fontSize: '11.5px', fontWeight: 700, color: 'var(--gris)' } }, `${r.count} trabajos · HE 50%: ${r.extra50} h · HE 100%: ${r.extra100} h`),
            r.desvio > 0 && h('div', { class: 'deficit' }, h('div', { class: 'rotulo' }, `Faltan ${r.desvio} h`),
              h('p', null, r.excepciones.length ? r.excepciones.join(' · ') : 'Sin excepciones registradas — desvío sin justificar')))),
          !resumen.length && h('div', { class: 'vacio' }, 'Sin trabajos con aprobación mensual en ese período.')))
    ];
  }

  function vistaParte() {
    const p = U.parte;
    const mensual = p.tipo === 'mensual';
    const num = (v, clase) => h('td', { class: clase || null }, String(v));
    return [
      barraAtras(mensual ? 'Parte mensual' : 'Parte diario', () => { U.vista = 'lista'; U.parte = null; pintar(true); }),
      h('div', { class: 'seccion', style: { gap: '12px' } },
        h('div', { id: 'parte-hoja' },
          h('div', { class: 'logo' }, h('img', { src: './assets/logo-seave.png', alt: 'Seave S.A.' })),
          h('div', { class: 'parte-cab' },
            h('div', { style: { minWidth: 0 } }, h('h2', null, p.clave),
              h('div', { class: 'menor', style: { fontWeight: 600, marginTop: '3px' } }, (mensual ? 'Parte mensual' : `Parte diario · ${p.servicio}`) + ` · Yacimiento ${CFG.YACIMIENTO}`)),
            h('div', { style: { flexShrink: 0, textAlign: 'right' } }, h('div', { class: 'parte-k' }, 'N° de parte'), h('div', { class: 'mono', style: { fontSize: '12.5px', fontWeight: 700, marginTop: '2px' } }, p.numero))),
          h('div', { class: 'parte-bloque parte-grilla' },
            h('span', { class: 'parte-k' }, 'Período'), h('span', null, mensual ? `${fechaCorta(p.desde, true)} al ${fechaCorta(p.hasta, true)}` : fechaCorta(p.desde, true)),
            h('span', { class: 'parte-k' }, mensual ? 'Cuadrillas' : 'Trabajos del día'),
            h('span', { style: { fontWeight: 600 } }, mensual ? (p.filas.length === 1 ? '1 cuadrilla afectada al servicio' : `${p.filas.length} cuadrillas afectadas al servicio`) : `${p.filas.length} registrados`)),
          h('div', { class: 'parte-bloque' }, h('span', { class: 'parte-k' }, 'Items a facturar (operadora)'),
            p.itemLines.map((l) => h('div', { class: 'parte-linea' }, h('span', null, l.label), h('span', { class: 'mono', style: { fontWeight: 700 } }, `Item ${l.code} · ${l.horas} h`))),
            !p.itemLines.length && h('div', { class: 'parte-linea' }, 'Sin código de item cargado para este servicio.')),
          mensual
            ? h('table', { class: 'parte-tabla' },
              h('thead', null, h('tr', null, ['Cuadrilla', 'Reg.', 'HE50', 'HE100', 'Desv.'].map((c) => h('th', { scope: 'col' }, c)))),
              h('tbody', null,
                p.filas.map((f) => [
                  h('tr', null, h('td', null, f.key), num(f.horas), num(f.extra50, 'he50'), num(f.extra100, 'he100'), num(f.desvio, 'he50')),
                  h('tr', { class: 'just' }, h('td', { colspan: 5 }, 'Justificación: ' + (f.excepciones.length ? f.excepciones.join(' · ') : '—')))]),
                h('tr', { class: 'total' }, h('td', null, `Total (${p.totalTrabajos} trabajos)`), num(p.totalHoras), num(p.totalExtra50, 'he50'), num(p.totalExtra100, 'he100'), num(p.totalDesvio, 'he50'))))
            : h('div', null,
              p.filas.map((f) => h('div', { class: 'parte-fila' },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--tinta)', fontWeight: 700 } },
                  h('span', { style: { fontSize: '13px' } }, f.pozo), h('span', { style: { fontSize: '12px', flexShrink: 0 } }, f.horario)),
                h('div', { style: { fontSize: '12px', color: 'oklch(40% 0.006 90)', fontWeight: 600 } }, `${f.cuadrilla} · ${f.tipo}`),
                h('div', null, `Ubicación: ${f.pozo} · OT/ref. cliente: ${f.ot || '—'}`),
                h('div', null, 'Integrantes: ' + (f.integrantes.length ? f.integrantes.join(', ') : 'sin registrar')),
                h('div', { class: 'he50', style: { fontSize: '11px', fontWeight: 700 } }, `Reg. ${f.horas} h · HE50 ${f.extra50} h · HE100 ${f.extra100} h`))),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', paddingTop: '10px', fontWeight: 800, fontSize: '12.5px' } },
                h('span', null, `Total del día (${p.totalTrabajos} trabajos)`), h('span', null, `${p.totalHoras} h`))),
          h('div', { class: 'firmas' },
            h('div', null, h('div', { class: 'linea' }), h('div', { class: 'quien' }, 'Líder de servicio'), h('div', { class: 'acl' }, `${p.emitidoPor} — ${ROL[p.emitidoPorRol] || ''}`)),
            h('div', null, h('div', { class: 'linea' }), h('div', { class: 'quien' }, 'Representante operadora'), h('div', { class: 'acl' }, 'Aclaración y sello'))),
          h('div', { class: 'parte-pie' }, `Emitido el ${fechaCorta(p.emitidoEl, true)}. El número de parte es único y no reutilizable.`)),
        boton('btn oscuro no-imprimir', [icono('imprimir'), 'Exportar a PDF / firmar'], () => window.print()))
    ];
  }

  /* ---------- Perfil y gestión ---------- */

  function vistaPerfil() {
    const mes = hoy().slice(0, 7);
    const filaIr = (texto, accion) => h('div', { style: { padding: '0 20px 16px' } }, h('button', { type: 'button', class: 'tarjeta fila', onclick: accion }, h('div', { class: 'fuerte' }, texto), icono('ir')));
    return [
      cabecera('Perfil', null, boton('', 'Cerrar sesión', salir, { style: { fontSize: '12.5px', fontWeight: 700, color: 'var(--rojo)' } })),
      h('div', { style: { padding: '16px 20px' } }, h('div', { class: 'tarjeta', style: { padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' } },
        h('div', { style: { width: '52px', height: '52px', borderRadius: '50%', background: 'oklch(93% 0.05 145)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: 'oklch(38% 0.13 145)', flexShrink: 0 } }, iniciales(S.usuario.nombre)),
        h('div', { style: { minWidth: 0 } }, h('div', { style: { fontSize: '16px', fontWeight: 700 } }, S.usuario.nombre),
          h('div', { class: 'menor', style: { fontSize: '13px' } }, ROL[S.usuario.rol]), h('div', { class: 'menor', style: { overflowWrap: 'anywhere' } }, S.usuario.email)))),
      h('div', { style: { padding: '0 20px 16px' } }, h('div', { class: 'tarjeta', style: { padding: 0, overflow: 'hidden', fontSize: '14px' } },
        h('div', { style: { padding: '14px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid oklch(90% 0.006 90)' } }, h('span', { style: { fontWeight: 700 } }, 'Yacimiento asignado'), h('span', { style: { color: 'oklch(42% 0.006 90)' } }, CFG.YACIMIENTO)),
        h('div', { style: { padding: '14px 16px', display: 'flex', justifyContent: 'space-between' } }, h('span', { style: { fontWeight: 700 } }, 'Trabajos este mes'), h('span', { style: { color: 'oklch(42% 0.006 90)' } }, S.trabajos.filter((t) => t.fecha.startsWith(mes)).length)))),
      esAdmin() && filaIr('Gestión de usuarios', () => { U.gestion = 'usuarios'; U.usuarios = null; pintar(true); cargarUsuarios(); }),
      esValidador() && filaIr('Ubicaciones de pozos (KML)', () => { U.gestion = 'kml'; pintar(true); }),
      h('div', { style: { padding: '0 20px 24px' } }, h('div', { class: 'tarjeta fila' },
        h('div', null, h('div', { class: 'fuerte' }, 'Sincronización'),
          h('div', { class: 'menor', style: { marginTop: '1px' } }, !navigator.onLine ? 'Sin conexión: lo que cargues se guarda en el teléfono' : S.cola.length ? `${S.cola.length} cambio(s) pendiente(s)` : 'Todo sincronizado')),
        boton('mini', U.sincronizando ? 'Sincronizando…' : 'Sincronizar', sincronizar, { disabled: U.sincronizando || !navigator.onLine })))
    ];
  }

  async function cargarUsuarios() {
    try { U.usuarios = await api('usuarios.listar'); } catch (e) { U.usuarios = []; avisar('No se pudo cargar la lista de usuarios: ' + mensajeDe(e)); }
    pintar();
  }

  let edicionUsuario = null;   // { email, nombre, rol, activo } en edición, o el alta en curso
  let altaUsuario = { email: '', nombre: '', rol: 'operario' };

  async function guardarUsuario(u) {
    try {
      await api('usuarios.guardar', u);
      edicionUsuario = null; altaUsuario = { email: '', nombre: '', rol: 'operario' };
      await cargarUsuarios();
    } catch (e) { avisar('No se pudo guardar el usuario: ' + mensajeDe(e)); }
  }

  function vistaUsuarios() {
    const selectRol = (obj) => h('select', { class: 'entrada chica', 'aria-label': 'Rol', value: obj.rol, onchange: (e) => { obj.rol = e.target.value; } }, Object.keys(ROL).map((r) => h('option', { value: r }, ROL[r])));
    return [
      barraAtras('Usuarios', () => { U.gestion = null; edicionUsuario = null; pintar(true); }),
      U.avisos.map((a, i) => h('div', { class: 'banda error', role: 'alert', style: { marginBottom: '10px' } }, h('span', null, a), boton('x', '✕', () => { U.avisos.splice(i, 1); pintar(); }, { 'aria-label': 'Descartar aviso' }))),
      h('div', { class: 'seccion', style: { gap: '8px', paddingBottom: '16px' } },
        U.usuarios === null && h('div', { class: 'vacio' }, 'Cargando…'),
        (U.usuarios || []).map((u) => (edicionUsuario && edicionUsuario.email === u.email)
          ? h('div', { class: 'tarjeta chica', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            h('div', { class: 'menor', style: { margin: 0 } }, u.email),
            h('input', { class: 'entrada chica', placeholder: 'Nombre y apellido', 'aria-label': 'Nombre y apellido', maxlength: 80, value: edicionUsuario.nombre, oninput: (e) => { edicionUsuario.nombre = e.target.value; } }),
            selectRol(edicionUsuario),
            h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', fontWeight: 600 } },
              h('input', { type: 'checkbox', checked: edicionUsuario.activo, onchange: (e) => { edicionUsuario.activo = e.target.checked; } }), 'Habilitado para ingresar'),
            h('div', { style: { display: 'flex', gap: '8px' } }, boton('btn verde chico', 'Guardar', () => guardarUsuario(edicionUsuario)), boton('btn gris chico', 'Cancelar', () => { edicionUsuario = null; pintar(); })))
          : h('button', { type: 'button', class: 'tarjeta chica fila', onclick: () => { edicionUsuario = Object.assign({}, u); pintar(); } },
            h('div', { style: { minWidth: 0 } }, h('div', { class: 'fuerte' }, u.nombre), h('div', { class: 'menor', style: { fontSize: '11px', overflowWrap: 'anywhere' } }, u.email + (u.activo ? '' : ' · deshabilitado'))),
            h('span', { class: 'cuadrilla', style: { fontWeight: 700, fontSize: '12px' } }, ROL[u.rol] || u.rol)))),
      h('div', { class: 'seccion', style: { gap: '10px', borderTop: '1.5px solid var(--linea-2)', paddingTop: '16px', paddingBottom: '24px' } },
        h('div', { class: 'rotulo' }, 'Nuevo usuario'),
        h('input', { class: 'entrada', type: 'email', placeholder: 'Correo de Google', 'aria-label': 'Correo de Google', maxlength: 254, autocomplete: 'off', value: altaUsuario.email, oninput: (e) => { altaUsuario.email = e.target.value; } }),
        h('input', { class: 'entrada', placeholder: 'Nombre y apellido', 'aria-label': 'Nombre y apellido', maxlength: 80, value: altaUsuario.nombre, oninput: (e) => { altaUsuario.nombre = e.target.value; } }),
        h('select', { class: 'entrada', 'aria-label': 'Rol', value: altaUsuario.rol, onchange: (e) => { altaUsuario.rol = e.target.value; } }, Object.keys(ROL).map((r) => h('option', { value: r }, ROL[r]))),
        boton('btn verde', 'Agregar usuario', () => guardarUsuario(Object.assign({ activo: true }, altaUsuario)), { style: { fontSize: '15px', padding: '14px' } }))
    ];
  }

  let altaKml = { pozo: '', archivo: null };

  function vistaKml() {
    const nombres = [...new Set(S.trabajos.map((t) => t.pozo))].sort();
    if (!altaKml.pozo || !nombres.includes(altaKml.pozo)) altaKml.pozo = nombres[0] || '';
    const guardar = async () => {
      const a = altaKml.archivo;
      if (!altaKml.pozo || !a) { avisar('Elegí el pozo y el archivo KML.'); return; }
      if (a.size > 2 * 1024 * 1024) { avisar('El archivo supera los 2 MB.'); return; }
      try {
        await api('pozos.guardarKml', { pozo: altaKml.pozo, nombre: a.name, base64: await leerBase64(a) });
        altaKml = { pozo: '', archivo: null };
        await refrescar();
      } catch (e) { avisar('No se pudo guardar la ubicación: ' + mensajeDe(e)); }
      pintar();
    };
    const quitar = async (pozo) => {
      if (!confirm(`¿Quitar la ubicación de ${pozo}?`)) return;
      try { await api('pozos.quitarKml', { pozo }); await refrescar(); } catch (e) { avisar('No se pudo quitar la ubicación: ' + mensajeDe(e)); }
      pintar();
    };
    return [
      barraAtras('Ubicaciones de pozos (KML)', () => { U.gestion = null; pintar(true); }),
      U.avisos.map((a, i) => h('div', { class: 'banda error', role: 'alert', style: { marginBottom: '10px' } }, h('span', null, a), boton('x', '✕', () => { U.avisos.splice(i, 1); pintar(); }, { 'aria-label': 'Descartar aviso' }))),
      h('div', { class: 'seccion', style: { gap: '8px', paddingBottom: '16px' } },
        S.pozos.map((p) => h('div', { class: 'tarjeta chica fila' },
          h('div', { style: { minWidth: 0 } }, h('div', { class: 'fuerte' }, p.pozo), h('div', { class: 'menor', style: { fontSize: '11.5px', overflowWrap: 'anywhere' } }, p.kmlNombre)),
          boton('quitar-redondo', '✕', () => quitar(p.pozo), { 'aria-label': 'Quitar ubicación de ' + p.pozo }))),
        !S.pozos.length && h('div', { class: 'vacio' }, 'Sin KML cargados todavía.')),
      h('div', { class: 'seccion', style: { gap: '10px', borderTop: '1.5px solid var(--linea-2)', paddingTop: '16px', paddingBottom: '24px' } },
        h('div', { class: 'rotulo' }, 'Asignar KML a un pozo'),
        h('select', { class: 'entrada', 'aria-label': 'Pozo', value: altaKml.pozo, onchange: (e) => { altaKml.pozo = e.target.value; } }, nombres.map((n) => h('option', { value: n }, n))),
        h('input', { class: 'entrada', style: { fontSize: '13px', padding: '12px 14px' }, type: 'file', accept: '.kml,.kmz', 'aria-label': 'Archivo KML', onchange: (e) => { altaKml.archivo = e.target.files[0] || null; } }),
        boton('btn verde', 'Guardar ubicación', guardar, { style: { fontSize: '15px', padding: '14px' }, disabled: !navigator.onLine }),
        !navigator.onLine && h('div', { class: 'vacio' }, 'Necesitás conexión para cargar ubicaciones.'))
    ];
  }

  /* ================= Armado general ================= */

  function pestanas() {
    const ir = (tab) => () => { U.tab = tab; U.vista = tab === 'pozos' ? 'pozos' : 'lista'; U.gestion = null; U.form = null; pintar(true); };
    const p = (tab, texto) => h('button', { type: 'button', class: U.tab === tab ? 'activo' : '', 'aria-current': U.tab === tab ? 'page' : null, onclick: ir(tab) }, icono('t_' + tab), h('span', null, texto));
    return h('nav', { class: 'pestanas', 'aria-label': 'Secciones' },
      p('inicio', 'Inicio'), p('pozos', 'Pozos'), p('dashboard', 'Dashboard'), esValidador() && p('reportes', 'Reportes'), p('perfil', 'Perfil'));
  }

  function contenido() {
    if (U.vista === 'detalle') return vistaDetalle();
    if (U.vista === 'form') return vistaFormulario();
    if (U.vista === 'parte' && U.parte) return vistaParte();
    if (U.tab === 'pozos') return U.vista === 'trabajos' ? vistaPozoTrabajos() : vistaPozos();
    if (U.tab === 'dashboard') return vistaDashboard();
    if (U.tab === 'reportes' && esValidador()) return vistaReportes();
    if (U.tab === 'perfil') return U.gestion === 'usuarios' && esAdmin() ? vistaUsuarios() : U.gestion === 'kml' && esValidador() ? vistaKml() : vistaPerfil();
    return vistaInicio();
  }

  // arriba = true cuando se cambia de pantalla; si no, se conserva la posición de lectura.
  function pintar(arriba) {
    const raiz = document.getElementById('app');
    if (!S.usuario || U.sesionVencida) { raiz.replaceChildren(vistaIngreso()); return; }
    const previa = raiz.querySelector('.pantalla');
    const scroll = previa && !arriba ? previa.scrollTop : 0;
    const activo = document.activeElement && document.activeElement.getAttribute('aria-label');
    const pantalla = h('main', { class: 'pantalla' + (U.vista === 'form' ? ' con-pie' : ''), style: { paddingBottom: U.vista === 'form' ? null : '96px' } }, contenido());
    raiz.replaceChildren(pantalla, pestanas(),
      U.tab === 'inicio' && U.vista === 'lista' && h('button', { type: 'button', class: 'fab', 'aria-label': 'Nuevo trabajo', onclick: () => abrirFormulario(null) }, icono('mas')));
    pantalla.scrollTop = scroll;
    if (activo && !arriba) { const el = raiz.querySelector(`[aria-label="${CSS.escape(activo)}"]`); if (el && el.tagName === 'INPUT') el.focus(); }
  }

  async function arrancar() {
    if (DEMO) await import('./dev-mock.js');
    const guardado = await leerLocal();
    if (guardado && guardado.sesion && guardado.usuario) Object.assign(S, guardado);
    pintar(true);
    window.addEventListener('online', () => { pintar(); sincronizar(); });
    window.addEventListener('offline', () => pintar());
    setInterval(() => { if (S.cola.length) sincronizar(); }, 60000);
    if ('serviceWorker' in navigator && !ES_LOCAL) navigator.serviceWorker.register('./sw.js').catch(() => {});
    sincronizar();   // envía lo pendiente y trae lo último del servidor
  }
  arrancar();
})();
