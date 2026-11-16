/*
 * Service worker TỐI THIỂU của Hang MU — chỉ để trình duyệt cho "cài" trang thành app (PWA)
 * và sau này nhận thông báo đẩy.
 *
 * Cố ý KHÔNG cache và KHÔNG có handler `fetch`: mọi request đi thẳng ra mạng như khi không có
 * service worker → `index.html` luôn mới, cơ chế "có bản mới · Tải lại" (src/version.ts) vẫn đúng.
 * Đừng thêm cache trang ở đây (người dùng sẽ kẹt bản cũ sau mỗi lần deploy).
 *
 * File này phải được phục vụ với `Cache-Control: no-cache` (nginx `location /` đã có).
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
