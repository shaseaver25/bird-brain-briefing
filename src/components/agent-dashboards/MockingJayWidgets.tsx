import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const AGENT_ID = 'mockingjay';

const platformColors: Record<string, string> = {
  LinkedIn: 'bg-blue-700 text-white',
  Instagram: 'bg-pink-600 text-white',
  Facebook: 'bg-blue-500 text-white',
  Rest: 'bg-gray-400 text-white',
};

const statusColors: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-green-100 text-green-800 border-green-300',
  revise_requested: 'bg-orange-100 text-orange-800 border-orange-300',
  scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
  posted: 'bg-gray-100 text-gray-700 border-gray-300',
  discarded: 'bg-gray-100 text-gray-400 border-gray-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  revise_requested: 'Revision requested',
  scheduled: 'Scheduled',
  posted: 'Posted',
  discarded: 'Discarded',
};

interface PostRow {
  id: string;
  platform: string;
  content: string;
  hook: string | null;
  hashtags: string[];
  source: string | null;
  status: string;
  revise_note: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  created_at: string;
}

const healthColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Quiet: 'bg-yellow-100 text-yellow-800',
  Silent: 'bg-red-100 text-red-800',
};

const priorityColors: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-gray-100 text-gray-600',
};

export default function MockingJayWidgets() {
  const [postQueue, setPostQueue] = useState<PostRow[]>([]);
  const [scorecard, setScorecard] = useState<any>({});
  const [calendar, setCalendar] = useState<any[]>([]);
  const [brief, setBrief] = useState<{ brief: string[]; one_liner: string }>({ brief: [], one_liner: '' });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [activeTab, setActiveTab] = useState('LinkedIn');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [reviseNote, setReviseNote] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Real post drafts + their approval status.
      const { data: posts } = await (supabase
        .from('mockingjay_posts' as never) as ReturnType<typeof supabase.from>)
        .select('*')
        .neq('status', 'discarded')
        .order('created_at', { ascending: false })
        .limit(60);
      setPostQueue((posts ?? []) as unknown as PostRow[]);

      const { data } = await supabase
        .from('widget_data')
        .select('widget_key, data, updated_at')
        .eq('agent_id', AGENT_ID);

      if (data) {
        for (const row of data) {
          const d: any = row.data;
          if (row.widget_key === 'post_queue') {
            setLastUpdated(row.updated_at);
          }
          if (row.widget_key === 'platform_scorecard') {
            setScorecard(d ?? {});
          }
          if (row.widget_key === 'content_calendar') {
            setCalendar(d?.calendar ?? []);
          }
          if (row.widget_key === 'meeting_brief') {
            setBrief(d ?? { brief: [], one_liner: '' });
          }
        }
      }
    } catch (err) {
      console.error('MockingJayWidgets fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePost = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await (supabase.from('mockingjay_posts' as never) as ReturnType<typeof supabase.from>)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    await fetchData();
  }, [fetchData]);

  const approve = (id: string) => updatePost(id, { status: 'approved' });
  const markScheduled = (id: string) => updatePost(id, { status: 'scheduled', scheduled_for: new Date().toISOString() });
  const markPosted = (id: string) => updatePost(id, { status: 'posted', posted_at: new Date().toISOString() });
  const discard = (id: string) => updatePost(id, { status: 'discarded' });
  const submitRevise = async (id: string) => {
    await updatePost(id, { status: 'revise_requested', revise_note: reviseNote.trim() || null });
    setReviseFor(null);
    setReviseNote('');
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunNow = async () => {
    setRunning(true);
    const startedAt = lastUpdated ? new Date(lastUpdated).getTime() : 0;
    try {
      await supabase.functions.invoke('mockingjay', {
        body: { topic: topic.trim() || null },
      });
      // Poll widget_data until updated_at advances past startedAt (or timeout)
      const deadline = Date.now() + 120000; // 2 min
      const poll = async () => {
        const { data } = await supabase
          .from('widget_data')
          .select('updated_at')
          .eq('agent_id', AGENT_ID)
          .eq('widget_key', 'post_queue')
          .maybeSingle();
        const ts = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
        if (ts > startedAt) {
          await fetchData();
          setRunning(false);
          return;
        }
        if (Date.now() > deadline) {
          await fetchData();
          setRunning(false);
          console.warn('MockingJay run timed out waiting for fresh data');
          return;
        }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 4000);
    } catch (err) {
      console.error('MockingJay run error:', err);
      setRunning(false);
    }
  };

  const platformList = ['LinkedIn', 'Instagram', 'Facebook'];
  const filteredPosts = postQueue.filter((p) => p.platform === activeTab);
  const scorecardData = scorecard.scorecard ?? scorecard;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">MockingJay</h2>
          <p className="text-sm text-muted-foreground">
            Social media content agent — LinkedIn · Instagram · Facebook
          </p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground mt-1">
              Last run: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-80">
          <Textarea
            placeholder="Optional topic to focus on (e.g. new product launch)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
          <Button onClick={handleRunNow} disabled={running} className="w-full bg-pink-600 hover:bg-pink-700 text-white">
            {running ? 'MockingJay is drafting...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading MockingJay data...</div>
      ) : (
        <>
          {brief.one_liner && (
            <Card className="border-pink-200 bg-pink-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Meeting Brief</CardTitle>
                <CardDescription className="text-pink-700 font-semibold text-sm italic">
                  {brief.one_liner}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {brief.brief && brief.brief.length > 0 && (
                  <ul className="space-y-1">
                    {brief.brief.map((point, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-pink-500">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform Health Scorecard</CardTitle>
              {scorecard.priority_action && (
                <CardDescription>{scorecard.priority_action}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {platformList.map((platform) => {
                  const health = scorecardData[platform];
                  return (
                    <div key={platform} className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={'text-xs font-bold px-2 py-1 rounded-full ' + (platformColors[platform] || 'bg-gray-200 text-gray-700')}>
                          {platform}
                        </span>
                        {health?.status && (
                          <Badge className={'text-xs ' + (healthColors[health.status] || 'bg-gray-100')}>
                            {health.status}
                          </Badge>
                        )}
                      </div>
                      {health ? (
                        <>
                          <div className="flex items-center gap-1">
                            <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-full bg-pink-500 rounded-full transition-all"
                                style={{ width: Math.min(health.score || 0, 100) + '%' }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-600">{health.score}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {health.daysSincePost === 0 ? 'Posted today' : (health.daysSincePost + 'd since last post')}
                          </p>
                          <p className="text-xs text-gray-600">{health.recommendation}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No data yet — run MockingJay.</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {scorecard.overall_health && (
                <p className="text-xs text-muted-foreground mt-3 border-t pt-2">Overall: {scorecard.overall_health}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Post Queue</CardTitle>
              <CardDescription>
                {postQueue.length} post{postQueue.length !== 1 ? 's' : ''} · approve, request a revision, or mark scheduled/posted
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {platformList.map((platform) => {
                  const count = postQueue.filter((p) => p.platform === platform).length;
                  return (
                    <button
                      key={platform}
                      onClick={() => setActiveTab(platform)}
                      className={'px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ' + (activeTab === platform ? (platformColors[platform] || '') : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')}
                    >
                      {platform} ({count})
                    </button>
                  );
                })}
              </div>
              {filteredPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No {activeTab} drafts yet. Run MockingJay to generate content.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post) => (
                    <div key={post.id} className="border rounded-lg p-4 space-y-2">
                      <div
                        className="flex items-start justify-between gap-2 cursor-pointer"
                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                      >
                        <p className="text-sm font-semibold leading-snug flex-1">
                          {post.hook || (post.content ?? '').slice(0, 80) + '...'}
                        </p>
                        <Badge className={'text-xs shrink-0 border ' + (statusColors[post.status] || 'bg-gray-100 text-gray-600')}>
                          {statusLabels[post.status] ?? post.status}
                        </Badge>
                      </div>
                      {expandedPost === post.id && (
                        <>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                          {post.hashtags && post.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {post.hashtags.map((tag: string, i: number) => (
                                <span key={i} className="text-xs text-blue-600">#{tag.replace(/^#/, '')}</span>
                              ))}
                            </div>
                          )}
                          {post.source && (
                            <p className="text-xs text-muted-foreground border-t pt-2">Source: {post.source}</p>
                          )}
                          {post.revise_note && (
                            <p className="text-xs text-orange-600">Revision note: {post.revise_note}</p>
                          )}
                        </>
                      )}

                      {/* Approval actions — the real loop */}
                      {reviseFor === post.id ? (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="What should MockingJay change? (fed back on the next run)"
                            value={reviseNote}
                            onChange={(e) => setReviseNote(e.target.value)}
                            rows={2}
                            className="text-sm resize-none"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => submitRevise(post.id)}>Send back</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setReviseFor(null); setReviseNote(''); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {(post.status === 'draft' || post.status === 'revise_requested') && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approve(post.id)}>Approve</Button>
                          )}
                          {post.status === 'draft' && (
                            <Button size="sm" variant="outline" onClick={() => setReviseFor(post.id)}>Request revision</Button>
                          )}
                          {post.status === 'approved' && (
                            <Button size="sm" variant="outline" onClick={() => markScheduled(post.id)}>Mark scheduled</Button>
                          )}
                          {(post.status === 'approved' || post.status === 'scheduled') && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => markPosted(post.id)}>Mark posted</Button>
                          )}
                          {post.status !== 'posted' && (
                            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => discard(post.id)}>Discard</Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">7-Day Content Calendar</CardTitle>
              <CardDescription>Recommended posting schedule for the week ahead</CardDescription>
            </CardHeader>
            <CardContent>
              {calendar.length === 0 ? (
                <p className="text-sm text-muted-foreground">Run MockingJay to generate your weekly calendar.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {calendar.map((day, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{day.day}</span>
                        <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (platformColors[day.platform] || 'bg-gray-200 text-gray-700')}>
                          {day.platform}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{day.date}</p>
                      <p className="text-xs font-medium text-gray-700">{day.content_type}</p>
                      <p className="text-xs text-gray-600">{day.suggested_topic}</p>
                      <Badge className={'text-xs ' + (priorityColors[day.priority] || 'bg-gray-100 text-gray-600')}>
                        {day.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}