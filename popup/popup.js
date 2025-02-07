function initializePopup() {
    const notesArea = document.getElementById('notesArea');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');

    // Load saved notes when popup opens
    chrome.storage.sync.get(['notes'], (result) => {
        if (result.notes) {
            notesArea.value = result.notes;
        }
    });

    // Save notes
    function saveNotes() {
        const notes = notesArea.value;
        chrome.storage.sync.set({ notes }, () => {
            updateStatus('Notes saved!');
        });
    }

    saveBtn.addEventListener('click', saveNotes);

    // Auto-save on typing (debounced)
    let saveTimeout;
    notesArea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const notes = notesArea.value;
            chrome.storage.sync.set({ notes }, () => {});
        }, 1000);
    });

    // Clear notes
    clearBtn.addEventListener('click', () => {
        if (window.confirm('Are you sure you want to clear all notes?')) {
            notesArea.value = '';
            chrome.storage.sync.remove('notes', () => {
                updateStatus('Notes cleared');
            });
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePopup);
