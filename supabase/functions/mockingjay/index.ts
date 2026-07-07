import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import { corsHeaders, formatInboxForPrompt, postMessage, readHandoffs, readInbox } from '../_shared/agent-bus.ts';

const AGENT_ID = 'mockingjay';

function extractJson(text: string): any {
  if (!text) return null;
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // First try direct parse
  try { return JSON.parse(candidate.trim()); } catch (_) { /* not valid JSON — fall through */ }
  // Fall back: find first { ... last }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { /* still not valid — give up */ }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

        // Merlin and Kiro don't write widget_data — read their real tables.
        const { data: merlinData } = await supabase
          .from('merlin_action_items')
          .select('title, due_date, status, context')
          .neq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(10);

        // The projects the whole team is working on — MockingJay's primary story source.
        const { data: activeProjects } = await supabase
          .from('projects')
          .select('name, description, status, priority, completion_pct, deadline')
          .eq('status', 'active')
          .order('priority', { ascending: true })
          .limit(10);

        const { data: projectTasks } = await supabase
          .from('project_tasks')
          .select('title, status, assignee, due_date, blocker')
          .neq('status', 'done')
          .order('updated_at', { ascending: false })
          .limit(15);

        // What the birds are saying to each other — recent cross-agent chatter, not just MockingJay's inbox.
        const { data: teamChatter } = await supabase
          .from('agent_messages')
          .select('from_agent, to_agent, kind, subject, payload, created_at')
          .order('created_at', { ascending: false })
          .limit(20);

        const { data: kiroData } = await supabase
          .from('kiro_intel')
          .select('title, topic_label, summary, source')
          .eq('relevance', 'high')
          .gt('expires_at', new Date().toISOString())
          .order('found_at', { ascending: false })
          .limit(5);

        const inbox = await readInbox(supabase, AGENT_ID, { markRead: false });

        // Kiro hands off high-relevance articles as explicit post seeds.
        const handoffs = await readHandoffs(supabase, AGENT_ID);
        const postSeeds = handoffs.map((h) => h.payload).filter(Boolean);

        // Real post history — grounds the scorecard in facts instead of guesses.
        const { data: recentPosts } = await supabase
          .from('mockingjay_posts')
          .select('platform, status, posted_at, scheduled_for, created_at')
          .order('created_at', { ascending: false })
          .limit(60);
        const postHistory = recentPosts ?? [];

        // Posts Shannon sent back for a rewrite — regenerate these first.
        const { data: reviseRows } = await supabase
          .from('mockingjay_posts')
          .select('id, platform, content, hook, revise_note')
          .eq('status', 'revise_requested')
          .order('updated_at', { ascending: false })
          .limit(10);
        const reviseRequests = reviseRows ?? [];

        const contextSummary = JSON.stringify({
          active_projects: activeProjects ?? [],
          project_tasks: projectTasks ?? [],
          team_chatter: teamChatter ?? [],
          wren: wrenData ?? [],
          merlin_action_items: merlinData ?? [],
          kiro_intel: kiroData ?? [],
          team_messages: formatInboxForPrompt(inbox),
          post_seeds_from_kiro: postSeeds,
          revision_requests: reviseRequests,
          customTopic,
        });

        const postSystemPrompt = 'You are MockingJay, a social media content agent. You create platform-native post drafts for LinkedIn, Instagram, and Facebook based on team activity data. Return ONLY valid JSON matching this schema exactly: { "posts": [ { "platform": "LinkedIn|Instagram|Facebook", "content": "string", "hashtags": ["string"], "hook": "string", "source": "string" } ] }. Create 1-2 posts per platform (3-6 total). Make each post feel native to its platform. LinkedIn = professional insight. Instagram = visual concept plus punchy caption. Facebook = conversational and community-oriented. PRIORITIES: (1) address every item in "revision_requests" by producing an improved version that follows its revise_note; (2) turn each "post_seeds_from_kiro" article into a post that cites it; (3) if a customTopic is provided, prioritize it; (4) otherwise lead with "active_projects" and "team_chatter" — the projects the team is actively building are the best story material. GROUNDING: base every post only on the provided team context — never invent statistics, customer names, results, or testimonials. Set each post\'s "source" field to the specific context item it came from (e.g. the project name, Kiro article title, or team report). Never return an empty posts array when active_projects is non-empty — there is always at least a build-in-public story to tell.';

        // Truncated output was silently producing zero drafts — generate with headroom and one retry.
        let postQueue: any = { posts: [] };
        let postGenError: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const postDraftResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            system: postSystemPrompt,
            messages: [
              {
                role: 'user',
                content: 'Here is the current team context data: ' + contextSummary + '. Generate social media post drafts for LinkedIn, Instagram, and Facebook. Current date: ' + new Date().toISOString(),
              },
            ],
          });
          const rawPostText = postDraftResponse.content[0].type === 'text' ? postDraftResponse.content[0].text : '';
          const parsedPosts = extractJson(rawPostText);
          if (parsedPosts?.posts?.length > 0) {
            postQueue = parsedPosts;
            postGenError = null;
            break;
          }
          postGenError = 'stop_reason=' + postDraftResponse.stop_reason + ', parsed=' + (parsedPosts ? 'empty posts array' : 'unparseable');
          console.error(`MockingJay: post generation attempt ${attempt + 1} produced no drafts (${postGenError}). Raw:`, rawPostText.slice(0, 500));
        }

        // Compute REAL per-platform stats from the posts table — no guessing.
        const platformStats: Record<string, { posted: number; approved: number; draft: number; daysSinceLastPost: number | null }> = {};
        for (const pf of ['LinkedIn', 'Instagram', 'Facebook']) {
          const rows = postHistory.filter((p: any) => p.platform === pf);
          const posted = rows.filter((p: any) => p.status === 'posted');
          const lastPosted = posted
            .map((p: any) => p.posted_at)
            .filter(Boolean)
            .sort()
            .pop();
          platformStats[pf] = {
            posted: posted.length,
            approved: rows.filter((p: any) => p.status === 'approved' || p.status === 'scheduled').length,
            draft: rows.filter((p: any) => p.status === 'draft').length,
            daysSinceLastPost: lastPosted
              ? Math.floor((Date.now() - new Date(lastPosted).getTime()) / 86400000)
              : null,
          };
        }

        const scorecardResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: 'You are MockingJay. Build a platform health scorecard from REAL post-history stats. Return ONLY valid JSON: { "scorecard": { "LinkedIn": { "status": "Active|Quiet|Silent", "daysSincePost": 0, "recommendation": "string", "score": 0 }, "Instagram": {...}, "Facebook": {...} }, "overall_health": "string", "priority_action": "string" }. Rules: use the provided daysSinceLastPost verbatim for daysSincePost (if it is null, the platform has never posted — set status "Silent" and say so). Base "status" and "score" (0-100) on real activity: recently posted = Active/high, long gap = Silent/low. Never invent engagement or follower numbers — you only know posting cadence, not reach.',
          messages: [
            {
              role: 'user',
              content: 'Real per-platform stats (from the posts table): ' + JSON.stringify(platformStats) + '. New drafts generated this run: ' + JSON.stringify((postQueue as any).posts?.map((p: any) => p.platform) ?? []) + '. Build the scorecard from these facts only.',
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
          max_tokens: 1600,
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

        // Persist new drafts to the posts table so the approval loop is real.
        const draftRows = ((postQueue as any).posts ?? [])
          .filter((p: any) => p?.platform && p?.content)
          .map((p: any) => ({
            platform: p.platform,
            content: p.content,
            hook: p.hook ?? null,
            hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((t: string) => String(t).replace(/^#/, '')) : [],
            source: p.source ?? null,
            status: 'draft',
          }));
        if (draftRows.length > 0) {
          const { error: insErr } = await supabase.from('mockingjay_posts').insert(draftRows);
          if (insErr) console.error('MockingJay: failed to persist drafts:', insErr.message);
        }

        // Mark any revision requests handled — they were fed into this run's drafts.
        if (reviseRequests.length > 0) {
          await supabase
            .from('mockingjay_posts')
            .update({ status: 'discarded', updated_at: now })
            .in('id', reviseRequests.map((r: any) => r.id));
        }

        // Keep the widget_data snapshot too (for the meeting-brief consumers).
        // error surfaces in the dashboard — a failed run must not look like a quiet success.
        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'post_queue', data: { ...postQueue, error: postGenError, generated_at: now }, expires_at: expiresAt, updated_at: now },
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
          const draftCount = postQueue.posts?.length ?? 0;
          brief = draftCount > 0
            ? { brief: [`${draftCount} drafts ready in the post queue.`], one_liner: 'Content drafted. Awaiting your review.' }
            : { brief: ['Run produced no drafts — check edge function logs.'], one_liner: 'Run completed with no drafts. Something went wrong.' };
        }

        await supabase.from('widget_data').upsert(
          { agent_id: AGENT_ID, widget_key: 'meeting_brief', data: { ...brief, generated_at: now }, expires_at: expiresAt, updated_at: now },
          { onConflict: 'agent_id,widget_key' }
        );

        await postMessage(supabase, {
          from: AGENT_ID,
          subject: brief.one_liner || `Drafted ${postQueue.posts?.length ?? 0} social posts`,
          payload: { drafts: postQueue.posts?.length ?? 0, brief: brief.brief },
        });

      } catch (err) {
        console.error('MockingJay edge function error:', err);
      }
    })()
  );

  return new Response(JSON.stringify({ status: 'accepted', agent: AGENT_ID }), {
    status: 202,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});