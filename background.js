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
                pageTitle: pageMetadata.title || tab.title, // Add this for popup compatibility
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
                viewport_size: pageMetadata.viewport_size || `${screen.width}x${screen.height}`,
                
                // Classification
                content_category: pageMetadata.content_category || 'general',
                knowledge_level: pageMetadata.knowledge_level || 'unknown',
                primary_domain: pageMetadata.primary_domain || '',
                
                // Technical
                browser: pageMetadata.browser || navigator.userAgent,
                capture_trigger: pageMetadata.capture_trigger || 'context_menu',
                intent: 'contextMenuCapture'
            },
            tag: 'Context Menu'
        };
        
        console.log('Saving Enhanced Note:', note);
        saveNoteToStorage(note);
    })
    .catch(error => {
        console.error('Error extracting page metadata:', error);
        
        // Fallback to note creation without metadata
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
                error: 'Metadata extraction failed',
                annotationTimestamp: new Date().toISOString(),
                selectionLength: info.selectionText.length,
                intent: 'contextMenuCapture',
                wordCount: info.selectionText.trim().split(/\s+/).filter(word => word.length > 0).length,
                pageTitle: tab.title,
                domain: new URL(tab.url).hostname
            }
        };

        saveNoteToStorage(note);
    });
};

function saveNoteToStorage(note) {
        return new Promise((resolve, reject) => {
        const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        note.id = noteId;
        note.tag = note.type === 'selection' ? 'Context Menu' : 'Manual Entry';
        console.log('Note size in bytes:', JSON.stringify(note).length);

        chrome.storage.sync.get(null, (result) => {
            console.log('Existing notes:', result);
            try {
                const notesToSave = {
                    [noteId]: note 
                };

                Object.keys(result).forEach(key => {
                    if (key.startsWith('note_')) {
                        notesToSave[key] = result[key];
                    }
                });
                chrome.storage.sync.set(notesToSave, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving note:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log('Note saved successfully!');
                        resolve(noteId);
                    }
                });
            } catch (error) {
                console.error('Error saving note:', error);
                reject(error);
            }
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

