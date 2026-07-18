/**
 * Browser compatibility check for web deployment
 * This module checks for required APIs and notifies user of incompatibilities
 */

export const BrowserCompat = {
  /**
   * Check if browser is Chromium-based
   */
  isChromium() {
    return /Chrome|Edg|Brave|Opera/i.test(navigator.userAgent) && !navigator.userAgent.includes('Firefox');
  },

  /**
   * Check for WebSerial API support
   */
  hasWebSerial() {
    return 'serial' in navigator;
  },

  /**
   * Check for WebUSB API support
   */
  hasWebUSB() {
    return 'usb' in navigator;
  },

  /**
   * Check for Web Storage API support
   */
  hasWebStorage() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get browser name
   */
  getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Microsoft Edge';
    if (ua.includes('Chrome/')) return 'Google Chrome';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
    if (ua.includes('Firefox/')) return 'Mozilla Firefox';
    if (ua.includes('OPR/')) return 'Opera';
    if (ua.includes('Brave/')) return 'Brave';
    return 'Unknown Browser';
  },

  /**
   * Check all required features
   * @returns {Object} Object with feature checks and overall compatibility status
   */
  checkAll() {
    return {
      isChromium: this.isChromium(),
      hasWebSerial: this.hasWebSerial(),
      hasWebUSB: this.hasWebUSB(),
      hasWebStorage: this.hasWebStorage(),
      browserName: this.getBrowserName(),
      isCompatible: this.isChromium() && this.hasWebSerial() && this.hasWebUSB() && this.hasWebStorage(),
    };
  },

  /**
   * Display compatibility warning modal/banner
   * @param {Object} compat - Result from checkAll()
   * @returns {boolean} true if compatible, false if not
   */
  displayWarning(compat) {
    if (!compat.isChromium) {
      const message = `
⚠️ Unsupported Browser: ${compat.browserName}

Wingflight Configurator Web is optimized for Chromium-based browsers:
- Google Chrome
- Microsoft Edge
- Brave Browser
- Opera

Your browser (${compat.browserName}) may have limited functionality. 
Device access features (serial communication, USB) may not work.

For best experience, please use a Chromium-based browser.
      `.trim();
      console.warn(message);
      return false;
    }

    if (!compat.hasWebSerial || !compat.hasWebUSB) {
      const missing = [];
      if (!compat.hasWebSerial) missing.push('WebSerial API');
      if (!compat.hasWebUSB) missing.push('WebUSB API');

      const message = `
⚠️ Limited Browser Support

Your ${compat.browserName} browser is missing these features:
${missing.map(f => `  • ${f}`).join('\n')}

Device access features may not work properly.
      `.trim();
      console.warn(message);
      return false;
    }

    return true;
  },

  /**
   * Create and inject a compatibility banner into the DOM
   * @param {Object} compat - Result from checkAll()
   * @param {string} containerId - ID of container to inject banner
   */
  injectBanner(compat, containerId = 'app') {
    if (compat.isCompatible) {
      return; // No need to show banner
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    const banner = document.createElement('div');
    banner.id = 'browser-compat-banner';
    banner.style.cssText = `
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #856404;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;

    let message = `⚠️ <strong>Limited Browser Support</strong><br/>`;

    if (!compat.isChromium) {
      message += `Your browser (${compat.browserName}) is not Chromium-based. `;
      message += `Device access features may not work. `;
      message += `Please use Chrome, Edge, Brave, or Opera for best experience.`;
    } else if (!compat.hasWebSerial || !compat.hasWebUSB) {
      const missing = [];
      if (!compat.hasWebSerial) missing.push('WebSerial');
      if (!compat.hasWebUSB) missing.push('WebUSB');
      message += `Missing features: ${missing.join(', ')}. Device communication may be limited.`;
    }

    banner.innerHTML = message;
    container.insertBefore(banner, container.firstChild);
  },
};

/**
 * Initialize browser compatibility check on page load
 */
export function initBrowserCompat(options = {}) {
  const {
    showBanner = true,
    containerId = 'app',
    onIncompatible = null,
  } = options;

  if (typeof window === 'undefined') {
    return null; // SSR environment
  }

  const compat = BrowserCompat.checkAll();

  // Log to console
  BrowserCompat.displayWarning(compat);

  // Show banner in UI
  if (showBanner && !compat.isCompatible) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        BrowserCompat.injectBanner(compat, containerId);
      });
    } else {
      BrowserCompat.injectBanner(compat, containerId);
    }
  }

  // Call callback if incompatible
  if (!compat.isCompatible && typeof onIncompatible === 'function') {
    onIncompatible(compat);
  }

  return compat;
}
