/**
 * Cálculo de horas y partes. Funciones puras, sin acceso a red ni a planillas.
 * ESTE ARCHIVO SE USA EN DOS LUGARES y debe mantenerse idéntico:
 *   backend/Calc.gs  (el servidor emite los partes con esto)
 *   app/calc.js      (la app muestra la vista previa con esto)
 *
 * cat = { feriados: ['AAAA-MM-DD'], servicios: { NOMBRE: { normal, he50, he100, movil, cf, es24h } },
 *         cuadrillas: [{ nombre, servicio, integrantes }], tipos: [{ tipo, esExcepcion }] }
 */

function ctRedondear(n) { return Math.round(n * 10) / 10; }

function ctMinutos(hhmm) {
  var p = String(hhmm || '').split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

function ctDiaSemana(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }

function ctSumarDias(iso, n) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ctServicioDe(cuadrilla, cat) {
  for (var i = 0; i < cat.cuadrillas.length; i++) {
    if (cat.cuadrillas[i].nombre === cuadrilla) return cat.cuadrillas[i].servicio;
  }
  return '';
}

function ctEs24h(servicio, cat) { return !!(cat.servicios[servicio] && cat.servicios[servicio].es24h); }

// Un turno que termina a la misma hora o antes de la que empieza cruza la medianoche.
// En servicios de 24 h, inicio = fin significa el día completo.
function ctHoras(inicio, fin, es24h) {
  var mins = ctMinutos(fin) - ctMinutos(inicio);
  if (mins === 0) return es24h ? 24 : 0;
  if (mins < 0) mins += 24 * 60;
  return ctRedondear(mins / 60);
}

function ctSolapeMin(aI, aF, bI, bF) { return Math.max(0, Math.min(aF, bF) - Math.max(aI, bI)); }

function ctSeSuperponen(aInicio, aFin, bInicio, bFin) {
  var aI = ctMinutos(aInicio), aF = ctMinutos(aFin), bI = ctMinutos(bInicio), bF = ctMinutos(bFin);
  if (aF <= aI) aF += 24 * 60;
  if (bF <= bI) bF += 24 * 60;
  return ctSolapeMin(aI, aF, bI, bF) > 0;
}

// Horario normal: lun a jue 8 a 17 (9 h), vie 8 a 16 (8 h). Fuera de eso es extra al 50 %.
// Sábado, domingo y feriado: todo al 100 %. Servicios de 24 h: 8 h normales y el resto al 50 %.
function ctExtras(t, cat) {
  var total = Number(t.horas) || 0;
  if (ctEs24h(t.servicio, cat)) {
    return { normales: Math.min(total, 8), extra50: ctRedondear(Math.max(total - 8, 0)), extra100: 0 };
  }
  var dow = ctDiaSemana(t.fecha);
  if (dow === 0 || dow === 6 || cat.feriados.indexOf(t.fecha) !== -1) {
    return { normales: 0, extra50: 0, extra100: ctRedondear(total) };
  }
  var ini = ctMinutos(t.inicio), fin = ctMinutos(t.fin);
  if (fin <= ini) fin += 24 * 60;
  var normalMin = ctSolapeMin(ini, fin, 8 * 60, (dow === 5 ? 16 : 17) * 60);
  return { normales: ctRedondear(normalMin / 60), extra50: ctRedondear(Math.max(fin - ini - normalMin, 0) / 60), extra100: 0 };
}

function ctHorasOptimas(servicio, desde, hasta, cat) {
  if (!desde || !hasta || hasta < desde) return 0;
  var total = 0, es24 = ctEs24h(servicio, cat);
  for (var d = desde; d <= hasta; d = ctSumarDias(d, 1)) {
    if (es24) { total += 24; continue; }
    var dow = ctDiaSemana(d);
    if (dow !== 0 && dow !== 6 && cat.feriados.indexOf(d) === -1) total += (dow === 5 ? 8 : 9);
  }
  return total;
}

function ctEsExcepcion(tipo, cat) {
  for (var i = 0; i < cat.tipos.length; i++) if (cat.tipos[i].tipo === tipo) return !!cat.tipos[i].esExcepcion;
  return false;
}

function ctCodigos(servicio, cat) {
  return cat.servicios[servicio] || { normal: '', he50: '', he100: '', movil: '', cf: '' };
}

function ctLineasItem(servicio, normales, extra50, extra100, cat) {
  var c = ctCodigos(servicio, cat);
  return [
    { label: 'Horas normales', code: c.normal, horas: ctRedondear(normales) },
    { label: 'Horas extra 50%', code: c.he50, horas: ctRedondear(extra50) },
    { label: 'Horas extra 100%', code: c.he100, horas: ctRedondear(extra100) }
  ].filter(function (l) { return l.horas > 0 && l.code; });
}

// Resumen del período agrupado por 'cuadrilla' o 'servicio', sobre trabajos con aprobación mensual.
function ctResumenMensual(trabajos, agrupar, desde, hasta, cat) {
  var mapa = {}, orden = [];
  trabajos.forEach(function (t) {
    if (!t.aprobadoMensual || t.fecha < desde || t.fecha > hasta) return;
    var k = t[agrupar];
    if (!mapa[k]) { mapa[k] = { key: k, count: 0, horas: 0, extra50: 0, extra100: 0, excepciones: [] }; orden.push(k); }
    var ex = ctExtras(t, cat), r = mapa[k];
    r.count += 1; r.horas += Number(t.horas) || 0; r.extra50 += ex.extra50; r.extra100 += ex.extra100;
    if (ctEsExcepcion(t.tipo, cat)) r.excepciones.push(t.tipo + ' (' + t.horas + ' h)');
  });
  return orden.map(function (k) {
    var r = mapa[k];
    var servicio = agrupar === 'servicio' ? k : ctServicioDe(k, cat);
    var optimas = ctHorasOptimas(servicio, desde, hasta, cat);
    r.horas = ctRedondear(r.horas); r.extra50 = ctRedondear(r.extra50); r.extra100 = ctRedondear(r.extra100);
    r.optimas = optimas; r.desvio = ctRedondear(optimas - r.horas);
    return r;
  });
}

function ctParteMensual(trabajos, servicio, desde, hasta, cat) {
  var delServicio = trabajos.filter(function (t) { return t.servicio === servicio; });
  var filas = ctResumenMensual(delServicio, 'cuadrilla', desde, hasta, cat);
  var suma = function (campo) { return ctRedondear(filas.reduce(function (a, r) { return a + r[campo]; }, 0)); };
  var horas = suma('horas'), e50 = suma('extra50'), e100 = suma('extra100');
  return {
    tipo: 'mensual', clave: servicio, servicio: servicio, desde: desde, hasta: hasta, filas: filas,
    itemLines: ctLineasItem(servicio, horas - e50 - e100, e50, e100, cat),
    totalHoras: horas, totalExtra50: e50, totalExtra100: e100, totalDesvio: suma('desvio'),
    totalTrabajos: filas.reduce(function (a, r) { return a + r.count; }, 0)
  };
}

function ctParteDiario(trabajos, cuadrilla, fecha, cat) {
  var servicio = ctServicioDe(cuadrilla, cat);
  var filas = trabajos.filter(function (t) { return t.aprobado && t.cuadrilla === cuadrilla && t.fecha === fecha; })
    .map(function (t) {
      var ex = ctExtras(t, cat);
      return { pozo: t.pozo, tipo: t.tipo, cuadrilla: t.cuadrilla, horario: t.inicio + '–' + t.fin, ot: t.ot || '',
        integrantes: t.integrantes || [], horas: t.horas, extra50: ex.extra50, extra100: ex.extra100 };
    });
  var suma = function (campo) { return ctRedondear(filas.reduce(function (a, r) { return a + r[campo]; }, 0)); };
  var horas = suma('horas'), e50 = suma('extra50'), e100 = suma('extra100');
  return {
    tipo: 'diario', clave: cuadrilla, servicio: servicio, desde: fecha, hasta: fecha, filas: filas,
    itemLines: ctLineasItem(servicio, horas - e50 - e100, e50, e100, cat),
    totalHoras: horas, totalExtra50: e50, totalExtra100: e100, totalTrabajos: filas.length
  };
}
