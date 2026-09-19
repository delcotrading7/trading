// Netlify Function: share-day
//
// Puerta de entrada segura para los links de "Compartir día" del Trading
// Journal. La abre cualquiera (sin login) al entrar a compartir.html?token=...
//
// GET  → devuelve los datos del día (y, si el link es de "edición", los
//        comentarios/dibujos ya guardados por mentores anteriores).
// POST → guarda un comentario o un dibujo nuevo (solo si el link es de
//        "edición"). Cada guardado es una FILA NUEVA — nunca pisa lo que
//        ya había, así se van acumulando aunque varias personas usen el
//        mismo link en momentos distintos.
//
// Usa la SUPABASE_SERVICE_ROLE_KEY (clave maestra) que vive SOLO acá, como
// variable de entorno en Netlify — nunca en el HTML público. Esta función es
// la única que puede saltarse el RLS para ir a buscar/escribir el día
// puntual que corresponde a un token válido, sin exponer el resto de los
// datos del dueño.
//
// Configuración necesaria en Netlify (Site settings → Environment variables):
//   SUPABASE_URL              = https://cghzxjyhabaxknjregvo.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (la "service_role" key del dashboard de Supabase)

const PHOTOS_BUCKET = 'journal-photos';
const MAX_BODY_BYTES = 5.5 * 1024 * 1024; // margen bajo el límite de 6MB de Netlify
const MAX_COMMENT_LEN = 2000;
const MAX_NAME_LEN = 60;

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('share-day: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Netlify');
    return json(500, { error: 'El servidor no está configurado todavía. Avisale a Benja.' });
  }
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'GET') return handleGet(event, SUPABASE_URL, headers);
  if (event.httpMethod === 'POST') return handlePost(event, SUPABASE_URL, headers);
  return json(405, { error: 'Método no permitido.' });
};

/* ── Buscar y validar el link por token ──────────────────────── */
async function getValidLink(token, SUPABASE_URL, headers) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/shared_links?token=eq.' + encodeURIComponent(token) + '&select=*',
    { headers }
  );
  if (!res.ok) throw new Error('No se pudo consultar el link (' + res.status + ')');
  const rows = await res.json();
  const link = Array.isArray(rows) ? rows[0] : null;
  if (!link) return { error: json(404, { error: 'Este link no existe o ya no está disponible.' }) };
  if (link.revoked) return { error: json(410, { error: 'Este link fue revocado por el dueño del journal.' }) };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { error: json(410, { error: 'Este link venció.' }) };
  }
  link.source_table = link.source_table === 'fondeo_days' ? 'fondeo_days' : 'practica_days';
  return { link };
}

/* ── GET: día + (si es edición) anotaciones previas ──────────── */
async function handleGet(event, SUPABASE_URL, headers) {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return json(400, { error: 'Falta el token del link.' });

  try {
    const { link, error } = await getValidLink(token, SUPABASE_URL, headers);
    if (error) return error;

    const dayRes = await fetch(
      SUPABASE_URL + '/rest/v1/' + link.source_table +
        '?user_id=eq.' + encodeURIComponent(link.owner_id) +
        '&day=eq.' + encodeURIComponent(link.day_key) +
        '&select=*',
      { headers }
    );
    if (!dayRes.ok) throw new Error('No se pudo consultar el día (' + dayRes.status + ')');
    const days = await dayRes.json();
    const day = Array.isArray(days) ? days[0] : null;
    if (!day) return json(404, { error: 'No se encontraron datos para este día.' });

    const contextPhotos = Array.isArray(day.context_photos) ? day.context_photos : [];
    const photos = Array.isArray(day.photos) ? day.photos : [];
    const photoPaths = [...contextPhotos, ...photos].map((p) => p && p.path).filter(Boolean);

    let annotations = [];
    if (link.permission === 'edit') {
      const annRes = await fetch(
        SUPABASE_URL + '/rest/v1/shared_annotations' +
          '?owner_id=eq.' + encodeURIComponent(link.owner_id) +
          '&source_table=eq.' + encodeURIComponent(link.source_table) +
          '&day_key=eq.' + encodeURIComponent(link.day_key) +
          '&select=*&order=created_at.desc',
        { headers }
      );
      if (annRes.ok) annotations = await annRes.json();
    }
    const annotationImagePaths = annotations.filter((a) => a.type === 'drawing' && a.image_path).map((a) => a.image_path);

    const allPaths = [...photoPaths, ...annotationImagePaths];
    const signedByPath = await signPaths(allPaths, SUPABASE_URL, headers);

    const withUrl = (arr) =>
      arr.filter(Boolean).map((p) => ({
        name: p.name || null,
        path: p.path || null,
        url: p.path ? signedByPath[p.path] || null : null,
      }));

    return json(200, {
      day: link.day_key,
      sourceTable: link.source_table,
      permission: link.permission,
      contextNote: day.context_note || '',
      mainResult: day.main_result || null,
      mainAmount: day.main_amount || 0,
      ne: day.ne || false,
      lt: day.lt || false,
      missedOps: day.missed_ops || [],
      contextPhotos: withUrl(contextPhotos),
      photos: withUrl(photos),
      annotations: annotations.map((a) => ({
        id: a.id,
        type: a.type,
        authorName: a.author_name || 'Mentor',
        commentText: a.comment_text || '',
        createdAt: a.created_at,
        photoPath: a.photo_path || null,
        imageUrl: a.image_path ? signedByPath[a.image_path] || null : null,
      })),
    });
  } catch (e) {
    console.error('share-day GET error:', e);
    return json(500, { error: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.' });
  }
}

/* ── POST: guardar un comentario o un dibujo nuevo ───────────── */
async function handlePost(event, SUPABASE_URL, headers) {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return json(400, { error: 'Falta el token del link.' });

  const rawBody = event.body || '';
  const bodyBytes = Buffer.byteLength(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    return json(413, { error: 'La imagen es demasiado grande. Probá con menos zoom o menos trazos.' });
  }

  let payload;
  try {
    const decoded = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
    payload = JSON.parse(decoded);
  } catch (e) {
    return json(400, { error: 'Pedido inválido.' });
  }

  try {
    const { link, error } = await getValidLink(token, SUPABASE_URL, headers);
    if (error) return error;
    if (link.permission !== 'edit') {
      return json(403, { error: 'Este link es de solo lectura, no se pueden guardar cambios.' });
    }

    const authorName = String(payload.authorName || 'Mentor').trim().slice(0, MAX_NAME_LEN) || 'Mentor';

    if (payload.type === 'comment') {
      const text = String(payload.text || '').trim().slice(0, MAX_COMMENT_LEN);
      if (!text) return json(400, { error: 'El comentario está vacío.' });

      const row = {
        owner_id: link.owner_id,
        source_table: link.source_table,
        day_key: link.day_key,
        link_token: token,
        type: 'comment',
        author_name: authorName,
        comment_text: text,
      };
      const ins = await insertAnnotation(row, SUPABASE_URL, headers);
      if (!ins.ok) {
        console.error('share-day: error guardando comentario', ins.status, ins.body);
        return json(500, { error: friendlyDbError(ins) });
      }
      return json(200, { ok: true });
    }

    if (payload.type === 'drawing') {
      const dataUrl = String(payload.imageDataUrl || '');
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
      if (!match) return json(400, { error: 'La imagen del dibujo no es válida.' });
      const mime = match[1];
      const base64 = match[2];
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.byteLength > MAX_BODY_BYTES) {
        return json(413, { error: 'La imagen es demasiado grande.' });
      }
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const imagePath = link.owner_id + '/annotations/' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.' + ext;

      const upRes = await fetch(SUPABASE_URL + '/storage/v1/object/' + PHOTOS_BUCKET + '/' + imagePath, {
        method: 'POST',
        headers: { apikey: headers.apikey, Authorization: headers.Authorization, 'Content-Type': mime, 'x-upsert': 'true' },
        body: buffer,
      });
      if (!upRes.ok) {
        const t = await upRes.text().catch(() => '');
        console.error('share-day: error subiendo dibujo', upRes.status, t);
        return json(500, { error: friendlyDbError({ status: upRes.status, body: t }) });
      }

      const row = {
        owner_id: link.owner_id,
        source_table: link.source_table,
        day_key: link.day_key,
        link_token: token,
        type: 'drawing',
        author_name: authorName,
        photo_path: payload.photoPath || null,
        image_path: imagePath,
      };
      const ins = await insertAnnotation(row, SUPABASE_URL, headers);
      if (!ins.ok) {
        console.error('share-day: error guardando anotación', ins.status, ins.body);
        return json(500, { error: friendlyDbError(ins) });
      }
      return json(200, { ok: true });
    }

    return json(400, { error: 'Tipo de anotación desconocido.' });
  } catch (e) {
    console.error('share-day POST error:', e);
    return json(500, { error: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.' });
  }
}

async function insertAnnotation(row, SUPABASE_URL, headers) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/shared_annotations', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (res.ok) return { ok: true, status: res.status };
  const body = await res.text().catch(() => '');
  return { ok: false, status: res.status, body };
}

// Traduce un error de Supabase/PostgREST en un mensaje que le sirva a quien
// comenta (sin exponer detalles internos) — y que sea distinto según la
// causa, en vez del mensaje genérico de siempre.
function friendlyDbError({ status, body }) {
  const text = String(body || '');
  if (status === 404 || /schema cache|PGRST205/.test(text)) {
    return 'El servidor todavía no está listo para guardar comentarios (falta configurar la base de datos). Avisale a Benja para que lo revise.';
  }
  if (status === 401 || status === 403 || /row-level security/i.test(text)) {
    return 'No se pudo guardar por un problema de permisos en el servidor. Avisale a Benja.';
  }
  if (status === 413) {
    return 'El comentario o la imagen es demasiado grande. Probá con menos texto o menos trazos.';
  }
  if (status >= 500) {
    return 'La base de datos no respondió. Probá de nuevo en unos minutos.';
  }
  return 'No se pudo guardar. Probá de nuevo en unos minutos; si el problema sigue, avisale a Benja.';
}

async function signPaths(paths, SUPABASE_URL, headers) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const signRes = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + PHOTOS_BUCKET, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7, paths: unique }),
  });
  if (!signRes.ok) {
    console.warn('share-day: error generando URLs firmadas', signRes.status);
    return {};
  }
  const signed = await signRes.json();
  const map = {};
  if (Array.isArray(signed)) {
    signed.forEach((item) => {
      if (item && item.path && item.signedURL) map[item.path] = SUPABASE_URL + '/storage/v1' + item.signedURL;
    });
  }
  return map;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
