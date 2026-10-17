const {chromium} = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');
const [url, out, sel] = process.argv.slice(2);
const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport: {width: 1440, height: 900}});
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200))); p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
await p.addInitScript(a => { try { localStorage.setItem('pai:appearance', a); } catch {} }, JSON.stringify({theme: process.env.THEME || 'case-night'}));
await p.goto(url, {waitUntil: 'networkidle', timeout: 300000});
await p.waitForTimeout(3000);
if (sel) { for (const s of sel.split('||')) { if (s.startsWith('select:')) { const [q, v] = s.slice(7).split('='); await p.selectOption(q, v); } else await p.click(s); await p.waitForTimeout(1500); } }
await p.screenshot({path: out, fullPage: Boolean(process.env.FULL)});
console.log(errs.join('\n'));
await b.close();
