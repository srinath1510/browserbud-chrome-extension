import { BatchProcessor } from './batch-processor.js';

const BATCH_INTERVAL = 2 * 60 * 1000; // 2 minutes
const MAX_LOCAL_NOTES = 50; // Keep only recent notes locally
const API_BASE_URL = 'http://localhost:8000/api';

let batchProcessor = null;

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
    return new Promise((resolve, reject) => {
        try {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const getContextText = (direction, charLimit) => {
                        try {
                            const selection = window.getSelection();
                            if (selection.rangeCount === 0) return '';
                            
                            const range = selection.getRangeAt(0);
                            
                            const selectedText = selection.toString();
                            const bodyText = document.body.innerText || document.body.textContent || '';
                            const selectionIndex = bodyText.indexOf(selectedText);
                            
                            if (selectionIndex === -1) return '';
                            
                            if (direction === 'before') {
                                const start = Math.max(0, selectionIndex - charLimit);
                                return bodyText.slice(start, selectionIndex);
                            } else {
                                const end = Math.min(bodyText.length, selectionIndex + selectedText.length + charLimit);
                                return bodyText.slice(selectionIndex + selectedText.length, end);
                            }
                        } catch (error) {
                            console.error('Error getting context text:', error);
                            return '';
                        }
                    };

                    const getSelectionPosition = () => {
                        try {
                            const selection = window.getSelection();
                            if (selection.rangeCount === 0) return { start: 0, end: 0 };
                        
                            const selectedText = selection.toString();
                            const bodyText = document.body.innerText || document.body.textContent || '';
                            const start = bodyText.indexOf(selectedText);
                            
                            if (start === -1) return { start: 0, end: 0 };
                            
                            return { start, end };
                        } catch (error) {
                            console.error('Error getting selection position:', error);
                            return { start: 0, end: 0 };
                        }
                    };

                    const getRelativePagePosition = () => {
                        const selection = window.getSelection();
                        if (selection.rangeCount === 0) return 0;
                        
                        try {
                            const range = selection.getRangeAt(0);
                            const rect = range.getBoundingClientRect();
                            const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
                            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                            const selectionTop = currentScroll + rect.top;
                        
                            return Math.min(1, Math.max(0, selectionTop / documentHeight));
                        } catch (error) {
                            console.error('Error getting relative page position:', error);
                            return 0;
                        }
                    };

                    const extractHeadingHierarchy = () => {
                        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
                        return Array.from(headings).map(h => ({
                            level: parseInt(h.tagName.charAt(1)),
                            text: h.textContent.trim().substring(0, 100),
                            id: h.id || null
                        }));
                    };

                    const classifyContentCategory = () => {
                        const title = document.title.toLowerCase();
                        const content = document.body.textContent.toLowerCase();
                        
                        // Simple classification based on keywords
                        if (title.includes('tutorial') || content.includes('step by step')) return 'tutorial';
                        if (title.includes('documentation') || title.includes('docs')) return 'documentation';
                        if (title.includes('research') || title.includes('study')) return 'research';
                        if (title.includes('news') || title.includes('breaking')) return 'news';
                        if (document.querySelector('pre, code')) return 'technical';
                        
                        return 'general';
                    };

                    const estimateKnowledgeLevel = () => {
                        const content = document.body.textContent;
                        const technicalTerms = (content.match(/\b(algorithm|implementation|architecture|optimization|configuration|framework|library|database|server|client|API|protocol|encryption|authentication|authorization)\b/gi) || []).length;
                        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
                        const avgSentenceLength = sentences.length > 0 ? content.length / sentences.length : 0;
                        
                        if (technicalTerms > 10 && avgSentenceLength > 100) return 'advanced';
                        if (technicalTerms > 3 || avgSentenceLength > 80) return 'intermediate';
                        return 'beginner';
                    };

                    // Extract comprehensive metadata
                    const selectedText = window.getSelection().toString();
                    const selectionPosition = getSelectionPosition();
                    const bodyText = document.body.innerText || document.body.textContent || '';
                    const pageWordCount = bodyText.trim().split(/\s+/).filter(word => word.length > 0).length;

                    
                    const metadata = {
                        // ==================== CORE IDENTIFICATION ====================
                        capture_id: `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: new Date().toISOString(),
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        
                        // ==================== ENHANCED PAGE METADATA ====================
                        url: window.location.href,
                        title: document.title,
                        domain: window.location.hostname,
                        language: document.documentElement.lang || navigator.language,
                        contentType: document.contentType || 'text/html',

                        // ==================== CONTENT ANALYSIS ====================
                        // Selection Details
                        selected_text: selectedText,
                        wordCount: selectedText.trim().split(/\s+/).filter(word => word.length > 0).length,
                        selection_length: selectedText.length,
                        
                        // Context
                        context_before: getContextText('before', 100),
                        context_after: getContextText('after', 100),
                        
                        // Position
                        selection_start_offset: selectionPosition.start,
                        selection_end_offset: selectionPosition.end,
                        relative_position: getRelativePagePosition(),
                        
                        // Page Structure
                        full_page_word_count: pageWordCount,
                        heading_hierarchy: extractHeadingHierarchy(),
                        linkCount: document.querySelectorAll('a').length,
                        list_items_count: document.querySelectorAll('li').length,
                        table_count: document.querySelectorAll('table').length,
                        image_count: document.querySelectorAll('img').length,
                        video_count: document.querySelectorAll('video').length,
                        
                        // Content Type Indicators
                        has_code: document.querySelector('pre, code, .highlight, .hljs') !== null,
                        has_math: document.querySelector('math, .math, .katex, .MathJax') !== null,
                        has_data_tables: document.querySelectorAll('table[data-*], .data-table').length > 0,
                        
                        // Links
                        external_links: document.querySelectorAll('a[href^="http"]').length,
                        internal_links: document.querySelectorAll('a[href^="/"], a[href^="#"]').length,
                        citations: document.querySelectorAll('[class*="citation"], [class*="reference"], sup').length,

                        // ==================== USER BEHAVIOR ====================
                        time_on_page: performance.timing ? (Date.now() - performance.timing.loadEventStart) : 0,
                        scroll_depth_at_selection: Math.round((window.pageYOffset / Math.max(document.body.scrollHeight - window.innerHeight, 1)) * 100),
                        viewport_size: `${window.innerWidth}x${window.innerHeight}`,

                        // ==================== CONTENT CLASSIFICATION ====================
                        content_category: classifyContentCategory(),
                        knowledge_level: estimateKnowledgeLevel(),
                        primary_domain: window.location.hostname.split('.').slice(-2).join('.'), // rough domain classification

                        // ==================== TECHNICAL METADATA ====================
                        browser: navigator.userAgent,
                        capture_trigger: 'context_menu'
                    };

                    console.log('Enhanced Metadata Extracted:', metadata);
                    return metadata;
                }
            }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    const enhancedMetadata = result && result.length > 0 && result[0].result ? result[0].result : {};
                    resolve(enhancedMetadata);
                }
            });
        } catch (error) {
            console.error('Error in extractPageMetadata:', error);
            reject(error);
        }
    });
};

/**
 * Handle context menu click
 */
const onClicked = (info, tab) => {
    console.log('Context menu item clicked:', info);
    
    if (!info.selectionText) {
        console.log('No text selected, skipping save.');
        return;
    }

    extractPageMetadata(tab)
    .then(pageMetadata => {
        const note = createNoteFromSelection(info, tab, pageMetadata);
        console.log('Saving Note for Batch Processing:', note);
            
        
        // Add to batch processor
        if (batchProcessor) {
            batchProcessor.addNote(note);
        } else {
            console.error('Batch processor not initialized');
        }
    })
    .catch(error => {
        console.error('Error extracting page metadata:', error);
        
        // Create fallback note
        const fallbackNote = createFallbackNote(info, tab);
        
        if (batchProcessor) {
            batchProcessor.addNote(fallbackNote);
        } else {
            console.error('Batch processor not initialized');
        }
    });
};

/**
 * Create a note object from selection and metadata
 */
function createNoteFromSelection(info, tab, pageMetadata) {
    return {
        content: info.selectionText,
        type: 'selection',
        source: {
            url: tab.url,
            title: tab.title,
            timestamp: new Date().toISOString()
        },
        metadata: {
            // Core identification
            capture_id: pageMetadata.capture_id || `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: pageMetadata.timestamp || new Date().toISOString(),
            timezone: pageMetadata.timezone || 'unknown',
            annotationTimestamp: new Date().toISOString(),
            
            // Page context
            url: pageMetadata.url || tab.url,
            title: pageMetadata.title || tab.title,
            pageTitle: pageMetadata.title || tab.title,
            domain: pageMetadata.domain || new URL(tab.url).hostname,
            language: pageMetadata.language || 'unknown',
            contentType: pageMetadata.contentType || 'text/html',
            
            // Selection details
            selected_text: pageMetadata.selected_text || info.selectionText,
            wordCount: pageMetadata.wordCount || info.selectionText.trim().split(/\s+/).filter(word => word.length > 0).length,
            selection_length: pageMetadata.selection_length || info.selectionText.length,
            selectionLength: info.selectionText.length,
            context_before: pageMetadata.context_before || '',
            context_after: pageMetadata.context_after || '',
            selection_start_offset: pageMetadata.selection_start_offset || 0,
            selection_end_offset: pageMetadata.selection_end_offset || 0,
            relative_position: pageMetadata.relative_position || 0,
            
            // Page structure
            full_page_word_count: pageMetadata.full_page_word_count || 0,
            heading_hierarchy: pageMetadata.heading_hierarchy || [],
            linkCount: pageMetadata.linkCount || 0,
            list_items_count: pageMetadata.list_items_count || 0,
            table_count: pageMetadata.table_count || 0,
            image_count: pageMetadata.image_count || 0,
            video_count: pageMetadata.video_count || 0,
            
            // Content type indicators
            has_code: pageMetadata.has_code || false,
            has_math: pageMetadata.has_math || false,
            has_data_tables: pageMetadata.has_data_tables || false,
            external_links: pageMetadata.external_links || 0,
            internal_links: pageMetadata.internal_links || 0,
            citations: pageMetadata.citations || 0,
            
            // User behavior
            time_on_page: pageMetadata.time_on_page || 0,
            scroll_depth_at_selection: pageMetadata.scroll_depth_at_selection || 0,
            viewport_size: pageMetadata.viewport_size || 'unknown',
            
            // Classification
            content_category: pageMetadata.content_category || 'general',
            knowledge_level: pageMetadata.knowledge_level || 'unknown',
            primary_domain: pageMetadata.primary_domain || '',
            
            // Technical
            browser: pageMetadata.browser || navigator.userAgent,
            capture_trigger: pageMetadata.capture_trigger || 'context_menu',
            intent: 'contextMenuCapture',

            // Batch processing
            batch_pending: true,
            local_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        },
        tag: 'Context Menu'
    };
}

/**
 * Create a fallback note when metadata extraction fails
 */
function createFallbackNote(info, tab) {
    return {
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
            wordCount: info.selectionText.trim().split(/\s+/).filter(word => word.length > 0).length,
            pageTitle: tab.title,
            domain: new URL(tab.url).hostname,
            batch_pending: true,
            local_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
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

