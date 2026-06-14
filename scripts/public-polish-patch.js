const IHP_PUBLIC_POLISH_PATCH_V1 = true;

function publicPolishEnsureStyles() {
  if (document.getElementById("ihp-public-polish-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-public-polish-styles";
  style.textContent = `
    body:has(.apple-public), body:has(.apple-login) { background: #071426; }
    .apple-public {
      min-height: 100vh;
      background:
        radial-gradient(circle at 18% 18%, rgba(112,167,255,.18), transparent 34rem),
        radial-gradient(circle at 85% 24%, rgba(36,96,180,.24), transparent 30rem),
        linear-gradient(135deg, #061225 0%, #0a1d35 46%, #071426 100%);
      position: relative;
    }
    .apple-public::before,
    .apple-login::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
      background-size: 72px 72px;
      mask-image: radial-gradient(circle at 50% 0%, #000 0%, transparent 68%);
      opacity: .42;
    }
    .apple-public .site-nav {
      max-width: 1320px;
      padding: 1.25rem 1.6rem;
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
    }
    .apple-public .site-nav::after {
      content: "";
      position: absolute;
      left: 1.6rem;
      right: 1.6rem;
      bottom: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
    }
    .apple-public .nav-links {
      padding: .38rem;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 999px;
      background: rgba(255,255,255,.045);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
    }
    .apple-public .nav-links a {
      padding: .45rem .15rem;
      color: rgba(231,238,248,.82);
    }
    .brand-mark {
      box-shadow: 0 16px 40px rgba(4,14,26,.28), inset 0 1px 0 rgba(255,255,255,.52);
    }
    .brand-logo-image { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
    .apple-hero {
      min-height: calc(100vh - 92px);
      display: grid;
      align-items: center;
      padding: 5.3rem 1.5rem 4.8rem;
      position: relative;
      overflow: hidden;
    }
    .apple-hero::after {
      content: "";
      position: absolute;
      width: 520px;
      height: 520px;
      border-radius: 999px;
      right: -160px;
      bottom: -130px;
      background: radial-gradient(circle, rgba(112,167,255,.26), transparent 68%);
      filter: blur(8px);
    }
    .apple-hero-grid {
      width: min(1180px, calc(100vw - 3rem));
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1.04fr) minmax(360px, .76fr);
      gap: 5rem;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    .apple-kicker {
      display: inline-flex;
      align-items: center;
      gap: .7rem;
      padding: .5rem .7rem;
      border: 1px solid rgba(112,167,255,.22);
      border-radius: 999px;
      background: rgba(112,167,255,.08);
      color: #8ebcff;
      font-size: .72rem;
      font-weight: 850;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .apple-kicker i {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #70a7ff;
      box-shadow: 0 0 22px rgba(112,167,255,.9);
    }
    .apple-title {
      margin: 1.35rem 0 1.15rem;
      font-family: "Manrope", sans-serif;
      font-size: clamp(4.3rem, 8.4vw, 8.4rem);
      line-height: .94;
      letter-spacing: -.085em;
    }
    .apple-title span {
      display: block;
      color: #70a7ff;
      text-shadow: 0 18px 70px rgba(112,167,255,.24);
    }
    .apple-title em {
      display: block;
      margin-top: .58rem;
      color: rgba(231,238,248,.72);
      font-size: .34em;
      font-style: normal;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .apple-lead {
      max-width: 660px;
      color: rgba(222,231,244,.78);
      font-size: clamp(1.08rem, 1.7vw, 1.25rem);
      line-height: 1.75;
    }
    .apple-actions { display: flex; flex-wrap: wrap; gap: .8rem; margin: 2.1rem 0 1.4rem; }
    .apple-actions .btn-primary,
    .apple-login .btn-primary,
    .apple-public .nav-links .btn-primary {
      background: linear-gradient(135deg, #79afff, #5f9cff);
      color: #071426;
      box-shadow: 0 18px 48px rgba(112,167,255,.3);
    }
    .apple-actions .btn-secondary {
      background: rgba(255,255,255,.07);
      border-color: rgba(255,255,255,.13);
    }
    .apple-proof {
      display: flex;
      flex-wrap: wrap;
      gap: .65rem;
      margin-top: 1.25rem;
    }
    .apple-proof span {
      display: inline-flex;
      align-items: center;
      gap: .45rem;
      padding: .52rem .7rem;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 999px;
      background: rgba(255,255,255,.045);
      color: rgba(222,231,244,.72);
      font-size: .78rem;
      font-weight: 750;
    }
    .apple-device {
      border-radius: 38px;
      padding: 1rem;
      border: 1px solid rgba(112,167,255,.24);
      background: linear-gradient(145deg, rgba(16,44,82,.82), rgba(5,16,31,.88));
      box-shadow: 0 42px 110px rgba(2,8,18,.44), inset 0 1px 0 rgba(255,255,255,.12);
      transform: perspective(900px) rotateY(-7deg) rotateX(3deg);
    }
    .apple-device-screen {
      border-radius: 28px;
      padding: 1.2rem;
      background: rgba(4,14,26,.9);
      border: 1px solid rgba(255,255,255,.09);
      min-height: 480px;
    }
    .apple-device-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.4rem; }
    .apple-window-dots { display: flex; gap: .42rem; }
    .apple-window-dots i { width: 9px; height: 9px; border-radius: 999px; background: rgba(255,255,255,.22); }
    .apple-device-pill {
      border-radius: 999px;
      padding: .42rem .65rem;
      background: rgba(112,167,255,.12);
      color: #9dc4ff;
      font-size: .68rem;
      font-weight: 800;
    }
    .apple-profile-row { display: flex; align-items: center; gap: .8rem; margin-bottom: 1rem; }
    .apple-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .72rem; margin: 1rem 0; }
    .apple-mini-card {
      min-height: 104px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,.09);
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
      padding: 1rem;
    }
    .apple-mini-card span {
      color: rgba(222,231,244,.58);
      font-size: .68rem;
      font-weight: 850;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .apple-mini-card strong { display: block; margin-top: .5rem; font-size: 1.7rem; letter-spacing: -.05em; }
    .apple-lines { margin-top: 1.2rem; display: grid; gap: .7rem; }
    .apple-lines div {
      display: flex;
      gap: .55rem;
      align-items: center;
      padding-top: .7rem;
      border-top: 1px solid rgba(255,255,255,.075);
      color: rgba(222,231,244,.72);
      font-size: .8rem;
    }
    .apple-lines i { width: 7px; height: 7px; border-radius: 999px; background: #70a7ff; }
    .apple-section { padding: 5rem 1.5rem; position: relative; }
    .apple-section-inner { width: min(1180px, calc(100vw - 3rem)); margin: 0 auto; }
    .apple-section-head { max-width: 760px; margin-bottom: 1.7rem; }
    .apple-section-head h2 {
      margin: .85rem 0 .7rem;
      font-family: "Manrope", sans-serif;
      font-size: clamp(2.4rem, 5vw, 4.7rem);
      line-height: 1.02;
      letter-spacing: -.075em;
    }
    .apple-section-head p { color: rgba(222,231,244,.72); line-height: 1.8; }
    .apple-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .9rem; }
    .apple-feature-card {
      min-height: 198px;
      border-radius: 28px;
      padding: 1.3rem;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.055);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }
    .apple-feature-card:hover { transform: translateY(-5px); border-color: rgba(112,167,255,.28); background: rgba(255,255,255,.075); }
    .apple-feature-card h3 { margin: .8rem 0 .35rem; font-family: "Manrope", sans-serif; letter-spacing: -.04em; }
    .apple-feature-card p { margin: 0; color: rgba(222,231,244,.68); font-size: .86rem; line-height: 1.65; }
    .apple-login {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(380px, 480px);
      gap: 4rem;
      align-items: center;
      width: min(1160px, calc(100vw - 3rem));
      margin: 0 auto;
      padding: 2rem 0;
      position: relative;
    }
    .apple-login-copy,
    .apple-login-card {
      position: relative;
      z-index: 1;
    }
    .apple-login-copy .brand { margin-bottom: 3rem; }
    .apple-login-copy h1 {
      margin: 1rem 0;
      font-family: "Manrope", sans-serif;
      font-size: clamp(3.6rem, 7.4vw, 6.8rem);
      letter-spacing: -.085em;
      line-height: .98;
    }
    .apple-login-copy h1 span { color: #70a7ff; display: block; }
    .apple-login-copy p { max-width: 590px; color: rgba(222,231,244,.72); font-size: 1.05rem; line-height: 1.8; }
    .apple-login-card {
      border-radius: 34px;
      padding: 1.35rem;
      border: 1px solid rgba(255,255,255,.13);
      background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
      box-shadow: 0 42px 110px rgba(2,8,18,.42), inset 0 1px 0 rgba(255,255,255,.12);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
    }
    .apple-login-card-inner {
      border-radius: 26px;
      background: rgba(4,14,26,.74);
      border: 1px solid rgba(255,255,255,.08);
      padding: 1.35rem;
    }
    .apple-login-card h2 { font-size: 1.7rem; margin-bottom: .2rem; }
    .apple-login-card > p, .apple-login-card-inner > p { color: rgba(222,231,244,.62); font-size: .86rem; margin: 0 0 1.25rem; }
    .apple-login-card .field {
      min-height: 52px;
      border-radius: 16px;
      background: rgba(255,255,255,.065);
      border-color: rgba(255,255,255,.11);
    }
    .apple-login-card .btn { min-height: 52px; width: 100%; }
    .apple-login-badges { display: flex; flex-wrap: wrap; gap: .55rem; margin: 1.2rem 0 0; }
    .apple-login-badges span {
      display: inline-flex;
      align-items: center;
      gap: .38rem;
      padding: .45rem .6rem;
      border-radius: 999px;
      background: rgba(112,167,255,.09);
      color: rgba(222,231,244,.76);
      font-size: .72rem;
      font-weight: 760;
    }
    .apple-login .back-link { color: rgba(222,231,244,.68); }
    @media (max-width: 980px) {
      .apple-hero-grid,
      .apple-login { grid-template-columns: 1fr; gap: 2.4rem; }
      .apple-device { transform: none; }
      .apple-feature-grid { grid-template-columns: 1fr; }
      .apple-public .nav-links a { display: none; }
    }
    @media (max-width: 640px) {
      .apple-title { font-size: clamp(3.4rem, 20vw, 5.2rem); }
      .apple-device-screen { min-height: auto; }
      .apple-card-grid { grid-template-columns: 1fr; }
      .apple-public .site-nav { padding-inline: 1rem; }
      .apple-login { width: min(100% - 2rem, 480px); }
    }
  `;
  document.head.append(style);
}

async function publicPolishLoadSettings() {
  if (state.cache.settings || !getConfig().configured) return;
  state.cache.settings = await loadSettings().catch(() => state.cache.settings || null);
}

const publicPolishBaseBoot = boot;
boot = async function patchedPublicPolishBoot() {
  await publicPolishBaseBoot();
  if (!state.cache.settings) {
    await publicPolishLoadSettings();
    render();
  }
};

const publicPolishBasePublicPage = publicPage;
publicPage = function patchedPublicPage() {
  publicPolishEnsureStyles();
  const features = [
    ["shield", "Güvenli Yetki", "Her rol kendi alanını görür; portal gereksiz bilgi kalabalığını dışarıda bırakır."],
    ["users", "Net Kadro", "Üyeler, kurullar ve görevler modern bir düzen içinde tek merkezden izlenir."],
    ["bell", "Akıllı Duyuru", "Duyuru ve bilgilendirme akışı topluluk düzenini bozmadan ilerler."],
    ["clipboard", "Disiplin İşlemleri", "Rapor, şikayet, soruşturma ve kayıt akışı ayrı bir disiplin alanında toplanır."],
    ["sparkles", "Gençlik Çalışmaları", "Etkinlikler ve çalışmalar daha görünür, daha düzenli bir yapıya kavuşur."],
    ["chart", "Raporlama", "Yönetim için sade, okunur ve hızlı karar verdiren özetler hazırlanır."]
  ];

  return `
    <a class="skip-link" href="#about">İçeriğe geç</a>
    <div class="public-shell apple-public">
      <nav class="site-nav">
        ${brand()}
        <div class="nav-links">
          <a href="#about">Hakkımızda</a>
          <a href="#features">Portal</a>
          <a href="#privacy">Güvenlik</a>
          <button class="btn btn-primary btn-sm" data-action="nav-login">${icon("lock")} Giriş Yap</button>
        </div>
      </nav>

      <main>
        <section class="apple-hero">
          <div class="apple-hero-grid">
            <div>
              <span class="apple-kicker"><i></i> Topluluk portalı</span>
              <h1 class="apple-title">İstiklal <span>Hürriyet</span><em>Partisi</em></h1>
              <p class="apple-lead">
                Öğrenciler arasında dayanışma, düzen, arkadaşlık ve sosyal etkileşim için
                kurulmuş modern, güvenli ve yüksek kaliteli topluluk portalı.
              </p>
              <div class="apple-actions">
                <button class="btn btn-primary" data-action="nav-login">Portala Giriş Yap ${icon("arrow")}</button>
                <a class="btn btn-secondary" href="#about">Topluluğu Tanı</a>
              </div>
              <div class="apple-proof">
                <span>${icon("lock")} Güvenli oturum</span>
                <span>${icon("shield")} Rol bazlı erişim</span>
                <span>${icon("sparkles")} Modern arayüz</span>
              </div>
            </div>
            <aside class="apple-device" aria-label="Portal ön izlemesi">
              <div class="apple-device-screen">
                <div class="apple-device-top">
                  <div class="apple-window-dots"><i></i><i></i><i></i></div>
                  <span class="apple-device-pill">Canlı portal</span>
                </div>
                <div class="apple-profile-row">
                  ${avatar("İHP")}
                  <div><strong>İHP Portalı</strong><span class="cell-sub">Güvenli çalışma alanı</span></div>
                </div>
                <div class="apple-card-grid">
                  <div class="apple-mini-card"><span>Kurullar</span><strong>04</strong></div>
                  <div class="apple-mini-card"><span>Modüller</span><strong>11</strong></div>
                  <div class="apple-mini-card"><span>Gizlilik</span><strong>RLS</strong></div>
                  <div class="apple-mini-card"><span>Erişim</span><strong>Rol</strong></div>
                </div>
                <div class="apple-lines">
                  <div><i></i> Disiplin işlemleri ayrı ve düzenli alanda</div>
                  <div><i></i> Üyeler, başkanlık ve kurullar net ayrılır</div>
                  <div><i></i> Logo ve marka alanı ayarlardan otomatik güncellenir</div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section class="apple-section" id="about">
          <div class="apple-section-inner">
            <div class="apple-section-head">
              <span class="apple-kicker"><i></i> Neden portal</span>
              <h2>Topluluk yönetimi daha sakin, daha net, daha premium.</h2>
              <p>İHP Portalı; üye bilgileri, kurullar, duyurular ve disiplin süreçlerini tek merkezde toplar. Tasarımda hedef: göz yormayan, güven veren ve hızlı çalışan bir deneyim.</p>
            </div>
          </div>
        </section>

        <section class="apple-section" id="features">
          <div class="apple-section-inner">
            <div class="apple-section-head">
              <span class="apple-kicker"><i></i> Portal özellikleri</span>
              <h2>Her modül kendi yerinde.</h2>
            </div>
            <div class="apple-feature-grid">
              ${features.map(([iconName, title, text]) => `
                <article class="apple-feature-card">
                  <span class="icon-orb">${icon(iconName)}</span>
                  <h3>${esc(title)}</h3>
                  <p>${esc(text)}</p>
                </article>
              `).join("")}
            </div>
          </div>
        </section>

        <section class="apple-section" id="privacy">
          <div class="apple-section-inner">
            <div class="public-banner glass">
              <div>
                <span class="apple-kicker"><i></i> Güvenli giriş</span>
                <h2>Portal alanı yalnızca yetkilendirilmiş üyelere açıktır.</h2>
                <p>Logo, marka alanı ve portal kimliği süper admin ayarlarıyla güncel tutulur.</p>
              </div>
              <button class="btn btn-primary" data-action="nav-login">Giriş Yap ${icon("arrow")}</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
};

const publicPolishBaseLoginPage = loginPage;
loginPage = function patchedLoginPage() {
  publicPolishEnsureStyles();
  return `
    <main class="login-shell apple-login">
      <section class="apple-login-copy">
        ${brand()}
        <a class="back-link" href="#/home">${icon("back")} Ana sayfaya dön</a>
        <span class="apple-kicker"><i></i> Güvenli giriş</span>
        <h1>Portal <span>erişimi.</span></h1>
        <p>
          İHP öğrenci topluluğu çalışma alanına giriş yapın. Yetkileriniz rolünüze göre
          otomatik belirlenir; üyeler, kurullar ve disiplin alanları ayrı şekilde korunur.
        </p>
        <div class="apple-login-badges">
          <span>${icon("lock")} Supabase Auth</span>
          <span>${icon("shield")} RLS koruması</span>
          <span>${icon("users")} Rol bazlı panel</span>
        </div>
      </section>
      <section class="login-card apple-login-card">
        <div class="apple-login-card-inner">
          <h2>Portala giriş yap</h2>
          <p>Yetkilendirilmiş topluluk hesabınızı kullanın.</p>
          <form class="form-stack" data-form="login">
            <div class="form-group">
              <label for="login-email">E-posta</label>
              <input class="field" id="login-email" name="email" type="email" autocomplete="email" placeholder="isim@tfo.k12.tr" required />
            </div>
            <div class="form-group">
              <label for="login-password">Şifre</label>
              <input class="field" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required minlength="6" />
            </div>
            <button class="btn btn-primary" type="submit">Güvenli Giriş ${icon("arrow")}</button>
          </form>
          ${
            state.config?.configured
              ? `<div class="security-note">${icon("lock")} Oturum ve yetkiler güvenli şekilde doğrulanır.</div>`
              : `<div class="setup-box"><strong>Bağlantı yapılandırması gerekli</strong><p class="security-note">Supabase ortam değişkenleri henüz bağlı görünmüyor.</p></div>`
          }
        </div>
      </section>
    </main>
  `;
};