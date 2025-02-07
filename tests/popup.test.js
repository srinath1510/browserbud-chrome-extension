const fs = require('fs');
const path = require('path');

const HTML_FILE = fs.readFileSync(path.resolve(__dirname, '../popup/popup.html'), 'utf8');

describe('Popup Functionality', () => {
    let notesArea, saveBtn, clearBtn, downloadBtn, status;

    beforeEach(() => {
        // Setup document body
        document.body.innerHTML = HTML_FILE;

        // Reset all mocks
        jest.clearAllMocks();
        
        // Load popup script
        require('../popup/popup.js');

        // Get DOM elements
        notesArea = document.getElementById('notesArea');
        saveBtn = document.getElementById('saveBtn');
        clearBtn = document.getElementById('clearBtn');
        downloadBtn = document.getElementById('downloadBtn');
        status = document.getElementById('status');

        // Trigger DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('loads saved notes on startup', () => {
        // Setup mock
        chrome.storage.sync.get.mockImplementationOnce((keys, callback) => {
            callback({ notes: 'test notes' });
        });

        // Re-initialize to trigger load
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Verify
        expect(chrome.storage.sync.get).toHaveBeenCalledWith(['notes'], expect.any(Function));
        expect(notesArea.value).toBe('test notes');
    });

    test('saves notes when save button is clicked', () => {
        // Setup
        notesArea.value = 'new test notes';
        
        // Action
        saveBtn.click();

        // Verify
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            { notes: 'new test notes' },
            expect.any(Function)
        );
    });

    test('auto-saves notes while typing', () => {
        // Setup
        jest.useFakeTimers();
        notesArea.value = 'auto-save test';

        // Action
        notesArea.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(1000);

        // Verify
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            { notes: 'auto-save test' },
            expect.any(Function)
        );

        jest.useRealTimers();
    });

    test('clears notes when clear button is clicked', () => {
        // Setup
        window.confirm.mockImplementationOnce(() => true);
        notesArea.value = 'test notes';

        // Action
        clearBtn.click();

        // Verify
        expect(notesArea.value).toBe('');
        expect(chrome.storage.sync.remove).toHaveBeenCalledWith('notes', expect.any(Function));
    });

    test('downloads notes as markdown', () => {
        // Setup
        const mockAnchor = {
            href: '',
            download: '',
            click: jest.fn()
        };
        document.createElement = jest.fn(() => mockAnchor);
        URL.createObjectURL.mockReturnValue('blob:test');
        notesArea.value = 'test notes for download';

        // Action
        downloadBtn.click();

        // Verify
        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    test('handles keyboard shortcuts', () => {
        // Setup
        const event = new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true
        });

        // Action
        document.dispatchEvent(event);

        // Verify
        expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
});

