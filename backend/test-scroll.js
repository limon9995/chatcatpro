const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3000', { waitUntil: 'load' });
  
  // Click features
  await page.click('a[href="#features"].nav-link');
  // Read vertical scroll position
  const scrollY = await page.evaluate(() => window.scrollY);
  console.log('Scroll Y after click:', scrollY);
  
  await browser.close();
})();
