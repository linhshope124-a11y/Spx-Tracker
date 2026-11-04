// Khai báo các biến toàn cục mà code JS dùng nhưng không nằm trong lib DOM chuẩn.
// (Chỉ phục vụ `npm run typecheck`; không được nạp vào app.)

// Tesseract.js được nạp động từ CDN (js/ocr/worker.js)
declare const Tesseract: any;

interface Window {
  Tesseract?: any;
  /** Gỡ lỗi nhận diện tab (js/ocr/detect.js) */
  __spxLastTabDetect?: any;
  /** Các hàm gắn vào window để HTML gọi qua onclick (js/main.js, js/dialog.js) */
  openSettingsModal?: () => void;
  openOcrPicker?: () => void;
  dialogOk?: () => void;
  dialogCancel?: () => void;
  setAllOppFilter?: (filter: string, el?: Element) => void;
  initCloudUI?: () => void;
  /** Cờ nội bộ: chạm giữ lâu đã kích hoạt, nuốt cú click kế tiếp (js/ui.js) */
  __periodLongPressFired?: boolean;
  __spxLongPressFired?: boolean;
  __spxToastTimer?: ReturnType<typeof setTimeout>;
}

interface Navigator {
  /** iOS Safari: đang chạy ở chế độ màn hình chính */
  standalone?: boolean;
}
