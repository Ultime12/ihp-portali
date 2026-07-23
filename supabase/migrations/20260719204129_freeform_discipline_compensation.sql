begin;

alter table public.discipline_compensation_tariffs
  drop constraint if exists discipline_compensation_tariffs_amount_check;

alter table public.discipline_compensation_tariffs
  add constraint discipline_compensation_tariffs_amount_check
  check (amount between 1 and 1000000000);

create or replace function public.apply_20260719_discipline_decision_amount(
  p_actor_profile_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    - 'compensationCode'
    - 'independentHeavyOutcomes'
    - 'compensationAmount';
  v_compensation_amount bigint := coalesce(nullif(p_payload ->> 'compensationAmount', '')::bigint, 0);
  v_compensation_code text;
  v_damage_level text;
begin
  if v_compensation_amount < 0 or v_compensation_amount > 1000000000 then
    raise exception 'Tazminat tutari 0 ile 1.000.000.000 kredi arasinda olmalidir.';
  end if;

  if v_compensation_amount > 0 then
    if char_length(btrim(coalesce(p_payload ->> 'compensationEvidence', ''))) < 10 then
      raise exception 'Tazminat icin dogrulanabilir zarar aciklamasi zorunludur.';
    end if;

    v_compensation_code := 'CUSTOM-' || v_compensation_amount::text;
    v_damage_level := case
      when v_compensation_amount <= 75000 then 'limited'
      when v_compensation_amount <= 200000 then 'significant'
      else 'heavy'
    end;

    insert into public.discipline_compensation_tariffs(
      code,
      damage_level,
      title,
      amount,
      minimum_independent_outcomes,
      regulation_version,
      sort_order
    ) values (
      v_compensation_code,
      v_damage_level,
      'Kararnamede belirlenen tazminat tutari',
      v_compensation_amount,
      1,
      '2026-07-19',
      1000
    )
    on conflict (code) do update
    set damage_level = excluded.damage_level,
        title = excluded.title,
        amount = excluded.amount,
        minimum_independent_outcomes = 1,
        regulation_version = excluded.regulation_version;

    v_payload := v_payload || jsonb_build_object(
      'compensationCode', v_compensation_code,
      'independentHeavyOutcomes', 1
    );
  end if;

  return public.apply_20260719_discipline_decision(p_actor_profile_id, v_payload);
end;
$$;

revoke all on function public.apply_20260719_discipline_decision_amount(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_20260719_discipline_decision_amount(uuid, jsonb)
  to service_role;

commit;
