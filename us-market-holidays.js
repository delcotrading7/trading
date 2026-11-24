/* ══════════════════════════════════════════════════════════════
   FERIADOS DEL MERCADO DE EE.UU. (NYSE / Nasdaq) — calculados por reglas
   - No es una lista fija: cada año se calcula con las reglas de abajo.
     Para ampliar el rango, cambiar HOLIDAYS_UNTIL_YEAR.
   - Son feriados "virtuales": se calculan al dibujar el calendario. Este
     archivo NO lee ni escribe datos del journal ni de la base de datos.
   - Si el día ya tiene algo cargado por el usuario (resultado, notas,
     capturas, MT/NE, estrategia, revisado), manda lo cargado y el
     feriado automático no se muestra.
   - Además de los feriados (mercado cerrado todo el día) marca los días
     de cierre anticipado a la 1 pm y los de baja actividad (ver
     usMarketShortDays más abajo).
   - NO cubre cierres extraordinarios (por ejemplo, un duelo nacional).
══════════════════════════════════════════════════════════════ */
const HOLIDAYS_FROM       = '2026-11-24';   // primer día en que se marcan
const HOLIDAYS_UNTIL_YEAR = 2036;           // último año en que se marcan

function _hKey(y, m, d) {                    // m: 0-11
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function _hNthWeekday(y, m, weekday, n) {    // n-ésimo día de semana del mes (weekday 0=Dom)
  const first = new Date(y, m, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
function _hLastWeekday(y, m, weekday) {      // último día de semana del mes
  const last = new Date(y, m + 1, 0);
  return last.getDate() - ((last.getDay() - weekday + 7) % 7);
}
/* Domingo de Pascua (gregoriana), algoritmo de Gauss / Meeus (Anonymous). */
function usEasterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);     // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
/* Feriado de fecha fija con corrimiento: sábado → viernes, domingo → lunes */
function _hObserved(y, m, d) {
  const dow = new Date(y, m, d).getDay();
  const dt = new Date(y, m, d + (dow === 6 ? -1 : dow === 0 ? 1 : 0));
  return _hKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/* Lista de cierres completos de un año: [{ key:'AAAA-MM-DD', name }] ordenada */
function usMarketHolidays(y) {
  const out = [];
  // Año Nuevo: domingo → lunes 2; sábado → NO se cierra el viernes 31 (cierre contable)
  const nyDow = new Date(y, 0, 1).getDay();
  if (nyDow === 0) out.push({ key: _hKey(y, 0, 2), name: "New Year's Day" });
  else if (nyDow !== 6) out.push({ key: _hKey(y, 0, 1), name: "New Year's Day" });
  out.push({ key: _hKey(y, 0, _hNthWeekday(y, 0, 1, 3)), name: 'Martin Luther King Jr. Day' });
  out.push({ key: _hKey(y, 1, _hNthWeekday(y, 1, 1, 3)), name: "Presidents' Day" });
  const easter = usEasterSunday(y);
  const gf = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  out.push({ key: _hKey(gf.getFullYear(), gf.getMonth(), gf.getDate()), name: 'Good Friday' });
  out.push({ key: _hKey(y, 4, _hLastWeekday(y, 4, 1)), name: 'Memorial Day' });
  out.push({ key: _hObserved(y, 5, 19), name: 'Juneteenth' });
  out.push({ key: _hObserved(y, 6, 4), name: 'Independence Day' });
  out.push({ key: _hKey(y, 8, _hNthWeekday(y, 8, 1, 1)), name: 'Labor Day' });
  out.push({ key: _hKey(y, 10, _hNthWeekday(y, 10, 4, 4)), name: 'Thanksgiving' });
  out.push({ key: _hObserved(y, 11, 25), name: 'Christmas' });
  return out.sort((a, b) => a.key < b.key ? -1 : 1);
}

/* Días con mercado abierto pero que conviene marcar igual (se muestran como
   el Día Feriado y tampoco cuentan como días operados):
   - Cierre anticipado a la 1 pm (reglas de NYSE):
       · día después de Thanksgiving (viernes);
       · 24 de diciembre, si es de lunes a viernes y no es el feriado de Navidad;
       · 3 de julio, si es de lunes a jueves (si es viernes, ese día es el feriado).
   - Baja actividad: 31 de diciembre (si es de lunes a viernes).
   Para agregar otro día de baja actividad, sumarlo en la lista de abajo. */
function usMarketShortDays(y) {
  const out = [];
  const full = new Set(usMarketHolidays(y).map(h => h.key));
  const weekday = (m, d) => { const w = new Date(y, m, d).getDay(); return w >= 1 && w <= 5; };
  const jul3 = new Date(y, 6, 3).getDay();
  if (jul3 >= 1 && jul3 <= 4) out.push({ key: _hKey(y, 6, 3), name: 'Day before Independence Day', type: 'early' });
  out.push({ key: _hKey(y, 10, _hNthWeekday(y, 10, 4, 4) + 1), name: 'Day after Thanksgiving', type: 'early' });
  if (weekday(11, 24) && !full.has(_hKey(y, 11, 24))) out.push({ key: _hKey(y, 11, 24), name: 'Christmas Eve', type: 'early' });
  if (weekday(11, 31) && !full.has(_hKey(y, 11, 31))) out.push({ key: _hKey(y, 11, 31), name: "New Year's Eve", type: 'quiet' });
  return out.sort((a, b) => a.key < b.key ? -1 : 1);
}
const US_DAY_LABELS = { holiday: 'Día feriado', early: 'Cierre 1 pm', quiet: 'Baja actividad' };

const _usHolidayCache = {};
const _usDayInfoCache = {};
/* Info del día dentro del rango: { type:'holiday'|'early'|'quiet', name, label } o null */
function usMarketDayInfo(key) {
  if (!key || key < HOLIDAYS_FROM) return null;
  const y = Number(key.slice(0, 4));
  if (!(y <= HOLIDAYS_UNTIL_YEAR)) return null;
  if (!_usDayInfoCache[y]) {
    _usDayInfoCache[y] = {};
    usMarketHolidays(y).forEach(h => { _usDayInfoCache[y][h.key] = { type: 'holiday', name: h.name, label: US_DAY_LABELS.holiday }; });
    usMarketShortDays(y).forEach(h => { _usDayInfoCache[y][h.key] = { type: h.type, name: h.name, label: US_DAY_LABELS[h.type] }; });
  }
  return _usDayInfoCache[y][key] || null;
}
/* Día especial automático (feriado, cierre 1 pm o baja actividad), solo si
   el día no tiene datos del usuario */
function usAutoMarketDay(key, d) {
  return usDayHasUserData(d) ? null : usMarketDayInfo(key);
}
/* Nombre del feriado de ese día (dentro del rango), o null */
function usMarketHolidayName(key) {
  if (!key || key < HOLIDAYS_FROM) return null;
  const y = Number(key.slice(0, 4));
  if (!(y <= HOLIDAYS_UNTIL_YEAR)) return null;
  if (!_usHolidayCache[y]) {
    _usHolidayCache[y] = {};
    usMarketHolidays(y).forEach(h => { _usHolidayCache[y][h.key] = h.name; });
  }
  return _usHolidayCache[y][key] || null;
}
/* ¿El usuario cargó algo en ese día? */
function usDayHasUserData(d) {
  if (!d) return false;
  return !!(d.mainResult || d.ne || d.lt || d.reviewed ||
    (d.trades && d.trades.length) ||
    (d.missedOps && d.missedOps.length) ||
    (d.contextNote && String(d.contextNote).trim()) ||
    (d.contextPhotos && d.contextPhotos.length) ||
    (d.photos && d.photos.length) ||
    (d.estrategiaCumplida !== null && d.estrategiaCumplida !== undefined));
}
/* Feriado automático: nombre si es feriado y el día no tiene datos del usuario */
function usAutoHoliday(key, d) {
  return usDayHasUserData(d) ? null : usMarketHolidayName(key);
}
