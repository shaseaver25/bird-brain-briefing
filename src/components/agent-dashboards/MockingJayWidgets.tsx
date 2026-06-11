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
  Draft: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Ready: 'bg-green-100 text-green-800 border-green-300',
  'Needs Review': 'bg-orange-100 text-orange-800 border-orange-300',
  Posted: 'bg-gray-100 text-gray-700 border-gray-300',
};

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
  const [postQueue, setPostQueue] = useState<any[]>([]);
  const [scorecard, setScorecard] = useState<any>({});
  const [calendar, setCalendar] = useState<any[]>([]);
  const [brief, setBrief] = useState<{ brief: string[]; one_liner: string }>({ brief: [], one_liner: '' });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [activeTab, setActiveTab] = useState('LinkedIn');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('widget_data')
        .select('widget_key, data, updated_at')
        .eq('agent_id', AGENT_ID);

      if (data) {
        for (const row of data) {
          const d: any = row.data;
          if (row.widget_key === 'post_queue') {
            setPostQueue(d?.posts ?? []);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke('mockingjay', {
        body: { topic: topic.trim() || null },
      });
      setTimeout(() => {
        fetchData();
        setRunning(false);
      }, 8000);
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
                {postQueue.length} draft{postQueue.length !== 1 ? 's' : ''} across all platforms
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
                    <div
                      key={post.id}
                      className="border rounded-lg p-4 space-y-2 cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug flex-1">
                          {post.hook || (post.content ?? '').slice(0, 80) + '...'}
                        </p>
                        <Badge className={'text-xs shrink-0 border ' + (statusColors[post.status] || 'bg-gray-100 text-gray-600')}>
                          {post.status}
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
                        </>
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