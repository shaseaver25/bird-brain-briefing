import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';

const AGENT_ID = 'mockingjay';

function extractJson(text: string): any {
  if (!text) return null;
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // First try direct parse
  try { return JSON.parse(candidate.trim()); } catch (_) {}
  // Fall back: find first { ... last }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await authClient.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  const { data: isAdmin } = await authClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  });

  const body = await req.json().catch(() => ({}));
  const customTopic = body?.topic ?? null;

  EdgeRuntime.waitUntil(
    (async () => {
      try {
        const { data: wrenData } = await supabase
          .from('widget_data')
          .select('widget_key, data')
          .eq('agent_id', 'wren')
          .limit(5);

        const { data: merlinData } = await supabase
          .from('widget_data')
          .select('widget_key, data')
          .eq('agent_id', 'merlin')
          .limit(5);

        const { data: kiroData } = await supabase
          .from('widget_data')
          .select('widget_key, data')
          .eq('agent_id', 'kiro')
          .limit(3);

        const { data: existingPosts } = await supabase
          .from('widget_data')
          .select('widget_key, data')
          .eq('agent_id', AGENT_ID)
          .eq('widget_key', 'post_queue')
          .single();

        const contextSummary = JSON.stringify({
          wren: wrenData ?? [],
          merlin: merlinData ?? [],
          kiro: kiroData ?? [],
          customTopic,
        });

        const postDraftResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: 'You are MockingJay, a social media content agent. You create platform-native post drafts for LinkedIn, Instagram, and Facebook based on team activity data. Return ONLY valid JSON matching this schema exactly: { "posts": [ { "id": "string", "platform": "LinkedIn|Instagram|Facebook", "content": "string", "hashtags": ["string"], "status": "Draft|Ready|Needs Review", "hook": "string", "source": "string", "created_at": "ISO timestamp" } ] }. Create 1-2 posts per platform (3-6 total). Make each post feel native to its platform. LinkedIn = professional insight. Instagram = visual concept plus punchy caption. Facebook = conversational and community-oriented. If a customTopic is provided, prioritize it.',
          messages: [
            {
              role: 'user',
              content: 'Here is the current team context data: ' + contextSummary + '. Generate social media post drafts for LinkedIn, Instagram, and Facebook. Current date: ' + new Date().toISOString(),
            },
          ],
        });

        let postQueue = { posts: [] };
        const rawPostText = postDraftResponse.content[0].type === 'text' ? postDraftResponse.content[0].text : '';
        const parsedPosts = extractJson(rawPostText);
        if (parsedPosts) postQueue = parsedPosts;
        else console.error('MockingJay: failed to parse posts JSON. Raw:', rawPostText.slice(0, 500));

        const scorecardResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: 'You are MockingJay. Based on post queue data, generate a platform health scorecard. Return ONLY valid JSON: { "scorecard": { "LinkedIn": { "status": "Active|Quiet|Silent", "daysSincePost": 0, "recommendation": "string", "score": 0 }, "Instagram": { "status": "Active|Quiet|Silent", "daysSincePost": 0, "recommendation": "string", "score": 0 }, "Facebook": { "status": "Active|Quiet|Silent", "daysSincePost": 0, "recommendation": "string", "score": 0 } }, "overall_health": "string", "priority_action": "string" }',
          messages: [
            {
              role: 'user',
              content: 'Post queue context: ' + JSON.stringify(postQueue) + '. Existing posts: ' + JSON.stringify(existingPosts?.data ?? {}) + '. Generate a platform health scorecard. Assume realistic posting gaps for a small team.',
            },
          ],
        });

        let scorecard = {};
        const rawScoreText = scorecardResponse.content[0].type === 'text' ? scorecardResponse.content[0].text : '';
        const parsedScore = extractJson(rawScoreText);
        if (parsedScore) scorecard = parsedScore;
        else console.error('MockingJay: failed to parse scorecard JSON. Raw:', rawScoreText.slice(0, 500));

        const calendarResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: 'You are MockingJay. Generate a 7-day content calendar recommendation. Return ONLY valid JSON: { "calendar": [ { "day": "string", "date": "ISO date string", "platform": "LinkedIn|Instagram|Facebook|Rest", "content_type": "string", "suggested_topic": "string", "priority": "High|Medium|Low" } ] }. Fill all 7 days.',
          messages: [
            {
              role: 'user',
              content: 'Based on this team context: ' + contextSummary + '. Generate a 7-day content calendar starting from today: ' + new Date().toISOString().split('T')[0],
            },
          ],
        });

        let calendar = { calendar: [] };
        const rawCalText = calendarResponse.content[0].type === 'text' ? calendarResponse.content[0].text : '';
        const parsedCal = extractJson(rawCalText);
        if (parsedCal) calendar = parsedCal;
        else console.error('MockingJay: failed to parse calendar JSON. Raw:', rawCalText.slice(0, 500));

        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'post_queue', data: { ...postQueue, generated_at: now }, expires_at: expiresAt, updated_at: now },
          { onConflict: 'agent_id,widget_key' }
        );

        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'platform_scorecard', data: { ...scorecard, generated_at: now }, expires_at: expiresAt, updated_at: now },
          { onConflict: 'agent_id,widget_key' }
        );

        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'content_calendar', data: { ...calendar, generated_at: now }, expires_at: expiresAt, updated_at: now },
          { onConflict: 'agent_id,widget_key' }
        );

        const meetingBriefResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: 'You are MockingJay. Write a short punchy staff meeting brief (3-5 bullet points, max 20 words each). Be direct, witty, actionable. Return ONLY valid JSON: { "brief": ["string"], "one_liner": "string" }',
          messages: [
            {
              role: 'user',
              content: 'Scorecard: ' + JSON.stringify(scorecard) + '. Post drafts ready: ' + (postQueue.posts ? postQueue.posts.length : 0) + '. Calendar generated for 7 days. Write the meeting brief.',
            },
          ],
        });

        let brief = { brief: [], one_liner: '' };
        const rawBriefText = meetingBriefResponse.content[0].type === 'text' ? meetingBriefResponse.content[0].text : '';
        const parsedBrief = extractJson(rawBriefText);
        if (parsedBrief) brief = parsedBrief;
        else {
          console.error('MockingJay: failed to parse brief JSON. Raw:', rawBriefText.slice(0, 500));
          brief = { brief: ['MockingJay ran. Check widgets for details.'], one_liner: 'Content drafted. Awaiting your review.' };
        }

        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'meeting_brief', data: { ...brief, generated_at: now }, expires_at: expiresAt, updated_at: now },
          { onConflict: 'agent_id,widget_key' }
        );

      } catch (err) {
        console.error('MockingJay edge function error:', err);
      }
    })()
  );

  return new Response(JSON.stringify({ status: 'accepted', agent: AGENT_ID }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
});