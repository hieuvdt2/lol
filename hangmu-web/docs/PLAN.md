# Kế hoạch hoàn thiện hangmu-web (hệ thống mới, giống bản gốc về hành vi)

Nguyên tắc: mã viết mới 100% (không chép bundle gốc); asset (hình, âm thanh) tự tạo, có chỗ cắm asset có giấy phép;
mỗi mốc có test; đo bằng số liệu; ghi rõ cái gì chưa kiểm chứng.

## Trạng thái (cập nhật sau mốc 5)

| Mốc | Nội dung | Trạng thái |
|---|---|---|
| 0 | Tài nguyên gốc tự tạo (biểu tượng, chân dung, ảnh chia sẻ, `legends.json` để cắm ảnh có giấy phép) | ✅ xong |
| 1a | Âm thanh tổng hợp WebAudio (+ nhạc nền duel, nút tắt tiếng) | ✅ xong; [Unverified] mẹo iOS giữ kênh phát chưa thử trên thiết bị thật |
| 1b | PWA: manifest, service worker không cache, icon, thẻ SEO/OG, hướng dẫn cài app | ✅ xong |
| 1c | Banner "có bản mới · Tải lại" qua `version.json` | ✅ xong |
| 2 | Sàn đấu 3D (võ đài, khán giả, tư thế, hiệu ứng, camera rung) | ✅ xong |
| 3 | Cảnh ném đồ 3D (5 hình nộm, quỹ đạo, vệt bẩn, chạm để ném) | ✅ xong; ném vẫn chỉ hiện ở máy người ném (giống bản gốc: server chỉ đếm) |
| 4 | Màn hình hội trường: server phát `board`, client nhúng trình phát sau khi bấm | ✅ xong; [Inference] dạng ID video; [Unverified] chưa thử với video thật |
| 5a | API quản trị có token (poll, board, sys, notice, kick/ban) | ✅ xong (do tác tử server làm, đã kiểm lại các ca chính) |
| 5b | Lưu bền vững `state.json` ghi nguyên tử | ✅ xong |
| 5c | Dockerfile, compose, Caddy, systemd, `/healthz`, tắt êm, log JSON | ✅ xong; [Unverified] chứng chỉ HTTPS thật, systemd trên Linux thật, `docker compose up` đủ bộ |
| 5d | Chạy thử tải lâu (330 giây, 400 người) | ✅ không thấy rò rỉ; chưa chạy quá 330 giây |

## Cập nhật sau đối chiếu bản gốc
Xem `docs/GAPS.md`: danh tính (`/api/me`), quiz do server chấm, widget tỷ số + ăn mừng bàn thắng, bảng võ công theo tuần, âm lượng, lọc chat đã xong.
Lưu ý 2026-11-12: widget tỷ số bóng đá đã gỡ, thay bằng bảng LCK nhập tay (xem STATUS.md); dòng "chưa làm..." bên dưới đã lỗi thời.

## Chưa làm / ngoài phạm vi
- Chat giọng nói (module `hw`) và hệ thống báo cáo / bỏ phiếu mời ra đi kèm giọng nói (theo yêu cầu bỏ qua).
- Widget tỷ số trận gọi API thể thao bên thứ ba (bản gốc có; chưa làm vì phụ thuộc dịch vụ ngoài chưa rõ điều khoản).
- Dùng lại logo CLB, ảnh cầu thủ thật hay âm thanh trong bản capture (không làm: không xác minh được quyền sử dụng).
- Ném đồ của người khác chưa hiện ở máy bạn (bản gốc cũng không phát).
- Thử trên thiết bị thật các phần mới: âm thanh trên iOS, sàn đấu 3D / ném đồ trên điện thoại, cài PWA.

## Việc vận hành còn lại
- Dọn các server thử mồ côi trên máy phát triển (lệnh trong báo cáo).
- Khởi động lại `npm run lan` để dùng bản server mới.
- Triển khai thật: xem docs/DEPLOY.md; kiểm tra quyền sử dụng mọi tài nguyên trước khi công khai.
