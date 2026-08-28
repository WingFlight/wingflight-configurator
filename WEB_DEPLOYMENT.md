# Web Deployment Guide

This document describes the web deployment of Wingflight Configurator for use in web browsers.

## Overview

Wingflight Configurator has been adapted to run as a web application using modern browser APIs for device communication. The app is deployed automatically via GitHub Actions to GitHub Pages with support for versioned releases, and can be installed as a Progressive Web App (PWA) in supported browsers.

## Browser Requirements

### ✅ Supported Browsers (Chromium-based)
- **Google Chrome** (v119+)
- **Microsoft Edge** (v119+)
- **Brave Browser** (v1.73+)
- **Opera** (v105+)

### ❌ Unsupported Browsers
- **Firefox** - Limited WebSerial/WebUSB support
- **Safari** - No WebSerial/WebUSB support

### Mobile browsers (Android / iOS)

Support on mobile therefore depends entirely on which
transport APIs the mobile browser implements:

- **Web Bluetooth** is supported by Chrome on Android, so a flight controller
  with a Bluetooth/BLE UART module (e.g. HC-05, HM-10, SpeedyBee, DroneBridge)
  can be used from Android Chrome.
- **Web Serial** is not implemented by any mobile browser (Android or iOS).
  **WebUSB**, however, *is* supported by Chrome on Android, and
  [src/js/protocols/WebSerial.js](src/js/protocols/WebSerial.js) falls back to
  a vendored WebUSB-based polyfill
  ([src/js/protocols/webUsbSerialPolyfill.js](src/js/protocols/webUsbSerialPolyfill.js),
  trimmed from Google's official
  [web-serial-polyfill](https://github.com/google/web-serial-polyfill)) when
  `navigator.serial` isn't present but `navigator.usb` is. This only reaches
  the standard USB CDC-ACM class -- the virtual-COM-port class most flight
  controller MCUs (STM32, GD32, AT32, APM32, RP2040) expose natively -- and
  cannot reach discrete USB-to-serial bridge chips (FTDI, CP210x, CH340),
  which use a proprietary, non-CDC-ACM protocol. iOS has no WebUSB support
  either, so USB flight controllers remain unreachable there.
- The compatibility check in [src/js/browser-compat.js](src/js/browser-compat.js)
  reflects this: it only blocks usage when *none* of Web Serial, Web
  Bluetooth, or WebUSB are available, matching Betaflight Configurator's
  transport-based compatibility check.

## Required Browser APIs

The web app requires the following browser APIs to be available:

| API | Purpose | Supported Browsers |
|-----|---------|-------------------|
| **WebSerial API** | Serial port communication (flight controller) | Chrome, Edge, Brave, Opera (desktop); Android Chrome via WebUSB CDC-ACM polyfill fallback |
| **Web Bluetooth API** | BLE UART communication (flight controller) | Chrome, Edge, Brave, Opera (desktop and Android) |
| **WebUSB API** | USB device access (flashing); Web Serial polyfill fallback on Android | Chrome, Edge, Brave, Opera (desktop and Android) |
| **Web Storage API** | Local configuration storage | All modern browsers |
| **Fetch API** | HTTP requests | All modern browsers |

## Progressive Web App Support

The web build includes PWA metadata and a service worker:

- `public/manifest.webmanifest` provides the install manifest, app name, colors, display mode, and icons.
- `public/service-worker.js` caches the app shell and same-origin static assets for repeat visits and basic offline loading.
- `src/js/main.svelte.js` registers the service worker only for production web builds.
- The manifest and service worker use relative paths and scope so `/master/`, `/latest/`, and specific release versions remain isolated from each other.

PWA installation improves launch behavior and allows the app to open in standalone mode, but it does not change browser support for WebSerial or WebUSB. Device connection and flashing features still require browser and operating-system support for those APIs.

### Offline Behavior

The PWA service worker provides basic app-shell caching:

- Previously loaded static assets can be served from cache.
- Navigation uses network-first behavior and falls back to cached `index.html` when offline.
- Device communication still requires a compatible browser context and supported hardware APIs.
- Firmware downloads, remote resources, and first-time loads still require network access unless already cached by a previous visit.

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
- **Serial Communication**: Requires WebSerial API (Chromium desktop), or WebUSB on Android for CDC-ACM devices only (see [Mobile browsers](#mobile-browsers-android--ios))
- **USB Flashing**: Requires WebUSB API (Chromium only)
- **File System Access**: Stored in browser storage, not local filesystem

### ❌ Not Supported in Web Version
- Desktop application features (system integration, file dialogs)
- Cordova/Mobile specific features
- PWA app-shell caching for repeat visits and basic offline loading

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
4. **Mobile Web**: Extend the WebUSB CDC-ACM polyfill fallback to more device classes, or add per-chipset polyfills (FTDI, CP210x, CH340) for Android
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
