// AdMob qua Capacitor. KHÔNG import '@capacitor-community/admob' (không có bundler
// nên trình duyệt/WebView không phân giải được). Lấy plugin từ window.Capacitor.Plugins.

// MÃ TEST CỦA GOOGLE
const BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
const INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';
const DEFAULT_BANNER_H = 60; // px — dùng khi plugin không báo chiều cao

let initPromise = null;
let bannerShown = false;
let listenersAdded = false;

function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform());
}

function getAdMob() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
}

/** Chừa chỗ ở đáy màn hình cho banner: CSS dùng biến --ad-h (thanh nav, popup, toast...). */
function setAdHeight(px) {
  document.documentElement.style.setProperty('--ad-h', px + 'px');
}

/** Chuẩn hóa chiều cao plugin báo về (có thể là dp hoặc px thật) về CSS px. */
function normalizeHeight(h) {
  let v = Number(h);
  if (v > 150) v = v / (window.devicePixelRatio || 1);
  return v >= 30 && v <= 150 ? Math.round(v) : DEFAULT_BANNER_H;
}

function addBannerListeners(AdMob) {
  if (listenersAdded || typeof AdMob.addListener !== 'function') return;
  listenersAdded = true;
  try {
    AdMob.addListener('bannerAdSizeChanged', (info) => {
      if (bannerShown) setAdHeight(normalizeHeight(info && info.height));
    });
    AdMob.addListener('bannerAdFailedToLoad', () => setAdHeight(0));
  } catch (e) {
    console.warn('Không gắn được listener banner:', e);
  }
}

/** Khởi tạo AdMob đúng 1 lần. Trả về true nếu sẵn sàng. */
export function initAds() {
  if (!isNative()) return Promise.resolve(false);
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const AdMob = getAdMob();
        if (!AdMob) throw new Error('Plugin AdMob chưa có trong bản build native');
        await AdMob.initialize();
        console.log('AdMob đã sẵn sàng');
        return true;
      } catch (e) {
        console.warn('Lỗi khởi tạo AdMob:', e);
        initPromise = null;
        return false;
      }
    })();
  }
  return initPromise;
}

export async function showBanner() {
  if (bannerShown || !(await initAds())) return;
  try {
    const AdMob = getAdMob();
    addBannerListeners(AdMob);
    await AdMob.showBanner({
      adId: BANNER_ID,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
    });
    bannerShown = true;
    setAdHeight(DEFAULT_BANNER_H); // sự kiện bannerAdSizeChanged (nếu có) sẽ chỉnh lại cho đúng
  } catch (e) {
    console.warn('Lỗi hiển thị banner:', e);
  }
}

export async function showInterstitial() {
  if (!(await initAds())) return;
  try {
    const AdMob = getAdMob();
    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID });
    await AdMob.showInterstitial();
  } catch (e) {
    console.warn('Lỗi hiển thị interstitial:', e);
  }
}
