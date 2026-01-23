# P0 Release Notes: Production Ready System

## 🚀 Deployment Instructions

To apply these changes to production:

1.  **Pull the Code:**
    ```bash
    git pull origin jules-production-ready-fixes
    ```

2.  **Environment Configuration:**
    *   Ensure your `.env` file (on the server) includes `VITE_PUBLIC_URL`.
    *   Example: `VITE_PUBLIC_URL=https://your-domain.com`
    *   This is required for generating correct "Open Mini App" deep links in the Telegram Hub.

3.  **Run Deployment Script:**
    ```bash
    bash infra/deploy_prod.sh
    ```
    *   **What this does:**
        *   Builds new Docker images (including new `cheerio` dependency).
        *   Runs database migrations (if any pending).
        *   Restarts services with zero-downtime rolling update.
        *   **Auto-Bootstrapping:** On startup, the server will automatically create the `post_template` entity definition and any missing `tg_destination` definitions.

## ✨ New Features (P0)

1.  **No-API Car Parser:**
    *   Paste any URL from *AutoRia*, *OLX*, or generic sites into the Import tool.
    *   System extracts Title, Price, Year, Mileage, and Images using intelligent Meta/JSON-LD parsing.

2.  **Telegram Channel Import:**
    *   **Action:** Add the bot to your Telegram Channel as an Admin.
    *   **Result:** The channel automatically appears in "Destinations" list within seconds (via Webhook).

3.  **Composer Template Library:**
    *   Create complex posts with variables (`{price}`, `{title}`).
    *   Save them as templates for reuse.
    *   Load templates instantly in the Content Editor.

4.  **Mini App Onboarding:**
    *   Simplified "Connect Bot" flow.
    *   Direct link to open your Mini App for testing.

## 🔄 Rollback Plan

If critical issues arise:

1.  **Revert Code:**
    ```bash
    git reset --hard HEAD^  # Or checkout previous stable commit
    ```

2.  **Redeploy:**
    ```bash
    bash infra/deploy_prod.sh
    ```

3.  **Data:**
    *   New entities (`post_template`, `tg_destination`) are additive and won't break legacy logic if the code is reverted.
