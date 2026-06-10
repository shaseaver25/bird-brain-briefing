import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { question } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: 'question required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, role, description');
    if (error || !agents) {
      return new Response(JSON.stringify({ error: 'Could not load agents' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roster = agents
      .map((a: any) => `- ${a.name} (${a.role}): ${a.description ?? ''}`)
      .join('\n');

    const sys = `You decide which panelists on an expert panel would want to chime in on a question, based on their role/expertise. Respond with ONLY a JSON object of the form {"interested": ["Name1", "Name2"]} using exact names from the roster. Pick 1-4 most relevant panelists. No commentary.`;
    const user = `Panel roster:\n${roster}\n\nAudience question: "${question}"\n\nWhich panelists would want to answer?`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI error: ${aiResp.status} ${txt}` }), {
        status: aiResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    let names: string[] = [];
    try {
      const parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? '{}');
      if (Array.isArray(parsed.interested)) names = parsed.interested;
    } catch (_) {
      names = [];
    }

    const normalized = names.map((n) => String(n).toLowerCase().trim());
    const interestedIds = agents
      .filter((a: any) => normalized.includes(a.name.toLowerCase().trim()))
      .map((a: any) => a.id);

    return new Response(JSON.stringify({ interestedIds }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});