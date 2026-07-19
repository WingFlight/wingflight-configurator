var e={isChromium(){return/Chrome|Edg|Brave|Opera/i.test(navigator.userAgent)&&!navigator.userAgent.includes(`Firefox`)},hasWebSerial(){return`serial`in navigator},hasWebUSB(){return`usb`in navigator},hasWebStorage(){try{let e=`__storage_test__`;return localStorage.setItem(e,e),localStorage.removeItem(e),!0}catch{return!1}},getBrowserName(){let e=navigator.userAgent;return e.includes(`Edg/`)?`Microsoft Edge`:e.includes(`Chrome/`)?`Google Chrome`:e.includes(`Safari/`)&&!e.includes(`Chrome/`)?`Safari`:e.includes(`Firefox/`)?`Mozilla Firefox`:e.includes(`OPR/`)?`Opera`:e.includes(`Brave/`)?`Brave`:`Unknown Browser`},checkAll(){return{isChromium:this.isChromium(),hasWebSerial:this.hasWebSerial(),hasWebUSB:this.hasWebUSB(),hasWebStorage:this.hasWebStorage(),browserName:this.getBrowserName(),isCompatible:this.isChromium()&&this.hasWebSerial()&&this.hasWebUSB()&&this.hasWebStorage()}},displayWarning(e){if(!e.isChromium){let t=`
⚠️ Unsupported Browser: ${e.browserName}

Wingflight Configurator Web is optimized for Chromium-based browsers:
- Google Chrome
- Microsoft Edge
- Brave Browser
- Opera

Your browser (${e.browserName}) may have limited functionality. 
Device access features (serial communication, USB) may not work.

For best experience, please use a Chromium-based browser.
      `.trim();return console.warn(t),!1}if(!e.hasWebSerial||!e.hasWebUSB){let t=[];e.hasWebSerial||t.push(`WebSerial API`),e.hasWebUSB||t.push(`WebUSB API`);let n=`
⚠️ Limited Browser Support

Your ${e.browserName} browser is missing these features:
${t.map(e=>`  • ${e}`).join(`
`)}

Device access features may not work properly.
      `.trim();return console.warn(n),!1}return!0},injectBanner(e,t=`app`){if(e.isCompatible)return;let n=document.getElementById(t);if(!n)return;let r=document.createElement(`div`);r.id=`browser-compat-banner`,r.style.cssText=`
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #856404;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;let i=`⚠️ <strong>Limited Browser Support</strong><br/>`;if(!e.isChromium)i+=`Your browser (${e.browserName}) is not Chromium-based. `,i+=`Device access features may not work. `,i+=`Please use Chrome, Edge, Brave, or Opera for best experience.`;else if(!e.hasWebSerial||!e.hasWebUSB){let t=[];e.hasWebSerial||t.push(`WebSerial`),e.hasWebUSB||t.push(`WebUSB`),i+=`Missing features: ${t.join(`, `)}. Device communication may be limited.`}r.innerHTML=i,n.insertBefore(r,n.firstChild)}};function t(t={}){let{showBanner:n=!0,containerId:r=`app`,onIncompatible:i=null}=t;if(typeof window>`u`)return null;let a=e.checkAll();return e.displayWarning(a),n&&!a.isCompatible&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>{e.injectBanner(a,r)}):e.injectBanner(a,r)),!a.isCompatible&&typeof i==`function`&&i(a),a}export{t as initBrowserCompat};