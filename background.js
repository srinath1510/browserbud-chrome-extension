const onInstalled = () => {
    console.log('Context menu created');
    chrome.contextMenus.create({
        id: "smartNotes",
        title: "Smart Notes",
        contexts: ["selection"]
    });
};

const onClicked = (info, tab) => {
    console.log('Context menu item clicked:', info);
    let noteContent = '';
    let noteType = '';

    if (info.selectionText) {
        noteContent = info.selectionText;
        noteType = 'selection';
    }

    console.log('Note content:', noteContent);
    const note = {
        content: noteContent,
        type: noteType,
        source: {
            url: tab.url,
            title: tab.title,
            timestamp: new Date().toISOString()
        }
    };

    console.log('Saving Note:', note);
    saveNoteToStorage(note);
};

function saveNoteToStorage(note) {
    const storageKey = 'notes';
    chrome.storage.sync.get([storageKey], (result) => {
        const notes = result[storageKey] || [];
        notes.push(note);
        chrome.storage.sync.set({ [storageKey]: notes }, () => {
            console.log('Note saved successfully!');
        });
    });
}

// Determine if we're in a test environment
const isTestEnvironment = typeof jest !== 'undefined';

// Add event listeners only if not in test environment
if (!isTestEnvironment) {
    chrome.runtime.onInstalled.addListener(onInstalled);
    chrome.contextMenus.onClicked.addListener(onClicked);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onInstalled,
        onClicked,
        saveNoteToStorage
    };
}