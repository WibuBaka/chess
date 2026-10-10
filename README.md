# Cờ vua – Stockfish, bạn bè & Custom Studio

Game cờ vua chạy hoàn toàn trên trình duyệt (không cần máy chủ riêng), giao diện lấy cảm hứng từ chess.com.

| Chế độ | Mô tả |
| --- | --- |
| **Chơi với máy** | Đấu Stockfish 19 (WASM, trong Web Worker), 19 mức Elo mục tiêu từ 200 đến 2000, đồng hồ, chế độ luyện tập, phân tích sau ván. |
| **Chơi với bạn** | Hai người trên cùng một thiết bị: đặt tên, đồng hồ, tự xoay bàn theo lượt, đề nghị hòa, quay lại nước. |
| **Custom Studio** | Tự tạo trò chơi cờ của riêng bạn (xem bên dưới), chơi với bot hoặc với bạn. |

Ngoài ra: kéo-thả quân, quân trượt mượt, chuột phải để tô ô / vẽ mũi tên, âm thanh, 5 màu bàn cờ, 2 bộ quân, giao diện sáng/tối, nhập/xuất PGN, lịch sử ván, xem lại ván.

## Custom Studio
1. **Bàn cờ** – kích thước 4–16 ô mỗi chiều, màu ô, **ô khuyết** (ô không tồn tại), hoặc bắt đầu từ mẫu (cờ chuẩn, mini 6×6, Capablanca 10×8, Hậu Amazon, Đại chiến Mã).
2. **Quân cờ** – tạo không giới hạn (tối đa 24) loại quân:
   - **Tự vẽ**: bút tự do, đường thẳng, hộp, elip, vùng tô, tẩy, hoàn tác/làm lại, đối xứng trái–phải, bảng màu. Màu "phe/viền phe" tự đổi theo Trắng/Đen nên vẽ một lần dùng cho cả hai bên.
   - **Tự đặt cách đi** trên bàn xem trước 13×13: nhảy 1 bước (như Mã/Vua), trượt (như Xe/Tượng), trượt tối đa N ô, chỉ đi / chỉ ăn / đi & ăn, bay qua quân cản, chỉ ở nước đầu (như Tốt đi 2 ô), ăn qua đúng 1 quân (như Pháo), đối xứng 8 hướng/4 góc/trái-phải. Có nút thêm nhanh "như Xe/Tượng/Mã/Vua/Tốt".
   - Quân Vua (royal: chiếu/chiếu hết), phong cấp ở hàng cuối, giá trị cho bot (có nút tự tính).
3. **Đặt quân** – bấm hoặc rê chuột để bày quân, tự đối xứng cho đối thủ, điền cả hàng, chọn bên đi trước.
4. **Chơi** – kiểm tra thiết kế rồi chơi với bot (5 mức) hoặc với bạn.

Thiết kế được lưu tự động trong trình duyệt; có thể **Lưu** vào thư viện, **Xuất/Nhập** file `.json` để chia sẻ (dữ liệu nhập vào luôn được làm sạch và giới hạn kích thước).

Luật áp dụng cho ván tùy biến: không để Vua (royal) bị tấn công, hết nước đi khi bị chiếu là thua, không bị chiếu là hòa; hòa khi lặp thế 3 lần hoặc 100 nước không bắt quân/phong cấp. **Chưa có** nhập thành và bắt tốt qua đường trong ván tùy biến (ván "Chơi với máy/bạn" dùng luật đầy đủ).

## Chạy trên máy
Không mở trực tiếp `index.html` bằng `file://` (Web Worker/WASM không chạy). Trong thư mục dự án:

    python3 -m http.server 8000      # hoặc: npx serve .

rồi mở http://localhost:8000 bằng Chrome/Edge/Firefox/Safari bản mới.

## Đăng lên GitHub (và chơi online bằng GitHub Pages)
1. Tạo repository trống trên GitHub, rồi trong thư mục dự án:

        git init -b main
        git add .
        git commit -m "Cờ vua: menu, chơi với bạn, Custom Studio"
        git remote add origin https://github.com/<tên-bạn>/<tên-repo>.git
        git push -u origin main

2. Vào **Settings → Pages → Build and deployment → Source: GitHub Actions**. Workflow `.github/workflows/pages.yml` sẽ tự đăng game tại `https://<tên-bạn>.github.io/<tên-repo>/` sau mỗi lần push.

Mọi đường dẫn trong dự án là đường dẫn tương đối nên chạy được trong thư mục con của GitHub Pages.

## Cấu trúc
    index.html, style.css      giao diện (menu, ván cờ, Studio, hộp thoại)
    js/app.js                  menu, ván Stockfish / chơi với bạn, điều hướng
    js/board.js                bàn cờ W×H dùng chung (kéo thả, trượt quân, mũi tên)
    js/pieces.js               bộ quân SVG tự vẽ + dựng SVG cho quân người dùng vẽ
    js/ai.js                   điều khiển Stockfish (UCI) + chọn nước theo Elo
    js/variant.js              luật cờ tùy biến (bàn W×H, quân tự định nghĩa, chiếu/hết cờ)
    js/variant-ai.js           bot cho luật tùy biến (negamax + alpha-beta), variant-worker.js chạy trong Web Worker
    js/defs.js                 kiểm tra / làm sạch dữ liệu thiết kế, nhập/xuất JSON
    js/studio.js, draw.js, moves.js   Custom Studio: tab, trình vẽ quân, trình đặt cách đi
    js/customgame.js           chơi ván tùy biến
    lib/chess.js               chess.js (ESM, MIT)
    engine/                    stockfish-19-lite-single.js/.wasm (GPLv3, kèm giấy phép)
    tests/                     run-tests.mjs (perft, luật, engine), variant-tests.mjs (luật tùy biến, bot), e2e.mjs (trình duyệt thật)

## Cách AI Stockfish chỉnh sức mạnh
- **1400–2000:** `UCI_LimitStrength` + `UCI_Elo` (tối thiểu của engine là 1320).
- **200–1300:** lấy 6 nước ứng viên (MultiPV) ở độ sâu nông, chọn ngẫu nhiên có trọng số theo độ thiệt hại; nước thiệt hại quá ngưỡng bị loại để không "tự sát" vô lý.
- Elo là **mức mục tiêu ước lượng**, chưa hiệu chỉnh với đối thủ tham chiếu.

Bot của Custom Studio tìm kiếm theo thời gian (0,3–4,5 giây tùy mức), đánh giá bằng giá trị quân bạn đặt; mức thấp cố ý đi sai ngẫu nhiên.

## Kiểm thử
    npm install
    npx playwright install chromium     # lần đầu
    npm test

## Giới hạn hiện tại
- "Chơi với bạn" là cùng một thiết bị; **chưa có chơi qua mạng**.
- Bot Custom không mạnh bằng Stockfish và có thể chậm trên bàn lớn / quân có nhiều nước đi.
- Quân trong Studio chỉ có hình 2D vector; chưa có bộ quân thứ ba ngoài "Neo" và "Phẳng".

## Giấy phép
Dự án phân phối theo **GPL-3.0-or-later** vì kèm Stockfish (GPLv3, xem `engine/LICENSE-stockfish-GPLv3.txt`). `lib/chess.js` theo giấy phép MIT của chess.js. Các hình quân SVG do dự án tự vẽ, không dùng tài nguyên của chess.com hay bên thứ ba.
