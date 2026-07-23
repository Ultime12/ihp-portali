-- The member-facing complaint form only asks for the incident, evidence note and files.
-- The server supplies filing dates and the requested review; the DK may assign a target later.
alter table public.complaints
  drop constraint if exists complaints_regulation_20260719_required;

alter table public.complaints
  add constraint complaints_regulation_20260719_required
    check (
      regulation_version <> '2026-07-19'
      or (
        event_date is not null
        and learned_at is not null
        and event_date <= created_at::date
        and learned_at <= created_at::date
        and (
          learned_at >= created_at::date - 30
          or char_length(btrim(coalesce(late_filing_reason, ''))) >= 10
        )
        and char_length(btrim(coalesce(evidence_note, ''))) >= 3
        and char_length(btrim(coalesce(requested_outcome, ''))) >= 3
        and source_channel = 'dk_portal'
      )
    );
