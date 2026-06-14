const IHP_LIQUID_GLASS_PATCH_V1 = true;

function liquidGlassEnsureStyles() {
  if (document.getElementById("ihp-liquid-glass-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-liquid-glass-styles";
  style.textContent = `
    :root { --liquid-blue:#70a7ff; --liquid-ink:#071426; --liquid-line:rgba(196,219,255,.18); }
    body:has(.liquid-public), body:has(.liquid-login) { background:#071426; }
    .app-nav { scrollbar-width:none; -ms-overflow-style:none; mask-image:linear-gradient(to bottom,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%); }
    .app-nav::-webkit-scrollbar, .sidebar::-webkit-scrollbar { display:none; width:0; height:0; }
    .liquid-public, .liquid-login {
      position:relative; isolation:isolate; min-height:100vh; overflow:hidden;
      background:radial-gradient(circle at 14% 12%,rgba(112,167,255,.24),transparent 32rem),
        radial-gradient(circle at 88% 18%,rgba(35,92,170,.28),transparent 34rem),
        radial-gradient(circle at 52% 96%,rgba(255,255,255,.08),transparent 28rem),
        linear-gradient(135deg,#061225 0%,#0a1d35 48%,#061426 100%);
    }
    .liquid-public::before, .liquid-login::before {
      content:""; position:fixed; inset:-1px; z-index:-2; pointer-events:none;
      background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px);
      background-size:74px 74px; mask-image:radial-gradient(circle at 50% 0%,#000 0%,transparent 70%); opacity:.55;
    }
    .liquid-public::after, .liquid-login::after {
      content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
      background:radial-gradient(circle at var(--mx,52%) var(--my,26%),rgba(141,187,255,.18),transparent 24rem),
        linear-gradient(120deg,transparent 0%,rgba(255,255,255,.045) 42%,transparent 68%);
    }
    .liquid-orb { position:absolute; border-radius:999px; pointer-events:none; filter:blur(10px); opacity:.7; animation:liquidFloat 10s ease-in-out infinite alternate; }
    .liquid-orb.one { width:430px; height:430px; right:-150px; top:160px; background:radial-gradient(circle,rgba(112,167,255,.25),transparent 68%); }
    .liquid-orb.two { width:330px; height:330px; left:-130px; bottom:16%; background:radial-gradient(circle,rgba(255,255,255,.12),transparent 72%); animation-delay:-3s; }
    .liquid-public .site-nav { max-width:1320px; padding:1.25rem 1.6rem; position:sticky; top:0; z-index:20; backdrop-filter:blur(28px) saturate(150%); -webkit-backdrop-filter:blur(28px) saturate(150%); }
    .liquid-public .site-nav::after { content:""; position:absolute; left:1.6rem; right:1.6rem; bottom:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.17),transparent); }
    .liquid-public .nav-links { padding:.38rem; border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.055); box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 44px rgba(0,0,0,.18); backdrop-filter:blur(20px) saturate(150%); }
    .liquid-public .nav-links a { color:rgba(231,238,248,.82); padding:.45rem .18rem; }
    .liquid-public .brand-mark, .liquid-login .brand-mark { box-shadow:0 18px 44px rgba(1,10,22,.28), inset 0 1px 0 rgba(255,255,255,.6); }
    .liquid-hero { min-height:calc(100vh - 88px); display:grid; align-items:center; padding:5.4rem 1.5rem 5rem; position:relative; }
    .liquid-hero-grid { width:min(1200px,calc(100vw - 3rem)); margin:0 auto; display:grid; grid-template-columns:minmax(0,1.02fr) minmax(360px,.78fr); gap:clamp(2.5rem,7vw,5.6rem); align-items:center; position:relative; z-index:1; }
    .liquid-kicker { display:inline-flex; align-items:center; gap:.72rem; padding:.52rem .76rem; border:1px solid rgba(141,187,255,.26); border-radius:999px; background:rgba(112,167,255,.1); color:#9ac4ff; font-size:.72rem; font-weight:880; letter-spacing:.16em; text-transform:uppercase; box-shadow:inset 0 1px 0 rgba(255,255,255,.09); backdrop-filter:blur(18px); }
    .liquid-kicker i { width:7px; height:7px; border-radius:999px; background:#78adff; box-shadow:0 0 24px rgba(112,167,255,.9); }
    .liquid-title { margin:1.35rem 0 1.15rem; font-family:"Manrope",sans-serif; font-size:clamp(4.6rem,8.7vw,8.8rem); line-height:.91; letter-spacing:-.09em; text-wrap:balance; }
    .liquid-title span { display:block; color:var(--liquid-blue); text-shadow:0 20px 80px rgba(112,167,255,.28); }
    .liquid-title em { display:block; margin-top:.62rem; color:rgba(231,238,248,.72); font-size:.32em; font-style:normal; letter-spacing:.09em; text-transform:uppercase; }
    .liquid-lead { max-width:670px; color:rgba(222,231,244,.78); font-size:clamp(1.08rem,1.55vw,1.26rem); line-height:1.78; }
    .liquid-actions { display:flex; flex-wrap:wrap; gap:.85rem; margin:2.15rem 0 0; }
    .liquid-public .btn-primary, .liquid-login .btn-primary { background:linear-gradient(135deg,#8fbeff,#62a0ff); color:#061225; box-shadow:0 22px 56px rgba(112,167,255,.34), inset 0 1px 0 rgba(255,255,255,.36); }
    .liquid-public .btn-secondary { background:rgba(255,255,255,.075); border-color:rgba(255,255,255,.15); box-shadow:inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter:blur(18px); }
    .liquid-device { position:relative; border-radius:42px; padding:1px; background:linear-gradient(140deg,rgba(255,255,255,.42),rgba(141,187,255,.22),rgba(255,255,255,.06)); box-shadow:0 48px 130px rgba(0,8,20,.5); transform:perspective(900px) rotateY(-7deg) rotateX(4deg); animation:liquidDeviceFloat 6.5s ease-in-out infinite; }
    .liquid-device::before { content:""; position:absolute; inset:-34px; z-index:-1; border-radius:56px; background:radial-gradient(circle at 65% 18%,rgba(112,167,255,.28),transparent 52%); filter:blur(20px); }
    .liquid-device-screen { min-height:520px; border-radius:41px; padding:1.25rem; overflow:hidden; position:relative; background:linear-gradient(180deg,rgba(10,27,49,.82),rgba(4,14,26,.9)); border:1px solid rgba(255,255,255,.12); backdrop-filter:blur(30px) saturate(145%); }
    .liquid-device-screen::before { content:""; position:absolute; inset:-2px; background:radial-gradient(circle at 22% 4%,rgba(255,255,255,.22),transparent 18rem),linear-gradient(120deg,transparent 0%,rgba(255,255,255,.08) 44%,transparent 66%); pointer-events:none; }
    .liquid-window-top, .liquid-preview-brand { position:relative; display:flex; align-items:center; justify-content:space-between; }
    .liquid-dots { display:flex; gap:.42rem; } .liquid-dots i { width:9px; height:9px; border-radius:999px; background:rgba(255,255,255,.24); }
    .liquid-status-pill { border-radius:999px; padding:.43rem .68rem; background:rgba(112,167,255,.13); color:#a9ccff; font-size:.68rem; font-weight:820; }
    .liquid-preview-brand { justify-content:flex-start; gap:.85rem; margin-top:1.25rem; padding:.82rem; border-radius:24px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1); }
    .liquid-preview-brand span { display:block; color:rgba(222,231,244,.62); font-size:.8rem; }
    .liquid-dashboard-strip { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; margin-top:1rem; }
    .liquid-stat, .liquid-glass-card { border-radius:25px; padding:1rem; border:1px solid rgba(255,255,255,.1); background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.045)); box-shadow:inset 0 1px 0 rgba(255,255,255,.12); backdrop-filter:blur(24px); }
    .liquid-stat { min-height:116px; } .liquid-stat span, .liquid-glass-card span { color:rgba(222,231,244,.58); font-size:.7rem; font-weight:850; letter-spacing:.1em; text-transform:uppercase; }
    .liquid-stat strong { display:block; margin-top:.5rem; font-size:2rem; letter-spacing:-.06em; }
    .liquid-glass-stack { display:grid; gap:.82rem; margin-top:1rem; }
    .liquid-glass-card { position:relative; overflow:hidden; min-height:94px; } .liquid-glass-card strong { display:block; margin-top:.45rem; font-size:1.5rem; letter-spacing:-.05em; }
    .liquid-glass-card::after { content:""; position:absolute; inset:0; background:linear-gradient(120deg,transparent,rgba(255,255,255,.12),transparent); transform:translateX(-120%); animation:liquidShine 5.8s ease-in-out infinite; }
    .liquid-section { padding:5.2rem 1.5rem; position:relative; } .liquid-section-inner { width:min(1180px,calc(100vw - 3rem)); margin:0 auto; }
    .liquid-section-head { max-width:760px; margin-bottom:1.65rem; } .liquid-section-head h2, .liquid-banner h2 { margin:.88rem 0 .72rem; font-family:"Manrope",sans-serif; font-size:clamp(2.4rem,5vw,4.8rem); line-height:1.02; letter-spacing:-.078em; }
    .liquid-section-head p, .liquid-banner p { color:rgba(222,231,244,.7); line-height:1.8; }
    .liquid-feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:.95rem; }
    .liquid-feature-card, .liquid-banner { position:relative; overflow:hidden; border-radius:30px; padding:1.35rem; border:1px solid rgba(255,255,255,.12); background:linear-gradient(145deg,rgba(255,255,255,.105),rgba(255,255,255,.043)); box-shadow:0 26px 80px rgba(0,8,20,.25), inset 0 1px 0 rgba(255,255,255,.1); backdrop-filter:blur(26px) saturate(145%); transition:transform .22s ease,border-color .22s ease,background .22s ease; }
    .liquid-feature-card { min-height:210px; } .liquid-feature-card:hover { transform:translateY(-7px); border-color:rgba(141,187,255,.32); background:linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.055)); }
    .liquid-feature-card h3 { margin:.9rem 0 .36rem; font-family:"Manrope",sans-serif; letter-spacing:-.04em; } .liquid-feature-card p { margin:0; color:rgba(222,231,244,.68); font-size:.88rem; line-height:1.68; }
    .liquid-banner { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.6rem; } .liquid-banner h2 { font-size:clamp(2rem,4vw,3.4rem); }
    .liquid-login { display:grid; grid-template-columns:minmax(0,1fr) minmax(390px,480px); gap:clamp(2rem,6vw,4.6rem); align-items:center; width:min(1160px,calc(100vw - 3rem)); margin:0 auto; padding:2rem 0; }
    .liquid-login-copy, .liquid-login-card { position:relative; z-index:1; } .liquid-login-copy .brand { margin-bottom:3rem; }
    .liquid-login-copy h1 { margin:1rem 0; font-family:"Manrope",sans-serif; font-size:clamp(3.9rem,7.6vw,7rem); letter-spacing:-.09em; line-height:.95; } .liquid-login-copy h1 span { display:block; color:var(--liquid-blue); }
    .liquid-login-copy p { max-width:600px; color:rgba(222,231,244,.72); font-size:1.06rem; line-height:1.82; }
    .liquid-login-card { border-radius:36px; padding:1px; border:1px solid rgba(255,255,255,.13); background:linear-gradient(145deg,rgba(255,255,255,.36),rgba(141,187,255,.16),rgba(255,255,255,.06)); box-shadow:0 44px 120px rgba(0,8,20,.46); backdrop-filter:blur(34px) saturate(150%); }
    .liquid-login-inner { border-radius:35px; padding:1.45rem; background:linear-gradient(180deg,rgba(9,24,43,.78),rgba(4,14,26,.88)); border:1px solid rgba(255,255,255,.08); }
    .liquid-login-card h2 { margin:0 0 .2rem; font-family:"Manrope",sans-serif; font-size:1.85rem; letter-spacing:-.05em; } .liquid-login-card p { color:rgba(222,231,244,.62); font-size:.88rem; margin:0 0 1.25rem; }
    .liquid-login-card .field { min-height:54px; border-radius:18px; background:rgba(255,255,255,.07); border-color:rgba(255,255,255,.12); box-shadow:inset 0 1px 0 rgba(255,255,255,.06); } .liquid-login-card .btn { width:100%; min-height:54px; }
    .liquid-login-note { margin-top:1rem; color:rgba(222,231,244,.58); font-size:.82rem; line-height:1.55; }
    .liquid-reveal { animation:liquidReveal both; animation-timeline:view(); animation-range:entry 8% cover 34%; }
    @keyframes liquidReveal { from{opacity:0; transform:translateY(38px) scale(.985); filter:blur(10px)} to{opacity:1; transform:none; filter:blur(0)} }
    @keyframes liquidFloat { from{transform:translate3d(0,0,0) scale(1)} to{transform:translate3d(-22px,28px,0) scale(1.08)} }
    @keyframes liquidDeviceFloat { 0%,100%{transform:perspective(900px) rotateY(-7deg) rotateX(4deg) translateY(0)} 50%{transform:perspective(900px) rotateY(-5deg) rotateX(3deg) translateY(-12px)} }
    @keyframes liquidShine { 0%,42%{transform:translateX(-120%)} 68%,100%{transform:translateX(120%)} }
    @media (max-width:980px){ .liquid-hero-grid,.liquid-login{grid-template-columns:1fr; gap:2.4rem}.liquid-device{transform:none; animation:none}.liquid-feature-grid{grid-template-columns:1fr}.liquid-public .nav-links a{display:none} }
    @media (max-width:640px){ .liquid-title{font-size:clamp(3.4rem,20vw,5.3rem)}.liquid-dashboard-strip{grid-template-columns:1fr}.liquid-device-screen{min-height:auto}.liquid-login{width:min(100% - 2rem,480px)}.liquid-banner{align-items:flex-start; flex-direction:column} }
    @media (prefers-reduced-motion:reduce){ .liquid-orb,.liquid-device,.liquid-glass-card::after,.liquid-reveal{animation:none} }
  `;
  document.head.append(style);
  if (!window.__ihpLiquidMouse) {
    window.__ihpLiquidMouse = true;
    document.addEventListener("pointermove", (event) => {
      document.documentElement.style.setProperty("--mx", `${Math.round((event.clientX / window.innerWidth) * 100)}%`);
      document.documentElement.style.setProperty("--my", `${Math.round((event.clientY / window.innerHeight) * 100)}%`);
    }, { passive: true });
  }
}

publicPage = function liquidGlassPublicPage() {
  liquidGlassEnsureStyles();
  const features = [
    ["shield", "Yetki netliği", "Her üye kendi rolüne göre doğru alanı görür; gereksiz kalabalık arayüzden çıkar."],
    ["bell", "Site içi bildirim", "Duyuru, görev, başvuru ve kararlar portal bildirim kutusunda toplanır."],
    ["grid", "Kurul düzeni", "Başkanlık, disiplin, gençlik ve diğer alanlar ayrı ama aynı estetik dilde ilerler."],
    ["clipboard", "Disiplin akışı", "Şikayet, soruşturma, kararname ve rapor süreçleri tek profesyonel alanda yönetilir."],
    ["sparkles", "Modern profil", "Üyeler kısaltma, renk ve profil görünümünü portal içinde güncel tutabilir."],
    ["chart", "Okunur raporlar", "Yönetim ve disiplin raporları resmi, düzenli ve sunuma hazır görünür."]
  ];
  return `
    <a class="skip-link" href="#about">İçeriğe geç</a>
    <div class="public-shell liquid-public">
      <span class="liquid-orb one"></span><span class="liquid-orb two"></span>
      <nav class="site-nav">${brand()}<div class="nav-links"><a href="#about">Hakkımızda</a><a href="#features">Portal</a><a href="#privacy">Güvenlik</a><button class="btn btn-primary btn-sm" data-action="nav-login">${icon("lock")} Giriş Yap</button></div></nav>
      <main>
        <section class="liquid-hero"><div class="liquid-hero-grid">
          <div class="liquid-reveal"><span class="liquid-kicker"><i></i> Topluluk portalı</span><h1 class="liquid-title">İstiklal <span>Hürriyet</span><em>Partisi</em></h1><p class="liquid-lead">Üyelerin, kurulların ve kararların tek yerde toplandığı modern çalışma alanı. Sakin, hızlı ve cam gibi temiz bir portal deneyimi.</p><div class="liquid-actions"><button class="btn btn-primary" data-action="nav-login">Portala Giriş Yap ${icon("arrow")}</button><a class="btn btn-secondary" href="#about">Portalı İncele</a></div></div>
          <aside class="liquid-device liquid-reveal" aria-label="Portal ön izlemesi"><div class="liquid-device-screen"><div class="liquid-window-top"><div class="liquid-dots"><i></i><i></i><i></i></div><span class="liquid-status-pill">Canlı portal</span></div><div class="liquid-preview-brand">${avatar("İHP")}<div><strong>İHP Portalı</strong><span>Güvenli çalışma alanı</span></div></div><div class="liquid-dashboard-strip"><div class="liquid-stat"><span>Kurullar</span><strong>04</strong></div><div class="liquid-stat"><span>Modüller</span><strong>11</strong></div></div><div class="liquid-glass-stack"><div class="liquid-glass-card"><span>Bildirim</span><strong>Portal içi akış</strong></div><div class="liquid-glass-card"><span>Yetki</span><strong>Rol tabanlı erişim</strong></div><div class="liquid-glass-card"><span>Tasarım</span><strong>Liquid glass arayüz</strong></div></div></div></aside>
        </div></section>
        <section class="liquid-section liquid-reveal" id="about"><div class="liquid-section-inner"><div class="liquid-section-head"><span class="liquid-kicker"><i></i> Daha premium</span><h2>Az yazı, net ekran, güçlü his.</h2><p>Portalın amacı kullanıcıyı açıklama metinlerine boğmak değil; doğru işlemi hızlı, güvenli ve güzel bir arayüzle yaptırmak.</p></div></div></section>
        <section class="liquid-section liquid-reveal" id="features"><div class="liquid-section-inner"><div class="liquid-section-head"><span class="liquid-kicker"><i></i> Portal özellikleri</span><h2>Her bölüm daha temiz ayrıldı.</h2></div><div class="liquid-feature-grid">${features.map(([iconName, title, text]) => `<article class="liquid-feature-card"><span class="icon-orb">${icon(iconName)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join("")}</div></div></section>
        <section class="liquid-section liquid-reveal" id="privacy"><div class="liquid-section-inner"><div class="liquid-banner"><div><span class="liquid-kicker"><i></i> Güvenli giriş</span><h2>Portal yalnızca yetkili üyelere açık.</h2><p>Bildirimler, başvurular ve disiplin süreçleri site içinde kalır.</p></div><button class="btn btn-primary" data-action="nav-login">Giriş Yap ${icon("arrow")}</button></div></div></section>
      </main>
    </div>
  `;
};

loginPage = function liquidGlassLoginPage() {
  liquidGlassEnsureStyles();
  return `
    <main class="login-shell liquid-login">
      <span class="liquid-orb one"></span><span class="liquid-orb two"></span>
      <section class="liquid-login-copy liquid-reveal">${brand()}<a class="back-link" href="#/home">${icon("back")} Ana sayfaya dön</a><span class="liquid-kicker"><i></i> Üye girişi</span><h1>Portal <span>erişimi.</span></h1><p>İHP çalışma alanına hesabınızla giriş yapın. Yetkileriniz otomatik uygulanır, gereksiz açıklamalar değil doğrudan kullanacağınız panel görünür.</p></section>
      <section class="login-card liquid-login-card liquid-reveal"><div class="liquid-login-inner"><h2>Giriş yap</h2><p>Portal hesabınızı kullanın.</p><form class="form-stack" data-form="login"><div class="form-group"><label for="login-email">E-posta</label><input class="field" id="login-email" name="email" type="email" autocomplete="email" placeholder="isim@tfo.k12.tr" required /></div><div class="form-group"><label for="login-password">Şifre</label><input class="field" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required minlength="6" /></div><button class="btn btn-primary" type="submit">Giriş Yap ${icon("arrow")}</button></form>${state.config?.configured ? `` : `<div class="setup-box"><strong>Bağlantı gerekli</strong><p class="liquid-login-note">Supabase ayarları bağlandığında giriş açılır.</p></div>`}</div></section>
    </main>
  `;
};
