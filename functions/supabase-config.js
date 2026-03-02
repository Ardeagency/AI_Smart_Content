/**
 * Netlify Function para servir la configuración de Supabase
 * 
 * Esta función expone de forma segura las variables de entorno de Netlify
 * al frontend. Solo expone SUPABASE_URL y SUPABASE_ANON_KEY (seguras para el cliente).
 * 
 * Endpoint: /.netlify/functions/supabase-config
 */

exports.handler = async (event, context) => {
    // Solo permitir GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Obtener variables de entorno de Netlify
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    // Validar que las variables estén configuradas
    if (!supabaseUrl || !supabaseAnonKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Supabase configuration missing in server environment variables' 
            })
        };
    }

    // Retornar configuración (solo las variables seguras para el cliente)
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*', // Permitir CORS
            'Cache-Control': 'public, max-age=3600' // Cache por 1 hora
        },
        body: JSON.stringify({
            url: supabaseUrl,
            anonKey: supabaseAnonKey
        })
    };
};

