alter table public.credit_installments
  drop constraint if exists credit_installments_loan_id_fkey,
  add constraint credit_installments_loan_id_fkey
    foreign key (loan_id) references public.credit_loans(id) on delete cascade;

alter table public.credit_loans
  drop constraint if exists credit_loans_account_id_fkey,
  add constraint credit_loans_account_id_fkey
    foreign key (account_id) references public.credit_accounts(id) on delete cascade;

alter table public.credit_transactions
  drop constraint if exists credit_transactions_account_id_fkey,
  drop constraint if exists credit_transactions_counterparty_account_id_fkey,
  add constraint credit_transactions_account_id_fkey
    foreign key (account_id) references public.credit_accounts(id) on delete cascade,
  add constraint credit_transactions_counterparty_account_id_fkey
    foreign key (counterparty_account_id) references public.credit_accounts(id) on delete set null;

alter table public.credit_cheques
  drop constraint if exists credit_cheques_issuer_account_id_fkey,
  drop constraint if exists credit_cheques_redeemed_by_account_id_fkey,
  add constraint credit_cheques_issuer_account_id_fkey
    foreign key (issuer_account_id) references public.credit_accounts(id) on delete cascade,
  add constraint credit_cheques_redeemed_by_account_id_fkey
    foreign key (redeemed_by_account_id) references public.credit_accounts(id) on delete set null;

alter table public.game_credit_requests
  drop constraint if exists game_credit_requests_profile_id_fkey,
  drop constraint if exists game_credit_requests_account_id_fkey,
  add constraint game_credit_requests_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  add constraint game_credit_requests_account_id_fkey
    foreign key (account_id) references public.credit_accounts(id) on delete cascade;

alter table public.credit_accounts
  drop constraint if exists credit_accounts_profile_id_fkey,
  add constraint credit_accounts_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.discipline_records
  drop constraint if exists discipline_records_member_id_fkey,
  add constraint discipline_records_member_id_fkey
    foreign key (member_id) references public.profiles(id) on delete cascade;
