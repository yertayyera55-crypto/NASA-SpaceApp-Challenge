"""Browser check for the rebuilt user journey. Start the app, then run this script."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.getenv("BASE_URL", "http://localhost:3000")
out = Path(__file__).resolve().parents[1] / "screenshots"
out.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(base, wait_until="networkidle")
    assert "Explore Other Worlds" in page.locator("h1").inner_text()
    page.screenshot(path=str(out / "home.png"), full_page=True)
    page.get_by_role("link", name="Start Exploring").click()
    page.wait_for_url("**/select")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    assert page.locator(".world").count() == 2
    page.screenshot(path=str(out / "select.png"), full_page=True)
    page.locator(".world-moon").click()
    page.wait_for_url("**/explore")
    page.wait_for_load_state("networkidle")
    assert page.locator("html").get_attribute("data-planet") == "moon"
    assert page.locator(".planet-map-canvas").count() == 1
    page.locator(".planet-map-canvas").click(position={"x": 400, "y": 260})
    assert "LAT" in page.locator(".map-crosshair").inner_text()
    page.get_by_role("button", name="Geology", exact=True).click()
    assert "visual reference only" in page.locator(".map-credit").inner_text()
    page.screenshot(path=str(out / "explore-moon.png"), full_page=True)
    page.get_by_role("button", name="Mars", exact=True).click()
    page.wait_for_timeout(1200)
    assert page.locator("html").get_attribute("data-planet") == "mars"
    page.locator(".filter-accordion").first.locator("input[type=checkbox]").check()
    assert page.locator(".search-action").is_enabled()
    page.screenshot(path=str(out / "explore-mars.png"), full_page=True)
    page.locator(".search-action").click()
    page.wait_for_url("**/results", timeout=45000)
    page.wait_for_load_state("networkidle")
    assert page.locator(".result-strip button").count() == 5
    page.wait_for_function("document.querySelector('.result-photo img')?.naturalWidth > 0", timeout=15000)
    first = page.locator(".result-information h2").inner_text()
    page.get_by_role("button", name="Next candidate").click()
    page.wait_for_function("old => document.querySelector('.result-information h2')?.textContent !== old", arg=first)
    assert page.locator(".result-information h2").inner_text() != first
    page.screenshot(path=str(out / "results.png"), full_page=True)
    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(base + "/select", wait_until="networkidle")
    assert not mobile.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    mobile.screenshot(path=str(out / "select-mobile.png"), full_page=True)
    mobile.goto(base + "/explore", wait_until="networkidle")
    assert not mobile.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    mobile.screenshot(path=str(out / "explore-mobile.png"), full_page=True)
    assert not errors, errors
    print("Smoke check passed: selection, theme wave, both maps, coordinates, search, imagery, carousel, mobile layout.")
    browser.close()
