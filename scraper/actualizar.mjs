// Lector de basketaraba.com (Federación Alavesa de Baloncesto) para MiniBasket Álava.
// Genera los JSON estáticos que la app espera en api/v1/ dentro de la carpeta de salida.
// Uso: node scraper/actualizar.mjs [carpetaSalida]     (por defecto: dist)
// Pruebas sin red: MUESTRAS=carpeta  -> lee calendario-<g>.html y clasificaciones-<g>.html de ahí.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'dist'));
const API = path.join(SALIDA, 'api', 'v1');
const BASE = 'https://basketaraba.com/es/fab-online/';
const URL_CAL = g => `${BASE}calendario-y-resultados-federacion-alavesa-de-baloncesto?grupo=${g}`;
const URL_CLA = g => `${BASE}clasificaciones-federacion-alavesa-de-baloncesto?grupo=${g}`;
const PAUSA_MS = 1500;
const MUESTRAS = process.env.MUESTRAS;

const config = JSON.parse(await fs.readFile(path.join(RAIZ, 'config.json'), 'utf8'));
const semilla = JSON.parse(await fs.readFile(path.join(RAIZ, 'scraper', 'semilla.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- utilidades HTML ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', ordf: 'ª', ordm: 'º' };
function texto(html) {
  return html
    .replace(/<span class=['"]tit-mobil['"]>.*?<\/span>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ')
    .trim();
}
const tablas = html => [...html.matchAll(/<table\b[^>]*>(.*?)<\/table>/gs)].map(m => m[1]);
const filas = t => [...t.matchAll(/<tr class=['"]tm-body['"][^>]*>(.*?)<\/tr>/gs)].map(m => m[1]);
const celdas = f => [...f.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map(m => texto(m[1]));
const cabecera = t => [...t.matchAll(/<th\b[^>]*>(.*?)<\/th>/gs)].map(m => texto(m[1]));

function hashId(s, base = 1_000_000) {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return base + (h % 900_000_000);
}
const norm = s => s.trim().toUpperCase();
const esDescanso = n => norm(n) === 'DESCANSA';

// ---------- descarga ----------
async function obtener(url, muestra) {
  if (MUESTRAS) return fs.readFile(path.join(MUESTRAS, muestra), 'utf8');
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'MiniBasketAlava/1.0 (lector personal; consultas poco frecuentes)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      await sleep(PAUSA_MS);
      return t;
    } catch (e) {
      if (intento >= 3) throw new Error(`${url}: ${e.message}`);
      await sleep(5000 * intento);
    }
  }
}

// ---------- lectores ----------
function leerTituloGrupo(html, codigo) {
  const m = html.match(/<p class=['"]tit-equipo['"]>(.*?)<\/p>/s);
  const t = m ? texto(m[1]) : '';
  const nm = t.match(/GRUPO:\s*(\d+)\s+(.*)/);
  if (!nm || nm[1] !== codigo) throw new Error(`Grupo ${codigo}: no encuentro el título del grupo (¿ha cambiado la web?)`);
  return nm[2].trim();
}

function leerCalendario(html, codigo) {
  const nombre = leerTituloGrupo(html, codigo);
  const ts = tablas(html);
  const tEquipos = ts.find(t => cabecera(t).includes('Nombre') && cabecera(t).includes('Club'));
  if (!tEquipos) throw new Error(`Grupo ${codigo}: no encuentro la tabla de equipos`);
  const equipos = filas(tEquipos).map(f => {
    const [nombreEq, club, , campo] = celdas(f);
    return { nombre: nombreEq, club, campo: campo && campo !== '-' ? campo : '' };
  });
  const jornadas = [];
  for (const t of ts) {
    const cab = cabecera(t);
    const mj = cab[0]?.match(/Jornada\s+(\d+)/i);
    if (!mj) continue;
    const numero = +mj[1];
    const md = (cab[2] || '').match(/(\d{2})-(\d{2})-(\d{4})/);
    const fecha = md ? `${md[3]}-${md[2]}-${md[1]}` : '';
    const partidos = filas(t).map(f => {
      const [local, marcador, visitante] = celdas(f);
      const ms = (marcador || '').match(/(\d+)\s*[–-]\s*(\d+)/);
      const aplazado = /aplaz/i.test(marcador || '');
      return { local, visitante, puntosLocal: ms ? +ms[1] : null, puntosVisitante: ms ? +ms[2] : null,
               estado: ms ? 'JUGADO' : aplazado ? 'APLAZADO' : 'PROGRAMADO' };
    });
    jornadas.push({ numero, fecha, partidos });
  }
  if (!jornadas.length) throw new Error(`Grupo ${codigo}: no encuentro jornadas`);
  return { nombre, equipos, jornadas };
}

function leerClasificacion(html, codigo) {
  leerTituloGrupo(html, codigo);
  const t = tablas(html).find(t => cabecera(t).includes('Puesto'));
  if (!t) throw new Error(`Grupo ${codigo}: no encuentro la tabla de clasificación`);
  const cab = cabecera(t);
  const col = n => cab.indexOf(n);
  const num = v => (v === '' || v == null ? 0 : +v);
  return filas(t).map(f => {
    const c = celdas(f);
    return { posicion: num(c[col('Puesto')]), equipo: c[col('Equipo')], J: num(c[col('J')]), G: num(c[col('G')]),
             P: num(c[col('P')]), TF: num(c[col('TF')]), TC: num(c[col('TC')]), puntos: num(c[col('Puntos')]) };
  });
}

// ---------- principal ----------
const catsSemilla = semilla.categorias;
const infoGrupoSemilla = {};
for (const c of catsSemilla) for (const g of c.grupos) infoGrupoSemilla[g.codigo] = { ...g, categoria: c };

const idEquipo = (grupo, nombre) => semilla.equipos[`${grupo}|${norm(nombre)}`] ?? hashId(`eq|${grupo}|${norm(nombre)}`);

const ahora = new Date();
const anio = ahora.getMonth() >= 7 ? ahora.getFullYear() : ahora.getFullYear() - 1;
const temporada = { id: 1, nombre: `${anio}-${anio + 1}`, anioInicio: anio };

const resultado = { categorias: new Map(), equipos: [] };
const errores = [];

for (const codigo of config.grupos) {
  try {
    console.log(`Grupo ${codigo}...`);
    const cal = leerCalendario(await obtener(URL_CAL(codigo), `calendario-${codigo}.html`), codigo);
    const cla = leerClasificacion(await obtener(URL_CLA(codigo), `clasificaciones-${codigo}.html`), codigo);

    const sem = infoGrupoSemilla[codigo];
    const cat = sem?.categoria ?? { id: hashId(`cat|${cal.nombre}`, 1000), codigo: codigo.slice(0, 2), genero: '', nombre: cal.nombre, grupos: [] };
    const grupo = { id: sem?.id ?? hashId(`gr|${codigo}`, 1000), codigo, nombre: sem?.nombre ?? cal.nombre,
                    tipo: sem?.tipo ?? (/COPA/i.test(cal.nombre) ? 'COPA' : 'LIGA') };
    if (!resultado.categorias.has(cat.id)) resultado.categorias.set(cat.id, { id: cat.id, codigo: cat.codigo, genero: cat.genero, nombre: cat.nombre, grupos: [] });
    resultado.categorias.get(cat.id).grupos.push(grupo);

    const campoDe = Object.fromEntries(cal.equipos.map(e => [norm(e.nombre), e.campo]));
    const partidos = cal.jornadas.map(j => ({
      fecha: j.fecha, numero: j.numero, id: hashId(`jor|${codigo}|${j.numero}`, 1000),
      partidos: j.partidos.map(p => {
        const campo = campoDe[norm(p.local)] || '';
        return {
          id: hashId(`par|${codigo}|${j.numero}|${norm(p.local)}|${norm(p.visitante)}`, 1000),
          estado: p.estado, fecha: j.fecha, hora: '',
          localId: idEquipo(codigo, p.local), localNombre: p.local,
          visitanteId: idEquipo(codigo, p.visitante), visitanteNombre: p.visitante,
          puntosLocal: p.puntosLocal, puntosVisitante: p.puntosVisitante,
          campo, campoNombre: campo || null,
          esDescanso: esDescanso(p.local) || esDescanso(p.visitante),
        };
      }),
    }));
    const clasificacion = cla.filter(r => !esDescanso(r.equipo)).map(r => ({
      posicion: r.posicion, equipoId: idEquipo(codigo, r.equipo), equipoNombre: r.equipo,
      partidosJugados: r.J, partidosGanados: r.G, partidosPerdidos: r.P,
      puntosFavor: r.TF, puntosContra: r.TC, diferenciaPuntos: r.TF - r.TC, puntos: r.puntos,
    }));

    await escribir(`grupos/${codigo}/partidos.json`, partidos);
    await escribir(`grupos/${codigo}/clasificacion.json`, clasificacion);
    for (const e of cal.equipos.filter(e => !esDescanso(e.nombre))) {
      resultado.equipos.push({ equipoId: idEquipo(codigo, e.nombre), equipoNombre: e.nombre, clubNombre: e.club,
        categoriaId: cat.id, categoriaNombre: cat.nombre, grupoId: grupo.id, grupoCodigo: codigo, grupoNombre: grupo.nombre });
    }
    console.log(`  ${cal.equipos.length} equipos, ${partidos.length} jornadas, ${clasificacion.length} en clasificación`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    errores.push(`${codigo}: ${e.message}`);
  }
}

if (errores.length === config.grupos.length) {
  console.error('\nNingún grupo se ha podido leer. No se publica nada (se mantiene la versión anterior).');
  process.exit(1);
}

const categorias = [...resultado.categorias.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
await escribir('temporadas/actual.json', temporada);
await escribir('categorias.json', categorias);
for (const c of categorias) {
  await escribir(`categorias/${c.id}/grupos.json`, c.grupos.map(g => ({ ...g, categoriaId: c.id, categoriaNombre: c.nombre })));
}
await escribir('equipos.json', { equipos: resultado.equipos });
await escribir('estado.json', { actualizado: ahora.toISOString(), grupos: config.grupos, errores });
console.log(`\nListo en ${SALIDA}${errores.length ? ` (con ${errores.length} errores)` : ''}`);
// Un grupo fallido no bloquea la publicación del resto; se avisa en GitHub Actions.
for (const e of errores) console.log(`::warning::${e}`);

async function escribir(rel, datos) {
  const f = path.join(API, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(datos));
}
