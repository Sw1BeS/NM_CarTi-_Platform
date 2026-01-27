# Smoke Test Scenarios

Run these tests manually after deployment to verify the release.

## 1. Authentication & Session
1.  **Login:** Go to `/login`. Login with `admin` / `securepassword` (or seeded creds).
2.  **Verify:** Dashboard loads. Sidebar shows "Super Admin" (or Admin).
3.  **Persistence:** Refresh the page (`Cmd+R`). You should remain logged in.

## 2. Lead & Request Flow
1.  **Create Lead:** Go to `/leads`. Click "New Lead". Enter "Test User". Save.
2.  **Create Request (BUY):** Go to `/requests`. Click "New Request". Select "BUY". Enter Title "BMW X5". Budget "50000". Save.
3.  **Verify:** Request appears in list with correct budget.
4.  **Create Request (SELL):** Click "New Request". Select "SELL". Enter Title "My Old Car". Save.
5.  **Verify:** Request appears in list.

## 3. Public Mini App (No Auth)
1.  **Open:** Go to `/p/app` in an Incognito window.
2.  **Inventory:** Verify list loads (fetch from `/public/system/inventory`).
3.  **Filter:** Type "BMW" in search. Verify list updates.
4.  **Request:** Click "Find". Fill form. Submit.
5.  **Admin Check:** Login as admin. Go to `/requests`. Verify the new request appears.

## 4. System Health
1.  **Page:** Go to `/health` (authenticated).
2.  **Check:** "Server Health" should show "OK". "Bots" should show active count (if any).

## 5. Feature Flags (Hardening)
1.  **Sidebar:** Verify "Companies" and "Integrations" are **NOT** visible in the sidebar (hidden by default flags).
