from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:8082")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/landing.png", full_page=False)
    print("Title:", page.title())
    print("URL:", page.url)
    browser.close()
