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
