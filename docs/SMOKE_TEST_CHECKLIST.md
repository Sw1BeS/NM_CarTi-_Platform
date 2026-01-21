# Functional Smoke Test Checklist - Cartie2

**Test Date**: _____________  
**Tester**: _____________  
**Domain**: `https://cartie2.umanoff-analytics.space`

---

## 🎯 Testing Instructions

1. **Login** to the system with admin credentials
2. **Navigate** to each page listed below
3. **Test** all buttons and basic functions
4. **Mark** ✅ if working, ❌ if broken, ⚠️ if partial/buggy

---

## 📋 Page-by-Page Test Matrix

### 1. Authentication

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| Login | Enter credentials → Submit | Redirect to Dashboard | ⬜ |
| Logout | Click Logout | Redirect to Login | ⬜ |
| Invalid Login | Enter wrong password | Error message shown | ⬜ |

---

### 2. Dashboard (`/`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Stats | Page loads | Stats cards display | ⬜ |
| Quick Actions | Click "New Lead" | Modal/Redirect to Leads | ⬜ |
| Recent Activity | View list | Recent items shown | ⬜ |

---

### 3. Inbox (`/inbox`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Messages | Page loads | Message list visible | ⬜ |
| Select Chat | Click a conversation | Messages load in right pane | ⬜ |
| Send Message | Type + Send | Message appears in chat | ⬜ |
| Filter (All/My/Unassigned) | Click filter buttons | List updates | ⬜ |
| Assign Chat | Select manager from dropdown | Chat assigned | ⬜ |
| Add Note | Click note button → Add text → Save | Note saved | ⬜ |
| Delete Session | Click trash icon | Session cleared | ⬜ |
| Bot Selector | Change bot | Messages filtered by bot | ⬜ |

---

### 4. Leads (`/leads`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Leads | Page loads | Lead list displayed | ⬜ |
| Add Lead | Click "Add" → Fill form → Save | New lead created | ⬜ |
| Edit Lead | Click edit → Modify → Save | Lead updated | ⬜ |
| Delete Lead | Click delete → Confirm | Lead removed | ⬜ |
| Filter by Status | Select status filter | List updates | ⬜ |
| Search | Type in search box | Results filtered | ⬜ |
| Bulk Select | Check multiple leads | Bulk actions enabled | ⬜ |

---

### 5. Requests (`/requests`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Requests | Page loads | Request list displayed | ⬜ |
| Add Request | Click "Add" → Fill form → Save | New request created | ⬜ |
| Edit Request | Click edit → Modify → Save | Request updated | ⬜ |
| Delete Request | Click delete → Confirm | Request removed | ⬜ |
| Add Variant | Open request → Add variant | Variant added to request | ⬜ |
| Update Variant Status | Change variant status dropdown | Status saved | ⬜ |
| View Proposal | Click "View Proposal" | Proposal page opens | ⬜ |
| Filter by Status | Select status filter | List updates | ⬜ |
| Search | Type in search box | Results filtered | ⬜ |

---

### 6. Inventory (`/inventory`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Inventory | Page loads | Car list displayed | ⬜ |
| Add Car | Click "Add" → Fill form → Save | New car added | ⬜ |
| Edit Car | Click edit → Modify → Save | Car updated | ⬜ |
| Delete Car | Click delete → Confirm | Car removed | ⬜ |
| Search | Type in search box | Results filtered | ⬜ |
| Filter by Status | Select status filter | List updates | ⬜ |
| Bulk Selection | Check multiple cars | Bulk actions enabled | ⬜ |
| Bulk Delete | Select multiple → Delete | Cars removed | ⬜ |
| Attach to Request | Select car → Attach → Choose request | Car linked to request | ⬜ |

---

### 7. Search (`/search`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| Basic Search | Enter brand/model → Search | Results displayed | ⬜ |
| Advanced Filters | Set year/price range → Search | Filtered results shown | ⬜ |
| Import to Inventory | Click import on result | Car added to inventory | ⬜ |
| View Details | Click car card | Details modal/page opens | ⬜ |

---

### 8. Telegram Hub (`/telegram`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Bots | Navigate to Bots tab | Bot list displayed | ⬜ |
| Add Bot | Click "Add Bot" → Fill → Save | Bot created | ⬜ |
| Edit Bot | Click edit → Modify → Save | Bot updated | ⬜ |
| Delete Bot | Click delete → Confirm | Bot removed | ⬜ |
| Test Connection | Click "Test" on bot | Connection status shown | ⬜ |
| View Scenarios | Navigate to Scenarios tab | Scenario list shown | ⬜ |
| View Channels | Navigate to Channels tab | Channel list shown | ⬜ |
| Add Channel | Click "Add" → Fill → Save | Channel added | ⬜ |

---

### 9. Scenario Builder (`/scenarios`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Scenarios | Page loads | Scenario list displayed | ⬜ |
| Create Scenario | Click "New" → Add nodes → Save | Scenario created | ⬜ |
| Edit Scenario | Open scenario → Modify → Save | Changes saved | ⬜ |
| Delete Scenario | Click delete → Confirm | Scenario removed | ⬜ |
| Add Node | Drag node to canvas | Node added | ⬜ |
| Connect Nodes | Drag connection | Nodes linked | ⬜ |
| Test Scenario | Click "Test" (if available) | Test mode activated | ⬜ |

---

### 10. Content Calendar (`/calendar`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Calendar | Page loads | Calendar grid shown | ⬜ |
| Add Post | Click date → Fill form → Save | Post scheduled | ⬜ |
| Edit Post | Click post → Modify → Save | Post updated | ⬜ |
| Delete Post | Click delete → Confirm | Post removed | ⬜ |
| Publish Now | Click "Publish" on draft | Post published immediately | ⬜ |

---

### 11. Settings (`/settings`)

#### Users Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Users | Navigate to Users tab | User list displayed | ⬜ |
| Add User | Click "Add" → Fill form → Save | User created | ⬜ |
| Edit User | Click edit → Modify → Save | User updated | ⬜ |
| Delete User | Click delete → Confirm | User removed | ⬜ |

#### Integrations Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Integrations | Navigate to Integrations tab | Integration panels shown | ⬜ |
| Configure WhatsApp | Enter tokens → Save | Config saved | ⬜ |
| Configure Instagram | Enter tokens → Save | Config saved | ⬜ |
| Configure SendPulse | Enter credentials → Save | Config saved | ⬜ |
| Test Integration | Click "Test" button | Connection status shown | ⬜ |

#### API Connection Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View API Config | Navigate to API tab | Base URL shown | ⬜ |
| Change Base URL | Modify URL → Save | Config updated | ⬜ |
| Test Connection | Click "Test" | Connection status shown | ⬜ |
| Configure Autoria | Enter API key → Save | Key saved | ⬜ |

#### Features Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| Toggle Feature | Click toggle switch | Feature enabled/disabled | ⬜ |
| Save Changes | Click "Save" | Settings persisted | ⬜ |

#### Dictionaries Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Dictionaries | Navigate to Dictionaries tab | Brands/Cities shown | ⬜ |
| Add Brand/City | Enter value → Add | Item added to list | ⬜ |
| Delete Brand/City | Click delete → Confirm | Item removed | ⬜ |
| Save | Click "Save" | Dictionary updated | ⬜ |

#### Backup Tab
| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| Create Snapshot | Click "Create Snapshot" | Snapshot created | ⬜ |
| Restore Snapshot | Select snapshot → Restore → Confirm | System restored | ⬜ |
| Delete Snapshot | Click delete → Confirm | Snapshot removed | ⬜ |

---

### 12. Companies (`/companies`) - Superadmin Only

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Companies | Page loads | Company list shown | ⬜ |
| Add Company | Click "Add" → Fill → Save | Company created | ⬜ |
| Edit Company | Click edit → Modify → Save | Company updated | ⬜ |
| Delete Company | Click delete → Confirm | Company removed | ⬜ |

---

### 13. Health (`/health`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View System Status | Page loads | Health metrics shown | ⬜ |
| Refresh | Click refresh button | Data updates | ⬜ |
| View Bot Status | Check bot section | Bot statuses displayed | ⬜ |

---

### 14. Marketplace (`/marketplace`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Templates | Page loads | Template list shown | ⬜ |
| Preview Template | Click template | Preview shown | ⬜ |
| Install Template | Click "Install" → Confirm | Template installed | ⬜ |

---

### 15. Entities (`/entities`)

| Test | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| View Entity Definitions | Page loads | Entity list shown | ⬜ |
| View Records | Click entity | Records displayed | ⬜ |
| Add Record | Click "Add" → Fill → Save | Record created | ⬜ |
| Edit Record | Click edit → Modify → Save | Record updated | ⬜ |
| Delete Record | Click delete → Confirm | Record removed | ⬜ |

---

## 🔴 Critical Buttons to Test

### High Priority (Must Work)
- [  ] Login/Logout
- [  ] Save (all forms)
- [  ] Delete (all entities)
- [  ] Send Message (Inbox)
- [  ] Add Lead
- [  ] Add Request
- [  ] Add Inventory Item
- [  ] Search (Inventory & Search pages)
- [  ] Bot Test Connection

### Medium Priority (Should Work)
- [  ] Bulk Actions (Inventory, Leads)
- [  ] Filter by Status (all lists)
- [  ] Assign Chat (Inbox)
- [  ] Add Variant (Requests)
- [  ] Create Snapshot
- [  ] Test Integrations

### Low Priority (Nice to Have)
- [  ] Export/Import
- [  ] Advanced Filters
- [  ] Preview Template

---

## 📊 Test Summary

- **Total Tests**: _____
- **Passed**: _____
- **Failed**: _____
- **Partial/Buggy**: _____
- **Success Rate**: _____%

---

## 🐛 Issues Found

| Page | Button/Feature | Issue Description | Severity |
|------|----------------|-------------------|----------|
|      |                |                   |          |
|      |                |                   |          |
|      |                |                   |          |

---

## ✅ Sign-Off

- [  ] **All critical buttons tested and working**
- [  ] **All major pages accessible**
- [  ] **No blocking bugs found**

**Tester Signature**: ________________  
**Date**: ________________
