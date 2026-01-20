# System Verification Checklist (Stage A)

## 🌍 Public Access & Auth
- [ ] **Access Domain**: `https://cartie2.umanoff-analytics.space` loads without 502/404.
- [ ] **Login Page**:
    - [ ] UI loads correctly (Theme colors applied).
    - [ ] "Forgot Password" link present.
- [ ] **Authentication**:
    - [ ] Login as **Superadmin** → Redirects to Dashboard.
    - [ ] Login as **Dealer** → Redirects to Dealer Portal.
    - [ ] Login as **Viewer** → Restricted access verified.

## 📦 Core Modules
### 1. Dashboard
- [ ] KPIs load (no infinite spinners).
- [ ] "Recent Activity" list is populated.

### 2. Information Hub (Telegram)
- [ ] **My Bots**: List loads, "Add Bot" modal opens.
- [ ] **Campaigns**: "New Campaign" button works, form validates input.
- [ ] **Audience**: Table loads, "Edit Tags" works.
- [ ] **Automation**:
    - [ ] "Scenario Builder" loads.
    - [ ] "Mini App" config saves correctly.

### 3. Inventory & Requests
- [ ] **Inventory**: List loads, Search filter works.
- [ ] **Requests**: "New Request" created successfully.

## ⚙️ System & Admin
- [ ] **Integration Settings**: API Keys masked/visible toggle works.
- [ ] **Users**: "Invite User" email triggers (or mock log).

## 🛡️ Security & Health
- [ ] **Health Check**: `GET /health` returns 200 OK.
- [ ] **Console Errors**: No Red/Critical errors in Browser Console.
