var e={hasWebSerial(){return`serial`in navigator},hasWebBluetooth(){return`bluetooth`in navigator},hasWebUSB(){return`usb`in navigator},hasWebStorage(){try{let e=`__storage_test__`;return localStorage.setItem(e,e),localStorage.removeItem(e),!0}catch{return!1}},getBrowserName(){let e=navigator.userAgent;return e.includes(`Edg/`)?`Microsoft Edge`:e.includes(`Chrome/`)?`Google Chrome`:e.includes(`Safari/`)&&!e.includes(`Chrome/`)?`Safari`:e.includes(`Firefox/`)?`Mozilla Firefox`:e.includes(`OPR/`)?`Opera`:e.includes(`Brave/`)?`Brave`:`Unknown Browser`},checkAll(){let e=this.hasWebSerial(),t=this.hasWebBluetooth(),n=this.hasWebUSB(),r=this.hasWebStorage();return{hasWebSerial:e,hasWebBluetooth:t,hasWebUSB:n,hasWebStorage:r,browserName:this.getBrowserName(),isCompatible:(e||t||n)&&r}},displayWarning(e){if(e.isCompatible)return!0;let t=[];e.hasWebSerial||t.push(`Web Serial`),e.hasWebBluetooth||t.push(`Web Bluetooth`),e.hasWebUSB||t.push(`WebUSB`);let n=`
⚠️ Unsupported Browser: ${e.browserName}

Wingflight Configurator Web needs at least one of the following APIs to
talk to a flight controller, and your browser has none of them:
${t.map(e=>`  • ${e}`).join(`
`)}

Please use a Chromium-based desktop browser (Chrome, Edge, Brave, or Opera).
    `.trim();return console.warn(n),!1},injectBanner(e,t=`app`){if(e.isCompatible)return;let n=document.getElementById(t);if(!n)return;let r=document.createElement(`div`);r.id=`browser-compat-banner`,r.style.cssText=`
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #856404;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;let i=[];e.hasWebSerial||i.push(`Web Serial`),e.hasWebBluetooth||i.push(`Web Bluetooth`),e.hasWebUSB||i.push(`WebUSB`),r.innerHTML=`⚠️ <strong>Unsupported Browser</strong><br/>Your browser (${e.browserName}) doesn't support ${i.join(`, `)}. Device communication needs at least one of Web Serial, Web Bluetooth, or WebUSB. Please use a Chromium-based desktop browser (Chrome, Edge, Brave, or Opera).`,n.insertBefore(r,n.firstChild)}};function t(t={}){let{showBanner:n=!0,containerId:r=`app`,onIncompatible:i=null}=t;if(typeof window>`u`)return null;let a=e.checkAll();return e.displayWarning(a),n&&!a.isCompatible&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>{e.injectBanner(a,r)}):e.injectBanner(a,r)),!a.isCompatible&&typeof i==`function`&&i(a),a}export{t as initBrowserCompat};