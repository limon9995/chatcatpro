# ChatCat Pro — Landing Page

Static marketing website for **ChatCat Pro** — no build step, no framework, just optimized HTML/CSS/JS.

---

## 🌐 Live Site
**Production**: [https://chatcat.pro](https://chatcat.pro)

---

## 📁 Structure

```
landing/
├── index.html      # Main landing page (hero, features, pricing, testimonials, FAQ)
├── order.html      # Order/checkout page
├── privacy.html    # Privacy policy
├── robots.txt      # Search engine directives
├── sitemap.xml     # XML sitemap for SEO
├── logo.png        # Favicon / OG image
└── og-image.png    # Open Graph social share image (1200×630)
```

---

## 🎯 Features

- **Zero dependencies** — Single self-contained HTML file with embedded CSS/JS
- **SEO-optimized** — Structured data (JSON-LD), Open Graph, Twitter Cards, FAQ schema
- **Performance** — Preconnect fonts, optimized critical CSS, lazy-loaded images
- **Bilingual ready** — Bangla content with English fallbacks
- **Responsive** — Mobile-first, works on all screen sizes
- **Accessibility** — Semantic HTML, ARIA labels, focus states, reduced motion support

---

## 🚀 Deployment

### VPS (Nginx)
```nginx
server {
    listen 80;
    server_name chatcat.pro www.chatcat.pro;
    root /var/www/chatcatpro/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
```

### Any Static Host
Works on Netlify, Vercel, Cloudflare Pages, GitHub Pages, Firebase Hosting, AWS S3+CloudFront — just upload the `landing/` folder contents.

---

## 🔧 Customization

### Colors & Branding
Edit CSS custom properties in `index.html` `<style>` block:
```css
:root {
  --bg: #050810;
  --surface: #0B1120;
  --accent: #4F6EF7;
  --accent2: #7C9DFF;
  --accent3: #00D4A0;
  --gold: #7C9DFF;
  --green: #00D4A0;
}
```

### Content
- Update copy directly in HTML
- Replace `logo.png` and `og-image.png` with branded assets
- Modify FAQ schema in `<script type="application/ld+json">` blocks

---

## 📊 Analytics
Add Google Analytics / Matomo / Plausible by inserting tracking script before `</head>`:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## 📄 License
MIT License — Part of ChatCat Pro project.