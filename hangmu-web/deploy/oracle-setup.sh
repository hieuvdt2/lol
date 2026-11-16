#!/usr/bin/env bash
# Cài và chạy Hang Tê Đỏ trên một VM Ubuntu (Oracle Cloud Always Free, ARM hoặc x86) — chạy trong thư mục hangmu-web đã clone:
#   bash deploy/oracle-setup.sh ten-ban.duckdns.org
# Làm: cài Docker (nếu chưa có) → mở cổng 80/443 trong tường lửa của máy → tạo .env (DOMAIN, SITE_URL, ADMIN_TOKEN ngẫu nhiên)
# → docker compose up -d --build. Chạy lại nhiều lần không sao (không tạo lại .env, không thêm luật tường lửa trùng).
set -euo pipefail
DOMAIN="${1:?Cú pháp: bash deploy/oracle-setup.sh <tên-miền, ví dụ ten-ban.duckdns.org>}"
cd "$(dirname "$0")/.."

# 1) Docker + Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "== Cài Docker"
  curl -fsSL https://get.docker.com | sudo sh
fi

# 2) Tường lửa trong máy: ảnh Ubuntu của Oracle chặn sẵn mọi cổng trừ 22 bằng iptables.
#    (Ngoài ra phải mở 80/443 trong Security List của VCN trên trang web Oracle — xem docs/DEPLOY.md mục 0.)
echo "== Mở cổng 80, 443"
for rule in "tcp 80" "tcp 443" "udp 443"; do
  set -- $rule
  sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save; fi

# 3) .env (chỉ tạo lần đầu; ADMIN_TOKEN là mật khẩu API quản trị — giữ bí mật)
if [ ! -f .env ]; then
  umask 077
  printf 'DOMAIN=%s\nSITE_URL=https://%s\nADMIN_TOKEN=%s\nBOTS=8\n' "$DOMAIN" "$DOMAIN" "$(openssl rand -hex 24)" > .env
  echo "== Đã tạo .env (ADMIN_TOKEN nằm trong file này)"
fi

# 4) Build + chạy (Caddy tự xin chứng chỉ HTTPS cho DOMAIN)
echo "== Build và chạy"
BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || date +%s)" sudo -E docker compose up -d --build
sudo docker compose ps
echo "== Xong. Mở https://$DOMAIN (lần đầu Caddy cần vài giây để lấy chứng chỉ). Xem log: sudo docker compose logs -f"
