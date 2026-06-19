# İHP Öğrenci Topluluğu Portalı

İHP öğrenci topluluğu için Supabase Auth ve PostgreSQL tabanlı portal. Gerçek siyasi parti veya resmi kurum sitesi değildir.

## Kurulum

1. Yeni bir Supabase projesinde `supabase/migrations/001_initial_schema.sql` dosyasının içeriğini SQL Editor içinde çalıştırın.
2. Ardından `supabase/migrations/002_security_hardening.sql` dosyasının içeriğini çalıştırın.
3. İlk yönetici kullanıcısını Supabase Auth panelinden oluşturun. SQL Editor ile bu kullanıcının `profiles.role` alanını `super_admin` yapın.
4. Vercel proje ortam değişkenlerine `.env.example` dosyasındaki değerleri ekleyin.
5. Projeyi Vercel üzerinden yayınlayın.

Migration dosyaları yalnızca sırayla ve bir kez çalıştırılmalıdır. Dosya yolunu SQL Editor içine yazmayın; dosyanın içindeki SQL kodunu kullanın.

İlk yönetici rolünü atamak için:

```sql
update public.profiles
set role = 'super_admin', display_name = 'Süper Admin'
where id = '<auth-user-id>';
```

## Yerel Ön İzleme

Statik public alanı görmek için önce dağıtım çıktısını oluşturun ve `dist` klasörünü bir yerel web sunucusu ile açın. Supabase bağlantısı için `/api/config` Vercel fonksiyonu gerektiğinden tam giriş akışını Vercel ön izlemesinde test edin.

```powershell
npm run build
cd dist
python -m http.server 4173
```

## Güvenlik

- Tarayıcıya yalnızca Supabase anonim anahtarı aktarılır.
- Servis rolü anahtarı yalnızca sunucu tarafındaki üye ekleme/yönetim fonksiyonlarında kullanılır.
- Tüm kritik tablolarda Row Level Security etkindir.
- Üyeler başka üyelerin disiplin kayıtlarını okuyamaz.
- Kritik veri değişiklikleri işlem geçmişine yazılır.
