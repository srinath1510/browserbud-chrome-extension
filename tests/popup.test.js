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
        
        // Reset storage data
        global.__chromeStorageData = {};

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
            callback({ notes: [{ content: 'test notes' }] }); // Return an array of note objects
        });

        // Re-initialize to trigger load
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        const notesList = document.getElementById('notesList');
        const listItems = notesList.getElementsByTagName('li');
        console.log('Number of list items:', listItems.length);
        if (listItems.length > 0) {
            console.log('First list item content:', listItems[0].textContent);
        } else {
            console.log('No list items found.');
        }
        expect(listItems.length).toBe(1); 
        expect(listItems[0].textContent).toBe('test notes');
    });

    test('saves notes when save button is clicked', async () => {
        // Setup
        notesArea.value = 'new test notes';
        
        // Action
        saveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        const setCall = chrome.storage.sync.set.mock.calls[0][0];
        expect(setCall.metadata).toBeDefined();
        expect(setCall.metadata.totalChunks).toBe(1);
        expect(setCall.chunk_0).toBe('new test notes');
    });

    describe('Chunked Storage', () => {
        beforeEach(() => {
            chrome.storage.sync.get.mockClear();
            chrome.storage.sync.set.mockClear();
        });

        test('saves large text in chunks', async () => {
            // Create text larger than single chunk (8KB)
            const largeText = 'a'.repeat(10000);
            notesArea.value = largeText;
            
            // Trigger save
            saveBtn.click();

            // Verify metadata and chunks were saved
            const setCall = chrome.storage.sync.set.mock.calls[0][0];
            expect(setCall.metadata).toBeDefined();
            expect(setCall.metadata.totalChunks).toBe(2);
            expect(setCall.metadata.totalLength).toBe(10000);
            expect(setCall.chunk_0).toBeDefined();
            expect(setCall.chunk_1).toBeDefined();
            expect(setCall.chunk_0.length).toBe(8000);
            expect(setCall.chunk_1.length).toBe(2000);
        });

        test('loads chunked text correctly', async () => {
            // Mock chunked storage response
            const chunks = {
                metadata: {
                    totalChunks: 2,
                    totalLength: 10000
                },
                chunk_0: 'a'.repeat(8000),
                chunk_1: 'a'.repeat(2000)
            };
            chrome.storage.sync.get.mockImplementation((keys, callback) => {
                if (Array.isArray(keys)) {
                    const result = {};
                    keys.forEach(key => {
                        if (chunks[key]) result[key] = chunks[key];
                    });
                    callback(result);
                } else {
                    callback({ [keys]: chunks[keys] });
                }
            });

            // Trigger load
            document.dispatchEvent(new Event('DOMContentLoaded'));

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify text was reconstructed correctly
            expect(notesArea.value.length).toBe(10000);
            expect(notesArea.value).toBe('a'.repeat(10000));
        });

        test('handles clearing chunked storage', async () => {
            // Setup test data
            global.__chromeStorageData = {
                metadata: { totalChunks: 2 },
                chunk_0: 'part1',
                chunk_1: 'part2'
            };

            // Mock confirm dialog
            window.confirm.mockImplementationOnce(() => true);

            // Trigger clear
            clearBtn.click();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify all chunks and metadata were removed
            expect(global.__chromeStorageData.metadata).toBeUndefined();
            expect(global.__chromeStorageData.chunk_0).toBeUndefined();
            expect(global.__chromeStorageData.chunk_1).toBeUndefined();
        });


    });

    test('auto-saves notes while typing', async () => {
        // Setup
        jest.useFakeTimers();
        notesArea.value = 'auto-save test';

        // Action
        notesArea.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(1000);
        await Promise.resolve();

        // Verify
        const setCall = chrome.storage.sync.set.mock.calls[0][0];
        expect(setCall.metadata).toBeDefined();
        expect(setCall.chunk_0).toBe('auto-save test');

        jest.useRealTimers();
    });

    test('clears notes when clear button is clicked', async () => {
        // Setup
        window.confirm.mockImplementationOnce(() => true);
        notesArea.value = 'test notes';
        chrome.storage.sync.get.mockImplementationOnce((keys, callback) => {
            callback({ metadata: { totalChunks: 1 } });
        });

        // Action
        clearBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify
        expect(notesArea.value).toBe('');
        expect(chrome.storage.sync.remove).toHaveBeenCalledWith(
            ['metadata', 'chunk_0'],
            expect.any(Function)
        );
    });

    describe('Character Counter', () => {
        let charCounter;

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

    test('downloads notes as markdown', () => {
        const mockAnchor = {
            href: '',
            download: '',
            click: jest.fn()
        };
        document.createElement = jest.fn(() => mockAnchor);
        URL.createObjectURL.mockReturnValue('blob:test');
        notesArea.value = 'test notes for download';

        downloadBtn.click();

        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    test('handles keyboard shortcuts', () => {
        const event = new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
});
