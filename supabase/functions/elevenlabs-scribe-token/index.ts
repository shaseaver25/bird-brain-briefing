import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ElevenLabs not connected' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resp = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      { method: 'POST', headers: { 'xi-api-key': apiKey } },
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: `Scribe token error: ${resp.status} ${txt}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await resp.json();
    return new Response(JSON.stringify({ token: data.token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});