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
        mockStorage = {};
        jest.clearAllMocks();
    });

    test('should create context menu on install', () => {
        background.onInstalled();
        expect(chrome.contextMenus.create).toHaveBeenCalledWith({
            id: "smartNotes",
            title: "Smart Notes",
            contexts: ["selection"],
        });
    });

    test('should save selected text when context menu item is clicked', () => {
        const noteContent = 'This is a test note';
        const tab = { url: 'http://example.com', title: 'Example' };
        
        background.onClicked({ menuItemId: "smartNotes", selectionText: noteContent }, tab);
        
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            expect.objectContaining({
                notes: expect.arrayContaining([
                    expect.objectContaining({
                        content: noteContent,
                        type: 'selection',
                        source: expect.objectContaining({
                            url: tab.url,
                            title: tab.title,
                            timestamp: expect.any(String),
                        }),
                        tag: 'Context Menu',
                    }),
                ]),
            }),
            expect.any(Function)
        );
    });

    test('should not save empty notes if no text is selected', () => {
        const tab = { url: 'http://example.com', title: 'Example' };
        
        background.onClicked({ menuItemId: "smartNotes", selectionText: null }, tab);
        
        expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('should append new notes to existing notes', () => {
        mockStorage.notes = [{ content: 'Existing note', type: 'selection', tag: 'Context Menu' }];
        const newNoteContent = 'New test note';
        const tab = { url: 'http://example.com', title: 'Example' };

        background.onClicked({ menuItemId: "smartNotes", selectionText: newNoteContent }, tab);

        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            expect.objectContaining({
                notes: expect.arrayContaining([
                    expect.objectContaining({ content: 'Existing note' }),
                    expect.objectContaining({
                        content: newNoteContent,
                        type: 'selection',
                        tag: 'Context Menu',
                    }),
                ]),
            }),
            expect.any(Function)
        );
    });
});
