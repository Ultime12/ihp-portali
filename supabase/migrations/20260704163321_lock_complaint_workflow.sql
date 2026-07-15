-- Complaint records are immutable from browser clients. All workflow updates
-- go through the authenticated server endpoint, and records are never deleted.
drop policy if exists complaints_delete_authorized on public.complaints;
drop policy if exists complaints_update_discipline on public.complaints;

revoke delete, update, truncate on table public.complaints from anon;
revoke delete, update, truncate on table public.complaints from authenticated;

-- Application decisions also run through the server endpoint so applicants
-- cannot bypass the self-review and hierarchy checks with a direct REST call.
drop policy if exists applications_update_reviewers on public.applications;
revoke update, truncate on table public.applications from anon;
revoke update, truncate on table public.applications from authenticated;

drop policy if exists applications_select_authorized on public.applications;
create policy applications_select_authorized
on public.applications
for select
to authenticated
using (
  applicant_profile_id = (select auth.uid())
  or created_by = (select auth.uid())
  or (
    private.can_review_application(
      coalesce(target_committee_id, suggested_committee_id),
      requested_role
    )
    and (
      claimed_by is null
      or claimed_by = (select auth.uid())
      or private.has_any_role(
        array[
          'super_admin'::public.app_role,
          'discipline_chair'::public.app_role
        ]
      )
    )
  )
);
