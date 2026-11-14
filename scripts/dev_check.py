from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1000, "height": 700})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://localhost:3000", wait_until="networkidle", timeout=60000)
    page.get_by_role("button", name="Moon Lunar field preparation").click()
    page.wait_for_timeout(500)
    print("dev_theme:", page.locator("html").get_attribute("data-planet"))
    print("dev_canvas:", page.locator("canvas").count())
    print("dev_errors:", errors)
    browser.close()
