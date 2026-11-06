// AdMob qua Capacitor. KHÔNG import '@capacitor-community/admob' (không có bundler
// nên trình duyệt/WebView không phân giải được). Lấy plugin từ window.Capacitor.Plugins.

// MÃ TEST CỦA GOOGLE
const BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
const INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

let initPromise = null;
let bannerShown = false;

function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform());
}

function getAdMob() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
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
    await getAdMob().showBanner({
      adId: BANNER_ID,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
    });
    bannerShown = true;
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
