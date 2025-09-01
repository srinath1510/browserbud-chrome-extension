# BrowserBud Chrome Extension

An intelligent Chrome extension that enables seamless note-taking and knowledge processing while browsing the web. BrowserBud automatically captures selected text, processes it through an AI pipeline, and transforms your collected information into structured knowledge.

## Features

### 🔍 **Intelligent Text Capture**
- Right-click context menu to instantly save selected text from any webpage
- Automatic metadata extraction (URL, page title, timestamp, domain)
- Duplicate content detection to prevent redundant notes
- Real-time batch processing with automatic server synchronization

### 🧠 **AI-Powered Knowledge Processing**
- "Bake" feature transforms raw notes into structured insights when used with BrowserBud AI pipeline
- Batch processing of multiple notes for comprehensive analysis
- Integration with Flask API backend for AI processing
- Support for additional manual notes during baking process

### 💾 **Smart Storage & Sync**
- Local Chrome storage for offline access
- Automatic background synchronization with server
- Batch processing every 2 minutes for efficiency
- Local storage cleanup to maintain performance

### 📊 **Comprehensive Management**
- Visual popup interface showing captured notes count and status
- Server connectivity indicators and batch processing status
- Download notes as plain text files
- Clear all notes functionality with server synchronization

### 🎯 **User-Friendly Interface**
- Clean, modern popup design with status indicators
- Real-time character counting and storage limits
- Visual feedback for all operations (saving, baking, syncing)
- Recent notes display with metadata and timestamps

## Installation & Setup

### Prerequisites
- Google Chrome or Chromium-based browser
- Flask API server running on `localhost:8000` (see API Requirements below)

### Chrome Extension Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/browserbud-chrome-extension.git
   cd browserbud-chrome-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer Mode** (toggle in top right)

4. Click **"Load unpacked"** and select the project directory

5. The BrowserBud extension icon should appear in your Chrome toolbar

### API Server Requirements
The extension requires a Flask API server with the following endpoints:
- `GET /api/health` - Health check
- `GET /api/status` - Server status
- `POST /api/notes/batch` - Batch note upload
- `POST /api/bake` - AI processing trigger
- `DELETE /api/notes` - Clear all notes

## Usage

### Capturing Notes
1. **Select text** on any webpage
2. **Right-click** and choose **"BrowserBud"** from context menu
3. Text is automatically saved and queued for processing
4. View captured notes by clicking the extension icon

### Manual Note Entry
1. Click the **BrowserBud extension icon**
2. Type or paste content in the text area
3. Click **"Save"** to add to your notes collection
4. Notes are automatically batched and synchronized

### AI Processing ("Baking")
1. Click the **"🧠 Bake Notes"** button in the popup
2. Optionally add additional context in the text area
3. The system processes all captured notes through the AI pipeline
4. Visual feedback shows processing status and results

### Managing Notes
- **View Recent**: Latest 10 captured notes displayed in popup
- **Download**: Export all notes as a timestamped text file
- **Clear All**: Remove all notes from local storage and server
- **Auto-sync**: Background processing every 2 minutes

## Project Structure

```
browserbud-chrome-extension/
├── manifest.json              # Chrome extension manifest (v3)
├── background.js             # Service worker with context menu & batch processing
├── batch-processor.js        # Core batch processing and API communication
├── popup/
│   ├── popup.html           # Extension popup interface
│   ├── popup.css            # Popup styling
│   └── popup.js             # Popup logic and user interactions
├── tests/
│   ├── background.test.js   # Background script tests
│   ├── popup.test.js        # Popup functionality tests
│   ├── setup.js            # Jest test configuration
│   └── styleMock.js         # CSS module mocking
├── package.json             # Dependencies and scripts
├── babel.config.js          # Babel configuration
├── jest.config.js           # Jest testing configuration
└── README.md               # This file
```

## Technical Architecture

### Background Service Worker (`background.js`)
- Manages Chrome extension lifecycle and context menu
- Handles message passing between popup and batch processor
- Implements user ID generation and note creation
- Coordinates batch processing operations

### Batch Processor (`batch-processor.js`)
- Core processing engine with automatic batching
- Server connectivity monitoring and health checks
- Retry logic with exponential backoff
- Local storage management and cleanup
- Badge updates for visual status indication

### Popup Interface (`popup/`)
- Modern UI with real-time status indicators
- Session management showing notes count and domain
- Character counting with storage limit warnings
- Comprehensive error handling and user feedback

## API Integration

### Batch Upload Format
```javascript
{
  "batch_id": "batch_1234567890_abc123",
  "notes": [
    {
      "content": "Selected text content",
      "user_id": "user_1234567890_xyz789",
      "source_url": "https://example.com/page",
      "title": "Page Title",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "intent": "learn",
      "user_note": ""
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Bake Request Format
```javascript
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "source": "extension",
  "trigger_source": "user_action",
  "includeAdditionalNotes": true,
  "additionalNotes": "Additional context or questions"
}
```

## Development

### Running Tests
```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
```

### Testing Configuration
- **Jest** for unit testing with Chrome extension mocking
- **@testing-library** for DOM testing utilities
- **jest-chrome** for Chrome API mocking
- **Babel** for ES6+ transpilation in tests

### Storage Architecture
- **Local Storage**: Temporary note storage with automatic cleanup
- **Session Storage**: Current session metadata and status
- **Background Persistence**: Service worker maintains batch processing state

## Configuration

### Default Settings
- **Batch Interval**: 2 minutes
- **Max Local Notes**: 50 notes
- **Max Batch Size**: 10 notes per batch
- **Retry Attempts**: 3 with exponential backoff
- **Storage Limit**: 800,000 characters
- **API Timeout**: 30 seconds (batch), 5 minutes (bake)

### Customization
Modify constants in `batch-processor.js` and `background.js`:
```javascript
const BATCH_INTERVAL = 2 * 60 * 1000;  // 2 minutes
const MAX_LOCAL_NOTES = 50;
const API_BASE_URL = 'http://localhost:8000/api';
```

## Security & Privacy

### Data Handling
- Notes stored locally in Chrome's secure storage
- User IDs are randomly generated (no personal information)
- All API communication uses standard HTTP/HTTPS
- No data collection or tracking beyond functional requirements

### Permissions
- **storage**: Local note storage and user preferences
- **contextMenus**: Right-click "Smart Notes" option
- **activeTab**: Access to current tab for metadata extraction
- **scripting**: Content script injection for advanced features
- **host_permissions**: API server communication

## Troubleshooting

### Common Issues

**Extension not appearing in context menu:**
- Verify extension is enabled in `chrome://extensions/`
- Check that text is selected before right-clicking
- Reload the webpage and try again

**Notes not syncing to server:**
- Ensure Flask API server is running on `localhost:8000`
- Check browser console for network errors
- Verify server endpoints are responding correctly

**Baking process fails:**
- Confirm server has `/api/bake` endpoint
- Check if server is processing requests (may take time)
- Review server logs for processing errors

**Storage issues:**
- Clear extension data: Right-click extension icon → "Manage Extension" → "Storage"
- Check if storage quota is exceeded (800k character limit)
- Try clearing browser cache and reloading

### Debug Features
Access debug functions in popup console:
```javascript
window.debugBaking.forceBatch();      // Force batch processing
window.debugBaking.checkServer();     // Test server connectivity
window.debugBaking.bakeNotes();       // Trigger baking process
```

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0 (Current)
- Initial release with core note-taking functionality
- AI-powered batch processing and baking features
- Modern Chrome Extension Manifest v3 implementation
- Comprehensive test coverage and documentation

---

**BrowserBud Extension** - Transform your web browsing into intelligent knowledge capture and processing.