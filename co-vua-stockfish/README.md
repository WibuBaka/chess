# Cờ vua đấu với Stockfish (200–2000 Elo mục tiêu)

Game chạy hoàn toàn trên trình duyệt: luật cờ bằng `chess.js`, AI bằng Stockfish 19 (WASM, bản lite single‑thread) trong Web Worker.

## Cách nhanh nhất
Mở file `co-vua-stockfish.html` (bản một file, đã nhúng sẵn engine) bằng Chrome/Edge: nhấp đúp là chạy. Nếu trình duyệt chặn engine khi mở trực tiếp, hãy dùng cách chạy máy chủ bên dưới (có thể phục vụ chính file này).

## Chạy game từ thư mục dự án
Không mở trực tiếp `index.html` (Web Worker/WASM không chạy với `file://`). Trong thư mục này:

    python3 -m http.server 8000      # hoặc: npx serve .

rồi mở http://localhost:8000 bằng Chrome/Edge/Firefox/Safari bản mới. Sau khi tải xong, game chạy được khi mất mạng.

## Cấu trúc
    index.html, style.css      giao diện
    js/app.js                  bàn cờ, ván đấu, đồng hồ, PGN, lịch sử, phân tích
    js/ai.js                   điều khiển Stockfish (UCI) + chọn nước theo Elo
    lib/chess.js               chess.js (bản ESM, MIT)
    engine/                    stockfish-19-lite-single.js/.wasm (GPLv3, kèm giấy phép)
    tests/                     run-tests.mjs (perft, luật, engine, ván đấu), ui-smoke.mjs (giao diện)

## Cách AI chỉnh sức mạnh
- **1400–2000:** `UCI_LimitStrength` + `UCI_Elo` của Stockfish (giá trị tối thiểu của engine là 1320).
- **200–1300:** lấy 6 nước ứng viên (MultiPV) ở độ sâu nông (1–7), chọn ngẫu nhiên có trọng số theo độ thiệt hại centipawn; nước thiệt hại vượt ngưỡng (≈670 cp ở 200 Elo, giảm dần) bị loại để không "tự sát" vô lý. Mọi nước đều là nước hợp lệ do engine sinh ra.
- Elo là **mức mục tiêu ước lượng**, chưa hiệu chỉnh với đối thủ tham chiếu.

## Kiểm thử
    npm install && npm test

## Chưa có / giới hạn
Chưa có chọn bộ quân khác (quân vẽ bằng ký tự Unicode), chưa có nút tạm dừng, chưa có chơi online. Hòa do lặp 3 lần/luật 50 nước được tự động áp dụng.
