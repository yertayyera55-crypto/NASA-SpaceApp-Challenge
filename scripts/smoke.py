"""Verify the explorer against a running Next.js app and FastAPI service."""
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = os.getenv("BASE_URL", "http://localhost:3000")
OUT = Path(__file__).resolve().parents[1] / "screenshots"
OUT.mkdir(exist_ok=True)


def choose_cell(page, survey):
    page.get_by_label("Survey area").select_option(survey)
    select = page.get_by_label("Mapped cell")
    expect(select.locator("option").nth(1)).to_be_attached()
    select.select_option(index=1)
    expect(page.get_by_role("heading", name="Selected cell")).to_be_visible()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text)
            if message.type == "error" and "/api/earth-imagery" not in message.location.get("url", "") else None)
    page.goto(BASE, wait_until="networkidle")
    expect(page).to_have_title("FindY")
    expect(page.get_by_role("link", name="FindY home")).to_be_visible()
    expect(page.get_by_role("heading", name="Explore Other Worlds.", exact=False)).to_be_visible()
    page.screenshot(path=OUT / "home.png")
    page.get_by_role("link", name="Start Exploring").click()
    expect(page.locator(".world-option")).to_have_count(2)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=OUT / "select.png")
    page.get_by_role("button", name="Moon Haworth", exact=False).click()
    expect(page.locator("html")).to_have_attribute("data-planet", "moon")
    expect(page.get_by_text("84 measured cells")).to_be_visible()
    choose_cell(page, "polar")
    page.get_by_role("button", name="Find Earth Analogs").click()
    expect(page.get_by_role("heading", name="No comparable Earth patches")).to_be_visible()
    page.get_by_role("link", name="Back to the map").click()
    choose_cell(page, "haworth")
    expect(page.get_by_label("Map layer")).to_have_value("slope_p90_deg")
    page.get_by_label("Map layer").select_option("local_relief_m")
    expect(page.locator(".map-scale")).to_contain_text(" m")
    page.get_by_role("button", name="Zoom in").click()
    expect(page.get_by_role("button", name="Reset zoom")).to_be_enabled()
    page.get_by_role("button", name="Reset zoom").click()
    page.screenshot(path=OUT / "explore-moon.png")
    page.get_by_role("button", name="Find Earth Analogs").click()
    expect(page.get_by_role("heading", name="Earth analogs", exact=True)).to_be_visible()
    expect(page.get_by_role("table")).to_contain_text("Slope (P90)")
    expect(page.get_by_text("Candidate 1 of 5")).to_be_visible()
    page.get_by_role("button", name="Next candidate").click()
    expect(page.get_by_text("Candidate 2 of 5")).to_be_visible()
    page.screenshot(path=OUT / "results.png")
    page.get_by_role("link", name="Back to the map").click()
    page.get_by_role("button", name="Mars", exact=True).click()
    expect(page.locator("html")).to_have_attribute("data-planet", "mars")
    expect(page.get_by_text("112 measured cells")).to_be_visible()
    page.get_by_role("button", name="AI query", exact=True).click()
    page.get_by_label("Describe your terrain criteria").fill("Find terrain with slope at most 12 degrees")
    page.get_by_role("button", name="Interpret query").click()
    expect(page.get_by_label("Slope (P90) maximum")).to_have_value("12")
    page.get_by_label("Slope (P90) minimum").fill("13")
    expect(page.get_by_text("Check the minimum and maximum values.")).to_be_visible()
    page.get_by_label("Slope (P90) minimum").fill("")
    page.get_by_label("Local relief maximum").fill("500")
    expect(page.get_by_label("Apply Local relief filter")).to_be_checked()
    page.get_by_label("Apply Local relief filter").uncheck()
    expect(page.get_by_text("1 active", exact=True)).to_be_visible()
    page.get_by_role("button", name="Clear filters").click()
    choose_cell(page, "jezero")
    page.get_by_label("Earth search area").select_option("kazakhstan")
    page.screenshot(path=OUT / "explore-mars.png")
    with page.expect_response(lambda response: response.url.endswith("/api/science/compare")) as request:
        page.get_by_role("button", name="Find Earth Analogs").click()
    result = request.value.json()
    assert result["target"]["body"] == "mars" and result["compared_earth_cells"] > 0
    assert all(candidate["region_id"] in {"ustyurt", "betpak-dala", "ili-basin", "aral-east", "balkhash-south"}
               for candidate in result["candidates"])
    expect(page.get_by_role("table")).to_contain_text("Difference")
    page.reload()
    expect(page.get_by_role("table")).to_contain_text("Slope (P90)")
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
    for route in ("/", "/select", "/explore"):
        mobile.goto(BASE + route, wait_until="networkidle")
        assert mobile.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), route
    expect(mobile.get_by_text("112 measured cells")).to_be_visible()
    mobile.screenshot(path=OUT / "explore-mobile.png", full_page=True)
    assert not errors, errors
    print("Verified Mars and Moon selection, manual and AI filters, Kazakhstan scope, comparison, unavailable lunar scale, carousel, reload and mobile layout.")
    browser.close()
