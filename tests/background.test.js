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
                        if (Array.isArray(keys)) {
                            keys.forEach(key => {
                                result[key] = mockStorage[key] || [];
                            });
                        }
                        callback(result);
                    }),
                    set: jest.fn((data, callback) => {
                        Object.assign(mockStorage, data);
                        if (callback) callback();
                    }),
                },
            },
            scripting: {
                executeScript: jest.fn((details, callback) => {
                    const mockResult = [{
                        result: {
                            url: 'http://example.com',
                            title: 'Example Title',
                            domain: 'example.com',
                            language: 'en',
                            contentType: 'text/html',
                            pageLoadTimestamp: new Date().toISOString(),
                            wordCount: 100,
                            textPosition: 50,
                            associatedTags: 'BODY',
                            linkCount: 5,
                            hasCode: false,
                            hasMathFormula: false,
                        }
                    }];
                    callback(mockResult);
                }),
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
            id: "browserBud",
            title: "BrowserBud",
            contexts: ["selection"],
        });
    });

    test('should save selected text when context menu item is clicked', () => {
        const noteContent = 'This is a test note';
        const tab = { url: 'http://example.com', title: 'Example' };
        
        background.onClicked({ menuItemId: "smartNotes", selectionText: noteContent }, tab);
        
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            expect.objectContaining({
                [`note_${expect.any(Number)}`]: expect.objectContaining({
                    content: noteContent,
                    type: 'selection',
                    source: expect.objectContaining({
                        url: tab.url,
                        title: tab.title,
                        timestamp: expect.any(String),
                    }),
                    metadata: expect.objectContaining({
                        pageUrl: tab.url,
                        pageTitle: tab.title,
                        domain: expect.any(String),
                        pageLanguage: expect.any(String),
                        wordCount: expect.any(Number),
                        textPosition: expect.any(Number),
                        associatedTags: expect.any(String),
                        linkCount: expect.any(Number),
                        hasCode: expect.any(Boolean),
                        hasMathFormula: expect.any(Boolean),
                        annotationTimestamp: expect.any(String),
                        selectionLength: noteContent.length,
                        intent: 'contextMenuCapture'
                    }),
                    tag: 'Context Menu'
                }),
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
        mockStorage[`note_${Date.now()}`] = { content: 'Existing note', type: 'selection', tag: 'Context Menu' };
        const newNoteContent = 'New test note';
        const tab = { url: 'http://example.com', title: 'Example' };

        background.onClicked({ menuItemId: "smartNotes", selectionText: newNoteContent }, tab);

        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            expect.objectContaining({
                [`note_${expect.any(Number)}`]: expect.objectContaining({
                    content: newNoteContent,
                    type: 'selection',
                    tag: 'Context Menu',
                }),
                [`note_${expect.any(Number)}`]: expect.objectContaining({
                    content: 'Existing note',
                    type: 'selection',
                    tag: 'Context Menu',
                }),
            }),
            expect.any(Function)
        );
    });

    test('should handle metadata extraction errors gracefully', () => {
        // Mock the executeScript to throw an error
        chrome.scripting.executeScript.mockImplementation((details, callback) => {
            callback([]);
        });

        const noteContent = 'This is a test note';
        const tab = { url: 'http://example.com', title: 'Example' };

        background.onClicked({ menuItemId: "smartNotes", selectionText: noteContent }, tab);

        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
            expect.objectContaining({
                [`note_${expect.any(Number)}`]: expect.objectContaining({
                    content: noteContent,
                    type: 'selection',
                    source: expect.objectContaining({
                        url: tab.url,
                        title: tab.title,
                        timestamp: expect.any(String),
                    }),
                    metadata: expect.objectContaining({
                        error: 'Metadata extraction failed',
                        annotationTimestamp: expect.any(String),
                        selectionLength: noteContent.length,
                        intent: 'contextMenuCapture',
                        wordCount: noteContent.trim().split(/\s+/).length,
                    }),
                    tag: 'Context Menu'
                }),
            }),
            expect.any(Function)
        );
    });
});
