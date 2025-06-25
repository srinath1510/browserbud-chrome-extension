/**
 * BatchProcessor - Handles automatic batching and processing of notes
 */
class BatchProcessor {
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:8000/api';
        this.batchInterval = options.batchInterval || 2 * 60 * 1000; // 2 minutes
        this.maxLocalNotes = options.maxLocalNotes || 50;
        this.maxBatchSize = options.maxBatchSize || 10;
        
        // Internal state
        this.pendingNotes = [];
        this.batchTimer = null;
        this.lastBatchTime = null;
        this.isProcessing = false;
        this.serverConnected = false;
        
        // Bind methods to preserve context
        this.processBatch = this.processBatch.bind(this);
        this.checkConnectivity = this.checkConnectivity.bind(this);
        
        console.log('BatchProcessor initialized with options:', options);
    }

    /**
     * Start the batch processor
     */
    start() {
        console.log('Starting BatchProcessor...');
        
        // Clear any existing timer
        this.stop();
        
        this.batchTimer = setInterval(this.processBatch, this.batchInterval);
        
        this.checkConnectivity();
        
        // Process any pending notes after a delay
        setTimeout(this.processBatch, 5000);
        
        // periodic connectivity checks every 5 minutes
        this.connectivityTimer = setInterval(this.checkConnectivity, 5 * 60 * 1000);
        
        console.log('BatchProcessor started successfully');
    }

    /**
     * Stop the batch processor
     */
    stop() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        
        if (this.connectivityTimer) {
            clearInterval(this.connectivityTimer);
            this.connectivityTimer = null;
        }
        
        console.log('BatchProcessor stopped');
    }

    /**
     * Add a note to the pending batch
     * @param {Object} note - The note to add
     */
    addNote(note) {
        console.log('Adding note to batch:', note.content.substring(0, 50) + '...');
        
        // Add to pending batch
        this.pendingNotes.push(note);
        
        // Save to local storage temporarily
        this.saveNoteToLocalStorage(note);
        
        // Process immediately if batch is getting large
        if (this.pendingNotes.length >= this.maxBatchSize) {
            console.log('Batch size limit reached, processing immediately');
            this.processBatch();
        }
        
        console.log(`Note added to batch. Current batch size: ${this.pendingNotes.length}`);
        
        // Update badge to show pending notes
        this.updateBadge(this.pendingNotes.length.toString(), '#FF9800');
    }

    /**
     * Process the current batch of notes
     */
    async processBatch() {
        if (this.pendingNotes.length === 0) {
            console.log('No pending notes to process');
            return;
        }
        
        if (this.isProcessing) {
            console.log('Batch processing already in progress, skipping');
            return;
        }
        
        this.isProcessing = true;
        console.log(`Processing batch of ${this.pendingNotes.length} notes...`);
        
        try {
            // Create batch payload
            const batchPayload = {
                notes: this.pendingNotes,
                batch_id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                batch_size: this.pendingNotes.length,
                processing_mode: 'async_batch'
            };
            
            // Send to server
            const response = await fetch(`${this.apiBaseUrl}/notes/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(batchPayload),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            
            if (!response.ok) {
                throw new Error(`Batch upload failed: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Batch processed successfully:', result);
            
            // Clear processed notes from local storage
            await this.clearProcessedNotesFromLocal(this.pendingNotes);
            
            // Clear pending batch
            this.pendingNotes = [];
            this.lastBatchTime = new Date().toISOString();
            this.serverConnected = true;
            
            // Update badge with success
            this.updateBadge('✓', '#4CAF50');
            setTimeout(() => this.updateBadge('', ''), 3000);
            
        } catch (error) {
            console.error('Batch processing failed:', error);
            this.serverConnected = false;
            
            // Update badge with error
            this.updateBadge('!', '#F44336');
            setTimeout(() => this.updateBadge('⚠', '#FF9800'), 5000);
            
            // Keep notes in pending for retry
            console.log('Notes will be retried in next batch cycle');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Handle bake request from popup
     * @param {Object} bakeData - Bake request data
     */
    async handleBakeRequest(bakeData) {
        console.log('Handling bake request from popup');
        
        try {
            // First, process any pending notes
            if (this.pendingNotes.length > 0) {
                console.log('Processing pending notes before bake...');
                await this.processBatch();
            }
            
            // Send bake request to server
            const bakePayload = {
                ...bakeData,
                trigger_source: 'extension_popup',
                timestamp: new Date().toISOString()
            };
            
            const response = await fetch(`${this.apiBaseUrl}/bake`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bakePayload),
                signal: AbortSignal.timeout(300000) // 5 minute timeout
            });
            
            if (!response.ok) {
                throw new Error(`Bake request failed: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Bake request processed:', result);
            
            // Update badge to show baking in progress
            this.updateBadge('🔥', '#FF5722');
            
        } catch (error) {
            console.error('Bake request failed:', error);
            this.updateBadge('!', '#F44336');
        }
    }

    /**
     * Get current batch status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            pendingCount: this.pendingNotes.length,
            lastBatchTime: this.lastBatchTime,
            batchInterval: this.batchInterval / 1000 / 60, // minutes
            serverConnected: this.serverConnected,
            isProcessing: this.isProcessing,
            maxBatchSize: this.maxBatchSize
        };
    }

    /**
     * Save note to local storage temporarily
     * @param {Object} note - Note to save
     */
    saveNoteToLocalStorage(note) {
        const noteId = note.metadata?.local_id || `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        note.id = noteId;
        
        chrome.storage.local.get(null, (result) => {
            const notesToSave = { [noteId]: note };
            
            // Add existing notes but limit total count
            const existingNotes = Object.keys(result)
                .filter(key => key.startsWith('note_'))
                .map(key => ({ ...result[key], key }))
                .sort((a, b) => new Date(b.source?.timestamp || 0) - new Date(a.source?.timestamp || 0))
                .slice(0, this.maxLocalNotes - 1); // Keep room for new note
            
            existingNotes.forEach(existingNote => {
                notesToSave[existingNote.key] = existingNote;
            });

            chrome.storage.local.set(notesToSave, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving note to local storage:', chrome.runtime.lastError);
                } else {
                    console.log('Note saved to local storage temporarily');
                }
            });
        });
    }

    /**
     * Clear processed notes from local storage
     * @param {Array} processedNotes - Notes that were processed
     */
    async clearProcessedNotesFromLocal(processedNotes) {
        const noteIds = processedNotes.map(note => note.id || note.metadata?.local_id).filter(Boolean);
        
        if (noteIds.length > 0) {
            chrome.storage.local.remove(noteIds, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error clearing processed notes:', chrome.runtime.lastError);
                } else {
                    console.log(`Cleared ${noteIds.length} processed notes from local storage`);
                }
            });
        }
    }

    /**
     * Clean up old notes from local storage
     */
    cleanupLocalStorage() {
        chrome.storage.local.get(null, (result) => {
            const notes = Object.keys(result)
                .filter(key => key.startsWith('note_'))
                .map(key => ({ ...result[key], key }))
                .sort((a, b) => new Date(b.source?.timestamp || 0) - new Date(a.source?.timestamp || 0));
            
            if (notes.length > this.maxLocalNotes) {
                const notesToRemove = notes.slice(this.maxLocalNotes).map(note => note.key);
                chrome.storage.local.remove(notesToRemove, () => {
                    console.log(`Cleaned up ${notesToRemove.length} old notes from local storage`);
                });
            }
        });
    }

    /**
     * Check server connectivity
     */
    async checkConnectivity() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                console.log('Server connectivity confirmed');
                this.serverConnected = true;
                
                // Clear warning badge if no pending notes
                if (this.pendingNotes.length === 0) {
                    this.updateBadge('', '');
                }
            } else {
                throw new Error('Server health check failed');
            }
        } catch (error) {
            console.warn('Server not available:', error);
            this.serverConnected = false;
            this.updateBadge('⚠', '#FF9800');
        }
    }

    /**
     * Update extension badge
     * @param {string} text - Badge text
     * @param {string} color - Badge color
     */
    updateBadge(text, color) {
        if (typeof chrome !== 'undefined' && chrome.action) {
            chrome.action.setBadgeText({ text });
            if (color) {
                chrome.action.setBadgeBackgroundColor({ color });
            }
        }
    }

    /**
     * Get statistics about batch processing
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            pendingNotes: this.pendingNotes.length,
            lastBatchTime: this.lastBatchTime,
            serverConnected: this.serverConnected,
            isProcessing: this.isProcessing,
            batchInterval: this.batchInterval,
            maxBatchSize: this.maxBatchSize,
            maxLocalNotes: this.maxLocalNotes
        };
    }

    /**
     * Force process current batch (for manual sync)
     */
    async forceBatch() {
        console.log('Force processing batch...');
        await this.processBatch();
    }

    /**
     * Reset the batch processor state
     */
    reset() {
        this.pendingNotes = [];
        this.lastBatchTime = null;
        this.isProcessing = false;
        this.updateBadge('', '');
        console.log('BatchProcessor state reset');
    }
}

export { BatchProcessor };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BatchProcessor };
}

if (typeof window !== 'undefined') {
    window.BatchProcessor = BatchProcessor;
}