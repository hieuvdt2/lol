# Server phòng Hang MU (`hangmu-server.mjs`)

Chạy: `node server/hangmu-server.mjs` (hoặc `npm run hangmu`). Cấu hình hoàn toàn qua biến môi trường.

## Cơ bản

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 8787 | Cổng HTTP + WebSocket (`/ws`) |
| `CAPACITY` | 500 | Số người tối đa trong hang (người thứ 501 vào hàng chờ) |
| `QUEUE_MAX` | 200 | Độ dài tối đa của hàng chờ |
| `BOTS` | 8 | Số bot đi lại trong hang |
| `STATIC_DIR` | `../../hangmu-site` | Thư mục file tĩnh phục vụ kèm (đặt `dist/` để chạy bản build) |

## Bảo vệ khi chạy công khai

Mặc định đã chặt; chỉ nới khi thử trong mạng nội bộ.

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `MAX_PAYLOAD` | 4096 | Kích thước gói tối đa (byte). Gói lớn hơn bị đóng với mã 1009. Thư viện `ws` mặc định là 100 MiB. |
| `ORIGIN_CHECK` | `on` | Trình duyệt phải đến từ cùng nguồn (Origin trùng Host) hoặc nguồn trong `ALLOWED_ORIGINS`; sai thì HTTP 403. Client không gửi Origin (không phải trình duyệt) vẫn qua. |
| `ALLOWED_ORIGINS` | (rỗng) | Danh sách nguồn được thêm, phân cách bằng dấu phẩy, ví dụ `https://hangmu.online,https://www.hangmu.online` |
| `MAX_CONN_PER_IP` | 20 | Số kết nối đang mở tối đa mỗi IP (`0` = không giới hạn). Vượt thì HTTP 429. |
| `CONN_RATE_PER_MIN` | 60 | Số kết nối mới tối đa mỗi IP mỗi phút (`0` = không giới hạn) |
| `TRUST_PROXY` | tắt | Đặt `1` khi đứng sau proxy ngược để dùng `X-Forwarded-For` / `X-Forwarded-Host`. **Chỉ bật khi proxy tự ghi đè các header này**, nếu không client giả được IP. |
| `ENTER_TIMEOUT_MS` | 10000 | Kết nối không gửi `enter` kịp thì bị đóng (mã 4000) |
| `HEARTBEAT_MS` | 30000 | Chu kỳ ping; kết nối không trả lời bị cắt |
| `MSG_RATE` / `MSG_BURST` | 20 / 40 | Gói JSON mỗi giây (bền vững / đột biến) |
| `BIN_RATE` / `BIN_BURST` | 40 / 80 | Gói nhị phân mỗi giây (vị trí, ping) |
| `ABUSE_DROPS` | 100 | Bị bỏ quá số gói này trong 10 giây thì đóng kết nối (mã 1008) |

Lưu ý khi triển khai:

- **Đứng sau proxy ngược** (Caddy, nginx...): bật `TRUST_PROXY=1`, và hoặc để proxy giữ nguyên `Host` gốc hoặc khai báo `ALLOWED_ORIGINS`. Nếu không, mọi client trông như cùng một IP (của proxy) và bị giới hạn chung, hoặc bị 403 vì Origin lệch Host.
- Nhiều người dùng chung một IP (trường học, mạng công ty) cần `MAX_CONN_PER_IP` đủ lớn.
- Các script `npm run lan` và test nới `MAX_CONN_PER_IP` và `CONN_RATE_PER_MIN` về 0 vì mở hàng trăm kết nối từ một máy.

## Chỉnh hành vi / thử nghiệm

`INTEREST` (`on`/`off`), `INTEREST_NEAR`, `INTEREST_MID`, `INTEREST_MID_EVERY`, `INTEREST_FAR_EVERY` (lọc cập nhật vị trí theo khoảng cách),
`MAX_SPEED`, `DUEL_COUNTDOWN_MS`, `DUEL_ROUND_MS`, `RESUME_GRACE_MS`.

## Vận hành, quản trị, lưu trữ

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATA_DIR` | `./data` (cạnh `server/`) | Nơi lưu `state.json` (xếp hạng duel, ban, poll + phiếu, board), ghi nguyên tử, gộp thay đổi ~0,5 giây và ghi khi tắt. Không ghi được thì chạy tiếp không lưu. |
| `ADMIN_TOKEN` | (rỗng) | Bật API quản trị `/admin/*`. Không đặt thì mọi `/admin/*` trả 404. |
| `ADMIN_MAX_FAILS` / `ADMIN_LOCK_MS` | 5 / 900000 | Sai token từng ấy lần trong 10 phút thì khóa IP từng ấy mili giây (429). |
| `ADMIN_RATE_PER_MIN` | 60 | Giới hạn yêu cầu `/admin/*` mỗi IP mỗi phút. |
| `LOG_LEVEL` | `info` | `error`, `info` hoặc `debug`. Log là JSON một dòng mỗi sự kiện. |
| `LOG_CHAT` | tắt | `1` mới ghi nội dung chat (chỉ ở mức `debug`). |
| `SHUTDOWN_MS` | 10000 | Thời gian tối đa của tắt êm trước khi thoát cưỡng bức. |
| `WINS_MAX` | 500 | Số người tối đa trong bảng "Võ công cao nhất hang" (bảng theo mã người dùng `hm_sid`, đếm theo tuần, top 8). |
| `WEEK_OFFSET_HOURS` | 7 | Múi giờ của mốc "thứ Hai 00:00" làm mới bảng võ công (mặc định giờ Việt Nam). |
| `RANK_CHECK_MS` | 60000 | Chu kỳ dọn hồ sơ hết hạn và kiểm tra sang tuần mới (để phát lại bảng). |
| `ACCOUNTS_MAX` | 100000 | Số hồ sơ (tên + số áo theo cookie `hm_sid`, 14 ngày) tối đa lưu lại. |
| `QUIZ_RATE_PER_MIN` | 120 | Giới hạn `/api/quiz*` mỗi IP mỗi phút. |
| `CHAT_FILTER` | `on` | `off` tắt bộ lọc từ thô tục (chat chung + riêng) và che link/SĐT (chat riêng). |
| `EXIT_WITH_PARENT` | tắt | `1`: tự thoát khi tiến trình cha biến mất (dùng trong bộ test). |

Điểm cuối HTTP: `GET /healthz`, `GET /readyz` (503 khi đang tắt êm), `GET /api/room/status`,
`GET|POST /api/me` (hồ sơ theo cookie `hm_sid`, HttpOnly, 14 ngày), `GET /api/quiz` + `POST /api/quiz/answer` (server ra đề và chấm),
`/admin/*` (xem `docs/DEPLOY.md`).
Cookie `hm_sid` cũng được cấp trong bắt tay WebSocket nếu trình duyệt chưa có. Sau reverse proxy cần chuyển tiếp `/api/*`, `/ext/*` và `/ws` về server này.
Mọi phản hồi JSON và file tĩnh có `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` (không đặt CSP).

Thông điệp thêm (server → client): `{t:'board', videos:string[], music:string[]}` gửi ngay sau `admitted` (kể cả nối lại) và khi đổi;
`{t:'sys', text}`; `{t:'notice', kind:'tele_join'|'room_join', names, more}`; `{t:'rejected', reason:'banned'|'kicked'}`
(client hiện tại chưa có câu chữ riêng cho hai lý do này, đang rơi về thông báo chung). Tắt êm đóng socket bằng mã 1001.

Ghế ngồi: `bench` trong `sit`/`seat` là chỉ số trong `SEATS` (shared/world.mjs): 0–49 hội trường, 50–59 phòng chờ, 60+ khán đài (3 ghế mỗi băng).

Ngoại hình: `enter` có thể kèm `look` (mã 12 bit, xem `shared/look.mjs`: đội, màu da, kiểu tóc, màu tóc; thiếu/sai → áo T1 mặc định); danh sách người chơi và `join` có `k` (mã ngoại hình). Đổi trang phục trong hang: `{t:'look', look}` → cả hang nhận `{t:'look', i, k}` (giới hạn 1 lần/1,5 s, không đổi khi đang đấu võ); hồ sơ `/api/me` lưu cả `look`.

Cửa vào khu đặc biệt: `{t:'gate', id}` (id trong `GATES`: `podium`, `lounge`); server dịch chuyển người chơi sang đầu kia của cửa nếu đang đứng trong `GATE_RANGE`+0,8 m của một đầu, nếu không trả `{t:'gateDenied'}`.

Tin nhắn tự đặt (không phải giao thức gốc): `{t:'emote'}` → mọi người nhận `{t:'emote', i}`; `{t:'swing'}` (đấm hụt, client → server; đòn trúng thì server tự phát) → mọi người nhận `{t:'swing', i, target?}`; ghế hội trường `{t:'sit', bench}` / `{t:'stand'}` (client → server) →
`{t:'seat', i, b}` (b = −1: đứng dậy; gửi cho mọi người), `{t:'seats', on:[[i, b]...]}` (gửi cho người mới vào), `{t:'seatDenied'}` (ghế có người / quá xa / sai dữ liệu).
Người đang ngồi, chat riêng hoặc đấu võ: bản tin di chuyển bị bỏ qua. Vị trí báo lên nằm trong vật cản (ghế hội trường, bục thi đấu giữa sân, sân khấu hội trường) bị sửa bằng `CORRECTION`.
