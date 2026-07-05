import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encode as base64Encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await authClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!elevenKey || !lovableKey) {
      return new Response(JSON.stringify({ error: 'Missing keys' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { agentId, question, history } = await req.json();
    if (!agentId || !question) {
      return new Response(JSON.stringify({ error: 'agentId and question required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, role, description, voice_id')
      .eq('id', agentId)
      .single();
    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: profile } = await supabase
      .from('agent_profiles')
      .select('system_prompt')
      .eq('agent_id', agentId)
      .maybeSingle();

    const systemPrompt = `You are ${agent.name}, ${agent.role}. ${agent.description ?? ''}\n${profile?.system_prompt ?? ''}\n\nYou are on a live panel of experts at a conference. Answer the audience question succinctly — 1-2 short sentences, under 40 words. Get straight to the point, no preamble, no restating the question, no filler. Stay in character, first person, conversational. No markdown.`;

    // 1) Generate the response with Lovable AI Gateway
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(Array.isArray(history) ? history.slice(-6) : []),
          { role: 'user', content: question },
        ],
        max_tokens: 120,
      }),
    });
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI error: ${aiResp.status} ${txt}` }), {
        status: aiResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    const text: string = aiJson.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      return new Response(JSON.stringify({ error: 'Empty AI response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Synthesize voice with ElevenLabs
    const voiceId = agent.voice_id || 'JBFqnCBsd6RMkjVDRZzb';
    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
        }),
      },
    );
    if (!ttsResp.ok) {
      const txt = await ttsResp.text();
      return new Response(JSON.stringify({ error: `TTS error: ${ttsResp.status} ${txt}`, text }), {
        status: ttsResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const audioBuf = await ttsResp.arrayBuffer();
    const audioBase64 = base64Encode(new Uint8Array(audioBuf));

    return new Response(JSON.stringify({
      text,
      audioContent: audioBase64,
      agent: { id: agent.id, name: agent.name, role: agent.role },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});