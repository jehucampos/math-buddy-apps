#!/usr/bin/env python3
"""Fraction Buddy — real-browser layout gate (Playwright + Chromium).

jsdom has no layout engine, so the mobile layout guarantees are checked
here in real Chromium with touch emulation (=> pointer: coarse):
  * no horizontal page/row overflow at 320px and 375px, with max-length
    values and error messages showing
  * no 6-digit value is clipped inside its box (mobile + desktop)
  * operator buttons are >= 44px tall on touch
  * the result sits ABOVE the rows and stays pinned (sticky) while the
    last row is edited in a keypad-sized viewport; below on desktop
  * the link-back strip is balanced between its two rules (no blank band)
  * term rows balanced: centered under the picker on wide screens, evenly
    spaced on phones (<=480px)
  * header "More tools" menu (v1.3.0): button in the viewport, clear of the
    title/subtitle/version, >= 44px on touch; icon-only 44x44 at <= 600px and
    "Tools" text wider; on the title row from 360px up; open menu fully on
    screen and on top of the page (above the BMC welcome bubble and sticky result)
  * zero page errors
Run: python3 core/layout-check.py   (exit 0 = pass, 2 = no browser: skipped)
"""
import asyncio, glob, os, sys
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("[layout] SKIPPED — playwright not installed"); sys.exit(2)

HTML = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fraction-buddy.html"))
exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") or [None])[0]
SHOTS = os.path.join(os.path.dirname(__file__), "..", ".browser-shots")
os.makedirs(SHOTS, exist_ok=True)
passed = failed = 0
def ok(c, msg):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("  FAIL:", msg)

async def page_for(b, **opts):
    ctx = await b.new_context(device_scale_factor=1, **opts)
    p = await ctx.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await p.route("**/*", lambda r: r.abort() if not r.request.url.startswith("file:") else r.continue_())
    await p.goto(HTML); await p.wait_for_selector(".fb-result-main")
    return ctx, p, errs

async def main():
    async with async_playwright() as pw:
        try:
            b = await pw.chromium.launch(executable_path=exe, args=["--no-sandbox"]) if exe else await pw.chromium.launch()
        except Exception as e:
            print("[layout] SKIPPED — no Chromium:", e); sys.exit(2)
        ins = lambda p: p.locator("input.fb-in")
        for W in (320, 375):
            ctx, p, errs = await page_for(b, viewport={"width": W, "height": 700}, is_mobile=True, has_touch=True)
            ok(await p.evaluate("matchMedia('(pointer: coarse)').matches"), f"{W}: touch emulation => pointer coarse")
            ok(await p.evaluate("document.querySelector('.fb-result-sec').getBoundingClientRect().top < document.querySelector('.fb-section:not(.fb-result-sec)').getBoundingClientRect().top"), f"{W}: result above rows")
            for i in range(6): await ins(p).nth(i).fill("888888")
            await p.locator(".fb-add").tap()
            await ins(p).nth(7).fill("888888")                     # num without den -> error line
            ok(await p.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{W}: no page overflow")
            ok(not await p.evaluate("[...document.querySelectorAll('.fb-term')].some(t=>t.scrollWidth>t.clientWidth+1)"), f"{W}: no row overflow (with error line)")
            ok(await p.evaluate("[...document.querySelectorAll('input.fb-in')].every(i=>i.scrollWidth<=i.clientWidth)"), f"{W}: no clipped 6-digit values")
            ok(await p.evaluate("document.querySelector('.fb-opbtn').getBoundingClientRect().height >= 44"), f"{W}: operator targets >= 44px")
            gaps = await p.evaluate("[...document.querySelectorAll('.fb-term')].map(t=>Math.round(t.querySelector('.fb-del').getBoundingClientRect().left - t.querySelector('.fb-infrac').getBoundingClientRect().right))")
            ok(all(g >= 4 for g in gaps), f"{W}: delete button never overlaps the value cluster (gaps {gaps}px)")
            ok(not errs, f"{W}: page errors {errs}")
            await ctx.close()
        # sticky while editing the 5th row in a keypad-sized viewport
        ctx, p, errs = await page_for(b, viewport={"width": 375, "height": 420}, is_mobile=True, has_touch=True)
        for _ in range(3): await p.locator(".fb-add").tap()
        await ins(p).last.click(); await ins(p).last.fill("8"); await ins(p).nth(13).fill("5")
        await p.wait_for_timeout(50)
        ok(await p.evaluate("scrollY") > 100, "sticky: page actually scrolled")
        ok(abs(await p.evaluate("document.querySelector('.fb-result-sec').getBoundingClientRect().top")) <= 1, "sticky: result pinned at top")
        ok(await p.evaluate("(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"), "sticky: focused box still visible")
        ok(await p.get_attribute(".fb-result-main", "aria-label") == "1\u20093/8", "sticky: 1/2+1/4+5/8 = 1 3/8 with blank rows skipped")
        await ctx.close()
        # v1.2.1/v1.2.2 regression: the link-back strip is balanced between its two
        # rules (measured to the visible divider, not the footer's outer box)
        band_js = """(()=>{const a=document.querySelector('.fb-family');const r=document.createRange();r.selectNodeContents(a);
          const t=r.getBoundingClientRect(),box=a.getBoundingClientRect(),hr=document.querySelector('footer#about hr').getBoundingClientRect();
          return [t.top-box.top, hr.top-t.bottom]})()"""
        for vp, mob in (({"width": 805, "height": 1400}, False), ({"width": 390, "height": 844}, True)):
            kw = dict(is_mobile=True, has_touch=True) if mob else {}
            ctx, p, errs = await page_for(b, viewport=vp, **kw)
            above, below = await p.evaluate(band_js)
            ok(abs(above - below) <= 3 and below <= 24, f"{vp['width']}x{vp['height']}: link strip above {round(above)}px vs below {round(below)}px (want balanced, <= 24)")
            await ctx.close()
        # v1.2.3/v1.2.4: term rows balanced — centered group under the picker on wide
        # screens; on phones (<=480px) equal spacing between all row items and edges.
        bal_js = """(()=>{const c=x=>{const r=x.getBoundingClientRect();return r.left+r.width/2};
          const rows=[...document.querySelectorAll('.fb-term')], pick=document.querySelector('.fb-ops');
          return rows.map(t=>{const g=t.querySelector('.fb-infrac').parentElement;
            const b=t.getBoundingClientRect(), cs=getComputedStyle(t);
            const items=[t.querySelector('.fb-op,.fb-opbadge'),t.querySelector('input.fb-whole'),t.querySelector('.fb-infrac'),t.querySelector('.fb-del')].map(e=>e.getBoundingClientRect());
            const L=b.left+parseFloat(cs.borderLeftWidth)+parseFloat(cs.paddingLeft), R=b.right-parseFloat(cs.borderRightWidth)-parseFloat(cs.paddingRight);
            const gaps=[items[0].left-L, ...items.slice(1).map((r,i)=>r.left-items[i].right), R-items[3].right];
            const gr=g.getBoundingClientRect(); const cc=items[0].left+(items[2].right-items[0].left)/2;
            return {rowC:Math.abs(cc-c(t)), pickC:Math.abs(cc-c(pick)), gaps:gaps.map(Math.round)}})})()"""
        for vp, mob, mode in (({"width": 1024, "height": 800}, False, "centered"), ({"width": 600, "height": 800}, True, "centered"),
                              ({"width": 390, "height": 844}, True, "even"), ({"width": 320, "height": 700}, True, "even")):
            kw = dict(is_mobile=True, has_touch=True) if mob else {}
            ctx, p, errs = await page_for(b, viewport=vp, **kw)
            rows = await p.evaluate(bal_js)
            if mode == "centered":
                ok(all(r["rowC"] <= 3 and r["pickC"] <= 3 for r in rows), f"{vp['width']}: group centered in row and under picker {rows}")
            else:
                ok(all(max(r["gaps"]) - min(r["gaps"]) <= 2 and min(r["gaps"]) >= 4 for r in rows), f"{vp['width']}: equal spacing across the row {[r['gaps'] for r in rows]}")
            await ctx.close()
        # v1.3.0: header family menu, real layout
        nav_js = """(()=>{const bx=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height}};
          const hit=(a,c)=>a.l<c.r-0.5&&c.l<a.r-0.5&&a.t<c.b-0.5&&c.t<a.b-0.5;
          const btn=bx(document.querySelector('.fb-nav-btn'));
          const others=['.fb-title','.fb-subtitle','.fb-version'].filter(s=>hit(btn,bx(document.querySelector(s))));
          const cs=s=>getComputedStyle(document.querySelector(s)).display!=='none';
          return {btn, others, vw:innerWidth, head:bx(document.querySelector('.fb-header')).h, title:bx(document.querySelector('.fb-title')),
            ico:cs('.fb-nav-ico'), txt:cs('.fb-nav-txt')}})()"""
        menu_js = """(()=>{const m=document.querySelector('.fb-nav-menu');if(!m)return null;const r=m.getBoundingClientRect();
          const top=[...m.querySelectorAll('.fb-nav-item')].map(e=>{const q=e.getBoundingClientRect();const x=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);return !!x&&e.contains(x)});
          return {l:r.left,r:r.right,b:r.bottom,vw:innerWidth,vh:innerHeight,top}})()"""
        for vp, mob in (({"width": 320, "height": 700}, True), ({"width": 360, "height": 740}, True), ({"width": 390, "height": 844}, True),
                        ({"width": 844, "height": 390}, True), ({"width": 768, "height": 1024}, True), ({"width": 1024, "height": 800}, False)):
            kw = dict(is_mobile=True, has_touch=True) if mob else {}
            ctx, p, errs = await page_for(b, viewport=vp, **kw)
            tag = f"{vp['width']}x{vp['height']} nav"
            n = await p.evaluate(nav_js)
            print(f"  INFO {tag}: header {round(n['head'])}px tall, button {round(n['btn']['l'])}-{round(n['btn']['r'])} of {n['vw']}")
            ok(n["btn"]["l"] >= 0 and n["btn"]["r"] <= n["vw"] + 0.5, f"{tag}: button inside the viewport {n['btn']}")
            ok(not n["others"], f"{tag}: button overlaps {n['others']}")
            if mob: ok(n["btn"]["h"] >= 44, f"{tag}: touch target {n['btn']['h']}px (want >= 44)")
            if n["vw"] <= 600:
                bw = n["btn"]["r"] - n["btn"]["l"]
                ok(n["ico"] and not n["txt"] and round(bw) == 44 and round(n["btn"]["h"]) == 44, f"{tag}: icon-only 44x44 button (ico {n['ico']} txt {n['txt']} {round(bw)}x{round(n['btn']['h'])})")
            else:
                ok(n["txt"] and not n["ico"], f"{tag}: 'Tools' label on wide screens (ico {n['ico']} txt {n['txt']})")
            if n["vw"] >= 360:
                ok(n["btn"]["t"] < n["title"]["b"] and n["btn"]["b"] > n["title"]["t"], f"{tag}: button shares the title row (btn {n['btn']} title {n['title']})")
            await (p.locator(".fb-nav-btn").tap() if mob else p.locator(".fb-nav-btn").click())
            await p.wait_for_timeout(80)
            m = await p.evaluate(menu_js)
            ok(m and m["l"] >= 0 and m["r"] <= m["vw"] + 0.5 and m["b"] <= m["vh"] + 0.5, f"{tag}: menu fully on screen {m}")
            ok(m and len(m["top"]) == 3 and all(m["top"]), f"{tag}: all 3 menu items visible on top {m and m['top']}")
            await p.screenshot(path=os.path.join(SHOTS, f"nav-{vp['width']}x{vp['height']}.png"))
            await (p.locator(".fb-title").tap() if mob else p.keyboard.press("Escape"))
            await p.wait_for_timeout(80)
            ok(await p.locator(".fb-nav-menu").count() == 0, f"{tag}: menu closes")
            ok(not errs, f"{tag}: page errors {errs}")
            await ctx.close()
        # desktop
        ctx, p, errs = await page_for(b, viewport={"width": 1024, "height": 800})
        ok(not await p.evaluate("matchMedia('(pointer: coarse)').matches"), "desktop: pointer fine")
        ok(await p.evaluate("document.querySelector('.fb-result-sec').getBoundingClientRect().top > document.querySelector('.fb-section').getBoundingClientRect().top"), "desktop: result below rows")
        for i in range(6): await ins(p).nth(i).fill("888888")
        ok(await p.evaluate("[...document.querySelectorAll('input.fb-in')].every(i=>i.scrollWidth<=i.clientWidth)"), "desktop: no clipped 6-digit values")
        ok(not errs, f"desktop: page errors {errs}")
        await ctx.close(); await b.close()
    print(f"[layout] {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
asyncio.run(main())
