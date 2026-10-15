export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function handleOptions() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export function withCors(response: Response) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value)
  }
  return response
}
