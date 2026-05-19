/**
 * Netlify Function: GET /api/billing/gateways
 *
 * Reporta qué pasarelas de pago están configuradas (basado en presencia de env
 * vars). El frontend lo usa para decidir si mostrar selector Stripe/Wompi o
 * ir directo a una.
 *
 * Response:
 *   { stripe: bool, wompi: bool, wompi_public_key?: string, environment: 'sandbox'|'production' }
 *
 * No expone secretos. wompi_public_key sí es público por diseño (necesario para
 * el Widget JS); el integrity_secret nunca se expone.
 * FEAT-019.
 */

const { corsHeaders } = require("./lib/ai-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY);
  const wompiReady  = Boolean(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET);

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      stripe:      stripeReady,
      wompi:       wompiReady,
      wompi_public_key: wompiReady ? process.env.WOMPI_PUBLIC_KEY : null,
      environment: process.env.WOMPI_ENVIRONMENT === "production" ? "production" : "sandbox",
    }),
  };
};
