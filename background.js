import { BatchProcessor } from './batch-processor.js';

const BATCH_INTERVAL = 2 * 60 * 1000; // 2 minutes
const MAX_LOCAL_NOTES = 50; // Keep only recent notes locally
const API_BASE_URL = 'http://localhost:8000/api';

let batchProcessor = null;

// Get consistent user ID
function getUserId() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['user_id'], (result) => {
            if (result.user_id) {
                resolve(result.user_id);
            } else {
                const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                chrome.storage.local.set({ user_id: newUserId });
                resolve(newUserId);
            }
        });
    });
}

/**
 * Handle extension installation
 */
const onInstalled = () => {
    console.log('Context menu created');
    chrome.contextMenus.create({
        id: "smartNotes",
        title: "Smart Notes",
        contexts: ["selection"]
    });

    initializeBatchProcessor();
    console.log('Extension setup complete');

};

/**
 * Handle extension startup (browser restart)
 */
const onStartup = () => {
    console.log('Smart Notes extension startup');
    initializeBatchProcessor();
};


const extractPageMetadata = (tab) => {
    return new Promise((resolve) => {
        resolve({
            url: tab.url,
            title: tab.title,
            timestamp: new Date().toISOString()
        });
    });
};

/**
 * Handle context menu click
 */
const onClicked = async (info, tab) => {
    console.log('Context menu item clicked:', info);
    
    if (!info.selectionText) {
        console.log('No text selected, skipping save.');
        return;
    }

    const note = createNoteFromSelection(info, tab);
    console.log('Saving Note for Batch Processing:', note);
    
    if (batchProcessor) {
        batchProcessor.addNote(note);
    } else {
        console.error('Batch processor not initialized');
    }
};

/**
 * Create a note object from selection and metadata
 */
async function createNoteFromSelection(info, tab) {
    const userId = await getUserId();
    return {
        content: info.selectionText,
        user_id: userId,
        source_url: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString(),
        intent: "learn",
        user_note: ""
    };
}

/**
 * Create a fallback note when metadata extraction fails
 */
async function createFallbackNote(info, tab) {
    const userId = await getUserId();
    return {
        content: info.selectionText,
        user_id: userId,
        source_url: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString(),
        intent: "learn",
        user_note: ""
    };
}

/**
 * Initialize the batch processor
 */
function initializeBatchProcessor() {
    console.log('Initializing batch processor...');
    
    try {
        // Create new batch processor instance
        batchProcessor = new BatchProcessor({
            apiBaseUrl: API_BASE_URL,
            batchInterval: BATCH_INTERVAL,
            maxLocalNotes: MAX_LOCAL_NOTES,
            maxBatchSize: 10
        });
        
        // Start the processor
        batchProcessor.start();
        
        console.log('Batch processor initialized and started successfully');
    } catch (error) {
        console.error('Failed to initialize batch processor:', error);
    }
}

/**
 * Handle messages from popup and other extension parts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (!batchProcessor) {
        console.error('Batch processor not initialized');
        sendResponse({ error: 'Batch processor not initialized' });
        return;
    }

    switch (request.action) {
        case 'processPendingBatch':
            console.log('Processing pending batch on demand');
            batchProcessor.processBatch()
                .then(() => sendResponse({ status: 'processing' }))
                .catch(error => sendResponse({ error: error.message }));
            return true; // Keep message channel open for async response
            
        case 'getBatchStatus':
            console.log('Getting batch status');
            const status = batchProcessor.getStatus();
            sendResponse(status);
            break;
            
        case 'triggerBake':
            console.log('Triggering bake process from popup');
            (async () => {
                try {
                    const result = await batchProcessor.triggerBake(
                        request.additionalNotes || '',
                        request.includeAdditionalNotes || false
                    );
                    sendResponse(result);
                } catch (error) {
                    console.error('Error in bake process:', error);
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                }
            })();
            return true; // Keep message channel open for async response
            
        case 'addNote':
            console.log('Adding note via message');
            batchProcessor.addNote(request.note);
            sendResponse({ status: 'added' });
            break;
            
        case 'forceBatchProcess':
            console.log('Force processing batch');
            batchProcessor.forceBatch()
                .then((result) => sendResponse({ 
                    success: true, 
                    status: 'processed',
                    result: result 
                }))
                .catch(error => sendResponse({ 
                    success: false,
                    error: error.message 
                }));
            return true; // Keep message channel open for async response
            
        case 'getStatistics':
            console.log('Getting batch statistics');
            const stats = batchProcessor.getStatistics();
            sendResponse(stats);
            break;
            
        case 'resetBatchProcessor':
            console.log('Resetting batch processor');
            batchProcessor.reset();
            sendResponse({ status: 'reset' });
            break;
        
        case 'getServerStatus':
            console.log('Getting Flask API server status');
        
            (async () => {
                try {
                    const serverStatus = await batchProcessor.getServerStatus();
                    sendResponse(serverStatus);
                } catch (error) {
                    console.error('Error getting server status:', error);
                    sendResponse(null);
                }
            })();
            return true;
        
        case 'checkConnectivity':
            console.log('Checking Flask API server connectivity');
            
            (async () => {
                try {
                    await batchProcessor.checkConnectivity();
                    const status = batchProcessor.getStatus();
                    sendResponse({ 
                        success: true, 
                        connected: status.serverConnected,
                        lastHealthCheck: status.lastHealthCheck 
                    });
                } catch (error) {
                    console.error('Error checking connectivity:', error);
                    sendResponse({ 
                        success: false, 
                        connected: false,
                        error: error.message 
                    });
                }
            })();
            return true;
        
        case 'getPendingCount':
            console.log('Getting pending notes count');
            const pendingStatus = batchProcessor.getStatus();
            sendResponse({ 
                pendingCount: pendingStatus.pendingCount,
                serverConnected: pendingStatus.serverConnected 
            });
            break;

        case 'triggerBakeWithData':
            console.log('Triggering bake with specific data');
            
            (async () => {
                try {
                    const result = await batchProcessor.handleBakeRequest(request.bakeData);
                    sendResponse(result);
                } catch (error) {
                    console.error('Error in bake with data:', error);
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                }
            })();
            
            return true;
            
        default:
            console.warn('Unknown action:', request.action);
            sendResponse({ 
                error: 'Unknown action: ' + request.action,
                availableActions: [
                    'processPendingBatch',
                    'getBatchStatus', 
                    'triggerBake',
                    'addNote',
                    'forceBatchProcess',
                    'getStatistics',
                    'resetBatchProcessor',
                    'getServerStatus',
                    'checkConnectivity',
                    'getPendingCount',
                    'triggerBakeWithData'
                ] 
            });
    }
});

/**
 * Handle extension lifecycle events
 */
chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onStartup.addListener(onStartup);
chrome.contextMenus.onClicked.addListener(onClicked);

/**
 * Handle extension suspension (cleanup)
 */
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension suspending - cleaning up batch processor');
    if (batchProcessor) {
        batchProcessor.stop();
    }
});


/**
 * Export for testing
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onInstalled,
        onClicked,
        extractPageMetadata,
        initializeBatchProcessor,
        createNoteFromSelection,
        createFallbackNote    
    };
}

