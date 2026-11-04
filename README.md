# SPX Tracker

PWA theo dõi điểm / thu nhập tài xế SPX: nhập tay hoặc quét ảnh (OCR), lưu cục bộ, sao lưu file / GitHub Gist, chạy offline.

## Chạy thử
```
npm run serve          # http://localhost:4173  (không cần cài gói nào)
```

## Kiểm tra trước khi phát hành
```
npm install            # lần đầu: TypeScript + Playwright
npm run check          # sync:check + typecheck + 130+ test (unit/tích hợp) — ~10 giây
npm run e2e:install    # lần đầu: tải Chromium + WebKit
npm run e2e            # test trên trình duyệt thật (Android/Chrome + iOS/Safari)
```
`npm test` không cần cài gì (chỉ Node ≥ 20).

## Phát hành bản mới
```
npm run bump           # v2.8 → v2.9: tự cập nhật version.json, CACHE trong sw.js, meta trong index.html
npm run sync           # sau khi thêm/xóa file js/css/icon: tự sinh lại danh sách precache (CORE) trong sw.js
```
Không sửa tay `CORE` / `CACHE` trong `sw.js` nữa — `npm run sync:check` (và CI) báo đỏ nếu lệch.

## Cấu trúc
| Thư mục | Nội dung |
|---|---|
| `js/` | Mã app (ES module). `js/ocr/` = OCR, cổng vào `js/ocr/index.js` |
| `tests/` | Unit/tích hợp (`node --test`), `tests/fixtures/ocr/` = ca hồi quy cho parser OCR |
| `e2e/` | Test trình duyệt thật (Playwright) |
| `scripts/` | `sync.mjs` (đồng bộ phiên bản/precache), `typecheck.mjs`, `serve.mjs`, `ocr-fixture.mjs` |
| `types/` | Khai báo biến toàn cục cho TypeScript (chỉ để kiểm tra) |

## Tăng độ chính xác OCR bằng dữ liệu thật
Mỗi lần OCR đọc sai: quét ảnh → **Copy log** → `node scripts/ocr-fixture.mjs <ten> log.txt --weights … --total … --date …`
→ test đỏ cho tới khi parser được sửa. Chi tiết: `tests/fixtures/ocr/README.md`.
