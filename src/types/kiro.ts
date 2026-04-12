export type WidgetType =
  | 'kpi_card' | 'bar_chart' | 'line_chart' | 'pie_chart'
  | 'data_table' | 'activity_feed' | 'task_list' | 'calendar_view'
  | 'text_block' | 'status_indicator' | 'progress_bar'
  | 'leaderboard' | 'alert_panel' | 'quick_actions' | 'social_text_block';

export interface LayoutConfigItem {
  widget_key: string; type: WidgetType;
  col: number; row: number; col_span: number; row_span?: number;
}

export interface WidgetDataRow { widget_key: string; data: unknown; expires_at: string; }

export interface Agent { id: string; name: string; role: string; description: string; status: 'active' | 'inactive'; avatar_url?: string; }

export interface DashboardConfig { id: string; agent_id: string; is_published: boolean; layout_config: LayoutConfigItem[]; }

export interface CostKpiPayload { currentMonthCost: number; previousMonthCost: number; percentageChange: number; currency: string; }

export interface CostTrendPayload { data: { date: string; cost: number }[]; }

export interface LambdaKpiPayload { functionCount: number; region: string; }

export interface S3KpiPayload { bucketCount: number; totalStorageBytes: number | null; }

export interface Ec2KpiPayload { runningCount: number; stoppedCount: number; totalCount: number; }

export interface CloudWatchFeedPayload { events: { timestamp: string; logGroup: string; message: string }[]; }

export interface HealthAlertsPayload { alerts: { eventTypeCode: string; service: string; statusCode: string; startTime: string; region: string; }[]; }

export interface ServiceStatusPayload { services: { service: string; status: 'operational' | 'permission_error' | 'unknown' }[]; }

export interface ErrorPayload { error: true; message: string; }
