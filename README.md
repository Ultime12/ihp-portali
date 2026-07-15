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

## E-posta

Portal bildirimleri Resend üzerinden `bildirim@ihp.org.tr` adresiyle gönderilir. `RESEND_API_KEY`, `MAIL_FROM` ve `SITE_URL` yalnızca Vercel ortam değişkenlerinde tutulmalıdır. Alan adı Resend içinde doğrulanana kadar `MAIL_ENABLED=false`, doğrulama tamamlandıktan sonra `MAIL_ENABLED=true` kullanılmalıdır.

Her gerçek üyeye giriş e-postasından bağımsız bir `@ihp.org.tr` kurumsal posta adresi atanır. Üyeler posta kutusuna mevcut portal oturumuyla erişir; ayrı bir webmail şifresi oluşturulmaz. İHP adresleri arasındaki iletiler Supabase üzerinde kotasız saklanır. Dış e-postalar Resend üzerinden gönderilir, `email.received` webhook'u ile `POST /api/resend-webhook` uç noktasına alınır ve yalnızca düz metin olarak portal posta kutusuna kaydedilir. Webhook doğrulaması için `RESEND_WEBHOOK_SECRET` yalnızca Vercel sunucu ortamında tutulmalıdır.

Gelen posta için kullanılan MX kayıtları, web sitesinin A ve CNAME kayıtlarından bağımsızdır. DNS GüzelHosting tarafından yönetildiği için mail sağlayıcısının MX ve TXT kayıtları GüzelHosting DNS paneline eklenir.

## Ayrı Disiplin Kurulu Sitesi

`ihp-dk.vercel.app`, ana portal ile aynı Supabase Auth ve veritabanını kullanır. Üyelerin ana portalda oluşturduğu şikayetler DK sitesinde aynı kayıt üzerinden işlenir.

DK üretim paketini hazırlamak için:

```powershell
npm run check:dk
npm run package:dk
```

Hazırlanan `.vercel/dk-deploy` paketinde yalnızca DK statik çıktısı ile `config`, `dk-proxy` ve `client-error` fonksiyonları bulunur. Ayrıcalıklı DK işlemleri, kullanıcı oturumu korunarak ana portal API'sine sunucudan sunucuya iletilir; service-role ve Gemini anahtarları ikinci projede tutulmaz.

## Güvenlik

- Tarayıcıya yalnızca Supabase anonim anahtarı aktarılır.
- Servis rolü anahtarı yalnızca sunucu tarafındaki üye ekleme/yönetim fonksiyonlarında kullanılır.
- Tüm kritik tablolarda Row Level Security etkindir.
- Üyeler başka üyelerin disiplin kayıtlarını okuyamaz.
- Kritik veri değişiklikleri işlem geçmişine yazılır.
