# Triển khai Hang MU

Hai cách: **Docker Compose** (khuyên dùng, có HTTPS tự động) hoặc **systemd** trực tiếp trên máy. Cả hai đều chạy cùng một tiến trình Node
(`server/hangmu-server.mjs`) vừa phục vụ web (`dist/`) vừa phục vụ WebSocket `/ws`, API `/api/*`, `/healthz`, `/readyz`, `/admin/*`.

> **Trạng thái kiểm chứng.** Mã server và các biện pháp bảo vệ có test tự động (`npm test`). Các tệp đóng gói (Dockerfile, compose, Caddyfile,
> systemd) xem mục "Đã kiểm chứng gì" ở cuối.

## 0. Đường đi khuyến nghị: miễn phí, chạy 24/7

| Vai trò | Dùng | Ghi chú |
|---|---|---|
| Máy chủ | **Oracle Cloud Always Free** — VM Ubuntu (ARM `VM.Standard.A1.Flex` hoặc x86 `VM.Standard.E2.1.Micro`) | Chạy liên tục, có ổ đĩa giữ dữ liệu. Đăng ký cần thẻ để xác minh. Hạn mức có thể đổi — xem trang Always Free của Oracle |
| Tên miền | **DuckDNS** (`ten-ban.duckdns.org`) | Miễn phí; điền IP công khai của VM một lần |
| HTTPS | **Caddy** (đã có, `deploy/Caddyfile`) | Tự xin + gia hạn chứng chỉ Let's Encrypt |
| Chạy / cập nhật | **Docker Compose** (đã có) | |
| Lưu code | **GitHub** (repo private) | |

Không dùng: Vercel (hàm serverless không giữ được trạng thái trận đấu chung), HiveMQ (broker MQTT — game dùng WebSocket riêng),
Render bản miễn phí (ngủ sau 15 phút không có truy cập, mất dữ liệu mỗi lần khởi động lại).

**Bước 1 — GitHub (trên máy của bạn):**
```sh
cd ~/Documents/game/hangmu-web
git init && git add . && git commit -m "Hang Tê Đỏ" && git branch -M main
# tạo repo private trên github.com rồi:
git remote add origin git@github.com:<tên-bạn>/hangmu-web.git && git push -u origin main
```
`.gitignore` đã loại `node_modules`, `dist`, `data` (dữ liệu chạy thật), `.env` (mật khẩu quản trị).

**Bước 2 — Oracle Cloud:** tạo tài khoản Always Free → Compute → Create instance → Ubuntu 24.04, shape Always Free → tải khoá SSH.
Vào Networking → VCN của máy → Security List → thêm Ingress cho TCP 80, TCP 443 (và UDP 443), nguồn `0.0.0.0/0`. Ghi lại **Public IP**.

**Bước 3 — DuckDNS:** đăng nhập duckdns.org → tạo tên `ten-ban` → điền Public IP của VM → Update.

**Bước 4 — trên VM:**
```sh
ssh -i <khoá> ubuntu@<Public IP>
git clone https://github.com/<tên-bạn>/hangmu-web.git && cd hangmu-web   # repo private: dùng token / deploy key
bash deploy/oracle-setup.sh ten-ban.duckdns.org
```
Kịch bản cài Docker, mở cổng 80/443 trong iptables của máy (ảnh Ubuntu của Oracle chặn sẵn), tạo `.env` với `ADMIN_TOKEN` ngẫu nhiên,
rồi `docker compose up -d --build`. Mở `https://ten-ban.duckdns.org`.

**Cập nhật bản mới:** sửa code trên máy bạn → `git push`; trên VM: `cd hangmu-web && git pull && sudo docker compose up -d --build`.

**Chỉ muốn cho bạn bè thử nhanh từ máy mình (không cần tài khoản, máy phải bật):**
```sh
npm run lan                                         # terminal 1
brew install cloudflared                            # một lần
cloudflared tunnel --url http://localhost:8790      # terminal 2: in ra link https://….trycloudflare.com
```

## 1. Docker Compose

Yêu cầu: Docker + Docker Compose, một tên miền trỏ về máy (bản ghi A/AAAA), mở cổng 80 và 443.

```sh
cd hangmu-web
export DOMAIN=hang.example.com
export SITE_URL=https://hang.example.com
export ADMIN_TOKEN=$(openssl rand -hex 24)     # lưu lại: dùng để gọi API quản trị
docker compose up -d --build
docker compose logs -f hangmu                   # mỗi dòng là một sự kiện JSON
curl -s https://$DOMAIN/healthz
```

- Dữ liệu (xếp hạng, ban, poll, board) nằm trong volume `hangmu-data` (`/data/state.json` trong container).
- Cập nhật phiên bản: `git pull && docker compose up -d --build`. Server nhận SIGTERM, báo `sys` "máy chủ đang khởi động lại", đóng socket mã 1001,
  ghi dữ liệu rồi thoát; client tự nối lại.
- Đặt `BUILD_ID` (ví dụ mã commit) khi build để client biết "có bản mới": `BUILD_ID=$(git rev-parse --short HEAD) docker compose up -d --build`.

## 2. systemd (không dùng Docker)

```sh
sudo useradd --system --home /opt/hangmu --shell /usr/sbin/nologin hangmu
sudo mkdir -p /opt/hangmu /etc/hangmu /var/lib/hangmu
# build ở máy khác hoặc tại chỗ: npm ci && npm run build; sao chép dist/, server/, package.json, node_modules (production) vào /opt/hangmu
sudo cp deploy/hangmu.env.example /etc/hangmu/hangmu.env && sudo chmod 600 /etc/hangmu/hangmu.env   # rồi chỉnh
sudo chown -R hangmu:hangmu /opt/hangmu /var/lib/hangmu
sudo cp deploy/hangmu.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now hangmu
```

Đặt Caddy hoặc nginx phía trước để có HTTPS (xem `deploy/Caddyfile`); WebSocket cần chuyển tiếp header `Upgrade`/`Connection`.

## 3. ⚠️ TRUST_PROXY

Server chỉ dùng IP của socket. Khi đứng sau proxy ngược, mọi client trông như cùng một IP (của proxy), nên giới hạn theo IP và ban theo IP sẽ
áp dụng chung cho tất cả. Đặt `TRUST_PROXY=1` để dùng `X-Forwarded-For` / `X-Forwarded-Host`, **nhưng chỉ khi**:

1. cổng của server **không** mở thẳng ra Internet (chỉ proxy mới tới được), và
2. proxy **ghi đè** các header đó (Caddyfile mẫu đã làm).

Nếu không, kẻ tấn công tự gửi `X-Forwarded-For` để giả IP, né giới hạn kết nối và né ban theo IP.

Kiểm tra Origin: trình duyệt phải đến từ cùng nguồn (Origin trùng Host) hoặc nguồn trong `ALLOWED_ORIGINS`. Sau proxy, hãy đặt
`ALLOWED_ORIGINS=https://hang.example.com`.

## 4. Biến môi trường

Danh sách đầy đủ và ý nghĩa: [`server/README.md`](../server/README.md). Tối thiểu khi chạy thật:

| Biến | Gợi ý | Ghi chú |
|---|---|---|
| `STATIC_DIR` | `/app/dist` | Docker đã đặt sẵn |
| `DATA_DIR` | `/data` hoặc `/var/lib/hangmu` | Phải ghi được. Không ghi được thì server chạy tiếp **không lưu** (ghi log lỗi, `/admin/status` báo `persistence.enabled=false`) |
| `TRUST_PROXY` | `1` sau Caddy | Xem mục 3 |
| `ALLOWED_ORIGINS` | `https://hang.example.com` | |
| `ADMIN_TOKEN` | `openssl rand -hex 24` | Để trống = `/admin/*` không tồn tại (404) |
| `CAPACITY`, `BOTS` | 500, 8 | |
| `LOG_LEVEL` | `info` | `LOG_CHAT=1` mới ghi nội dung chat (mức debug) |

## 5. API quản trị

Bật khi có `ADMIN_TOKEN`. Gửi `Authorization: Bearer <token>`. Sai token 5 lần trong 10 phút thì IP bị khóa 15 phút; tối đa 60 yêu cầu/phút/IP;
body JSON tối đa 8 KB. **Không** để lộ ra Internet nếu không cần (xem phần comment trong `deploy/Caddyfile`).

```sh
H="Authorization: Bearer $ADMIN_TOKEN"; J="Content-Type: application/json"; U=https://$DOMAIN
curl -s -H "$H" $U/admin/status
curl -s -H "$H" -H "$J" -d '{"text":"Bảo trì lúc 23:00\nCảm ơn anh em"}' $U/admin/sys
curl -s -H "$H" -H "$J" -d '{"q":"Ai đá chính?","options":["An","Bình","Cường"]}' $U/admin/poll
curl -s -H "$H" -X DELETE $U/admin/poll
curl -s -H "$H" -H "$J" -d '{"videos":["abcDEF_123"],"music":[]}' $U/admin/board
curl -s -H "$H" -H "$J" -d '{"kind":"tele_join","names":["Lan"],"more":3}' $U/admin/notice
curl -s -H "$H" -H "$J" -d '{"name":"TênXấu","banMinutes":60,"scope":"tab"}' $U/admin/kick
curl -s -H "$H" $U/admin/bans
curl -s -H "$H" -X DELETE "$U/admin/bans/$(python3 -c 'import urllib.parse;print(urllib.parse.quote("tab:abc123",safe=""))')"
```

- `kick` nhận đúng một trong `index`, `tab`, `name`; `banMinutes` (0 = chỉ đuổi); `scope` = `tab`, `ip` hoặc `both` (mặc định `both`).
  Ban theo IP ảnh hưởng mọi người chung IP (mạng công ty, trường học) — dùng `scope: "tab"` nếu muốn nhẹ tay.
- Poll: client hiện tại không có thông điệp "xóa poll", nên `DELETE /admin/poll` chỉ ảnh hưởng người vào sau.
- ID video/nhạc: 6–20 ký tự `A-Z a-z 0-9 _ -`, tối đa 200 mục mỗi danh sách (hình dạng này là **suy luận** của ta, không phải đặc tả).

## 6. Vận hành

- `GET /healthz` → 200 `{ok, uptime, players}` (tiến trình còn sống). `GET /readyz` → 200, hoặc 503 khi đang tắt êm.
- Tắt êm khi SIGTERM/SIGINT: ngừng nhận kết nối mới, gửi `sys`, đóng socket mã 1001, ghi dữ liệu, thoát (tối đa `SHUTDOWN_MS` = 10 giây).
- Log: mỗi dòng là một JSON (`time`, `level`, `msg`, ...). Hành động quản trị luôn được ghi (`"msg":"admin"`), kèm IP.
- **Sao lưu `DATA_DIR`**: `state.json` được ghi nguyên tử (ghi tệp tạm rồi rename), nên sao chép khi server đang chạy là an toàn.
  Ví dụ cron: `*/30 * * * * cp /var/lib/hangmu/state.json /backup/state-$(date +\%H).json`. Docker: `docker run --rm -v hangmu-data:/d -v $PWD:/b alpine cp /d/state.json /b/`.
  Tệp hỏng khi nạp sẽ được đổi tên thành `state.json.corrupt-<thời gian>` và server bắt đầu với trạng thái trống (có log lỗi).
- Giới hạn mặc định: 20 kết nối mở / IP, 60 kết nối mới / phút / IP, gói ≤ 4 KB. Nhiều người chung IP (NAT) cần tăng `MAX_CONN_PER_IP`.

## 7. Đã kiểm chứng gì (và chưa)

Có test tự động (chạy bằng `npm test`): board, sys, notice, poll (kèm phiếu), toàn bộ API quản trị (xác thực, khóa tạm, giới hạn tốc độ, body), kick/ban
(tab, IP, hết hạn, gỡ), lưu bền vững (khởi động lại, tệp hỏng, tệp sai một phần, thư mục không ghi được), `/healthz`, `/readyz`, header an toàn,
log (JSON, không lộ chat/token), tắt êm (mã 1001, ghi dữ liệu, client treo), giới hạn bảng xếp hạng.

Đã chạy thử Docker Compose + Caddy trên máy Mac (Docker 28.3.2, arm64 — cùng kiến trúc VM ARM của Oracle) ngày 2026-11-16, với `DOMAIN=localhost`
(chứng chỉ nội bộ của Caddy): build 44 giây; `/`, `/healthz`, `/readyz`, `/api/room/status`, `/site.webmanifest` trả 200 qua HTTPS; HTTP tự chuyển sang HTTPS (308);
WebSocket `wss://…/ws` đúng Origin thì vào hang, Origin lạ bị chặn 403; trình duyệt thật vào được hang qua HTTPS, không lỗi trang;
`docker compose restart hangmu` → tắt êm, ghi dữ liệu, nạp lại (`/data/state.json` còn hồ sơ đã lưu).
`deploy/oracle-setup.sh` mới kiểm tra cú pháp (`bash -n`), chưa chạy trên VM Oracle thật.

Chưa kiểm chứng ở đây: chứng chỉ HTTPS thật của Caddy (cần tên miền công khai), hành vi `{remote_host}` của Caddy,
đơn vị systemd trên một máy Linux thật, và chạy lâu hơn vài phút (chạy `npm run perf:soak` với `SECONDS` lớn hơn).
