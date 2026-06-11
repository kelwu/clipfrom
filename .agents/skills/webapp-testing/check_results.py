from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 430, "height": 932})
    page.goto("http://localhost:8082/results/b730f5ed-5136-463f-8396-f5272a670276")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/results_page.png", full_page=True)
    print("Screenshot taken")
    browser.close()
