# Test Plan (Manual)

## 1. Authentication
1.  **Login:** Go to `/login`. Enter `admin` / `admin`. Ensure you land on Dashboard.
2.  **Refresh:** Press F5. Ensure you stay logged in (check `localStorage.cartie_token`).
3.  **Impersonation:** Go to `/superadmin/users` (if accessible) or check console `localStorage`. Click "Impersonate". Ensure page reloads and you are logged in as target.

## 2. Public Mini App
1.  **Access:** Open `/p/app` (Mini App).
2.  **Inventory:** Verify cars load without logging in.
3.  **Request:** Click "Find". Fill form (Brand: "Test", Year: 2020, Budget: 50000). Click Submit.
4.  **Verify:** Login as admin. Go to `/requests`. Ensure "Test 2020+" request appears.

## 3. Requests Management
1.  **Create:** Click "New Request". Select "BUY". Enter Title, Budget. Save.
2.  **View:** Ensure list shows "50k" for budget.
3.  **Create (Sell):** Click "New Request". Select "SELL". Enter Title. Save.
4.  **View:** Ensure list shows "—" for budget (if not entered).

## 4. Health Check
1.  **Page:** Go to `/health`.
2.  **Verify:** Check "Bot Connectivity" and "Server Health" show "OK" or stats (not crashing).
