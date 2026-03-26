interface Props {
  dark: boolean;
  setDark: (next: boolean) => void;
  onLogin: () => void;
  onSignup: () => void;
}

const LANDING_HTML = String.raw`<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ChatCat Pro — Facebook Commerce Automation</title>
<meta name="description" content="Facebook Messenger দিয়ে automatic order নিন, OCR দিয়ে product detect করুন, courier booking করুন — সব একজায়গায়।"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#06060a;--surface:#0f0f17;--surface2:#161622;
  --border:rgba(255,255,255,0.07);--text:#f0f0f5;
  --muted:rgba(240,240,245,0.45);--accent:#4f46e5;--accent2:#7c3aed;
  --green:#10b981;--radius:16px;
}
html{scroll-behavior:smooth}
body{font-family:'DM Sans','Noto Sans Bengali',system-ui,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 5%;display:flex;justify-content:space-between;align-items:center;background:rgba(6,6,10,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:#fff}
.logo-text{font-size:17px;font-weight:800;letter-spacing:-0.03em}
.nav-links{display:flex;align-items:center;gap:6px}
.nav-link{padding:7px 16px;border-radius:8px;text-decoration:none;color:var(--muted);font-size:13.5px;font-weight:500;transition:color .15s}
.nav-link:hover{color:var(--text)}
.nav-cta{padding:8px 18px;border-radius:8px;background:var(--accent);color:#fff;font-weight:700;font-size:13.5px;text-decoration:none;transition:opacity .15s}
.nav-cta:hover{opacity:.88}
.nav-login{padding:7px 16px;border-radius:8px;border:1px solid var(--border);color:var(--text);font-weight:600;font-size:13.5px;text-decoration:none;transition:all .15s;background:rgba(255,255,255,0.04)}
.nav-login:hover{background:rgba(255,255,255,0.08)}
.hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 5% 80px;text-align:center;overflow:hidden}
.orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.3;pointer-events:none}
.orb-1{width:500px;height:500px;top:-100px;left:-100px;background:radial-gradient(circle,var(--accent),transparent 70%)}
.orb-2{width:400px;height:400px;bottom:-50px;right:-80px;background:radial-gradient(circle,var(--accent2),transparent 70%)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(79,70,229,0.12);border:1px solid rgba(79,70,229,0.28);font-size:12.5px;font-weight:600;color:#818cf8;margin-bottom:28px}
.hero-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;box-shadow:0 0 8px #4ade80}
.hero h1{font-size:clamp(36px,7vw,78px);font-weight:900;letter-spacing:-0.04em;line-height:1.0;margin-bottom:22px}
.hero h1 span{background:linear-gradient(135deg,#818cf8,#c084fc,#fb923c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{font-size:clamp(15px,2.5vw,19px);color:var(--muted);max-width:580px;line-height:1.7;margin-bottom:40px}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-primary{padding:14px 28px;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;text-decoration:none;transition:all .2s;box-shadow:0 2px 20px rgba(79,70,229,.5);display:inline-flex;align-items:center;gap:8px}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(79,70,229,.5)}
.btn-ghost{padding:14px 28px;border-radius:10px;border:1px solid var(--border);color:var(--text);font-weight:600;font-size:15px;text-decoration:none;transition:all .2s;display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04)}
.btn-ghost:hover{background:rgba(255,255,255,0.08)}
.hero-img{position:relative;margin-top:64px;width:100%;max-width:900px;border-radius:18px;overflow:hidden;border:1px solid var(--border);box-shadow:0 32px 80px rgba(0,0,0,.6)}
.mockup-bar{background:var(--surface);height:44px;display:flex;align-items:center;padding:0 16px;gap:8px;border-bottom:1px solid var(--border)}
.dot{width:11px;height:11px;border-radius:50%}
.mockup-content{background:var(--surface);padding:20px;display:grid;grid-template-columns:180px 1fr;gap:16px;min-height:320px}
.mock-sidebar{display:flex;flex-direction:column;gap:4px}
.mock-nav{height:32px;border-radius:7px;background:rgba(255,255,255,.04)}
.mock-nav.active{background:rgba(79,70,229,.15)}
.mock-main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-content:start}
.mock-card{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:14px}
.mock-num{font-size:22px;font-weight:900;color:var(--accent)}
.mock-label{font-size:10px;color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.stats-bar{display:flex;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:4px;margin:0 5%;flex-wrap:wrap}
.stat{flex:1;min-width:160px;text-align:center;padding:20px 16px;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.stat-num{font-size:28px;font-weight:900;letter-spacing:-0.04em}
.stat-label{font-size:11.5px;color:var(--muted);margin-top:4px;font-weight:500}
.section{padding:100px 5%}
.section-label{display:inline-block;font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px}
.section-title{font-size:clamp(28px,5vw,48px);font-weight:800;letter-spacing:-0.04em;line-height:1.1;margin-bottom:14px}
.section-sub{font-size:17px;color:var(--muted);max-width:500px;line-height:1.7}
.features-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:56px}
.feature-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;transition:all .25s;position:relative;overflow:hidden}
.feature-card:hover{transform:translateY(-3px);border-color:rgba(79,70,229,.3);box-shadow:0 12px 40px rgba(79,70,229,.12)}
.feature-icon{font-size:28px;margin-bottom:14px}
.feature-title{font-size:16px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.feature-desc{font-size:13.5px;color:var(--muted);line-height:1.7}
.feature-tag{display:inline-block;margin-top:14px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(79,70,229,.12);color:#818cf8;border:1px solid rgba(79,70,229,.2)}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0;margin-top:56px}
.step{padding:32px;position:relative;border-right:1px solid var(--border)}
.step:last-child{border-right:none}
.step-num{width:40px;height:40px;border-radius:10px;background:rgba(79,70,229,.12);border:1px solid rgba(79,70,229,.2);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:var(--accent);margin-bottom:16px}
.step-title{font-size:15.5px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.step-desc{font-size:13.5px;color:var(--muted);line-height:1.7}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:56px;max-width:960px;margin-left:auto;margin-right:auto}
.pricing-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:32px;text-align:left;transition:all .2s}
.pricing-card.featured{border-color:rgba(79,70,229,.4);box-shadow:0 20px 60px rgba(79,70,229,.12)}
.pricing-name{font-size:14px;font-weight:700;color:var(--muted);margin-bottom:8px}
.pricing-price{font-size:44px;font-weight:900;letter-spacing:-0.05em;line-height:1}
.pricing-period{font-size:13px;color:var(--muted);margin-top:8px}
.pricing-features{list-style:none;margin:28px 0;display:flex;flex-direction:column;gap:12px}
.pricing-features li{font-size:14px;color:var(--text);display:flex;align-items:flex-start;gap:10px;line-height:1.5}
.pricing-features li::before{content:'✓';color:#10b981;font-weight:900}
.pricing-btn{display:block;text-align:center;padding:12px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;transition:all .15s}
.pricing-btn.primary{background:var(--accent);color:#fff;box-shadow:0 2px 12px rgba(79,70,229,.4)}
.pricing-btn.ghost{border:1px solid var(--border);color:var(--text);background:rgba(255,255,255,.04)}
.badge-popular{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(79,70,229,.15);color:#818cf8;font-size:11px;font-weight:700;border:1px solid rgba(79,70,229,.3);margin-bottom:10px}
.cta{margin:0 5% 80px;padding:64px;text-align:center;background:linear-gradient(135deg,var(--surface),rgba(79,70,229,.06));border:1px solid rgba(79,70,229,.2);border-radius:24px;position:relative;overflow:hidden}
.cta h2{font-size:clamp(24px,5vw,44px);font-weight:800;letter-spacing:-0.04em;margin-bottom:14px}
.cta p{font-size:16px;color:var(--muted);margin-bottom:32px;max-width:500px;margin-left:auto;margin-right:auto}
footer{border-top:1px solid var(--border);padding:40px 5%;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.footer-copy{font-size:13.5px;color:var(--muted)}
.footer-links{display:flex;gap:20px}
.footer-link{font-size:13.5px;color:var(--muted);text-decoration:none;transition:color .15s}
.footer-link:hover{color:var(--text)}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.fade-up{animation:fadeUp .6s ease forwards;opacity:0}
.delay-1{animation-delay:.1s}.delay-2{animation-delay:.2s}.delay-3{animation-delay:.3s}
@media(max-width:768px){
  .steps{grid-template-columns:1fr}
  .step{border-right:none;border-bottom:1px solid var(--border)}
  .step:last-child{border-bottom:none}
  .mockup-content{grid-template-columns:1fr}
  .mock-sidebar{display:none}
  .hero-btns{flex-direction:column;align-items:center}
  .cta{padding:40px 24px;margin:0 20px 60px}
  footer{flex-direction:column;text-align:center}
  nav .nav-links .nav-link{display:none}
  nav .nav-login{display:none}
}
</style>
</head>
<body>
<nav>
  <div class="logo">
    <div class="logo-icon">🐱</div>
    <span class="logo-text">ChatCat Pro</span>
  </div>
  <div class="nav-links">
    <a href="#features" class="nav-link">Features</a>
    <a href="#how-it-works" class="nav-link">How it works</a>
    <a href="#pricing" class="nav-link">Pricing</a>
    <a href="#contact" class="nav-link">Get Started</a>
    <a id="nav-login" href="#" class="nav-login">Login</a>
    <a id="nav-signup" href="#" class="nav-cta">Sign Up →</a>
  </div>
</nav>
<section class="hero">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="hero-badge fade-up">🚀 Beta — সীমিত সংখ্যক client নেওয়া হচ্ছে</div>
  <h1 class="fade-up delay-1">
    Facebook Commerce<br/><span>Autopilot এ চলুক</span>
  </h1>
  <p class="hero-sub fade-up delay-2">
    Messenger দিয়ে automatic order নিন। Screenshot থেকে product detect করুন।
    Courier থেকে accounting — সব এক dashboard এ।
  </p>
  <div class="hero-btns fade-up delay-3">
    <a href="#contact" class="btn-primary">▶ Free Demo নিন</a>
    <a id="hero-signup" href="#" class="btn-primary" style="background:linear-gradient(135deg,var(--accent2),var(--accent))">🚀 Dashboard এ যান</a>
    <a href="#features" class="btn-ghost">Features দেখুন →</a>
  </div>
  <div class="hero-img fade-up delay-3">
    <div class="mockup-bar">
      <div class="dot" style="background:#ff5f57"></div>
      <div class="dot" style="background:#febc2e"></div>
      <div class="dot" style="background:#28c840"></div>
      <div style="flex:1;text-align:center;font-size:12px;opacity:.3">ChatCat Pro Dashboard</div>
    </div>
    <div class="mockup-content">
      <div class="mock-sidebar">
        <div class="mock-nav active"></div>
        <div class="mock-nav" style="width:80%"></div>
        <div class="mock-nav" style="width:90%"></div>
        <div class="mock-nav" style="width:70%"></div>
        <div style="height:1px;background:var(--border);margin:8px 0"></div>
        <div class="mock-nav" style="width:75%"></div>
        <div class="mock-nav" style="width:65%"></div>
      </div>
      <div class="mock-main">
        <div class="mock-card">
          <div class="mock-num" style="color:#10b981">৳৮৪,৩২০</div>
          <div class="mock-label">This Month</div>
          <div style="font-size:11px;color:#10b981;margin-top:6px">↑ 23% vs last month</div>
        </div>
        <div class="mock-card">
          <div class="mock-num">১৪৭</div>
          <div class="mock-label">Orders</div>
          <div style="font-size:11px;color:#818cf8;margin-top:6px">↑ 18% vs last week</div>
        </div>
        <div class="mock-card">
          <div class="mock-num" style="color:#f59e0b">23</div>
          <div class="mock-label">Pending</div>
        </div>
        <div class="mock-card" style="grid-column:1/-1;background:rgba(79,70,229,.06);border-color:rgba(79,70,229,.2)">
          <div style="font-size:10px;font-weight:700;opacity:.4;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Recent Orders</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Rahim Hossain</span><span style="color:#10b981;font-weight:700">Confirmed</span><span style="color:var(--muted)">৳1,250</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Karim Ahmed</span><span style="color:#f59e0b;font-weight:700">Pending</span><span style="color:var(--muted)">৳850</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px"><span>Fatema Begum</span><span style="color:#10b981;font-weight:700">Confirmed</span><span style="color:var(--muted)">৳2,100</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<div class="stats-bar">
  <div class="stat"><div class="stat-num" style="color:#4f46e5">৯৯%</div><div class="stat-label">Order accuracy</div></div>
  <div class="stat"><div class="stat-num" style="color:#10b981">৩x</div><div class="stat-label">Faster processing</div></div>
  <div class="stat"><div class="stat-num">২৪/৭</div><div class="stat-label">Bot always active</div></div>
  <div class="stat"><div class="stat-num" style="color:#f59e0b">দ্রুত</div><div class="stat-label">Team response workflow</div></div>
</div>
<section class="section" id="features">
  <div style="max-width:1100px;margin:0 auto">
    <span class="section-label">Features</span>
    <h2 class="section-title">আপনার business এর জন্য যা দরকার</h2>
    <p class="section-sub">Manual কাজ কমান। Bot দিয়ে বেশি order নিন।</p>
    <div class="features-grid">
      <div class="feature-card"><div class="feature-icon">🤖</div><div class="feature-title">Smart Bot Automation</div><div class="feature-desc">Customer message করলে bot product info দেবে, order নেবে, confirm করবে। ২৪/৭।</div><span class="feature-tag">Messenger API</span></div>
      <div class="feature-card"><div class="feature-icon">📸</div><div class="feature-title">OCR Product Detection</div><div class="feature-desc">Screenshot থেকে product code detect। Multiple image-processing pass দিয়ে matching improve করা হয়।</div><span class="feature-tag">AI-Powered</span></div>
      <div class="feature-card"><div class="feature-icon">🚚</div><div class="feature-title">Courier Integration</div><div class="feature-desc">Pathao, Steadfast, RedX, Paperfly — এক জায়গা থেকে। Bulk booking, tracking।</div><span class="feature-tag">4 Couriers</span></div>
      <div class="feature-card"><div class="feature-icon">💰</div><div class="feature-title">Full Accounting</div><div class="feature-desc">Revenue, expenses, returns — automatic। Profit হিসাব, growth comparison, export।</div><span class="feature-tag">Auto Sync</span></div>
      <div class="feature-card"><div class="feature-icon">👥</div><div class="feature-title">Customer CRM</div><div class="feature-desc">Order history, tags, notes। Top buyers, best products ranking।</div><span class="feature-tag">Built-in CRM</span></div>
      <div class="feature-card"><div class="feature-icon">📢</div><div class="feature-title">Broadcast & Follow-up</div><div class="feature-desc">নতুন collection launch? Broadcast পাঠান। Follow-up ও delivery workflow centrally manage করুন।</div><span class="feature-tag">Smart Automation</span></div>
      <div class="feature-card"><div class="feature-icon">🛍️</div><div class="feature-title">Product Catalog</div><div class="feature-desc">Public URL। Photo, demo video, price। Order করতে Messenger এ redirect।</div><span class="feature-tag">Public Page</span></div>
      <div class="feature-card"><div class="feature-icon">📊</div><div class="feature-title">Analytics Dashboard</div><div class="feature-desc">Week vs last week growth। Best products। Order streak। Animated, real-time।</div><span class="feature-tag">Live Data</span></div>
      <div class="feature-card"><div class="feature-icon">🔒</div><div class="feature-title">Secure & Reliable</div><div class="feature-desc">AES-256 encryption, webhook signature verification, rate limiting। Multi-tenant।</div><span class="feature-tag">Production Ready</span></div>
    </div>
  </div>
</section>
<section class="section" id="how-it-works" style="background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
  <div style="max-width:1100px;margin:0 auto">
    <span class="section-label">How it works</span>
    <h2 class="section-title">৪ ধাপে শুরু করুন</h2>
    <div class="steps" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <div class="step"><div class="step-num">1</div><div class="step-title">Facebook Page Connect</div><div class="step-desc">Page token দিয়ে page connect করুন। কয়েক মিনিটেই setup complete।</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-title">Products যোগ করুন</div><div class="step-desc">Code, দাম, ছবি, video add করুন। Catalog automatically তৈরি।</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-title">Bot Activate করুন</div><div class="step-desc">Bot Knowledge set করুন। এক click এ automation on।</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-title">Order Flow চালু করুন</div><div class="step-desc">Bot routine reply ও order capture handle করবে, team confirm ও follow-up manage করবে।</div></div>
    </div>
  </div>
</section>
<section class="section" id="pricing">
  <div style="max-width:1100px;margin:0 auto;text-align:center">
    <span class="section-label">Pricing</span>
    <h2 class="section-title">আপনার business-এর জন্য<br>সেরা plan</h2>
    <p class="section-sub" style="margin:0 auto">কোনো hidden charge নেই। আপনার page-এর size অনুযায়ী সবচেয়ে suitable pricing পাবেন।</p>
    <div style="max-width:480px;margin:48px auto 0">
      <div class="pricing-card featured" style="position:relative;overflow:hidden;padding:36px 36px 32px">
        <div style="position:absolute;top:-40px;right:-40px;width:180px;height:180px;background:radial-gradient(circle,rgba(79,70,229,.18),transparent 70%);pointer-events:none"></div>
        <div class="badge-popular" style="margin-bottom:14px">✦ Custom Plan</div>
        <div class="pricing-name" style="font-size:15px;margin-bottom:6px">আপনার Page অনুযায়ী</div>
        <div class="pricing-price" style="font-size:52px;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Custom<span style="font-size:18px;-webkit-text-fill-color:var(--muted);color:var(--muted)">&nbsp;মূল্য</span></div>
        <div class="pricing-period" style="margin-bottom:28px">আপনার page-এর orders ও size অনুযায়ী নির্ধারিত হয়</div>
        <ul class="pricing-features" style="text-align:left;margin-bottom:32px">
          <li>Bot Automation — ২৪/৭ auto reply</li>
          <li>OCR — photo থেকে product detect</li>
          <li>Courier Integration (Pathao, Steadfast, RedX…)</li>
          <li>CRM + Broadcast + Follow-up</li>
          <li>Full Accounting Dashboard</li>
          <li>Product Catalog — public page</li>
          <li>Call Confirm System</li>
          <li>Unlimited orders & pages</li>
          <li>Dedicated support</li>
        </ul>
        <a href="#contact" class="pricing-btn primary" style="font-size:15px;padding:14px;border-radius:12px;box-shadow:0 4px 20px rgba(79,70,229,.45);letter-spacing:.01em">
          আজকেই শুরু করুন →
        </a>
      </div>
    </div>
    <div style="margin:28px auto 0;max-width:560px;background:linear-gradient(135deg,rgba(79,70,229,.08),rgba(124,58,237,.06));border:1px solid rgba(79,70,229,.25);border-radius:16px;padding:22px 28px;display:flex;align-items:center;gap:18px;text-align:left;flex-wrap:wrap;justify-content:center">
      <div style="font-size:32px;line-height:1">💬</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:800;font-size:14.5px;color:var(--text);margin-bottom:4px">আপনার page-এর জন্য best pricing জানতে চান?</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.6">Orders কত, pages কয়টা — জানালেই আমরা আপনার জন্য সবচেয়ে সুলভ plan suggest করব।</div>
      </div>
      <a href="#contact" style="display:inline-flex;align-items:center;gap:7px;padding:11px 22px;background:var(--accent);color:#fff;border-radius:10px;font-weight:700;font-size:13.5px;text-decoration:none;white-space:nowrap;box-shadow:0 2px 12px rgba(79,70,229,.35);transition:all .15s;flex-shrink:0">
        যোগাযোগ করুন ✦
      </a>
    </div>
  </div>
</section>
<div class="cta" id="contact">
  <h2>আজকেই শুরু করুন</h2>
  <p>Free demo নিন। Live দেখান কীভাবে কাজ করে।</p>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
    <a id="cta-signup" href="#" class="btn-primary">🚀 Sign Up করুন</a>
    <a id="cta-login" href="#" class="btn-ghost">🔑 Login করুন</a>
    <a href="https://www.facebook.com/Chatcatpro" target="_blank" rel="noopener" class="btn-ghost">💬 Demo নিন</a>
  </div>
</div>
<footer>
  <div>
    <div class="logo" style="margin-bottom:6px">
      <div class="logo-icon" style="width:26px;height:26px;font-size:13px">D</div>
      <span class="logo-text" style="font-size:14px">ChatCat Pro</span>
    </div>
    <div class="footer-copy">© 2025 ChatCat Pro. All rights reserved.</div>
  </div>
  <div class="footer-links">
    <a href="#features" class="footer-link">Features</a>
    <a href="#pricing" class="footer-link">Pricing</a>
    <a href="#contact" class="footer-link">Contact</a>
  </div>
</footer>
<script>
const DASHBOARD_URL = (function() {
  var meta = document.querySelector('meta[name="dashboard-url"]');
  if (meta) {
    var content = meta.getAttribute('content');
    if (content && content !== 'null' && content !== 'undefined') return content;
  }
  return window.location.origin;
})();
['nav-login','cta-login','hero-signup'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) {
    el.href = DASHBOARD_URL + '/?mode=login';
    el.target = '_top';
  }
});
['nav-signup','cta-signup'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) {
    el.href = DASHBOARD_URL + '/?mode=signup';
    el.target = '_top';
  }
});
const observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) { if(e.isIntersecting){ e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }});
}, {threshold:0.08});
document.querySelectorAll('.feature-card,.step,.pricing-card').forEach(function(el, i) {
  el.style.cssText += ';opacity:0;transform:translateY(20px);transition:opacity .5s ease,transform .5s ease';
  el.style.transitionDelay = (i % 3 * 0.08) + 's';
  observer.observe(el);
});
</script>
</body>
</html>`;

export function LandingPage(_props: Props) {
  return (
    <iframe
      title="ChatCat Pro Landing"
      srcDoc={LANDING_HTML}
      style={{
        width: '100%',
        minHeight: '100vh',
        border: 'none',
        display: 'block',
        background: '#06060a',
      }}
    />
  );
}
