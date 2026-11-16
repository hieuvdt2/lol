// Hướng dẫn "cài như ứng dụng": khác nhau theo nền tảng. Hàm thuần để dễ kiểm thử.

export type Platform = 'ios-safari' | 'ios-chrome' | 'ios-other' | 'android' | 'desktop'

export function detectPlatform(userAgent: string, platform = '', maxTouchPoints = 0): Platform {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1) // iPadOS ở chế độ "trang web máy tính"
  if (ios) {
    if (/CriOS/.test(userAgent)) return 'ios-chrome'
    if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(userAgent)) return 'ios-other'
    return 'ios-safari'
  }
  return /Android/.test(userAgent) ? 'android' : 'desktop'
}

/** Các bước cài khi trình duyệt không cho cài bằng một nút. */
export function installSteps(platform: Platform): string[] {
  switch (platform) {
    case 'ios-safari':
      return ['Bấm nút Chia sẻ (hình vuông có mũi tên lên) ở thanh dưới.', 'Cuộn xuống và chọn "Thêm vào Màn hình chính".', 'Bấm "Thêm". Biểu tượng Hang Tê Đỏ sẽ nằm trên màn hình chính.']
    case 'ios-chrome':
      return ['Bấm nút Chia sẻ ở thanh địa chỉ (hoặc nút ⋯).', 'Chọn "Thêm vào Màn hình chính".', 'Bấm "Thêm". Biểu tượng Hang Tê Đỏ sẽ nằm trên màn hình chính.']
    case 'ios-other':
      return ['Trình duyệt này chưa hỗ trợ cài ứng dụng trên iPhone/iPad.', 'Mở trang này bằng Safari hoặc Chrome, rồi chọn Chia sẻ → "Thêm vào Màn hình chính".']
    case 'android':
      return ['Bấm nút ⋮ ở góc trên của trình duyệt.', 'Chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".', 'Xác nhận. Hang Tê Đỏ sẽ xuất hiện như một ứng dụng.']
    default:
      return ['Chrome/Edge: bấm biểu tượng cài đặt ở cuối thanh địa chỉ rồi chọn "Cài đặt".', 'Safari (macOS): chọn Tệp → "Thêm vào Dock".', 'Hang Tê Đỏ sẽ mở trong cửa sổ riêng như một ứng dụng.']
  }
}
