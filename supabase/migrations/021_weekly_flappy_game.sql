create table if not exists public.flappy_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  seed integer not null check (seed between 1 and 2147483646),
  status text not null default 'active'
    check (status in ('active', 'won', 'failed', 'expired')),
  terms_version text not null default '2026-06-19-v1',
  terms_accepted_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  finished_at timestamptz,
  score integer not null default 0 check (score between 0 and 10000),
  pipes_passed integer not null default 0 check (pipes_passed between 0 and 25),
  flap_count integer not null default 0 check (flap_count between 0 and 1200),
  duration_ms integer not null default 0 check (duration_ms between 0 and 180000),
  entry_cost integer not null default 5 check (entry_cost = 5),
  reward_points integer not null default 0 check (reward_points between 0 and 10),
  created_at timestamptz not null default now(),
  unique (profile_id, week_start)
);

alter table public.flappy_sessions enable row level security;

create index if not exists flappy_sessions_profile_created_idx
  on public.flappy_sessions(profile_id, created_at desc);
create index if not exists flappy_sessions_week_status_idx
  on public.flappy_sessions(week_start, status);

drop policy if exists flappy_sessions_select_own on public.flappy_sessions;
create policy flappy_sessions_select_own
  on public.flappy_sessions
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.flappy_sessions from anon, authenticated;
grant select on public.flappy_sessions to authenticated;
grant all on public.flappy_sessions to service_role;

create or replace function public.start_weekly_flappy(
  p_profile_id uuid,
  p_seed integer,
  p_terms_accepted boolean
)
returns public.flappy_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_session public.flappy_sessions%rowtype;
  v_local_date date;
  v_week_start date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Bu islem yalnizca sunucu tarafindan yapilabilir.';
  end if;
  if p_terms_accepted is not true then
    raise exception 'Puan iade kosullari kabul edilmelidir.';
  end if;
  if p_seed is null or p_seed < 1 or p_seed > 2147483646 then
    raise exception 'Oyun tohumu gecersiz.';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id
  for update;

  if not found or v_profile.status <> 'active' or v_profile.is_system_account then
    raise exception 'Aktif uye hesabi bulunamadi.';
  end if;
  if v_profile.discipline_points < 5 then
    raise exception 'Puanli oyun icin en az 5 disiplin puani gerekir.';
  end if;

  v_local_date := (now() at time zone 'Europe/Istanbul')::date;
  v_week_start := v_local_date - (extract(isodow from v_local_date)::integer - 1);

  if exists (
    select 1 from public.flappy_sessions
    where profile_id = p_profile_id and week_start = v_week_start
  ) then
    raise exception 'Bu haftaki puanli oyun hakki daha once kullanildi.';
  end if;

  perform set_config('app.bypass_profile_protection', 'on', true);
  update public.profiles
  set discipline_points = discipline_points - 5
  where id = p_profile_id;

  insert into public.flappy_sessions(profile_id, week_start, seed)
  values (p_profile_id, v_week_start, p_seed)
  returning * into v_session;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    p_profile_id,
    p_profile_id,
    'Haftalik Flappy denemesi basladi',
    'Puanli oyun girisi icin 5 disiplin puani kullanildi. Bu puan iade edilmez.',
    'game',
    '#/portal/games'
  );

  insert into public.audit_logs(action, actor_id, target_type, target_id, details)
  values (
    'flappy_weekly_started',
    p_profile_id,
    'flappy_session',
    v_session.id::text,
    jsonb_build_object('week_start', v_week_start, 'entry_cost', 5)
  );

  return v_session;
end;
$$;

create or replace function public.finish_weekly_flappy(
  p_session_id uuid,
  p_profile_id uuid,
  p_score integer,
  p_pipes_passed integer,
  p_flap_count integer,
  p_duration_ms integer,
  p_won boolean
)
returns public.flappy_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.flappy_sessions%rowtype;
  v_points_before integer;
  v_points_after integer;
  v_reward integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Bu islem yalnizca sunucu tarafindan yapilabilir.';
  end if;
  if p_score < 0 or p_score > 10000
     or p_pipes_passed < 0 or p_pipes_passed > 25
     or p_flap_count < 0 or p_flap_count > 1200
     or p_duration_ms < 250 or p_duration_ms > 180000 then
    raise exception 'Dogrulanmis oyun sonucu gecersiz.';
  end if;
  if p_score <> p_pipes_passed * 400 then
    raise exception 'Oyun skoru gecersiz.';
  end if;
  if p_won is distinct from (p_score >= 10000) then
    raise exception 'Oyun sonucu skorla uyusmuyor.';
  end if;

  select * into v_session
  from public.flappy_sessions
  where id = p_session_id and profile_id = p_profile_id
  for update;

  if not found then
    raise exception 'Oyun oturumu bulunamadi.';
  end if;
  if v_session.status <> 'active' then
    return v_session;
  end if;
  if now() > v_session.expires_at then
    update public.flappy_sessions
    set status = 'expired', finished_at = now()
    where id = v_session.id
    returning * into v_session;
    return v_session;
  end if;

  if p_won then
    select discipline_points into v_points_before
    from public.profiles
    where id = p_profile_id
    for update;

    v_points_after := least(200, v_points_before + 10);
    v_reward := v_points_after - v_points_before;
    perform set_config('app.bypass_profile_protection', 'on', true);
    update public.profiles
    set discipline_points = v_points_after
    where id = p_profile_id;
  end if;

  update public.flappy_sessions
  set
    status = case when p_won then 'won' else 'failed' end,
    score = p_score,
    pipes_passed = p_pipes_passed,
    flap_count = p_flap_count,
    duration_ms = p_duration_ms,
    reward_points = v_reward,
    finished_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.notifications(recipient_id, actor_id, title, body, category, link)
  values (
    p_profile_id,
    p_profile_id,
    case when p_won then 'Flappy odulu kazanildi' else 'Haftalik Flappy tamamlandi' end,
    case
      when p_won then 'Tebrikler! 10.000 skora ulastiniz ve ' || v_reward || ' disiplin puani kazandiniz.'
      else 'Haftalik oyununuz ' || p_score || ' skorla tamamlandi.'
    end,
    case when p_won then 'reward' else 'game' end,
    '#/portal/games'
  );

  insert into public.audit_logs(action, actor_id, target_type, target_id, details)
  values (
    case when p_won then 'flappy_weekly_won' else 'flappy_weekly_failed' end,
    p_profile_id,
    'flappy_session',
    v_session.id::text,
    jsonb_build_object(
      'score', p_score,
      'pipes_passed', p_pipes_passed,
      'duration_ms', p_duration_ms,
      'reward_points', v_reward
    )
  );

  return v_session;
end;
$$;

revoke all on function public.start_weekly_flappy(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.start_weekly_flappy(uuid, integer, boolean) to service_role;
grant execute on function public.finish_weekly_flappy(uuid, uuid, integer, integer, integer, integer, boolean) to service_role;
