export type ResearchStatus = 'started' | 'brainstorming' | 'gathering_intel' | 'synthesizing' | 'completed' | 'failed';

export interface GeneratedFile {
    name: string;
    language: string;
    code: string;
}

export interface ResearchSession {
    status: ResearchStatus;
    details?: string;
    report?: string;
    files?: GeneratedFile[];
    timestamp: string;
    data?: any; // For flexible data like subQueries
}
