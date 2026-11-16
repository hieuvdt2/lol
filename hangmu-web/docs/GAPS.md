> **Lưu ý 2026-11-12:** các mục về dữ liệu bóng đá (A3 proxy ESPN, B1 widget tỷ số + ăn mừng bàn thắng, màn tỷ số MU) đã được GỠ và thay bằng nội dung esport (bảng xếp hạng LCK nhập tay). Xem `docs/STATUS.md` mục 2b. Phần còn lại của tệp này là lịch sử.

# Danh sách còn thiếu so với bản gốc, và thứ tự xử lý

Nguồn bằng chứng: bundle `hangmu-site/assets/index-q9fqu_zQ.js` (1,3 MB), `server.mjs` (bản ghi), `evidence.json`.
**Giới hạn của bằng chứng:** capture chỉ có phần sảnh + lõi mạng + kho dữ liệu. Chunk `CaveScreen-*.js`, `duel-*.js`,
`duelMusic-*.js` và CSS của hang **không có trong capture** → giao diện/cảnh 3D trong hang của bản gốc chỉ so được bằng
ảnh chụp, không so được bằng mã. Mục nào ghi `[Unverified]` là suy luận từ bằng chứng gián tiếp.

Quy ước: ✅ đã có · ◐ có một phần · ❌ thiếu · ⛔ đã quyết định bỏ (cần xác nhận lại) · ❓ không có bằng chứng để so.

## Trạng thái hiện tại (cập nhật cuối phiên này)

| # | Hạng mục | Trạng thái | Bằng chứng kiểm tra |
|---|---|---|---|
| A1 | `/api/me` + cookie `hm_sid` (HttpOnly, 14 ngày) + lưu bền vững | ✅ | `tests/server/accounts.test.mjs` (12 test, 8/8 đột biến bị bắt); e2e luồng "Vào hang" dùng hồ sơ đã lưu |
| A2 | Quiz do server ra đề và chấm; sai vẫn được vào; lỗi API thì vào luôn | ✅ | `tests/server/quiz.test.mjs` (6 test, 4/4 đột biến); 14 câu hỏi tự viết |
| A3 | Proxy `/ext/espn/*` (allowlist, cache, gộp yêu cầu, dùng bản cũ, giới hạn tần suất) | ✅ | `tests/server/espn.test.mjs` (12 test, 9/9 đột biến); đã thử với ESPN thật: MAN 4–4 AVL, 8 bàn, bảng 20 đội |
| A4 | Bảng "Võ công cao nhất hang" theo mã người dùng, theo tuần (thứ Hai 00:00 giờ VN), top 8, xoá sau ~8 ngày, phát lại khi sang tuần | ✅ | `tests/server/ladder.test.mjs` (9 test, 6/6 đột biến), gồm test sang tuần thật bằng `WEEK_OFFSET_HOURS` |
| A5 | Lọc từ thô tục (chat chung + riêng), che link/SĐT (chat riêng) | ✅ phần cơ chế · [Unverified] danh sách từ gốc | `tests/server/filter.test.mjs` (10 test, 7/7 đột biến); danh sách từ là tự lập, tối thiểu |
| A6 | Giữ chỗ 30 giây khi rớt mạng | ✅ (đã có sẵn: `RESUME_GRACE_MS`) | `tests/server/room.test.mjs` |
| A7 | Chat giọng "Hội trường đá", báo cáo/mời ra bằng bỏ phiếu 40% | ⛔ đã quyết định bỏ | cần bạn xác nhận (mục E) |
| B1 | Widget tỷ số: trận đang đá/vừa xong/sắp tới, bàn thắng, bảng xếp hạng, lịch; **màn ăn mừng toàn màn hình khi MU ghi bàn** + tiếng khán đài | ✅ | `tests/unit/match.test.mjs` (25 test), `goal.test.mjs` (5), e2e desktop + điện thoại; 24 đột biến |
| B2 | Âm lượng 0–100 (mặc định 35), tắt tiếng, khoá `hangmu.muted` / `hangmu.volume` (đọc được khoá cũ) | ✅ | `tests/unit/audio.test.mjs` (+7 test); e2e thanh âm lượng |
| B3 | Rời hang khi ẩn tab > 1 giờ, đóng kết nối khi rời trang (server giữ chỗ 30 s) | ✅ (đã có sẵn trong `net.ts`) | `tests/client/netclient.test.mjs` |
| B4 | Hàng đợi thông báo (toast): biểu tượng, tên in đậm, gộp tên, "🔥 N anh em vừa vào hang!" từ 10 người, tối đa 3 chờ, 4,2 s/cái, bỏ cái chờ quá 15 s, tạm dừng khi tab ẩn hoặc đang ăn mừng bàn thắng; nút ✈ Telegram | ✅ (kind `tele_invite` chỉ phía client; server chưa phát loại này) | `tests/unit/notices.test.mjs` (13 test, 8/8 đột biến); e2e toast |
| B5 | Giao diện bảng võ công cho mọi người trong hang (nút 🥋 Võ công) | ✅ | e2e desktop |
| B6 | Mã QR ủng hộ | ⚠ **vẫn là QR/tài khoản của bản gốc** | chờ quyết định của bạn |
| B7 | `club-logo.svg` của bản gốc | ✅ đã xoá khỏi `public/` | — |
| C1 | Nhân vật (mô hình, trang phục) | ❓ không có mã gốc để so | chỉ so được bằng ảnh chụp |
| C2 | Hành động (đi, đấm, ngồi, bị đấm) | ✅ viết lại, mượt hơn | `tests/unit/gait.test.mjs` (17 test) |
| C3 | Hang: họa tiết đá, rêu, dây leo, áo treo | ◐ chưa nâng cấp | chưa làm |
| C4 | Sàn đấu, ném đồ 3D | ✅ có · ❓ chưa so với gốc | cần chunk `duel-*.js` |

### Phát hiện thêm trong phiên này (không nằm trong danh sách ban đầu)
- **Sập server**: một đường dẫn có `%` sai (`/%E0%A4%A`) làm sập cả phòng. Đã sửa (mọi lỗi HTTP chỉ ảnh hưởng yêu cầu đó) + test hồi quy.
- `npm run dev` đang chạy `server/room.mjs` (bản phòng tối giản ban đầu) thay vì server đầy đủ → đã đổi sang `hangmu-server.mjs`. `room.mjs` còn nằm đó, không dùng nữa.
- Vite dev có plugin giả `/api/*` (trả dữ liệu ghi sẵn) che mất API thật → đã bỏ, thay bằng proxy tới server.
- Bản gốc có thêm: hàng đợi thông báo (toast), màn ăn mừng bàn thắng, thanh âm lượng — cả ba đã làm (B4, B1, B2).
- `npm test` gộp nhiều file bằng `--test-force-exit` bị đếm hụt ngẫu nhiên (238–250 cho cùng bộ test, không mất test nào). Đã thay bằng `scripts/test-all.mjs` chạy riêng từng file (250/250 ổn định); bản cũ còn là `npm run test:fast`.

## Bảng đối chiếu ban đầu (trước khi xử lý)

### A. Phía server (HTTP/API)

| # | Hạng mục (bằng chứng trong bundle) | Hiện tại | Việc cần làm |
|---|---|---|---|
| A1 | `GET/POST /api/me`: lưu tên + số áo theo cookie `hm_sid` (HttpOnly), hết hạn 14 ngày từ lần vào gần nhất (điều khoản gốc) | ❌ server luôn trả `null`; tên chỉ lưu localStorage | Cookie `hm_sid`, kho `me` có TTL 14 ngày, kiểm tra tên (1–30 ký tự) và số 1–99 |
| A2 | `GET /api/quiz`, `POST /api/quiz/answer` `{questionId, answerId}` → `{correct, correctAnswerId}` | ◐ quiz chạy cục bộ trên client | Server giữ ngân hàng câu hỏi + chấm; client gọi API (giữ bản cục bộ làm dự phòng khi API lỗi) |
| A3 | `GET /ext/espn/*` (proxy dữ liệu trận: `all/teams/360`, `all/teams/360/schedule[?fixture=true]`, `all/scoreboard/{id}`, `all/summary?event=`, `standings/eng.1`) | ❌ | Proxy có allowlist đường dẫn, cache ngắn, timeout, giới hạn tần suất. `[Unverified]` điều khoản của API ESPN không công bố |
| A4 | Bảng "Võ công cao nhất hang": top 8 thắng/tuần, theo mã ngẫu nhiên, làm mới thứ Hai, xoá sau ~8 ngày | ◐ có top 8 nhưng theo **tên**, không reset tuần | Gắn với `hm_sid`, đặt mốc tuần, TTL |
| A5 | Lọc từ thô tục tự động; che link và số điện thoại trong chat riêng | ❌ (chỉ chuẩn hoá ký tự ẩn) | Bộ lọc + che trong `handleChat`/`handleDm`; `[Unverified]` danh sách từ của bản gốc (không có trong capture) |
| A6 | Giữ chỗ ~30 giây khi rớt mạng, theo mã người dùng | ◐ có resume theo mã tab | Kiểm tra lại thời hạn 30 s |
| A7 | Hội trường đá (chat giọng, ≤50 người, relay âm thanh) và báo cáo/mời ra bằng bỏ phiếu 40% | ⛔ | Chờ bạn xác nhận (xem mục E) |

### B. Phía client

| # | Hạng mục | Hiện tại | Việc cần làm |
|---|---|---|---|
| B1 | **Widget tỷ số**: bộ theo dõi trận (poll 10 s khi đang đá, 30 s nghỉ giữa hiệp, lịch/trận vừa xong, bàn thắng, đồng hồ), bảng xếp hạng `eng.1` (5 phút), danh sách lịch | ❌ | Kho dữ liệu `matchStore`/`standingsStore` theo đúng quy tắc của bundle (hàm thuần, có test) + giao diện widget trong hang. `[Unverified]` bố cục nhìn của bản gốc (nằm trong chunk không capture) |
| B2 | Âm lượng 0–100 (mặc định 35), tắt tiếng, khoá `hangmu.muted` / `hangmu.volume` | ◐ chỉ bật/tắt | Thanh âm lượng + lưu khoá giống bản gốc |
| B3 | Tự rời hang khi ẩn tab quá 1 giờ; tự tải lại khi có bản mới (chỉ khi rảnh) | ◐ có banner bản mới | Đối chiếu từng quy tắc; bổ sung phần còn thiếu |
| B4 | Thông báo "… vừa vào hang" / "đã tham gia Tele HangMu.online", nút nhóm Telegram từ `telegramUrl` | ◐ | Kiểm tra từng chuỗi |
| B5 | Bảng "Võ công cao nhất hang" hiển thị cho mọi người trong hang | ◐ dữ liệu có, giao diện chưa kiểm | Kiểm tra giao diện |
| B6 | Mã chuyển khoản ủng hộ | ⚠ đang dùng **đúng ảnh QR và tài khoản của bản gốc** | **Quyết định của bạn**: thay bằng QR của bạn trước khi công khai |
| B7 | `club-logo.svg` bản gốc nằm trong `public/images` | ⚠ trái chính sách asset (không dùng logo CLB), không được tham chiếu | Xoá khỏi `public` |

### C. Cảnh 3D, nhân vật, hành động

| # | Hạng mục | Hiện tại | Ghi chú |
|---|---|---|---|
| C1 | Nhân vật: mô hình, trang phục, số áo, tên | ❓ | Bản gốc nằm trong chunk không capture; chỉ so được bằng ảnh chụp |
| C2 | Hành động: đi/chạy, đấm, ngồi, bị đấm | ✅ viết lại ở phiên này (mượt) | Chưa thử trên thiết bị thật |
| C3 | Hang: đá, rêu, dây leo, áo treo, bộ đếm vạch, 5 hình nộm | ◐ bản vẽ tự tạo, thô hơn ảnh gốc | Nâng cấp họa tiết tự vẽ |
| C4 | Sàn đấu, ném đồ 3D | ✅ có, ❓ so với gốc | Cần chunk `duel-*.js` để đối chiếu |

### D. Kiểm tra giao thức (đã đối chiếu tự động)

Mọi `case` của bộ xử lý tin nhắn WebSocket trong bundle gốc (admitted, board, busy, chat, chatAck, chatDropped,
correction, engaged, game, join, leave, moves, notice, poll, pong, punchHit, punched, queued, rejected, replaced, sys,
welcome) đều đã có trong `net.ts`. Không có tin nhắn nào bị thiếu.

### E. Cần bạn quyết định

1. Chat giọng "Hội trường đá" + báo cáo/mời ra bằng bỏ phiếu: giữ bỏ qua hay làm? (Làm = relay âm thanh phía server, phần khó nhất.)
2. Mã QR ủng hộ: dùng QR của bạn (gửi ảnh, hoặc tôi để trống phần này).
3. Cảnh hang/nhân vật: nếu muốn giống hơn nữa, cần ảnh chụp/quay màn hình bản gốc trong hang hoặc các file `CaveScreen-*.js`, `duel-*.js`.

### Thứ tự đã xử lý

1. **B7** (xoá logo CLB) — việc dọn nhỏ, không phụ thuộc gì.
2. **A1 + A6** — danh tính người dùng (`hm_sid`, `/api/me`) vì A2, A4 phụ thuộc vào nó.
3. **A2** — quiz do server chấm.
4. **A4 + B5** — bảng võ công theo tuần.
5. **A3 + B1** — proxy dữ liệu trận rồi widget tỷ số / bảng xếp hạng.
6. **B2, B3, B4** — âm lượng, quy tắc rời/tải lại, chuỗi thông báo.
7. **A5** — lọc từ thô tục, che link.
8. **C3** — nâng cấp hang. Các mục còn lại chờ mục E.

Mỗi bước: viết test trước/sau, chạy `npm test` + e2e, cập nhật bảng này.

## Rà soát lỗi thao tác (sau báo cáo của người dùng)
| Lỗi | Nguyên nhân (đã đo/tái hiện) | Sửa | Kiểm tra |
|---|---|---|---|
| Máy được mời không thao tác được | Đang khoá chuột (pointer lock) thì con trỏ bị ẩn, mọi cú bấm rơi vào cảnh nên không bấm được "Đồng ý"; chat riêng/duel cũng vậy | Nhả khoá khi có lời mời, đang mời, chat riêng, duel; thêm phím Y/Enter = đồng ý, N/Esc = từ chối (Esc không còn làm rời hang khi có lời mời) | e2e desktop (tái hiện được: bấm "Đồng ý" bị timeout trước khi sửa) |
| Nhân vật tự đi trên điện thoại | Ngón còn đặt trên cần điều khiển khi cần bị gỡ (có chat riêng/duel) thì sự kiện nhả không tới, vector cuối cùng giữ nguyên; phím bị kẹt khi mất focus | Cần tự xả khi bị gỡ, xử lý `lostpointercapture`, ngón mới thay ngón cũ, xả phím/cần khi mất focus hoặc khi đóng băng | e2e cảm ứng: trước khi sửa nhân vật tự đi 15,45 đơn vị |
| Người chơi khác giật, khựng | (1) Khi nhận bản ghi vị trí, curr bị thay nhưng prev không dịch theo → sai lệch bị nội suy hết trong một tick (nhảy tới 36 đv/s, 21/238 khung); (2) bot trên server đi 3,2 đv/s nhưng báo hướng tốc độ đầy đủ (8) nên client dự đoán nhanh gấp 2,5 lần và bị kéo giật liên tục (hệ số biến thiên tốc độ 1–2, đỉnh 152 đv/s) | Dịch cả prev cùng curr; bot đi đúng mô hình gia tốc/hướng lượng tử hoá mà client dự đoán | `tests/client/netclient.test.mjs` (2 test đo ở 60 Hz; cả hai thất bại khi hoàn lại mã cũ) |
| Ném đồ trên điện thoại: bảng che hình nộm | Bảng ở giữa-trái cao ~360px che tâm màn hình, hình nộm nằm đúng giữa | Bảng gọn dán đáy (≤36% chiều cao, hàng cuộn ngang), ẩn cần điều khiển và khung chat, đẩy hình nộm lên nửa trên bằng `setViewOffset` (tia ném vẫn khớp) | e2e cảm ứng + ảnh chụp |
| Trùng tên lớp CSS | `hang-toast` và `hang-notice` đã có sẵn, lớp mới ghi đè kiểu cũ | Đổi thành `hang-event` | e2e kiểm tra chồng chéo |

## Giao diện trong hang theo ảnh chụp bản gốc (người dùng cung cấp)
Nguồn: hai ảnh chụp màn hình bản gốc (không có mã, vì chunk `CaveScreen` không nằm trong capture).
| Thấy trên ảnh | Trạng thái |
|---|---|
| Màn hình tỷ số treo giữa hang (bốn mặt, "HANG MU TRỰC TIẾP", tỷ số, hai đội, bàn thắng hai bên, hai tấm biển dưới) | ✅ `scoreboard.ts` + `hangingBoard.ts`, dữ liệu từ bộ theo dõi trận |
| Cụm nút trên-trái (Ra hang, âm lượng, Group Tele), "Hang chung N anh em" trên-phải | ✅ |
| Chat bên phải có nút Ẩn + mục "Hoạt động" (ai đấm ai; server phát lời đấm cho cả hang, có bong bóng) | ✅ |
| Bảng "phong thần tuần này" bên trái | ◐ mới có mục "Cao thủ võ công"; ba mục còn lại thuộc các trò chưa có |
| Ủng hộ / © / Phím (H); Enter để nhắn tin | ✅ |
| Camera thấp hơn, đường chân trời giữa màn hình | ✅ (pitch 0,14, nhìn cao hơn đầu) |
| Nút "Ăn mừng [G]" | ✅ phím G / nút / 🎉 trên điện thoại; server chuyển `{t:'emote'}` cho cả hang (tin nhắn tự đặt, [Inference] không phải giao thức gốc); hoạt hình giơ tay nhún nhảy 2,4 s |
| Trò "Kéo co 2v2" (sân bên trái hang, nhấn E), "ôm bóng" (mục điểm), nhạc/Highlight MU có thanh âm lượng riêng | ❌ không có bằng chứng giao thức, chỉ thấy trên ảnh |
| Cờ tam giác giăng trên trần | ✅ `buntingLayout.ts` + `bunting.ts` (hai lượt vẽ) |
| Màn hình video lớn, bảng tin ở hội trường, sân cỏ kéo co | ❌ chưa làm (video là iframe YouTube nên không dán lên vật thể 3D được; hiện vẫn mở ở khung 2D khi ngồi) |

## Tối ưu giao diện điện thoại (phiên cuối)
- Thanh đầu trang một hàng (45 px) ở 360×640, 390×844, 844×390; số người rút còn "👥 N".
- **Lỗi thật tìm thấy:** điện thoại nằm ngang (chiều cao ≤ 480 px) → hộp thoại quiz cao 460 px không cuộn được, nút "Vào hang" nằm ngoài màn hình, người chơi bị kẹt ở sảnh. Đã sửa (cuộn được + bố cục gọn khi màn hình thấp).
- Màn hình dọc: góc nhìn dọc cố định 55° làm góc ngang chỉ ≈ 26°, bảng treo rộng 558 px trên màn 390 px. Nay góc nhìn nới theo tỉ lệ khung (tối đa 78°) và camera lùi nhẹ (`src/game/view.ts`).
- Điện thoại nằm ngang dùng bố cục gọn (theo `pointer: coarse`, không chỉ theo bề rộng); khi ném đồ ẩn bảng treo để khung đỏ mặt dưới không che màn hình.
- Test: `tests/e2e/mobile-sizes.test.mjs` (3 cỡ màn hình), `tests/unit/view.test.mjs`.
