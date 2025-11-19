// core/ollamaClient.js
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);


try {
const res = await fetch(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body),
signal: controller.signal
});


clearTimeout(timeout);


if (!res.ok) {
const errTxt = await res.text();
throw new Error(`Ollama error ${res.status}: ${errTxt}`);
}


// Modo NO streaming -----------------------------------
if (!stream) {
const json = await res.json();
return {
content: json.message?.content || '',
raw: json,
model
};
}


// Modo STREAMING ---------------------------------------
const reader = res.body.getReader();
const decoder = new TextDecoder();
let fullContent = '';


while (true) {
const { done, value } = await reader.read();
if (done) break;


const chunk = decoder.decode(value, { stream: true });
const lines = chunk.split('\n').filter(l => l.trim());


for (const line of lines) {
try {
const json = JSON.parse(line);
const content = json.message?.content || '';
if (content) {
fullContent += content;
if (socketId) socketService.emitToSocket(socketId, 'chat_stream', { chunk: content, done: json.done || false });
}
} catch {
fullContent += line;
if (socketId) socketService.emitToSocket(socketId, 'chat_stream', { chunk: line, done: false });
}
}
}


return { content: fullContent, raw: null, model };
}
finally {
currentCalls = Math.max(0, currentCalls - 1);
} 