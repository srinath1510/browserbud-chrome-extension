const CHUNK_SIZE = 8000; // Maximum size per chunk
const MAX_CHUNKS = 100;   // Limit total chunks to stay within storage quota

function initializePopup() {
    const notesArea = document.getElementById('notesArea');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');

    // Load saved notes when popup opens
    loadNotes();

    async function saveNotes() {
        try {
            const notes = notesArea.value.trim();
            if (!notes) {
                updateStatus('No notes to save.');
                return;
            }
        
            const result = await new Promise((resolve) => {
                chrome.storage.sync.get(null, (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error retrieving notes:', chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
    
            const note = {
                id: `note_${Date.now()}`,
                content: notes,
                type: 'manual',
                source: {
                    url: '',
                    title: '',
                    timestamp: new Date().toISOString()
                },
                metadata: {
                    wordCount: notes.trim().split(/\s+/).length,
                    annotationTimestamp: new Date().toISOString()
                }
            };
    
            const existingNotes = Object.keys(result)
            .filter(key => key.startsWith('note_'))
            .map(key => result[key]);
            existingNotes.push(note);
    
            await new Promise((resolve, reject) => {
                const notesToSave = {};
                existingNotes.forEach(existingNote => {
                    notesToSave[existingNote.id] = existingNote;
                });

                chrome.storage.sync.set(notesToSave, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving notes:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
    
            updateStatus('Notes saved!');
            notesArea.value = '';
            loadNotesList();
            updateCharCount();
        } catch (error) {
            console.error('Error saving notes:', error);
            updateStatus('Error saving notes!');
        }
    }

    saveBtn.addEventListener('click', saveNotes);

    // Update character count and auto-save on typing
    let saveTimeout;
    const charCounter = document.getElementById('charCounter');
    const MAX_CHARS = CHUNK_SIZE * MAX_CHUNKS;

    function updateCharCount() {
        const count = notesArea.value.length;
        const formattedCount = count.toLocaleString();
        const formattedMax = MAX_CHARS.toLocaleString();
        charCounter.textContent = `${formattedCount} / ${formattedMax} characters`;
        
        if (count > MAX_CHARS) {
            charCounter.style.color = '#d93025';
        } else if (count > MAX_CHARS * 0.9) {
            charCounter.style.color = 'rgb(227, 116, 0)';
        } else {
            charCounter.style.color = 'rgb(95, 99, 104)';
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { updateCharCount };
    }

    notesArea.addEventListener('input', () => {
        updateCharCount();
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 10000);
    });

    updateCharCount();

    async function loadNotes() {
        notesArea.value = '';

        try {
            const result = await new Promise((resolve) => {
                chrome.storage.sync.get(null, resolve);
            });

            const notes = Object.keys(result)
            .filter(key => key.startsWith('note_'))
            .map(key => result[key]);

            if (notes.length === 0) {
                return; 
            }

            const notesList = document.getElementById('notesList');
            notesList.innerHTML = '';

            notes.forEach(note => {
                const listItem = document.createElement('li');
                listItem.textContent = note.content;
                notesList.appendChild(listItem);
            });

            updateCharCount();
        } catch (error) {
            console.error('Error loading notes:', error);
            updateStatus('Error loading notes!');
        }
    }

    clearBtn.addEventListener('click', async () => {
        if (window.confirm('Are you sure you want to clear all notes?')) {
            notesArea.value = ''; // Clear the notes area
            try {
                const result = await new Promise((resolve) => {
                    chrome.storage.sync.get(null, (result) => {
                        const keysToRemove = Object.keys(result).filter(key => key.startsWith('note_'));
                        chrome.storage.sync.remove(keysToRemove, resolve);
                    });
                });
                updateStatus('All notes cleared');
                loadNotesList();
                updateCharCount();
            } catch (error) {
                console.error('Error clearing notes:', error);
                updateStatus('Error clearing notes!');
            }
        }
    });

    downloadBtn.addEventListener('click', async () => {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.sync.get(null, resolve);
        });

        const notes = Object.keys(result)
            .filter(key => key.startsWith('note_'))
            .map(key => result[key]);
        if (notes.length === 0) {
            updateStatus('No notes to download');
            return;
        }

        // Extract only the content of the notes
        const contentToDownload = notes.map(note => note.content).join('\n\n');

        const blob = new Blob([contentToDownload], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];

        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-notes-${timestamp}.md`;
        a.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading notes:', error);
        updateStatus('Error downloading notes!');
    }
});

    function updateStatus(message) {
        status.textContent = message;
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    }

    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveNotes();
        }
    });
}

function loadNotesList() {
    chrome.storage.sync.get(null, (result) => {
        const notes = Object.keys(result)
            .filter(key => key.startsWith('note_'))
            .map(key => result[key]);

        const notesList = document.getElementById('notesList');
        notesList.innerHTML = '';

        notes.forEach(note => {
            const listItem = document.createElement('li');

            const contentSpan = document.createElement('span');
            contentSpan.textContent = note.content;
            listItem.appendChild(contentSpan);

            if (note.metadata) {
                const metadataDiv = document.createElement('div');
                metadataDiv.className = 'note-metadata';

                const metadataDetails = [
                    note.metadata.pageTitle && `Source: ${note.metadata.pageTitle}`,
                    note.metadata.domain && `Domain: ${note.metadata.domain}`,
                    `Captured: ${new Date(note.source.timestamp).toLocaleString()}`,
                    note.metadata.wordCount && `Words: ${note.metadata.wordCount}`
                ].filter(Boolean).join(' | ');
                metadataDiv.textContent = metadataDetails;
                listItem.appendChild(metadataDiv);
            }

            const type = document.createElement('span');
            type.textContent = ` (${note.type})`; 
            type.className = 'note-type';   
            listItem.appendChild(type);
            notesList.appendChild(listItem);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
    loadNotesList();
});
