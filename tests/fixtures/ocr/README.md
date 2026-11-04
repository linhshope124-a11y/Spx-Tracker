# Fixture OCR

Mỗi file `*.json` là một ca kiểm tra parser: văn bản OCR thô (`rawText`) + đáp án đúng (`expected`).
`npm test` chạy parser trên từng ca và so kết quả.

- `source: "synthetic"` — ca mô phỏng, viết tay để khóa các lỗi đã từng gặp (ngày dính chữ, ISO, "06-10" không phải dải cân…).
- `source: "real"` — log "Copy log" thật từ app (engine vie). `source: "real-image"` — văn bản OCR (engine eng ở máy dev) của ảnh SPX thật đã có trong `tests/fixtures/ocr-images/`; đáp án đọc bằng mắt từ ảnh. **Đây mới là thứ đo được độ chính xác thực tế** — càng nhiều càng tốt
  (nên có đủ 3 tab Giao/Lấy/Hoàn, ảnh sáng/tối, ảnh cắt lệch, ảnh có Dynamic Island…).

## Thêm ca từ ảnh thật (không cần lưu ảnh)
1. Quét ảnh trong app → ở form kết quả bấm **Copy log** → dán vào `log.txt`. Xóa tên/SĐT nếu có.
2. `node scripts/ocr-fixture.mjs ten-ca-test log.txt` — xem parser đọc ra gì.
3. Đối chiếu với ảnh. Đúng → `… --accept`. Sai → đưa đáp án đúng:
   `… --weights 60,25,10,5,0,0,0,0 --total 100 --date 2026-10-17`
   (test sẽ ĐỎ cho tới khi parser được sửa — đúng mục đích của hồi quy).
