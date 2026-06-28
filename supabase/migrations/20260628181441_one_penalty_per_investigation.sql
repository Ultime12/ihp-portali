-- One final discipline decision closes an investigation and consumes it.
create unique index if not exists discipline_records_one_per_investigation_idx
  on public.discipline_records (investigation_id)
  where investigation_id is not null;

create or replace function private.close_investigation_after_discipline_record()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  is_reward boolean;
begin
  is_reward :=
    coalesce(new.sanction_effect, 'none') = 'reward_points'
    or coalesce(new.point_delta, 0) > 0;

  if new.investigation_id is null
     or new.decision_status <> 'decided'::public.discipline_status
     or is_reward then
    return new;
  end if;

  update public.investigations
  set
    status = 'closed',
    decided_by = coalesce(new.created_by, decided_by),
    decided_at = coalesce(decided_at, now()),
    decision_note = case
      when btrim(coalesce(decision_note, '')) = ''
        then 'Disiplin kararnamesi kaydedildiği için soruşturma otomatik kapatıldı.'
      else decision_note
    end,
    updated_at = now()
  where id = new.investigation_id
    and status <> 'cancelled';

  if not found then
    raise exception using
      errcode = '23514',
      message = 'İptal edilmiş veya bulunamayan soruşturmaya disiplin cezası bağlanamaz.';
  end if;

  return new;
end;
$$;

revoke all on function private.close_investigation_after_discipline_record() from public;
grant execute on function private.close_investigation_after_discipline_record() to authenticated, service_role;

drop trigger if exists close_investigation_after_discipline_record on public.discipline_records;
create trigger close_investigation_after_discipline_record
  after insert or update of investigation_id, decision_status
  on public.discipline_records
  for each row
  execute function private.close_investigation_after_discipline_record();

update public.investigations as investigation
set
  status = 'closed',
  decided_by = coalesce(record.created_by, investigation.decided_by),
  decided_at = coalesce(investigation.decided_at, record.created_at, now()),
  decision_note = case
    when btrim(coalesce(investigation.decision_note, '')) = ''
      then 'Disiplin kararnamesi kaydedildiği için soruşturma otomatik kapatıldı.'
    else investigation.decision_note
  end,
  updated_at = now()
from public.discipline_records as record
where record.investigation_id = investigation.id
  and record.decision_status = 'decided'::public.discipline_status
  and investigation.status <> 'cancelled';
