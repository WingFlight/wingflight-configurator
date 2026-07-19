# Web Deployment Guide

This document describes the web deployment of Wingflight Configurator for use in web browsers.

## Overview

Wingflight Configurator has been adapted to run as a web application using modern browser APIs for device communication. The app is deployed automatically via GitHub Actions to GitHub Pages with support for versioned releases.

## Browser Requirements

### ✅ Supported Browsers (Chromium-based)
- **Google Chrome** (v119+)
- **Microsoft Edge** (v119+)
- **Brave Browser** (v1.73+)
- **Opera** (v105+)

### ❌ Unsupported Browsers
- **Firefox** - Limited WebSerial/WebUSB support
- **Safari** - No WebSerial/WebUSB support
- **Mobile browsers** - Device access not available

## Required Browser APIs

The web app requires the following browser APIs to be available:

| API | Purpose | Supported Browsers |
|-----|---------|-------------------|
| **WebSerial API** | Serial port communication (flight controller) | Chrome, Edge, Brave, Opera |
| **WebUSB API** | USB device access (flashing) | Chrome, Edge, Brave, Opera |
| **Web Storage API** | Local configuration storage | All modern browsers |
| **Fetch API** | HTTP requests | All modern browsers |

## Browser Compatibility Checking

The application automatically detects browser compatibility on startup:

1. **On Page Load**: Browser capabilities are checked
2. **Console Warning**: If incompatible, a warning is logged to the browser console
3. **UI Banner**: A yellow warning banner is displayed at the top of the app
4. **Graceful Degradation**: The app still functions, but device features are disabled

### Example Warning Banner

```
⚠️ Unsupported Browser: Mozilla Firefox

Wingflight Configurator Web is optimized for Chromium-based browsers:
- Google Chrome
- Microsoft Edge
- Brave Browser
- Opera

Your browser (Mozilla Firefox) may have limited functionality. 
Device access features (serial communication, USB) may not work.

For best experience, please use a Chromium-based browser.
```

## Building for Web

### Build Commands

```bash
# Build with relative paths (development)
pnpm run build:web

# Build with versioned path (for production)
pnpm run build:web:versioned
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_APP_BACKEND` | `web` | Set to "web" for web builds |
| `VITE_APP_VERSION` | `latest` | Version path (e.g., "v1.0.0", "latest") |

## Deployment

### GitHub Pages URLs

The application is automatically deployed to GitHub Pages, served from the custom domain `cfg.wingflight.org` (via the `CNAME` file on the `gh-pages` branch):

```
https://cfg.wingflight.org/
```

#### Available URLs

- **Master Branch** (latest development)
  ```
  https://cfg.wingflight.org/master/
  ```

- **Latest Stable Release** (recommended for most users)
  ```
  https://cfg.wingflight.org/latest/
  ```

- **Specific Release Versions**
  ```
  https://cfg.wingflight.org/1.0.0/
  https://cfg.wingflight.org/1.1.0/
  https://cfg.wingflight.org/2.0.0-rc1/
  ```

### Deployment Workflow

The `.github/workflows/deploy-web.yml` workflow:

1. **Triggers**:
   - Push to `feature/web-deployment` branch (for development)
   - Push to `master` branch (deployed to `/master/`)
   - Push of version tags `v*` (deployed to `/<version>/`)

2. **Build Steps**:
   - Install dependencies
   - Determine version from git ref:
     - **Master branch** → `version=master`
     - **Tag `v1.0.0`** → `version=1.0.0` (strips `v` prefix)
     - **Pre-release tag `v1.0.0-rc1`** → `version=1.0.0-rc1`
   - Build with appropriate base path
   - Create versioned directory structure

3. **Deployment Steps**:
   - For **Master** branch:
     - Deploy to `/master/`
   - For **Version tags**:
     - Deploy to `/<version>/`
     - If it's a stable release (no pre-release identifiers), also deploy to `/latest/`
   - Upload to GitHub Pages

### Stable Release Detection

A release is considered **stable** if the version tag:
- ✅ Does NOT contain: `-rc`, `-alpha`, `-beta`, `-pre`
- ✅ Examples: `v1.0.0`, `v2.1.3`, `v1.0.0-final`
- ❌ Pre-releases stay in `/<version>/` only: `v1.0.0-rc1`, `v1.0.0-beta2`

## Features & Limitations

### ✅ Fully Supported
- Reading flight controller configuration
- Writing flight controller configuration
- Firmware information display
- All UI tabs and features (Status, Setup, Profiles, Rates, Servos, etc.)
- Multi-language support (i18n)
- Dark theme support
- Local configuration backup/restore (via IndexedDB)

### ⚠️ Browser-Dependent
- **Serial Communication**: Requires WebSerial API (Chromium only)
- **USB Flashing**: Requires WebUSB API (Chromium only)
- **File System Access**: Stored in browser storage, not local filesystem

### ❌ Not Supported in Web Version
- Desktop application features (system integration, file dialogs)
- Cordova/Mobile specific features
- Offline caching (limited to browser cache)

## Development

### Local Development

```bash
# Start development server
pnpm start

# Build web version for testing
VITE_APP_BACKEND=web pnpm vite build
```

### Testing Browser Compatibility

1. **Test in Chrome/Edge**:
   ```bash
   VITE_APP_BACKEND=web pnpm vite build && pnpm vite preview
   ```

2. **Test in Firefox** (will show warning):
   - Open `http://localhost:5077`
   - Check browser console for compatibility warnings

## Code Organization

### Browser Compatibility Module

Location: `src/js/browser-compat.js`

Provides:
- `BrowserCompat.checkAll()` - Check all API support
- `BrowserCompat.isChromium()` - Check if Chromium-based
- `BrowserCompat.hasWebSerial()` - Check WebSerial support
- `BrowserCompat.hasWebUSB()` - Check WebUSB support
- `initBrowserCompat()` - Initialize checks and display warnings

### Platform-Specific Entry Point

The app detects the backend at build time via `__BACKEND__` variable:

```javascript
if (__BACKEND__ === "web") {
  // Web-specific initialization
  initBrowserCompat();
}
```

## Configuration

### Vite Configuration

`vite.config.mjs` now supports:

```javascript
// Backend selection via VITE_APP_BACKEND
// "nwjs" - Desktop app
// "cordova" - Mobile app  
// "web" - Web app

// Version path via VITE_APP_VERSION
// "latest" - Default versioned path
// "v1.0.0" - Custom version
```

## Troubleshooting

### Device not detected?
- ✅ Using Chrome/Edge/Brave? → Should work
- ❌ Using Firefox/Safari? → Not supported, switch browser
- ⚠️ Enable WebUSB/WebSerial in browser settings if disabled

### Configuration not saving?
- Check browser's localStorage is enabled
- Try clearing browser cache and reload

### Getting blank page?
- Open Developer Tools (F12)
- Check Console tab for errors
- Check that you're using supported browser

### Warning banner always showing?
- This indicates your browser is missing required APIs
- Switch to Chrome, Edge, Brave, or Opera for full functionality

## Future Enhancements

Potential improvements for consideration:

1. **Firefox Support**: Implement fallback proxy API for Firefox users
2. **Safari Support**: Requires Safari to implement WebSerial/WebUSB
3. **Offline Mode**: Add service workers for offline functionality
4. **Mobile Web**: Adapt UI for mobile browsers (informational only)
5. **Progressive Web App (PWA)**: Add install capability

## Security Considerations

- WebSerial/WebUSB APIs only available over HTTPS
- GitHub Pages provides automatic HTTPS
- No credentials or sensitive data stored in browser
- All device communication is direct (no intermediary servers)

## References

- [WebSerial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API)
- [GitHub Pages Deployment](https://docs.github.com/en/pages)
- [Vite Documentation](https://vitejs.dev/)
