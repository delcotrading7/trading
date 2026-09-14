// Netlify Function: share-day
//
// Puerta de entrada segura para los links de "Compartir día" del Trading
// Journal. La abre cualquiera (sin login) al entrar a compartir.html?token=...
//
// Usa la SUPABASE_SERVICE_ROLE_KEY (clave maestra) que vive SOLO acá, como
// variable de entorno en Netlify — nunca en el HTML público. Esta función es
// la única que puede saltarse el RLS para ir a buscar el día puntual que
// corresponde a un token válido, sin exponer el resto de los datos del dueño.
//
// Configuración necesaria en Netlify (Site settings → Environment variables):
//   SUPABASE_URL              = https://cghzxjyhabaxknjregvo.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (la "service_role" key del dashboard de Supabase)

const PHOTOS_BUCKET = 'journal-photos';

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return json(400, { error: 'Falta el token del link.' });

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

  try {
    // 1) Buscar el link por token
    const linkRes = await fetch(
      SUPABASE_URL + '/rest/v1/shared_links?token=eq.' + encodeURIComponent(token) + '&select=*',
      { headers }
    );
    if (!linkRes.ok) throw new Error('No se pudo consultar el link (' + linkRes.status + ')');
    const links = await linkRes.json();
    const link = Array.isArray(links) ? links[0] : null;

    if (!link) return json(404, { error: 'Este link no existe o ya no está disponible.' });
    if (link.revoked) return json(410, { error: 'Este link fue revocado por el dueño del journal.' });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json(410, { error: 'Este link venció.' });
    }

    const table = link.source_table === 'fondeo_days' ? 'fondeo_days' : 'practica_days';

    // 2) Buscar los datos del día puntual
    const dayRes = await fetch(
      SUPABASE_URL + '/rest/v1/' + table +
        '?user_id=eq.' + encodeURIComponent(link.owner_id) +
        '&day=eq.' + encodeURIComponent(link.day_key) +
        '&select=*',
      { headers }
    );
    if (!dayRes.ok) throw new Error('No se pudo consultar el día (' + dayRes.status + ')');
    const days = await dayRes.json();
    const day = Array.isArray(days) ? days[0] : null;
    if (!day) return json(404, { error: 'No se encontraron datos para este día.' });

    // 3) Generar links temporales para las fotos (7 días)
    const contextPhotos = Array.isArray(day.context_photos) ? day.context_photos : [];
    const photos = Array.isArray(day.photos) ? day.photos : [];
    const paths = [...contextPhotos, ...photos].map((p) => p && p.path).filter(Boolean);

    let signedByPath = {};
    if (paths.length) {
      const signRes = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + PHOTOS_BUCKET, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7, paths }),
      });
      if (signRes.ok) {
        const signed = await signRes.json();
        if (Array.isArray(signed)) {
          signed.forEach((item) => {
            if (item && item.path && item.signedURL) {
              signedByPath[item.path] = SUPABASE_URL + '/storage/v1' + item.signedURL;
            }
          });
        }
      } else {
        console.warn('share-day: error generando URLs firmadas', signRes.status);
      }
    }

    const withUrl = (arr) =>
      arr.filter(Boolean).map((p) => ({
        name: p.name || null,
        url: p.path ? signedByPath[p.path] || null : null,
      }));

    return json(200, {
      day: link.day_key,
      sourceTable: table,
      permission: link.permission,
      contextNote: day.context_note || '',
      mainResult: day.main_result || null,
      mainAmount: day.main_amount || 0,
      missedOps: day.missed_ops || [],
      contextPhotos: withUrl(contextPhotos),
      photos: withUrl(photos),
    });
  } catch (e) {
    console.error('share-day error:', e);
    return json(500, { error: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
