from playwright.sync_api import Page, expect, sync_playwright

def test_miniapp(page: Page):
    # Mock Inventory API
    # MiniApp calls InventoryService.getInventory which hits /api/inventory
    page.route("**/api/inventory*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"items": [{"canonicalId": "1", "title": "Mock Car BMW", "price": {"amount": 50000, "currency": "USD"}, "year": 2023, "mileage": 1000, "status": "AVAILABLE", "thumbnail": "https://via.placeholder.com/300"}], "total": 1, "page": 1, "totalPages": 1}'
    ))

    # Mock Public Bots API (MiniApp needs config)
    page.route("**/api/public/bots*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='[{"id": "bot1", "active": true, "name": "Test Bot", "miniAppConfig": {"title": "Test Car Store", "welcomeText": "Welcome!", "primaryColor": "#D4AF37", "layout": "GRID", "actions": []}}]'
    ))

    # Navigate to MiniApp (BrowserRouter)
    page.goto("http://localhost:5173/p/app")

    # Assert Title
    expect(page.get_by_text("Test Car Store")).to_be_visible()

    # Assert Inventory Item
    expect(page.get_by_text("Mock Car BMW")).to_be_visible()
    expect(page.get_by_text("50,000 $")).to_be_visible()

    # Take Screenshot
    page.screenshot(path="verification/verification.png")
    print("Screenshot saved to verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_miniapp(page)
        finally:
            browser.close()
