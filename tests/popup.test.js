const fs = require('fs');
const path = require('path');

const HTML_FILE = fs.readFileSync(path.resolve(__dirname, '../popup/popup.html'), 'utf8');

describe('Popup Functionality', () => {
    let notesArea, saveBtn, clearBtn, downloadBtn, status, charCounter;

    beforeEach(() => {
        // Setup document body
        document.body.innerHTML = HTML_FILE;

        // Reset all mocks and modules
        jest.clearAllMocks();
        jest.resetModules();


        global.chrome = {
            storage: {
                sync: {
                    get: jest.fn((keys, callback) => {
                        callback({ notes: [] }); // Simulate an empty notes array
                    }),
                    set: jest.fn((data, callback) => {
                        callback(); // Simulate a successful set operation
                    }),
                    remove: jest.fn((keys, callback) => {
                        callback(); // Simulate a successful remove operation
                    }),
                },
            },
            runtime: {
                lastError: null, // Add this to avoid undefined errors
            },
        };

        // Get DOM elements
        notesArea = document.getElementById('notesArea');
        saveBtn = document.getElementById('saveBtn');
        clearBtn = document.getElementById('clearBtn');
        downloadBtn = document.getElementById('downloadBtn');
        status = document.getElementById('status');
        charCounter = document.getElementById('charCounter');

        // Clear notes area
        notesArea.value = '';

        // Load popup script
        require('../popup/popup.js');

        // Trigger DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('loads saved notes on startup', async () => {
        // Setup test data
        global.chrome.storage.sync.get.mockImplementation((keys, callback) => {
            callback({ notes: [{ content: 'test notes', type: 'manual' }] });
        });

        // Re-initialize to trigger load
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        const notesList = document.getElementById('notesList');
        const listItems = notesList.getElementsByTagName('li');
        expect(listItems.length).toBe(1);
        expect(listItems[0].textContent).toBe('test notes');
    });

    test('saves notes when save button is clicked', async () => {
        notesArea.value = 'new test notes';
        saveBtn.click();
        await Promise.resolve(); // Flush microtasks
        expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    test('does not save empty notes', async () => {
        // Setup
        notesArea.value = '';

        // Action
        saveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        const setCall = chrome.storage.sync.set.mock.calls.length;
        expect(setCall).toBe(0); // No save should occur
    });

    test('clears notes when clear button is clicked', async () => {
        // Setup
        window.confirm.mockImplementationOnce(() => true);
        notesArea.value = 'test notes';
        await new Promise((resolve) => {
            chrome.storage.sync.set({ notes: [{ content: 'test notes', type: 'manual' }] }, resolve);
        });

        // Action
        clearBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        expect(notesArea.value).toBe('');
        expect(chrome.storage.sync.remove).toHaveBeenCalledWith(
            'notes',
            expect.any(Function)
        );
    });

    test('downloads notes as markdown', async () => {
        // Setup
        const mockAnchor = {
            href: '',
            download: '',
            click: jest.fn()
        };
        document.createElement = jest.fn(() => mockAnchor);
        URL.createObjectURL.mockReturnValue('blob:test');
        global.chrome.storage.sync.get.mockImplementation((keys, callback) => {
            callback({ notes: [{ content: 'test notes for download', type: 'manual' }] });
        });

        // Action
        downloadBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async operations

        // Verify
        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    describe('Character Counter', () => {
        beforeEach(() => {
            charCounter = document.getElementById('charCounter');
        });

        test('initializes with 0 characters', () => {
            expect(charCounter.textContent).toBe('0 / 800,000 characters');
            expect(charCounter.style.color).toBe('rgb(95, 99, 104)');
        });

        test('updates count when typing', () => {
            notesArea.value = 'Hello World';
            notesArea.dispatchEvent(new Event('input'));
            expect(charCounter.textContent).toBe('11 / 800,000 characters');
        });

        test('shows error color when over capacity', () => {
            const overCapacity = 'a'.repeat(800001);
            notesArea.value = overCapacity;
            notesArea.dispatchEvent(new Event('input'));
            expect(charCounter.style.color).toBe('rgb(217, 48, 37)');
        });

        test('formats large numbers with commas', () => {
            const largeText = 'a'.repeat(12345);
            notesArea.value = largeText;
            notesArea.dispatchEvent(new Event('input'));
            expect(charCounter.textContent).toBe('12,345 / 800,000 characters');
        });
    });

    test('handles keyboard shortcuts and saves notes', async () => {

        notesArea.value = 'Test note for keyboard shortcut';
        const event = new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true
        });
        document.dispatchEvent(event);
        await Promise.resolve(); // Flush microtasks
        expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
});