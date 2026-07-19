-- Disiplin dosyalari istemciden kalici olarak silinemez. Teknik arsiv ve
-- duzeltmeler yalnizca service-role kullanan denetimli API akislarindan yapilir.
revoke delete on table public.complaints from anon, authenticated;
revoke delete on table public.investigations from anon, authenticated;
revoke delete on table public.discipline_records from anon, authenticated;
