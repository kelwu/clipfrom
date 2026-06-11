from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:8082")
    page.wait_for_load_state("networkidle")

    # Click Upload Video tab
    page.get_by_text("Upload Video").click()
    page.wait_for_timeout(800)
    page.screenshot(path="/tmp/upload_tab.png")
    print("Upload tab screenshot taken")

    # Check what's visible
    content = page.inner_text("body")
    for keyword in ["Upload", "video", "drag", "500", "MP4", "Generate"]:
        if keyword.lower() in content.lower():
            print(f"  Found: '{keyword}'")

    browser.close()
