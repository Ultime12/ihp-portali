# İstiklal Hürriyet Partisi (İHP) Portalı

Bu proje, öğrenci topluluğu için giriş yapılabilen, rol kontrollü, Supabase/PostgreSQL tabanlı tam kapsamlı web portalıdır.

## Özellikler

- Kayıt ol, giriş yap, şifre sıfırla, oturum yönetimi
- Rol sistemi: Üye, Temsilci, Yönetici, Başkan Yardımcısı, Genel Başkan
- Anasayfa, yönetim kadrosu, istatistikler, son duyurular ve etkinlikler
- Profil, görev, katılım tarihi, rozet, disiplin puanı
- Duyuru sistemi: oluşturma, yayınlama, sabitleme, silme
- Disiplin sistemi: puan ekleme/düşürme, sebep, geçmiş kaydı
- Seçim sistemi: adaylık, oy kullanma, sonuçlar, arşiv
- Yürütme kurulu: karar, oylama, toplantı kayıtları
- Disiplin kurulu: soruşturma, savunma altyapısı, karar, puan güncelleme
- Oyun merkezi: etkinlik, turnuva, takım, şampiyonlar tablosu
- Başvuru sistemi
- Yönetici paneli
- Mobil uyumlu lacivert/kırmızı/beyaz tasarım
- Karanlık mod
- Supabase Row Level Security politikaları

## Klasör Yapısı

```text
ihp-portali/
├─ index.html
├─ pages/
│  ├─ login.html
│  ├─ register.html
│  ├─ reset.html
│  ├─ dashboard.html
│  ├─ profile.html
│  ├─ announcements.html
│  ├─ events.html
│  ├─ applications.html
│  ├─ elections.html
│  ├─ executive.html
│  ├─ discipline.html
│  ├─ gaming.html
│  └─ admin.html
├─ assets/
│  ├─ css/styles.css
│  ├─ img/favicon.svg
│  └─ js/
│     ├─ config.js
│     ├─ config.example.js
│     ├─ supabaseClient.js
│     ├─ api.js
│     ├─ auth.js
│     ├─ layout.js
│     ├─ main.js
│     ├─ utils.js
│     └─ pages/*.js
├─ database/schema.sql
├─ supabase/functions/
│  ├─ admin-create-user/index.ts
│  └─ admin-delete-user/index.ts
├─ vercel.json
├─ .gitignore
└─ README.md
```

## Kurulum

### 1. Supabase projesi oluştur

1. Supabase Dashboard'a gir.
2. Yeni proje oluştur.
3. Project Settings > API bölümünden Project URL ve publishable/anon key değerlerini al.

### 2. Veritabanını kur

1. Supabase Dashboard > SQL Editor aç.
2. `database/schema.sql` dosyasının tamamını çalıştır.
3. Authentication > Providers > Email aktif olsun.
4. Authentication > URL Configuration bölümünde Site URL değerini yayın adresin yap.
5. Redirect URL listesine şu adresleri ekle:
   - `http://localhost:5500/**`
   - `https://KULLANICI_ADIN.github.io/**`
   - Vercel kullanıyorsan Vercel domainin

### 3. Frontend bağlantısını ayarla

`assets/js/config.js` dosyasını aç ve şunları gerçek değerlerle değiştir:

```js
export const SUPABASE_URL = "https://PROJECT-ID.supabase.co";
export const SUPABASE_ANON_KEY = "PUBLISHABLE_OR_ANON_KEY";
```

Service role key kesinlikle frontend dosyasına yazılmaz.

### 4. İlk yönetici / genel başkan yetkisi ver

1. Siteden normal kayıt ol.
2. Supabase SQL Editor içinde kendi kullanıcı ID'ni bul:

```sql
select id, email from auth.users order by created_at desc;
```

3. Kendi profilini Genel Başkan yap:

```sql
update public.profiles
set role = 'genel_baskan',
    duty = 'Genel Başkan',
    is_executive_member = true,
    is_discipline_member = true,
    badges = array['Kurucu', 'Genel Başkan']
where id = 'BURAYA_KENDI_USER_ID';
```

### 5. Yerelde çalıştır

Bu proje statik HTML/CSS/JS olduğu için herhangi bir statik sunucuyla çalışır.

VS Code Live Server kullanabilir veya terminalde şunu çalıştırabilirsin:

```bash
python3 -m http.server 5500
```

Sonra aç:

```text
http://localhost:5500
```

## GitHub'a yükleme

```bash
git init
git add .
git commit -m "İHP Portalı ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/ihp-portali.git
git push -u origin main
```

## GitHub Pages ile yayınlama

1. GitHub reposunda Settings > Pages bölümüne gir.
2. Source: Deploy from branch seç.
3. Branch: `main`, Folder: `/root` seç.
4. Yayın adresini Supabase Authentication Redirect URL listesine ekle.

## Vercel ile yayınlama

1. Vercel hesabına GitHub reposunu import et.
2. Framework Preset: Other seç.
3. Build command boş kalabilir.
4. Output directory boş veya `.` olabilir.
5. Yayınlandıktan sonra Vercel domainini Supabase Redirect URL listesine ekle.

## Edge Function ile güvenli üye ekleme/silme

Tarayıcıda service role key kullanmak tehlikelidir. Bu yüzden admin üye ekleme/silme işlemleri Supabase Edge Function olarak hazırlandı.

Supabase CLI kuruluysa:

```bash
supabase login
supabase link --project-ref PROJECT_REF
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
```

Supabase secrets:

```bash
supabase secrets set SUPABASE_URL=https://PROJECT-ID.supabase.co
supabase secrets set SUPABASE_ANON_KEY=ANON_KEY
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY
```

Bu işlemden sonra Yönetici Paneli > Üye ekle ve Sil butonları çalışır.

## Yetki Sistemi

| Rol | Yetkiler |
|---|---|
| Ziyaretçi | Anasayfa, açık duyurular, etkinlikler, başvuru ve oyun merkezi görünümü |
| Üye | Profil, seçimde adaylık/oy, etkinliğe katılım, kişisel disiplin geçmişi |
| Temsilci | Üye yetkileri + etkinlik ve oyun modülleri yönetimi |
| Yönetici | Temsilci yetkileri + duyuru, başvuru, seçim, üye ve disiplin yönetimi |
| Başkan Yardımcısı | Yönetici yetkileri + üst yönetim yetkileri |
| Genel Başkan | Tüm sistem yetkileri |

## Güvenlik Notları

- RLS tüm ana tablolarda aktiftir.
- Üyeler kendi rolünü veya disiplin puanını doğrudan değiştiremez.
- Profil güncellemesi `update_own_profile` RPC fonksiyonu ile sınırlanmıştır.
- Disiplin puanı `adjust_discipline` RPC fonksiyonu ile geçmiş kaydı oluşturarak güncellenir.
- Seçimlerde kullanıcı başına bir oy sınırı veritabanı unique constraint ile korunur.
- Admin Auth kullanıcı oluşturma/silme işlemleri yalnızca Edge Function + service role üzerinden yapılır.

## Notlar

Bu proje frontend tarafında saf HTML, CSS ve JavaScript kullanır. Ek build sistemi gerekmez. Supabase bağlantısı yapılmadan sayfalar uyarı verir; bağlantı ve SQL kurulumu tamamlandığında portal canlı veriyle çalışır.
