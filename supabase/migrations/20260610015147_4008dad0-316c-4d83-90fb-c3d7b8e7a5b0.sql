ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS voice_id text;

UPDATE public.agents SET voice_id = 'JBFqnCBsd6RMkjVDRZzb' WHERE name = 'Osprey' AND voice_id IS NULL;
UPDATE public.agents SET voice_id = 'nPczCjzI2devNBz1zQrb' WHERE name = 'SalesHawk' AND voice_id IS NULL;
UPDATE public.agents SET voice_id = 'TX3LPaxmHKxFdv7VOQHJ' WHERE name = 'Merlin' AND voice_id IS NULL;
UPDATE public.agents SET voice_id = 'EXAVITQu4vr4xnSDxMaL' WHERE name = 'Wren' AND voice_id IS NULL;
UPDATE public.agents SET voice_id = 'iP95p4xoKVk53GoZ742B' WHERE name = 'Kiro' AND voice_id IS NULL;
UPDATE public.agents SET voice_id = 'XrExE9yKIg1WjnnlVkGX' WHERE name = 'Owl' AND voice_id IS NULL;