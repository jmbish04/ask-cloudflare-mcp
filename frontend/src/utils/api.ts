export const getApiKey = () => localStorage.getItem('mcp_api_key') || import.meta.env.VITE_API_KEY || 'dev-api-key';
export const setApiKey = (key: string) => {
    if (key) {
        localStorage.setItem('mcp_api_key', key);
    } else {
        localStorage.removeItem('mcp_api_key');
    }
};

export const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const key = getApiKey();
    if (key) headers.set('x-api-key', key);

    // Default to JSON content type if body is present and not FormData
    if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(input, { ...init, headers });
};

export const getWebSocketUrl = (path: string = '/ws') => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const key = getApiKey();
    return `${protocol}//${host}${path}?key=${encodeURIComponent(key)}`;
};
