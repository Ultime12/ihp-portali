alter table public.assistant_settings
  alter column weekly_cost set default 250000,
  add column if not exists max_output_tokens integer not null default 2600
    check (max_output_tokens between 400 and 6000);

update public.assistant_settings
set weekly_cost = 250000,
    max_output_tokens = greatest(coalesce(max_output_tokens, 2600), 2600),
    updated_at = now()
where id = 'main';
