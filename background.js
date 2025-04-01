const onInstalled = () => {
    console.log('Context menu created');
    chrome.contextMenus.create({
        id: "smartNotes",
        title: "Smart Notes",
        contexts: ["selection"]
    });
};

const extractPageMetadata = (tab) => {
    return new Promise((resolve, reject) => {
        try {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    const metadata = {
                        // Page-Level Metadata
                        url: window.location.href,
                        title: document.title,
                        domain: window.location.hostname,
                        language: document.documentElement.lang || navigator.language,
                        contentType: document.contentType,
                        pageLoadTimestamp: new Date().toISOString(),
                        // Content-Specific Metadata
                        wordCount: window.getSelection().toString().trim().split(/\s+/).length,
                        textPosition: (() => {
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                const preCaretRange = range.cloneRange();
                                preCaretRange.selectNodeContents(document.body);
                                preCaretRange.setEnd(range.startContainer, range.startOffset);
                                return preCaretRange.toString().length;
                            }
                            return 0;
                        })(),
                        associatedTags: (() => {
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                const parentElement = selection.getRangeAt(0).startContainer.parentElement;
                                return parentElement ? parentElement.tagName : 'UNKNOWN';
                            }
                            return 'UNKNOWN';
                        })(),
                        linkCount: document.links.length,
                        hasCode: document.querySelector('pre, code') !== null,
                        hasMathFormula: document.querySelector('math, .math') !== null
                    };
                    console.log('Extracted Page Metadata:', metadata);
                    return metadata;
                }
            }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    console.log('Raw executeScript result:', result);
                    const pageMetadata = result && result.length > 0 && result[0].result ? result[0].result : {};
                    console.log('Processed metadata:', pageMetadata);
                    resolve(pageMetadata);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
};

const onClicked = (info, tab) => {
    console.log('Context menu item clicked:', info);
    
    if (!info.selectionText) {
        console.log('No text selected, skipping save.');
        return;
    }

    extractPageMetadata(tab)
    .then(pageMetadata => {
        const metadata = {
            pageUrl: pageMetadata.url || tab.url,
            pageTitle: pageMetadata.title || tab.title,
            domain: pageMetadata.domain || new URL(tab.url).hostname,
            pageLanguage: pageMetadata.language || 'unknown',
            contentType: pageMetadata.contentType || 'unknown',
            pageLoadTimestamp: pageMetadata.pageLoadTimestamp || new Date().toISOString(),

            wordCount: pageMetadata.wordCount || info.selectionText.trim().split(/\s+/).length,
            textPosition: pageMetadata.textPosition || 0,
            associatedTags: pageMetadata.associatedTags || 'UNKNOWN',
            linkCount: pageMetadata.linkCount || 0,
            hasCode: pageMetadata.hasCode || false,
            hasMathFormula: pageMetadata.hasMathFormula || false,

            annotationTimestamp: new Date().toISOString(),
            selectionLength: info.selectionText.length,
            intent: 'contextMenuCapture'
        };

        const note = {
            content: info.selectionText,
            type: 'selection',
            
            source: {
                url: tab.url,
                title: tab.title,
                timestamp: new Date().toISOString()
            },
            
            metadata: metadata,
            tag: 'Context Menu'
        };

        console.log('Saving Enhanced Note:', note);
        saveNoteToStorage(note);
    })
    .catch(error => {
        console.error('Error extracting page metadata:', error);
        
        // Fallback note creation without metadata
        const note = {
            content: info.selectionText,
            type: 'selection',
            source: {
                url: tab.url,
                title: tab.title,
                timestamp: new Date().toISOString()
            },
            tag: 'Context Menu',
            metadata: {
                error: 'Metadata extraction failed',
                annotationTimestamp: new Date().toISOString(),
                selectionLength: info.selectionText.length,
                intent: 'contextMenuCapture',
                wordCount: info.selectionText.trim().split(/\s+/).length
            }
        };

        saveNoteToStorage(note);
    });
};

function saveNoteToStorage(note) {
    const storageKey = 'notes';
    chrome.storage.sync.get([storageKey], (result) => {
        const notes = result[storageKey] || [];
        if (note.type === 'selection') {
            note.tag = 'Context Menu'; 
        } else {
            note.tag = 'Manual Entry'; 
        }
        notes.push(note);
        chrome.storage.sync.set({ [storageKey]: notes }, () => {
            console.log('Note saved successfully!');
        });
    });
}

const isTestEnvironment = typeof jest !== 'undefined';
if (!isTestEnvironment) {
    chrome.runtime.onInstalled.addListener(onInstalled);
    chrome.contextMenus.onClicked.addListener(onClicked);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onInstalled,
        onClicked,
        saveNoteToStorage,
        extractPageMetadata
    };
}

