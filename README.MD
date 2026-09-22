# ========================================================
# CORPORATE LAPTOP / ENTERPRISE CONFIGURATION
# ========================================================

# 1. Corporate SSL Inspection Bypass (Zscaler, Netskope, Fortinet, Palo Alto)
NODE_TLS_REJECT_UNAUTHORIZED=0

# 2. Corporate Browser Channel & Profile
# Options: 'chrome' or 'msedge'
BROWSER_CHANNEL=msedge

# Profile name: 'Default', 'Profile 1', 'Profile 2', etc.
BROWSER_PROFILE=Default

# 3. Persistent Profile Mode (true = retain logins, cookies, extensions)
USE_PERSISTENT_PROFILE=true

# 4. CDP Remote Debugging Port (optional, default 9222)
CDP_PORT=9222

