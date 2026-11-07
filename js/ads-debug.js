// TẠM THỜI: hiện chẩn đoán quảng cáo ngay trên màn hình (chỉ chạy trong app Android).
// Gỡ sau khi xong: xóa file này + dòng import './ads-debug.js' trong js/main.js.
const lines = [];
let box = null;

function render() {
  if (!box) {
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.85);' +
      'color:#fff;font:11px/1.35 monospace;padding:6px 8px;white-space:pre-wrap;max-height:45vh;overflow:auto';
    box.addEventListener('click', () => { if (box) box.remove(); box = null; });
    document.body.appendChild(box);
  }
  box.textContent = 'ADS DEBUG (chạm để ẩn)\n' + lines.slice(-14).join('\n');
}

export function dbg(msg) {
  lines.push(new Date().toTimeString().slice(0, 8) + ' ' + msg);
  try { render(); } catch (_) { /* bỏ qua */ }
}

if (window.Capacitor && window.Capacitor.isNativePlatform()) {
  window.__adsDbg = dbg;
  const ver = document.querySelector('meta[name="spx-app-version"]');
  dbg('web ' + (ver ? ver.content : '?') + ' | ' + window.Capacitor.getPlatform());
  const AdMob = window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  dbg('plugin AdMob: ' + typeof AdMob);
}
