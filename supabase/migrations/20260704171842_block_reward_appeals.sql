update public.discipline_records
set appeal_status = 'none',
    appeal_text = '',
    appealed_at = null,
    appeal_decision_note = '',
    appeal_decided_by = null,
    appeal_decided_at = null,
    decision_status = case when decision_status = 'appealed' then 'decided' else decision_status end
where (
  coalesce(sanction_effect, '') = 'reward_points'
  or coalesce(point_delta, 0) > 0
  or lower(coalesce(record_type, '')) in ('ödül', 'odul')
)
and (
  coalesce(appeal_status, 'none') <> 'none'
  or nullif(btrim(coalesce(appeal_text, '')), '') is not null
  or appealed_at is not null
  or nullif(btrim(coalesce(appeal_decision_note, '')), '') is not null
  or appeal_decided_by is not null
  or appeal_decided_at is not null
  or decision_status = 'appealed'
);

create or replace function private.prevent_reward_appeal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    coalesce(new.sanction_effect, '') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0
    or lower(coalesce(new.record_type, '')) in ('ödül', 'odul')
  ) and (
    coalesce(new.appeal_status, 'none') <> 'none'
    or nullif(btrim(coalesce(new.appeal_text, '')), '') is not null
    or new.appealed_at is not null
    or nullif(btrim(coalesce(new.appeal_decision_note, '')), '') is not null
    or new.appeal_decided_by is not null
    or new.appeal_decided_at is not null
    or new.decision_status = 'appealed'
  ) then
    raise exception 'Ödül puanı kayıtlarına itiraz edilemez.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_reward_appeal() from public, anon, authenticated;

drop trigger if exists prevent_reward_appeal on public.discipline_records;
create trigger prevent_reward_appeal
before insert or update on public.discipline_records
for each row execute function private.prevent_reward_appeal();
