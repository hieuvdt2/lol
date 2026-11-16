/*
 * Service worker TỐI THIỂU của Hang MU: chỉ để trình duyệt cho "cài" trang thành ứng dụng (PWA).
 *
 * Cố ý KHÔNG cache và KHÔNG có handler `fetch`: mọi yêu cầu đi thẳng ra mạng như khi không có service worker,
 * nên index.html luôn mới và cơ chế "có bản mới · Tải lại" (src/version.ts) luôn đúng. Đừng thêm cache trang ở đây:
 * người dùng sẽ kẹt bản cũ sau mỗi lần triển khai.
 *
 * Phải được phục vụ với Cache-Control: no-cache / no-store.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
