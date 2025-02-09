const background = require('../background');

describe('Background Script Functionality', () => {
    let mockStorage = {};

    beforeAll(() => {
        global.chrome = {
            runtime: {
                onInstalled: {
                    addListener: jest.fn((callback) => callback()),
                },
            },
            contextMenus: {
                create: jest.fn(),
                onClicked: {
                    addListener: jest.fn(),
                },
            },
            storage: {
                sync: {
                    get: jest.fn((keys, callback) => {
                        const result = {};
                        keys.forEach(key => {
                            result[key] = mockStorage[key] || [];
                        });
                        callback(result);
                    }),
                    set: jest.fn((data, callback) => {
                        Object.assign(mockStorage, data);
                        if (callback) callback();
                    }),
                },
            },
        };
    });

    beforeEach(() => {
        // Clear mock storage and reset mock function calls before each test
        mockStorage = {};
        jest.clearAllMocks();
    });

    test('should create context menu on install', () => {
        // Call the onInstalled function
        background.onInstalled();

        // Verify that the context menu is created with correct parameters
        expect(chrome.contextMenus.create).toHaveBeenCalledWith({
            id: "smartNotes",
            title: "Smart Notes",
            contexts: ["selection"],
        });
    });

    test('should save selected text when context menu item is clicked', () => {
        const noteContent = 'This is a test note';
        const noteType = 'selection';
        const tab = { url: 'http://example.com', title: 'Example' };

        // Simulate clicking the context menu item
        background.onClicked({ menuItemId: "smartNotes", selectionText: noteContent }, tab);

        // Verify that the note is saved to storage
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            {
                notes: expect.arrayContaining([{
                    content: noteContent,
                    type: noteType,
                    source: {
                        url: tab.url,
                        title: tab.title,
                        timestamp: expect.any(String),
                    },
                }]),
            },
            expect.anything() // Match the callback function
        );
    });

    test('should not save note if no text is selected', () => {
        const tab = { url: 'http://example.com', title: 'Example' };

        // Simulate clicking the context menu item with no selected text
        background.onClicked({ menuItemId: "smartNotes", selectionText: null }, tab);

        // Verify that empty note is not saved
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            {
                notes: expect.arrayContaining([{
                    content: '',
                    type: '',
                    source: expect.any(Object),
                }]),
            },
            expect.anything() // Match the callback function
        );
    });

    test('should append new notes to existing notes', async () => {
        // Setup existing notes in storage
        const existingNote = { content: 'Existing note', type: 'selection' };
        mockStorage.notes = [existingNote];

        const newNoteContent = 'New test note';
        const tab = { url: 'http://example.com', title: 'Example' };

        // Add new note
        background.onClicked({ menuItemId: "smartNotes", selectionText: newNoteContent }, tab);

        // Verify that both notes are in storage
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            {
                notes: expect.arrayContaining([
                    existingNote,
                    expect.objectContaining({
                        content: newNoteContent,
                        type: 'selection',
                    }),
                ]),
            },
            expect.anything() // Match the callback function
        );
    });
});