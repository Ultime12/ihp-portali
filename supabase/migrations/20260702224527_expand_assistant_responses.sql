alter table public.assistant_settings
  drop constraint if exists assistant_settings_max_output_tokens_check;

alter table public.assistant_settings
  alter column max_output_tokens set default 6000;

alter table public.assistant_settings
  add constraint assistant_settings_max_output_tokens_check
  check (max_output_tokens between 400 and 8000);

update public.assistant_settings
set max_output_tokens = greatest(coalesce(max_output_tokens, 6000), 6000),
    updated_at = now()
where id = 'main';

alter table public.assistant_requests
  drop constraint if exists assistant_requests_answer_check;

alter table public.assistant_requests
  add constraint assistant_requests_answer_check
  check (char_length(answer) <= 60000);

create or replace function public.complete_assistant_message(
  p_profile_id uuid,
  p_request_id uuid,
  p_answer text,
  p_model text,
  p_sources jsonb default '[]'::jsonb
)
returns public.assistant_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.assistant_requests%rowtype;
begin
  if p_answer is null or char_length(btrim(p_answer)) < 1 or char_length(p_answer) > 60000 then
    raise exception 'Asistan yaniti gecersiz.';
  end if;

  update public.assistant_requests
  set status = 'completed',
      answer = btrim(p_answer),
      model = left(coalesce(p_model, ''), 120),
      sources = coalesce(p_sources, '[]'::jsonb),
      completed_at = now()
  where id = p_request_id
    and profile_id = p_profile_id
    and status = 'reserved'
  returning * into v_request;

  if not found then
    raise exception 'Bekleyen asistan istegi bulunamadi.';
  end if;

  return v_request;
end;
$$;

revoke all on function public.complete_assistant_message(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_assistant_message(uuid, uuid, text, text, jsonb)
  to service_role;
