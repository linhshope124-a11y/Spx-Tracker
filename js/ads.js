import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

// MÃ TEST CỦA GOOGLE (An toàn 100%, không bị khóa tài khoản khi bấm thử)
const BANNER_ID = 'ca-app-pub-3940256099942544/6300978111
const INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";

let isAdMobReady = false;

export async function initAds() {
  try {
    await AdMob.initialize();
    isAdMobReady = true;
    console.log('AdMob đã sẵn sàng');
  } catch (e) {
    console.warn('Lỗi khởi tạo AdMob:', e);
  }
}

export async function showBanner() {
  if (!isAdMobReady) return;
  try {
    await AdMob.showBanner({
      adId: BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0, // Cách đáy màn hình 0px
    });
  } catch (e) {
    console.warn('Lỗi hiển thị banner:', e);
  }
}

export async function showInterstitial() {
  if (!isAdMobReady) return;
  try {
    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID });
    await AdMob.showInterstitial();
  } catch (e) {
    console.warn('Lỗi hiển thị interstitial:', e);
  }
}
