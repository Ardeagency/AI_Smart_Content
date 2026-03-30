/**
 * Netlify Function para servir la configuración de Supabase al frontend propio.
 * Solo expone SUPABASE_URL y SUPABASE_ANON_KEY (valores diseñados para el cliente).
 * El acceso se restringe al dominio de producción para evitar extracción cross-origin.
 *
 * Endpoint: /.netlify/functions/supabase-config
 */

const ALLOWED_ORIGINS = [
    'https://aismartcontent.io',
    'https://www.aismartcontent.io'
];

exports.handler = async (event, context) => {
    const origin = event.headers?.origin || event.headers?.Origin || '';

    // Solo permitir GET y OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        if (!ALLOWED_ORIGINS.includes(origin)) {
            return { statusCode: 403, body: '' };
        }
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET',
                'Vary': 'Origin'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // En producción, restringir al dominio autorizado.
    // En localhost (preview/dev) se permite para facilitar el desarrollo local.
    const isLocalhost = !origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    if (!isLocalhost && !ALLOWED_ORIGINS.includes(origin)) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const supabaseUrl = process.env.SUPABASE_DATABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Configuración del servidor incompleta' })
        };
    }

    const corsOrigin = isLocalhost ? (origin || '*') : origin;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': corsOrigin,
            'Vary': 'Origin',
            'Cache-Control': 'private, no-store'
        },
        body: JSON.stringify({
            url: supabaseUrl,
            anonKey: supabaseAnonKey,
            metaAppId: process.env.META_APP_ID || '',
            metaApiVersion: process.env.META_API_VERSION || 'v19.0'
        })
    };
};

