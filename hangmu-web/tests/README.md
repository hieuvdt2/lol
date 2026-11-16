# Kiểm thử

| Lệnh | Phạm vi | Cần gì | Thời gian |
|---|---|---|---|
| `npm test` | unit + server + `NetClient` | Node ≥ 22.6 | ~7 giây |
| `npm run test:e2e` | giao diện thật (máy tính + cảm ứng) | Chrome/Chromium | ~1 phút |

- `tests/unit`: giao thức nhị phân, chuẩn hóa chat, mô phỏng di chuyển (`src/game/*.ts` chạy trực tiếp bằng `--experimental-strip-types`).
- `tests/server`: mỗi file tự bật `server/hangmu-server.mjs` ở cổng trống và nói chuyện bằng WebSocket thô (phòng, hàng chờ, duel, ném đồ).
- `tests/client`: chạy `NetClient` thật với server thật, chỉ giả lập `window`/`document`/`localStorage`.
- `tests/e2e`: Playwright + Chrome headless, Vite dev + server thật. Đặt `CHROME_PATH` nếu Chrome không ở chỗ mặc định; không có Chrome thì bộ này tự bỏ qua.

## Đo hiệu năng (không phải test, không chạy trong `npm test`)

| Lệnh | Đo gì |
|---|---|
| `npm run perf:actors` | Chi phí dựng hình theo số người: texture, geometry, draw call, tam giác, heap (cần Chrome). `SPREAD=0/1`, `STEPS=0,50,150`. |
| `npm run perf:network` | Băng thông server gửi ra và CPU server theo số client. `N=300 PROFILE=realistic\|worst INTEREST=on\|off SECONDS=12`. |
| `npm run perf:accuracy` | Độ lệch giữa vị trí người khác hiển thị và vị trí thật, theo khoảng cách và chế độ lọc. |

## Lưu ý

- WebGL headless chạy bằng SwiftShader, chỉ vài khung hình/giây, nên E2E **không** đo hiệu năng và các bước di chuyển chờ tới khi đạt vị trí thay vì chờ theo thời gian.
- E2E đọc trạng thái qua `window.__hangNet`, chỉ có khi chạy Vite dev.
- Biến môi trường của server dùng cho test: `DUEL_COUNTDOWN_MS`, `DUEL_ROUND_MS`, `RESUME_GRACE_MS`, `CAPACITY`, `BOTS`, `QUEUE_MAX`, `INTEREST` (`on`/`off`), `INTEREST_NEAR`, `INTEREST_MID`, `INTEREST_MID_EVERY`, `INTEREST_FAR_EVERY`, `MAX_SPEED`.
- Test thất bại không được phép làm treo tiến trình: file server dùng `closeAll()` trong `after`, và cờ `--test-force-exit` là lưới an toàn.
- Khi thêm tính năng, nên thử "đột biến" (cố ý phá logic rồi xem test có đỏ không). Một bài test "nối lại" từng qua nhờ điều kiện chờ đúng ngay lập tức; xem ghi chú trong `tests/client/netclient.test.mjs`.

## Vận hành server

- `tests/server/ops.test.mjs`: board/sys/notice/poll, API quản trị, kick/ban, lưu bền vững, health, tắt êm, log. `tests/server/lib.test.mjs`: log, lưu nguyên tử, kiểm tra dữ liệu.
- Mỗi server do test bật có thư mục dữ liệu tạm riêng (`DATA_DIR`), được xóa khi `stop()`. `startServer(env, { ready: 'http' })` chờ qua `/healthz` (khi `LOG_LEVEL=error` dòng khởi động không xuất hiện); `server.stop('SIGTERM')` là tắt êm và trả `{ code, signal }`; `server.output()` là log.
- `npm run perf:soak`: giữ ~400 client đi lại, chat, duel, vào/ra, mất kết nối rồi nối lại; ghi RSS/heap của server (qua `/admin/status?gc=1`) và độ dốc tăng bộ nhớ. `N=400 SECONDS=120`.


## Bộ chạy
`npm test` chạy từng file `tests/{unit,server,client}/*.test.mjs` trong một tiến trình riêng (`scripts/test-all.mjs`, song song 3 file; `TEST_CONCURRENCY` đổi số này; `npm test -- <tên>` chỉ chạy file khớp) và cộng kết quả. `npm run test:fast` là bản gộp `node --test --test-force-exit`, nhanh hơn một chút nhưng đếm số test có thể hụt ngẫu nhiên.
E2E (`npm run test:e2e`) chạy server và Vite thật trên cổng ngẫu nhiên; không gọi dịch vụ bên thứ ba (widget LCK dùng số liệu nhập tay).
