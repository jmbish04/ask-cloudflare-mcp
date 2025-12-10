import { ResearchStatus } from "../types";

interface WorkflowVisualizerProps {
    status: ResearchStatus;
}

const steps: { key: ResearchStatus; label: string; icon: string }[] = [
    { key: 'started', label: 'Initialized', icon: '🚀' },
    { key: 'brainstorming', label: 'Brainstorming', icon: '🧠' },
    { key: 'gathering_intel', label: 'Gathering Intel', icon: '🔎' },
    { key: 'synthesizing', label: 'Synthesizing', icon: '🏗️' },
    { key: 'completed', label: 'Completed', icon: '✅' },
];

export const WorkflowVisualizer = ({ status }: WorkflowVisualizerProps) => {
    // Determine active index
    const activeIndex = steps.findIndex(s => s.key === status);

    // Fallback if status is 'failed' or unknown
    const displayIndex = status === 'failed' ? -1 : activeIndex;

    return (
        <div className="py-4">
            <div className="flex justify-between items-center relative">
                {/* Connecting Line */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 dark:bg-zinc-800 -z-10 transform -translate-y-1/2"></div>
                <div
                    className="absolute top-1/2 left-0 h-1 bg-blue-500 -z-10 transform -translate-y-1/2 transition-all duration-500"
                    style={{ width: `${(displayIndex / (steps.length - 1)) * 100}%` }}
                ></div>

                {steps.map((step, index) => {
                    const isActive = index === displayIndex;
                    const isCompleted = index < displayIndex;

                    return (
                        <div key={step.key} className="flex flex-col items-center gap-2">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 z-10 transition-all duration-300
                                    ${isActive ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/50 scale-110' : ''}
                                    ${isCompleted ? 'bg-green-500 border-green-500 text-white' : ''}
                                    ${!isActive && !isCompleted ? 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-300' : ''}
                                `}
                            >
                                {isCompleted ? '✓' : step.icon}
                            </div>
                            <span
                                className={`text-xs font-semibold whitespace-nowrap
                                    ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}
                                `}
                            >
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
