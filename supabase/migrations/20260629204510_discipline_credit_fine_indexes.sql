create index if not exists credit_loans_created_by_idx
  on public.credit_loans(created_by)
  where created_by is not null;

create index if not exists discipline_records_credit_fine_debt_id_idx
  on public.discipline_records(credit_fine_debt_id)
  where credit_fine_debt_id is not null;
