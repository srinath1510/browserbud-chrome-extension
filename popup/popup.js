const CHUNK_SIZE = 8000; // Maximum size per chunk
const MAX_CHUNKS = 100;   // Limit total chunks to stay within storage quota
const API_BASE_URL = 'http://localhost:8000/api';

let currentSessionData = {
    notes: [],
    domain: null,
    batchStatus: null,
    totalCaptured: 0,
    serverConnected: false
};

let elements = {};

/**
 * Initialize the popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    initializePopup();
});

/**
 * Listener for background script notifications
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'notesProcessed') {
        console.log('🔄 Background processed notes - refreshing popup display');
        
        loadRecentNotes().then(() => {
            updateSessionStatusDisplay();
            const count = message.data?.processedCount || 0;
            updateStatus(`${count} notes auto-synced to server`);
        });
    }
});


/**
 * Initialize popup functionality
 */
function initializePopup() {
    console.log('Initializing Smart Notes popup...');

    elements = {
        notesArea: document.getElementById('notesArea'),
        saveBtn: document.getElementById('saveBtn'),
        clearBtn: document.getElementById('clearBtn'),
        downloadBtn: document.getElementById('downloadBtn'),
        bakeBtn: document.getElementById('bakeBtn'),
        status: document.getElementById('status'),
        charCounter: document.getElementById('charCounter'),
        sessionNotesCount: document.getElementById('sessionNotesCount'),
        sessionDomain: document.getElementById('sessionDomain'),
        batchStatus: document.getElementById('batchStatus'),
        notesList: document.getElementById('notesList'),
        notesContainer: document.getElementById('notesContainer'),
        bakeStatus: document.querySelector('.bake-status'),
        processingResults: document.querySelector('.processing-results')
    };

    if (!validateElements()) {
        console.error('Required DOM elements not found');
        return;
    }

    setupEventListeners();
    loadInitialData();
    updateCharCount();

    console.log('Smart Notes popup initialized successfully');
}

/**
 * Validate that required DOM elements exist
 */
function validateElements() {
    const required = ['notesArea', 'saveBtn', 'bakeBtn', 'status'];
    
    for (const elementName of required) {
        if (!elements[elementName]) {
            console.error(`Required element not found: ${elementName}`);
            return false;
        }
    }
    
    return true;
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Save button
    if (elements.saveBtn) {
        elements.saveBtn.addEventListener('click', saveNotes);
    }

    // Bake button
    if (elements.bakeBtn) {
        elements.bakeBtn.addEventListener('click', handleBake);
    }

    // Clear button
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearNotes);
    }

    // Download button
    if (elements.downloadBtn) {
        elements.downloadBtn.addEventListener('click', downloadNotes);
    }

    // Auto-save and character counting
    if (elements.notesArea) {
        let saveTimeout;
        
        elements.notesArea.addEventListener('input', () => {
            updateCharCount();
            
            // Auto-save after 10 seconds of no typing
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveNotes, 10000);
        });
    }

    if (elements.bakeBtn) {
        elements.bakeBtn.addEventListener('click', handleBakeNotes);
    }

    // Process pending batch button (if exists)
    const processPendingBtn = document.getElementById('processPendingBtn');
    if (processPendingBtn) {
        processPendingBtn.addEventListener('click', processPendingBatch);
    }
}

/**
 * Load initial data when popup opens
 */
async function loadInitialData() {
    console.log('=== Loading Initial Data ===');

    try {
        // Get current tab info
        console.log('Step 1: Getting tab info...');
        await getCurrentTabInfo();
        
        // Load batch status from background script
        console.log('Step 2: Loading batch status...');
        await loadBatchStatus();

        console.log('Step 2.5: Checking server connection...');
        await checkServerConnection();
        
        // Load recent notes
        console.log('Step 3: Loading recent notes...');
        await loadRecentNotes();
        
        // Update session display
        console.log('Step 4: Updating session display...');
        updateSessionStatusDisplay();

        console.log('=== Initial Data Load Complete ===');
        console.log('Final state:', currentSessionData);

    } catch (error) {
        console.error('Error loading initial data:', error);
        updateStatus('Error loading data');
    }
}

/**
 * Get current tab information
 */
async function getCurrentTabInfo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentSessionData.domain = new URL(tab.url).hostname;
        }
    } catch (error) {
        console.error('Error getting tab info:', error);
        currentSessionData.domain = 'unknown';
    }
}

/**
 * Load batch status from background script
 */
async function loadBatchStatus() {
    console.log('Loading batch status from background...');

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getBatchStatus' });
        console.log('Raw batch status response:', response);
        
        if (response && !response.error) {
            currentSessionData.batchStatus = response;
            currentSessionData.totalCaptured = response.pendingCount || 0;
            currentSessionData.serverConnected = response.serverConnected !== false;

            console.log('Processed batch status:', {
                pendingCount: response.pendingCount,
                serverConnected: response.serverConnected,
                isProcessing: response.isProcessing
            });
            
        } else {
            console.error('Error in batch status response:', response?.error);
            currentSessionData.batchStatus = { pendingCount: 0, serverConnected: false };
            currentSessionData.serverConnected = false;
        }
    } catch (error) {
        console.error('Error communicating with background script:', error);
        currentSessionData.batchStatus = { pendingCount: 0, serverConnected: false };
        currentSessionData.serverConnected = false;
    }
}

/**
 * Load recent notes from local storage
 */
async function loadRecentNotes() {
    console.log('Loading recent notes from local storage...');

    try {
        const result = await chrome.storage.local.get(null);
        console.log('Raw storage result:', result);
        
        const notes = Object.keys(result)
        .filter(key => key.startsWith('note_') || key.startsWith('local_') || key.startsWith('manual_'))
        .map(key => ({ 
            key,
            id: key,
            ...result[key]
        }))
        .filter(note => note.content)
        .sort((a, b) => {
            const aTime = new Date(a.timestamp || 0);
            const bTime = new Date(b.timestamp || 0);
            return bTime - aTime;
        });
        console.log(`Processed ${notes.length} notes:`, notes)

        currentSessionData.notes = notes;

        const storageCount = notes.length;
        const batchCount = currentSessionData.totalCaptured || 0;
        currentSessionData.totalCaptured = Math.max(storageCount, batchCount);
        
        console.log('Final note counts - Storage:', storageCount, 'Batch:', batchCount, 'Using:', currentSessionData.totalCaptured);
        
        displayNotes(notes);
        
    } catch (error) {
        console.error('Error loading notes from storage:', error);
        currentSessionData.notes = [];
        displayNotes([]);
    }
}

async function debugStorageKeys() {
    const result = await chrome.storage.local.get(null);
    console.log('=== ALL STORAGE KEYS ===');
    
    Object.keys(result).forEach(key => {
        const item = result[key];
        console.log(`Key: ${key}`);
        console.log('  Type:', typeof item);
        console.log('  Has content:', !!item.content);
        console.log('  Has source:', !!item.source);
        console.log('  Has metadata:', !!item.metadata);
        console.log('  Data:', item);
        console.log('---');
    });
    const notesList = document.getElementById('notesList');
    if (notesList) {
        notesList.innerHTML = '';
        
        const noteKeys = Object.keys(result).filter(key => 
            key.startsWith('note_') || key.startsWith('local_') || key.startsWith('manual_')
        );
        
        if (noteKeys.length === 0) {
            notesList.innerHTML = '<li style="color: red;">No note keys found!</li>';
        } else {
            noteKeys.forEach(key => {
                const note = result[key];
                const li = document.createElement('li');
                li.style.border = '2px solid green';
                li.style.padding = '10px';
                li.style.margin = '5px';
                
                li.innerHTML = `
                    <strong>Key:</strong> ${key}<br>
                    <strong>Content:</strong> ${note.content?.substring(0, 100) || 'No content'}<br>
                    <strong>Tag:</strong> ${note.tag || 'No tag'}<br>
                    <strong>Domain:</strong> ${note.metadata?.domain || 'No domain'}
                `;
                
                notesList.appendChild(li);
            });
        }
    }
}

/**
 * Update session status display
 */
function updateSessionStatusDisplay() {
    console.log('Updating session status with data:', currentSessionData);

    // Update notes count
    if (elements.sessionNotesCount) {
        const count = currentSessionData.totalCaptured || 0;
        elements.sessionNotesCount.textContent = `${count} notes captured`;
        console.log('Updated notes count to:', `${count} notes captured`);
    }
    
    // Update domain
    if (elements.sessionDomain) {
        const domain = currentSessionData.domain || 'unknown';
        elements.sessionDomain.textContent = domain;
        console.log('Updated domain to:', domain);    
    }
    
    // Update batch status
    if (elements.batchStatus && currentSessionData.batchStatus) {
        const status = currentSessionData.batchStatus;
        const statusText = getStatusText(status);
        elements.batchStatus.textContent = statusText.text;
        elements.batchStatus.className = `batch-status ${statusText.class}`;
        console.log('Updated batch status to:', statusText.text, 'class:', statusText.class);
    }
}

/**
 * Get status text and class based on batch status
 */
function getStatusText(status) {
    console.log('Getting status text for:', status);

    if (!status.serverConnected) {
        return { text: 'Offline', class: 'offline' };
    }
    
    if (status.isProcessing) {
        return { text: 'Syncing', class: 'syncing' };
    }
    
    if (status.pendingCount > 0) {
        return { text: `${status.pendingCount} Pending`, class: 'pending' };
    }
    
    return { text: 'Connected', class: 'synced' };
}


function debugCurrentState() {
    console.log('=== DEBUG: Current State ===');
    console.log('currentSessionData:', currentSessionData);
    console.log('DOM elements:', elements);
    console.log('notesList children:', elements.notesList?.children.length);
    console.log('sessionNotesCount text:', elements.sessionNotesCount?.textContent);
    console.log('sessionDomain text:', elements.sessionDomain?.textContent);
    console.log('batchStatus text:', elements.batchStatus?.textContent);
}


async function saveNotes() {
    try {
        const notes = elements.notesArea.value.trim();
        if (!notes) {
            updateStatus('No notes to save.');
            return;
        }

        const note = {
            content: notes,
            user_id: "browser_user",
            source_url: "",
            title: "Manual Entry",
            timestamp: new Date().toISOString(),
            intent: "reference",
            user_note: ""
        };

        // Send to background script for processing
        const response = await chrome.runtime.sendMessage({ 
            action: 'addNote', 
            note: note 
        });

        if (response && !response.error) {
            // Update local count
            currentSessionData.totalCaptured += 1;
            updateSessionStatusDisplay();
            
            updateStatus('Note saved and queued!');
            elements.notesArea.value = '';
            updateCharCount();
            
            // Reload data to show new note
            await loadRecentNotes();
        } else {
            throw new Error(response?.error || 'Failed to save note');
        }

    } catch (error) {
        console.error('Error saving notes:', error);
        updateStatus('Error saving notes!');
    }
}

/**
 * Handle bake button click
 */
async function handleBake() {
    try {
        // Disable bake button during processing
        elements.bakeBtn.disabled = true;
        elements.bakeBtn.textContent = 'Processing...';
        
        // Show bake status
        showBakeStatus('Processing notes...', 'Transforming captured knowledge into insights');
        
        // Get any additional notes from text area
        const additionalNotes = elements.notesArea.value.trim();
        
        const bakeData = {
            includeAdditionalNotes: !!additionalNotes,
            additionalNotes: additionalNotes,
            timestamp: new Date().toISOString(),
            source: 'popup'
        };

        // Send bake request to background
        const response = await chrome.runtime.sendMessage({ 
            action: 'triggerBake', 
            data: bakeData 
        });
        
        if (response && !response.error) {
            updateStatus('Bake request sent!');
            showBakeStatus('Baking in progress...', 'Your knowledge is being processed');
            
            // Clear the text area if we included additional notes
            if (additionalNotes) {
                elements.notesArea.value = '';
                updateCharCount();
            }
        } else {
            throw new Error(response?.error || 'Bake request failed');
        }
        
    } catch (error) {
        console.error('Error during bake:', error);
        updateStatus('Bake failed!');
        hideBakeStatus();
    } finally {
        // Re-enable bake button
        elements.bakeBtn.disabled = false;
        elements.bakeBtn.textContent = '🧠 Bake Notes';
    }
}

/**
 * Clear all notes
 */
async function clearNotes() {
    if (confirm('Clear all notes? This cannot be undone.')) {
        try {
            updateStatus('Clearing notes...');

            // clear notes from server
            const response = await fetch(API_BASE_URL + '/notes', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Server clear result:', result);

            // clear local Chrome storage
            const storageResult = await chrome.storage.local.get(null);
            const noteKeys = Object.keys(storageResult).filter(key => 
                key.startsWith('note_') || key.startsWith('local_') || key.startsWith('manual_')
            );
            
            if (noteKeys.length > 0) {
                await chrome.storage.local.remove(noteKeys);
                console.log(`Cleared ${noteKeys.length} notes from local storage:`, noteKeys);
            }

            if (elements.notesArea) {
                elements.notesArea.value = '';
                updateCharCount();
            }

            currentSessionData.notes = [];
            currentSessionData.totalCaptured = 0;
            await loadRecentNotes();
            updateSessionStatusDisplay();

            try {
                await chrome.runtime.sendMessage({ action: 'clearBatch' });
            } catch (bgError) {
                console.warn('Could not clear background batch:', bgError);
            }
            updateStatus('All notes cleared successfully');

        } catch (error) {
            console.error('Error clearing notes:', error);
            updateStatus('Error clearing notes' +  error.message);
        }
    }
}

/**
 * Download notes as text file
 */
async function downloadNotes() {
    try {
        let content = '';
        
        // Add current text area content
        const currentNotes = elements.notesArea.value.trim();
        if (currentNotes) {
            content += `=== Current Notes ===\n${currentNotes}\n\n`;
        }
        
        // Add saved notes
        if (currentSessionData.notes.length > 0) {
            content += '=== Saved Notes ===\n';
            currentSessionData.notes.forEach((note, index) => {
                content += `\n--- Note ${index + 1} (${note.intent || 'learn'}) ---\n`;
                content += `${note.content}\n`;
                content += `Source: ${note.title || 'Unknown'}\n`;
                content += `URL: ${note.source_url || 'Unknown'}\n`;
                content += `Date: ${new Date(note.timestamp || 0).toLocaleString()}\n`;
            });
        }
        
        if (!content.trim()) {
            updateStatus('No notes to download');
            return;
        }
        
        // Create and download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-notes-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('Notes downloaded!');
        
    } catch (error) {
        console.error('Error downloading notes:', error);
        updateStatus('Download failed!');
    }
}

/**
 * Process pending batch manually
 */
async function processPendingBatch() {
    try {
        updateStatus('Processing pending notes...');
        
        const response = await chrome.runtime.sendMessage({ action: 'processPendingBatch' });
        
        if (response && !response.error) {
            updateStatus('Batch processed!');
            // Reload status after processing
            await loadBatchStatus();
            updateSessionStatusDisplay();
        } else {
            throw new Error(response?.error || 'Processing failed');
        }
        
    } catch (error) {
        console.error('Error processing batch:', error);
        updateStatus('Processing failed!');
    }
}

async function handleBakeNotes() {
    try {
        console.log('🔥 Bake button clicked');
        
        // Disable button and show processing state
        elements.bakeBtn.disabled = true;
        elements.bakeBtn.innerHTML = `
            <div class="bake-content">
                <span>🔄 Baking...</span>
                <div class="bake-subtitle">Processing your knowledge</div>
            </div>
        `;
        
        // Get additional notes if any
        const additionalNotes = elements.notesArea ? elements.notesArea.value.trim() : '';
        const includeAdditionalNotes = additionalNotes.length > 0;
        
        console.log('Sending bake request with:', { 
            hasAdditionalNotes: !!additionalNotes, 
            includeAdditionalNotes 
        });
        
        // Send bake request to background script
        const response = await chrome.runtime.sendMessage({
            action: 'triggerBake',
            additionalNotes: additionalNotes,
            includeAdditionalNotes: includeAdditionalNotes
        });
        
        console.log('Bake response:', response);
        
        if (response && response.success) {
            // Show success state
            elements.bakeBtn.innerHTML = `
                <div class="bake-content">
                    <span>✅ Baking Started!</span>
                    <div class="bake-subtitle">Processing ${response.data?.notes_count || 'your'} notes</div>
                </div>
            `;
            
            // Clear additional notes if they were included
            if (includeAdditionalNotes && elements.notesArea) {
                elements.notesArea.value = '';
                updateCharCount();
            }
            
            updateStatus(`Baking initiated! Processing ${response.data?.notes_count || ''} notes.`);
            
            // Reset button after delay
            setTimeout(() => {
                resetBakeButton();
            }, 3000);
            
        } else {
            throw new Error(response?.error || 'Baking failed');
        }
        
    } catch (error) {
        console.error('Error in bake process:', error);
        
        // Show error state
        elements.bakeBtn.innerHTML = `
            <div class="bake-content">
                <span>❌ Bake Failed</span>
                <div class="bake-subtitle">Click to retry</div>
            </div>
        `;
        
        updateStatus('Baking failed. Please try again.');
        
        // Reset button after delay
        setTimeout(() => {
            resetBakeButton();
        }, 3000);
    }
}

async function checkServerConnection() {
    try {
        const serverStatus = await chrome.runtime.sendMessage({
            action: 'getServerStatus'
        });
        
        if (serverStatus) {
            console.log('Server status:', serverStatus);
            if (currentSessionData.batchStatus) {
                currentSessionData.batchStatus.serverConnected = true;
            }
        } else {
            console.log('Server not available');
            if (currentSessionData.batchStatus) {
                currentSessionData.batchStatus.serverConnected = false;
            }
        }
        
        updateSessionStatusDisplay();
        
    } catch (error) {
        console.error('Error checking server connection:', error);
    }
}

/**
 * Display notes in the notes list
 */
function displayNotes(notes) {
    console.log('Displaying notes:', notes);

    if (!elements.notesList) {
        console.error('Notes list element not found');
        return;
    }
    
    elements.notesList.innerHTML = '';
    
    if (!notes || notes.length === 0) {
        console.log('No notes to display');
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'empty-state';
        emptyMessage.textContent = 'No notes captured yet. Select text on any webpage and right-click "Smart Notes"';
        elements.notesList.appendChild(emptyMessage);
        return;
    }

    const notesToShow = notes.slice(0, 10);
    console.log(`Displaying ${notesToShow.length} out of ${notes.length} notes`);
    
    notesToShow.forEach((note, index) => { 
        try {
            // Show only recent 10 notes
            const li = document.createElement('li');
            
            const content = note.content || 'No content';
            const tag = note.intent || 'learn';
            const domain = new URL(note.source_url || 'https://unknown').hostname;
            const formattedTime = new Date(note.timestamp).toLocaleString();
            const wordCount = content.trim().split(/\s+/).length;

            li.innerHTML = `
                ${content.length > 150 ? content.substring(0, 150) + '...' : content}
                <span class="note-type">${tag}</span>
                <div class="note-metadata">
                    <strong>Source:</strong> ${note.title || domain}<br>
                    <strong>Captured:</strong> ${formattedTime}<br>
                    <strong>Words:</strong> ${wordCount}
                </div>
            `;
            
            elements.notesList.appendChild(li);
            console.log(`Added note ${index + 1}:`, { content: content.substring(0, 50), tag, domain });
        } catch (error) {
            console.error('Error displaying note:', note, error);
        }
    });
}

/**
 * Show bake status
 */
function showBakeStatus(title, subtitle) {
    if (elements.bakeStatus) {
        elements.bakeStatus.style.display = 'block';
        const titleElement = elements.bakeStatus.querySelector('.status-title');
        const subtitleElement = elements.bakeStatus.querySelector('.status-subtitle');
        
        if (titleElement) titleElement.textContent = title;
        if (subtitleElement) subtitleElement.textContent = subtitle;
    }
}

/**
 * Hide bake status
 */
function hideBakeStatus() {
    if (elements.bakeStatus) {
        elements.bakeStatus.style.display = 'none';
    }
}

/**
 * Update character count display
 */
function updateCharCount() {
    if (!elements.notesArea || !elements.charCounter) return;
    
    const count = elements.notesArea.value.length;
    const maxChars = CHUNK_SIZE * MAX_CHUNKS;
    const formattedCount = count.toLocaleString();
    const formattedMax = maxChars.toLocaleString();
    
    elements.charCounter.textContent = `${formattedCount} / ${formattedMax} characters`;
    
    // Update color based on usage
    if (count > maxChars) {
        elements.charCounter.style.color = '#d93025';
    } else if (count > maxChars * 0.9) {
        elements.charCounter.style.color = '#e37400';
    } else {
        elements.charCounter.style.color = '#5f6368';
    }
}

/**
 * Update status message
 */
function updateStatus(message) {
    if (elements.status) {
        elements.status.textContent = message;
        
        // Clear status after 3 seconds
        setTimeout(() => {
            if (elements.status && elements.status.textContent === message) {
                elements.status.textContent = currentSessionData.serverConnected ? 'Ready' : 'Offline';
            }
        }, 3000);
    }
    
    console.log('Status:', message);
}

function resetBakeButton() {
    if (elements.bakeBtn) {
        elements.bakeBtn.disabled = false;
        elements.bakeBtn.innerHTML = `
            <div class="bake-content">
                <span>🧠 Bake Notes</span>
                <div class="bake-subtitle">Transform into knowledge</div>
            </div>
        `;
    }
}

/**
 * Refresh popup data
 */
async function refreshData() {
    try {
        await loadBatchStatus();
        await loadRecentNotes();
        updateSessionStatusDisplay();
    } catch (error) {
        console.error('Error refreshing data:', error);
    }
}

async function forceBatchProcess() {
    try {
        console.log('🔧 Forcing batch process...');
        
        const response = await chrome.runtime.sendMessage({
            action: 'forceBatchProcess'
        });
        
        console.log('Force batch response:', response);
        
        if (response && response.success) {
            updateStatus('Batch processed successfully!');
        } else {
            updateStatus('Batch processing failed.');
        }
        
        // Refresh status
        await loadBatchStatus();
        
    } catch (error) {
        console.error('Error forcing batch process:', error);
        updateStatus('Error in batch processing.');
    }
}

// Auto-refresh data every 30 seconds
setInterval(refreshData, 30000);

window.debugBaking = {
    forceBatch: forceBatchProcess,
    checkServer: checkServerConnection,
    bakeNotes: handleBakeNotes
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializePopup,
        saveNotes,
        handleBake,
        updateCharCount,
        updateStatus
    };
}