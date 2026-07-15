create index if not exists mail_aliases_owner_profile_id_idx
  on public.mail_aliases (owner_profile_id)
  where owner_profile_id is not null;

create index if not exists mail_attachments_uploader_profile_id_idx
  on public.mail_attachments (uploader_profile_id)
  where uploader_profile_id is not null;

create index if not exists mail_messages_reply_to_message_id_idx
  on public.mail_messages (reply_to_message_id)
  where reply_to_message_id is not null;
