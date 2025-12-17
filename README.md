# F12 Tech v1.0.0

**F12 Tech** is a powerful Chrome Extension that allows you to select and edit any element on any web page, and **save changes locally** to automatically re-apply them when you refresh the page.

## ✨ Features

### 🎯 Selector Engine v2
- **Multi-strategy selection**: Automatically tries multiple strategies to find the most stable selector
  - ID selector
  - Data attributes (`data-*`)
  - ARIA attributes (`aria-label`, `role`, etc.)
  - Link/Image selectors (`href`, `src`)
  - Class-based selectors
  - Path-based selectors with `:nth-of-type`
  - XPath fallback for complex cases
- **Selector caching**: Caches results for better performance

### 🖱️ Enhanced Element Picker
- **Visual overlay**: Displays info box with detailed information on hover
- **Precise highlighting**: Highlight box with margin indicators
- **Keyboard navigation**: 
  - `↑` Parent element
  - `↓` First child
  - `←` Previous sibling
  - `→` Next sibling
  - `Enter` Confirm selection
  - `Esc` Cancel picking
- **Lasso selection**: Hold `Alt` + drag to select by area
- **Multi-select**: Hold `Shift`/`Ctrl` + click to select multiple elements

### ⚡ Performance Optimized
- **Throttled MutationObserver**: Reduces lag on SPA pages
- **Debounced save**: Prevents excessive storage writes
- **Smart re-apply**: Only applies patches when DOM actually changes

### 🎨 Modern UI
- **Draggable panel**: Drag and drop panel to desired position
- **Tabbed interface**: Clean tabbed layout
- **Quick actions**: Hide/Remove elements quickly
- **Dark theme**: Modern dark design

## 📦 Installation

### Chrome / Edge / Brave / Chromium
1. Download or clone the extension folder
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right corner)
4. Click **Load unpacked** → select the `F12_Tech_Extension` folder

## 🚀 Usage

### Toggle Editor
- Click the extension icon on the toolbar
- Or use keyboard shortcut: `Ctrl+Shift+E` (Windows/Linux) / `Cmd+Shift+E` (Mac)

### Pick Element
1. Click the **"🎯 Pick Element"** button
2. Hover to highlight elements
3. Click to select (or `Shift+Click` to select multiple)
4. Use arrow keys to navigate DOM
5. Press `Esc` or click the button to stop picking

### Editing
- **Text**: Change text content
- **HTML**: Change innerHTML
- **Style**: Append or Replace inline CSS
- **Attr**: Change attributes (href, src, class, etc.)

### Quick Actions
- **🙈 Hide**: Hide element (display: none)
- **🗑️ Remove**: Remove element from DOM
- **📋 Copy Selector**: Copy CSS selector
- **🔍 Inspect**: Log to console

### Save Scope
- **Exact URL**: Only applies to exact URL (including query params)
- **Path Only**: Applies to all URLs with same path
- **Domain Only**: Applies to entire domain

### Export/Import
- Click the **History** tab to view saved changes
- **Export**: Copy JSON for backup
- **Import**: Paste JSON to restore

## 🔧 Patch Types

| Type | Description |
|------|-------------|
| `text` | Change textContent |
| `html` | Change innerHTML |
| `style_append` | Append CSS to existing style |
| `style_replace` | Replace entire style |
| `attr` | Change attribute |
| `hide` | Hide element (display: none) |
| `remove` | Remove element from DOM |

## ⚠️ Notes

- Changes only take effect **in your browser**
- Does not modify data on the server
- Some websites with strict CSP may not work
- SPA/React pages may need more stable selectors (use "Domain Only" scope)

## 🐛 Troubleshooting

### Selector can't find element
- Try changing scope to "Domain Only" or "Path Only"
- The page may have changed DOM structure
- Delete old patch and recreate

### Extension not working
- Refresh page after installing extension
- Check console (F12) for errors
- Some pages (chrome://, extensions) are not supported

### Changes lost
- Check if scope is correct
- Export patches for regular backup

## 📝 Changelog

### v1.0.0
- 🎯 Selector Engine with multi-strategy
- 🖱️ Enhanced Element Picker with keyboard navigation
- ⚡ Performance optimization
- 🎨 Modern UI with draggable panel
- 🔧 Quick actions (Hide, Remove, Copy, Inspect)
- 💾 Undo system
- 📦 XPath fallback support

## 👨‍💻 Author

**DIEP VAN TIEN**
- GitHub: [@diepvantien](https://github.com/diepvantien)
- Donate: [Buymeacoffee](https://buymeacoffee.com/tixuno) | [MoMo](https://me.momo.vn/OeIGiJsViJfDfntmiRId)

## 📄 License

MIT License
