/**
 * BatchProcessor - Handles automatic batching and processing of notes
 */
class BatchProcessor {
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:8000/api';
        this.batchInterval = options.batchInterval || 2 * 60 * 1000; // 2 minutes
        this.maxLocalNotes = options.maxLocalNotes || 50;
        this.maxBatchSize = options.maxBatchSize || 10;

        this.maxRetries = 3;
        this.retryDelay = 1000; // ms
        this.lastHealthCheck = null;
        
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
                batch_id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                notes: this.pendingNotes,
                timestamp: new Date().toISOString(),
                batch_size: this.pendingNotes.length,
                processing_mode: 'async_batch'
            };
            
            // Send to server
            const response = await this.sendBatchWithRetry(batchPayload);
        
            if (response.success) {
                console.log('Batch processed successfully:', response.data);
                await this.clearProcessedNotesFromLocal(this.pendingNotes);

                this.pendingNotes = [];
                this.lastBatchTime = new Date().toISOString();
                this.serverConnected = true;

                this.updateBadge('✓', '#4CAF50');
                setTimeout(() => this.updateBadge('', ''), 3000);

            } else {
                throw new Error(response.error || 'Batch upload failed');
            }
            
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

    async sendBatchWithRetry(batchData, attempt = 1) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/notes/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(batchData),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });
    
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorData}`);
            }
    
            const responseData = await response.json();
            return { success: true, data: responseData };
    
        } catch (error) {
            console.error(`Batch send attempt ${attempt} failed:`, error.message);
    
            if (attempt < this.maxRetries) {
                console.log(`Retrying in ${this.retryDelay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendBatchWithRetry(batchData, attempt + 1);
            } else {
                return { success: false, error: error.message };
            }
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
                timestamp: new Date().toISOString(),
                source: 'extension',
                trigger_source: 'user_action',
                includeAdditionalNotes: bakeData.includeAdditionalNotes || false,
                additionalNotes: bakeData.additionalNotes || '',
                ...bakeData
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
                const errorData = await response.text();
                throw new Error(`Bake request failed: ${response.status} - ${errorData}`);
            }
            
            const result = await response.json();
            console.log('Bake request processed:', result);
            
            // Update badge to show baking in progress
            this.updateBadge('🔥', '#FF5722');
            return { success: true, data: result };
            
        } catch (error) {
            console.error('Bake request failed:', error);
            this.updateBadge('!', '#F44336');
            return { success: false, error: error.message };
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
            maxBatchSize: this.maxBatchSize,
            lastHealthCheck: this.lastHealthCheck,
            apiUrl: this.apiBaseUrl,
            retryCount: this.maxRetries
        };
    }

    /**
     * Save note to local storage temporarily
     * @param {Object} note - Note to save
     */
    saveNoteToLocalStorage(note) {
        const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        note.id = noteId;
        note.stored_at = new Date().toISOString();
        note.sync_status = 'pending';
        
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

    async triggerBake(additionalNotes = '', includeAdditionalNotes = false) {
        const bakeData = {
            additionalNotes,
            includeAdditionalNotes
        };
        return await this.handleBakeRequest(bakeData);
    }

    async getServerStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`Server status check failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to get server status:', error);
            return null;
        }
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
     * Check Flask server connectivity
     */
    async checkConnectivity() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const healthData = await response.json();
                console.log('✅ Flask API server is healthy:', healthData);
                this.serverConnected = true;
                this.lastHealthCheck = new Date().toISOString();
                
                // Clear warning badge if no pending notes
                if (this.pendingNotes.length === 0) {
                    this.updateBadge('', '');
                }
            } else {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.warn('❌ Flask API server not available:', error.message);
            this.serverConnected = false;
            this.lastHealthCheck = new Date().toISOString();
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
if (typeof window !== 'undefined') {
    window.BatchProcessor = BatchProcessor;
}