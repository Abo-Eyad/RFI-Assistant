// Session and User ID management
let sessionId = localStorage.getItem('rfi_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('rfi_session_id', sessionId);
}
const userId = 'subcontractor_user';

// Helper to escape HTML and simple Markdown parsing
function parseMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks: ```code```
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Blockquotes: &gt; quote
    html = html.replace(/^\s*&gt;\s*(.+)$/gm, '<blockquote><p>$1</p></blockquote>');

    // Headers: # Header
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Bullet points: * item or - item
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive list items in <ul>
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Clean up double ul tags that might occur
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Paragraph breaks
    html = html.replace(/\n\n/g, '</p><p>');
    // Simple line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// Append message to Chat
function appendMessage(sender, text, isMarkdown = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    if (isMarkdown) {
        contentDiv.innerHTML = parseMarkdown(text);
    } else {
        const p = document.createElement('p');
        p.textContent = text;
        contentDiv.appendChild(p);
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Save to session storage
    saveChatHistory();
}

// Show Typing Indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const indicatorDiv = document.createElement('div');
    indicatorDiv.id = 'typingIndicator';
    indicatorDiv.classList.add('message', 'agent');
    
    indicatorDiv.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(indicatorDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove Typing Indicator
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Send user message to ADK Server
async function sendToAgent(messageText) {
    showTypingIndicator();
    
    try {
        const response = await fetch('/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                session_id: sessionId,
                new_message: {
                    role: 'user',
                    parts: [{ text: messageText }]
                }
            })
        });

        removeTypingIndicator();

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Network response was not ok');
        }

        const events = await response.json();
        console.log("Received events:", events);

        // Find the final text response from the root_agent
        const finalEvent = [...events].reverse().find(e => 
            e.author === 'root_agent' && 
            e.content && 
            e.content.parts && 
            e.content.parts.some(p => p.text)
        );

        if (finalEvent) {
            const replyText = finalEvent.content.parts.find(p => p.text).text;
            appendMessage('agent', replyText, true);
        } else {
            appendMessage('agent', "I received your request, but did not generate a text response. Please check project specs.", false);
        }

    } catch (error) {
        removeTypingIndicator();
        console.error('Error calling agent:', error);
        appendMessage('agent', `⚠️ Error connecting to server: ${error.message}. Please check if the FastAPI server is running.`, false);
    }
}

// Form Submission
function handleFormSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('userInput');
    const messageText = input.value.trim();
    if (!messageText) return;
    
    appendMessage('user', messageText, false);
    input.value = '';
    
    sendToAgent(messageText);
}

// Chips/Suggestions Click
function sendSuggestion(text) {
    appendMessage('user', text, false);
    sendToAgent(text);
}

// Sidebar Spec Insertion Helper
function insertSpecQuery(type) {
    const input = document.getElementById('userInput');
    if (type === 'cast_in_place_concrete') {
        input.value = "What is the concrete mixture design required for foundation footings?";
    } else if (type === 'structural_steel') {
        input.value = "What is the required erection plumbness tolerance for columns?";
    } else if (type === 'electrical') {
        input.value = "What is the support spacing requirement for EMT conduits?";
    }
    input.focus();
}

// Clear Chat History
function clearConversation() {
    if (confirm("Are you sure you want to clear your chat history?")) {
        // Regenerate session id
        sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('rfi_session_id', sessionId);
        
        // Reset HTML
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = `
            <div class="message system">
                <div class="message-content">
                    <h3>Chat Cleared. New Session Initialized.</h3>
                    <p>I have secure, sandboxed access to the project's concrete, structural steel, and electrical specifications. Ask me any question, and I will search the specifications to provide a precise response with citations.</p>
                    <div class="suggestion-chips">
                        <button class="chip" onclick="sendSuggestion('What is the minimum compressive strength for foundation footings?')">What is the concrete strength for footings?</button>
                        <button class="chip" onclick="sendSuggestion('What are the temperature limits for placing concrete in cold weather?')">What are the cold weather concrete rules?</button>
                        <button class="chip" onclick="sendSuggestion('What is the minimum conductor size for branch circuits?')">Minimum conductor size for wiring?</button>
                        <button class="chip" onclick="sendSuggestion('What is the erection tolerance for structural columns?')">What is column erection tolerance?</button>
                    </div>
                </div>
            </div>
        `;
        sessionStorage.removeItem('rfi_chat_history');
    }
}

// Save/Load chat history for page refreshes
function saveChatHistory() {
    const chatMessages = document.getElementById('chatMessages');
    sessionStorage.setItem('rfi_chat_history', chatMessages.innerHTML);
}

function loadChatHistory() {
    const saved = sessionStorage.getItem('rfi_chat_history');
    if (saved) {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = saved;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Initialize
window.onload = function() {
    loadChatHistory();
};
