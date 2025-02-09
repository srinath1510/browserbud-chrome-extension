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

    // Save notes with chunking
    async function saveNotes() {
        const notes = notesArea.value;
        const chunks = {};
        
        // Calculate number of chunks needed
        const numChunks = Math.ceil(notes.length / CHUNK_SIZE);
        
        if (numChunks > MAX_CHUNKS) {
            updateStatus('Warning: Notes too long! Please reduce the size.');
            return;
        }

        // Store metadata
        chunks.metadata = {
            totalChunks: numChunks,
            totalLength: notes.length,
            lastModified: new Date().toISOString()
        };

        // Split notes into chunks
        for (let i = 0; i < numChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            chunks[`chunk_${i}`] = notes.slice(start, end);
        }

        try {
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set(chunks, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
            updateStatus('Notes saved!');
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
        
        // Update counter color based on length
        if (count > MAX_CHARS) {
            charCounter.style.color = '#d93025';
        } else if (count > MAX_CHARS * 0.9) {
            charCounter.style.color = 'rgb(227, 116, 0)';
        } else {
            charCounter.style.color = 'rgb(95, 99, 104)';
        }
    }

    // Export for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { updateCharCount };
    }

    notesArea.addEventListener('input', () => {
        updateCharCount();
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 1000);
    });

    // Initial character count
    updateCharCount();

    // Load notes from chunks
    async function loadNotes() {
        try {
            // First get metadata
            const data = await new Promise((resolve) => {
                chrome.storage.sync.get('metadata', resolve);
            });

            if (!data.metadata) {
                // No chunks found, try loading legacy format
                const legacy = await new Promise((resolve) => {
                    chrome.storage.sync.get(['notes'], resolve);
                });
                if (legacy && legacy.notes) {
                    notesArea.value = legacy.notes;
                    updateCharCount(); // Update character count after loading
                }
                return;
            }

            const { totalChunks } = data.metadata;
            let fullText = '';

            // Get all chunks
            const chunkKeys = Array.from({ length: totalChunks }, (_, i) => `chunk_${i}`);
            const chunks = await new Promise((resolve) => {
                chrome.storage.sync.get(chunkKeys, resolve);
            });

            // Reconstruct the text in order
            for (let i = 0; i < totalChunks; i++) {
                fullText += chunks[`chunk_${i}`] || '';
            }

            notesArea.value = fullText;
        } catch (error) {
            console.error('Error loading notes:', error);
            updateStatus('Error loading notes!');
        }
    }

    // Clear notes
    clearBtn.addEventListener('click', async () => {
        if (window.confirm('Are you sure you want to clear all notes?')) {
            notesArea.value = '';
            try {
                // Get metadata to know how many chunks to remove
                const data = await new Promise((resolve) => {
                    chrome.storage.sync.get('metadata', resolve);
                });
                if (data.metadata) {
                    const { totalChunks } = data.metadata;
                    const keysToRemove = ['metadata', ...Array.from({ length: totalChunks }, (_, i) => `chunk_${i}`)];
                    await new Promise((resolve) => {
                        chrome.storage.sync.remove(keysToRemove, resolve);
                    });
                } else {
                    // Try removing legacy format
                    await new Promise((resolve) => {
                        chrome.storage.sync.remove('notes', resolve);
                    });
                }
                updateStatus('Notes cleared');
            } catch (error) {
                console.error('Error clearing notes:', error);
                updateStatus('Error clearing notes!');
            }
        }
    });

    // Download notes as markdown
    downloadBtn.addEventListener('click', () => {
        const notes = notesArea.value;
        if (!notes.trim()) {
            updateStatus('No notes to download');
            return;
        }

        const blob = new Blob([notes], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-notes-${timestamp}.md`;
        a.click();

        URL.revokeObjectURL(url);
    });

    // Update status message with auto-clear
    function updateStatus(message) {
        status.textContent = message;
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveBtn.click();
        }
    });
}

// Load and display saved notes in the notepad
function loadNotesList() {
    const storageKey = 'notes';
    chrome.storage.sync.get([storageKey], (result) => {
        const notes = result[storageKey] || [];
        const notesList = document.getElementById('notesList');
        notesList.innerHTML = ''; 

        notes.forEach(note => {
            const listItem = document.createElement('li');
            listItem.textContent = note.content; 
            notesList.appendChild(listItem);
        });
    });
}

// Call loadNotes when the popup is opened
document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
    loadNotesList();
});
