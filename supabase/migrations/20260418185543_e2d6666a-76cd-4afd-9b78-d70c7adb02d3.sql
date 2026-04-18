UPDATE public.app_config 
SET agents = (
  SELECT jsonb_agg(elem) 
  FROM jsonb_array_elements(agents::jsonb) elem 
  WHERE elem->>'id' != 'aedd32ce-de81-4270-a0ce-99452ed9bcb6'
)
WHERE user_id = '3ac973ea-0f66-4ee7-9690-9ec64ea5abd0';