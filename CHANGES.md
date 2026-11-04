# SPX Tracker — v2.10

Bản đầy đủ: giải nén rồi thay toàn bộ vào repo (xem `README.md`). Phiên bản **v2.10** ở `version.json`; `sw.js` + `index.html` do `npm run sync` tự sinh.

## v2.10 — sửa lỗi "không mở được Hướng dẫn sử dụng"
**Nguyên nhân (lỗi của mình khi ghép file ở v2.7):** `guide.html` trong bộ file bạn gửi là **bản sao của `index.html`**
(cùng tiêu đề "Theo Dõi Sản Lượng & Điểm SPX", nạp `js/main.js`). Mình đã nhận nhầm đó là "trang hướng dẫn được thiết kế lại" và lấy nguyên văn
mà không mở ra xem → bấm "Hướng dẫn sử dụng" chỉ mở lại chính app, trông như không mở được.
**Sửa:** khôi phục trang hướng dẫn thật và cập nhật cho đúng app hiện tại: mục *Xóa dữ liệu & Hoàn tác*, mục mới *Ngày chưa cập nhật*,
*Ảnh bị điền sai tab*, *Giao diện hiện thô sau khi cập nhật*, khuyến nghị token 90 ngày; bỏ Google Fonts (offline không tải được).
**Chống tái diễn:** 5 test tĩnh (đúng là trang hướng dẫn, tự chứa, cấu trúc/đánh số, nội dung khớp app) + 3 e2e trên Chromium
(mở từ Menu, mở được từng mục, quay lại app, **mở được khi offline**, tìm kiếm). Mình đã thử đúng lỗi gốc (thay `guide.html` bằng bản sao `index.html`): 3/5 test tĩnh và 3/3 e2e đều đỏ.

> ⚠️ Nếu repo của bạn đang có `guide.html` là bản sao `index.html`, hãy **ghi đè bằng file trong gói này**.

### Kiểm chứng trên dữ liệu THẬT của bạn (file sao lưu 27/10, 156 bản ghi)
Con số app hiển thị **khớp tuyệt đối** với bản tính độc lập viết lại bằng Python từ quy tắc trong code: tháng 10 = 13.942 điểm,
tháng 9 = 6.744, tháng 8 = 21.338 (gồm thưởng hạng và lương ngày). Lưu ý: kiểm tra này chứng minh code chạy đúng như quy tắc đã viết;
việc quy tắc có đúng chính sách của SPX hay không thì mình không kiểm được.
Nhận xét dữ liệu: tháng 9 chỉ có 9/30 ngày (có thể đang thiếu số liệu — banner "Chưa cập nhật" sẽ nhắc 21 ngày); không có bản ghi trùng, id duy nhất.

### Thêm vào bộ test
- Ảnh SPX thật thứ 8 (`spx-giao-24-10.jpg`): đủ 3 tab của ngày 24/10. Có e2e quét ĐỦ 3 ảnh cùng lúc → mỗi loại 1 bản ghi đúng.
- e2e luồng quét ảnh đầy đủ trong Chromium (Tesseract giả trả văn bản có sẵn): chọn ảnh → nhận diện tab → parser → lưu; chạy trên 8 ảnh thật.
  Dùng lại cách nhận diện tab cũ (chia 3 phần đều) thì các ca ảnh "Hoàn" đỏ — đúng lỗi "Hoàn bị lưu vào Lấy" (đã thử ở bản v2.9).

### Chưa làm (đang để cho bản sau)
- Truy cập: ~14 ô nhập/nút chưa có tên cho trình đọc màn hình; chữ xám phụ (`--text-3`) 2,56:1 trên nền trắng (chuẩn AA cần 4,5:1);
  chữ trắng trên nút cam #ff5722 chỉ 3,2:1; một số nút lọc cao 26–30px (khuyến nghị ≥ 44px). Đây là quyết định thiết kế nên mình chưa tự đổi.
- Dữ liệu lưu trong `localStorage` (+ một bản sao "vault"): đủ dùng nhiều năm với mật độ hiện tại, nhưng nên chuyển IndexedDB (tầng 2).

## v2.9 — sửa 2 lỗi bạn gặp (đo trên ảnh/thiết bị thật của bạn)
Kiểm chứng: 156 test Node, `tsc` 0 lỗi, 23 kịch bản e2e trên Chromium 141 thật (chạy lặp 2 lần song song: đạt hết).
**Chưa chạy được:** WebKit/iOS. **Mình không có Tesseract tiếng Việt (`vie`)** nên các ca OCR từ ảnh thật dùng văn bản do
Tesseract `eng` đọc (mất dấu) — chỉ để kiểm bố cục/parser; độ chính xác OCR thật vẫn cần bạn thêm log "Copy log" từ app.

### 1. Form nhập chọn nhầm tab: ảnh "Đã trả hàng" bị điền vào "Lấy"
**Nguyên nhân (đo trên ảnh thật):** nhận diện tab chia ảnh làm 3 phần đều (33% / 66%). Nhưng ở màn SPX của bạn các nhãn
`Đã giao hàng | Đã lấy | Đã trả hàng` **dồn về bên trái**; gạch chân của "Đã trả hàng" nằm ở **56,7%** bề rộng → rơi vào
vùng "Lấy". Gạch chân chỉ rộng 80px (7,4%) nên còn không đạt ngưỡng 15% của đường chính.
Thuật toán cũ **đọc sai 3/3 ảnh "Đã trả hàng"** (4/7 đúng trên 7 ảnh); **mới đúng 7/7**.

**Cách sửa (`js/ocr/detect.js`):** xác định theo vị trí NHÃN — tìm gạch chân (đoạn cam liên tục, dày ≥ 2 hàng), đọc hàng nhãn
ngay phía trên, tìm 2 khoảng trống LỚN NHẤT giữa các nhãn (40px và 37px, so với ≤ 16px giữa các từ trong 1 nhãn) → 3 nhóm →
gạch chân dưới nhóm nào là tab đó. Tự thích ứng chế độ tối; không tách được nhãn thì mới dùng cách chia 3 phần đều.
Tách thành hàm thuần `detectTabFromPixels()` để test không cần DOM.

### 2. Nút "Xóa dữ liệu tháng" và toast "Hoàn tác" hiện thô, không có định dạng
Các rule CSS đều có trong bản gửi, nên đây là **cache cũ**. Mình tái hiện được đúng lớp lỗi này:
`cache.addAll(CORE)` trong Service Worker **tôn trọng `Cache-Control: max-age`** của hosting (GitHub Pages: 600 giây) →
ngay sau khi phát hành, cache của bản MỚI có thể chứa file CŨ (ví dụ `style.css` cũ + JS/HTML mới).
**Sửa (`sw.js`):** tải file precache với `cache: 'reload'` (bỏ qua cache HTTP). Test e2e dựng một "hosting" có max-age 600,
phát hành bản mới ngay sau đó và kiểm cache mới chứa CSS mới — **đỏ trên bản cũ, xanh trên bản mới**.
> Lưu ý: mình tái hiện được lỗi cùng loại chứ không chứng minh được đó là nguyên nhân DUY NHẤT trên máy bạn.
> Khi cập nhật lên v2.9+, Service Worker mới tự tải sạch toàn bộ file. Nếu giao diện vẫn thô: **BACKUP TRƯỚC** (Menu → Backup & Cloud → tải file),
> rồi mới xóa dữ liệu trang web / gỡ cài lại PWA — hai thao tác này **xóa luôn số liệu trên máy**. (Bản ghi chú trước đây của mình thiếu cảnh báo này.)
> Cách không mất dữ liệu: DevTools → Application → Cache Storage → chỉ xóa các mục `spx-tracker-*`.

### 3. Parser đọc dòng "Tổng" bị OCR làm hỏng dấu
Engine đọc "Tổng" thành `T6ng`/`Téng`/`Tong` → trước đây không nhận ra Tổng, và con số trong dòng đó (vd 119) bị lấy nhầm
làm số đơn. Giờ chấp nhận đúng 1 ký tự bất kỳ giữa `T` và `ng` (không khớp "Tháng 10": có 2 ký tự).

### Dữ liệu thật đã đưa vào bộ test
- `tests/fixtures/ocr-images/` — 7 ảnh SPX thật (đã nén ~570 KB): đủ 3 tab, 6 dải cân, có ảnh có "đảo động".
- `tests/fixtures/ocr/` — 9 ca từ ảnh/app thật (1 log thật từ app `vie`; 7 từ ảnh qua `eng`, trong đó **1 ca "an toàn"**:
  hai thẻ đầu bị đọc hỏng → parser **không được** cho kết quả trông như đã khớp Tổng 119) + 12 ca mô phỏng.
- Phát hiện từ ảnh thật: ở bản SPX này dải cân ghi dạng `0.000 - 2.001`, `15.001 - 999999.000` (đã được parser xử lý đúng).

## v2.8 — "Tầng 1: độ tin cậy" (tóm tắt)
Gồm: `scripts/sync.mjs` (tự sinh precache + phiên bản), e2e Playwright, `tsc checkJs`, hoàn tác (`js/undo.js`), fixture OCR.
Chưa chạy được ở môi trường của mình: WebKit/iOS và ESLint.

### 1. Tự sinh danh sách precache + phiên bản (`scripts/sync.mjs`)
`sw.js` từng lệch với thư mục thật hai lần (liệt kê file không tồn tại → Service Worker không cài được).
Giờ `CORE` được quét từ thư mục thật (+ icon trong manifest) và `CACHE`/meta lấy từ `version.json`:
`npm run sync` · `npm run sync:check` (CI) · `npm run bump`. Không phụ thuộc gói nào (thay cho Vite — xem cuối).

### 2. Test trên trình duyệt thật (`e2e/`, Playwright)
Smoke (không lỗi console / 404, mọi `onclick` có hàm), PWA (precache đủ CORE; **tải lại khi offline vẫn chạy**; manifest),
nhập tay, hoàn tác, ngày chưa cập nhật, nạp dữ liệu (Esc = Hủy), nhắc backup.
Cấu hình chạy cả Chromium (Pixel 7) và WebKit (iPhone 14); CI ở `.github/workflows/ci.yml`.

**Lỗi thật mà e2e bắt được và đã sửa:**
- **Trang tự tải lại ~2 giây sau lần mở đầu tiên** (Service Worker vừa cài xong báo `SW_UPDATED` → `location.reload()`):
  làm mất toast, form đang nhập, thao tác đang làm. Giờ bỏ qua đúng lần kích hoạt đầu tiên; các bản cập nhật sau vẫn tải lại.
  (`js/main.js`, có test hồi quy — đỏ trên bản cũ, xanh trên bản mới.)

### 3. Kiểm tra kiểu (`npm run typecheck`, TypeScript `checkJs`)
Không đổi cách viết code. Bắt tên không tồn tại, import thừa / không được export, sai số tham số. Dọn 12 import thừa
và vài chỗ kiểu; ~66 cảnh báo `getElementById(...).value` (HTMLElement) được đếm riêng và bỏ qua có chủ đích.

### 4. Hoàn tác thật (`js/undo.js`)
Toast "Hoàn tác" 6 giây (kèm thanh đếm ngược) sau khi xóa **bản ghi / cả tháng / toàn bộ**. Hoàn tác = chèn lại đúng các
bản ghi đã xóa (giữ id, giữ vị trí) — **không** khôi phục snapshot, nên bản ghi nhập thêm trong lúc chờ không bị mất.
Xóa lần nữa thì chỉ hoàn tác được thao tác gần nhất.

### 5. Hồi quy parser OCR bằng văn bản OCR thật (`tests/fixtures/ocr/`)
12 ca mô phỏng + công cụ biến log "Copy log" thành ca thật: `node scripts/ocr-fixture.mjs`.
**Điểm yếu parser tìm được và đã sửa:** chữ số của ngày (`17/10/2026`) có thể bị lấy nhầm làm số đơn khi một chữ số đơn
bị đọc sai → giờ loại chữ số thuộc ngày khỏi danh sách ứng viên.

### Khác với đề xuất ban đầu (do môi trường của mình không có mạng)
- **Vite / vite-plugin-pwa** → thay bằng `scripts/sync.mjs` (không cần cài gói, đã kiểm chứng). Vite có thể thêm sau nếu muốn bundle/minify.
- **ESLint** → thay bằng `tsc` (`noUnusedLocals` + `checkJs` đã bắt phần lớn thứ ESLint cơ bản bắt: biến thừa, tên không tồn tại).
- **Đo độ chính xác OCR bằng ảnh thật** → mình không có ảnh SPX thật nên mới làm được *khung* (fixture + công cụ). Bạn thêm ca thật dần.
- **`@ts-check` từng file** → không cần: `tsconfig.json` đã bật `checkJs` cho toàn bộ `js/**`.
- **WebKit trong CI**: đã cấu hình nhưng mình chưa chạy được; lần đầu chạy trên GitHub nếu có kịch bản đỏ ở WebKit thì đó là phát hiện thật cần xem.

## v2.7 (tóm tắt) — bản v2.6 của bạn + tách OCR
**Giữ nguyên toàn bộ thay đổi của bạn** (v2.3 → v2.6): danh sách ngày chưa cập nhật (modal Nhập/Quét),
nhận diện tab Giao/Lấy/Hoàn mới (bỏ qua Dynamic Island), script theme trước khi vẽ, `role="dialog"`/`aria-modal`,
`try/catch` quanh `localStorage`, bỏ `@import` Google Fonts, hạn token 90 ngày, đổi chữ "OCR" → "quét ảnh"…

### Tách `ocr.js` (1.878 dòng) → `js/ocr/` (10 file)
| File | Việc |
|---|---|
| `index.js` | Cổng vào duy nhất — `main.js`, `entry.js` chỉ import từ `./ocr/index.js` |
| `abort.js` | Điều khiển hủy (AbortController) — tầng thấp nhất |
| `worker.js` | Tesseract.js: nạp thư viện (`TESSERACT_LIB_URL`), worker, nhận dạng có timeout/retry |
| `preprocess.js` | Đọc file, thumbnail, phóng to + Otsu, hash |
| `detect.js` | Nhận diện tab từ gạch chân cam |
| `parser.js` | Văn bản OCR → số đơn theo dải cân, ngày, kiểm tra phân bố, sửa chữ số (thuần logic) |
| `progress.js` | Thanh tiến trình, nút Hủy, toast tổng kết, log |
| `form.js` | Điền form từ kết quả, tô độ tin cậy, banner cảnh báo, so sánh, xem ảnh |
| `batch.js` | Lô ảnh: trạng thái, modal, nhập từng ảnh, lưu tất cả |
| `processor.js` | Điều phối: 1 ảnh (nhiều lượt) → cả lô → tự lưu / đưa vào lô cần xem |

Chiều phụ thuộc, **không có vòng**: `abort ← worker, preprocess, detect` · `parser` · `progress ← form ← batch ← processor`.
Cách tách là cắt nguyên văn từng hàm (không viết lại logic); đã đối chiếu từng dòng — 31 dòng khác biệt đều là
import/export, đổi tên hàm nội bộ (`_checkAborted` → `checkAborted`…), và 3 biến dùng chung chuyển sang hàm
truy cập (`getBatchResults`/`setBatchResults`, `getLastOcrLog`/`setLastOcrLog`, `clearActiveBatchItem`).

Test mới giữ cấu trúc này: không vòng import; `parser.js` chỉ phụ thuộc `config` + `utils`; các tầng thấp
không kéo theo UI/state; bên ngoài chỉ được import từ `ocr/index.js`; mọi file `js/**` phải nằm trong `CORE` của sw.js.

## Đã sửa khi ghép (lỗi có trong repo hiện tại của bạn)
- **`sw.js` (v2.6) liệt kê 9 file không tồn tại** (`js/ocr/*` và 2 icon maskable) → `cache.addAll` 404 → Service Worker
  không cài được (mất offline + mất cập nhật). Đã sửa danh sách theo cấu trúc thật.
- **Thiếu `icons/icon-maskable-192.png` và `icon-maskable-512.png`** (manifest + sw.js đã tham chiếu). Mình tạo từ
  `icon-512.png`: logo thu còn 80%, nằm trong vùng an toàn maskable (xa tâm nhất 172px / giới hạn 205px).
  **Nếu bạn đã có icon maskable riêng, hãy giữ file của bạn.**
- `charts.js` (trong thư mục bạn gửi) **không được import ở đâu, không có trong sw.js/index.html** → không đưa vào gói.
  Muốn dùng lại: thêm vào `CORE` và gọi `toggleCharts()` từ UI; lưu ý nó nạp Chart.js từ CDN (không cache offline).

## Còn lại (cố ý chưa làm)
- Chưa thử trên trình duyệt/điện thoại thật: OCR offline, nút Hủy OCR, hộp thoại, modal ngày chưa cập nhật.
- `ui.js` (~730 dòng) và `main.js` (~620 dòng) vẫn lớn; `ui.js` mới có ~30% độ phủ test.
- Ngày nghỉ vẫn được tính là "chưa cập nhật" (app không biết lịch nghỉ).
