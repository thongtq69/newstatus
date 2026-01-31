# Facebook Group Post Scraper

## Tổng quan

Script này tự động quét và lưu các bài viết mới nhất từ Facebook Group bằng cách:
1. Đăng nhập vào Facebook (manual login)
2. Truy cập group với sorting CHRONOLOGICAL
3. Click vào nút "Chia sẻ" của từng bài viết
4. Lấy URL từ popup "Sao chép liên kết"
5. Mở bài viết và lưu nội dung

## Hỗ trợ Hệ điều hành

Script hỗ trợ **cross-platform** và hoạt động trên:
- ✅ **Windows** (PowerShell)
- ✅ **macOS** (pbpaste/pbcopy)
- ✅ **Linux** (xclip/xsel)

Clipboard được tự động detect và sử dụng lệnh phù hợp với từng hệ điều hành.

## Cấu trúc Project

```
tloo/
├── index.js          # Script chính (Puppeteer)
├── server.js         # Express server cho UI
├── config.json       # Cấu hình group URL
├── public/
│   └── index.html    # UI để config và chạy script
└── README.md         # Tài liệu này
```

## Logic xử lý chi tiết

### 1. Khởi tạo và Đăng nhập

**Bước 1: Launch Browser**
- Sử dụng Puppeteer với `headless: false` để có thể tương tác
- Viewport: 1366x900
- User-Agent: Chrome desktop

**Bước 2: Manual Login**
- Mở `https://www.facebook.com/`
- Chờ user đăng nhập thủ công (tối đa 180 giây)
- Kiểm tra login thành công bằng cách:
  - URL không chứa `/login` hoặc `checkpoint`
  - Tìm thấy `[role="feed"]` hoặc `[aria-label="Trang chủ"]`

### 2. Truy cập Group

**Bước 1: Đọc Config**
- Đọc `GROUP_URL` từ `config.json`
- Tự động thêm `?sorting_setting=CHRONOLOGICAL` nếu chưa có

**Bước 2: Navigate và Load**
- Navigate đến group URL
- Chờ 8 giây để trang load đầy đủ
- Đóng popup nếu có (tìm `div[aria-label="Đóng"]`)

### 3. Tìm và Click Nút "Chia sẻ"

**Logic tìm nút:**
```javascript
// Tìm tất cả element có text "Chia sẻ" hoặc "Share"
const allElements = document.querySelectorAll('span, div[role="button"]');
// Lọc các element có textContent === "Chia sẻ" hoặc "Share"
// Tìm element cha clickable (div[role="button"])
```

**Vấn đề đã giải quyết:**
- Script ban đầu click vào nút "Chia sẻ" của group header (tạo URL `/share/g/...`)
- **Giải pháp:** Phân biệt URL sau khi lấy, bỏ qua `/share/g/`, chỉ lấy `/share/p/`

**Đánh dấu đã xử lý:**
- Mỗi nút được click sẽ được đánh dấu bằng attribute `data-processed-share="true"`
- Tránh click lại cùng một nút

### 4. Lấy URL từ Popup "Chia sẻ"

**Phương pháp 1: Tìm URL trực tiếp trong popup**
```javascript
// Tìm nút "Sao chép liên kết" trong dialog
// Thử lấy URL từ:
// 1. href của element clickable
// 2. data-href hoặc data-url attribute
// 3. Parent elements (tối đa 5 levels)
// 4. Tất cả links trong dialog
```

**Phương pháp 2: Click và đọc từ clipboard**
- Click vào nút "Sao chép liên kết"
- Đợi 2.5 giây để clipboard cập nhật
- Đọc từ clipboard hệ thống (cross-platform):
  - **Windows**: `powershell -Command "Get-Clipboard"`
  - **macOS**: `pbpaste`
  - **Linux**: `xclip -selection clipboard -o` hoặc `xsel --clipboard --output`
- Xóa clipboard sau khi lấy:
  - **Windows**: `powershell -Command "Set-Clipboard -Value ''"`
  - **macOS**: `echo "" | pbcopy`
  - **Linux**: `echo "" | xclip -selection clipboard` hoặc `xsel --clipboard --input`

**Lưu ý quan trọng:**
- Browser context (`navigator.clipboard`) không hoạt động với clipboard hệ thống
- Script tự động detect OS và dùng lệnh phù hợp
- Helper functions `readClipboard()` và `clearClipboard()` xử lý cross-platform

### 5. Phân biệt và Lọc URL

**URL được CHẤP NHẬN:**
- ✅ `https://www.facebook.com/share/p/XXXXX/` - Link chia sẻ bài post (CHÍNH)
- ✅ `https://www.facebook.com/groups/.../permalink/...` - Permalink bài post
- ✅ `https://www.facebook.com/groups/.../posts/...` - Direct post URL (nhưng sẽ bị loại bỏ vì trùng với `/share/p/`)

**URL bị BỎ QUA:**
- ❌ `https://www.facebook.com/share/g/XXXXX/` - Link chia sẻ group (KHÔNG phải bài post)
- ❌ `https://www.facebook.com/groups/.../posts/...` - Direct post URL (trùng với `/share/p/`, không cần lưu)

**Logic validation:**
```javascript
// BỎ QUA nếu chứa /share/g/
if (url.includes('/share/g/')) {
    // Skip và tiếp tục
}

// CHỈ LẤY nếu là /share/p/ (không lấy /groups/.../posts/ vì trùng)
if (url.includes('/share/p/')) {
    // Thêm vào danh sách
}
```

### 6. Lưu Nội dung Bài viết

**Khi phát hiện URL hợp lệ (`/share/p/...`):**
1. Mở bài viết bằng URL đó
2. Chờ trang load (8 giây)
3. Trích xuất nội dung:
   - Tìm element chứa nội dung bài viết
   - Lấy text content
   - Lưu kèm URL vào file

**Format lưu:**
```
URL: https://www.facebook.com/share/p/XXXXX/

NỘI DUNG:
[Text content của bài viết]

═══════════════════════════════════════════════════════════
```

### 7. Vòng lặp và Scroll

**Điều kiện dừng:**
- Đã lấy đủ 10 URLs HOẶC
- Đã thử 40 lần

**Scroll logic:**
- Mỗi 2 lần thử, scroll xuống 1000px để load thêm bài
- Delay 2.5 giây sau mỗi lần scroll

### 8. Output và Lưu File

**Console output:**
- Hiển thị danh sách 10 URLs
- Tổng số URLs đã lấy

**File output:**
- `scraped_urls_[timestamp].txt` - Danh sách URLs
- `post_content_[timestamp].txt` - Nội dung các bài viết (kèm URL)
- `final_result.png` - Screenshot cuối cùng

## Các vấn đề đã giải quyết

### Vấn đề 1: Browser context không truy cập được clipboard hệ thống
**Nguyên nhân:** `navigator.clipboard.readText()` trong browser context chỉ đọc được clipboard của browser, không đọc được clipboard hệ thống.

**Giải pháp:** Sử dụng lệnh hệ thống cross-platform:
```javascript
// Helper functions tự động detect OS và dùng lệnh phù hợp
function readClipboard() {
    if (platform === 'win32') {
        return execSync('powershell -Command "Get-Clipboard"', ...);
    } else if (platform === 'darwin') {
        return execSync('pbpaste', ...);
    } else {
        return execSync('xclip -selection clipboard -o', ...);
    }
}

const clipboardText = readClipboard();
clearClipboard(); // Xóa clipboard
```

### Vấn đề 2: Script click vào nút "Chia sẻ" của group header
**Nguyên nhân:** Script tìm tất cả nút "Chia sẻ" trên trang, bao gồm cả nút ở header.

**Giải pháp:** Phân biệt URL sau khi lấy:
- URL `/share/g/` → Bỏ qua (group share)
- URL `/share/p/` → Lưu (post share)

### Vấn đề 3: URL trùng lặp giữa `/groups/.../posts/...` và `/share/p/...`
**Nguyên nhân:** Cùng một bài viết có thể có nhiều format URL khác nhau.

**Giải pháp:** Chỉ lưu URL dạng `/share/p/...`, bỏ qua `/groups/.../posts/...`

## Cách sử dụng

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình group URL
Tạo file `config.json`:
```json
{
  "GROUP_URL": "https://www.facebook.com/groups/YOUR_GROUP_ID"
}
```

Hoặc sử dụng UI:
```bash
node server.js
# Mở http://localhost:3000
```

### 3. Chạy script
```bash
node index.js
```

### 4. Đăng nhập
- Script sẽ mở browser
- Đăng nhập vào Facebook thủ công
- Script sẽ tự động tiếp tục

## Lưu ý quan trọng

1. **Manual Login:** Script yêu cầu đăng nhập thủ công để tránh bị Facebook phát hiện bot.

2. **Chronological Sorting:** Luôn sử dụng `?sorting_setting=CHRONOLOGICAL` để đảm bảo lấy bài mới nhất.

3. **Clipboard Management:** Script tự động xóa clipboard sau mỗi lần lấy URL để tránh đầy clipboard.

4. **URL Format:** Chỉ lưu URL dạng `/share/p/...`, không lưu `/groups/.../posts/...` vì trùng lặp.

5. **Rate Limiting:** Script có delay giữa các thao tác để tránh bị Facebook chặn.

6. **Error Handling:** Script có try-catch và logging chi tiết để debug.

## Troubleshooting

### Script không tìm thấy nút "Chia sẻ"
- Kiểm tra xem đã scroll đủ để load bài viết chưa
- Kiểm tra xem có popup nào che mất nút không

### Clipboard luôn null
- Kiểm tra quyền truy cập clipboard trên macOS
- Đảm bảo đã click vào nút "Sao chép liên kết" thành công

### Lấy được URL `/share/g/` thay vì `/share/p/`
- Script đã có logic bỏ qua `/share/g/`
- Kiểm tra xem có đang click vào nút "Chia sẻ" của group header không

### Không lưu được nội dung bài viết
- Kiểm tra xem URL có hợp lệ không
- Kiểm tra xem có thể truy cập bài viết không (có thể bị chặn)

## Tác giả và Lịch sử

Script này được phát triển để giải quyết vấn đề scraping bài viết từ Facebook Group với các thách thức:
- Facebook chặn scraping
- Dynamic content loading
- Clipboard access limitations
- URL format variations

Phiên bản hiện tại đã giải quyết được các vấn đề trên và có thể lấy được 10 bài viết mới nhất một cách ổn định.
