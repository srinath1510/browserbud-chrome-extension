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
            chrome.tabs.executeScript(tab.id, {
                code: `
                (() => {
                    return {
                        // Page-Level Metadata
                        url: window.location.href,
                        title: document.title,
                        domain: window.location.hostname,
                        language: document.documentElement.lang || navigator.language,
                        contentType: document.contentType,
                        pageLoadTimestamp: new Date().toISOString(),

                        // Content-Specific Metadata
                        wordCount: window.getSelection().toString().trim().split(/\\s+/).length,
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
                })()
                `
            }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[0] || {});
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
        const note = {
            // Core note content
            content: info.selectionText,
            type: 'selection',
            
            // Source information
            source: {
                url: tab.url,
                title: tab.title,
                timestamp: new Date().toISOString()
            },
            
            // Enriched Metadata
            metadata: {
                // Page-Level Metadata
                pageUrl: pageMetadata.url,
                pageTitle: pageMetadata.title,
                domain: pageMetadata.domain,
                pageLanguage: pageMetadata.language,
                contentType: pageMetadata.contentType,
                pageLoadTimestamp: pageMetadata.pageLoadTimestamp,

                // Content-Specific Metadata
                wordCount: pageMetadata.wordCount,
                textPosition: pageMetadata.textPosition,
                associatedTags: pageMetadata.associatedTags,
                linkCount: pageMetadata.linkCount,
                hasCode: pageMetadata.hasCode,
                hasMathFormula: pageMetadata.hasMathFormula,

                // User Interaction Metadata
                userTags: [], // Placeholder for user-added tags
                annotationTimestamp: new Date().toISOString(),
                
                // Additional context
                selectionLength: info.selectionText.length,
                intent: 'contextMenuCapture'
            },

            // Tagging
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
                error: 'Metadata extraction failed'
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