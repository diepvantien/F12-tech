# F12 Tech v2.0 - Enhanced Edition

**F12 Tech** là Chrome Extension mạnh mẽ cho phép bạn chọn và chỉnh sửa trực tiếp các phần tử trên bất kỳ trang web nào, và **lưu thay đổi cục bộ** để tự động áp dụng lại khi bạn refresh trang.

## ✨ Tính năng mới trong v2.0

### 🎯 Selector Engine v2
- **Multi-strategy selection**: Tự động thử nhiều chiến lược để tìm selector ổn định nhất
  - ID selector
  - Data attributes (`data-*`)
  - ARIA attributes (`aria-label`, `role`, etc.)
  - Link/Image selectors (`href`, `src`)
  - Class-based selectors
  - Path-based selectors với `:nth-of-type`
  - XPath fallback cho trường hợp phức tạp
- **Selector caching**: Cache kết quả để tăng performance

### 🖱️ Element Picker cải tiến
- **Visual overlay**: Hiển thị info box với thông tin chi tiết khi hover
- **Highlight chính xác**: Box highlight với margin indicators
- **Keyboard navigation**: 
  - `↑` Parent element
  - `↓` First child
  - `←` Previous sibling
  - `→` Next sibling
  - `Enter` Confirm selection
  - `Esc` Cancel picking
- **Lasso selection**: Giữ `Alt` + kéo chuột để chọn theo vùng
- **Multi-select**: Giữ `Shift`/`Ctrl` + click để chọn nhiều phần tử

### ⚡ Performance tối ưu
- **Throttled MutationObserver**: Giảm lag trên các trang SPA
- **Debounced save**: Tránh ghi storage quá nhiều
- **Smart re-apply**: Chỉ apply patches khi DOM thực sự thay đổi

### 🎨 UI hiện đại
- **Draggable panel**: Kéo thả panel đến vị trí mong muốn
- **Tabbed interface**: Giao diện tab gọn gàng
- **Quick actions**: Ẩn/Xóa phần tử nhanh
- **Dark theme**: Thiết kế tối hiện đại

## 📦 Cài đặt

### Chrome / Edge / Brave / Chromium
1. Download hoặc clone thư mục extension
2. Mở `chrome://extensions`
3. Bật **Developer mode** (góc trên phải)
4. Click **Load unpacked** → chọn thư mục `F12_Tech_Extension`

## 🚀 Cách dùng

### Bật/Tắt Editor
- Click icon extension trên toolbar
- Hoặc dùng phím tắt: `Ctrl+Shift+E` (Windows/Linux) / `Cmd+Shift+E` (Mac)

### Chọn phần tử
1. Click nút **"🎯 Chọn phần tử"**
2. Di chuột để highlight phần tử
3. Click để chọn (hoặc `Shift+Click` để chọn nhiều)
4. Dùng phím mũi tên để navigate DOM
5. Press `Esc` hoặc click nút để dừng chọn

### Chỉnh sửa
- **Text**: Thay đổi nội dung text
- **HTML**: Thay đổi innerHTML
- **Style**: Append hoặc Replace CSS inline
- **Attr**: Thay đổi attribute (href, src, class, etc.)

### Quick Actions
- **🙈 Ẩn**: Ẩn phần tử (display: none)
- **🗑️ Xóa**: Xóa phần tử khỏi DOM
- **📋 Copy Selector**: Copy CSS selector
- **🔍 Inspect**: Log ra console

### Phạm vi lưu (Scope)
- **URL đầy đủ**: Chỉ áp dụng cho URL chính xác (bao gồm query params)
- **Theo path**: Áp dụng cho tất cả URL có cùng path
- **Theo domain**: Áp dụng cho toàn bộ domain

### Export/Import
- Click tab **History** để xem các thay đổi đã lưu
- **Export**: Copy JSON để backup
- **Import**: Paste JSON để restore

## 🔧 Các loại Patch

| Type | Mô tả |
|------|-------|
| `text` | Thay đổi textContent |
| `html` | Thay đổi innerHTML |
| `style_append` | Thêm CSS vào cuối style hiện tại |
| `style_replace` | Ghi đè toàn bộ style |
| `attr` | Thay đổi attribute |
| `hide` | Ẩn phần tử (display: none) |
| `remove` | Xóa phần tử khỏi DOM |

## ⚠️ Lưu ý

- Thay đổi chỉ có hiệu lực **trong trình duyệt của bạn**
- Không thay đổi dữ liệu trên server
- Một số trang web có CSP nghiêm ngặt có thể không hoạt động
- Trang SPA/React có thể cần selector ổn định hơn (dùng scope "Theo domain")

## 🐛 Troubleshooting

### Selector không tìm thấy phần tử
- Thử đổi scope sang "Theo domain" hoặc "Theo path"
- Trang có thể đã thay đổi DOM structure
- Xóa patch cũ và tạo lại

### Extension không hoạt động
- Refresh trang sau khi cài extension
- Kiểm tra console (F12) để xem lỗi
- Một số trang (chrome://, extensions) không hỗ trợ

### Thay đổi bị mất
- Kiểm tra scope có đúng không
- Export patches để backup thường xuyên

## 📝 Changelog

### v2.0.0
- 🎯 Selector Engine v2 với multi-strategy
- 🖱️ Enhanced Element Picker với keyboard navigation
- ⚡ Performance optimization
- 🎨 Modern UI với draggable panel
- 🔧 Quick actions (Hide, Remove, Copy, Inspect)
- 💾 Improved undo system
- 📦 XPath fallback support

### v1.0.0
- Initial release

## 📄 License

MIT License
